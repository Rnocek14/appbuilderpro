// src/components/prospects/ProspectDrawer.tsx
// The prospect DETAIL drawer — a right-side slide-over opened from a row in the Prospects pipeline. It
// is the deliberate half of the loop (the row keeps the fast one-click "Build & send"): build the demo,
// then REVIEW the actual email — subject + the rendered HTML, which already contains the before/after of
// their current site vs the new one — and only then Send. Plus: view the demo, mark it won (deep-links to
// the billing book pre-filled), or skip/reopen. Everything known about one prospect, in one place.

import { useCallback, useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  X, MapPin, Globe, Phone, ExternalLink, Send, Loader2, Check, Mail, Trophy, Archive, RotateCcw,
  LayoutTemplate, Eye, Hammer, Trash2,
} from 'lucide-react';
import { MessageSquareReply } from 'lucide-react';
import { STAGE_META, nextAction, canBuildAndSend, signalChips } from '../../lib/garvis/prospects/stage';
import { loadProspectContacts, loadProspectReply, type Prospect, type ProspectContact, type ProspectReply } from '../../lib/garvis/prospects/prospectsRun';
import { buildDemoForReview, loadPendingPitch, sendPitch, discardPitch, type PendingPitch } from '../../lib/garvis/prospects/reviewSend';
import { useToast } from '../../context/ToastContext';

