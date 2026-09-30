import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, Banknote, TrendingUp, Users, FileText, Loader2 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api, Overview, QueueRow } from '../lib/api';
import { baht, thDate } from '../lib/utils';
import { cn } from '../lib/utils';
import RecordPaymentModal from '../components/RecordPaymentModal';
import BillModal from '../components/BillModal';

export default function OverviewPage({ onNavigate }: { onNavigate: (tab: any) => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<QueueRow | null>(null);
  const [billFor, setBillFor] = useState<QueueRow | null>(null);

  const refresh = () => {
    api.overview().then(setData).catch((e) => setError(e.message));
  };

  useEffect(refresh, []);

  const stats = data?.stats;

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-danger-400/30 bg-danger-400/10 text-danger-400 text-sm px-4 py-3">{error}</div>
      )}

      {/* stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatCard label="เก็บได้เดือนนี้" value={stats ? baht(stats.collectedThisMonth) : '—'} tone="ok" icon={Banknote} />
        <StatCard label="ค้างชำระรวม" value={stats ? baht(stats.overdueTotal) : '—'} tone="bad" icon={AlertTriangle} sub={stats ? `${stats.overdueCount} งวดเกินกำหนด` : ''} />
        <StatCard label="ใกล้ครบกำหนด 7 วัน" value={stats ? String(stats.upcomingCount) : '—'} tone="warn" icon={CalendarClock} sub="งวด" />
        <StatCard label="ลูกค้าที่ยังผ่อน" value={stats ? String(stats.activeCustomers) : '—'} tone="neutral" icon={Users} sub={`${stats?.activeContracts ?? 0} สัญญา`} />
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* trend */}
        <section className="lg:col-span-3 rounded-2xl border border-ink-700 bg-ink-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm tracking-tight">เงินเก็บได้ 6 เดือนล่าสุด</h2>
            <TrendingUp className="w-4 h-4 text-gold-400/70" />
          </div>
          <div className="h-52">
            {data && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#d9b96c" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#d9b96c" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(247,241,228,0.06)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: 'rgba(247,241,228,0.45)', fontSize: 11 }} tickLine={false} axisLine={false} dy={6} />
                  <YAxis tick={{ fill: 'rgba(247,241,228,0.45)', fontSize: 11 }} tickLine={false} axisLine={false} width={54} tickFormatter={(v) => (v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k' : String(v))} />
                  <Tooltip
                    formatter={(v: any) => [baht(Number(v)), 'เก็บได้']}
                    contentStyle={{ background: '#201d15', border: '1px solid #3a3425', borderRadius: 12, fontSize: 12, color: '#faf6ec' }}
                  />
                  <Area type="monotone" dataKey="amount" stroke="#d9b96c" strokeWidth={2.5} fill="url(#gold)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* must-collect queue */}
        <section className="lg:col-span-2 rounded-2xl border border-ink-700 bg-ink-800 p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm tracking-tight">ต้องเก็บตอนนี้</h2>
            <button onClick={() => onNavigate('customers')} className="text-[11px] text-gold-300 hover:text-gold-200">ดูลูกค้าทั้งหมด →</button>
          </div>
          <div className="space-y-2 overflow-y-auto scrollbar-thin flex-1 max-h-[340px] pr-1">
            {data?.overdue.length === 0 && data?.upcoming.length === 0 && (
              <p className="text-xs text-cream-50/40 py-8 text-center">ไม่มีงวดค้าง — สบายใจได้ 🌸</p>
            )}
            {data?.overdue.map((row) => <QueueCard key={`o-${row.contractId}-${row.period}`} row={row} overdue onPay={() => setPayFor(row)} onBill={() => setBillFor(row)} />)}
            {data?.upcoming.map((row) => <QueueCard key={`u-${row.contractId}-${row.period}`} row={row} onPay={() => setPayFor(row)} onBill={() => setBillFor(row)} />)}
          </div>
        </section>
      </div>

      {payFor && (
        <RecordPaymentModal
          request={{ contractId: payFor.contractId, customerName: payFor.customerName, item: payFor.item, period: payFor.period, amount: payFor.amount, overdueDays: payFor.overdueDays, dueDate: payFor.dueDate }}
          onClose={() => setPayFor(null)}
          onDone={() => { setPayFor(null); refresh(); }}
        />
      )}
      {billFor && (
        <BillModal
          contractId={billFor.contractId}
          installmentNos={[billFor.period]}
          onClose={() => setBillFor(null)}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, sub, tone, icon: Icon }: any) {
  const tones: Record<string, string> = {
    ok: 'text-ok-400 border-ok-600/30 bg-ok-600/10',
    bad: 'text-danger-400 border-danger-500/30 bg-danger-500/10',
    warn: 'text-warn-400 border-warn-400/30 bg-warn-400/10',
    neutral: 'text-gold-300 border-gold-400/25 bg-gold-400/10',
  };
  return (
    <div className={cn('rounded-2xl border p-4', tones[tone])}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-cream-50/55">{label}</span>
        <Icon className="w-4 h-4 opacity-70" />
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight tnum">{value}</div>
      {sub && <div className="text-[11px] text-cream-50/40 mt-0.5">{sub}</div>}
    </div>
  );
}

function QueueCard({ row, overdue, onPay, onBill }: { row: QueueRow; overdue?: boolean; onPay: () => void; onBill: () => void }) {
  return (
    <div className={cn(
      'rounded-xl border p-3',
      overdue ? 'border-danger-500/30 bg-danger-500/[0.07]' : 'border-ink-600 bg-ink-700/40'
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{row.customerName} <span className="text-cream-50/40 font-normal">· {row.item}</span></div>
          <div className="text-[11px] text-cream-50/45 tnum">
            งวดที่ {row.period}/{row.totalPeriods} · ครบ {thDate(row.dueDate)}
            {overdue && <span className="text-danger-400 font-semibold"> · เกิน {row.overdueDays} วัน</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={cn('text-sm font-bold tnum', overdue ? 'text-danger-400' : 'text-cream-50')}>{baht(row.totalDue)}</div>
          {row.overdueDays > 0 && <div className="text-[10px] text-cream-50/40 tnum">รวมค่าปรับแล้ว</div>}
        </div>
      </div>
      <div className="flex gap-2 mt-2.5">
        <button onClick={onPay} className="flex-1 py-1.5 rounded-lg bg-gold-400 text-ink-900 text-xs font-semibold hover:bg-gold-300 transition-colors flex items-center justify-center gap-1.5">
          <Banknote className="w-3.5 h-3.5" /> รับเงิน
        </button>
        <button onClick={onBill} className="flex-1 py-1.5 rounded-lg border border-ink-600 text-xs font-medium text-cream-50/70 hover:bg-white/5 transition-colors flex items-center justify-center gap-1.5">
          <FileText className="w-3.5 h-3.5" /> ออกบิล
        </button>
      </div>
    </div>
  );
}
