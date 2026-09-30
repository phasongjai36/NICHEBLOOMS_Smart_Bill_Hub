import { useEffect, useState } from 'react';
import { LayoutDashboard, Users, ReceiptText, Settings as SettingsIcon, LogIn, LogOut, Flower2, CalendarClock } from 'lucide-react';
import { api, getToken, setToken, clearToken } from './lib/api';
import { cn } from './lib/utils';
import OverviewPage from './pages/OverviewPage';
import CollectPage from './pages/CollectPage';
import CustomersPage from './pages/CustomersPage';
import HistoryPage from './pages/HistoryPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';

type Tab = 'overview' | 'collect' | 'customers' | 'history' | 'settings';

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: 'overview', label: 'ภาพรวม', icon: LayoutDashboard },
  { id: 'collect', label: 'เรียกเก็บ', icon: CalendarClock },
  { id: 'customers', label: 'ลูกค้า', icon: Users },
  { id: 'history', label: 'ประวัติ', icon: ReceiptText },
  { id: 'settings', label: 'ตั้งค่า', icon: SettingsIcon },
];

export default function App() {
  const [authed, setAuthed] = useState<boolean>(() => !!getToken());
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    if (!authed) return;
    // verify session quietly; kick to login on 401
    api.overview().catch(() => {
      clearToken();
      setAuthed(false);
    });
  }, [authed]);

  if (!authed) {
    return (
      <LoginPage
        onSignedIn={async (password: string) => {
          const r = await api.signIn(password);
          setToken(r.token);
          setAuthed(true);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* top bar */}
      <header className="sticky top-0 z-30 border-b border-ink-700 bg-ink-900/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 lg:px-6 h-16 flex items-center gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="NicheBlooms" className="h-11 w-11 object-contain" />
            <div className="leading-tight">
              <div className="font-semibold tracking-tight text-cream-50">NicheBlooms</div>
              <div className="text-[11px] text-cream-50/50 -mt-0.5">Smart Bill · ส่วนตัว</div>
            </div>
          </div>

          <nav className="ml-6 hidden md:flex items-center gap-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                  tab === t.id
                    ? 'bg-gold-400/15 text-gold-300 border border-gold-400/30'
                    : 'text-cream-50/60 hover:text-cream-50 hover:bg-white/5 border border-transparent'
                )}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
              </button>
            ))}
          </nav>

          <div className="ml-auto">
            <button
              onClick={async () => {
                try { await api.signOut(); } catch { /* session may be gone */ }
                clearToken();
                setAuthed(false);
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-cream-50/50 hover:text-cream-50 hover:bg-white/5 transition-colors"
              title="ออกจากระบบ"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">ออกจากระบบ</span>
            </button>
          </div>
        </div>

        {/* mobile nav */}
        <nav className="md:hidden flex border-t border-ink-700 overflow-x-auto scrollbar-thin">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex-1 min-w-20 flex flex-col items-center gap-1 py-2 text-[11px]',
                tab === t.id ? 'text-gold-300 border-b-2 border-gold-400' : 'text-cream-50/50'
              )}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 lg:px-6 py-6 pb-24 md:pb-10">
        {tab === 'overview' && <OverviewPage onNavigate={setTab} />}
        {tab === 'collect' && <CollectPage />}
        {tab === 'customers' && <CustomersPage />}
        {tab === 'history' && <HistoryPage />}
        {tab === 'settings' && <SettingsPage onLocked={() => { clearToken(); setAuthed(false); }} />}
      </main>

      <footer className="border-t border-ink-700 py-4 text-center text-[11px] text-cream-50/30">
        <Flower2 className="inline w-3 h-3 mr-1 text-gold-400/60" />
        ข้อมูลทั้งหมดจัดเก็บในเครื่องนี้ (data/db.json) — NicheBlooms Smart Bill v1
      </footer>
    </div>
  );
}
