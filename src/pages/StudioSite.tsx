// src/pages/StudioSite.tsx
// THE STUDIO'S OWN WEBSITE — the page a prospect finds when they google the sender of the cold
// pitch. It closes the trust loop (email → demo → "who are these people?" → here → reply), so
// its one job is checkable credibility:
//   * the hero exhibit is the REAL engine assembling a demo live in the browser (DemoExhibit);
//   * pricing renders from the same capability registry the product enforces (automationMenu +
//     clientTiers) — the page cannot offer what the code can't deliver;
//   * the contact form runs the real lead rail when wired (site-events token in studio.ts) and
//     degrades to an honest "email us" panel when not — it never fake-submits;
//   * no testimonial theater — the candor block says we're new, on purpose (see studio.ts).
// Copy lives in src/content/studio.ts and is claims-gated by studio.verify.ts.
//
// Doctrine notes: work-first (the exhibit is the second thing on screen), ONE orange primary
// (the contact form's submit; every other button is quiet), zero-input value (demo renders and
// pricing shows without a single click). Design language matches the sites the studio sells:
// warm paper, ink serif display, one ember accent — deliberately NOT the app's dark chrome.

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Loader2, Mail } from 'lucide-react';
import { STUDIO, HOW_IT_WORKS, CANDOR, MENU_INDUSTRIES } from '../content/studio';
import { menuForIndustry, selectionTotal, totalLabel, picksSummary } from '../lib/preview/automationMenu';
import { tierById } from '../lib/garvis/billing/clientTiers';
import { supabaseUrl } from '../lib/supabase';

const DemoExhibit = lazy(() => import('./studio/DemoExhibit'));

const WEBSITE_PRICE = (tierById('website')?.priceHint ?? 'from $1,500').replace(/\s+one-time$/, '');

const INK = '#231c15';
const MUT = '#8a7d70';
const LINE = '#e7ddd1';
const ACCENT = '#c8501e';

