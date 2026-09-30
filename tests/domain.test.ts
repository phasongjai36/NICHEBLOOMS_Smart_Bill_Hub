// Unit tests run with the borrowed tsx:  tsx tests/domain.test.ts
import { buildSchedule } from '../server/lib/store';
import { generatePromptPayPayload, classifyPromptPayId } from '../server/lib/promptpay';
import { computeCharges, overdueDays, billMessageText } from '../server/lib/billing';
import { Installment, Settings } from '../src/types';

let failed = 0;
function ok(cond: boolean, name: string) {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.error(`  ✗ ${name}`); failed++; }
}

const S: Settings = { promptpayId: '0812345678', promptpayName: 'ทดสอบ', lateFeePerDay: 50, collectionFee: 100 };

console.log('— buildSchedule —');
{
  const rows = buildSchedule('2026-01-20', 20, 3, 500);
  ok(rows.length === 3, 'สร้างครบ 3 งวด');
  ok(rows[0].dueDate === '2026-01-20', 'งวดแรกตรงวัน 20');
  ok(rows[1].dueDate === '2026-02-20', 'งวดสองเดือนถัดไป');
  ok(rows.every((r) => r.amount === 500 && r.status === 'due'), 'ทุกงวดยอดถูก สถานะ due');

  // due day clamping (31 → Feb 28)
  const feb = buildSchedule('2026-01-31', 31, 2, 100);
  ok(feb[1].dueDate === '2026-02-28', 'วันที่ 31 ถูกหน่วงเป็น 28 ก.พ.');
}

console.log('— overdue & charges —');
{
  const inst: Installment = { no: 1, dueDate: '2026-09-20', amount: 300, status: 'due', paidAt: null, paymentId: null };
  ok(overdueDays(inst, '2026-09-25') === 5, 'เกินกำหนด 5 วัน (20→25)');
  ok(overdueDays(inst, '2026-09-30') === 10, 'เกินกำหนด 10 วัน (20→30)');
  const ch = computeCharges(inst, S, '2026-09-25');
  ok(ch.lateFee === 250 && ch.collectionFee === 100 && ch.totalDue === 650, 'ค่าปรับ 5×50 + ติดตาม 100 = รวม 650');
  const notOverdue = computeCharges({ ...inst, dueDate: '2026-10-20' }, S, '2026-09-30');
  ok(notOverdue.lateFee === 0 && notOverdue.totalDue === 300, 'ยังไม่เกินกำหนด = ไม่มีค่าปรับ');
}

console.log('— promptpay —');
{
  ok(classifyPromptPayId('0812345678') === 'mobile', 'เบอร์ 10 หลัก = mobile');
  ok(classifyPromptPayId('13501002885908') === null, 'เลข 14 หลัก = ไม่ผ่าน');
  const payload = generatePromptPayPayload('0812345678', 650);
  ok(payload.startsWith('000201010212'), 'payload เริ่ม EMVCo dynamic');
  ok(payload.includes('29370016A000000677010111'), 'มี tag 29 AID พร้อมเพย์ (จำเป็นสำหรับแอปธนาคาร)');
  ok(payload.includes('5303764'), 'currency THB (764)');
  ok(payload.includes('5406650.00'), 'ยอด 650.00 อยู่ใน payload');
  ok(payload.endsWith('6304D0BC'), 'CRC16 + ปิดท้ายถูกต้อง (ตรง reference)');
}

console.log('— bill text —');
{
  const bill: any = {
    receiptNo: 'NB-20260930-AB12',
    customer: { id: 'c1', name: 'ทดสอบ' },
    items: [{ contractId: 'x', item: 'Ipad', period: 2, totalPeriods: 12, monthly: 1264, overdueDays: 3, lateFee: 150, collectionFee: 100, totalDue: 1514 }],
    total: 1514,
    promptPayId: '0812345678', promptPayDisplay: '082-682-2551', payeeName: 'ณัฏฐนิชา',
    qrPayload: null, qrError: null, issueDate: '2026-09-30',
  };
  const text = billMessageText(bill);
  ok(text.includes('NB-20260930-AB12'), 'ข้อความมีเลขที่ใบเสร็จ');
  ok(text.includes('เกินกำหนด 3 วัน'), 'ข้อความมีจำนวนวันเกิน');
  ok(text.includes('1,514') || text.includes('1514'), 'ข้อความมียอดรวม');
}

if (failed > 0) {
  console.error(`\n✗ FAILED ${failed} tests`);
  process.exit(1);
}
console.log('\n✓ all tests passed');
