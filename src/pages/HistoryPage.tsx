import { useEffect, useMemo, useState } from 'react';
import { Download, RotateCcw, Loader2 } from 'lucide-react';
import { api, PaymentRow } from '../lib/api';
import { baht, thDateTime, METHOD_LABEL, METHOD_ICON } from '../lib/utils';
import { cn } from '../lib/utils';

export default function HistoryPage() {
  const [rows, setRows] = useState<PaymentRow[] | null>(null);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [month, setMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [customerId, setCustomerId] = useState<string>('');

  const load = () => {
    api.payments({ month: month || undefined, customerId: customerId || undefined }).then(setRows).catch(() => setRows([]));
  };
  useEffect(load, [month, customerId]);
  useEffect(() => { api.customers().then((cs) => setCustomers(cs.map((c) => ({ id: c.id, name: c.name })))).catch(() => {}); }, []);

  const total = useMemo(() => (rows || []).reduce((s, r) => s + r.amount + r.lateFee, 0), [rows]);
  const months = useMemo(() => {
    // last 12 months for the filter
    const out: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      out.push({ value, label: d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }) });
    }
    return out;
  }, []);

  const exportCsv = () => {
    const header = 'วันที่,เลขที่ใบเสร็จ,ลูกค้า,รายการ,งวด,ยอดงวด,ค่าปรับ,รวม,วิธีชำระ,โน้ต';
    const lines = (rows || []).map((r) =>
      [
        new Date(r.paidAt).toLocaleString('th-TH'),
        r.receiptNo, r.customerName, r.item, r.installmentNo,
        r.amount, r.lateFee, r.amount + r.lateFee,
        METHOD_LABEL[r.method] || r.method, r.note || '',
      ].map(csvEscape).join(',')
    );
    const blob = '\uFEFF' + header + '\n' + lines.join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([blob], { type: 'text/csv;charset=utf-8' }));
    a.download = `payment-history-${month || 'all'}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select value={month} onChange={(e) => setMonth(e.target.value)}
          className="px-3 py-2.5 rounded-xl bg-ink-800 border border-ink-600 text-sm focus:outline-none focus:border-gold-400/50">
          <option value="">ทุกเดือน</option>
          {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}
          className="px-3 py-2.5 rounded-xl bg-ink-800 border border-ink-600 text-sm focus:outline-none focus:border-gold-400/50">
          <option value="">ลูกค้าทุกคน</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-sm text-cream-50/60">รวม <span className="font-bold text-gold-300 tnum">{baht(total)}</span> · {rows?.length ?? 0} รายการ</div>
          <button onClick={exportCsv} disabled={!rows?.length}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-ink-600 text-sm font-medium hover:bg-white/5 disabled:opacity-40">
            <Download className="w-4 h-4" /> ส่งออก CSV
          </button>
        </div>
      </div>

      {rows === null ? (
        <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gold-400" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center text-sm text-cream-50/40 py-16">ไม่มีรายการชำระในช่วงนี้</div>
      ) : (
        <div className="rounded-2xl border border-ink-700 bg-ink-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ink-700/40 text-cream-50/50 text-left text-[11px] uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">วันที่</th>
                <th className="px-4 py-3 font-medium">ลูกค้า / รายการ</th>
                <th className="px-4 py-3 font-medium">วิธีชำระ</th>
                <th className="px-4 py-3 font-medium text-right">ยอดรวม</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-ink-700/60">
                  <td className="px-4 py-3 tnum text-cream-50/60 text-[12px]">{thDateTime(r.paidAt)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.customerName}</div>
                    <div className="text-[11px] text-cream-50/40">{r.item} · งวด {r.installmentNo} · <span className="font-mono">{r.receiptNo}</span></div>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-cream-50/60">{METHOD_ICON[r.method]} {METHOD_LABEL[r.method]}</td>
                  <td className="px-4 py-3 text-right font-bold tnum">{baht(r.amount + r.lateFee)}
                    {r.lateFee > 0 && <div className="text-[10px] text-warn-400 font-normal tnum">ค่าปรับ {baht(r.lateFee)}</div>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      title="ย้อนการชำระ (งวดกลับไปค้าง)"
                      onClick={async () => {
                        if (confirm(`ย้อนการชำระ ${r.receiptNo}? งวดจะกลับไปเป็นค้างชำระ`)) {
                          await api.deletePayment(r.id);
                          load();
                        }
                      }}
                      className="p-2 rounded-lg text-cream-50/30 hover:text-danger-400 hover:bg-danger-400/10 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function csvEscape(v: any): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
