import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FolderOpen, Plus, CreditCard, Settings as SettingsIcon, Sparkles, Waypoints, Telescope, BrainCircuit, ShieldCheck, FileText, Users, CircleDollarSign, Lightbulb, Target } from 'lucide-react';
import { useProjects } from '../hooks/useProjectData';
import { NAV_SECTIONS } from '../lib/navConfig';
import { cn } from '../lib/utils';
import { Overlay } from './ui/Overlay';
import { universalSearch, routeForHit, KIND_LABEL, type SearchHit, type SearchKind } from '../lib/garvis/searchRun';

const HIT_ICON: Record<SearchKind, typeof FileText> = {
  artifact: FileText, area: Waypoints, world: Waypoints, contact: Users,
  invoice: CircleDollarSign, document: FileText, belief: Lightbulb, mission: Target,
};

interface Props { open: boolean; onClose: () => void }

export function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate();
  const { projects } = useProjects();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // global ⌘K / Ctrl+K shortcut (Escape-to-close is handled by the Overlay primitive below)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (open) onClose();
        else document.dispatchEvent(new CustomEvent('ff:open-palette'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setHits([]);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // UNIVERSAL SEARCH (design review P1, app_0053): from 3 characters the palette also searches
  // the record itself — artifacts, areas, ventures, contacts, invoices, documents, beliefs,
  // missions. Debounced; stale responses dropped; an unavailable RPC degrades to commands-only.
  const [hits, setHits] = useState<SearchHit[]>([]);
  const searchSeq = useRef(0);
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 3) {
      searchSeq.current++; // invalidate any in-flight RPC (review fix: a stale 'invoices' response
      setHits([]);         // must not repopulate hits after the query shrank or the palette closed)
      return;
    }
    const seq = ++searchSeq.current;
    const t = setTimeout(() => {
      void universalSearch(q).then((r) => { if (searchSeq.current === seq) setHits(r); });
    }, 180);
    return () => clearTimeout(t);
  }, [query, open]);

  const items = useMemo(() => {
    interface PaletteItem { id: string; label: string; icon: typeof Search; run: () => void; tag?: string }
    // Primary commands are GENERATED from the shared nav (src/lib/navConfig.ts) so the palette always
    // covers every sidebar destination and can never drift from it. Below that, a curated set of
    // muscle-memory aliases + the off-sidebar legacy rooms — searchable, clearly labeled.
    const navCommands: PaletteItem[] = NAV_SECTIONS.flatMap((s) => s.items).map((it) => ({
      id: `nav-${it.to}`, label: it.label, icon: it.icon, run: () => navigate(it.to),
    }));
    const aliases: PaletteItem[] = [
      { id: 'a-newproj', label: 'New project', icon: Plus, run: () => navigate('/new') },
      { id: 'a-approvals', label: 'Approvals → Queue', icon: ShieldCheck, run: () => navigate('/garvis/queue') },
      { id: 'a-inbox', label: 'Inbox (leads & replies) → Queue', icon: Sparkles, run: () => navigate('/garvis/queue') },
      // Memory merged Library + Mind — point the old names at the tabbed room, not the pre-merge pages.
      { id: 'a-library', label: 'Library → Memory', icon: BrainCircuit, run: () => navigate('/garvis/memory?tab=library') },
      { id: 'a-mind', label: 'Mind → Memory', icon: BrainCircuit, run: () => navigate('/garvis/memory?tab=mind') },
      { id: 'a-galaxy-flat', label: 'Galaxy (2D map)', icon: Telescope, run: () => navigate('/garvis/universe?mode=flat') },
      { id: 'a-explore', label: 'Explore (rabbitholes)', icon: Search, run: () => navigate('/garvis/explore') },
      { id: 'a-health', label: 'Health (system status)', icon: ShieldCheck, run: () => navigate('/garvis/health') },
      { id: 'a-studios', label: 'Studios → Workshops', icon: Sparkles, run: () => navigate('/garvis/workshops') },
      { id: 'a-control', label: 'Mission Control — activity (legacy)', icon: ShieldCheck, run: () => navigate('/garvis/control') },
      { id: 'a-overview', label: 'Portfolio overview (legacy)', icon: Waypoints, run: () => navigate('/garvis') },
      // Keep old search terms findable even though the nav labels changed (muscle memory: "universe", "brain").
      { id: 'a-universe', label: 'Universe (3D worlds) → Galaxy', icon: Telescope, run: () => navigate('/garvis/universe') },
      { id: 'a-brain', label: 'Brain → Memory (library)', icon: BrainCircuit, run: () => navigate('/garvis/memory?tab=library') },
      { id: 'a-missions', label: 'Missions (legacy)', icon: Sparkles, run: () => navigate('/garvis/missions') },
      { id: 'a-marketing', label: 'Marketing (legacy)', icon: Waypoints, run: () => navigate('/garvis/marketing') },
      { id: 'a-opps', label: 'Opportunities (legacy)', icon: Search, run: () => navigate('/garvis/opportunities') },
    ];
    const commands: PaletteItem[] = [...navCommands, ...aliases];
    const projectItems: PaletteItem[] = projects.map((p) => ({
      id: p.id,
      label: p.name,
      icon: FolderOpen,
      run: () => navigate(`/project/${p.id}`),
    }));
    // Content hits from the record ride below matching commands — labeled by kind so "INV-0007"
    // and the invoice page are distinguishable at a glance.
    const hitItems: PaletteItem[] = hits.map((h) => ({
      id: `hit-${h.kind}-${h.id}`,
      label: `${h.title}${h.snippet ? ` — ${h.snippet.slice(0, 60)}` : ''}`,
      tag: KIND_LABEL[h.kind],
      icon: HIT_ICON[h.kind],
      run: () => navigate(routeForHit(h)),
    }));
    const all = [...commands, ...projectItems];
    // On open (no query), always show navigation commands first + a few recent projects — not a wall
    // of project names with no commands visible.
    if (!query.trim()) return [...commands.slice(0, 6), ...projectItems.slice(0, 3)];
    const q = query.toLowerCase();
    return [...all.filter((i) => i.label.toLowerCase().includes(q)).slice(0, 6), ...hitItems.slice(0, 8)];
  }, [projects, query, navigate, hits]);

  if (!open) return null;

  const select = (i: number) => {
    items[i]?.run();
    onClose();
  };

  return (
    <Overlay onClose={onClose} placement="top" z={90}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-forge-border bg-forge-panel shadow-2xl"
        role="dialog"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-2 border-b border-forge-border px-4 py-3">
          <Search size={16} className="text-forge-dim" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === 'Enter') select(active);
            }}
            placeholder="Search everything — pages, projects, artifacts, contacts, invoices…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-forge-dim/70"
            aria-label="Search everything or run a command"
          />
          <kbd className="rounded border border-forge-border px-1.5 py-0.5 font-mono text-[10px] text-forge-dim">esc</kbd>
        </div>
        <ul className="max-h-72 overflow-y-auto panel-scroll py-1">
          {items.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-forge-dim">Nothing matches “{query}”. Try a project name.</li>
          )}
          {items.map((item, i) => (
            <li key={item.id}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => select(i)}
                className={cn(
                  'flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm',
                  i === active ? 'bg-forge-raised text-forge-ink' : 'text-forge-dim',
                )}
              >
                <item.icon size={15} className={cn('shrink-0', i === active && 'text-forge-ember')} />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {'tag' in item && item.tag && (
                  <span className="ml-auto shrink-0 rounded border border-forge-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-forge-dim">{item.tag}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Overlay>
  );
}
