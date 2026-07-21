// src/components/garvis/PaperworkStudio.tsx
// AUTO-PAPERWORK: the operator's own templates ({{tokens}}), merged from a real contact + her own
// answers — every unfilled field is a visible hole and a REFUSAL to send, never an invented value.
// Queuing goes to Approvals (kind send_for_signature); docusign-send re-verifies everything server-
// side. Legal-scope honesty in the copy: this signs documents SHE authors — it does not fill
// state-mandated forms. Sandbox honesty: until production go-live, DocuSign runs in the developer
// sandbox where signatures are not legally binding.

import { useEffect, useMemo, useState } from 'react';
import { FileSignature, Loader2, Plus, RefreshCw, Save, Send, Trash2 } from 'lucide-react';
import { templateTokens, mergePaperwork, type EsignRecipient } from '../../lib/garvis/esign';
import {
  listTemplates, saveTemplate, deleteTemplate, searchContacts, queueForSignature,
  listEnvelopes, pollEnvelopeStatus, extractPaperworkTemplate,
  type PaperworkTemplate, type EnvelopeRow, type ContactHit,
} from '../../lib/garvis/esignRun';
import { useConnections } from '../../hooks/useConnections';
import { cn } from '../../lib/utils';
import { Button } from '../ui';

type Toast = (k: 'success' | 'error' | 'info', m: string) => void;

const STARTERS: { name: string; body: string }[] = [
  {
    name: 'Service agreement (starter)',
    body: 'This agreement is between {{your_name}} and {{client_name}} for {{service_description}}.\n\nScope: {{scope}}\n\nFee: {{fee}}\n\nTimeline: {{timeline}}\n\nEither party may end this agreement with written notice. This document was prepared by {{your_name}}; it is not a state-mandated form.',
  },
  {
    name: 'Listing cover letter (starter)',
    body: 'Dear {{client_name}},\n\nThank you for trusting me with {{property_address}}. This letter confirms what we agreed:\n\nList price: {{list_price}}\nCommission: {{commission}}\nTerm: {{term}}\n\n{{your_name}}',
  },
];

