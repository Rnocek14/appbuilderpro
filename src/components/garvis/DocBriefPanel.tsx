// src/components/garvis/DocBriefPanel.tsx
// BRIEF-THIS-UPLOAD — the per-document comprehension surface. One press reads the document's own
// stored text (map-reduce over its sections) and produces a grounded brief: summary, key points,
// verbatim specifics, watch-outs (only when the text actually contains them), open questions — with
// an honest COVERAGE line when the document was too long to read fully, and an honest refusal when
// there is no text to read (a scan). A computed brief persists on the document and rereads free.

import { useState } from 'react';
import { BookOpenText, Loader2, ShieldAlert, ChevronDown } from 'lucide-react';
import { Markdown } from '../Markdown';
import { briefDocument, storedBrief } from '../../lib/garvis/briefDocRun';

export function DocBriefPanel({ docId, meta }: { docId: string; meta: Record<string, unknown> | null }) {
  const existing = storedBrief(meta);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [brief, setBrief] = useState<{ text: string; coverage: string } | null>(existing ? { text: existing.text, coverage: existing.coverage } : null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const run = async () => {
    if (busy) return;
    setBusy(true); setRefusal(null);
    try {
      const r = await briefDocument(docId);
      if (r.refusal) { setRefusal(r.refusal); setBrief(null); }
      else { setBrief({ text: r.brief, coverage: r.coverage }); setOpen(true); }
    } catch (e) { setRefusal(e instanceof Error ? e.message : 'The brief failed. Try again.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-2">
        <button
          onClick={() => (brief && !open ? setOpen(true) : brief && open ? setOpen(false) : void run())}
          disabled={busy}
          className="flex items-center gap-1 rounded-lg border border-forge-border px-2 py-1 text-[11px] text-forge-dim transition-colors hover:border-forge-ember/50 hover:text-forge-ember disabled:opacity-50"
          title="Read this document end-to-end and produce a grounded brief — summary, key points, verbatim specifics, watch-outs"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <BookOpenText size={12} />}
          {busy ? 'Reading…' : brief ? (open ? 'Hide brief' : 'Show brief') : 'Brief this'}
          {brief && <ChevronDown size={11} className={`transition-transform ${open ? '' : '-rotate-90'}`} />}
        </button>
        {brief && open && (
          <button onClick={() => void run()} disabled={busy} className="text-[10px] text-forge-dim/70 hover:text-forge-ink disabled:opacity-50">re-read</button>
        )}
      </div>

      {refusal && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-forge-warn/40 bg-forge-warn/10 px-3 py-2 text-xs text-forge-warn">
          <ShieldAlert size={13} className="mt-0.5 shrink-0" /> {refusal}
        </div>
      )}

      {brief && open && (
        <div className="mt-2 rounded-lg border border-forge-border bg-forge-raised/20 px-3 py-2.5">
          <p className="mb-2 text-[10px] uppercase tracking-wide text-forge-dim">{brief.coverage}</p>
          <Markdown content={brief.text} />
        </div>
      )}
    </div>
  );
}
