// src/components/garvis/FollowUpPanel.tsx
// The follow-through surface: Garvis revisiting the commitments you accepted (active goals), telling
// you how long each has been open and what's changed since, and asking you to resolve it. Done →
// the goal is achieved; Dropped → abandoned; Log outcome → a remembered outcome that feeds the next
// recommendation. This is the return arc that turns advice into accountability.

import { useState } from 'react';
import { CircleDot, Check, X, PenLine, Clock } from 'lucide-react';
import { Badge, Button, Card } from '../ui';
import { buildCheckInLine } from '../../lib/garvis/followup';
import type { OpenLoop } from '../../lib/garvis/followup';

interface Props {
  loops: OpenLoop[];
  onDone: (loop: OpenLoop) => Promise<void> | void;
  onDrop: (loop: OpenLoop) => Promise<void> | void;
  onLogOutcome: (loop: OpenLoop, text: string) => Promise<void> | void;
}

export function FollowUpPanel({ loops, onDone, onDrop, onLogOutcome }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loggingId, setLoggingId] = useState<string | null>(null);
  const [text, setText] = useState('');

  if (loops.length === 0) return null;
  const staleCount = loops.filter((l) => l.stale).length;

  const run = async (loop: OpenLoop, fn: () => Promise<void> | void) => {
    setBusyId(loop.goalId);
    try { await fn(); } finally { setBusyId(null); }
  };

  const submitOutcome = async (loop: OpenLoop) => {
    if (!text.trim()) return;
    await run(loop, () => onLogOutcome(loop, text.trim()));
    setLoggingId(null);
    setText('');
  };

  return (
    <Card className="mb-6 border-forge-ember/40 p-4">
      <div className="mb-2 flex items-center gap-2">
        <CircleDot size={16} className="text-forge-ember" />
        <h2 className="font-display text-sm font-semibold">Open loops</h2>
        <Badge tone="dim">{loops.length}</Badge>
        {staleCount > 0 && <Badge tone="warn">{staleCount} need a check-in</Badge>}
        <span className="ml-auto text-[11px] text-forge-dim/70">What you committed to — did it happen?</span>
      </div>

      <div className="space-y-2">
        {loops.map((loop) => (
          <div key={loop.goalId} className={`rounded border p-3 ${loop.stale ? 'border-forge-ember/40 bg-forge-ember/5' : 'border-forge-border'}`}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-forge-ink">{loop.title}</span>
                  {loop.appName && <Badge tone="dim">{loop.appName}</Badge>}
                  {loop.stale && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-forge-ember"><Clock size={10} /> long-open, no progress</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-forge-dim">{buildCheckInLine(loop)}</p>
                {loop.targetDate && <p className="mt-0.5 text-[10px] text-forge-dim/60">target {loop.targetDate}</p>}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" onClick={() => run(loop, () => onDone(loop))} loading={busyId === loop.goalId} title="Done — mark the goal achieved"><Check size={14} /></Button>
                <Button variant="ghost" onClick={() => setLoggingId(loggingId === loop.goalId ? null : loop.goalId)} title="Log what happened"><PenLine size={14} /></Button>
                <Button variant="ghost" onClick={() => run(loop, () => onDrop(loop))} loading={busyId === loop.goalId} title="Dropped — abandon this goal"><X size={14} /></Button>
              </div>
            </div>

            {loggingId === loop.goalId && (
              <div className="mt-2 animate-fadeInUp">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={2}
                  placeholder="What happened? (the outcome — feeds Garvis's next recommendation)"
                  className="w-full rounded border border-forge-border bg-forge-panel p-2 text-xs text-forge-ink focus:border-forge-ember focus:outline-none"
                />
                <div className="mt-1 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => { setLoggingId(null); setText(''); }}>Cancel</Button>
                  <Button onClick={() => submitOutcome(loop)} loading={busyId === loop.goalId} disabled={!text.trim()}>Save outcome</Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