export function ProspectDrawer({ prospect, onRefresh, onSkipToggle, onClose }: {
  prospect: Prospect;
  onRefresh: () => void | Promise<void>;
  onSkipToggle: (p: Prospect) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [contacts, setContacts] = useState<ProspectContact[] | null>(null);
  const [reply, setReply] = useState<ProspectReply | null>(null);
  const [pending, setPending] = useState<PendingPitch | null | 'loading'>('loading');
  const [building, setBuilding] = useState(false);
  const [sendPhase, setSendPhase] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setContacts(null);
    void loadProspectContacts(prospect.profileId).then((c) => { if (live) setContacts(c); });
    return () => { live = false; };
  }, [prospect.profileId]);

  // Load the actual reply text when the prospect wrote back — so you read it here, not just in the Queue.
  useEffect(() => {
    let live = true;
    setReply(null);
    if (prospect.replied) void loadProspectReply(prospect.preview_site_id).then((r) => { if (live) setReply(r); });
    return () => { live = false; };
  }, [prospect.replied, prospect.preview_site_id]);

  // Load the pending pitch (if any) for this demo, so we can show the email to review.
  const reloadPitch = useCallback(async () => {
    setPending('loading');
    const p = await loadPendingPitch(prospect.preview_site_id);
    setPending(p);
  }, [prospect.preview_site_id]);
  useEffect(() => { void reloadPitch(); }, [reloadPitch]);

  // Close on Escape — a drawer you can't dismiss with the keyboard feels trapped.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const meta = STAGE_META[prospect.stage];
  const wonEmail = contacts?.find((c) => c.email)?.email ?? '';
  const wonHref = `/garvis/client-billing?business=${encodeURIComponent(prospect.company_name)}${wonEmail ? `&email=${encodeURIComponent(wonEmail)}` : ''}&tier=website_automation`;
  const hasDemo = !!prospect.previewSlug;
  const alreadyPitched = prospect.stage === 'pitched' || prospect.stage === 'won';
  const chips = signalChips(prospect);

  const buildReview = async () => {
    setBuilding(true); setErr(null);
    try {
      const r = await buildDemoForReview(prospect.id);
      if (!r.ok) { setErr(r.error ?? 'Build failed.'); }
      else if (r.built && r.error) { toast('info', r.error); } // built, but no email to pitch
      await onRefresh();
      await reloadPitch();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Build failed.'); }
    finally { setBuilding(false); }
  };

  const doSend = async () => {
    if (pending === null || pending === 'loading') return;
    setSendPhase('sending'); setErr(null);
    try {
      const r = await sendPitch(pending.approval);
      if (r.ok) { setSendPhase('sent'); setPending(null); await onRefresh(); }
      else { setSendPhase('error'); setErr(r.error ?? 'Send failed.'); }
    } catch (e) { setSendPhase('error'); setErr(e instanceof Error ? e.message : 'Send failed.'); }
  };

  const doDiscard = async () => {
    if (pending === null || pending === 'loading') return;
    if (!window.confirm('Discard this pitch? The demo stays; only the queued email is dropped.')) return;
    try { await discardPitch(pending.approval.id); setPending(null); await onRefresh(); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Could not discard.'); }
  };

  const pitch = pending && pending !== 'loading' ? pending : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
      <div className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-forge-border bg-forge-bg shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-forge-border bg-forge-bg/95 px-4 py-3 backdrop-blur">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${meta.dot}`} />
              <span className={`text-[11px] font-medium uppercase tracking-wide ${meta.color}`}>{meta.label}</span>
              {!prospect.has_website && <span className="rounded border border-forge-warn/40 bg-forge-warn/10 px-1.5 py-0.5 text-[10px] font-medium text-forge-warn">no website</span>}
            </div>
            <h2 className="mt-1 truncate text-lg font-semibold text-forge-ink">{prospect.company_name}</h2>
            <p className="text-[11px] text-forge-dim">{nextAction(prospect.stage)}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-forge-dim hover:bg-forge-raised hover:text-forge-ink"><X size={16} /></button>
        </div>

        <div className="flex-1 space-y-4 px-4 py-4">
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {chips.map((c, i) => (
                <span key={i} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${c.tone === 'ok' ? 'bg-forge-ok/10 text-forge-ok' : 'bg-forge-heat/10 text-forge-heat'}`}>{c.label}</span>
              ))}
            </div>
          )}

          {/* THEY REPLIED — the strongest signal, up top. Read it here; jump to the Queue to answer. */}
          {prospect.replied && (
            <section className="rounded-xl border border-forge-ok/40 bg-forge-ok/[0.06] p-3">
              <div className="mb-1.5 flex items-center gap-1.5">
                <MessageSquareReply size={13} className="text-forge-ok" />
                <span className="text-[11px] font-medium uppercase tracking-wide text-forge-ok">They replied</span>
                {reply && reply.classification !== 'unclassified' && (
                  <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    reply.classification === 'positive' ? 'bg-forge-ok/15 text-forge-ok'
                    : reply.classification === 'negative' ? 'bg-forge-err/15 text-forge-err'
                    : 'bg-forge-border/40 text-forge-dim'}`}>{reply.classification}</span>
                )}
              </div>
              {reply ? (
                <>
                  {reply.subject && <div className="mb-1 truncate text-[12px] font-medium text-forge-ink">{reply.subject}</div>}
                  <p className="max-h-40 overflow-auto whitespace-pre-wrap text-[12px] text-forge-dim">{reply.body_text || '(no text)'}</p>
                </>
              ) : (
                <p className="flex items-center gap-1.5 text-[11px] text-forge-dim"><Loader2 size={11} className="animate-spin" /> Loading their reply…</p>
              )}
              <NavLink to="/garvis/queue" className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-forge-ember hover:underline">
                Answer in the Queue <ExternalLink size={10} />
              </NavLink>
            </section>
          )}

          {/* Identity */}
          <section className="space-y-1.5 text-[12px] text-forge-dim">
            {prospect.category && <div className="text-forge-ink">{prospect.category}{prospect.keyword && prospect.keyword !== prospect.category ? <span className="text-forge-dim"> · {prospect.keyword}</span> : null}</div>}
            {(prospect.address || prospect.city || prospect.state) && (
              <div className="flex items-center gap-1.5"><MapPin size={12} /> {[prospect.address, prospect.city, prospect.state].filter(Boolean).join(', ')}</div>
            )}
            {prospect.phone && <div className="flex items-center gap-1.5"><Phone size={12} /> {prospect.phone}</div>}
            {prospect.website ? (
              <a href={prospect.website} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1.5 hover:text-forge-ember">
                <Globe size={12} /> {prospect.website.replace(/^https?:\/\//, '').replace(/\/$/, '')} <ExternalLink size={10} />
              </a>
            ) : (
              <div className="flex items-center gap-1.5 text-forge-warn"><Globe size={12} /> No website — the strongest sell</div>
            )}
          </section>

          {/* Compare: their site vs the demo */}
          <section className="rounded-xl border border-forge-border bg-forge-panel/40 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-forge-dim"><LayoutTemplate size={12} /> Their site vs the new demo</div>
            {hasDemo ? (
              <div className="flex flex-wrap items-center gap-2">
                {prospect.website && (
                  <a href={prospect.website} target="_blank" rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 rounded-lg border border-forge-border px-2.5 py-1 text-[11px] text-forge-dim hover:text-forge-ink">
                    Their site today <ExternalLink size={10} />
                  </a>
                )}
                <a href={`/preview-site/${prospect.previewSlug}`} target="_blank" rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 rounded-lg border border-forge-ember/40 px-2.5 py-1 text-[11px] text-forge-ember hover:bg-forge-ember/10">
                  Open the new demo <ExternalLink size={10} />
                </a>
                {prospect.previewStatus && <span className="text-[10.5px] text-forge-dim">demo: {prospect.previewStatus}</span>}
              </div>
            ) : (
              <p className="text-[12px] text-forge-dim">No demo yet — build one to review the email and the before/after.</p>
            )}
          </section>

          {/* THE EMAIL — read it before it sends. The HTML already includes the before/after. */}
          {pitch && (
            <section className="rounded-xl border border-forge-border bg-forge-panel/40 p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-forge-dim"><Mail size={12} /> The email {pitch.toEmail ? <span className="ml-auto normal-case text-forge-dim">to {pitch.toEmail}</span> : null}</div>
              <div className="mb-2 text-[12px]"><span className="text-forge-dim">Subject: </span><span className="font-medium text-forge-ink">{pitch.subject}</span></div>
              {pitch.bodyHtml ? (
                <iframe title="Email preview" srcDoc={pitch.bodyHtml} sandbox=""
                  className="h-96 w-full rounded-lg border border-forge-border bg-white" />
              ) : (
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-forge-border bg-forge-bg p-2 text-[11.5px] text-forge-ink">{pitch.bodyText}</pre>
              )}
            </section>
          )}

          {/* Scraped contacts */}
          <section>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-forge-dim"><Mail size={12} /> Contacts</div>
            {contacts === null ? (
              <p className="flex items-center gap-1.5 text-[11px] text-forge-dim"><Loader2 size={11} className="animate-spin" /> Loading…</p>
            ) : contacts.length === 0 ? (
              <p className="text-[11px] text-forge-dim">None scraped yet{hasDemo ? '' : ' — build the demo to find their email'}.</p>
            ) : (
              <ul className="space-y-1">
                {contacts.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-forge-border/60 bg-forge-bg/40 px-2.5 py-1.5 text-[12px]">
                    <span className="truncate text-forge-ink">{c.email ?? c.phone ?? c.full_name ?? '—'}</span>
                    {c.email_status && c.email_status !== 'unknown' && (
                      <span className={`shrink-0 text-[10px] ${c.email_status === 'unsubscribed' || c.email_status === 'bounced' || c.email_status === 'complained' ? 'text-forge-err' : 'text-forge-dim'}`}>{c.email_status}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {err && <p className="text-[12px] text-forge-err">{err}</p>}
        </div>

        {/* Action bar */}
        <div className="sticky bottom-0 space-y-2 border-t border-forge-border bg-forge-bg/95 px-4 py-3 backdrop-blur">
          {sendPhase === 'sent' ? (
            <div className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-forge-ok/40 py-2.5 text-sm font-semibold text-forge-ok"><Check size={15} /> Sent</div>
          ) : pitch ? (
            <div className="flex items-center gap-2">
              <button onClick={() => void doSend()} disabled={sendPhase === 'sending'}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-forge-ember py-2.5 text-sm font-semibold text-forge-bg shadow transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60">
                {sendPhase === 'sending' ? <><Loader2 size={15} className="animate-spin" /> Sending…</> : <><Send size={15} /> Send this pitch</>}
              </button>
              <button onClick={() => void doDiscard()} disabled={sendPhase === 'sending'} title="Drop the queued email (keep the demo)"
                className="flex items-center justify-center gap-1.5 rounded-lg border border-forge-border px-3 py-2 text-[13px] text-forge-dim hover:text-forge-err"><Trash2 size={14} /></button>
            </div>
          ) : !hasDemo && canBuildAndSend(prospect.stage) ? (
            <button onClick={() => void buildReview()} disabled={building}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-forge-ember py-2.5 text-sm font-semibold text-forge-bg shadow transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60">
              {building ? <><Loader2 size={15} className="animate-spin" /> Building the demo…</> : <><Hammer size={15} /> Build demo to review</>}
            </button>
          ) : hasDemo && !alreadyPitched && pending !== 'loading' ? (
            <p className="text-center text-[12px] text-forge-dim">Demo built — no public email was found, so there’s nothing to send.</p>
          ) : alreadyPitched ? (
            <div className="flex items-center justify-center gap-1.5 text-[12px] text-forge-heat"><Eye size={13} /> Pitched — waiting on a reply</div>
          ) : pending === 'loading' ? (
            <div className="flex items-center justify-center gap-1.5 py-1 text-[12px] text-forge-dim"><Loader2 size={13} className="animate-spin" /> Loading the pitch…</div>
          ) : null}

          <div className="flex items-center gap-2">
            <NavLink to={wonHref}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-forge-ok/40 py-2 text-[13px] font-medium text-forge-ok hover:bg-forge-ok/10">
              <Trophy size={14} /> Won it
            </NavLink>
            {prospect.stage === 'skipped' ? (
              <button onClick={() => onSkipToggle(prospect)}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-forge-border px-3 py-2 text-[13px] text-forge-dim hover:text-forge-ink"><RotateCcw size={14} /> Reopen</button>
            ) : (
              <button onClick={() => onSkipToggle(prospect)}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-forge-border px-3 py-2 text-[13px] text-forge-dim hover:text-forge-ink"><Archive size={14} /> Skip</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