/** Reveal-on-scroll without a library: adds .in when the block enters the viewport. */
function useReveal() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el?.classList.add('in');
      return;
    }
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }, { rootMargin: '-60px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

function Rise({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useReveal();
  return <div ref={ref} className={`studio-rise ${className}`}>{children}</div>;
}

export default function StudioSite() {
  // The preview renderer inside DemoExhibit stamps its own <title>/OG when it mounts; this page
  // owns the tab, so it re-asserts identity after every render of this component tree.
  useEffect(() => {
    document.title = `${STUDIO.name} — ${STUDIO.tagline}`;
  });

  // Mount the (heavy, lazy) exhibit only when its slot approaches the viewport.
  const exhibitSlot = useRef<HTMLDivElement | null>(null);
  const [showExhibit, setShowExhibit] = useState(false);
  useEffect(() => {
    const el = exhibitSlot.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { setShowExhibit(true); io.disconnect(); }
    }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // ── the à-la-carte menu (same core as the demo pages' claim bar) ──────────
  const [industry, setIndustry] = useState<string>(MENU_INDUSTRIES[0]);
  const menu = useMemo(() => menuForIndustry(industry === 'Other' ? '' : industry), [industry]);
  const [picks, setPicks] = useState<string[]>([]);
  const total = totalLabel(selectionTotal(menu, picks));
  const togglePick = (id: string) =>
    setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  useEffect(() => { setPicks([]); }, [industry]);

  // ── the contact form: real rail or honest degradation, never a fake submit ──
  const wired = !!STUDIO.formChannelToken;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wired) return;
    setSending(true); setError('');
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/site-events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: STUDIO.formChannelToken, kind: 'lead', source: 'studio-site',
          lead: { name, email, message: picksSummary(menu, picks, message) || message },
        }),
      });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; lead?: boolean };
      if (out.ok && out.lead) setSent(true);
      else setError(`That didn’t go through — email us instead: ${STUDIO.email}`);
    } catch {
      setError(`That didn’t go through — email us instead: ${STUDIO.email}`);
    }
    setSending(false);
  };

  return (
    <div className="min-h-screen bg-[#faf7f3] text-[#231c15]" style={{ color: INK }}>
      <style>{`
        .studio-rise{opacity:0;transform:translateY(14px);transition:opacity .6s ease,transform .6s ease}
        .studio-rise.in{opacity:1;transform:none}
        .studio-serif{font-family:'Iowan Old Style',Georgia,'Times New Roman',serif}
        @media (prefers-reduced-motion: reduce){.studio-rise{transition:none}}
      `}</style>

      {/* ── header ── */}
      <header className="sticky top-0 z-40 border-b border-[#e7ddd1] bg-[#faf7f3]/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5">
          <span className="studio-serif text-lg font-bold tracking-tight">{STUDIO.name}</span>
          <nav className="flex items-center gap-5 text-sm" style={{ color: MUT }}>
            <a href="#how" className="hidden hover:text-[#231c15] sm:inline">How it works</a>
            <a href="#pricing" className="hidden hover:text-[#231c15] sm:inline">Pricing</a>
            <a href="#contact" className="font-semibold" style={{ color: ACCENT }}>Get your free demo site</a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5">
        {/* ── hero ── */}
        <section className="pb-10 pt-16 sm:pt-24">
          <Rise>
            <h1 className="studio-serif max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl" style={{ textWrap: 'balance' }}>
              {STUDIO.tagline}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed" style={{ color: MUT }}>
              We find local businesses whose websites are costing them work, build them a better
              one, and send it over finished. You judge the work, not the pitch — and if you don’t
              want it, you owe us nothing and never hear from us again.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a href="#contact"
                className="inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-[15px] font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5"
                style={{ background: ACCENT }}>
                Get your free demo site <ArrowRight size={16} />
              </a>
              <a href="#how" className="text-sm font-medium underline-offset-4 hover:underline" style={{ color: MUT }}>
                See exactly how it works ↓
              </a>
            </div>
          </Rise>
        </section>

        {/* ── the live exhibit ── */}
        <section ref={exhibitSlot} className="pb-20">
          <Rise>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: ACCENT }}>
              Live demonstration — assembled in your browser
            </p>
            {showExhibit ? (
              <Suspense fallback={<div className="flex h-[560px] items-center justify-center rounded-2xl border border-[#e7ddd1] bg-white text-sm" style={{ color: MUT }}>Assembling the demo…</div>}>
                <DemoExhibit />
              </Suspense>
            ) : (
              <div className="h-[560px] rounded-2xl border border-[#e7ddd1] bg-white" />
            )}
          </Rise>
        </section>

        {/* ── how it works ── */}
        <section id="how" className="border-t border-[#e7ddd1] py-20">
          <Rise>
            <h2 className="studio-serif text-3xl font-bold tracking-tight">How it works</h2>
            <p className="mt-2 max-w-xl text-[15px]" style={{ color: MUT }}>
              Three steps, and each one is a promise the system enforces — not a line in a brochure.
            </p>
          </Rise>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {HOW_IT_WORKS.map((s, i) => (
              <Rise key={s.title}>
                <div className="studio-serif text-5xl font-bold" style={{ color: '#e7ddd1' }}>{i + 1}</div>
                <h3 className="mt-2 text-lg font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed" style={{ color: MUT }}>{s.body}</p>
              </Rise>
            ))}
          </div>
        </section>

        {/* ── pricing ── */}
        <section id="pricing" className="border-t border-[#e7ddd1] py-20">
          <Rise>
            <h2 className="studio-serif text-3xl font-bold tracking-tight">Plain prices, picked à la carte</h2>
            <p className="mt-2 max-w-xl text-[15px]" style={{ color: MUT }}>
              The website is a one-time price. Everything else is optional, monthly, and cancel-anytime —
              tick only what you want. The site works fine with nothing added.
            </p>
          </Rise>
          <Rise className="mt-8">
            <div className="rounded-2xl border border-[#e7ddd1] bg-white p-6 sm:p-8">
              <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[#e7ddd1] pb-5">
                <div>
                  <p className="text-lg font-semibold">The website</p>
                  <p className="text-[13px]" style={{ color: MUT }}>Built from your real business, live on your domain in a day, hosting included.</p>
                </div>
                <p className="studio-serif text-2xl font-bold">{WEBSITE_PRICE} <span className="text-sm font-normal" style={{ color: MUT }}>once</span></p>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <label htmlFor="studio-industry" className="text-xs font-semibold uppercase tracking-wider" style={{ color: MUT }}>
                  Add-ons for
                </label>
                <select id="studio-industry" value={industry} onChange={(e) => setIndustry(e.target.value)}
                  className="rounded-lg border border-[#e7ddd1] bg-[#faf7f3] px-3 py-1.5 text-sm outline-none focus:border-[#c8501e]">
                  {MENU_INDUSTRIES.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div className="mt-4 grid gap-1">
                {menu.map((item) => (
                  <label key={item.id} className="flex cursor-pointer items-baseline gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-[#faf7f3]">
                    <input type="checkbox" checked={picks.includes(item.id)} onChange={() => togglePick(item.id)}
                      className="relative top-0.5 h-4 w-4 shrink-0 accent-[#c8501e]" />
                    <span className="min-w-0 flex-1">
                      <span className="text-[15px] font-medium">{item.title}</span>
                      <span className="block text-[13px] leading-snug" style={{ color: MUT }}>{item.pitch}</span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{item.priceLabel}</span>
                  </label>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3 border-t border-[#e7ddd1] pt-4">
                <p className="text-sm" style={{ color: MUT }}>
                  {picks.length ? `Your picks (${picks.length}) — we confirm the exact monthly before anything is charged` : 'Nothing picked — just the site'}
                </p>
                <p className="studio-serif text-xl font-bold">
                  {WEBSITE_PRICE} once{picks.length && total ? ` + ${total}` : ''}
                </p>
              </div>
            </div>
          </Rise>
        </section>

        {/* ── candor ── */}
        <section className="border-t border-[#e7ddd1] py-20">
          <Rise>
            <h2 className="studio-serif max-w-2xl text-3xl font-bold tracking-tight">{CANDOR.heading}</h2>
            <div className="mt-6 max-w-2xl space-y-4">
              {CANDOR.lines.map((l) => (
                <p key={l.slice(0, 24)} className="text-[15.5px] leading-relaxed" style={{ color: MUT }}>{l}</p>
              ))}
            </div>
          </Rise>
        </section>

        {/* ── contact ── */}
        <section id="contact" className="border-t border-[#e7ddd1] py-20">
          <Rise>
            <h2 className="studio-serif text-3xl font-bold tracking-tight">Get your free demo site</h2>
            <p className="mt-2 max-w-xl text-[15px]" style={{ color: MUT }}>
              Tell us your business and we’ll build the demo — finished, no strings.{' '}
              {wired && STUDIO.instantReplyLive
                ? 'This form runs the same lead automation we sell: you’ll hear back in under a minute.'
                : 'A real person replies within one business day.'}
            </p>
          </Rise>
          <Rise className="mt-8 max-w-xl">
            {sent ? (
              <div className="flex items-center gap-3 rounded-2xl border border-[#e7ddd1] bg-white p-6">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: '#c8501e1f', color: ACCENT }}><Check size={20} /></span>
                <div>
                  <p className="font-semibold">Got it — your demo is in the queue.</p>
                  <p className="text-sm" style={{ color: MUT }}>No obligation either way.</p>
                </div>
              </div>
            ) : wired ? (
              <form onSubmit={(e) => void submit(e)} className="grid gap-3 rounded-2xl border border-[#e7ddd1] bg-white p-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name"
                    className="rounded-xl border border-[#e7ddd1] bg-[#faf7f3] px-4 py-3 text-[15px] outline-none focus:border-[#c8501e]" />
                  <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email"
                    className="rounded-xl border border-[#e7ddd1] bg-[#faf7f3] px-4 py-3 text-[15px] outline-none focus:border-[#c8501e]" />
                </div>
                <textarea required value={message} onChange={(e) => setMessage(e.target.value)} rows={3}
                  placeholder="Your business name, town, and what you do — that’s all we need"
                  className="resize-none rounded-xl border border-[#e7ddd1] bg-[#faf7f3] px-4 py-3 text-[15px] outline-none focus:border-[#c8501e]" />
                {error && <p className="text-sm font-medium text-red-700">{error}</p>}
                <button type="submit" disabled={sending}
                  className="inline-flex w-fit items-center gap-2 rounded-xl px-6 py-3.5 text-[15px] font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5 disabled:opacity-60"
                  style={{ background: ACCENT }}>
                  {sending ? <Loader2 size={16} className="animate-spin" /> : null}
                  Build my free demo <ArrowRight size={16} />
                </button>
              </form>
            ) : (
              // No channel token configured — the form never pretends. One honest step instead.
              <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-[#e7ddd1] bg-white p-6">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: '#c8501e1f', color: ACCENT }}><Mail size={18} /></span>
                <div className="min-w-0">
                  <p className="font-semibold">Email us your business name and town</p>
                  <a href={`mailto:${STUDIO.email}?subject=Build%20my%20free%20demo%20site`} className="text-[15px] font-medium underline underline-offset-4" style={{ color: ACCENT }}>
                    {STUDIO.email}
                  </a>
                </div>
              </div>
            )}
          </Rise>
        </section>
      </main>

      {/* ── footer ── */}
      <footer className="border-t border-[#e7ddd1] py-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 text-[13px]" style={{ color: MUT }}>
          <p>{STUDIO.name} · {STUDIO.city} · <a href={`mailto:${STUDIO.email}`} className="underline-offset-4 hover:underline">{STUDIO.email}</a></p>
          <Link to="/auth" className="underline-offset-4 hover:underline">Operator sign-in</Link>
        </div>
      </footer>
    </div>
  );
}
