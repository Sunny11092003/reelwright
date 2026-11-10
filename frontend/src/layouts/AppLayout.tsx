import clsx from 'clsx';
import { BarChart3, CalendarClock, ClipboardList, Clapperboard, LayoutDashboard, Library, LogOut, Menu, Palette, PlugZap, Send, Settings, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/create', label: 'Create', icon: Clapperboard },
  { to: '/library', label: 'Content library', icon: Library },
  { to: '/publishing', label: 'Publishing', icon: Send },
  { to: '/scheduled', label: 'Scheduled posts', icon: CalendarClock },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/accounts', label: 'Connected accounts', icon: PlugZap },
  { to: '/brands', label: 'Brand profiles', icon: Palette },
  { to: '/activity', label: 'Activity', icon: ClipboardList },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5 px-3">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} onClick={onNavigate}
          className={({ isActive }) => clsx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium', isActive ? 'bg-harbor-700 text-white shadow-[inset_3px_0_0_#E9A63A]' : 'text-harbor-100/80 hover:bg-harbor-800 hover:text-white')}>
          <Icon className="h-[18px] w-[18px]" aria-hidden />{label}
        </NavLink>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-6 py-5">
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden><rect width="32" height="32" rx="7" fill="#E9A63A" /><rect x="7" y="9" width="18" height="14" rx="2" fill="none" stroke="#0A1F20" strokeWidth="2" /><path d="M14 13l5 3-5 3z" fill="#0A1F20" /></svg>
      <span className="font-display text-lg font-bold text-white">Reelwright</span>
    </div>
  );
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[200] focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <aside className="hidden bg-harbor-900 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col"><Brand /><div className="flex-1 overflow-y-auto pb-4"><Nav /></div></aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-harbor-950/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 overflow-y-auto bg-harbor-900"><div className="flex items-center justify-between pr-3"><Brand /><button className="rounded p-2 text-white" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button></div><Nav onNavigate={() => setOpen(false)} /></div>
        </div>
      )}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-ink-line bg-canvas/90 px-4 backdrop-blur sm:px-8">
          <button className="btn-ghost !p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <div className="hidden text-sm text-ink-soft lg:block">{NAV.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)))?.label ?? ''}</div>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-[16rem] truncate text-sm text-ink-soft sm:block">{user?.email}</span>
            <button className="btn-secondary !py-1.5" onClick={() => logout()}><LogOut className="h-4 w-4" aria-hidden />Sign out</button>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8 sm:py-8"><Outlet key={loc.pathname} /></main>
      </div>
    </div>
  );
}
