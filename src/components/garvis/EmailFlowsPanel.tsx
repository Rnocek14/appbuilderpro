// src/components/garvis/EmailFlowsPanel.tsx
// EMAIL FLOWS (SW10.7) — behavioral segments + 2-3 step drips, managed here, executed by the
// clock. Zero-input value: the panel opens on the live flows and their honest stats; creating a
// flow previews its segment against REAL events before anything activates. Every send a flow
// stages is ONE send_batch approval in the Queue — nothing mails on activation alone.

import { useEffect, useState } from 'react';
import { Loader2, Play, Pause, Plus } from 'lucide-react';
import {
  listFlows, createFlow, setFlowStatus, previewSegment, flowStats,
  type FlowRow, type FlowStats,
} from '../../lib/garvis/emailFlowsRun';
import { MAX_DRIP_STEPS, type BehavioralRule, type DripStep } from '../../lib/garvis/emailFlows';
import { Button } from '../ui';

type Toast = (k: 'success' | 'error' | 'info', m: string) => void;

const RULES: { id: BehavioralRule['kind']; label: string }[] = [
  { id: 'opened_no_reply', label: 'Opened but never replied' },
  { id: 'clicked', label: 'Clicked a link' },
  { id: 'no_open', label: 'Delivered but never opened' },
  { id: 'replied', label: 'Replied' },
];

const blankStep = (): DripStep => ({ subject: '', body: '', delayDays: 3 });

