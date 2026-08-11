// src/components/preview/ClaimBar.tsx
// The "yes" button — a floating bar on every PUBLIC preview that lets the business owner claim
// the site (name + contact, no login). A flawless preview with no next step converts at zero;
// this is the step. Styled with the preview's own theme vars so it feels like part of the gift,
// not an ad slapped on top.
//
// THE PICKER: the cold email deliberately carries no per-item automation prices (a stack of
// ranges reads as a bill) — it points here instead. The expanded panel shows the pick-what-you-
// want menu (automationMenu core, derived from the capability registry for THIS vertical):
// checkboxes with honest per-item ranges, a live total, and the site priced independently so
// "pick nothing" is a visibly fine answer. Ticked picks ride the ask path (the operator confirms
// the exact monthly before anything is charged — ranges never masquerade as a cart); the two
// fixed Stripe tiers stay for decisive buyers. One orange primary per state (doctrine): picks
// selected → "Get my exact quote"; none → the automation tier buy.

import { useMemo, useState } from 'react';
import { X, ArrowRight, Check, FileText, Rocket, Loader2 } from 'lucide-react';
import { submitPublishRequest, recordPreviewEvent, startClientCheckout } from '../../lib/preview/engine';
import { tierById } from '../../lib/garvis/billing/clientTiers';
import { menuForIndustry, selectionTotal, totalLabel, startingAtLabel, picksSummary } from '../../lib/preview/automationMenu';

// The public ask matches the tier the operator actually sells (clientTiers is the single source of
// truth) — a hardcoded number here once publicly undercut the real offer by 5x.
const WEBSITE_PRICE = (tierById('website')?.priceHint ?? 'from $1,500').replace(/\s+one-time$/, '');
// The upsell ladder: the website lands the deal; the automation tier is the selectable upgrade.
const AUTOMATION_TIER = tierById('website_automation');
const AUTOMATION_PRICE = (AUTOMATION_TIER?.priceHint ?? 'from $500/mo').replace(/^from\s+/, '');

