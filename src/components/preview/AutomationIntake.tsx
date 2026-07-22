// src/components/preview/AutomationIntake.tsx
// The custom-automation ask, on the PUBLIC preview. The website lands the deal; THIS turns the visit
// into a conversation about running their operations. A prospect types how they work (bookings,
// enquiries, invoices, follow-ups) and we tell them — honestly — which of our REAL automations fit.
// The detection + lead-landing happen server-side (automation-intake edge fn → intakeAutomations,
// deliverable-only); this component only collects the words and shows back what the server returned.
// Self-themed: it re-applies the preview's own theme vars on its root so it feels like part of the
// site even though it renders as a sibling of the themed .pv-site tree.

import { useState } from 'react';
import { Wand2, ArrowRight, Check } from 'lucide-react';
import type { SiteSpec } from '../../lib/preview/spec';
import { submitAutomationIntake, type IntakeProposal } from '../../lib/preview/engine';
import { offerStatsFor } from '../../lib/garvis/automationStats';

export function AutomationIntake({ previewSiteId, businessName, theme }: {
  previewSiteId: string; businessName: string; theme: SiteSpec['theme'];
}) {
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ matched: boolean; proposals: IntakeProposal[] } | null>(null);

  // The same theme vars PreviewSiteRenderer applies on .pv-site — re-applied here so this section is
  // themed correctly whether or not it sits inside that tree.
  const vars = {
    '--p': theme.primary, '--pi': theme.primaryInk, '--bg': theme.bg, '--ink': theme.ink,
    '--mut': theme.muted, '--card': theme.card, '--bor': theme.border, '--r': `${theme.radius}px`,
    fontFamily: `"${theme.bodyFont}", Inter, ui-sans-serif, system-ui, sans-serif`,
  } as React.CSSProperties;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (description.trim().length < 8) { setError('Tell me a little about how you run things first.'); return; }
    setBusy(true); setError('');
    const res = await submitAutomationIntake({ previewSiteId, description, email: email.trim() || undefined });
    setBusy(false);
    if (res.ok) setResult({ matched: !!res.matched, proposals: res.proposals ?? [] });
    else setError('Something went wrong — please try again.');
  };

  return (
    <section style={vars} className="bg-[hsl(var(--bg))] px-5 pb-36 pt-16 text-[hsl(var(--ink))]">
      <div className="mx-auto max-w-2xl">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[hsl(var(--bor))] bg-[hsl(var(--card))] px-3 py-1 text-xs font-medium text-[hsl(var(--mut))]">
          <Wand2 size={13} className="text-[hsl(var(--p))]" /> Automation
        </div>
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl"
          style={{ fontFamily: `"${theme.displayFont}", "${theme.bodyFont}", ui-sans-serif, sans-serif` }}>
          Want it to run your business too?
        </h2>
        <p className="mt-2 text-sm text-[hsl(var(--mut))] sm:text-base">
          Tell me how you operate day to day — how bookings come in, how you handle enquiries,
          invoices, follow-ups — and I&rsquo;ll show you exactly what I&rsquo;d automate for {businessName}.
        </p>

        {/* ROI PROOF — industry stats that justify the automation spend, shown at the offer. These are
            INDUSTRY figures (labeled + sourced), never a fabricated per-prospect number — see the honesty
            rule in automationStats.ts. Only DELIVERABLE, always-applicable automations appear here
            (review requests, win-back, lead follow-up — all GA, any vertical); we never advertise a stat
            for a capability we can't yet run (e.g. missed-call text-back is not_built). */}
        <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
          {offerStatsFor(['review_request', 'reactivation', 'lead_followup']).map((b, i) => {
            const p = b.points[0];
            return (
              <div key={i} className="rounded-[var(--r)] border border-[hsl(var(--bor))] bg-[hsl(var(--card))] p-3.5">
                <p className="text-lg font-bold text-[hsl(var(--p))]">{p.stat}</p>
                <p className="mt-0.5 text-xs leading-snug text-[hsl(var(--mut))]">{p.note}</p>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] text-[hsl(var(--mut))]">Industry data — home-services, 2026.</p>

        {result ? (
          <div className="mt-6 rounded-[var(--r)] border border-[hsl(var(--bor))] bg-[hsl(var(--card))] p-5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--p)/0.12)] text-[hsl(var(--p))]"><Check size={16} /></span>
              <p className="text-sm font-semibold">Got it — I&rsquo;ll follow up personally.</p>
            </div>
            {result.proposals.length > 0 ? (
              <>
                <p className="mt-4 text-sm text-[hsl(var(--mut))]">From what you described, here&rsquo;s what I&rsquo;d set up:</p>
                <ul className="mt-3 space-y-2.5">
                  {result.proposals.map((p, i) => (
                    <li key={i} className="rounded-[var(--r)] border border-[hsl(var(--bor))] bg-[hsl(var(--bg))] p-3.5">
                      <p className="text-sm font-semibold">{p.title} <span className="font-normal text-[hsl(var(--mut))]">— from {p.monthlyPrice}</span></p>
                      <p className="mt-0.5 text-sm text-[hsl(var(--mut))]">{p.pitch}</p>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-xs text-[hsl(var(--mut))]">Nothing runs until you approve it. No obligation.</p>
              </>
            ) : (
              <p className="mt-4 text-sm text-[hsl(var(--mut))]">
                I&rsquo;ve got exactly how you work — I&rsquo;ll map out the automations that fit and walk you through them. Nothing runs until you approve it.
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="mt-6">
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)} rows={5}
              placeholder="e.g. Customers call to book, I answer every enquiry myself, and I chase invoices by hand at month end…"
              className="w-full rounded-[var(--r)] border border-[hsl(var(--bor))] bg-[hsl(var(--card))] px-4 py-3 text-sm text-[hsl(var(--ink))] outline-none focus:border-[hsl(var(--p))]"
            />
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional — where to send it)"
                className="flex-1 rounded-[var(--r)] border border-[hsl(var(--bor))] bg-[hsl(var(--card))] px-4 py-3 text-sm text-[hsl(var(--ink))] outline-none focus:border-[hsl(var(--p))]"
              />
              <button type="submit" disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-[var(--r)] bg-[hsl(var(--p))] px-5 py-3 text-sm font-semibold text-[hsl(var(--pi))] shadow-lg transition-transform hover:-translate-y-0.5 disabled:opacity-60">
                {busy ? 'Reading…' : 'Show me what you’d automate'} <ArrowRight size={14} />
              </button>
            </div>
            {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
          </form>
        )}
      </div>
    </section>
  );
}
