// Rebuild data/seed-data.json from the owner's exported CSVs (Oct 2026 onward).
// งวดปัจจุบัน = เดือน ต.ค. 2026 — periods before it are paid, this one is due,
// later ones upcoming. งวดสุดท้าย (ปิดยอด) keeps its contract open until paid.
import fs from 'fs';
import path from 'path';

const YEAR = 2026, MONTH = 10; // current collection month: Oct 2026
const FILES = [
  { file: 'ตารางสรุปยอดเรียกเก็บงวดปัจจุบัน - จ่ายวันที่ 1.csv', day: 1 },
  { file: 'ตารางสรุปยอดเรียกเก็บงวดปัจจุบัน - จ่ายวันที่ 20.csv', day: 20 },
  { file: 'ตารางสรุปยอดเรียกเก็บงวดปัจจุบัน - จ่ายวันที่ 25.csv', day: 25 },
];

function iso(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(d, new Date(y, m, 0).getDate())).padStart(2, '0')}`;
}

function dueDate(monthOffset: number, day: number): string {
  const m = MONTH - 1 + monthOffset;
  const y = YEAR + Math.floor(m / 12);
  return iso(y, (m % 12) + 1, day);
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function cleanName(raw: string): string {
  // CSV sometimes has duplicated combining marks (คุุณ = ค + ุ + ุ + ณ)
  return raw
    .replace(/([\u0E31\u0E34-\u0E3A\u0E47-\u0E4E])\1+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

type Row = { name: string; item: string; current: number; total: number; amount: number; last: boolean };

const customers = new Map<string, { id: string; name: string }>();
const contracts: any[] = [];
const payments: any[] = [];
let paySeq = 0;
let contractSeq = 0;

for (const { file, day } of FILES) {
  const text = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  for (const line of lines) {
    const cols = parseCsvLine(line);
    if (cols[0] === 'ชื่อลูกค้า' || cols[0].startsWith('ตารางสรุป') || cols[0].startsWith('ข้อมูล') || !cols[0] || cols[0].startsWith('รวม')) continue;
    const name = cleanName(cols[0]);
    const item = cols[1].trim();
    const current = Number((cols[2].match(/\d+/) || ['0'])[0]);
    const total = Number((cols[3].match(/\d+/) || ['0'])[0]);
    const amount = Number(cols[4].replace(/[",]/g, ''));
    const last = cols[5].includes('ปิดยอด');
    if (!name || !current || !total || !(amount >= 0)) continue;

    if (!customers.has(name)) {
      customers.set(name, { id: `cus-${customers.size + 1}-${name.slice(0, 6)}`, name });
    }
    const cus = customers.get(name)!;
    contractSeq++;
    const contractId = `ct-${contractSeq}-d${day}-${cus.id.replace('cus-', '')}`;
    const startOffset = -(current - 1);
    const installments: any[] = [];
    for (let no = 1; no <= total; no++) {
      const off = startOffset + (no - 1);
      const d = dueDate(off, day);
      if (no < current) {
        const pid = `pay-${++paySeq}`;
        payments.push({
          id: pid, contractId, customerId: cus.id, installmentNo: no,
          amount, lateFee: 0, method: 'cash',
          receiptNo: `RCP-${d.replace(/-/g, '')}-${String(paySeq).padStart(3, '0')}`,
          paidAt: `${d}T10:00:00.000Z`, note: '',
        });
        installments.push({ no, dueDate: d, amount, status: 'paid', paidAt: `${d}T10:00:00.000Z`, paymentId: pid });
      } else {
        installments.push({ no, dueDate: d, amount, status: 'due', paidAt: null, paymentId: null });
      }
    }
    contracts.push({
      id: contractId, customerId: cus.id, item, monthlyAmount: amount,
      totalPeriods: total, dueDay: day, downPayment: 0,
      startDate: dueDate(startOffset, day),
      closedAt: null, createdAt: `${YEAR}-${String(MONTH).padStart(2, '0')}-30T00:00:00.000Z`,
      note: last ? 'งวดสุดท้าย — จ่ายงวดนี้แล้วปิดสัญญา' : '',
      installments,
    });
  }
}

const out = {
  customers: [...customers.values()].map((c) => ({
    id: c.id, name: c.name, phone: '', messenger: '', note: '',
    createdAt: `${YEAR}-${String(MONTH).padStart(2, '0')}-30T00:00:00.000Z`,
  })),
  contracts,
  payments,
  settings: {
    promptpayId: '0826822551',
    promptpayName: 'ณัฏฐนิชา ปุณประวัติ',
    lateFeePerDay: 50,
    collectionFee: 100,
  },
};

fs.writeFileSync(path.join(process.cwd(), 'data', 'seed-data.json'), JSON.stringify(out, null, 1), 'utf8');
const octDue = contracts.reduce((n, c) => n + c.installments.filter((i: any) => i.status === 'due' && i.dueDate.startsWith('2026-10')).length, 0);
console.log(`seed rebuilt: ${customers.size} customers, ${contracts.length} contracts, ${octDue} installments due Oct 2026, ${payments.length} historic payments`);
