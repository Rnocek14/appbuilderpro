// src/components/garvis/canvas/ContentWeekToggle.tsx
// THE PRODUCER TOGGLE (level-10 Spec 2): flip it on and every Monday the worker stages ONE judged
// week of content — posts (+ optionally an email) — as ONE approval card in the Queue. This panel
// is also the review surface: the latest staged week expands here with every piece's judge score
// and notes, inline editing (which re-binds the pending approval's hash AND resets the clean
// streak — an edited week isn't a clean one), and the graduated-autonomy chip that appears ONLY
// once 3 consecutive weeks were approved without edits. Auto mode is always visibly on, and
// turning the order off (or rejecting a week) kills it.

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Loader2 } from 'lucide-react';
import {
  createContentWeekOrder, listContentWeeks, editContentWeekPiece, cancelContentWeek,
  setContentWeekAutoMode, contentWeekOrderState, type ContentWeekRow, type WeekPiece,
} from '../../../lib/garvis/contentWeekRun';
import { setOrderStatus, runOrderNow } from '../../../lib/garvis/standingRun';
import { cn } from '../../../lib/utils';

type Toast = (k: 'success' | 'error' | 'info', m: string) => void;

const DEFAULT_CONFIG = {
  platforms: ['facebook', 'linkedin'], postsPerWeek: 4,
  emailSegment: 'customer' as const, sendHourUtc: 16, minScore: 8,
};

