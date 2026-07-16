import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import {
  Flame, LayoutGrid, Plus, Settings, CreditCard, ShieldCheck, FolderDown, Bot, Inbox as InboxIcon,
  LogOut, Command as CommandIcon, Sun, Moon, Menu, X, PanelLeftClose, PanelLeftOpen, Boxes, Megaphone, Rocket, Sparkles, Lightbulb, Activity, FlaskConical, Globe, Brain, BrainCircuit, Waypoints, Telescope, Compass, MessageSquare, Users, CircleDollarSign, KeyRound, Zap, Receipt } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabase';
import { NAV_SECTIONS } from '../../lib/navConfig';
import { useInbox } from '../../hooks/useAutopilot';
import { usePreviewClaims } from '../../hooks/usePreviewClaims';
import { cn } from '../../lib/utils';
import { CommandPalette } from '../CommandPalette';

// Grouped nav — one labeled section per job so the sidebar reads at a glance. This is a Garvis
// deployment: the business OS LEADS (it's what the operator came for); the app builder is a real,
// still-reachable capability ("edit apps") demoted below it under "Apps", not removed. Labs is
// admin-only. The unified identity fixed the "split brand" confusion (FableForge vs Garvis).
// The sidebar renders the shared nav config (src/lib/navConfig.ts) — the SAME list the ⌘K palette
// generates from, so the two never drift. Add/rename destinations there, not here.
const navSections = NAV_SECTIONS;

// Admin-only experiments — a 900-line spike should not be one click from Billing for everyone.
const labsSection = {
  title: 'Labs',
  // the /spike/clusters route was folded into /garvis/explore — the old link bounced to Landing
  items: [{ to: '/garvis/explore', label: 'Cluster spike (Explore)', icon: FlaskConical }],
};

