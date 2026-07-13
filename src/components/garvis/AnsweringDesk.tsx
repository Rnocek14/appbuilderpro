// src/components/garvis/AnsweringDesk.tsx
// OPERATOR ASSISTANT — the answering desk (the `assist` studio's workspace). Paste an incoming
// message; Garvis drafts a reply grounded ONLY in this world's knowledge base, shows the exact
// sources it stood on, flags anything it couldn't answer as a gap you must fill, and REFUSES when
// it has nothing on record rather than inventing a policy or a price. The human always copies and
// sends — the desk never sends for you. This is the honest support-drafting surface, not automation.

import { useState } from 'react';
import { Loader2, Copy, Check, ShieldAlert, MailQuestion, BookOpen } from 'lucide-react';
import { draftReply } from '../../lib/garvis/assistRun';
import { assistArtifact, type AssistDraft } from '../../lib/garvis/assist';
import { createArtifact } from '../../lib/garvis/artifacts';
import { AddKnowledge } from './AddKnowledge';

export function AnsweringDesk({ worldId, clusterId, onToast }: {
  worldId: string; clusterId: string; onToast: (kind: 'success' | 'error', msg: string) => void;
}) {
  const [incoming, setIncoming] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<AssistDraft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const run = async () => {
    const text = incoming.trim();
    if (text.length < 3 || busy) return;
    setBusy(true); setDraft(null); setErr(null); setCopied(false); setSaved(false);
    try {
      setDraft(await draftReply({ worldId, incoming: text }));
    } catch (e) {
      // A thrown model error is shown honestly — not swallowed into a fake answer.
      setErr(e instanceof Error ? e.message : 'The drafting call failed. Try again.');
    } finally { setBusy(false); }
  };

  const copy = async () => {
    if (!draft?.reply) return;
    try { await navigator.clipboard.writeText(draft.reply); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch { onToast('error', 'Could not copy — select the text and copy manually.'); }
  };

  // Keep a grounded draft on the shelf so the ledger can learn which drafts get kept vs rewritten.
  const save = async () => {
    if (!draft?.grounded) return;
    try {
      const art = assistArtifact(incoming, draft);
      await createArtifact({ clusterId, slug: art.id, kind: 'doc', title: art.title, detail: art.detail, source: 'garvis' });
      setSaved(true); onToast('success', 'Saved to the shelf.');
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not save the draft.'); }
  };

  return (
    <div className="mt-4 rounded-2xl border border-forge-border bg-forge-panel/40 p-4">
      <div className="mb-1 flex items-center gap-2">
        <MailQuestion size={16} className="shrink-0 text-forge-ember" />
        <h3 className="text-sm font-semibold text-forge-ink">Answering desk</h3>
      </div>
      <p className="text-xs text-forge-dim">
        Paste an incoming message. Garvis drafts a reply grounded only in this world's knowledge base,
        cites what it used, and refuses when it has nothing on record. <span className="text-forge-ink/80">You copy and send — it never sends for you.</span>
      </p>

      {/* The knowledge-in path, right where it's needed: the desk refuses over an empty base, so the
          first move is to feed it. Paste a policy or a past answer and the next draft can stand on it. */}
      <AddKnowledge worldId={worldId} label="Add answers & policies to this desk's knowledge" onToast={onToast} />


      <textarea
        value={incoming} onChange={(e) => setIncoming(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void run(); }}
        rows={5}
        placeholder="Paste the email or message here…"
        className="mt-3 w-full resize-y rounded-lg border border-forge-border bg-forge-raised/30 px-3 py-2 text-sm text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/50 focus:outline-none"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => void run()} disabled={busy || incoming.trim().length < 3}
          className="flex items-center gap-1.5 rounded-lg bg-ember-gradient px-3.5 py-2 text-sm font-medium text-[#1A0E04] shadow-soft transition-transform hover:-translate-y-px disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <MailQuestion size={14} />}
          {busy ? 'Drafting…' : 'Draft the reply'}
        </button>
        <span className="text-[11px] text-forge-dim/60">⌘/Ctrl + Enter</span>
      </div>

      {err && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-forge-warn/40 bg-forge-warn/10 px-3 py-2 text-xs text-forge-warn">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" /> {err}
        </div>
      )}

      {/* REFUSAL — the honesty gate fired: nothing on record, or nothing composable. No answer is
          shown, because a confident invented support reply is the worst possible output. */}
      {draft && !draft.grounded && (
        <div className="mt-3 rounded-xl border border-forge-warn/40 bg-forge-warn/10 p-3">
          <div className="flex items-start gap-2 text-sm text-forge-warn">
            <ShieldAlert size={15} className="mt-0.5 shrink-0" />
            <p>{draft.refusal}</p>
          </div>
          {draft.sources.length > 0 && <SourceList sources={draft.sources} label="Related, but not enough to draft from" />}
        </div>
      )}

      {/* GROUNDED DRAFT — ready to copy, with its gaps and its sources in plain view. */}
      {draft && draft.grounded && (
        <div className="mt-3 border-t border-forge-border/60 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wide text-forge-dim">Draft reply — review before sending</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => void copy()}
                className="flex items-center gap-1 rounded-lg border border-forge-border px-2.5 py-1 text-xs text-forge-ink hover:border-forge-ember/50"
              >
                {copied ? <Check size={12} className="text-forge-ok" /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                onClick={() => void save()} disabled={saved}
                className="flex items-center gap-1 rounded-lg border border-forge-border px-2.5 py-1 text-xs text-forge-dim hover:text-forge-ink disabled:opacity-50"
                title="Keep this draft on the shelf so the ledger can learn which drafts get kept"
              >
                {saved ? <Check size={12} className="text-forge-ok" /> : null} {saved ? 'Saved' : 'Save to shelf'}
              </button>
            </div>
          </div>

          <div className="whitespace-pre-line rounded-lg border border-forge-border bg-forge-raised/30 px-3 py-2.5 text-sm leading-relaxed text-forge-ink">
            {draft.reply}
          </div>

          {/* GAPS — the parts the knowledge base didn't cover, surfaced as a checklist to fill
              before this goes out. Honest incompleteness beats a confident guess. */}
          {draft.gaps.length > 0 && (
            <div className="mt-3 rounded-lg border border-forge-cyan/30 bg-forge-cyan/5 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-forge-cyan">Fill before sending ({draft.gaps.length})</div>
              <ul className="mt-1 space-y-0.5">
                {draft.gaps.map((g, i) => (
                  <li key={i} className="text-xs text-forge-ink/90">• {g}</li>
                ))}
              </ul>
            </div>
          )}

          <SourceList sources={draft.sources} label="Grounded in" />
        </div>
      )}
    </div>
  );
}

/** The "show your work" list — the exact knowledge-base entries the draft stands on. */
function SourceList({ sources, label }: { sources: AssistDraft['sources']; label: string }) {
  return (
    <div className="mt-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-forge-dim">
        <BookOpen size={12} /> {label} ({sources.length})
      </div>
      <ul className="mt-1.5 space-y-1.5">
        {sources.map((s, i) => (
          <li key={s.id} className="rounded-lg border border-forge-border bg-forge-raised/30 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-forge-dim">[{i + 1}]</span>
              <span className="flex-1 truncate text-xs font-medium text-forge-ink">{s.title}</span>
              {s.where && <span className="text-[10px] text-forge-dim">{s.where}</span>}
            </div>
            <p className="mt-0.5 line-clamp-2 text-[11px] text-forge-dim">{s.snippet}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
