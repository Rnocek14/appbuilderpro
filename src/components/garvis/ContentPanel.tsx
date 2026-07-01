// src/components/garvis/ContentPanel.tsx
// Surfaces the content an act-run drafted (the "publish" seam of the FableForge content loop) and lets
// the user log what happened after publishing it manually (the "measure"/learn seam). No auto-posting:
// Garvis drafts, you copy + publish externally, then you tell it the result — which becomes an approved
// outcome feeding the next recommendation.

import { useState } from 'react';
import { FileText, Copy, ClipboardCheck, X } from 'lucide-react';
import { extractGeneratedContent, shortScriptToMarkdown } from '../../lib/garvis/content';
import { useGarvisKnowledge } from '../../hooks/useGarvisKnowledge';
import { useToast } from '../../context/ToastContext';
import { Badge, Button, Card, Input } from '../ui';
import type { AgentRun } from '../../types';

export function ContentPanel({ run, onLogged }: { run: AgentRun | null; onLogged?: () => void }) {
  const { logOutcome } = useGarvisKnowledge();
  const { toast } = useToast();
  const [showLog, setShowLog] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [engagement, setEngagement] = useState('');
  const [saving, setSaving] = useState(false);

  if (!run) return null;
  const scripts = extractGeneratedContent(run);

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast('success', `${label} copied.`); }
    catch { toast('error', 'Clipboard unavailable.'); }
  };

  const submitLog = async () => {
    if (!title.trim()) { toast('info', 'Add a short title for what you did.'); return; }
    setSaving(true);
    try {
      const fullBody = engagement.trim() ? `${body.trim()}\n\nResult/engagement: ${engagement.trim()}` : body.trim();
      await logOutcome({ title: title.trim(), body: fullBody || '(no detail)', appId: run.app_id, runId: run.id });
      toast('success', 'Logged — Garvis will use this next time.');
      setTitle(''); setBody(''); setEngagement(''); setShowLog(false);
      onLogged?.();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not log result.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-6 border-forge-ember/40 p-4">
      <div className="mb-2 flex items-center gap-2">
        <FileText size={16} className="text-forge-ember" />
        <h2 className="font-display text-sm font-semibold">Garvis drafted</h2>
        <Badge tone="warn">script only</Badge>
        <span className="text-[11px] text-forge-dim/70">Copy → publish manually → log the result below.</span>
      </div>

      {scripts.length === 0 ? (
        <p className="whitespace-pre-wrap text-xs text-forge-dim">{run.output ?? 'No draft was produced this run.'}</p>
      ) : (
        scripts.map((s, i) => (
          <div key={i} className="mb-3 space-y-2 rounded border border-forge-border p-3">
            <Field label="Hook" value={s.hook} onCopy={() => copy(s.hook, 'Hook')} />
            <Field label="Script" value={s.script} onCopy={() => copy(s.script, 'Script')} multiline />
            <Field label="Caption" value={s.caption} onCopy={() => copy(s.caption, 'Caption')} />
            <Field label="CTA" value={s.cta} onCopy={() => copy(s.cta, 'CTA')} />
            {s.visual_beats.length > 0 && (
              <Field label="Visual beats" value={s.visual_beats.map((b, n) => `${n + 1}. ${b}`).join('\n')} onCopy={() => copy(s.visual_beats.join('\n'), 'Beats')} multiline />
            )}
            <Button variant="outline" onClick={() => copy(shortScriptToMarkdown(s), 'Full draft')}>
              <Copy size={13} /> Copy all (markdown)
            </Button>
          </div>
        ))
      )}

      {!showLog ? (
        <Button onClick={() => setShowLog(true)}>
          <ClipboardCheck size={14} /> Log result
        </Button>
      ) : (
        <div className="space-y-2 rounded border border-forge-border p-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-forge-ink">What happened?</span>
            <button onClick={() => setShowLog(false)} className="ml-auto text-forge-dim hover:text-forge-ink"><X size={14} /></button>
          </div>
          <Input placeholder="e.g. Posted the hook to X" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea
            className="w-full rounded border border-forge-border bg-forge-raised px-2 py-1.5 text-sm text-forge-ink"
            rows={3}
            placeholder="What you did, what worked, what you'd change…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <Input placeholder="Engagement / result (optional, e.g. 4.2k views, 30 signups)" value={engagement} onChange={(e) => setEngagement(e.target.value)} />
          <Button onClick={submitLog} loading={saving}><ClipboardCheck size={14} /> Save outcome</Button>
        </div>
      )}
    </Card>
  );
}

function Field({ label, value, onCopy, multiline }: { label: string; value: string; onCopy: () => void; multiline?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-forge-dim/70">{label}</span>
        <button onClick={onCopy} className="text-forge-dim hover:text-forge-ember" title={`Copy ${label}`}><Copy size={12} /></button>
      </div>
      <p className={`text-sm text-forge-ink ${multiline ? 'whitespace-pre-wrap' : ''}`}>{value || '—'}</p>
    </div>
  );
}
