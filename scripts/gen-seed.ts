// Regenerate data/seed-data.json with correct interpretation:
// "งวดที่ X" (current) = the installment to collect this month.
//   periods 1..X-1 → paid (on their due days), X → due on this September's due day
//   (overridden overdue now), X+1..N → upcoming months.
// Run: tsx scripts/gen-seed.ts
import fs from 'fs';
import path from 'path';

const SEPT = 9, YEAR = 2026;

function iso(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// due day groups
const DAY1 = 1, DAY20 = 20, DAY25 = 25;

interface Spec {
  customerId: string; item: string; monthly: number; total: number;
  current: number; day: number; note?: string;
}

const SPECS: Spec[] = [
  // ---- จ่ายวันที่ 1 ----
  { customerId: 'cus-oum', item: 'Fila', monthly: 311, total: 5, current: 5, day: DAY1 },
  { customerId: 'cus-oum', item: 'Ipad', monthly: 1264, total: 12, current: 2, day: DAY1 },
  { customerId: 'cus-beer', item: 'ทอง', monthly: 1556, total: 12, current: 12, day: DAY1 },
  { customerId: 'cus-beer', item: 'มือถือ iPhone', monthly: 1057, total: 18, current: 10, day: DAY1 },
  { customerId: 'cus-kai', item: 'มือถือ iPhone', monthly: 1304, total: 18, current: 10, day: DAY1 },
  { customerId: 'cus-kai', item: 'Ipad', monthly: 669, total: 18, current: 8, day: DAY1 },
  { customerId: 'cus-lukbol', item: 'ตู้เย็น', monthly: 663, total: 12, current: 3, day: DAY1 },
  { customerId: 'cus-daendee', item: 'น้ำหอม', monthly: 1857, total: 5, current: 2, day: DAY1 },
  { customerId: 'cus-peeliaem', item: 'เลื่อยตัดไม้', monthly: 638, total: 5, current: 1, day: DAY1 },
  { customerId: 'cus-ink', item: 'มือถือ iPhone', monthly: 999, total: 12, current: 1, day: DAY1 },
  // ---- จ่ายวันที่ 20 ----
  { customerId: 'cus-oum', item: 'Fila (ใหม่)', monthly: 216, total: 4, current: 3, day: DAY20 },
  // ---- จ่ายวันที่ 25 ----
  { customerId: 'cus-beer', item: 'เงินกู้ cash', monthly: 4297, total: 9, current: 5, day: DAY25 },
  { customerId: 'cus-beer', item: 'เงินกู้ Cash', monthly: 3119, total: 6, current: 4, day: DAY25 },
  { customerId: 'cus-beer', item: 'Truecash', monthly: 2068, total: 6, current: 2, day: DAY25 },
  { customerId: 'cus-peenat', item: 'เงินกู้ cash', monthly: 2079, total: 12, current: 11, day: DAY25 },
  { customerId: 'cus-kai', item: 'เงินกู้ Cash', monthly: 1419, total: 12, current: 1, day: DAY25 },
];

const CUSTOMERS = [
  { id: 'cus-oum', name: 'คุณอุ้ม' },
  { id: 'cus-beer', name: 'คุณเบียร์' },
  { id: 'cus-kai', name: 'คุณใข่' },
  { id: 'cus-lukbol', name: 'ลูกบอล' },
  { id: 'cus-daendee', name: 'แด๊ดดี้' },
  { id: 'cus-peeliaem', name: 'พี่เหลียม' },
  { id: 'cus-ink', name: 'คุณอิงค์' },
  { id: 'cus-peenat', name: 'พี่ณัฐ' },
];

function dueDate(startMonthOffset: number, day: number): string {
  // month = September + offset
  const m = SEPT - 1 + startMonthOffset; // 0-based
  const y = YEAR + Math.floor(m / 12);
  const mm = (m % 12) + 1;
  const last = new Date(y, mm, 0).getDate();
  return iso(y, mm, Math.min(day, last));
}

const payments: any[] = [];
let paySeq = 0;

const contracts = SPECS.map((s, idx) => {
  const id = `ct-${idx + 1}-${s.customerId.replace('cus-', '')}`;
  const startOffset = -(s.current - 1); // p1 month offset
  const installments = [] as any[];
  for (let no = 1; no <= s.total; no++) {
    const off = startOffset + (no - 1);
    const d = dueDate(off, s.day);
    if (no < s.current) {
      const pid = `pay-${++paySeq}`;
      payments.push({
        id: pid, contractId: id, customerId: s.customerId, installmentNo: no,
        amount: s.monthly, lateFee: 0, method: 'cash',
        receiptNo: `RCP-${d.replace(/-/g, '')}-${String(paySeq).padStart(3, '0')}`,
        paidAt: `${d}T10:00:00.000Z`, note: '',
      });
      installments.push({ no, dueDate: d, amount: s.monthly, status: 'paid', paidAt: `${d}T10:00:00.000Z`, paymentId: pid });
    } else {
      installments.push({ no, dueDate: d, amount: s.monthly, status: 'due', paidAt: null, paymentId: null });
    }
  }
  return {
    id, customerId: s.customerId, item: s.item, monthlyAmount: s.monthly,
    totalPeriods: s.total, dueDay: s.day, downPayment: 0,
    startDate: dueDate(startOffset, s.day),
    closedAt: null, createdAt: `${YEAR}-09-30T00:00:00.000Z`, note: s.note || '',
    installments,
  };
});

const out = {
  customers: CUSTOMERS.map((c) => ({
    id: c.id, name: c.name, phone: '', messenger: '', note: '',
    createdAt: `${YEAR}-09-30T00:00:00.000Z`,
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

const file = path.join(process.cwd(), 'data', 'seed-data.json');
fs.writeFileSync(file, JSON.stringify(out, null, 1), 'utf8');
const overdue = contracts.reduce((n, c) => n + c.installments.filter((i: any) => i.status === 'due' && i.dueDate < '2026-09-30').length, 0);
console.log(`seed written: ${contracts.length} contracts, ${payments.length} historic payments, ${overdue} overdue installments now`);
