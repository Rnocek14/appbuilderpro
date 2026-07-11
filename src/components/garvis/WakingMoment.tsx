// src/components/garvis/WakingMoment.tsx
// Garvis speaks first. The front door of the product: a time-aware greeting, "while you were away"
// lines drawn from the append-only record, and at most THREE next moves — each answering "why
// should I care?" with evidence from rows (No-Theater rules: every line maps to real state; the
// stagger animation is allowed because the lines ARE real events arriving; motion = news).

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ChevronRight, X } from 'lucide-react';
import { cn, timeAgo } from '../../lib/utils';
import { loadWakingDigest, dismissMove, markSeen, type WakingDigest } from '../../lib/garvis/nextMoveRun';
import type { NextMove } from '../../lib/garvis/nextMove';

const KIND_DOT: Record<NextMove['kind'], string> = {
  lead_waiting: 'bg-forge-ok',
  reply_unanswered: 'bg-forge-ok',
  approval_waiting: 'bg-forge-warn',
  followup_staged: 'bg-forge-ember',
  natural_next: 'bg-forge-ember',
  blocking_empty: 'bg-forge-warn',
  insight_connection: 'bg-[#B98CE0]',
  reflection_due: 'bg-[#B98CE0]',
  intel_stale: 'bg-forge-warn',
  draft_waiting: 'bg-forge-ember',
};

export function WakingMoment({ name }: { name: string }) {
  const navigate = useNavigate();
  const [digest, setDigest] = useState<WakingDigest | null>(null);
  const [showAll, setShowAll] = useState(false);
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    let live = true;
    loadWakingDigest(name)
      .then((d) => { if (live) { setDigest(d); markSeen(); } })
      .catch(() => { /* the front door never blocks the room — chat renders regardless */ });
    return () => { live = false; };
  }, [name]);

  const dismiss = useCallback((key: string) => {
    dismissMove(key);
    setDigest((d) => (d ? { ...d, moves: d.moves.filter((m) => m.key !== key) } : d));
  }, []);

  if (!digest) return null; // loading (or load failed) — the chat never waits on the front door
  const { greeting, awayLines, moves } = digest;
  // A quiet morning is a FACT worth stating, not a reason to vanish: zero moves means zero
  // replies waiting, nothing blocked, nothing new — say so instead of rendering nothing.
  const quiet = !awayLines.length && !moves.length;

  const shown = showAll ? moves : moves.slice(0, 3);

  return (
    <div className="mb-4 rounded-2xl border border-forge-border bg-forge-panel/60 p-5">
      <p className="font-display text-lg font-semibold text-forge-ink">{greeting}</p>

      {quiet && (
        <p className="mt-1 text-sm text-forge-dim">
          All quiet — no replies waiting, nothing blocked, nothing new since you last looked.{' '}
          <button onClick={() => navigate('/garvis/webs')} className="text-forge-ember hover:underline">Open your webs</button>
          {' '}to push something forward.
        </p>
      )}

      {awayLines.length > 0 && (
        <div className="mt-1">
          <p className="text-xs text-forge-dim">While you were away —</p>
          <div className="mt-1.5 space-y-1">
            {awayLines.map((l, i) => (
              <p
                key={`${l.occurredAt}-${i}`}
                className={cn('flex items-baseline gap-2 text-[13px] text-forge-ink', !reduced && 'animate-fadeInUp')}
                style={reduced ? undefined : { animationDelay: `${200 + i * 380}ms` }}
              >
                <span className="text-forge-ember">·</span>
                <span className="flex-1">{l.text}</span>
                <span className="shrink-0 text-[10px] text-forge-dim/60">{timeAgo(l.occurredAt)}</span>
              </p>
            ))}
          </div>
        </div>
      )}

      {shown.length > 0 && (
        <div className="mt-4 space-y-2">
          {shown.map((m) => (
            <div key={m.key} className="flex items-start gap-3 rounded-xl border border-forge-border bg-forge-panel/70 px-3.5 py-2.5">
              <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', KIND_DOT[m.kind])} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-forge-ink">{m.title}</p>
                <p className="mt-0.5 text-xs text-forge-dim">{m.why}</p>
                {m.expected && (
                  <p className="mt-1 flex items-baseline gap-1.5 text-[11px] text-forge-dim/80">
                    <span
                      title={m.expected.basis === 'measured' ? 'From your own data' : m.expected.basis === 'heuristic' ? 'Domain knowledge, not your data yet' : 'Follows from how things are wired'}
                      className={cn(
                        'rounded border px-1 py-px font-mono text-[8.5px] uppercase tracking-wide',
                        m.expected.basis === 'measured' ? 'border-forge-ok/40 text-forge-ok' : 'border-forge-border text-forge-dim/70',
                      )}
                    >{m.expected.basis}</span>
                    {m.expected.text}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={() => navigate(m.action.route)}
                  className="flex items-center gap-1 rounded-lg border border-forge-ember/50 bg-forge-ember/10 px-2.5 py-1.5 text-xs font-medium text-forge-ember transition-colors hover:bg-forge-ember/20"
                >
                  {m.action.label} <ChevronRight size={12} />
                </button>
                <button onClick={() => dismiss(m.key)} title="Not now (quiet for a week)" className="p-1 text-forge-dim/60 hover:text-forge-dim">
                  <X size={13} />
                </button>
              </div>
            </div>
          ))}
          {moves.length > 3 && !showAll && (
            <button onClick={() => setShowAll(true)} className="flex items-center gap-1 text-xs text-forge-dim hover:text-forge-ink">
              <Sparkles size={12} className="text-forge-ember" /> see all ({moves.length}) — the cap limits emphasis, never access
            </button>
          )}
        </div>
      )}
    </div>
  );
}
