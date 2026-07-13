// src/components/garvis/DeliverableStudio.tsx
// DELIVERABLE GENERATOR — the document studio (the `deliver` flavor's workspace). Pick a document
// type, say who it's for and what it should say, and Garvis produces a finished, formatted document
// grounded in this world's knowledge — then EXPORTS it (Markdown, print/PDF, or a real .docx) so you
// can hand it to someone. Batch mode makes one per name in a list. Same honesty discipline as the
// answering desk: facts are grounded or flagged as "[needs your input: …]", and you review and send.

import { useState } from 'react';
import { FileText, Copy, Check, Download, Printer, Loader2, ShieldAlert, BookOpen, Sparkles, List, ChevronDown } from 'lucide-react';
import { Markdown } from '../Markdown';
import { generateDeliverable, generateBatch, buildDocxBlob } from '../../lib/garvis/deliverableRun';
import { DOC_TYPES, toMarkdown, toPlainText, deliverableArtifact, type Deliverable, type DocType } from '../../lib/garvis/deliverable';
import { createArtifact } from '../../lib/garvis/artifacts';

const DOC_ORDER: DocType[] = ['proposal', 'report', 'one_pager', 'brief', 'letter', 'summary'];

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'document';
}

/** Trigger a browser download of a Blob under `name`. */
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function DeliverableStudio({ worldId, clusterId, onToast }: {
  worldId: string; clusterId: string; onToast: (kind: 'success' | 'error', msg: string) => void;
}) {
  const [docType, setDocType] = useState<DocType>('proposal');
  const [subject, setSubject] = useState('');
  const [brief, setBrief] = useState('');
  const [batch, setBatch] = useState(false);
  const [batchList, setBatchList] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [docs, setDocs] = useState<Deliverable[] | null>(null);

  const run = async () => {
    if (busy) return;
    setBusy(true); setErr(null); setDocs(null);
    try {
      if (batch) {
        const subjects = batchList.split('\n').map((s) => s.trim()).filter(Boolean);
        if (subjects.length === 0) { setErr('Add at least one name or subject, one per line.'); return; }
        setDocs(await generateBatch({ worldId, docType, brief: brief.trim(), subjects }));
      } else {
        if (subject.trim().length < 2 && brief.trim().length < 8) { setErr('Say who it’s for, or give a brief of what it should say.'); return; }
        setDocs([await generateDeliverable({ worldId, docType, subject: subject.trim(), brief: brief.trim() })]);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'The document call failed. Try again.');
    } finally { setBusy(false); }
  };

  const meta = DOC_TYPES[docType];

  return (
    <div className="mt-4 rounded-2xl border border-forge-border bg-forge-panel/40 p-4">
      <div className="mb-1 flex items-center gap-2">
        <FileText size={16} className="shrink-0 text-forge-ember" />
        <h3 className="text-sm font-semibold text-forge-ink">Document studio</h3>
      </div>
      <p className="text-xs text-forge-dim">
        A finished document, grounded in this world's knowledge and exportable. <span className="text-forge-ink/80">You review and send — nothing goes out on its own.</span>
      </p>

      {/* Document type */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {DOC_ORDER.map((t) => (
          <button
            key={t} onClick={() => setDocType(t)} title={DOC_TYPES[t].blurb}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${docType === t ? 'border-forge-ember/60 bg-forge-ember/10 text-forge-ember' : 'border-forge-border text-forge-dim hover:border-forge-ember/40 hover:text-forge-ink'}`}
          >{DOC_TYPES[t].label}</button>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-forge-dim/70">{meta.blurb} · sections: {meta.sections.join(' · ')}</p>

      {/* Subject / batch list */}
      {!batch ? (
        <input
          value={subject} onChange={(e) => setSubject(e.target.value)}
          placeholder="Who or what it's for — e.g. “the Miller family kitchen remodel”"
          className="mt-3 w-full rounded-lg border border-forge-border bg-forge-raised/30 px-3 py-2 text-sm text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/50 focus:outline-none"
        />
      ) : (
        <textarea
          value={batchList} onChange={(e) => setBatchList(e.target.value)} rows={4}
          placeholder={'One name/subject per line — a document each:\nMiller family kitchen\nActon office fit-out\nGarcia bathroom'}
          className="mt-3 w-full resize-y rounded-lg border border-forge-border bg-forge-raised/30 px-3 py-2 text-sm text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/50 focus:outline-none"
        />
      )}

      {/* Brief */}
      <textarea
        value={brief} onChange={(e) => setBrief(e.target.value)} rows={3}
        placeholder="What it should say or do (the brief). Facts you type here are used as-is; anything missing comes back flagged for you to fill."
        className="mt-2 w-full resize-y rounded-lg border border-forge-border bg-forge-raised/30 px-3 py-2 text-sm text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/50 focus:outline-none"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          onClick={() => void run()} disabled={busy}
          className="flex items-center gap-1.5 rounded-lg bg-ember-gradient px-3.5 py-2 text-sm font-medium text-[#1A0E04] shadow-soft transition-transform hover:-translate-y-px disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {busy ? (batch ? 'Generating batch…' : 'Writing…') : batch ? 'Generate the batch' : `Generate the ${meta.label.toLowerCase()}`}
        </button>
        <button
          onClick={() => { setBatch((v) => !v); setDocs(null); setErr(null); }}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs transition-colors ${batch ? 'border-forge-cyan/50 text-forge-cyan' : 'border-forge-border text-forge-dim hover:text-forge-ink'}`}
          title="Generate one document per name in a list"
        >
          <List size={13} /> {batch ? 'Batch mode on' : 'Batch from a list'}
        </button>
      </div>

      {err && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-forge-warn/40 bg-forge-warn/10 px-3 py-2 text-xs text-forge-warn">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" /> {err}
        </div>
      )}

      {docs && docs.length > 0 && (
        <div className="mt-4 space-y-3">
          {docs.length > 1 && <p className="text-[11px] uppercase tracking-wide text-forge-dim">{docs.length} documents · export or save each</p>}
          {docs.map((doc, i) => (
            <DocCard key={`${doc.subject}-${i}`} doc={doc} clusterId={clusterId} defaultOpen={docs.length === 1} onToast={onToast} />
          ))}
        </div>
      )}
    </div>
  );
}

function DocCard({ doc, clusterId, defaultOpen, onToast }: {
  doc: Deliverable; clusterId: string; defaultOpen: boolean; onToast: (kind: 'success' | 'error', msg: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  // A refused document shows the honest reason, not an empty shell.
  if (doc.refusal) {
    return (
      <div className="rounded-xl border border-forge-warn/40 bg-forge-warn/10 p-3">
        <div className="flex items-start gap-2 text-sm text-forge-warn">
          <ShieldAlert size={15} className="mt-0.5 shrink-0" />
          <p><b className="text-forge-ink">{doc.subject || doc.title}</b> — {doc.refusal}</p>
        </div>
      </div>
    );
  }

  const md = toMarkdown(doc);
  const base = slugify(doc.title);

  const copy = async () => {
    try { await navigator.clipboard.writeText(toPlainText(doc)); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch { onToast('error', 'Could not copy — select the text and copy manually.'); }
  };
  const dlMarkdown = () => download(new Blob([md], { type: 'text/markdown' }), `${base}.md`);
  const dlDocx = async () => {
    try { download(await buildDocxBlob(doc), `${base}.docx`); }
    catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not build the .docx.'); }
  };
  const print = () => {
    const w = window.open('', '_blank');
    if (!w) { onToast('error', 'Allow pop-ups to print, or download the .docx / Markdown.'); return; }
    const body = doc.sections.map((s) => {
      const head = s.heading ? `<h2>${escapeHtml(s.heading)}</h2>` : '';
      // Group consecutive "- " lines into a <ul>; everything else becomes a <p> per blank-line block.
      const blocks: string[] = [];
      let bullets: string[] = [];
      const flush = () => { if (bullets.length) { blocks.push(`<ul>${bullets.map((b) => `<li>${b}</li>`).join('')}</ul>`); bullets = []; } };
      for (const raw of s.body.split('\n')) {
        const line = raw.trim();
        if (!line) { flush(); continue; }
        const b = /^[-*]\s+(.+)$/.exec(line);
        if (b) bullets.push(escapeHtml(b[1]));
        else { flush(); blocks.push(`<p>${escapeHtml(line)}</p>`); }
      }
      flush();
      return head + blocks.join('');
    }).join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title><style>body{font:15px/1.6 Georgia,serif;max-width:42rem;margin:2.5rem auto;padding:0 1.5rem;color:#111}h1{font-size:1.7rem;margin:0 0 1rem}h2{font-size:1.15rem;margin:1.6rem 0 .4rem}p{margin:.6rem 0}ul{margin:.5rem 0;padding-left:1.4rem}li{margin:.2rem 0}</style></head><body><h1>${escapeHtml(doc.title)}</h1>${body}</body></html>`);
    w.document.close(); w.focus();
    setTimeout(() => w.print(), 250);
  };
  const save = async () => {
    try {
      const art = deliverableArtifact(doc);
      await createArtifact({ clusterId, slug: art.id, kind: 'doc', title: art.title, detail: art.detail, source: 'garvis' });
      setSaved(true); onToast('success', 'Saved to the shelf.');
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not save the document.'); }
  };

  const btn = 'flex items-center gap-1 rounded-lg border border-forge-border px-2.5 py-1 text-xs text-forge-ink hover:border-forge-ember/50 disabled:opacity-50';

  return (
    <div className="rounded-xl border border-forge-border bg-forge-raised/20">
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronDown size={14} className={`shrink-0 text-forge-dim transition-transform ${open ? '' : '-rotate-90'}`} />
          <span className="truncate text-sm font-medium text-forge-ink">{doc.title}</span>
          {doc.grounded
            ? <span className="shrink-0 rounded-full bg-forge-ok/15 px-1.5 py-0.5 text-[10px] text-forge-ok">grounded</span>
            : <span className="shrink-0 rounded-full border border-forge-border px-1.5 py-0.5 text-[10px] text-forge-dim">from your brief</span>}
          {doc.gaps.length > 0 && <span className="shrink-0 rounded-full bg-forge-cyan/10 px-1.5 py-0.5 text-[10px] text-forge-cyan">{doc.gaps.length} to fill</span>}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={() => void copy()} className={btn} title="Copy as plain text">{copied ? <Check size={12} className="text-forge-ok" /> : <Copy size={12} />}</button>
          <button onClick={dlMarkdown} className={btn} title="Download Markdown (.md)"><Download size={12} /> md</button>
          <button onClick={() => void dlDocx()} className={btn} title="Download Word (.docx)"><Download size={12} /> docx</button>
          <button onClick={print} className={btn} title="Print or Save as PDF"><Printer size={12} /></button>
          <button onClick={() => void save()} disabled={saved} className={btn} title="Keep on the shelf so the ledger learns kept-vs-rewritten">{saved ? <Check size={12} className="text-forge-ok" /> : 'Save'}</button>
        </div>
      </div>

      {open && (
        <div className="border-t border-forge-border/60 px-4 py-3">
          {doc.gaps.length > 0 && (
            <div className="mb-3 rounded-lg border border-forge-cyan/30 bg-forge-cyan/5 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-forge-cyan">Fill before sending ({doc.gaps.length})</div>
              <ul className="mt-1 space-y-0.5">{doc.gaps.map((g, i) => <li key={i} className="text-xs text-forge-ink/90">• {g}</li>)}</ul>
            </div>
          )}
          <Markdown content={md} />
          {doc.sources.length > 0 && (
            <div className="mt-3 border-t border-forge-border/40 pt-2">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-forge-dim"><BookOpen size={12} /> Grounded in ({doc.sources.length})</div>
              <ul className="mt-1.5 space-y-1">
                {doc.sources.map((s, i) => (
                  <li key={s.id} className="flex items-center gap-2 text-[11px] text-forge-dim">
                    <span className="text-forge-dim/70">[{i + 1}]</span>
                    <span className="truncate text-forge-ink/80">{s.title}</span>
                    {s.where && <span className="shrink-0 text-forge-dim/60">{s.where}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