export function AppShell({ children, fullBleed }: { children: ReactNode; fullBleed?: boolean }) {
  const { profile, usageThisMonth, signOut } = useAuth();
  const navigate = useNavigate();
  const { pendingCount } = useInbox();
  const { newCount: claimCount } = usePreviewClaims();
  // A lead must never arrive invisibly (UX audit): the ops inbox gets the same badge treatment —
  // new leads + pending approvals, counted from real rows on mount and window focus.
  const [opsCount, setOpsCount] = useState(0);
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const [{ count: leads }, { count: approvals }, replies] = await Promise.all([
          supabase.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'new'),
          supabase.from('approvals').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          // Unanswered warm replies count too (app_0050 handled_at) — the same event that fires
          // the highest-value waking move must never arrive invisibly. Separately caught so a
          // server that pre-dates the column can't zero the whole badge.
          supabase.from('replies').select('id', { count: 'exact', head: true })
            .eq('classification', 'positive').is('handled_at', null)
            .then((r) => r.count ?? 0, () => 0),
        ]);
        if (live) setOpsCount((leads ?? 0) + (approvals ?? 0) + replies);
      } catch { /* badge is best-effort */ }
    };
    void load();
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => { live = false; window.removeEventListener('focus', onFocus); };
  }, []);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Desktop sidebar collapse (slim icon rail), persisted across sessions.
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('ff:sidebar-collapsed') === '1');
  const [light, setLight] = useState(() => document.documentElement.classList.contains('light'));

  useEffect(() => {
    const open = () => setPaletteOpen(true);
    document.addEventListener('ff:open-palette', open);
    return () => document.removeEventListener('ff:open-palette', open);
  }, []);

  // Storage-quota honesty (design review): a full localStorage used to eat exploration saves
  // silently. The writer announces once; whichever page is mounted, the shell tells the human.
  const { toast } = useToast();
  useEffect(() => {
    const onFull = (e: Event) => {
      const msg = (e as CustomEvent<{ message?: string }>).detail?.message
        ?? 'Browser storage is full — this device is running from the cloud copy.';
      toast('info', msg);
    };
    window.addEventListener('ff:storage-full', onFull);
    return () => window.removeEventListener('ff:storage-full', onFull);
  }, [toast]);

  useEffect(() => {
    localStorage.setItem('ff:sidebar-collapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  const toggleTheme = () => {
    document.documentElement.classList.toggle('light');
    document.documentElement.classList.toggle('dark');
    setLight((v) => !v);
  };

  const limit = profile?.monthly_generation_limit ?? 10;
  const pct = Math.min(100, Math.round((usageThisMonth / limit) * 100));

  const navLinkClass = (collapsed: boolean) => ({ isActive }: { isActive: boolean }) =>
    cn(
      'relative flex items-center rounded-lg text-sm transition-colors',
      collapsed ? 'justify-center px-2 py-2' : 'gap-2.5 px-3 py-2',
      isActive ? 'bg-forge-raised text-forge-ink ember-seam' : 'text-forge-dim hover:bg-forge-raised hover:text-forge-ink',
    );

  // `collapsed` slims the rail to icons only; `collapsible` shows the toggle (desktop only —
  // the mobile drawer is always full-width and toggled by the header hamburger instead).
  const renderSidebar = (collapsed: boolean, collapsible = true) => (
    <aside className={cn('flex h-full flex-col border-r border-forge-border bg-forge-panel', collapsed ? 'w-16' : 'w-60')}>
      <div className={cn('flex items-center py-4', collapsed ? 'flex-col gap-2 px-2' : 'gap-2 px-4')}>
        <Link to="/garvis/command" className="flex items-center gap-2 rounded-lg" title="Garvis — home">
          <Flame size={20} className="shrink-0 text-forge-ember" />
          {!collapsed && <span className="font-display text-lg font-semibold tracking-tight">Garvis</span>}
        </Link>
        {collapsible && (
          <button
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn('rounded p-1.5 text-forge-dim hover:text-forge-ink', !collapsed && 'ml-auto')}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        )}
      </div>

      <button
        onClick={() => setPaletteOpen(true)}
        title="Search & commands (⌘K)"
        className={cn(
          'mb-3 flex items-center rounded-lg border border-forge-border text-xs text-forge-dim hover:border-forge-ember/40',
          collapsed ? 'mx-2 justify-center px-2 py-2' : 'mx-3 gap-2 px-3 py-2',
        )}
      >
        <CommandIcon size={13} />
        {!collapsed && (
          <>
            <span>Search & commands</span>
            <kbd className="ml-auto rounded border border-forge-border px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
          </>
        )}
      </button>

      <nav className={cn('flex-1 space-y-3 overflow-y-auto panel-scroll', collapsed ? 'px-2' : 'px-3')} aria-label="Main">
        {[...navSections, ...(profile?.role === 'admin' ? [labsSection] : [])].map((section, si) => (
          <div key={section.title} className="space-y-0.5">
            {collapsed
              ? si > 0 && <div className="mx-2 mb-2 border-t border-forge-border" />
              : <p className="px-3 pb-1 text-[10px] font-medium uppercase tracking-wide text-forge-dim/70">{section.title}</p>}
            {section.items.map(({ to, label, icon: Icon, ...rest }) => (
              <NavLink
                key={to}
                to={to}
                end={'end' in rest ? (rest as { end?: boolean }).end : undefined}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? label : undefined}
                className={navLinkClass(collapsed)}
              >
                <Icon size={16} className="shrink-0" />
                {!collapsed && label}
                {to === '/garvis/queue' && opsCount + pendingCount > 0 && (
                  collapsed ? (
                    <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-forge-ember" aria-label={`${opsCount + pendingCount} waiting`} />
                  ) : (
                    <span className="ml-auto rounded-full bg-forge-ember px-1.5 py-0.5 text-[10px] font-semibold text-forge-bg" title="Approvals + leads + replies + build questions waiting">
                      {opsCount + pendingCount}
                    </span>
                  )
                )}
                {to === '/business-preview-engine' && claimCount > 0 && (
                  collapsed ? (
                    <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-forge-ok" aria-label={`${claimCount} new claims`} />
                  ) : (
                    <span className="ml-auto rounded-full bg-forge-ok px-1.5 py-0.5 text-[10px] font-semibold text-forge-bg" title="New claim requests">
                      {claimCount}
                    </span>
                  )
                )}
              </NavLink>
            ))}
            {section.title === 'Account' && profile?.role === 'admin' && (
              <NavLink
                to="/admin"
                onClick={() => setMobileOpen(false)}
                title={collapsed ? 'Admin' : undefined}
                className={navLinkClass(collapsed)}
              >
                <ShieldCheck size={16} className="shrink-0" />
                {!collapsed && 'Admin'}
              </NavLink>
            )}
          </div>
        ))}
      </nav>

      <div className={cn('border-t border-forge-border p-3', collapsed && 'px-2')}>
        {!collapsed && (
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
            {/* Credits balance — the metering that gates every server AI action; previously
                enforced server-side but invisible, so a throttle looked like a bug. Now honest. */}
            {typeof (profile as { credits_balance?: number } | null)?.credits_balance === 'number' && (
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-forge-dim">Credits</span>
                <span className={cn('font-mono', ((profile as { credits_balance?: number }).credits_balance ?? 0) < 20 ? 'text-forge-err' : 'text-forge-ink')}>
                  {(profile as { credits_balance?: number }).credits_balance}
                </span>
              </div>
            )}
            {profile?.plan === 'free' && pct >= 70 && (
              <button onClick={() => navigate('/pricing')} className="mt-2 text-xs text-forge-ember hover:underline">
                Upgrade for more →
              </button>
            )}
          </div>
        )}

        <div className={cn('flex items-center', collapsed ? 'flex-col gap-2' : 'gap-2')}>
          <div
            title={collapsed ? `${profile?.full_name || profile?.email} · ${profile?.plan} plan` : undefined}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forge-ember/20 text-xs font-semibold text-forge-ember"
          >
            {(profile?.full_name || profile?.email || '?').slice(0, 1).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{profile?.full_name || profile?.email}</p>
              <p className="text-[11px] capitalize text-forge-dim">{profile?.plan} plan</p>
            </div>
          )}
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
      <div className="hidden md:block">{renderSidebar(collapsed)}</div>

      {/* mobile drawer — always full width, no collapse toggle */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full">{renderSidebar(false, false)}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-forge-border px-4 py-2 md:hidden">
          <button aria-label={mobileOpen ? 'Close menu' : 'Open menu'} onClick={() => setMobileOpen((v) => !v)}>
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <Flame size={18} className="text-forge-ember" />
          <span className="font-display font-semibold">Garvis</span>
        </header>
        <main className={cn('flex-1 overflow-y-auto panel-scroll', !fullBleed && 'p-6')}>{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
