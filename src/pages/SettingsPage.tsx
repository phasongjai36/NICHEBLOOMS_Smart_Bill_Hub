import { useEffect, useRef, useState } from 'react';
import { Loader2, Save, KeyRound, DownloadCloud, UploadCloud, DatabaseBackup, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { Settings } from '../types';
import { cn } from '../lib/utils';

export default function SettingsPage({ onLocked }: { onLocked: () => void }) {
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // password form
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNext, setPwNext] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // backup
  const fileRef = useRef<HTMLInputElement>(null);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);

  useEffect(() => { api.settings().then(setS).catch((e) => setError(e.message)); }, []);

  const save = async () => {
    if (!s) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api.saveSettings(s);
      setS(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch (e: any) {
      setError(e?.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const changePw = async () => {
    setPwMsg(null);
    try {
      await api.changePassword(pwCurrent, pwNext);
      setPwMsg({ ok: true, text: 'เปลี่ยนรหัสผ่านแล้ว (เซสชันอื่นถูกปิด)' });
      setPwCurrent(''); setPwNext('');
    } catch (e: any) {
      setPwMsg({ ok: false, text: e?.message || 'เปลี่ยนไม่สำเร็จ' });
      if (e?.status === 401) onLocked();
    }
  };

  const downloadJson = () => {
    if (!s) return;
    // download current db via manual server backup then fetch? Simpler: ask server to write a manual backup copy and also serve it
    api.backup().then((r) => setBackupMsg(`สำรองแล้ว: ${r.file}`)).catch((e) => setBackupMsg('ผิดพลาด: ' + e.message));
  };

  const restoreUpload = async (file: File) => {
    const text = await file.text();
    if (!confirm('กู้คืนข้อมูลจากไฟล์นี้? ข้อมูลปัจจุบันจะถูกแทนที่')) return;
    try {
      await api.restore(text);
      setBackupMsg('กู้คืนสำเร็จ — โหลดหน้าใหม่');
      setTimeout(() => window.location.reload(), 800);
    } catch (e: any) {
      setBackupMsg('ผิดพลาด: ' + e.message);
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      {error && <div className="rounded-xl border border-danger-400/30 bg-danger-400/10 text-danger-400 text-sm px-4 py-3">{error}</div>}

      {/* billing settings */}
      <section className="rounded-2xl border border-ink-700 bg-ink-800 p-5 space-y-4">
        <h2 className="font-semibold text-sm">การเรียกเก็บเงิน</h2>
        {s && (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              <F label="เลขพร้อมเพย์ (เบอร์มือถือ 10 หลัก)">
                <input value={s.promptpayId} onChange={(e) => setS({ ...s, promptpayId: e.target.value })} className={inputCls} />
              </F>
              <F label="ชื่อผู้รับเงิน">
                <input value={s.promptpayName} onChange={(e) => setS({ ...s, promptpayName: e.target.value })} className={inputCls} />
              </F>
              <F label="ค่าปรับล่าช้า (บาท/วัน)">
                <input type="number" min={0} value={s.lateFeePerDay} onChange={(e) => setS({ ...s, lateFeePerDay: Number(e.target.value) })} className={inputCls} />
              </F>
              <F label="ค่าธรรมเนียมติดตาม (บาท เมื่อเกินกำหนด)">
                <input type="number" min={0} value={s.collectionFee} onChange={(e) => setS({ ...s, collectionFee: Number(e.target.value) })} className={inputCls} />
              </F>
            </div>
            <button onClick={save} disabled={busy}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gold-400 text-ink-900 text-sm font-semibold hover:bg-gold-300 disabled:opacity-40">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saved ? 'บันทึกแล้ว' : 'บันทึกการตั้งค่า'}
            </button>
          </>
        )}
      </section>

      {/* password */}
      <section className="rounded-2xl border border-ink-700 bg-ink-800 p-5 space-y-3">
        <h2 className="font-semibold text-sm flex items-center gap-2"><KeyRound className="w-4 h-4 text-gold-400" /> เปลี่ยนรหัสผ่าน</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <F label="รหัสผ่านปัจจุบัน">
            <input type="password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} className={inputCls} />
          </F>
          <F label="รหัสผ่านใหม่ (6+ ตัว)">
            <input type="password" value={pwNext} onChange={(e) => setPwNext(e.target.value)} className={inputCls} />
          </F>
        </div>
        {pwMsg && <p className={cn('text-xs', pwMsg.ok ? 'text-ok-400' : 'text-danger-400')}>{pwMsg.text}</p>}
        <button onClick={changePw} disabled={!pwCurrent || pwNext.length < 6}
          className="px-5 py-2.5 rounded-xl border border-ink-600 text-sm font-medium hover:bg-white/5 disabled:opacity-40">
          เปลี่ยนรหัสผ่าน
        </button>
      </section>

      {/* backup */}
      <section className="rounded-2xl border border-ink-700 bg-ink-800 p-5 space-y-3">
        <h2 className="font-semibold text-sm flex items-center gap-2"><DatabaseBackup className="w-4 h-4 text-gold-400" /> สำรอง / กู้คืนข้อมูล</h2>
        <p className="text-[12px] text-cream-50/50 leading-relaxed">
          ระบบสำรองอัตโนมัติทุกครั้งที่เปิด server (เก็บ 14 วันใน <span className="font-mono">data/backups/</span>)
          และสำรองเองได้ทุกเมื่อ — แนะนำให้กดสำรองแล้วเก็บไว้ที่อื่นด้วยทุกสัปดาห์
        </p>
        <div className="flex flex-wrap gap-2">
          <button onClick={downloadJson} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold-400 text-ink-900 text-sm font-semibold hover:bg-gold-300">
            <DownloadCloud className="w-4 h-4" /> สำรองตอนนี้
          </button>
          <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-ink-600 text-sm font-medium hover:bg-white/5">
            <UploadCloud className="w-4 h-4" /> กู้คืนจากไฟล์
          </button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) restoreUpload(f); }} />
        </div>
        {backupMsg && <p className="text-xs text-gold-300">{backupMsg}</p>}
      </section>

      <p className="text-[11px] text-cream-50/30 leading-relaxed px-1">
        NicheBlooms Smart Bill · ทำงานในเครื่อง 100% · ข้อมูลอยู่ที่ <span className="font-mono">data/db.json</span> · ไม่มีการส่งข้อมูลออกคลาวด์
      </p>
    </div>
  );
}

const inputCls = 'mt-1 w-full px-3 py-2.5 rounded-xl bg-ink-900 border border-ink-600 text-sm focus:outline-none focus:border-gold-400/60';

function F({ label, children }: any) {
  return <label className="block"><span className="text-xs text-cream-50/55">{label}</span>{children}</label>;
}
