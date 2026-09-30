// PromptPay QR payload — EMVCo Merchant Presented Mode per the BOT PromptPay standard.
// Reference implementation: dtinth/promptpay-qr (the library Thai banking apps accept).
// Targets accepted: mobile 10 digits, citizen ID 13, e-Wallet 15.
export function classifyPromptPayId(id: string): 'mobile' | 'citizen' | 'wallet' | null {
  const digits = String(id || '').replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('0')) return 'mobile';
  if (digits.length === 13) return 'citizen';
  if (digits.length === 15) return 'wallet';
  return null;
}

export function describePromptPayProblem(id: string): string {
  const digits = String(id || '').replace(/\D/g, '');
  return `เลขพร้อมเพย์ "${id}" ใช้ไม่ได้ (${digits.length} หลัก) — ต้องเป็นเบอร์มือถือ 10 / บัตรประชาชน 13 / e-Wallet 15 หลัก`;
}

export function formatPromptPayDisplay(id: string): string {
  const d = String(id || '').replace(/\D/g, '');
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return id;
}

function f(id: string, value: string): string {
  return id + String(value.length).padStart(2, '0') + value;
}

function serialize(xs: (string | false | undefined | null)[]): string {
  return xs.filter((x): x is string => !!x).join('');
}

// CRC16-CCITT (XMODEM), init 0xFFFF, poly 0x1021 — same as crc.crc16xmodem(v, 0xffff)
function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// PromptPay Merchant Account Information AID — required so bank apps recognize the QR
const AID_PROMPTPAY = 'A000000677010111';

/** BOT target format: phone → 0066 + number without leading 0, zero-padded to 13 digits. */
function formatTarget(id: string): string {
  const numbers = String(id).replace(/\D/g, '');
  if (numbers.length >= 13) return numbers;
  return ('0000000000000' + numbers.replace(/^0/, '66')).slice(-13);
}

export function generatePromptPayPayload(promptPayId: string, amount: number): string {
  const target = classifyPromptPayId(promptPayId);
  if (!target) throw new Error(describePromptPayProblem(promptPayId));

  // sub-tag inside tag 29: 01 = phone, 02 = citizen/tax ID, 03 = e-Wallet
  const targetType = target === 'wallet' ? '03' : target === 'citizen' ? '02' : '01';
  const merchantInfo = serialize([
    f('00', AID_PROMPTPAY),
    f(targetType, formatTarget(promptPayId)),
  ]);

  const data = serialize([
    f('00', '01'),                       // payload format: EMV QRCPS merchant presented
    f('01', amount > 0 ? '12' : '11'),   // point of initiation: 12 = dynamic (amount set), 11 = static
    f('29', merchantInfo),               // merchant account info — PromptPay AID + target
    f('58', 'TH'),                       // country
    f('53', '764'),                      // currency THB
    amount > 0 ? f('54', amount.toFixed(2)) : '',
  ]);
  const dataToCrc = data + '6304';
  return data + '6304' + crc16(dataToCrc);
}
