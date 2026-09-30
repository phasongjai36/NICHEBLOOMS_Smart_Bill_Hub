// ---------- domain types (mirrors server/lib/store.ts shapes) ----------

export type PayMethod = 'cash' | 'transfer' | 'promptpay' | 'other';

export type InstallmentStatus = 'paid' | 'due' | 'upcoming';

/** One monthly installment row of a contract. */
export interface Installment {
  no: number;              // งวดที่ 1..N
  dueDate: string;         // YYYY-MM-DD
  amount: number;          // ยอดงวด (บาท)
  status: InstallmentStatus;
  paidAt?: string | null;  // ISO datetime เมื่อจ่ายแล้ว
  paymentId?: string | null;
}

export interface Contract {
  id: string;
  customerId: string;
  item: string;            // รายการสินค้า
  monthlyAmount: number;   // ค่างวด/เดือน
  totalPeriods: number;    // จำนวนงวดทั้งหมด
  dueDay: number;          // วันครบกำหนดของเดือน (1/20/25)
  downPayment: number;     // เงินดาวน์ (0 ถ้าไม่มี)
  startDate: string;       // YYYY-MM-DD งวดแรก
  note?: string;
  closedAt?: string | null; // ปิดสัญญาแล้วเมื่อไร
  createdAt: string;
  installments: Installment[];
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  messenger?: string;      // ลิงก์ m.me/... (ถ้ามี)
  note?: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  contractId: string;
  customerId: string;
  installmentNo: number;
  amount: number;          // ยอดที่รับจริง
  lateFee: number;         // ค่าปรับที่เก็บวันนั้น
  method: PayMethod;
  receiptNo: string;
  paidAt: string;          // ISO
  note?: string;
}

export interface Settings {
  promptpayId: string;
  promptpayName: string;
  lateFeePerDay: number;
  collectionFee: number;
}

export interface Db {
  customers: Customer[];
  contracts: Contract[];
  payments: Payment[];
  settings: Settings;
}

// ---------- api helpers ----------

export interface BillItem {
  contractId: string;
  item: string;
  period: number;
  totalPeriods: number;
  monthly: number;
  overdueDays: number;
  lateFee: number;
  collectionFee: number;
  totalDue: number;
}

export interface Bill {
  receiptNo: string;
  customer: { id: string; name: string; phone?: string };
  items: BillItem[];
  total: number;
  promptPayId: string;
  promptPayDisplay: string;
  payeeName: string;
  qrPayload: string | null;
  qrError: string | null;
  issueDate: string;
}