export function EmailFlowsPanel({ worldId, onToast }: { worldId: string; onToast: Toast }) {
  const [flows, setFlows] = useState<FlowRow[] | null>(null);
  const [stats, setStats] = useState<Record<string, FlowStats>>({});
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [ruleKind, setRuleKind] = useState<BehavioralRule['kind']>('opened_no_reply');
  const [sinceDays, setSinceDays] = useState('14');
  const [steps, setSteps] = useState<DripStep[]>([{ ...blankStep(), delayDays: 0 }, blankStep()]);
  const [preview, setPreview] = useState<number | null>(null);

  const reload = async () => {
    try {
      const rows = await listFlows(worldId);
      setFlows(rows);
      const s: Record<string, FlowStats> = {};
      for (const f of rows.slice(0, 8)) { try { s[f.id] = await flowStats(f.id); } catch { /* stats are an upgrade */ } }
      setStats(s);
    } catch { setFlows([]); }
  };
  useEffect(() => { void reload(); }, [worldId]); // eslint-disable-line react-hooks/exhaustive-deps

  const rule = (): BehavioralRule => ({ kind: ruleKind, sinceDays: parseInt(sinceDays, 10) || 14 });
  const doPreview = async () => {
    setBusy(true);
    try { setPreview((await previewSegment(rule())).contacts); }
    catch (e) { onToast('error', e instanceof Error ? e.message : 'Preview failed.'); }
    finally { setBusy(false); }
  };
  const doCreate = async () => {
    setBusy(true);
    try {
      await createFlow({ worldId, name, rule: rule(), steps });
      onToast('success', 'Flow created (paused). Activate it when the steps read right — every send still goes through your Queue.');
      setCreating(false); setName(''); setPreview(null);
      setSteps([{ ...blankStep(), delayDays: 0 }, blankStep()]);
      await reload();
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not create the flow.'); }
    finally { setBusy(false); }
  };
  const toggle = async (f: FlowRow) => {
    try {
      await setFlowStatus(f.id, f.status === 'active' ? 'paused' : 'active');
      onToast('info', f.status === 'active' ? 'Paused — nothing new stages.' : 'Active — the clock enrolls from real events; each step lands in your Queue.');
      await reload();
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not update the flow.'); }
  };

  if (flows === null) return <div className="grid min-h-[200px] place-items-center"><Loader2 size={18} className="animate-spin text-forge-ember" /></div>;

  const field = 'w-full rounded-md border border-forge-border bg-forge-bg px-2 py-1.5 text-[12.5px] text-forge-ink focus:border-forge-ember/60 focus:outline-none';

  return (
    <div className="space-y-3">
      {flows.length === 0 && !creating && (
        <p className="text-xs text-forge-dim">
          No flows yet. A flow watches your REAL email events (opens, clicks, replies), enrolls matching contacts,
          and drips 2-3 follow-ups — each one an approval in your Queue, and any reply ends that contact's drip.
        </p>
      )}
      {flows.map((f) => {
        const s = stats[f.id];
        return (
          <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-forge-border bg-forge-panel/40 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-forge-ink">{f.name}</div>
              <div className="text-[11px] text-forge-dim">
                {RULES.find((r) => r.id === f.segment_rule.kind)?.label ?? f.segment_rule.kind} · last {f.segment_rule.sinceDays}d · {f.steps.length} steps
                {s ? ` · ${s.members} enrolled · ${s.staged} step-send(s) staged · ${s.replied} replied (drip ended)` : ''}
              </div>
            </div>
            <Button size="sm" variant={f.status === 'active' ? 'outline' : 'primary'} onClick={() => void toggle(f)}>
              {f.status === 'active' ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Activate</>}
            </Button>
          </div>
        );
      })}

      {!creating ? (
        <Button size="sm" variant={flows.length ? 'outline' : 'primary'} onClick={() => setCreating(true)}>
          <Plus size={13} /> New flow
        </Button>
      ) : (
        <div className="space-y-2 rounded-lg border border-forge-border bg-forge-panel/40 p-3">
          <input className={field} placeholder="Flow name (e.g. Warm non-repliers)" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <select className={field} style={{ width: 'auto' }} value={ruleKind} onChange={(e) => { setRuleKind(e.target.value as BehavioralRule['kind']); setPreview(null); }}>
              {RULES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <label className="flex items-center gap-1 text-[11px] text-forge-dim">
              last <input className={field} style={{ width: 52 }} value={sinceDays} onChange={(e) => { setSinceDays(e.target.value); setPreview(null); }} /> days
            </label>
            <button onClick={() => void doPreview()} disabled={busy}
              className="rounded border border-forge-border px-2 py-1 text-[11px] text-forge-dim hover:text-forge-ink disabled:opacity-50">
              Preview segment
            </button>
            {preview !== null && <span className="text-[11px] text-forge-ink">{preview} contact{preview === 1 ? '' : 's'} match today (from real events)</span>}
          </div>
          {steps.map((s, i) => (
            <div key={i} className="rounded-md border border-forge-border/60 p-2">
              <div className="mb-1 flex items-center gap-2 text-[11px] text-forge-dim">
                Step {i + 1}{i > 0 && <>
                  · <input className={field} style={{ width: 44, display: 'inline-block' }} value={s.delayDays}
                    onChange={(e) => setSteps((all) => all.map((x, j) => (j === i ? { ...x, delayDays: parseInt(e.target.value, 10) || 1 } : x)))} /> days after step {i} sends — and ONLY if they haven't replied
                </>}
              </div>
              <input className={field} placeholder="Subject" value={s.subject}
                onChange={(e) => setSteps((all) => all.map((x, j) => (j === i ? { ...x, subject: e.target.value } : x)))} />
              <textarea className={`${field} mt-1`} rows={3} placeholder="Body — {{first_name}} fills per recipient"
                value={s.body}
                onChange={(e) => setSteps((all) => all.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            {steps.length < MAX_DRIP_STEPS && (
              <button onClick={() => setSteps((s) => [...s, blankStep()])}
                className="rounded border border-forge-border px-2 py-1 text-[11px] text-forge-dim hover:text-forge-ink">+ step</button>
            )}
            {steps.length > 2 && (
              <button onClick={() => setSteps((s) => s.slice(0, -1))}
                className="rounded border border-forge-border px-2 py-1 text-[11px] text-forge-dim hover:text-forge-ink">− step</button>
            )}
            <Button size="sm" variant="primary" onClick={() => void doCreate()} disabled={busy}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : null} Create (paused)
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