export function PaperworkStudio({ worldId, onToast }: { worldId: string; onToast: Toast }) {
  const { isConnected, startOAuth, loading: connLoading } = useConnections();
  const connected = isConnected('docusign');

  const [templates, setTemplates] = useState<PaperworkTemplate[] | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [tplBody, setTplBody] = useState('');
  // Extracted field meta ({token,label,hint}) — persisted with the template (app_0093) so the
  // fill form can show the grounded hint instead of a bare token name.
  const [fieldMeta, setFieldMeta] = useState<{ token: string; label: string; hint: string }[]>([]);
  const [busy, setBusy] = useState(false);
  // Extract-from-sample: paste a client's real document → a tokenized template pre-fills the
  // editor above for review. Nothing saves until the operator presses Save.
  const [sampleOpen, setSampleOpen] = useState(false);
  const [sample, setSample] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const uploadSample = async (file: File) => {
    setUploadingDoc(true);
    try {
      const { extractText } = await import('../../lib/docExtract');
      const text = (await extractText(file)).trim();
      if (text.length < 200) throw new Error('That file extracted to almost nothing — a scan without OCR? Paste the text instead.');
      setSample(text);
      onToast('success', `"${file.name}" read (${text.length.toLocaleString()} chars) — press Extract template.`);
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not read that file.'); }
    finally { setUploadingDoc(false); }
  };

  const [title, setTitle] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [contactQ, setContactQ] = useState('');
  const [hits, setHits] = useState<ContactHit[]>([]);
  const [signers, setSigners] = useState<EsignRecipient[]>([]);
  const [envelopes, setEnvelopes] = useState<EnvelopeRow[]>([]);

  useEffect(() => {
    let live = true;
    void listTemplates(worldId).then((t) => {
      if (!live) return;
      setTemplates(t);
      if (t[0]) { setSelId(t[0].id); setName(t[0].name); setTplBody(t[0].body); setFieldMeta(t[0].fields); }
    }).catch((e) => onToast('error', e instanceof Error ? e.message : 'Could not load templates (is app_0065 applied?)'));
    void listEnvelopes(12, worldId).then((e) => { if (live) setEnvelopes(e); }).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tokens = useMemo(() => templateTokens(tplBody), [tplBody]);
  const merged = useMemo(() => mergePaperwork(tplBody, fields), [tplBody, fields]);

  const pick = (t: PaperworkTemplate) => { setSelId(t.id); setName(t.name); setTplBody(t.body); setFieldMeta(t.fields); };

  const doSaveTpl = async () => {
    try {
      setBusy(true);
      const saved = await saveTemplate({ id: selId ?? undefined, name, body: tplBody, worldId, fields: fieldMeta });
      setTemplates((ts) => {
        const rest = (ts ?? []).filter((x) => x.id !== saved.id);
        return [saved, ...rest];
      });
      setSelId(saved.id);
      onToast('success', `Template "${saved.name}" saved.`);
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not save.'); }
    finally { setBusy(false); }
  };

  const doNewTpl = (starter?: { name: string; body: string }) => {
    setSelId(null);
    setName(starter?.name.replace(' (starter)', '') ?? 'New template');
    setTplBody(starter?.body ?? 'Dear {{client_name}},\n\n…\n\n{{your_name}}');
    setFieldMeta([]);
  };

  const doDeleteTpl = async () => {
    if (!selId) return;
    if (!window.confirm(`Delete template "${name}"?`)) return;
    try {
      await deleteTemplate(selId);
      setTemplates((ts) => (ts ?? []).filter((x) => x.id !== selId));
      setSelId(null); setName(''); setTplBody('');
      onToast('info', 'Template deleted.');
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not delete.'); }
  };

  const doSearch = async (q: string) => {
    setContactQ(q);
    try { setHits(await searchContacts(q, worldId)); } catch { setHits([]); }
  };

  const useContact = (c: ContactHit) => {
    if (!c.email) { onToast('error', 'That contact has no email — signers need one.'); return; }
    setSigners((s) => (s.some((x) => x.email === c.email) ? s : [...s, { name: c.full_name ?? c.email!, email: c.email! }]));
    // Prefill matching tokens if present — only from the real record, and visibly editable.
    setFields((f) => ({
      ...f,
      ...(tokens.includes('client_name') && c.full_name ? { client_name: f.client_name || c.full_name } : {}),
      ...(tokens.includes('client_email') && c.email ? { client_email: f.client_email || c.email } : {}),
    }));
    setContactQ(''); setHits([]);
  };

  const doQueue = async () => {
    try {
      setBusy(true);
      await queueForSignature({ title, templateBody: tplBody, fields, recipients: signers, templateId: selId, worldId });
      onToast('success', `Queued for approval — approve it in the Queue and it goes to DocuSign.`);
      setTitle(''); setSigners([]);
      setEnvelopes(await listEnvelopes(12, worldId));
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not queue.'); }
    finally { setBusy(false); }
  };

  const doPoll = async (row: EnvelopeRow) => {
    try {
      const res = await pollEnvelopeStatus(row.id);
      setEnvelopes(await listEnvelopes(12, worldId));
      onToast('info', `Status: ${res.status}.`);
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Poll failed.'); }
  };

  if (templates === null) return <div className="mt-4 flex items-center gap-2 text-sm text-forge-dim"><Loader2 size={14} className="animate-spin" /> Loading paperwork…</div>;

  return (
    <div className="mt-4 space-y-4">
      {!connLoading && !connected && (
        <div className="rounded-xl border border-forge-warn/40 bg-forge-warn/5 p-3 text-xs text-forge-dim">
          <span className="text-forge-warn">DocuSign isn't connected.</span> You can draft templates and merges now;
          connect before sending.{' '}
          <button onClick={() => void startOAuth('docusign', window.location.pathname + window.location.search).catch((e) => onToast('error', e instanceof Error ? e.message : 'Could not start.'))}
            className="text-forge-ember underline">Connect DocuSign</button>
          {' '}(developer sandbox by default — sandbox signatures are for testing, not legally binding).
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Templates */}
        <div className="rounded-xl border border-forge-border bg-forge-raised/30 p-3">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold text-forge-ink"><FileSignature size={14} className="text-forge-ember" /> Your templates</h4>
          <p className="mt-0.5 text-[11px] text-forge-dim">Documents YOU author, with {'{{tokens}}'} for the parts that change. Not state-mandated forms — those stay in their official tools.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {templates.map((t) => (
              <button key={t.id} onClick={() => pick(t)}
                className={cn('rounded-lg border px-2.5 py-1 text-xs', selId === t.id ? 'border-forge-ember/60 bg-forge-ember/10 text-forge-ink' : 'border-forge-border text-forge-dim hover:text-forge-ink')}>
                {t.name}
              </button>
            ))}
            <button onClick={() => doNewTpl()} className="rounded-lg border border-dashed border-forge-border px-2.5 py-1 text-xs text-forge-dim hover:text-forge-ink"><Plus size={11} className="mr-1 inline" />New</button>
          </div>
          {templates.length === 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {STARTERS.map((s) => (
                <button key={s.name} onClick={() => doNewTpl(s)} className="rounded-lg border border-forge-border px-2.5 py-1 text-[11px] text-forge-dim hover:text-forge-ink">
                  Start from: {s.name}
                </button>
              ))}
            </div>
          )}
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name"
            className="mt-2 w-full rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none" />
          <textarea value={tplBody} onChange={(e) => setTplBody(e.target.value)} rows={9}
            placeholder={'Dear {{client_name}}, …'}
            className="mt-2 w-full rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 font-mono text-[11px] text-forge-ink placeholder:text-forge-dim/50 focus:border-forge-ember/60 focus:outline-none" />
          <div className="mt-2 flex gap-2">
            <button onClick={() => void doSaveTpl()} disabled={busy || !name.trim()}
              className="flex items-center gap-1.5 rounded-lg border border-forge-border px-2.5 py-1 text-xs text-forge-ink hover:border-forge-ember/50 disabled:opacity-50"><Save size={12} /> Save</button>
            {selId && <button onClick={() => void doDeleteTpl()} className="flex items-center gap-1.5 rounded-lg border border-forge-border px-2.5 py-1 text-xs text-forge-dim hover:text-forge-warn"><Trash2 size={12} /> Delete</button>}
            <button onClick={() => setSampleOpen((v) => !v)}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-forge-ember/40 px-2.5 py-1 text-xs text-forge-ember hover:bg-forge-ember/10">
              <FileSignature size={12} /> Extract from a sample
            </button>
          </div>

          {/* EXTRACTION: the client's real document in → a tokenized template pre-fills the editor
              above for review. Non-varying language stays verbatim; only deal-specific values
              become {{tokens}}. Nothing saves until the operator presses Save. */}
          {sampleOpen && (
            <div className="mt-2 rounded-lg border border-forge-ember/30 bg-forge-bg p-2">
              <div className="mb-1.5 flex items-center gap-2">
                {/* Upload → text (app_0099 back half): PDF/DOCX/TXT extracted client-side with the
                    same libs the brain uses — the file never leaves the browser unextracted. */}
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-forge-border px-2 py-1 text-[11px] text-forge-dim hover:border-forge-ember/40 hover:text-forge-ink">
                  {uploadingDoc ? <Loader2 size={11} className="animate-spin" /> : <FileSignature size={11} />} Upload the document (PDF, DOCX, TXT)
                  <input type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadSample(f); e.target.value = ''; }} />
                </label>
                <span className="text-[10px] text-forge-dim/70">or paste below</span>
              </div>
              <textarea value={sample} onChange={(e) => setSample(e.target.value)} rows={6}
                placeholder="Paste the client's whole sample document here (a listing agreement, disclosure, invoice…)"
                className="w-full rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 font-mono text-[11px] text-forge-ink placeholder:text-forge-dim/50 focus:border-forge-ember/60 focus:outline-none" />
              <div className="mt-1.5 flex items-center gap-2">
                <button
                  onClick={() => {
                    setExtracting(true);
                    void extractPaperworkTemplate(sample)
                      .then((t) => {
                        setSelId(null); setName(t.name); setTplBody(t.body); setFieldMeta(t.fields);
                        setSampleOpen(false); setSample('');
                        onToast('success', `Extracted "${t.name}" with ${t.fields.length} fill-in field(s) — review the template above, then Save.`);
                      })
                      .catch((e) => onToast('error', e instanceof Error ? e.message : 'Extraction failed — the sample is unchanged.'))
                      .finally(() => setExtracting(false));
                  }}
                  disabled={extracting || sample.trim().length < 200}
                  className="flex items-center gap-1.5 rounded-lg border border-forge-ember/50 bg-forge-ember/10 px-2.5 py-1 text-xs font-medium text-forge-ember disabled:opacity-50"
                >
                  {extracting ? <Loader2 size={12} className="animate-spin" /> : <FileSignature size={12} />} {extracting ? 'Extracting…' : 'Extract template'}
                </button>
                <span className="text-[10px] text-forge-dim">Everything that doesn't vary stays verbatim; only deal-specific values become {'{{tokens}}'}.</span>
              </div>
            </div>
          )}
        </div>

        {/* Merge + send */}
        <div className="rounded-xl border border-forge-border bg-forge-raised/30 p-3">
          <h4 className="text-sm font-semibold text-forge-ink">Fill &amp; send for signature</h4>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document title — e.g. Service agreement — Jane Roe"
            className="mt-2 w-full rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none" />

          <div className="relative mt-2">
            <input value={contactQ} onChange={(e) => void doSearch(e.target.value)} placeholder="Add signer from contacts…"
              className="w-full rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none" />
            {hits.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-forge-border bg-forge-panel p-1">
                {hits.map((c) => (
                  <button key={c.id} onClick={() => useContact(c)} className="block w-full rounded px-2 py-1 text-left text-xs text-forge-ink hover:bg-forge-raised">
                    {c.full_name || c.email} <span className="text-forge-dim">{c.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {signers.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {signers.map((s) => (
                <span key={s.email} className="inline-flex items-center gap-1 rounded-full border border-forge-border px-2 py-0.5 text-[11px] text-forge-ink">
                  {s.name} · {s.email}
                  <button onClick={() => setSigners((x) => x.filter((y) => y.email !== s.email))} className="text-forge-dim hover:text-forge-warn">×</button>
                </span>
              ))}
            </div>
          )}

          {tokens.length > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {tokens.map((t) => {
                const meta = fieldMeta.find((m) => m.token === t);
                return (
                  <label key={t} className="flex flex-col gap-0.5 text-[10px] uppercase tracking-wide text-forge-dim" title={meta?.hint || undefined}>
                    {meta?.label || t.replace(/_/g, ' ')}
                    <input value={fields[t] ?? ''} onChange={(e) => setFields((f) => ({ ...f, [t]: e.target.value }))}
                      placeholder={meta?.hint ?? ''}
                      className={cn('rounded-lg border bg-forge-bg px-2 py-1 text-xs normal-case text-forge-ink placeholder:text-forge-dim/50 focus:outline-none',
                        (fields[t] ?? '').trim() ? 'border-forge-border focus:border-forge-ember/60' : 'border-forge-warn/50')} />
                  </label>
                );
              })}
            </div>
          )}

          <p className={cn('mt-2 text-[11px]', merged.gaps.length > 0 ? 'text-forge-warn' : 'text-forge-ok')}>
            {merged.gaps.length > 0
              ? `Unfilled: ${merged.gaps.join(', ')} — sending refuses until every field is real.`
              : tplBody.trim() ? 'Every field filled — ready to queue.' : 'Pick or write a template.'}
          </p>

          <Button variant='primary' size='sm' onClick={() => void doQueue()} disabled={busy || merged.gaps.length > 0 || !tplBody.trim() || signers.length === 0 || !title.trim()}
            className="mt-1">
            <Send size={13} /> Queue for signature (goes to Approvals)
          </Button>

          {envelopes.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-forge-border pt-2">
              {envelopes.slice(0, 6).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="min-w-0 truncate text-forge-ink/80">{e.title}</span>
                  <span className={cn('shrink-0 rounded border px-1.5 py-0.5 uppercase tracking-wide',
                    e.status === 'completed' ? 'border-forge-ok/40 text-forge-ok'
                      : e.status === 'declined' || e.status === 'failed' ? 'border-forge-warn/40 text-forge-warn'
                        : 'border-forge-border text-forge-dim')}>{e.status}</span>
                  {e.envelope_id && (
                    <button onClick={() => void doPoll(e)} title="Check status now" className="shrink-0 text-forge-dim hover:text-forge-ink"><RefreshCw size={11} /></button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
