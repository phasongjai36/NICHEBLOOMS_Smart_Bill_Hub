import { useEffect, useMemo, useState } from 'react';
import { Banknote, FileText, CalendarDays, Loader2 } from 'lucide-react';
import { api, CollectRow, CustomerWithSummary } from '../lib/api';
import { baht, thDate } from '../lib/utils';
import { cn } from '../lib/utils';
import RecordPaymentModal from '../components/RecordPaymentModal';
import BillModal from '../components/BillModal';

const DAY_LABEL: Record<number, string> = { 1: 'วันที่ 1', 20: 'วันที่ 20', 25: 'วันที่ 25' };

export default function CollectPage() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<{ month: string; rows: CollectRow[] } | null>(null);
  const [customers, setCustomers] = useState<CustomerWithSummary[]>([]);
  const [payFor, setPayFor] = useState<CollectRow | null>(null);
  const [billFor, setBillFor] = useState<CollectRow | null>(null);
  const [groupBill, setGroupBill] = useState<{ customerId: string; name: string } | null>(null);

  const load = () => {
    api.collect(month).then(setData).catch(() => setData({ month, rows: [] }));
    api.customers().then(setCustomers).catch(() => setCustomers([]));
  };
  useEffect(load, [month]);

  const months = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = -1; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      out.push({ value, label: d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }) });
    }
    return out;
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<number, CollectRow[]>();
    for (const r of data?.rows || []) {
      if (!map.has(r.dueDay)) map.set(r.dueDay, []);
      map.get(r.dueDay)!.push(r);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [data]);

  const grandTotal = (data?.rows || []).reduce((s, r) => s + r.totalDue, 0);

  // บิลรวมรายคน: เฉพาะลูกค้าที่มีงวดครบกำหนดแล้ว (dueDate ≤ วันนี้) ตั้งแต่ 2 งวดขึ้นไป
  // dueCount มาจาก server ซึ่งนับเฉพาะงวดที่ถึงกำหนดชำระ — งวดอนาคตไม่ถูกนับ ห้ามเก็บล่วงหน้า
  const billableCustomers = customers
    .filter((c) => c.dueCount > 1)
    .sort((a, b) => b.dueCount - a.dueCount);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <CalendarDays className="w-4 h-4 text-gold-400" />
          <span className="text-cream-50/60">งวดเดือน</span>
        </div>
        <select value={month} onChange={(e) => setMonth(e.target.value)}
          className="px-3 py-2.5 rounded-xl bg-ink-800 border border-ink-600 text-sm focus:outline-none focus:border-gold-400/50">
          {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <div className="ml-auto text-sm text-cream-50/60">
          รวม <span className="font-bold text-gold-300 tnum">{baht(grandTotal)}</span> · {data?.rows.length ?? 0} งวด
        </div>
      </div>

      {/* บิลรวมรายคน — เฉพาะงวดครบกำหนดชำระแล้ว (ห้ามเก็บล่วงหน้างวดอนาคต) */}
      {billableCustomers.length > 0 && (
        <section className="rounded-2xl border border-gold-400/25 bg-gold-400/[0.06] px-4 py-3">
          <div className="text-[11px] text-cream-50/50 mb-2">บิลรวมรายคน — ทุกรายการครบกำหนดชำระแล้วของลูกค้าแต่ละคน ในใบเสร็จเดียว</div>
          <div className="flex flex-wrap gap-2">
            {billableCustomers.map((c) => (
              <button key={c.id} onClick={() => setGroupBill({ customerId: c.id, name: c.name })}
                title={`รวมงวดครบกำหนดแล้ว ${c.dueCount} งวดของ ${c.name} เป็นใบเสร็จเดียว (ยอด ${baht(c.dueTotal)})`}
                className="px-3 py-2 rounded-xl bg-gold-400/15 text-gold-300 text-[11px] font-semibold hover:bg-gold-400/25 border border-gold-400/30 flex items-center gap-1.5 transition-colors">
                <FileText className="w-3 h-3" /> {c.name} ({c.dueCount} งวด · {baht(c.dueTotal)})
              </button>
            ))}
          </div>
        </section>
      )}

      {!data ? (
        <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gold-400" /></div>
      ) : data.rows.length === 0 ? (
        <div className="text-center text-sm text-cream-50/40 py-16">ไม่มีงวดครบกำหนดในเดือนนี้ 🌸</div>
      ) : (
        grouped.map(([day, rows]) => {
          const dayTotal = rows.reduce((s, r) => s + r.totalDue, 0);
          return (
            <section key={day} className="rounded-2xl border border-ink-700 bg-ink-800 overflow-hidden">
              <div className="px-4 py-3 bg-ink-700/40 flex items-center justify-between border-b border-ink-700">
                <h3 className="font-semibold text-sm">ครบกำหนด {DAY_LABEL[day] || 'วันที่ ' + day} <span className="text-cream-50/40 font-normal">· {thDate(rows[0].dueDate)}</span></h3>
                <span className="text-sm font-bold text-gold-300 tnum">{baht(dayTotal)}</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-cream-50/45 text-[11px] uppercase tracking-wider text-left">
                    <th className="px-4 py-2 font-medium">ลูกค้า</th>
                    <th className="px-4 py-2 font-medium">รายการ</th>
                    <th className="px-4 py-2 font-medium">งวดที่</th>
                    <th className="px-4 py-2 font-medium text-right">ยอดเรียกเก็บ</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.contractId + '-' + r.period} className="border-t border-ink-700/60">
                      <td className="px-4 py-2.5 font-medium">{r.customerName}</td>
                      <td className="px-4 py-2.5 text-cream-50/70">{r.item}</td>
                      <td className="px-4 py-2.5 tnum text-cream-50/60">{r.period}/{r.totalPeriods}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="font-bold tnum">{baht(r.totalDue)}</span>
                        {r.overdueDays > 0 && <div className="text-[10px] text-danger-400 tnum">เกิน {r.overdueDays} วัน</div>}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1.5 justify-end">
                          <button onClick={() => setPayFor(r)}
                            className="px-2.5 py-1.5 rounded-lg bg-gold-400/15 text-gold-300 text-[11px] font-semibold hover:bg-gold-400/25 flex items-center gap-1">
                            <Banknote className="w-3 h-3" /> รับเงิน
                          </button>
                          <button onClick={() => setBillFor(r)} title="ออกใบเสร็จเฉพาะงวดนี้"
                            className="px-2.5 py-1.5 rounded-lg border border-ink-600 text-[11px] hover:bg-white/5 flex items-center gap-1">
                            <FileText className="w-3 h-3" /> บิล
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })
      )}

      {payFor && (
        <RecordPaymentModal
          request={{ contractId: payFor.contractId, customerName: payFor.customerName, item: payFor.item, period: payFor.period, amount: payFor.amount, overdueDays: payFor.overdueDays, dueDate: payFor.dueDate }}
          onClose={() => setPayFor(null)}
          onDone={() => { setPayFor(null); load(); }}
        />
      )}
      {billFor && (
        <BillModal contractId={billFor.contractId} installmentNos={[billFor.period]} onClose={() => setBillFor(null)} />
      )}
      {groupBill && (
        <BillModal customerId={groupBill.customerId} onClose={() => setGroupBill(null)} />
      )}
    </div>
  );
}
