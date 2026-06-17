import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Flame, LayoutGrid, Plus, Settings, CreditCard, ShieldCheck, FolderDown, Bot, Inbox as InboxIcon,
  LogOut, Command as CommandIcon, Sun, Moon, Menu, X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useInbox } from '../../hooks/useAutopilot';
import { cn } from '../../lib/utils';
import { CommandPalette } from '../CommandPalette';

const nav = [
  { to: '/dashboard', label: 'Projects', icon: LayoutGrid },
  { to: '/new', label: 'New project', icon: Plus },
  { to: '/import', label: 'Import', icon: FolderDown },
  { to: '/autopilot', label: 'Autopilot', icon: Bot },
  { to: '/inbox', label: 'Inbox', icon: InboxIcon },
  { to: '/billing', label: 'Billing', icon: CreditCard },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell({ children, fullBleed }: { children: ReactNode; fullBleed?: boolean }) {
  const { profile, usageThisMonth, signOut } = useAuth();
  const navigate = useNavigate();
  const { pendingCount } = useInbox();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [light, setLight] = useState(() => document.documentElement.classList.contains('light'));

  useEffect(() => {
    const open = () => setPaletteOpen(true);
    document.addEventListener('ff:open-palette', open);
    return () => document.removeEventListener('ff:open-palette', open);
  }, []);

  const toggleTheme = () => {
    document.documentElement.classList.toggle('light');
    document.documentElement.classList.toggle('dark');
    setLight((v) => !v);
  };

  const limit = profile?.monthly_generation_limit ?? 10;
  const pct = Math.min(100, Math.round((usageThisMonth / limit) * 100));

  const sidebar = (
    <aside className="flex h-full w-60 flex-col border-r border-forge-border bg-forge-panel">
      <div className="flex items-center gap-2 px-4 py-4">
        <Flame size={20} className="text-forge-ember" />
        <span className="font-display text-lg font-semibold tracking-tight">FableForge</span>
      </div>

      <button
        onClick={() => setPaletteOpen(true)}
        className="mx-3 mb-3 flex items-center gap-2 rounded-lg border border-forge-border px-3 py-2 text-xs text-forge-dim hover:border-forge-ember/40"
      >
        <CommandIcon size={13} />
        <span>Search & commands</span>
        <kbd className="ml-auto rounded border border-forge-border px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
      </button>

      <nav className="flex-1 space-y-0.5 px-3" aria-label="Main">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive ? 'bg-forge-raised text-forge-ink ember-seam' : 'text-forge-dim hover:bg-forge-raised hover:text-forge-ink',
              )
            }
          >
            <Icon size={16} />
            {label}
            {to === '/inbox' && pendingCount > 0 && (
              <span className="ml-auto rounded-full bg-forge-ember px-1.5 py-0.5 text-[10px] font-semibold text-forge-bg">
                {pendingCount}
              </span>
            )}
          </NavLink>
        ))}
        {profile?.role === 'admin' && (
          <NavLink
            to="/admin"
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive ? 'bg-forge-raised text-forge-ink ember-seam' : 'text-forge-dim hover:bg-forge-raised hover:text-forge-ink',
              )
            }
          >
            <ShieldCheck size={16} />
            Admin
          </NavLink>
        )}
      </nav>

      <div className="border-t border-forge-border p-3">
        <div className="mb-3 rounded-lg bg-forge-raised p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-forge-dim">Generations</span>
            <span className="font-mono">{usageThisMonth}/{limit}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-forge-border" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div
              className={cn('h-full rounded-full transition-all', pct >= 90 ? 'bg-forge-err' : 'bg-forge-ember')}
              style={{ width: `${pct}%` }}
            />
          </div>
          {profile?.plan === 'free' && pct >= 70 && (
            <button onClick={() => navigate('/pricing')} className="mt-2 text-xs text-forge-ember hover:underline">
              Upgrade for more →
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-forge-ember/20 text-xs font-semibold text-forge-ember">
            {(profile?.full_name || profile?.email || '?').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{profile?.full_name || profile?.email}</p>
            <p className="text-[11px] capitalize text-forge-dim">{profile?.plan} plan</p>
          </div>
          <button aria-label="Toggle theme" onClick={toggleTheme} className="rounded p-1.5 text-forge-dim hover:text-forge-ink">
            {light ? <Moon size={15} /> : <Sun size={15} />}
          </button>
          <button aria-label="Sign out" onClick={() => signOut()} className="rounded p-1.5 text-forge-dim hover:text-forge-err">
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden md:block">{sidebar}</div>

      {/* mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full">{sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-forge-border px-4 py-2 md:hidden">
          <button aria-label={mobileOpen ? 'Close menu' : 'Open menu'} onClick={() => setMobileOpen((v) => !v)}>
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <Flame size={18} className="text-forge-ember" />
          <span className="font-display font-semibold">FableForge</span>
        </header>
        <main className={cn('flex-1 overflow-y-auto panel-scroll', !fullBleed && 'p-6')}>{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
