// src/components/ConciergeDock.tsx
// THE CONCIERGE — the corner agent on every page: say what you want ("lets work on moms
// postcard", "start a clothing brand") and it takes you there, then stays open walking you
// through the steps. Known asks resolve instantly through the verified pure core (concierge.ts)
// — no AI round-trip, no cost; ambiguous asks get honest suggestions; free-form falls through to
// Garvis on Home. Creation is never silent: create-tasks prefill the existing genesis flow where
// making the thing stays an explicit "Draft the web" press.
// State survives navigation via sessionStorage because AppShell remounts per page.

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, MessageCircle, Sparkles, X } from 'lucide-react';
import { resolve, CONCIERGE_TASKS, type ConciergeTask, type ConciergeWorld } from '../lib/garvis/concierge';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

const OPEN_KEY = 'ff:concierge-open';
const TASK_KEY = 'ff:concierge-task';
export const GENESIS_PREFILL_KEY = 'ff:genesis-intent';

interface ActiveGuide { taskId: string; done: number[] }

export function ConciergeDock() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(() => sessionStorage.getItem(OPEN_KEY) === '1');
  const [input, setInput] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<ConciergeTask[]>([]);
  const [pendingCreate, setPendingCreate] = useState<ConciergeTask | null>(null);
  const [guide, setGuide] = useState<ActiveGuide | null>(() => {
    try { return JSON.parse(sessionStorage.getItem(TASK_KEY) || 'null') as ActiveGuide | null; } catch { return null; }
  });
  const worldsRef = useRef<ConciergeWorld[] | null>(null);

  useEffect(() => { sessionStorage.setItem(OPEN_KEY, open ? '1' : '0'); }, [open]);
  useEffect(() => {
    try { sessionStorage.setItem(TASK_KEY, JSON.stringify(guide)); } catch { /* session-only */ }
  }, [guide]);

  const loadWorlds = async (): Promise<ConciergeWorld[]> => {
    if (worldsRef.current) return worldsRef.current;
    const { data } = await supabase.from('knowledge_clusters')
      .select('slug, world_id, knowledge_worlds!inner(id, title)').limit(200);
    const byWorld = new Map<string, ConciergeWorld>();
    for (const c of (data ?? []) as unknown as { slug: string; world_id: string; knowledge_worlds: { id: string; title: string } }[]) {
      if (!c.world_id) continue;
      const w = byWorld.get(c.world_id) ?? { id: c.world_id, title: c.knowledge_worlds?.title ?? '', slugs: [] };
      w.slugs.push(c.slug);
      byWorld.set(c.world_id, w);
    }
    worldsRef.current = [...byWorld.values()];
    return worldsRef.current;
  };

  // Persist SYNCHRONOUSLY before navigating: the route change unmounts this dock (AppShell is
  // per-page) before any effect could run — an effect-based save loses the guide every time.
  const startGuide = (taskId: string) => {
    const g: ActiveGuide = { taskId, done: [] };
    try { sessionStorage.setItem(TASK_KEY, JSON.stringify(g)); sessionStorage.setItem(OPEN_KEY, '1'); } catch { /* fine */ }
    setGuide(g);
  };

  const act = (task: ConciergeTask, route: string, missingWorld?: boolean) => {
    setSuggestions([]);
    if (task.kind === 'create') {
      // Creation is confirmed, never silent — show the one-tap confirm.
      setPendingCreate(task);
      setNote(null);
      return;
    }
    startGuide(task.id);
    setNote(missingWorld ? `That business doesn't exist yet — pick or create it here, then say it again.` : null);
    navigate(route);
  };

  const confirmCreate = (task: ConciergeTask) => {
    if (task.genesisIntent) { try { sessionStorage.setItem(GENESIS_PREFILL_KEY, task.genesisIntent); } catch { /* fine */ } }
    setPendingCreate(null);
    startGuide(task.id);
    navigate(task.route);
  };

  const submit = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    setPendingCreate(null);
    const worlds = await loadWorlds().catch(() => [] as ConciergeWorld[]);
    const r = resolve(text, worlds);
    if (r.kind === 'go' && r.task && r.route) { act(r.task, r.route, r.missingWorld); return; }
    if (r.kind === 'suggest' && r.suggestions?.length) {
      setSuggestions(r.suggestions);
      setNote('Closest matches — tap one:');
      return;
    }
    setGuide(null);
    setSuggestions([]);
    setNote("I don't have a shortcut for that — Garvis on Home handles anything free-form.");
  };

  const task = guide ? CONCIERGE_TASKS.find((t) => t.id === guide.taskId) ?? null : null;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} aria-label="Open the concierge — say what you want to do"
        className="fixed bottom-4 right-4 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-forge-ember/50 bg-forge-panel text-forge-ember shadow-lg transition-transform hover:scale-105">
        <MessageCircle size={19} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border border-forge-border bg-forge-panel p-3 shadow-2xl">
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-forge-ember" />
        <p className="text-xs font-semibold text-forge-ink">Say what you want to do</p>
        <button onClick={() => { setOpen(false); }} aria-label="Close the concierge"
          className="ml-auto rounded p-1 text-forge-dim hover:text-forge-ink"><X size={14} /></button>
      </div>

      <div className="mt-2 flex gap-1.5">
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
          placeholder={'"moms postcard" · "start a clothing brand" · "what\'s waiting on me"'}
          className="min-w-0 flex-1 rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none" />
        <button onClick={() => void submit()} aria-label="Go"
          className="rounded-lg border border-forge-ember/50 px-2.5 text-forge-ember hover:bg-forge-ember/10"><ArrowRight size={14} /></button>
      </div>

      {note && <p className="mt-2 text-[11px] text-forge-dim">{note}</p>}

      {suggestions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button key={s.id} onClick={() => { const w = worldsRef.current ?? []; const r = resolve(s.keywords[0], w, [s]); act(s, r.route ?? s.route, r.missingWorld); }}
              className="rounded-lg border border-forge-border px-2 py-1 text-[11px] text-forge-dim hover:border-forge-ember/40 hover:text-forge-ink">
              {s.label}
            </button>
          ))}
        </div>
      )}

      {pendingCreate && (
        <div className="mt-2 rounded-xl border border-forge-border bg-forge-bg/60 p-2.5">
          <p className="text-[11px] text-forge-ink">{pendingCreate.label}</p>
          <p className="mt-0.5 text-[11px] text-forge-dim">Nothing is created yet — this fills in the start for you; you press "Draft the web" when it reads right.</p>
          <button onClick={() => confirmCreate(pendingCreate)}
            className="mt-1.5 rounded-lg border border-forge-ember/50 px-2.5 py-1 text-[11px] text-forge-ember hover:bg-forge-ember/10">
            Set it up →
          </button>
        </div>
      )}

      {task && (
        <div className="mt-2 rounded-xl border border-forge-border bg-forge-bg/60 p-2.5">
          <div className="flex items-center gap-1.5">
            <p className="text-[11px] font-semibold text-forge-ink">{task.label}</p>
            <button onClick={() => setGuide(null)} aria-label="Dismiss these steps"
              className="ml-auto rounded p-0.5 text-forge-dim hover:text-forge-ink"><X size={12} /></button>
          </div>
          <ol className="mt-1 space-y-1">
            {task.steps.map((s, i) => {
              const done = guide!.done.includes(i);
              return (
                <li key={i}>
                  <button onClick={() => setGuide({ taskId: task.id, done: done ? guide!.done.filter((d) => d !== i) : [...guide!.done, i] })}
                    className="flex w-full items-start gap-1.5 text-left text-[11px]">
                    <span className={cn('mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border', done ? 'border-forge-ok/60 text-forge-ok' : 'border-forge-border text-transparent')}>
                      <Check size={9} />
                    </span>
                    <span className={cn(done ? 'text-forge-dim line-through' : 'text-forge-dim')}>{i + 1}. {s}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
