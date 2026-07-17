// src/components/garvis/BatchSendCard.tsx
// Bulk send-to-segment: the "monthly newsletter is 200 clicks" fix. Compose once, see the HONEST
// reachable count (exclusions named), queue ONE approval — after you approve it in the Queue, the
// clock drains it under your daily cap, and every recipient still re-checks suppression at send
// time. Only {{name}} / {{first_name}} merge; anything else refuses at compose, never sends broken.

import { useEffect, useState } from 'react';
import { Send, Loader2, XCircle } from 'lucide-react';
import {
  createBatch, listBatches, cancelBatch, segmentCount, batchLine, batchStatsFor,
  type BatchSegment, type BatchRow,
} from '../../lib/garvis/outreachBatchRun';
import { batchStatsLine, type BatchEventCounts } from '../../lib/garvis/outreachBatch';
import { cn } from '../../lib/utils';
import { Button } from '../ui';

const SEGMENTS: { id: BatchSegment; label: string }[] = [
  { id: 'all', label: 'Everyone' },
  { id: 'new', label: 'New' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'qualified', label: 'Qualified' },
  { id: 'customer', label: 'Customers' },
];

export function BatchSendCard({ onToast }: { onToast: (k: 'success' | 'error' | 'info', m: string) => void }) {
  const [segment, setSegment] = useState<BatchSegment>('all');
  const [count, setCount] = useState<number | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [stats, setStats] = useState<Map<string, BatchEventCounts>>(new Map());

  useEffect(() => {
    let live = true;
    void segmentCount(segment).then((c) => { if (live) setCount(c); }).catch(() => setCount(null));
    return () => { live = false; };
  }, [segment]);

  useEffect(() => {
    let live = true;
    void listBatches().then(async (b) => {
      if (!live) return;
      setBatches(b);
      // Engagement from the app_0081 events substrate — honest counts, arriving as Resend reports.
      const st = await batchStatsFor(b.map((x) => x.id)).catch(() => new Map<string, BatchEventCounts>());
      if (live) setStats(st);
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  const doCreate = async () => {
    try {
      setBusy(true);
      const res = await createBatch({ segment, subject, body });
      const exNote = res.excluded.length > 0 ? ` (${res.excluded.length} excluded: ${res.excluded[0].reason}${res.excluded.length > 1 ? ', …' : ''})` : '';
      const capNote = res.truncatedFrom ? ` This batch covers the first ${res.queued} of ${res.truncatedFrom} — queue another for the rest.` : '';
      onToast(res.truncatedFrom ? 'info' : 'success', `Batch queued: ${res.queued} recipients${exNote}. Approve it in the Queue — then the clock drains it under your daily cap.${capNote}`);
      setSubject(''); setBody('');
      setBatches(await listBatches());
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not create the batch.'); }
    finally { setBusy(false); }
  };

  const doCancel = async (b: BatchRow) => {
    try { await cancelBatch(b.id); setBatches(await listBatches()); onToast('info', 'Batch canceled — pending recipients will not send.'); }
    catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not cancel.'); }
  };

  return (
    <div className="mt-6 rounded-2xl border border-forge-border bg-forge-panel/40 p-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-forge-ink">
        <Send size={14} className="text-forge-ember" /> Send to a segment
      </h3>
      <p className="mt-0.5 text-[11px] text-forge-dim">
        One approval covers the whole batch; the clock drains it under your daily cap and every recipient
        still re-checks your suppression list at send time. {'{{name}}'} and {'{{first_name}}'} merge.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {SEGMENTS.map((s) => (
          <button key={s.id} onClick={() => setSegment(s.id)}
            className={cn('rounded-lg border px-2.5 py-1 text-xs', segment === s.id ? 'border-forge-ember/60 bg-forge-ember/10 text-forge-ink' : 'border-forge-border text-forge-dim hover:text-forge-ink')}>
            {s.label}
          </button>
        ))}
        <span className="text-[11px] text-forge-dim">{count == null ? '' : `${count} contact${count === 1 ? '' : 's'} in segment`}</span>
      </div>

      <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject — e.g. Your Lake Geneva market update, {{first_name}}"
        className="mt-2 w-full rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder={'Hi {{first_name}},\n\n…'}
        className="mt-2 w-full rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none" />
      <Button variant='primary' size='sm' onClick={() => void doCreate()} disabled={busy || !subject.trim() || !body.trim()}
        className="mt-2">
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Queue batch for approval
      </Button>

      {batches.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-forge-border pt-2">
          {batches.slice(0, 5).map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="min-w-0 truncate text-forge-ink/80">{b.subject}</span>
              <span className="shrink-0 text-forge-dim">{batchLine(b)}{(() => {
                const c = stats.get(b.id);
                const line = c ? batchStatsLine(c) : '';
                return line ? <span className="text-forge-heat"> · {line}</span> : null;
              })()}</span>
              {(b.status === 'queued' || b.status === 'draining') && (
                <button onClick={() => void doCancel(b)} title="Cancel batch" className="shrink-0 text-forge-dim hover:text-forge-warn"><XCircle size={12} /></button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