export function ContentWeekToggle({ worldId, onToast }: { worldId: string; onToast: Toast }) {
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<Awaited<ReturnType<typeof contentWeekOrderState>>>(null);
  const [weeks, setWeeks] = useState<ContentWeekRow[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [o, w] = await Promise.all([contentWeekOrderState(worldId), listContentWeeks(worldId, 2)]);
      setOrder(o); setWeeks(w);
    } catch { /* panel is additive */ }
    finally { setLoading(false); }
  }, [worldId]);
  useEffect(() => { void refresh(); }, [refresh]);

  const act = async (fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(true);
    try { await fn(); if (okMsg) onToast('success', okMsg); await refresh(); }
    catch (e) { onToast('error', e instanceof Error ? e.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  };

  if (loading) return null;
  const on = order?.status === 'active';
  const latest = weeks.find((w) => w.status === 'staged') ?? weeks[0] ?? null;

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-wide text-forge-dim">
          <CalendarDays size={11} /> Content week
        </span>
        <button disabled={busy} className={cn('cb-chip', !on && 'cb-chip-on')}
          onClick={() => { if (order && on) void act(() => setOrderStatus(order.orderId, 'paused'), undefined); }}>
          off
        </button>
        <button disabled={busy} className={cn('cb-chip', on && 'cb-chip-on')}
          title="Every Monday: a judged week of posts (+ email) staged as ONE approval in your Queue."
          onClick={() => {
            if (order) void act(() => setOrderStatus(order.orderId, 'active'), 'Content week on — the next week stages on the clock.');
            else void act(() => createContentWeekOrder({ worldId, config: DEFAULT_CONFIG }),
              'Content week on — the first week stages within ~15 minutes (needs the heartbeat + an AI key). It lands as ONE approval in your Queue.');
          }}>
          weekly
        </button>
        {order && on && (
          <button disabled={busy} className="cb-chip" title="Stage this week's content now instead of waiting for the clock."
            onClick={() => void act(async () => {
              const r = await runOrderNow(order.orderId);
              if (r.failed > 0) throw new Error('The run failed — check the AI key and credits.');
            }, 'Staging — check the Queue in a moment, then refresh here to review.')}>
            stage now
          </button>
        )}
        {order && order.autoMode ? (
          <button disabled={busy} className="cb-chip cb-chip-on" title="Weeks auto-queue (still capped, still in the Queue and the ledger). Click to revoke."
            onClick={() => void act(() => setContentWeekAutoMode(order.orderId, false), 'Auto mode OFF — weeks wait for your approval again.')}>
            ⚡ auto ON — click to revoke
          </button>
        ) : order && order.cleanApprovals >= 3 ? (
          <button disabled={busy} className="cb-chip" title="Earned: 3 consecutive weeks approved without edits. Auto-queued weeks stay visible, capped, and killable."
            onClick={() => void act(() => setContentWeekAutoMode(order.orderId, true), 'Auto mode ON — weeks queue themselves. Pause or reject anything to revoke.')}>
            ✨ {order.cleanApprovals} clean weeks — enable auto?
          </button>
        ) : order && on ? (
          <span className="text-[10px] text-forge-dim">{order.cleanApprovals}/3 clean weeks toward auto</span>
        ) : null}
        {latest && (
          <button className="cb-chip" onClick={() => setOpen((o) => !o)}>
            {open ? 'hide' : 'review'} week of {latest.week_start}
          </button>
        )}
      </div>

      {open && latest && (
        <div className="mt-2 space-y-2 rounded-lg border border-forge-border bg-forge-panel/50 p-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-forge-dim">
              Week of {latest.week_start} — {latest.status}
              {latest.edited && ' · edited (this week won’t count toward the clean streak)'}
            </span>
            {latest.status === 'staged' && (
              <button disabled={busy} className="text-[11px] text-forge-dim hover:text-forge-err"
                onClick={() => void act(() => cancelContentWeek(latest.id), 'Week canceled — nothing from it will queue.')}>
                cancel week
              </button>
            )}
          </div>
          {(latest.pieces ?? []).map((p: WeekPiece) => (
            <div key={p.id} className="rounded-lg border border-forge-border/60 p-2">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="rounded border border-forge-ok/40 px-1 py-px text-forge-ok">{p.quality?.score ?? '?'}/10</span>
                <span className="text-forge-ink">{p.channel === 'social' ? p.platform : `email${p.segment ? ` → ${p.segment}` : ''}`}</span>
                <span className="text-forge-dim">{new Date(p.scheduled_for).toLocaleString()}</span>
                <span className={cn('ml-auto uppercase tracking-wide',
                  p.state === 'queued' ? 'text-forge-ok' : p.state === 'skipped' ? 'text-forge-warn' : 'text-forge-dim')}>
                  {p.state}{p.reason ? ` — ${p.reason}` : ''}
                </span>
              </div>
              {editId === p.id ? (
                <div className="mt-1.5 space-y-1.5">
                  <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4}
                    className="w-full rounded-lg border border-forge-border bg-forge-bg px-2 py-1.5 text-[11px] text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
                  <div className="flex gap-2 text-[11px]">
                    <button disabled={busy} className="text-forge-ember hover:underline"
                      onClick={() => void act(() => editContentWeekPiece(latest.id, p.id,
                        p.channel === 'social' ? { caption: draft } : { body: draft },
                      ), 'Saved — the approval now covers your edited words (and this week resets the clean streak).').then(() => setEditId(null))}>
                      save
                    </button>
                    <button className="text-forge-dim hover:text-forge-ink" onClick={() => setEditId(null)}>cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="mt-1 whitespace-pre-wrap text-[11px] text-forge-ink/85">
                    {p.channel === 'social' ? p.caption : `${p.subject}\n\n${p.body}`}
                  </p>
                  {p.quality?.notes && p.quality.notes !== 'ship it' && (
                    <p className="mt-1 text-[10px] italic text-forge-dim">editor: {p.quality.notes}</p>
                  )}
                  {latest.status === 'staged' && p.state === 'staged' && (
                    <button className="mt-1 text-[11px] text-forge-ember hover:underline"
                      onClick={() => { setEditId(p.id); setDraft(p.channel === 'social' ? (p.caption ?? '') : (p.body ?? '')); }}>
                      edit
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
          <p className="text-[10px] text-forge-dim/80">
            Approve or reject the week in your <span className="text-forge-ink">Queue</span> — nothing posts or sends until then.
            Discarded drafts (below the {DEFAULT_CONFIG.minScore}/10 bar) keep their scores on the record.
          </p>
        </div>
      )}
    </div>
  );
}
