import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { Loader2, Copy, Check, Download, X, Printer } from 'lucide-react';
import { api } from '../lib/api';
import { Bill } from '../types';
import { baht, thDate } from '../lib/utils';
import { cn } from '../lib/utils';

export default function BillModal({ contractId, installmentNos, customerId, onClose }: {
  contractId?: string;
  installmentNos?: number[];
  customerId?: string;          // โหมดบิลรวม: ทุกงวดครบกำหนดแล้วของลูกค้าในใบเดียว (ไม่รวมงวดอนาคต)
  onClose: () => void;
}) {
  const [data, setData] = useState<{ bill: Bill; messageText: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const paperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const p = customerId
      ? api.previewCustomerBill(customerId)
      : api.previewBill(contractId!, installmentNos!);
    p.then(async (r) => {
      setData(r);
      if (r.bill.qrPayload) {
        try {
          const q = await api.qrDataUrl(r.bill.qrPayload);
          setQr(q.dataUrl);
        } catch { setQr(null); }
      }
    }).catch((e) => setError(e.message));
  }, [contractId, customerId, installmentNos?.join(',')]);

  const copyText = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.messageText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select-all textarea
      const ta = document.createElement('textarea');
      ta.value = data.messageText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const downloadPng = async () => {
    if (!paperRef.current) return;
    try {
      const html2canvas = (await import('html2canvas-pro')).default;
      await document.fonts.ready;
      const canvas = await html2canvas(paperRef.current, {
        backgroundColor: '#f7f1e4',
        scale: 2,
      });
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `bill-${data?.bill.receiptNo || 'nb'}.png`;
      a.click();
    } catch (e) {
      console.error(e);
    }
  };

  const bill = data?.bill;
  const [scale, setScale] = useState(1);
  const [paperH, setPaperH] = useState<number>(0);

  // คุมให้ใบเสร็จกว้าง 420px พอดีจอทุกขนาด (ย่อด้วย transform ไม่ใช่ responsive width
  // เพื่อให้ export PNG ยังได้ความกว้างตายตัว)
  useEffect(() => {
    // ใบเสร็จกว้าง 420px ตายตัว (สำหรับ export) — แสดงผลย่อให้พอดีจอเสมอ
    // hard-cap: ไม่ใหญ่กว่าจอมือถือ 6.9" (~430px logical) แม้จอ PC กว้าง
    const MAX_PAPER = 430;            // px logical — ขีดจำกัดจอมือถือ 6.9 นิ้ว
    const DISPLAY_MAX = Math.min(MAX_PAPER, 420); // โชว์สูงสุด 420px (PC ก็ไม่ยืดเกิน)
    const fit = () => {
      const avail = Math.min(window.innerWidth - 56, DISPLAY_MAX);
      setScale(Math.min(1, avail / 420));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // measure the rendered paper so the scaled wrapper reserves the right height
  useLayoutEffect(() => {
    if (paperRef.current) setPaperH(paperRef.current.offsetHeight);
  }, [data]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[94vh] rounded-2xl border border-ink-600 bg-ink-800 shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-700">
          <h3 className="font-semibold text-sm">ใบเสร็จ / บิลค่างวด</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 text-cream-50/50"><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto scrollbar-thin px-5 pt-5 flex-1 flex justify-center">
          {error && <p className="text-sm text-danger-400">{error}</p>}
          {!data && !error && (
            <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gold-400" /></div>
          )}

          {bill && (
            <>
            <div style={{ width: 420 * scale, height: paperH ? paperH * scale : 'auto' }} className="overflow-hidden">
              <div ref={paperRef} className="rounded-xl px-7 py-8 text-[#3d3530] origin-top-left" style={{ background: '#f7f1e4', width: 420, transform: `scale(${scale})` }}>
                <div className="text-center">
                  <img src="/logo-deep.png" alt="" className="w-28 h-28 object-contain mx-auto" />
                  <div className="mt-1 text-[19px] font-bold text-[#12100c] tracking-tight">NICHE BLOOMS</div>
                  <div className="text-[11px] tracking-[0.18em] text-[#6b5f52]">CAREFULLY SELECTED FOR YOU</div>
                </div>

                <div className="mt-5 pt-4 border-t border-[#3d3530]/25 space-y-1 text-[12.5px]">
                  <div className="flex justify-between"><span>เลขที่ใบเสร็จ</span><span className="font-semibold">{bill.receiptNo}</span></div>
                  <div className="flex justify-between"><span>วันที่ออกบิล</span><span>{thDate(bill.issueDate)}</span></div>
                  <div className="flex justify-between"><span>ลูกค้า</span><span className="font-semibold">{bill.customer.name}</span></div>
                  {customerId && <div className="flex justify-between"><span>ประเภท</span><span className="font-semibold text-[#8a602c]">บิลรวมทุกรายการ ({bill.items.length} งวด)</span></div>}
                </div>

                <div className="mt-4 pt-3 border-t border-[#3d3530]/25">
                  {bill.items.map((it) => (
                    <div key={it.contractId + '-' + it.period} className="py-1.5 text-[13px]">
                      <div className="flex justify-between items-baseline">
                        <span className="font-semibold">{it.item}</span>
                        <span className="tnum">{baht(it.monthly)}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-[#6b5f52]">
                        <span>งวดที่ {it.period}/{it.totalPeriods}{it.overdueDays > 0 ? ` · เกิน ${it.overdueDays} วัน` : ''}</span>
                        <span className="tnum">
                          {it.lateFee > 0 && <>ค่าปรับ {baht(it.lateFee)}{it.collectionFee > 0 ? ` + ติดตาม ${baht(it.collectionFee)}` : ''}</>}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 pt-3 border-t-2 border-[#3d3530]/40 flex justify-between items-baseline">
                  <span className="text-sm font-bold">ยอดรวมที่ต้องชำระ</span>
                  <span className="text-2xl font-bold tnum text-[#12100c]">{baht(bill.total)}</span>
                </div>

                <div className="mt-5 flex items-center gap-4">
                  {qr ? (
                    <div className="bg-[#fffdf7] rounded-lg p-2 border border-[#3d3530]/15 shrink-0">
                      <img src={qr} alt="QR PromptPay" className="w-32 h-32" />
                    </div>
                  ) : (
                    <div className="w-36 h-36 rounded-lg border border-dashed border-[#3d3530]/30 flex items-center justify-center text-[10px] text-[#6b5f52] text-center px-2 shrink-0">
                      {bill.qrError || 'QR'}
                    </div>
                  )}
                  <div className="text-[11.5px] leading-relaxed text-[#4a4139]">
                    <div className="font-bold text-[12px]">พร้อมเพย์</div>
                    <div>{bill.payeeName}</div>
                    <div className="font-mono tnum">{bill.promptPayDisplay}</div>
                    <div className="mt-1.5 text-[#6b5f52]">สแกน QR หรือโอนตามเลขนี้<br />ยอดเงินตั้งไว้แล้ว {baht(bill.total)}</div>
                  </div>
                </div>

                <div className="mt-5 text-center text-[10px] text-[#6b5f52]">ขอบคุณที่ใช้บริการ 🌸</div>
              </div>
            </div>
            </>
          )}
        </div>

        {/* actions — ปุ่มหลักติดด้านล่างเสมอ */}
        {bill && (
          <div className="border-t border-ink-700 bg-ink-800 px-5 py-3">
            <div className="grid grid-cols-3 gap-2">
              <button onClick={copyText} className={cn(
                'py-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors',
                copied ? 'bg-ok-600 text-ink-900' : 'bg-gold-400 text-ink-900 hover:bg-gold-300'
              )}>
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'คัดลอกแล้ว' : 'คัดลอกข้อความ'}
              </button>
              <button onClick={downloadPng} className="py-3 rounded-xl border border-ink-600 text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-white/5">
                <Download className="w-3.5 h-3.5" /> บันทึก PNG
              </button>
              <button onClick={() => window.print()} className="py-3 rounded-xl border border-ink-600 text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-white/5">
                <Printer className="w-3.5 h-3.5" /> พิมพ์
              </button>
            </div>
            <details className="mt-2">
              <summary className="text-[11px] text-cream-50/40 cursor-pointer hover:text-cream-50/60">ดูข้อความที่จะคัดลอก</summary>
              <pre className="mt-2 text-[11px] leading-relaxed whitespace-pre-wrap bg-ink-900/70 border border-ink-700 rounded-xl p-3 text-cream-50/70">{data?.messageText}</pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
