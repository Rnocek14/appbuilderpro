// src/components/preview/ClaimBar.tsx
// The "yes" button — a floating bar on every PUBLIC preview that lets the business owner claim
// the site (name + contact, no login). A flawless preview with no next step converts at zero;
// this is the step. Styled with the preview's own theme vars so it feels like part of the gift,
// not an ad slapped on top.

import { useState } from 'react';
import { X, ArrowRight, Check, FileText, Rocket, Loader2 } from 'lucide-react';
import { submitPublishRequest, recordPreviewEvent, startClientCheckout } from '../../lib/preview/engine';
import { tierById } from '../../lib/garvis/billing/clientTiers';

// The public ask matches the tier the operator actually sells (clientTiers is the single source of
// truth) — a hardcoded number here once publicly undercut the real offer by 5x.
const WEBSITE_PRICE = (tierById('website')?.priceHint ?? 'from $1,500').replace(/\s+one-time$/, '');
// The upsell ladder: the website lands the deal; the automation tier is the selectable upgrade.
const AUTOMATION_TIER = tierById('website_automation');
const AUTOMATION_PRICE = (AUTOMATION_TIER?.priceHint ?? 'from $500/mo').replace(/^from\s+/, '');

export function ClaimBar({ previewSiteId, businessName, slug, price = WEBSITE_PRICE }: {
  previewSiteId: string; businessName: string; slug: string; price?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [buying, setBuying] = useState<'website' | 'website_automation' | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  if (hidden) return null;

  // MAKE IT MINE → straight to the operator's Stripe checkout (email prefilled from the contact
  // field when it looks like one). If checkout isn't configured, the operator is notified and we tell
  // the prospect honestly instead of dropping them on a dead button.
  const buyNow = async (tier: 'website' | 'website_automation') => {
    setBuying(tier); setError('');
    recordPreviewEvent(previewSiteId, 'claim_open');
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact.trim()) ? contact.trim() : undefined;
    const res = await startClientCheckout({ previewSiteId, tier, email });
    if (res.ok && res.url) { window.location.href = res.url; return; }
    setBuying(null);
    setError(res.error ?? 'Checkout isn’t available right now.');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    // The "or just ask" path — a plain lead the operator follows up (the pay path is the buttons above).
    const res = await submitPublishRequest({ previewSiteId, name, contact, message });
    setBusy(false);
    if (res.ok) setDone(true);
    else setError('Something went wrong — please try again.');
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4">
      <div className="mx-auto max-w-3xl rounded-2xl border border-[hsl(var(--bor))] bg-[hsl(var(--card))] shadow-2xl">
        {!open ? (
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
            <p className="min-w-0 flex-1 text-sm text-[hsl(var(--ink))]">
              <span className="font-semibold">This website was built for {businessName}.</span>{' '}
              <span className="text-[hsl(var(--mut))]">Like it? It can be live on your domain within a day.</span>
            </p>
            <a href={`/preview-site/${slug}/report`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[hsl(var(--mut))] underline-offset-2 hover:underline">
              <FileText size={13} /> Why we rebuilt it
            </a>
            <button
              onClick={() => { recordPreviewEvent(previewSiteId, 'claim_open'); setOpen(true); }}
              className="inline-flex items-center gap-2 rounded-[var(--r)] bg-[hsl(var(--p))] px-5 py-2.5 text-sm font-semibold text-[hsl(var(--pi))] shadow-lg transition-transform hover:-translate-y-0.5"
            >
              Claim this website — {price} <ArrowRight size={14} />
            </button>
            <button onClick={() => setHidden(true)} aria-label="Dismiss" className="p-1 text-[hsl(var(--mut))] hover:text-[hsl(var(--ink))]">
              <X size={16} />
            </button>
          </div>
        ) : done ? (
          <div className="flex items-center gap-3 px-5 py-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--p)/0.12)] text-[hsl(var(--p))]"><Check size={18} /></span>
            <div>
              <p className="text-sm font-semibold text-[hsl(var(--ink))]">Got it — we'll be in touch within one business day.</p>
              <p className="text-xs text-[hsl(var(--mut))]">Nothing publishes until you approve everything. No obligation.</p>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-[hsl(var(--ink))]">Claim this website for {businessName}</p>
              <button type="button" onClick={() => setOpen(false)} aria-label="Back" className="p-1 text-[hsl(var(--mut))] hover:text-[hsl(var(--ink))]"><X size={16} /></button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name"
                className="rounded-[var(--r)] border border-[hsl(var(--bor))] bg-[hsl(var(--bg))] px-3.5 py-2.5 text-sm text-[hsl(var(--ink))] outline-none focus:border-[hsl(var(--p))]" />
              <input required value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Email or phone"
                className="rounded-[var(--r)] border border-[hsl(var(--bor))] bg-[hsl(var(--bg))] px-3.5 py-2.5 text-sm text-[hsl(var(--ink))] outline-none focus:border-[hsl(var(--p))]" />
            </div>
            {/* MAKE IT MINE — pay and go live now. Leads with the monthly plan (site + automation);
                the one-time website is the alternative. Straight to secure Stripe checkout. */}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {AUTOMATION_TIER && (
                <button type="button" onClick={() => void buyNow('website_automation')} disabled={!!buying}
                  className="flex flex-col items-start gap-0.5 rounded-[var(--r)] bg-[hsl(var(--p))] px-4 py-3 text-left text-[hsl(var(--pi))] shadow-lg transition-transform hover:-translate-y-0.5 disabled:opacity-60">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    {buying === 'website_automation' ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                    Make it mine — {AUTOMATION_PRICE}
                  </span>
                  <span className="text-[11px] opacity-90">site + automation · live in a day</span>
                </button>
              )}
              <button type="button" onClick={() => void buyNow('website')} disabled={!!buying}
                className="flex flex-col items-start gap-0.5 rounded-[var(--r)] border border-[hsl(var(--bor))] bg-[hsl(var(--bg))] px-4 py-3 text-left text-[hsl(var(--ink))] transition-transform hover:-translate-y-0.5 disabled:opacity-60">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  {buying === 'website' ? <Loader2 size={14} className="animate-spin" /> : null}
                  Just the site — {price} once
                </span>
                <span className="text-[11px] text-[hsl(var(--mut))]">one-time · hosting included</span>
              </button>
            </div>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} placeholder="Not ready to buy? Ask a question or tell us what you'd change (optional)"
              className="mt-3 w-full rounded-[var(--r)] border border-[hsl(var(--bor))] bg-[hsl(var(--bg))] px-3.5 py-2.5 text-sm text-[hsl(var(--ink))] outline-none focus:border-[hsl(var(--p))]" />
            {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
            <div className="mt-3 flex items-center gap-3">
              <button type="submit" disabled={busy}
                className="inline-flex items-center gap-2 rounded-[var(--r)] border border-[hsl(var(--bor))] px-4 py-2 text-sm font-medium text-[hsl(var(--mut))] transition-colors hover:text-[hsl(var(--ink))] disabled:opacity-60">
                {busy ? 'Sending…' : 'Or just ask a question'} <ArrowRight size={14} />
              </button>
              <p className="text-xs text-[hsl(var(--mut))]">Secure checkout by Stripe. Cancel anytime.</p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
