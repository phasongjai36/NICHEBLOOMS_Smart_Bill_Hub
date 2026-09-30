import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import QRCode from 'qrcode';

import {
  loadDb, saveDb, ensureSeed, cryptoId, backupTo, restoreFrom, buildSchedule,
} from './server/lib/store';
import {
  ensureBootstrapUser, verifyPassword, createSession, verifySession, signOut, changePassword,
} from './server/lib/auth';
import { buildBill, billMessageText, computeCharges, overdueDays, todayIso } from './server/lib/billing';
import { Db, Customer, Contract, Payment, PayMethod, Installment } from './src/types';

dotenv.config(); // local .env next to this folder (if any)
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') }); // workspace root .env

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  ensureSeed();
  ensureBootstrapUser();

  const app = express();
  app.use(express.json({ limit: '8mb' }));

  // ------------------------------ auth gate ------------------------------
  app.use('/api', (req, res, next) => {
    if (req.path === '/auth/signin') return next();
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!verifySession(token)) {
      return res.status(401).json({ error: 'ยังไม่เข้าสู่ระบบ หรือเซสชันหมดอายุ' });
    }
    next();
  });

  // -------------------------------- auth --------------------------------
  app.post('/api/auth/signin', (req, res) => {
    const { password } = req.body || {};
    if (!verifyPassword(String(password || ''))) {
      return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
    }
    const session = createSession();
    res.json({ token: session.token, expiresAt: session.expiresAt });
  });

  app.post('/api/auth/signout', (req, res) => {
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) signOut(header.slice(7));
    res.json({ ok: true });
  });

  app.post('/api/auth/change-password', (req, res) => {
    const { current, next } = req.body || {};
    const r = changePassword(String(current || ''), String(next || ''));
    res.status(r.ok ? 200 : 400).json(r.ok ? { ok: true } : { error: r.error });
  });

  // ------------------------------ dashboard ------------------------------
  app.get('/api/overview', (req, res) => {
    const db = loadDb();
    const today = todayIso();
    const thisMonth = today.slice(0, 7);

    type Queue = { contract: Contract; installment: Installment; overdueDays: number; totalDue: number; customerName: string };
    const overdue: Queue[] = [];
    const upcoming: Queue[] = [];

    for (const c of db.contracts) {
      if (c.closedAt) continue;
      const customer = db.customers.find((x) => x.id === c.customerId);
      for (const inst of c.installments) {
        if (inst.status === 'paid') continue;
        const ch = computeCharges(inst, db.settings);
        const entry: Queue = {
          contract: c, installment: inst, overdueDays: overdueDays(inst),
          totalDue: ch.totalDue, customerName: customer?.name || '?',
        };
        if (inst.dueDate < today) overdue.push(entry);
        else if (inst.dueDate <= addDays(today, 7)) upcoming.push(entry);
      }
    }
    overdue.sort((a, b) => b.overdueDays - a.overdueDays);
    upcoming.sort((a, b) => a.installment.dueDate.localeCompare(b.installment.dueDate));

    const collectedThisMonth = db.payments
      .filter((p) => p.paidAt.slice(0, 7) === thisMonth)
      .reduce((sum, p) => sum + p.amount + p.lateFee, 0);
    const overdueTotal = overdue.reduce((sum, q) => sum + q.totalDue, 0);

    // 6-month collection trend
    const trend: { month: string; amount: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      trend.push({
        month: d.toLocaleDateString('th-TH', { month: 'short' }),
        amount: db.payments.filter((p) => p.paidAt.slice(0, 7) === key).reduce((sum, p) => sum + p.amount + p.lateFee, 0),
      });
    }

    res.json({
      today,
      stats: {
        collectedThisMonth,
        overdueTotal,
        overdueCount: overdue.length,
        upcomingCount: upcoming.length,
        activeCustomers: new Set(db.contracts.filter((c) => !c.closedAt).map((c) => c.customerId)).size,
        activeContracts: db.contracts.filter((c) => !c.closedAt).length,
      },
      overdue: overdue.slice(0, 20).map(queueToRow),
      upcoming: upcoming.slice(0, 20).map(queueToRow),
      trend,
    });

    function queueToRow(q: Queue) {
      return {
        contractId: q.contract.id,
        customerId: q.contract.customerId,
        customerName: q.customerName,
        item: q.contract.item,
        period: q.installment.no,
        totalPeriods: q.contract.totalPeriods,
        dueDate: q.installment.dueDate,
        amount: q.installment.amount,
        overdueDays: q.overdueDays,
        totalDue: q.totalDue,
      };
    }
  });

  function addDays(iso: string, days: number): string {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  // ------------------------------ collect by period ------------------------------
  // งวดทั้งหมดที่ครบกำหนดในเดือนที่เลือก (ไว้ไล่เก็บทีละงวดแบบตาราง Excel)
  app.get('/api/collect', (req, res) => {
    const db = loadDb();
    const month = String(req.query.month || todayIso().slice(0, 7)); // YYYY-MM
    const rows: any[] = [];
    for (const contract of db.contracts) {
      if (contract.closedAt) continue;
      const customer = db.customers.find((x) => x.id === contract.customerId);
      for (const installment of contract.installments) {
        if (installment.status === 'paid') continue;
        if (installment.dueDate.slice(0, 7) !== month) continue;
        const ch = computeCharges(installment, db.settings);
        rows.push({
          contractId: contract.id,
          customerId: contract.customerId,
          customerName: customer?.name || '?',
          item: contract.item,
          period: installment.no,
          totalPeriods: contract.totalPeriods,
          dueDay: contract.dueDay,
          dueDate: installment.dueDate,
          amount: installment.amount,
          overdueDays: overdueDays(installment),
          totalDue: ch.totalDue,
        });
      }
    }
    rows.sort((a, b) => a.dueDay - b.dueDay || a.customerName.localeCompare(b.customerName) || a.item.localeCompare(b.item));
    res.json({ month, rows });
  });

  // ------------------------------ customers ------------------------------
  app.get('/api/customers', (req, res) => {
    const db = loadDb();
    res.json(db.customers.map((c) => customerWithSummary(db, c)));
  });

  app.post('/api/customers', (req, res) => {
    const db = loadDb();
    const { name, phone, messenger, note } = req.body || {};
    if (!String(name || '').trim()) return res.status(400).json({ error: 'กรอกชื่อลูกค้า' });
    const c: Customer = {
      id: cryptoId(), name: String(name).trim(), phone: phone || '', messenger: messenger || '',
      note: note || '', createdAt: new Date().toISOString(),
    };
    db.customers.push(c);
    saveDb(db);
    res.json(customerWithSummary(db, c));
  });

  app.put('/api/customers/:id', (req, res) => {
    const db = loadDb();
    const c = db.customers.find((x) => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: 'ไม่พบลูกค้า' });
    const { name, phone, messenger, note } = req.body || {};
    if (name !== undefined) c.name = String(name).trim();
    if (phone !== undefined) c.phone = phone;
    if (messenger !== undefined) c.messenger = messenger;
    if (note !== undefined) c.note = note;
    saveDb(db);
    res.json(customerWithSummary(db, c));
  });

  app.delete('/api/customers/:id', (req, res) => {
    const db = loadDb();
    const hasContracts = db.contracts.some((c) => c.customerId === req.params.id && !c.closedAt);
    if (hasContracts) return res.status(400).json({ error: 'ยังมีสัญญาที่ไม่ปิด — ปิดสัญญาก่อนลบลูกค้า' });
    db.customers = db.customers.filter((x) => x.id !== req.params.id);
    saveDb(db);
    res.json({ ok: true });
  });

  app.get('/api/customers/:id', (req, res) => {
    const db = loadDb();
    const c = db.customers.find((x) => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: 'ไม่พบลูกค้า' });
    const contracts = db.contracts.filter((x) => x.customerId === c.id);
    const payments = db.payments.filter((p) => p.customerId === c.id).sort((a, b) => b.paidAt.localeCompare(a.paidAt));
    res.json({ ...customerWithSummary(db, c), contracts, payments });
  });

  function customerWithSummary(db: Db, c: Customer) {
    const contracts = db.contracts.filter((x) => x.customerId === c.id && !x.closedAt);
    const today = todayIso();
    let dueCount = 0, overdueCount = 0, dueTotal = 0;
    for (const ct of contracts) {
      for (const inst of ct.installments) {
        if (inst.status === 'paid') continue;
        // นับเฉพาะงวดที่ถึงกำหนดเรียกเก็บแล้ว (ครบวันแล้ววันนี้) — งวดอนาคตไม่นับ
        if (inst.dueDate > today) continue;
        const ch = computeCharges(inst, db.settings);
        dueCount++;
        dueTotal += ch.totalDue;
        if (overdueDays(inst, today) > 0) overdueCount++;
      }
    }
    return { ...c, dueCount, overdueCount, dueTotal, activeContracts: contracts.length };
  }

  // ------------------------------ contracts ------------------------------
  app.post('/api/contracts', (req, res) => {
    const db = loadDb();
    const { customerId, item, monthlyAmount, totalPeriods, dueDay, downPayment, startDate, note } = req.body || {};
    if (!db.customers.some((c) => c.id === customerId)) return res.status(400).json({ error: 'เลือกลูกค้าก่อน' });
    const monthly = Number(monthlyAmount), periods = Number(totalPeriods), day = Number(dueDay);
    if (!(monthly > 0) || !(periods >= 1 && periods <= 60) || !(day >= 1 && day <= 31)) {
      return res.status(400).json({ error: 'ข้อมูลสัญญาไม่ถูกต้อง (ค่างวด/จำนวนงวด/วันครบกำหนด)' });
    }
    const start = String(startDate || todayIso());
    const contract: Contract = {
      id: cryptoId(), customerId, item: String(item || '').trim() || 'ไม่ระบุ',
      monthlyAmount: monthly, totalPeriods: periods, dueDay: day,
      downPayment: Number(downPayment) || 0, startDate: start, note: note || '',
      closedAt: null, createdAt: new Date().toISOString(),
      installments: buildSchedule(start, day, periods, monthly),
    };
    db.contracts.push(contract);
    saveDb(db);
    res.json(contract);
  });

  app.put('/api/contracts/:id/close', (req, res) => {
    const db = loadDb();
    const c = db.contracts.find((x) => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: 'ไม่พบสัญญา' });
    c.closedAt = new Date().toISOString();
    saveDb(db);
    res.json({ ok: true });
  });

  app.put('/api/contracts/:id/reopen', (req, res) => {
    const db = loadDb();
    const c = db.contracts.find((x) => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: 'ไม่พบสัญญา' });
    c.closedAt = null;
    saveDb(db);
    res.json({ ok: true });
  });

  app.put('/api/installments/:contractId/:no', (req, res) => {
    // Edit an installment row: dueDate / amount
    const db = loadDb();
    const c = db.contracts.find((x) => x.id === req.params.contractId);
    if (!c) return res.status(404).json({ error: 'ไม่พบสัญญา' });
    const inst = c.installments.find((i) => i.no === Number(req.params.no));
    if (!inst) return res.status(404).json({ error: 'ไม่พบงวด' });
    if (inst.status === 'paid') return res.status(400).json({ error: 'งวดนี้ชำระแล้ว — ลบรายการชำระก่อนแก้' });
    const { dueDate, amount } = req.body || {};
    if (dueDate !== undefined) inst.dueDate = String(dueDate);
    if (amount !== undefined) inst.amount = Number(amount);
    saveDb(db);
    res.json(inst);
  });

  // ------------------------------ payments -------------------------------
  app.post('/api/payments', (req, res) => {
    const db = loadDb();
    const { contractId, installmentNo, amount, lateFee, method, note } = req.body || {};
    const c = db.contracts.find((x) => x.id === contractId);
    if (!c) return res.status(404).json({ error: 'ไม่พบสัญญา' });
    const inst = c.installments.find((i) => i.no === Number(installmentNo));
    if (!inst) return res.status(404).json({ error: 'ไม่พบงวด' });
    if (inst.status === 'paid') return res.status(400).json({ error: 'งวดนี้ถูกบันทึกชำระแล้ว' });
    const amt = Number(amount), fee = Number(lateFee) || 0;
    if (!(amt > 0)) return res.status(400).json({ error: 'ยอดเงินต้องมากกว่า 0' });
    const m = String(method || 'cash') as PayMethod;
    if (!['cash', 'transfer', 'promptpay', 'other'].includes(m)) return res.status(400).json({ error: 'วิธีชำระไม่ถูกต้อง' });

    const payment: Payment = {
      id: cryptoId(), contractId: c.id, customerId: c.customerId, installmentNo: inst.no,
      amount: amt, lateFee: fee, method: m,
      receiptNo: `RCP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
      paidAt: new Date().toISOString(), note: note || '',
    };
    db.payments.push(payment);
    inst.status = 'paid';
    inst.paidAt = payment.paidAt;
    inst.paymentId = payment.id;
    saveDb(db);
    res.json(payment);
  });

  app.delete('/api/payments/:id', (req, res) => {
    // Undo a payment: installment flips back to 'due'
    const db = loadDb();
    const p = db.payments.find((x) => x.id === req.params.id);
    if (!p) return res.status(404).json({ error: 'ไม่พบรายการชำระ' });
    const c = db.contracts.find((x) => x.id === p.contractId);
    const inst = c?.installments.find((i) => i.no === p.installmentNo);
    if (inst && inst.paymentId === p.id) {
      inst.status = 'due';
      inst.paidAt = null;
      inst.paymentId = null;
    }
    db.payments = db.payments.filter((x) => x.id !== p.id);
    saveDb(db);
    res.json({ ok: true });
  });

  app.get('/api/payments', (req, res) => {
    const db = loadDb();
    const { customerId, month } = req.query as { customerId?: string; month?: string };
    let rows = [...db.payments].sort((a, b) => b.paidAt.localeCompare(a.paidAt));
    if (customerId) rows = rows.filter((p) => p.customerId === customerId);
    if (month) rows = rows.filter((p) => p.paidAt.slice(0, 7) === month);
    res.json(rows.map((p) => ({
      ...p,
      customerName: db.customers.find((c) => c.id === p.customerId)?.name || '?',
      item: db.contracts.find((c) => c.id === p.contractId)?.item || '?',
    })));
  });

  // -------------------------------- bills --------------------------------
  // Preview a bill for selected installment rows (no side effects).
  app.post('/api/bills/preview', (req, res) => {
    const db = loadDb();
    const { contractId, installmentNos } = req.body || {};
    const c = db.contracts.find((x) => x.id === contractId);
    if (!c) return res.status(404).json({ error: 'ไม่พบสัญญา' });
    const customer = db.customers.find((x) => x.id === c.customerId);
    if (!customer) return res.status(404).json({ error: 'ไม่พบลูกค้า' });
    const rows = (Array.isArray(installmentNos) ? installmentNos : [Number(installmentNos)])
      .map((no: number) => c.installments.find((i) => i.no === Number(no)))
      .filter((i): i is Installment => !!i)
      .map((inst: Installment) => ({ contract: c, installment: inst }));
    if (!rows.length) return res.status(400).json({ error: 'เลือกงวดอย่างน้อย 1 งวด' });
    const bill = buildBill(db, { rows, customer });
    res.json({ bill, messageText: billMessageText(bill) });
  });

  // Customer-wide bill: ALL currently-due installments of one customer, single receipt.
  // เฉพาะงวดที่ถึงกำหนดแล้ว (ครบวันหรือเกินกำหนด) — งวดอนาคตไม่ออกบิล ห้ามเก็บล่วงหน้า
  app.post('/api/bills/preview-customer', (req, res) => {
    const db = loadDb();
    const { customerId } = req.body || {};
    const customer = db.customers.find((x) => x.id === customerId);
    if (!customer) return res.status(404).json({ error: 'ไม่พบลูกค้า' });
    const rows: { contract: Contract; installment: Installment }[] = [];
    const today = todayIso();
    for (const contract of db.contracts) {
      if (contract.customerId !== customerId || contract.closedAt) continue;
      for (const installment of contract.installments) {
        // เรียกเก็บเฉพาะงวดที่ถึงกำหนดแล้ว (ครบวันแล้ววันนี้) — งวดอนาคตไม่ออกบิล
        if (installment.status !== 'paid' && installment.dueDate <= today) {
          rows.push({ contract, installment });
        }
      }
    }
    if (!rows.length) return res.status(400).json({ error: 'ลูกค้านี้ไม่มีงวดค้างชำระ' });
    // oldest due first — the bill reads like a statement
    rows.sort((a, b) => a.installment.dueDate.localeCompare(b.installment.dueDate) || a.contract.item.localeCompare(b.contract.item));
    const bill = buildBill(db, { rows, customer });
    res.json({ bill, messageText: billMessageText(bill) });
  });

  // QR image (data URL) for a payload
  app.post('/api/bills/qr', async (req, res) => {
    const { payload } = req.body || {};
    if (!payload) return res.status(400).json({ error: 'payload required' });
    try {
      const url = await QRCode.toDataURL(String(payload), { width: 480, margin: 1, errorCorrectionLevel: 'M' });
      res.json({ dataUrl: url });
    } catch (e: any) {
      res.status(400).json({ error: e?.message || 'QR failed' });
    }
  });

  // ------------------------------ settings -------------------------------
  app.get('/api/settings', (req, res) => {
    res.json(loadDb().settings);
  });

  app.put('/api/settings', (req, res) => {
    const db = loadDb();
    const { promptpayId, promptpayName, lateFeePerDay, collectionFee } = req.body || {};
    if (promptpayId !== undefined) db.settings.promptpayId = String(promptpayId).trim();
    if (promptpayName !== undefined) db.settings.promptpayName = String(promptpayName).trim();
    if (lateFeePerDay !== undefined) db.settings.lateFeePerDay = Number(lateFeePerDay) || 0;
    if (collectionFee !== undefined) db.settings.collectionFee = Number(collectionFee) || 0;
    saveDb(db);
    res.json(db.settings);
  });

  // ------------------------- backup / restore ----------------------------
  app.post('/api/backup', (req, res) => {
    try {
      const file = backupTo(path.join(process.cwd(), 'data', 'manual-backups'));
      res.json({ ok: true, file });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'backup failed' });
    }
  });

  app.post('/api/restore', (req, res) => {
    try {
      const db = restoreFrom(String(req.body?.json || ''));
      res.json({ ok: true, customers: db.customers.length, contracts: db.contracts.length });
    } catch (e: any) {
      res.status(400).json({ error: e?.message || 'restore failed' });
    }
  });

  // -------------------------- static frontend ----------------------------
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, '127.0.0.1', () => {
    console.log(`✅ NicheBlooms Smart Bill (local) — http://localhost:${PORT}`);
    console.log(`   data: ${path.join(process.cwd(), 'data', 'db.json')}`);
  });

  return app;
}

startServer().catch((e) => {
  console.error('server failed:', e);
  process.exit(1);
});
