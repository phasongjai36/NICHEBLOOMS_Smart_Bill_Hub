import { useEffect, useMemo, useState } from 'react';
import { Loader2, CheckCircle2, X } from 'lucide-react';
import { api, NewPaymentInput, PayMethod } from '../lib/api';
import { baht, thDate, METHOD_LABEL, METHOD_ICON } from '../lib/utils';
import { cn } from '../lib/utils';

export interface PayRequest {
  contractId: string;
  customerName: string;
  item: string;
  period: number;
  amount: number;       // ยอดงวด
  overdueDays: number;
  dueDate: string;
}

const METHODS: PayMethod[] = ['cash', 'transfer', 'promptpay', 'other'];

export default function RecordPaymentModal({ request, onClose, onDone }: {
  request: PayRequest;
  onClose: () => void;
  onDone: () => void;
}) {
  const defaultLate = request.overdueDays > 0 ? request.overdueDays * 50 : 0; // will be corrected below
  const [lateFee, setLateFee] = useState<number>(defaultLate);
  const [amount, setAmount] = useState<number>(request.amount + defaultLate);
  const [method, setMethod] = useState<PayMethod>('cash');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ receiptNo: string } | null>(null);
  const [settings, setSettings] = useState<{ lateFeePerDay: number; collectionFee: number } | null>(null);

  useMemo(() => {
    // one-shot: pull settings to auto-compute late fee
    api.settings().then((s) => {
      setSettings({ lateFeePerDay: s.lateFeePerDay, collectionFee: s.collectionFee });
      const fee = request.overdueDays > 0 ? request.overdueDays * s.lateFeePerDay : 0;
      setLateFee(fee);
      setAmount(request.amount + fee);
    }).catch(() => { /* defaults stay */ });
  }, [request]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const input: NewPaymentInput = {
        contractId: request.contractId,
        installmentNo: request.period,
        amount, lateFee, method, note,
      };
      const p = await api.recordPayment(input);
      setDone({ receiptNo: p.receiptNo });
      setTimeout(() => onDone(), 1200);
    } catch (e: any) {
      setError(e?.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="รับเงินค่างวด">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-ink-600 bg-ink-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-700">
          <h3 className="font-semibold text-sm">รับเงินค่างวด</h3>
          <button onClick={onClose} aria-label="ปิด" className="p-1.5 rounded-lg hover:bg-white/5 text-cream-50/50"><X className="w-4 h-4" /></button>
        </div>

        {done ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-ok-400 mx-auto" />
            <p className="mt-3 font-semibold">บันทึกการชำระแล้ว</p>
            <p className="text-xs text-cream-50/50 mt-1 font-mono">{done.receiptNo}</p>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="rounded-xl bg-ink-700/50 border border-ink-600 px-4 py-3">
              <div className="text-sm font-medium">{request.customerName} <span className="text-cream-50/45 font-normal">· {request.item}</span></div>
              <div className="text-[11px] text-cream-50/45 tnum mt-0.5">
                งวดที่ {request.period} · ครบกำหนด {thDate(request.dueDate)}
                {request.overdueDays > 0 && <span className="text-danger-400"> · เกิน {request.overdueDays} วัน</span>}
              </div>
            </div>

            <label className="block">
              <span className="text-xs text-cream-50/55">ยอดรับทั้งหมด (งวด + ค่าปรับ)</span>
              <input
                type="number" min={0} value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="mt-1 w-full px-3 py-2.5 rounded-xl bg-ink-900 border border-ink-600 text-lg font-bold tnum focus:outline-none focus:border-gold-400/60"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-cream-50/55">ค่าปรับล่าช้า</span>
                <input
                  type="number" min={0} value={lateFee}
                  onChange={(e) => {
                    const fee = Number(e.target.value) || 0;
                    const base = amount - lateFee;
                    setLateFee(fee);
                    setAmount(base + fee);
                  }}
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-ink-900 border border-ink-600 text-sm tnum focus:outline-none focus:border-gold-400/60"
                />
              </label>
              <div>
                <span className="text-xs text-cream-50/55">ยอดงวดเดิม</span>
                <div className="mt-1 px-3 py-2 rounded-xl bg-ink-900/60 border border-ink-700 text-sm tnum text-cream-50/70">{baht(request.amount)}</div>
              </div>
            </div>

            <div>
              <span className="text-xs text-cream-50/55" id="pay-method-label">วิธีชำระ</span>
              <div className="mt-1.5 grid grid-cols-4 gap-2" role="group" aria-labelledby="pay-method-label">
                {METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    aria-pressed={method === m}
                    className={cn(
                      'py-2 rounded-xl text-xs border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
                      method === m ? 'border-gold-400/60 bg-gold-400/10 text-gold-300 font-semibold' : 'border-ink-600 text-cream-50/55 hover:bg-white/5'
                    )}
                  >
                    <span className="mr-1" aria-hidden="true">{METHOD_ICON[m]}</span>{METHOD_LABEL[m]}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="text-xs text-cream-50/55">โน้ต (ถ้ามี)</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น จ่ายผ่านลูกสาว"
                className="mt-1 w-full px-3 py-2 rounded-xl bg-ink-900 border border-ink-600 text-sm focus:outline-none focus:border-gold-400/60" />
            </label>

            {error && <p className="text-xs text-danger-400">{error}</p>}

            <button
              onClick={submit}
              disabled={busy || !(amount > 0)}
              className="w-full py-3 rounded-xl bg-gold-400 text-ink-900 font-semibold text-sm hover:bg-gold-300 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              บันทึกการรับเงิน {baht(amount)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
