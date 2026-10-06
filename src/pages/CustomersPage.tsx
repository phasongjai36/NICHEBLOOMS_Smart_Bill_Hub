import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Pencil, Phone, MessageCircle, UserX, ChevronDown, BadgeCheck, Loader2, X, FileText } from 'lucide-react';
import { api, CustomerDetail, CustomerWithSummary } from '../lib/api';
import { baht, thDate, thDateTime } from '../lib/utils';
import { cn } from '../lib/utils';
import NewContractModal from '../components/NewContractModal';
import RecordPaymentModal from '../components/RecordPaymentModal';
import BillModal from '../components/BillModal';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerWithSummary[] | null>(null);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomerWithSummary | 'new' | null>(null);
  const [quickBill, setQuickBill] = useState<string | null>(null); // customerId → บิลรวม

  const refresh = () => api.customers().then(setCustomers).catch(() => setCustomers([]));
  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    const list = customers || [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((c) => c.name.toLowerCase().includes(needle) || (c.phone || '').includes(needle));
  }, [customers, q]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cream-50/35" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาชื่อ หรือเบอร์โทร…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-ink-800 border border-ink-600 text-sm focus:outline-none focus:border-gold-400/50"
          />
        </div>
        <button
          onClick={() => setEditing('new')}
          className="ml-auto flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold-400 text-ink-900 text-sm font-semibold hover:bg-gold-300 transition-colors"
        >
          <Plus className="w-4 h-4" /> เพิ่มลูกค้า
        </button>
      </div>

      {/* cards */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {customers === null && <div className="col-span-full py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gold-400" /></div>}
        {customers !== null && filtered.length === 0 && (
          <div className="col-span-full text-center text-sm text-cream-50/40 py-16">ไม่พบลูกค้า — เพิ่มลูกค้าคนแรกได้เลย</div>
        )}
        {filtered.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelected(c.id)}
            className={cn(
              'text-left rounded-2xl border p-4 transition-colors hover:border-gold-400/40',
              c.overdueCount > 0 ? 'border-danger-500/30 bg-danger-500/[0.06]' : 'border-ink-700 bg-ink-800'
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{c.name}</div>
                <div className="text-[11px] text-cream-50/40 tnum">{c.phone || '—'}</div>
              </div>
              <div className="text-right shrink-0">
                {c.overdueCount > 0 ? (
                  <span className="inline-block px-2 py-0.5 rounded-full bg-danger-500/20 text-danger-400 text-[10px] font-bold">เกิน {c.overdueCount} งวด</span>
                ) : c.dueCount > 0 ? (
                  <span className="inline-block px-2 py-0.5 rounded-full bg-warn-400/15 text-warn-400 text-[10px] font-bold">ครบ {c.dueCount} งวด</span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-ok-600/15 text-ok-400 text-[10px] font-bold"><BadgeCheck className="w-3 h-3" /> เรียบร้อย</span>
                )}
              </div>
            </div>
            <div className="mt-3 flex items-end justify-between">
              <div className="text-[11px] text-cream-50/45">{c.activeContracts} สัญญา · ค้าง {c.dueCount} งวด</div>
              <div className="text-lg font-bold tnum">{baht(c.dueTotal)}</div>
            </div>
            {c.dueCount > 0 && (
              <div
                onClick={(e) => { e.stopPropagation(); setQuickBill(c.id); }}
                className="mt-2.5 py-1.5 rounded-lg border border-gold-400/35 text-gold-300 text-[11px] font-semibold text-center hover:bg-gold-400/10 transition-colors"
                title="รวมทุกงวดค้างเป็นใบเสร็จเดียว"
              >
                ออกบิลรวม {c.dueCount} งวด
              </div>
            )}
          </button>
        ))}
      </div>

      {/* quick combined bill straight from a card */}
      {quickBill && <BillModal customerId={quickBill} onClose={() => setQuickBill(null)} />}

      {/* detail drawer */}
      {selected && (
        <CustomerDetailPanel id={selected} onClose={() => setSelected(null)} onChanged={refresh} />
      )}

      {/* add/edit customer modal */}
      {editing && (
        <CustomerFormModal
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}
    </div>
  );
}

/* ------------------------------ detail panel ------------------------------ */

