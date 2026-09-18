// src/pages/re/ReShell.tsx
// THE REAL-ESTATE DOOR. Five tabs, one workspace, nothing else on screen.
//
// The platform's front door (Command) is the whole operating system: forty routes, a portfolio
// plane, a universe. A working agent opening that saw nothing about real estate — the one card
// that pointed at her workspace lived on Command, showed only before the first message, and hid
// itself on any backend error. This shell is the answer the simplicity doctrine (CLAUDE.md) gives:
// open on the work, one primary action per surface, an honest empty state with ONE next step.
//
// Nothing here is new machinery. Every tab mounts a component that already exists — the campaign
// studio, the Queue, the newsletter send card, the postcard designer, the farm panel — inside a
// layout that does not show the rest of the platform. Everything else is one link away, not gone.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { Building2, Loader2, ArrowRight, Settings2, LogOut } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { Button, Badge } from '../../components/ui';
import { listWebs, loadWeb, instantiateWeb, type LoadedWeb } from '../../lib/garvis/workwebRun';
import { loadPulse } from '../../lib/garvis/re/reRun';
import { rememberFrontDoor } from '../../lib/frontDoor';
import { cn } from '../../lib/utils';

export const RE_TEMPLATE_ID = 'real-estate-campaign';

type Toast = (k: 'success' | 'error' | 'info', m: string) => void;

export interface ReWorkspace {
  worldId: string;
  web: LoadedWeb;
  toast: Toast;
  /** The cluster an artifact files under. Prefers the named area; an older workspace created
   *  before that area existed falls back to the studio so nothing is refused for a missing room. */
  clusterFor: (slug: string) => LoadedWeb['clusters'][number];
  refreshBadge: () => void;
}

const Ctx = createContext<ReWorkspace | null>(null);
export function useReWorkspace(): ReWorkspace {
  const v = useContext(Ctx);
  if (!v) throw new Error('useReWorkspace outside the real-estate shell');
  return v;
}

const TABS: { to: string; label: string; end?: boolean }[] = [
  { to: '/re', label: 'Post', end: true },
  { to: '/re/queue', label: 'Queue' },
  { to: '/re/newsletter', label: 'Newsletter' },
  { to: '/re/postcards', label: 'Postcards' },
  { to: '/re/people', label: 'People' },
];

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'none' }
  | { kind: 'ready'; web: LoadedWeb };

export default function ReShell() {
  const { toast } = useToast();
  const { signOut } = useAuth();
  const location = useLocation();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [awaiting, setAwaiting] = useState<number>(0);
  const [creating, setCreating] = useState(false);

  // Walking through this door makes it the door this browser opens on next time.
  useEffect(() => { rememberFrontDoor('/re'); }, []);

  const resolve = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const webs = await listWebs();
      const mine = webs.find((w) => w.templateId === RE_TEMPLATE_ID);
      if (!mine) { setState({ kind: 'none' }); return; }
      const web = await loadWeb(mine.worldId);
      if (!web) { setState({ kind: 'none' }); return; }
      setState({ kind: 'ready', web });
    } catch (e) {
      // The old card hid itself here. A failed load must SAY it failed — "nothing about real
      // estate" over a connection error is exactly the experience this shell exists to end.
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'Could not reach the workspace.' });
    }
  }, []);
  useEffect(() => { void resolve(); }, [resolve]);

  const refreshBadge = useCallback(() => {
    if (state.kind !== 'ready') return;
    loadPulse(state.web.worldId).then((p) => setAwaiting(p.awaitingDecision)).catch(() => {});
  }, [state]);
  // Re-count on every tab change: approving in the Queue should be visible the moment she leaves it.
  useEffect(() => { refreshBadge(); }, [refreshBadge, location.pathname]);

  const create = async () => {
    setCreating(true);
    try {
      const web = await instantiateWeb(RE_TEMPLATE_ID);
      toast('success', `Created “${web.title}”.`);
      await resolve();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not set up the workspace.');
    } finally { setCreating(false); }
  };

  return (
    <div className="min-h-screen bg-forge-bg text-forge-ink">
      <header className="sticky top-0 z-20 border-b border-forge-border bg-forge-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-forge-ember" />
            <span className="font-display text-sm font-semibold">Real estate</span>
          </div>
          <nav aria-label="Real estate" className="-mx-1 flex flex-1 items-center gap-1 overflow-x-auto px-1">
            {TABS.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) => cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors',
                  isActive ? 'border-forge-ember/50 bg-forge-ember/10 text-forge-ink' : 'border-transparent text-forge-dim hover:text-forge-ink',
                )}
              >
                {t.label}
                {t.label === 'Queue' && awaiting > 0 && <Badge tone="ember">{awaiting}</Badge>}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-1 text-xs">
            <Link to="/settings" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-forge-dim hover:text-forge-ink" title="Connected accounts, brokerage line">
              <Settings2 size={13} /> Setup
            </Link>
            <Link to="/garvis/command" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-forge-dim hover:text-forge-ink" title="The rest of the platform">
              Everything else <ArrowRight size={13} />
            </Link>
            <button type="button" onClick={() => void signOut()} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-forge-dim hover:text-forge-ink" aria-label="Sign out">
              <LogOut size={13} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-24 pt-4">
        {state.kind === 'loading' && (
          <div className="flex items-center gap-2 py-16 text-sm text-forge-dim"><Loader2 size={16} className="animate-spin" /> Opening your workspace…</div>
        )}

        {state.kind === 'error' && (
          <div className="rounded-2xl border border-forge-err/30 bg-forge-err/10 p-5 text-sm">
            <p className="font-medium text-forge-ink">Couldn't reach the workspace.</p>
            <p className="mt-1 text-forge-dim">{state.message}</p>
            <p className="mt-1 text-forge-dim">This is a connection or deployment problem, not an empty workspace — if the database was never deployed with <code className="font-mono">mode=full</code>, this is where it shows.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void resolve()}>Try again</Button>
          </div>
        )}

        {state.kind === 'none' && (
          <div className="rounded-2xl border border-forge-ember/30 bg-forge-ember/5 p-6">
            <h1 className="font-display text-lg font-semibold">Set up the real-estate workspace</h1>
            <p className="mt-1 max-w-prose text-sm text-forge-dim">
              One click creates it: a campaign studio, communities and facts, posting to her accounts, the newsletter, postcards and farm lists, inquiries, results. Nothing sends without your approval.
            </p>
            <Button variant="primary" size="md" className="mt-4" onClick={() => void create()} disabled={creating}>
              {creating ? <Loader2 size={15} className="animate-spin" /> : <Building2 size={15} />}
              Set up my workspace
            </Button>
          </div>
        )}

        {state.kind === 'ready' && (
          <Ctx.Provider value={{
            worldId: state.web.worldId,
            web: state.web,
            toast,
            clusterFor: (slug) => state.web.clusters.find((c) => c.slug === slug)
              ?? state.web.clusters.find((c) => c.charter?.flavor === 'listing_campaign')
              ?? state.web.clusters[0],
            refreshBadge,
          }}>
            <Outlet />
          </Ctx.Provider>
        )}
      </main>
    </div>
  );
}

/** Small page chrome: a title and one line, then the work. */
export function ReHeading({ title, line, children }: { title: string; line: string; children?: ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 className="font-display text-lg font-semibold">{title}</h1>
        <p className="text-sm text-forge-dim">{line}</p>
      </div>
      {children}
    </div>
  );
}
