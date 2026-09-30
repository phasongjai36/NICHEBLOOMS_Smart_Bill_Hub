// Billing domain logic — overdue/late fees, bill assembly, receipt text.
import crypto from 'crypto';
import { Db, Contract, Bill, BillItem, Settings, Installment } from '../../src/types';
import { classifyPromptPayId, generatePromptPayPayload, describePromptPayProblem, formatPromptPayDisplay } from './promptpay';

const THB = (n: number) =>
  '฿' + Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 });

export function todayIso(): string {
  // local calendar date (not UTC) — the owner works in ICT; UTC flips at 06:00
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isOverdue(row: Installment, today = todayIso()): boolean {
  return row.status !== 'paid' && row.dueDate < today;
}

export function overdueDays(row: Installment, today = todayIso()): number {
  if (!isOverdue(row, today)) return 0;
  // parse both as local midnights so DST/tz can never skew the day count
  const due = new Date(row.dueDate + 'T00:00:00');
  const now = new Date(today + 'T00:00:00');
  const dueMs = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const nowMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.max(0, Math.round((nowMs - dueMs) / 86400000));
}

export function computeCharges(row: Installment, s: Settings, today = todayIso()): { lateFee: number; collectionFee: number; totalDue: number } {
  const od = overdueDays(row, today);
  const lateFee = od > 0 ? od * s.lateFeePerDay : 0;
  const collectionFee = od > 0 ? s.collectionFee : 0;
  return { lateFee, collectionFee, totalDue: row.amount + lateFee + collectionFee };
}

export function generateReceiptNo(): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `NB-${stamp}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

export interface BillRequest {
  rows: { contract: Contract; installment: Installment }[];
  customer: { id: string; name: string; phone?: string };
}

/** Build the full bill (items + totals + PromptPay QR payload) for chosen installment rows. */
export function buildBill(db: Db, req: BillRequest): Bill {
  const s = db.settings;
  const items: BillItem[] = req.rows.map(({ contract, installment }) => {
    const ch = computeCharges(installment, s);
    return {
      contractId: contract.id,
      item: contract.item,
      period: installment.no,
      totalPeriods: contract.totalPeriods,
      monthly: installment.amount,
      overdueDays: overdueDays(installment),
      lateFee: ch.lateFee,
      collectionFee: ch.collectionFee,
      totalDue: ch.totalDue,
    };
  });
  const total = items.reduce((sum, i) => sum + i.totalDue, 0);

  let qrPayload: string | null = null;
  let qrError: string | null = null;
  if (!classifyPromptPayId(s.promptpayId)) {
    qrError = describePromptPayProblem(s.promptpayId);
  } else {
    try {
      qrPayload = generatePromptPayPayload(s.promptpayId, total);
    } catch (e: any) {
      qrError = e?.message || 'สร้าง QR พร้อมเพย์ไม่สำเร็จ';
    }
  }

  return {
    receiptNo: generateReceiptNo(),
    customer: req.customer,
    items,
    total,
    promptPayId: s.promptpayId,
    promptPayDisplay: formatPromptPayDisplay(s.promptpayId),
    payeeName: s.promptpayName,
    qrPayload,
    qrError,
    issueDate: todayIso(),
  };
}

/** Thai bill text the owner can copy straight into a Messenger chat. */
export function billMessageText(bill: Bill): string {
  const lines: string[] = [];
  lines.push('🌿 NICHE BLOOMS — แจ้งยอดค่างวด');
  lines.push(`เลขที่: ${bill.receiptNo}`);
  lines.push(`สำหรับ: คุณ${bill.customer.name}`);
  lines.push('');
  for (const it of bill.items) {
    lines.push(`• ${it.item} (งวดที่ ${it.period}/${it.totalPeriods}) = ${THB(it.monthly)}`);
    if (it.overdueDays > 0) {
      lines.push(`   เกินกำหนด ${it.overdueDays} วัน — ค่าปรับ ${THB(it.lateFee)} + ค่าติดตาม ${THB(it.collectionFee)}`);
    }
  }
  lines.push('');
  lines.push(`ยอดรวมที่ต้องชำระ: ${THB(bill.total)}`);
  lines.push(`พร้อมเพย์: ${bill.payeeName} (${bill.promptPayDisplay})`);
  lines.push('ชำระแล้วส่งสลิปมาแจ้งได้เลยนะคะ 🌸 ขอบคุณค่ะ');
  return lines.join('\n');
}