function CustomerDetailPanel({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<CustomerDetail | null>(null);
  const [open, setOpen] = useState<string | null>(null); // expanded contract id
  const [newContract, setNewContract] = useState(false);
  const [payFor, setPayFor] = useState<{ contractId: string; item: string; period: number; amount: number; overdueDays: number; dueDate: string } | null>(null);
  const [billFor, setBillFor] = useState<{ contractId: string; periods: number[] } | null>(null);
  const [billAll, setBillAll] = useState(false);

  const load = () => api.customer(id).then(setData).catch(() => setData(null));
  useEffect(() => { load(); }, [id]);

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 ml-auto w-full max-w-2xl h-full bg-ink-900 border-l border-ink-700 flex flex-col shadow-2xl">
        {!data ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gold-400" /></div>
        ) : (
          <>
            <div className="p-5 border-b border-ink-700 flex items-start gap-3">
              <div className="flex-1">
                <h2 className="text-xl font-bold tracking-tight">{data.name}</h2>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-[12px] text-cream-50/50">
                  {data.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{data.phone}</span>}
                  {data.messenger && (
                    <a href={data.messenger.startsWith('http') ? data.messenger : `https://m.me/${data.messenger}`} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-gold-300 hover:text-gold-200">
                      <MessageCircle className="w-3 h-3" /> แชท Messenger
                    </a>
                  )}
                  {data.note && <span className="text-cream-50/40">· {data.note}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setBillAll(true)}
                  disabled={data.dueCount === 0}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gold-400/40 text-gold-300 text-xs font-semibold hover:bg-gold-400/10 disabled:opacity-40"
                  title="รวมทุกงวดค้างของลูกค้านี้เป็นใบเสร็จเดียว"
                >
                  <FileText className="w-3.5 h-3.5" /> ออกบิลรวม ({data.dueCount})
                </button>
                <button onClick={() => setNewContract(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gold-400 text-ink-900 text-xs font-semibold hover:bg-gold-300">
                  <Plus className="w-3.5 h-3.5" /> สัญญาใหม่
                </button>
                <button onClick={onClose} aria-label="ปิดรายละเอียดลูกค้า" className="p-2 rounded-lg hover:bg-white/5 text-cream-50/50"><X className="w-4 h-4" /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-5">
              {/* contracts */}
              <section className="space-y-3">
                <h3 className="text-xs font-semibold text-cream-50/50 uppercase tracking-wider">สัญญา ({data.contracts.length})</h3>
                {data.contracts.length === 0 && <p className="text-xs text-cream-50/35">ยังไม่มีสัญญา — กด "สัญญาใหม่" เพื่อสร้างตารางงวด</p>}
                {data.contracts.map((ct) => {
                  const isOpen = open === ct.id;
                  const paid = ct.installments.filter((i) => i.status === 'paid').length;
                  const next = ct.installments.find((i) => i.status !== 'paid');
                  return (
                    <div key={ct.id} className={cn('rounded-xl border', ct.closedAt ? 'border-ink-700 bg-ink-800/50 opacity-70' : 'border-ink-700 bg-ink-800')}>
                      <button onClick={() => setOpen(isOpen ? null : ct.id)} className="w-full px-4 py-3 flex items-center gap-3 text-left">
                        <ChevronDown className={cn('w-4 h-4 text-cream-50/40 transition-transform', isOpen && 'rotate-180')} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{ct.item} {ct.closedAt && <span className="text-[10px] text-cream-50/40">· ปิดแล้ว</span>}</div>
                          <div className="text-[11px] text-cream-50/45 tnum">{baht(ct.monthlyAmount)}/เดือน · {ct.totalPeriods} งวด · จ่ายแล้ว {paid}/{ct.totalPeriods}{next ? ` · งวดถัดไป ${thDate(next.dueDate)}` : ' · ครบทุกงวด'}</div>
                        </div>
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-4">
                          <div className="rounded-lg border border-ink-700 overflow-hidden">
                            <table className="w-full text-[12px]">
                              <thead>
                                <tr className="bg-ink-700/50 text-cream-50/50 text-left">
                                  <th className="px-3 py-2 font-medium">งวด</th>
                                  <th className="px-3 py-2 font-medium">ครบกำหนด</th>
                                  <th className="px-3 py-2 font-medium text-right">ยอด</th>
                                  <th className="px-3 py-2 font-medium text-right">การชำระ</th>
                                </tr>
                              </thead>
                              <tbody>
                                {ct.installments.map((inst) => {
                                  const od = inst.status === 'paid' ? 0 : Math.max(0, daysUntil(inst.dueDate) * -1);
                                  return (
                                    <tr key={inst.no} className={cn('border-t border-ink-700/60', inst.status === 'paid' ? 'text-cream-50/40' : od > 0 ? 'text-danger-400' : '')}>
                                      <td className="px-3 py-2 tnum">{inst.no}</td>
                                      <td className="px-3 py-2 tnum">{thDate(inst.dueDate)}{od > 0 && <span className="ml-1 text-[10px] font-bold">(เกิน {od} วัน)</span>}</td>
                                      <td className="px-3 py-2 text-right tnum">{baht(inst.amount)}</td>
                                      <td className="px-3 py-2 text-right">
                                        {inst.status === 'paid' ? (
                                          <span className="text-ok-400 text-[11px]">จ่ายแล้ว {thDateTime(inst.paidAt || '')}</span>
                                        ) : (
                                          <button
                                            onClick={() => setPayFor({ contractId: ct.id, item: ct.item, period: inst.no, amount: inst.amount, overdueDays: od, dueDate: inst.dueDate })}
                                            className="px-2.5 py-1 rounded-lg bg-gold-400/15 text-gold-300 text-[11px] font-semibold hover:bg-gold-400/25"
                                          >
                                            รับเงิน
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={() => setBillFor({ contractId: ct.id, periods: next ? [next.no] : [] })}
                              disabled={!next}
                              className="px-3 py-2 rounded-lg border border-ink-600 text-xs font-medium hover:bg-white/5 disabled:opacity-40"
                            >
                              ออกบิลงวดถัดไป
                            </button>
                            {ct.closedAt ? (
                              <button onClick={async () => { await api.reopenContract(ct.id); load(); }} className="px-3 py-2 rounded-lg border border-ink-600 text-xs hover:bg-white/5">เปิดสัญญาใหม่</button>
                            ) : (
                              <button
                                onClick={async () => {
                                  if (confirm('ปิดสัญญานี้? (สัญญาจะซ่อนจากบอร์ด แต่ดูประวัติได้)')) { await api.closeContract(ct.id); load(); onChanged(); }
                                }}
                                className="px-3 py-2 rounded-lg border border-ink-600 text-xs text-cream-50/55 hover:bg-white/5"
                              >
                                ปิดสัญญา
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>

              {/* payments history */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-cream-50/50 uppercase tracking-wider">ประวัติชำระ ({data.payments.length})</h3>
                {data.payments.length === 0 && <p className="text-xs text-cream-50/35">ยังไม่มีประวัติ</p>}
                {data.payments.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-800 px-4 py-2.5 text-[12px]">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{thDateTime(p.paidAt)} <span className="text-cream-50/40 font-normal">· งวด {p.installmentNo}</span></div>
                      <div className="text-[11px] text-cream-50/40 font-mono">{p.receiptNo}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold tnum">{baht(p.amount + p.lateFee)}</div>
                      {p.lateFee > 0 && <div className="text-[10px] text-warn-400 tnum">รวมค่าปรับ {baht(p.lateFee)}</div>}
                    </div>
                  </div>
                ))}
              </section>
            </div>
          </>
        )}
      </div>

      {newContract && data && (
        <NewContractModal
          customerId={data.id}
          onClose={() => setNewContract(false)}
          onDone={() => { setNewContract(false); load(); onChanged(); }}
        />
      )}
      {payFor && data && (
        <RecordPaymentModal request={{ ...payFor, customerName: data.name }} onClose={() => setPayFor(null)} onDone={() => { setPayFor(null); load(); onChanged(); }} />
      )}
      {billFor && (
        <BillModal contractId={billFor.contractId} installmentNos={billFor.periods} onClose={() => setBillFor(null)} />
      )}
      {billAll && data && (
        <BillModal customerId={data.id} onClose={() => setBillAll(false)} />
      )}
    </div>
  );
}

function daysUntil(iso: string): number {
  const d = new Date(iso + 'T00:00:00').getTime();
  const now = new Date(new Date().toDateString()).getTime();
  return Math.round((d - now) / 86400000);
}

/* ------------------------------ add/edit form ------------------------------ */

function CustomerFormModal({ initial, onClose, onSaved }: { initial: CustomerWithSummary | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name || '');
  const [phone, setPhone] = useState(initial?.phone || '');
  const [messenger, setMessenger] = useState(initial?.messenger || '');
  const [note, setNote] = useState(initial?.note || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (initial) await api.updateCustomer(initial.id, { name, phone, messenger, note });
      else await api.addCustomer({ name, phone, messenger, note });
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-ink-600 bg-ink-800 shadow-2xl p-5 space-y-3">
        <h3 className="font-semibold text-sm">{initial ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้าใหม่'}</h3>
        <Field label="ชื่อลูกค้า *" value={name} onChange={setName} placeholder="เช่น คุณอุ้ม" />
        <Field label="เบอร์โทร" value={phone} onChange={setPhone} placeholder="08x-xxx-xxxx" />
        <Field label="Messenger (ชื่อผู้ใช้ หรือ ลิงก์ m.me)" value={messenger} onChange={setMessenger} placeholder="username" />
        <Field label="โน้ต" value={note} onChange={setNote} placeholder="เช่น จ่ายปลายเดือน รอเงินเดือน" />
        {error && <p className="text-xs text-danger-400">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-ink-600 text-sm hover:bg-white/5">ยกเลิก</button>
          <button onClick={save} disabled={busy || !name.trim()} className="flex-1 py-2.5 rounded-xl bg-gold-400 text-ink-900 text-sm font-semibold hover:bg-gold-300 disabled:opacity-40 flex items-center justify-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}

export function Field({ label, value, onChange, placeholder, type = 'text' }: any) {
  return (
    <label className="block">
      <span className="text-xs text-cream-50/55">{label}</span>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="mt-1 w-full px-3 py-2.5 rounded-xl bg-ink-900 border border-ink-600 text-sm focus:outline-none focus:border-gold-400/60"
      />
    </label>
  );
}
