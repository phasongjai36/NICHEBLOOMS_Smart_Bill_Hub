import { useState } from 'react';
import { Loader2, CalendarDays } from 'lucide-react';
import { api, NewContractInput } from '../lib/api';
import { baht, thDate } from '../lib/utils';
import { cn } from '../lib/utils';

const DUE_DAY_PRESETS = [1, 20, 25];

export default function NewContractModal({ customerId, onClose, onDone }: {
  customerId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [item, setItem] = useState('');
  const [monthly, setMonthly] = useState<number>(0);
  const [periods, setPeriods] = useState<number>(12);
  const [dueDay, setDueDay] = useState<number>(1);
  const [down, setDown] = useState<number>(0);
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // preview first row of the schedule
  const preview = (() => {
    if (!startDate || !(periods >= 1)) return null;
    const d = new Date(startDate + 'T00:00:00');
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const day = Math.min(dueDay, lastDay);
    const first = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const last = new Date(d.getFullYear(), d.getMonth() + (periods - 1), day);
    const lastIso = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(Math.min(dueDay, new Date(last.getFullYear(), last.getMonth() + 1, 0).getDate())).padStart(2, '0')}`;
    return { first, last: lastIso, total: monthly * periods + Number(down) };
  })();

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const input: NewContractInput = {
        customerId, item, monthlyAmount: monthly, totalPeriods: periods,
        dueDay, downPayment: down, startDate,
      };
      await api.addContract(input);
      onDone();
    } catch (e: any) {
      setError(e?.message || 'สร้างสัญญาไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-ink-600 bg-ink-800 shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto scrollbar-thin">
        <div className="px-5 py-4 border-b border-ink-700">
          <h3 className="font-semibold text-sm">สร้างสัญญาผ่อนใหม่</h3>
          <p className="text-[11px] text-cream-50/45 mt-0.5">ระบบสร้างตารางงวดอัตโนมัติทุกงวด</p>
        </div>
        <div className="p-5 space-y-3.5">
          <L label="รายการสินค้า *">
            <input value={item} onChange={(e) => setItem(e.target.value)} placeholder="เช่น Ipad gen 9"
              className={inputCls} />
          </L>
          <div className="grid grid-cols-2 gap-3">
            <L label="ค่างวด/เดือน (บาท) *">
              <input type="number" min={0} value={monthly || ''} onChange={(e) => setMonthly(Number(e.target.value))} placeholder="1000" className={inputCls} />
            </L>
            <L label="จำนวนงวด *">
              <input type="number" min={1} max={60} value={periods || ''} onChange={(e) => setPeriods(Number(e.target.value))} className={inputCls} />
            </L>
          </div>
          <L label="วันครบกำหนดของทุกเดือน *">
            <div className="flex gap-2">
              {DUE_DAY_PRESETS.map((d) => (
                <button key={d} onClick={() => setDueDay(d)}
                  className={cn('flex-1 py-2.5 rounded-xl text-sm border tnum', dueDay === d ? 'border-gold-400/60 bg-gold-400/10 text-gold-300 font-semibold' : 'border-ink-600 text-cream-50/55 hover:bg-white/5')}>
                  วันที่ {d}
                </button>
              ))}
              <input type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(Number(e.target.value))}
                className="w-20 px-3 py-2.5 rounded-xl bg-ink-900 border border-ink-600 text-sm tnum text-center" title="วันอื่น ๆ" />
            </div>
          </L>
          <div className="grid grid-cols-2 gap-3">
            <L label="เงินดาวน์ (ถ้ามี)">
              <input type="number" min={0} value={down || ''} onChange={(e) => setDown(Number(e.target.value))} placeholder="0" className={inputCls} />
            </L>
            <L label="งวดแรกเริ่มเดือน">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
            </L>
          </div>

          {preview && monthly > 0 && (
            <div className="rounded-xl border border-gold-400/25 bg-gold-400/[0.07] px-4 py-3 text-[12px] space-y-1">
              <div className="flex items-center gap-1.5 text-gold-300 font-semibold"><CalendarDays className="w-3.5 h-3.5" /> ตารางงวดที่จะสร้าง</div>
              <div className="text-cream-50/60 tnum">งวด 1: {thDate(preview.first)} → งวด {periods}: {thDate(preview.last)}</div>
              <div className="text-cream-50/60 tnum">รวมทั้งสัญญา {periods} × {baht(monthly)}{down > 0 ? ` + ดาวน์ ${baht(down)}` : ''} = <span className="text-gold-300 font-bold">{baht(preview.total)}</span></div>
            </div>
          )}

          {error && <p className="text-xs text-danger-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-ink-600 text-sm hover:bg-white/5">ยกเลิก</button>
            <button onClick={save} disabled={busy || !item.trim() || !(monthly > 0) || !(periods >= 1)}
              className="flex-1 py-2.5 rounded-xl bg-gold-400 text-ink-900 text-sm font-semibold hover:bg-gold-300 disabled:opacity-40 flex items-center justify-center gap-2">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}สร้างสัญญา
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'mt-1 w-full px-3 py-2.5 rounded-xl bg-ink-900 border border-ink-600 text-sm focus:outline-none focus:border-gold-400/60';

function L({ label, children }: any) {
  return <label className="block"><span className="text-xs text-cream-50/55">{label}</span>{children}</label>;
}
