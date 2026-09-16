// src/components/prospects/ProspectDrawer.tsx
// ONE BUSINESS, up close — a right-side panel opened from a row on "Businesses to pitch". This is where
// the deliberate half of the job happens: build them a website, then READ the actual email (subject plus
// the rendered HTML, which already shows their site today next to the new one), and only then send it.
// Plus: open the site we built, record that they became a client (deep-links to the billing book already
// filled in), or pass on them. Everything known about one business, in one place.
//
// The words here were rewritten alongside the list page. They are the same words the list uses for the
// same things — the stage names come from STAGE_META, so the panel can never disagree with the row that
// opened it — and no control is named after the table it writes to.

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
      if (!r.ok) { setErr(r.error ?? "We couldn't build their website. Try again."); }
      else if (r.built && r.error) { toast('info', r.error); } // built, but no email to pitch
      await onRefresh();
      await reloadPitch();
    } catch (e) { setErr(e instanceof Error ? e.message : "We couldn't build their website."); }
    finally { setBuilding(false); }
  };

  const doSend = async () => {
    if (pending === null || pending === 'loading') return;
    setSendPhase('sending'); setErr(null);
    try {
      const r = await sendPitch(pending.approval);
      if (r.ok) { setSendPhase('sent'); setPending(null); await onRefresh(); }
      else { setSendPhase('error'); setErr(r.error ?? "The email didn't send."); }
    } catch (e) { setSendPhase('error'); setErr(e instanceof Error ? e.message : "The email didn't send."); }
  };

  const doDiscard = async () => {
    if (pending === null || pending === 'loading') return;
    if (!window.confirm('Throw this email away? The website we built for them stays — only the email is dropped.')) return;
    try { await discardPitch(pending.approval.id); setPending(null); await onRefresh(); }
    catch (e) { toast('error', e instanceof Error ? e.message : "We couldn't throw the email away."); }
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
          <button onClick={onClose} aria-label="Close this business" className="rounded-lg p-1.5 text-forge-dim hover:bg-forge-raised hover:text-forge-ink"><X size={16} /></button>
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
                <span className="text-[11px] font-medium uppercase tracking-wide text-forge-ok">They wrote back</span>
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
                <p className="flex items-center gap-1.5 text-[11px] text-forge-dim"><Loader2 size={11} className="animate-spin" /> Loading what they said…</p>
              )}
              <NavLink to="/garvis/queue" className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-forge-ember hover:underline">
                Answer them <ExternalLink size={10} />
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
              <div className="flex items-center gap-1.5 text-forge-warn"><Globe size={12} /> No website at all — the easiest kind to sell</div>
            )}
          </section>

          {/* Compare: their site vs the demo */}
          <section className="rounded-xl border border-forge-border bg-forge-panel/40 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-forge-dim"><LayoutTemplate size={12} /> {prospect.website ? 'Their website now, and the one we built' : 'The website we built for them'}</div>
            {hasDemo ? (
              <div className="flex flex-wrap items-center gap-2">
                {prospect.website && (
                  <a href={prospect.website} target="_blank" rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 rounded-lg border border-forge-border px-2.5 py-1 text-[11px] text-forge-dim hover:text-forge-ink">
                    Open their website <ExternalLink size={10} />
                  </a>
                )}
                <a href={`/preview-site/${prospect.previewSlug}`} target="_blank" rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 rounded-lg border border-forge-ember/40 px-2.5 py-1 text-[11px] text-forge-ember hover:bg-forge-ember/10">
                  Open the site we built <ExternalLink size={10} />
                </a>
              </div>
            ) : (
              <p className="text-[12px] text-forge-dim">Nothing built yet. Build them a website and we'll write the email to go with it.</p>
            )}
          </section>

          {/* THE EMAIL — read it before it sends. The HTML already includes the before/after. */}
          {pitch && (
            <section className="rounded-xl border border-forge-border bg-forge-panel/40 p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-forge-dim"><Mail size={12} /> The email we wrote {pitch.toEmail ? <span className="ml-auto normal-case text-forge-dim">to {pitch.toEmail}</span> : null}</div>
              <div className="mb-2 text-[12px]"><span className="text-forge-dim">Subject: </span><span className="font-medium text-forge-ink">{pitch.subject}</span></div>
              {pitch.bodyHtml ? (
                <iframe title="The email we wrote" srcDoc={pitch.bodyHtml} sandbox=""
                  className="h-96 w-full rounded-lg border border-forge-border bg-white" />
              ) : (
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-forge-border bg-forge-bg p-2 text-[11.5px] text-forge-ink">{pitch.bodyText}</pre>
              )}
            </section>
          )}

          {/* Scraped contacts */}
          <section>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-forge-dim"><Mail size={12} /> Their email addresses</div>
            {contacts === null ? (
              <p className="flex items-center gap-1.5 text-[11px] text-forge-dim"><Loader2 size={11} className="animate-spin" /> Loading…</p>
            ) : contacts.length === 0 ? (
              <p className="text-[11px] text-forge-dim">{hasDemo ? "We couldn't find one for them." : 'None yet — building their website is how we look for one.'}</p>
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
                {sendPhase === 'sending' ? <><Loader2 size={15} className="animate-spin" /> Sending…</> : <><Send size={15} /> Send this email</>}
              </button>
              <button onClick={() => void doDiscard()} disabled={sendPhase === 'sending'} aria-label="Throw this email away" title="Throw this email away — the website stays"
                className="flex items-center justify-center gap-1.5 rounded-lg border border-forge-border px-3 py-2 text-[13px] text-forge-dim hover:text-forge-err"><Trash2 size={14} /></button>
            </div>
          ) : !hasDemo && canBuildAndSend(prospect.stage) ? (
            <button onClick={() => void buildReview()} disabled={building}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-forge-ember py-2.5 text-sm font-semibold text-forge-bg shadow transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60">
              {building ? <><Loader2 size={15} className="animate-spin" /> Building their website…</> : <><Hammer size={15} /> Build their site and write the email</>}
            </button>
          ) : hasDemo && !alreadyPitched && pending !== 'loading' ? (
            <p className="text-center text-[12px] text-forge-dim">Their website is built, but we couldn’t find a public email address for them — so there’s nothing to send yet.</p>
          ) : alreadyPitched ? (
            <div className="flex items-center justify-center gap-1.5 text-[12px] text-forge-heat"><Eye size={13} /> Email sent — waiting to hear back</div>
          ) : pending === 'loading' ? (
            <div className="flex items-center justify-center gap-1.5 py-1 text-[12px] text-forge-dim"><Loader2 size={13} className="animate-spin" /> Loading the email…</div>
          ) : null}

          <div className="flex items-center gap-2">
            <NavLink to={wonHref}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-forge-ok/40 py-2 text-[13px] font-medium text-forge-ok hover:bg-forge-ok/10">
              <Trophy size={14} /> They became a client
            </NavLink>
            {prospect.stage === 'skipped' ? (
              <button onClick={() => onSkipToggle(prospect)}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-forge-border px-3 py-2 text-[13px] text-forge-dim hover:text-forge-ink"><RotateCcw size={14} /> Work this one again</button>
            ) : (
              <button onClick={() => onSkipToggle(prospect)}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-forge-border px-3 py-2 text-[13px] text-forge-dim hover:text-forge-ink"><Archive size={14} /> Pass on this one</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
