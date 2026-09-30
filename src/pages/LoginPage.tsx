import { useState } from 'react';
import { Loader2, LockKeyhole } from 'lucide-react';

export default function LoginPage({ onSignedIn }: { onSignedIn: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSignedIn(password);
    } catch (err: any) {
      setError(err?.message || 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-ink-900 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-10%,rgba(200,160,77,0.14),transparent_55%)]" />
      <form onSubmit={submit} className="relative z-10 w-full max-w-sm text-center">
        <img src="/logo.png" alt="NicheBlooms" className="w-36 h-36 mx-auto object-contain" />
        <h1 className="mt-2 text-xl font-semibold tracking-tight">NicheBlooms · Smart Bill</h1>
        <p className="text-sm text-cream-50/45 mt-1">แดชบอร์ดส่วนตัว — ป้อนรหัสผ่านเพื่อเข้าใช้</p>

        <div className="mt-6 rounded-2xl border border-ink-600 bg-ink-800 p-5 space-y-3 text-left">
          <label className="block text-xs text-cream-50/50">รหัสผ่าน</label>
          <div className="relative">
            <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cream-50/30" />
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="รหัสผ่านผู้ใช้เดียว"
              className="w-full pl-9 pr-3 py-3 rounded-xl bg-ink-900 border border-ink-600 text-sm focus:outline-none focus:border-gold-400/60"
            />
          </div>
          {error && <p className="text-xs text-danger-400">{error}</p>}
          <button
            type="submit"
            disabled={busy || !password}
            className="w-full py-3 rounded-xl bg-gold-400 text-ink-900 font-semibold text-sm hover:bg-gold-300 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            เข้าสู่ระบบ
          </button>
        </div>
        <p className="text-[11px] text-cream-50/30 mt-4">
          ครั้งแรก: รหัสผ่านจาก <span className="font-mono">LOCAL_ADMIN_PASSWORD</span> ในไฟล์ .env (ค่าเริ่มต้น changeme123)
        </p>
      </form>
    </div>
  );
}
