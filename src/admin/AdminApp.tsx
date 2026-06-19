import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AuthPage } from '../components/AuthPage';
import { api } from '../lib/api';
import { OverviewPage } from './OverviewPage';
import { UsersPage } from './UsersPage';
import { UserDossier } from './UserDossier';
import { TiersPage } from './TiersPage';
import { AiMonitorPage } from './AiMonitorPage';
import { ModerationPage } from './ModerationPage';
import { AnnouncementsPage } from './AnnouncementsPage';
import rbLogo from '../assets/rb-logo-hat.webp';
import { LayoutDashboard, Users as UsersIcon, CreditCard, Cpu, ShieldAlert, Megaphone, LogOut, Loader2 } from 'lucide-react';

type Nav = { kind: 'overview' } | { kind: 'users' } | { kind: 'user'; id: string } | { kind: 'tiers' } | { kind: 'ai' } | { kind: 'moderation' } | { kind: 'announcements' };

function CenterSpinner() {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-stone-50">
      <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
    </div>
  );
}

// Shown to a logged-in NON-admin. Deliberately a generic 404 — it must not reveal
// that an admin area exists.
function NotFound() {
  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-stone-50 px-6 text-center">
      <h1 className="font-display text-3xl font-bold text-stone-800 mb-2">404</h1>
      <p className="text-stone-500 mb-6">This page could not be found.</p>
      <a href="/" className="text-[13px] font-medium text-accent-700 hover:underline">Go home</a>
    </div>
  );
}

export function AdminApp() {
  const { user, loading, signOut } = useAuth();
  const [status, setStatus] = useState<'checking' | 'ok' | 'forbidden'>('checking');
  const [nav, setNav] = useState<Nav>({ kind: 'overview' });

  useEffect(() => {
    if (loading) return;
    if (!user) { setStatus('checking'); return; }
    let alive = true;
    api.get('/admin/me')
      .then(() => { if (alive) setStatus('ok'); })
      .catch(() => { if (alive) setStatus('forbidden'); });
    return () => { alive = false; };
  }, [user, loading]);

  if (loading) return <CenterSpinner />;
  if (!user) return <AuthPage />;
  if (status === 'checking') return <CenterSpinner />;
  if (status === 'forbidden') return <NotFound />;

  const navItem = (active: boolean) =>
    `w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
      active ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'
    }`;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-stone-50 text-stone-900">
      <aside className="w-60 shrink-0 border-r border-stone-200 bg-white flex flex-col">
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-stone-100">
          <img src={rbLogo} alt="RecipeBytes" className="w-8 h-8 object-contain shrink-0" />
          <div className="flex flex-col leading-tight">
            <span className="font-display text-[15px] font-semibold text-stone-900">RecipeBytes</span>
            <span className="text-[11px] text-accent-700 font-semibold uppercase tracking-wider">Admin</span>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          <button className={navItem(nav.kind === 'overview')} onClick={() => setNav({ kind: 'overview' })}>
            <LayoutDashboard className="w-4 h-4" /> Overview
          </button>
          <button className={navItem(nav.kind === 'users' || nav.kind === 'user')} onClick={() => setNav({ kind: 'users' })}>
            <UsersIcon className="w-4 h-4" /> Users
          </button>
          <button className={navItem(nav.kind === 'tiers')} onClick={() => setNav({ kind: 'tiers' })}>
            <CreditCard className="w-4 h-4" /> Tiers
          </button>
          <button className={navItem(nav.kind === 'ai')} onClick={() => setNav({ kind: 'ai' })}>
            <Cpu className="w-4 h-4" /> AI monitor
          </button>
          <button className={navItem(nav.kind === 'moderation')} onClick={() => setNav({ kind: 'moderation' })}>
            <ShieldAlert className="w-4 h-4" /> Moderation
          </button>
          <button className={navItem(nav.kind === 'announcements')} onClick={() => setNav({ kind: 'announcements' })}>
            <Megaphone className="w-4 h-4" /> Announcements
          </button>
        </nav>
        <div className="p-3 border-t border-stone-100">
          <div className="text-[12px] text-stone-500 px-3 mb-1 truncate">{user.email}</div>
          <button
            onClick={() => { signOut().then(() => { window.location.href = '/'; }); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-stone-600 hover:bg-stone-100 transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto">
        {nav.kind === 'overview' && <OverviewPage />}
        {nav.kind === 'users' && <UsersPage onOpenUser={(id) => setNav({ kind: 'user', id })} />}
        {nav.kind === 'user' && <UserDossier id={nav.id} onBack={() => setNav({ kind: 'users' })} />}
        {nav.kind === 'tiers' && <TiersPage />}
        {nav.kind === 'ai' && <AiMonitorPage />}
        {nav.kind === 'moderation' && <ModerationPage />}
        {nav.kind === 'announcements' && <AnnouncementsPage />}
      </main>
    </div>
  );
}