export function ClaimBar({ previewSiteId, businessName, slug, industry = '', price = WEBSITE_PRICE }: {
  previewSiteId: string; businessName: string; slug: string; industry?: string; price?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const [picks, setPicks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [buying, setBuying] = useState<'website' | 'website_automation' | null>(null);
  const [done, setDone] = useState<'quote' | 'question' | null>(null);
  const [error, setError] = useState('');

  // The menu is registry data filtered to this vertical — pure, so it's computed once per industry.
  const menu = useMemo(() => menuForIndustry(industry), [industry]);
  const total = totalLabel(selectionTotal(menu, picks));
  const startingAt = startingAtLabel(menu);

  if (hidden) return null;

  const togglePick = (id: string) =>
    setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

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

  // The ask path — with picks it's a quote request (the operator confirms the exact monthly);
  // without, a plain question. Either way the picks + note land verbatim in the Claims lane and
  // the lead rail (claim-submit), so the follow-up conversation starts from what they chose.
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    const res = await submitPublishRequest({
      previewSiteId, name, contact,
      message: picksSummary(menu, picks, message),
    });
    setBusy(false);
    if (res.ok) setDone(picks.length ? 'quote' : 'question');
    else setError('Something went wrong — please try again.');
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4">
      <div className="mx-auto max-w-3xl rounded-2xl border border-[hsl(var(--bor))] bg-[hsl(var(--card))] shadow-2xl">
        {!open ? (
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
            <p className="min-w-0 flex-1 text-sm text-[hsl(var(--ink))]">
              <span className="font-semibold">This website was built for {businessName}.</span>{' '}
              <span className="text-[hsl(var(--mut))]">
                {price} once — add automation only if you want it{startingAt ? `, ${startingAt}` : ''}, picked à la carte.
              </span>
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
              <p className="text-sm font-semibold text-[hsl(var(--ink))]">
                {done === 'quote'
                  ? 'Got your picks — we’ll confirm the exact monthly and set it up.'
                  : 'Got it — we’ll be in touch within one business day.'}
              </p>
              <p className="text-xs text-[hsl(var(--mut))]">Nothing publishes until you approve everything. No obligation.</p>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="max-h-[80vh] overflow-y-auto px-5 py-4">
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

            {/* THE MENU — the website priced alone, then add-ons as checkable line items. The
                per-item ranges live HERE (not the email) because next to a checkbox a range is a
                choice; the total updates live so the panel never feels like fine print. */}
            <div className="mt-3 rounded-[var(--r)] border border-[hsl(var(--bor))] bg-[hsl(var(--bg))] px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium text-[hsl(var(--ink))]">The website</p>
                <p className="text-sm font-semibold text-[hsl(var(--ink))]">{price} once</p>
              </div>
              <p className="mt-0.5 text-[11px] text-[hsl(var(--mut))]">Live on your domain in a day, hosting included. It works fine with nothing added.</p>
              {menu.length > 0 && (
                <>
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--mut))]">Add only what you want — per month, cancel anytime</p>
                  <div className="mt-1.5 grid gap-1">
                    {menu.map((item) => (
                      <label key={item.id} className="flex cursor-pointer items-baseline gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-[hsl(var(--card))]">
                        <input type="checkbox" checked={picks.includes(item.id)} onChange={() => togglePick(item.id)}
                          className="relative top-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--p))]" />
                        <span className="min-w-0 flex-1">
                          <span className="text-sm font-medium text-[hsl(var(--ink))]">{item.title}</span>
                          <span className="block text-[11px] leading-snug text-[hsl(var(--mut))]">{item.pitch}</span>
                        </span>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-[hsl(var(--ink))]">{item.priceLabel}</span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-[hsl(var(--bor))] pt-2">
                    <p className="text-xs text-[hsl(var(--mut))]">{picks.length ? `Your picks (${picks.length})` : 'Nothing picked — just the site'}</p>
                    <p className="text-sm font-semibold text-[hsl(var(--ink))]">{picks.length && total ? `${price} once + ${total}` : `${price} once`}</p>
                  </div>
                </>
              )}
            </div>

            {/* One orange primary per state: picks → the exact-quote ask (ranges never masquerade
                as a cart); no picks → the automation-tier checkout, with the site-only buy beside. */}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {picks.length > 0 ? (
                <button type="submit" disabled={busy}
                  className="flex flex-col items-start gap-0.5 rounded-[var(--r)] bg-[hsl(var(--p))] px-4 py-3 text-left text-[hsl(var(--pi))] shadow-lg transition-transform hover:-translate-y-0.5 disabled:opacity-60">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                    Get my exact quote{total ? ` — ~${total}` : ''}
                  </span>
                  <span className="text-[11px] opacity-90">we confirm the monthly before anything is charged</span>
                </button>
              ) : AUTOMATION_TIER ? (
                <button type="button" onClick={() => void buyNow('website_automation')} disabled={!!buying}
                  className="flex flex-col items-start gap-0.5 rounded-[var(--r)] bg-[hsl(var(--p))] px-4 py-3 text-left text-[hsl(var(--pi))] shadow-lg transition-transform hover:-translate-y-0.5 disabled:opacity-60">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    {buying === 'website_automation' ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                    Site + full automation — {AUTOMATION_PRICE}
                  </span>
                  <span className="text-[11px] opacity-90">everything above, managed for you · live in a day</span>
                </button>
              ) : null}
              <button type="button" onClick={() => void buyNow('website')} disabled={!!buying}
                className="flex flex-col items-start gap-0.5 rounded-[var(--r)] border border-[hsl(var(--bor))] bg-[hsl(var(--bg))] px-4 py-3 text-left text-[hsl(var(--ink))] transition-transform hover:-translate-y-0.5 disabled:opacity-60">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  {buying === 'website' ? <Loader2 size={14} className="animate-spin" /> : null}
                  Just the site — {price} once
                </span>
                <span className="text-[11px] text-[hsl(var(--mut))]">one-time · hosting included</span>
              </button>
            </div>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} placeholder="Tell us how you run things — or ask anything (optional)"
              className="mt-3 w-full rounded-[var(--r)] border border-[hsl(var(--bor))] bg-[hsl(var(--bg))] px-3.5 py-2.5 text-sm text-[hsl(var(--ink))] outline-none focus:border-[hsl(var(--p))]" />
            {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
            <div className="mt-3 flex items-center gap-3">
              {picks.length === 0 && (
                <button type="submit" disabled={busy}
                  className="inline-flex items-center gap-2 rounded-[var(--r)] border border-[hsl(var(--bor))] px-4 py-2 text-sm font-medium text-[hsl(var(--mut))] transition-colors hover:text-[hsl(var(--ink))] disabled:opacity-60">
                  {busy ? 'Sending…' : 'Or just ask a question'} <ArrowRight size={14} />
                </button>
              )}
              <p className="text-xs text-[hsl(var(--mut))]">Secure checkout by Stripe. Cancel anytime.</p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
