// src/components/prospects/ProspectDrawer.tsx
// The prospect DETAIL drawer — a right-side slide-over opened from a row in the Prospects pipeline. It
// gathers everything known about one prospect (identity, the demo we built, the emails we scraped, the
// stage + next action) and puts the whole "what do I do with this one" decision in one place: build &
// send, view the demo, mark it won (deep-links to the billing book pre-filled), or skip/reopen.

import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  X, MapPin, Globe, Phone, ExternalLink, Send, Loader2, Check, Mail, Trophy, Archive, RotateCcw, LayoutTemplate,
} from 'lucide-react';
import { STAGE_META, nextAction, canBuildAndSend, signalChips } from '../../lib/garvis/prospects/stage';
import { loadProspectContacts, type Prospect, type ProspectContact } from '../../lib/garvis/prospects/prospectsRun';

type SendState = { phase: 'sending' } | { phase: 'sent'; note?: string } | { phase: 'error'; msg: string };

export function ProspectDrawer({ prospect, send, onBuildSend, onSkipToggle, onClose }: {
  prospect: Prospect;
  send: SendState | undefined;
  onBuildSend: (id: string) => void;
  onSkipToggle: (p: Prospect) => void;
  onClose: () => void;
}) {
  const [contacts, setContacts] = useState<ProspectContact[] | null>(null);
  useEffect(() => {
    let live = true;
    setContacts(null);
    void loadProspectContacts(prospect.profileId).then((c) => { if (live) setContacts(c); });
    return () => { live = false; };
  }, [prospect.profileId]);

  // Close on Escape — a drawer you can't dismiss with the keyboard feels trapped.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const meta = STAGE_META[prospect.stage];
  const wonEmail = contacts?.find((c) => c.email)?.email ?? '';
  const wonHref = `/garvis/client-billing?business=${encodeURIComponent(prospect.company_name)}${wonEmail ? `&email=${encodeURIComponent(wonEmail)}` : ''}&tier=website_automation`;
  const canBuild = canBuildAndSend(prospect.stage);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* backdrop */}
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
      {/* panel */}
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-forge-border bg-forge-bg shadow-2xl">
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
          {/* Post-send signals — the buy signals, up top so they're the first thing you see. */}
          {(() => {
            const chips = signalChips(prospect);
            return chips.length ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {chips.map((c, i) => (
                  <span key={i} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${c.tone === 'ok' ? 'bg-forge-ok/10 text-forge-ok' : 'bg-forge-heat/10 text-forge-heat'}`}>{c.label}</span>
                ))}
              </div>
            ) : null;
          })()}

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

          {/* The demo */}
          <section className="rounded-xl border border-forge-border bg-forge-panel/40 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-forge-dim"><LayoutTemplate size={12} /> Their demo</div>
            {prospect.previewSlug ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] text-forge-ink">Built{prospect.previewStatus ? ` · ${prospect.previewStatus}` : ''}</span>
                <a href={`/preview-site/${prospect.previewSlug}`} target="_blank" rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 rounded-lg border border-forge-border px-2.5 py-1 text-[11px] text-forge-dim hover:text-forge-ember">
                  View <ExternalLink size={10} />
                </a>
              </div>
            ) : (
              <p className="text-[12px] text-forge-dim">No demo yet — Build &amp; send scrapes their site + photos and builds one.</p>
            )}
          </section>

          {/* Scraped contacts */}
          <section>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-forge-dim"><Mail size={12} /> Contacts</div>
            {contacts === null ? (
              <p className="flex items-center gap-1.5 text-[11px] text-forge-dim"><Loader2 size={11} className="animate-spin" /> Loading…</p>
            ) : contacts.length === 0 ? (
              <p className="text-[11px] text-forge-dim">None scraped yet{prospect.previewSlug ? '' : ' — build the demo to find their email'}.</p>
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

          {send?.phase === 'error' && <p className="text-[12px] text-forge-err">{send.msg}</p>}
          {send?.phase === 'sent' && send.note && <p className="text-[12px] text-forge-dim">{send.note}</p>}
        </div>

        {/* Action bar */}
        <div className="sticky bottom-0 space-y-2 border-t border-forge-border bg-forge-bg/95 px-4 py-3 backdrop-blur">
          {canBuild && (
            send?.phase === 'sent' && !send.note ? (
              <div className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-forge-ok/40 py-2.5 text-sm font-semibold text-forge-ok"><Check size={15} /> Sent</div>
            ) : (
              <button onClick={() => onBuildSend(prospect.id)} disabled={send?.phase === 'sending'}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-forge-ember py-2.5 text-sm font-semibold text-forge-bg shadow transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60">
                {send?.phase === 'sending' ? <><Loader2 size={15} className="animate-spin" /> Building…</> : <><Send size={15} /> {prospect.previewSlug ? 'Send again' : 'Build & send'}</>}
              </button>
            )
          )}
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
