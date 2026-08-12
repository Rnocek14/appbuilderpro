// src/pages/StudioSite.tsx
// THE STUDIO'S OWN WEBSITE — the page a cold-pitch prospect finds when they google the sender.
// It closes the trust loop (email → demo → "who are these people?" → here → reply), so its one
// job is checkable credibility:
//   * the hero exhibit is the REAL engine assembling a demo live in the browser (DemoExhibit);
//   * pricing renders from the same capability registry the product enforces (automationMenu +
//     clientTiers) — the page cannot offer what the code can't deliver;
//   * the contact form runs the real lead rail when wired (site-events token in studio.ts) and
//     degrades to an honest "email us" panel when not — it never fake-submits;
//   * no testimonial theater — the candor block says we're new, on purpose (see studio.ts).
// Copy lives in src/content/studio.ts and is claims-gated by studio.verify.ts.
//
// DESIGN BAR: benchmarked against the staples — Stripe's artifact-led proof, Linear's restraint,
// Apple's type scale, Framer's editorial showcases. The moves that carry it: Fraunces (optical
// serif, italic accents) over Inter; a paper→ink→paper section rhythm with ONE full-bleed dark
// band (the candor pull-quote — the signature moment); a process rail instead of three plain
// columns; scanner-grounded chips as the only decoration; custom checkboxes and a live total
// that warms when picked. Doctrine holds: work-first (the live exhibit is the second thing on
// screen), one primary action (the contact submit — the hero CTA scrolls to it), zero-input
// value (demo + pricing render before any click), reduced-motion respected everywhere.

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Loader2, Mail } from 'lucide-react';
import { STUDIO, HOW_IT_WORKS, CANDOR, MENU_INDUSTRIES, SCAN_LOOKFORS } from '../content/studio';
import { menuForIndustry, selectionTotal, totalLabel, picksSummary } from '../lib/preview/automationMenu';
import { tierById } from '../lib/garvis/billing/clientTiers';
import { supabaseUrl } from '../lib/supabase';

const DemoExhibit = lazy(() => import('./studio/DemoExhibit'));

const WEBSITE_PRICE = (tierById('website')?.priceHint ?? 'from $1,500').replace(/\s+one-time$/, '');

/** Load the page's two faces once. Fraunces needs its optical-size + italic axes (the preview
 *  renderer's loader only requests weights), so the studio carries its own loader. Fails soft to
 *  the serif/sans stacks below — the hermetic e2e (external requests blocked) proves that path. */
function useStudioFonts() {
  useEffect(() => {
    const href = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400..700&family=Inter:wght@400;500;600&display=swap';
    if (document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }, []);
}

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

function Rise({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useReveal();
  return <div ref={ref} className={`studio-rise ${className}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>{children}</div>;
}

export default function StudioSite() {
  useStudioFonts();
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
    }, { rootMargin: '500px' });
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
    <div className="studio-root min-h-screen">
      <style>{`
        .studio-root{
          --paper:#f8f3ea; --paper2:#f3ecdf; --ink:#1d1712; --mut:#7d7061; --line:#e6dbc9;
          --accent:#c14a17; --accent-deep:#a03c10; --band:#171310; --band-ink:#f4ede2;
          background:var(--paper); color:var(--ink);
          font-family:'Inter',-apple-system,'Segoe UI',Roboto,system-ui,sans-serif;
          font-feature-settings:'cv11','ss01';
          -webkit-font-smoothing:antialiased;
        }
        .studio-root ::selection{background:#c14a17;color:#fff}
        .studio-serif{font-family:'Fraunces','Iowan Old Style',Georgia,'Times New Roman',serif}
        .studio-rise{opacity:0;transform:translateY(18px);transition:opacity .7s cubic-bezier(.2,.6,.2,1),transform .7s cubic-bezier(.2,.6,.2,1)}
        .studio-rise.in{opacity:1;transform:none}
        .studio-nav-link{position:relative}
        .studio-nav-link::after{content:'';position:absolute;left:0;bottom:-3px;height:1px;width:100%;background:currentColor;transform:scaleX(0);transform-origin:left;transition:transform .25s ease}
        .studio-nav-link:hover::after{transform:scaleX(1)}
        .studio-cta{transition:transform .18s ease,box-shadow .18s ease,background .18s ease}
        .studio-cta:hover{transform:translateY(-2px);box-shadow:0 14px 34px -12px rgba(193,74,23,.55)}
        .studio-cta:active{transform:translateY(0) scale(.985)}
        .studio-check{appearance:none;width:20px;height:20px;border:1.5px solid var(--line);border-radius:6px;background:#fff;display:grid;place-content:center;cursor:pointer;transition:border-color .15s,background .15s;flex-shrink:0}
        .studio-check::before{content:'';width:10px;height:10px;transform:scale(0);transition:transform .15s cubic-bezier(.2,.6,.2,1);clip-path:polygon(14% 44%,0 65%,50% 100%,100% 16%,80% 0,43% 62%);background:#fff}
        .studio-check:checked{background:var(--accent);border-color:var(--accent)}
        .studio-check:checked::before{transform:scale(1)}
        .studio-check:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
        .studio-chip{box-shadow:0 10px 26px -14px rgba(40,25,10,.4)}
        .studio-ticker{display:flex;gap:0;overflow:hidden;mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
        .studio-ticker-track{display:flex;flex-shrink:0;gap:0;animation:studio-scroll 36s linear infinite}
        @keyframes studio-scroll{to{transform:translateX(-50%)}}
        .studio-root a:focus-visible,.studio-root button:focus-visible,.studio-root select:focus-visible,
        .studio-root input:focus-visible,.studio-root textarea:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
        html{scroll-behavior:smooth}
        @media (prefers-reduced-motion: reduce){
          .studio-rise{transition:none}
          .studio-ticker-track{animation:none}
          html{scroll-behavior:auto}
        }
      `}</style>

      {/* ── header ── */}
      <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[#f8f3ea]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="studio-serif text-[19px] font-semibold tracking-tight">
            {STUDIO.name}<span style={{ color: 'var(--accent)' }}>.</span>
          </span>
          <nav className="flex items-center gap-7 text-[13.5px] font-medium" style={{ color: 'var(--mut)' }}>
            <a href="#how" className="studio-nav-link hidden hover:text-[var(--ink)] sm:inline">How it works</a>
            <a href="#pricing" className="studio-nav-link hidden hover:text-[var(--ink)] sm:inline">Pricing</a>
            <a href="#contact"
              className="studio-cta rounded-full px-4.5 py-2 font-semibold text-white"
              style={{ background: 'var(--accent)', padding: '8px 18px' }}>
              Get your free demo site
            </a>
          </nav>
        </div>
      </header>

      <main>
        {/* ── hero ── */}
        <section className="mx-auto max-w-6xl px-6 pb-4 pt-20 sm:pt-28">
          <Rise>
            <p className="mb-6 text-[12px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--accent)' }}>
              A web studio in {STUDIO.city}
            </p>
            <h1 className="studio-serif max-w-4xl text-[13vw] font-medium leading-[1.02] tracking-[-0.015em] sm:text-[76px]" style={{ textWrap: 'balance' }}>
              We build your new website{' '}
              <em className="font-normal" style={{ color: 'var(--accent)' }}>before</em>{' '}
              you ever pay us.
            </h1>
          </Rise>
          <Rise delay={120}>
            <p className="mt-8 max-w-xl text-[17px] leading-[1.65]" style={{ color: 'var(--mut)' }}>
              We find local businesses whose websites are costing them work, build them a better one,
              and send it over finished. You judge the work, not the pitch — and if you don’t want it,
              you owe us nothing and never hear from us again.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-6">
              <a href="#contact"
                className="studio-cta inline-flex items-center gap-2.5 rounded-full px-7 py-4 text-[15px] font-semibold text-white"
                style={{ background: 'var(--accent)' }}>
                Get your free demo site <ArrowRight size={17} />
              </a>
              <a href="#how" className="studio-nav-link text-[14px] font-medium" style={{ color: 'var(--mut)' }}>
                See exactly how it works
              </a>
            </div>
          </Rise>
          {/* the truth strip — three receipts, each enforced by the system, not asserted by the page */}
          <Rise delay={200}>
            <div className="mt-14 grid max-w-3xl grid-cols-1 divide-y divide-[var(--line)] border-y border-[var(--line)] text-[13.5px] sm:grid-cols-3 sm:divide-x sm:divide-y-0" style={{ color: 'var(--mut)' }}>
              {['Built before you pay a cent', 'Every claim verified against your site’s real code', 'Nothing sends or publishes without your approval'].map((t) => (
                <p key={t} className="px-1 py-4 leading-snug sm:px-5 sm:first:pl-0">{t}</p>
              ))}
            </div>
          </Rise>
        </section>

        {/* ── the live exhibit ── */}
        <section ref={exhibitSlot} className="mx-auto max-w-6xl px-6 pb-24 pt-14">
          <Rise>
            <div className="relative">
              {/* scanner-grounded chips floating off the frame — decoration that names real detections */}
              <div className="pointer-events-none absolute -top-5 right-8 z-10 hidden rotate-2 lg:block">
                <span className="studio-chip inline-block rounded-full border border-[var(--line)] bg-white px-4 py-2 text-[12px] font-medium" style={{ color: 'var(--mut)' }}>
                  {SCAN_LOOKFORS[0]} → <span style={{ color: 'var(--accent)' }}>fixed</span>
                </span>
              </div>
              <div className="pointer-events-none absolute -left-4 top-24 z-10 hidden -rotate-2 xl:block">
                <span className="studio-chip inline-block rounded-full border border-[var(--line)] bg-white px-4 py-2 text-[12px] font-medium" style={{ color: 'var(--mut)' }}>
                  {SCAN_LOOKFORS[2]} → <span style={{ color: 'var(--accent)' }}>fixed</span>
                </span>
              </div>
              <p className="mb-4 text-[12px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--accent)' }}>
                Live demonstration — assembled in your browser
              </p>
              {showExhibit ? (
                <Suspense fallback={<div className="flex h-[580px] items-center justify-center rounded-3xl border border-[var(--line)] bg-white text-sm" style={{ color: 'var(--mut)' }}>Assembling the demo…</div>}>
                  <DemoExhibit />
                </Suspense>
              ) : (
                <div className="h-[580px] rounded-3xl border border-[var(--line)] bg-white" />
              )}
            </div>
          </Rise>
        </section>

        {/* ── what we look for — the honest ticker ── */}
        <section aria-hidden className="border-y border-[var(--line)] bg-[var(--paper2)] py-4">
          <div className="studio-ticker">
            <div className="studio-ticker-track">
              {[0, 1].map((half) => (
                <div key={half} className="flex shrink-0">
                  {SCAN_LOOKFORS.map((f) => (
                    <span key={`${half}-${f}`} className="studio-serif whitespace-nowrap px-8 text-[15px] italic" style={{ color: 'var(--mut)' }}>
                      {f} <span className="not-italic" style={{ color: 'var(--accent)' }}>·</span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── how it works — the process rail ── */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24">
          <Rise>
            <h2 className="studio-serif text-[40px] font-medium leading-tight tracking-tight sm:text-[48px]">How it works</h2>
            <p className="mt-3 max-w-xl text-[15.5px] leading-relaxed" style={{ color: 'var(--mut)' }}>
              Three steps, and each one is a promise the system enforces — not a line in a brochure.
            </p>
          </Rise>
          <div className="mt-14 grid gap-12 sm:grid-cols-3 sm:gap-8">
            {HOW_IT_WORKS.map((s, i) => (
              <Rise key={s.title} delay={i * 90}>
                <div className="flex items-center gap-4">
                  <span className="studio-serif flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-[18px] font-medium"
                    style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                    {i + 1}
                  </span>
                  <span className="h-px flex-1" style={{ background: 'var(--line)' }} />
                </div>
                <h3 className="mt-6 text-[18px] font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-3 text-[14.5px] leading-[1.7]" style={{ color: 'var(--mut)' }}>{s.body}</p>
              </Rise>
            ))}
          </div>
        </section>

        {/* ── the candor band — the signature moment ── */}
        <section className="px-0 py-6">
          <div style={{ background: 'var(--band)', color: 'var(--band-ink)' }}>
            <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
              <Rise>
                <p className="text-[12px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--accent)' }}>
                  {CANDOR.heading}
                </p>
                <p className="studio-serif mt-8 max-w-3xl text-[30px] font-normal leading-[1.3] sm:text-[40px]" style={{ textWrap: 'balance' }}>
                  <em>{CANDOR.lines[0]}</em>
                </p>
                <div className="mt-10 grid max-w-3xl gap-5 border-t border-white/10 pt-8 sm:grid-cols-2">
                  {CANDOR.lines.slice(1).map((l) => (
                    <p key={l.slice(0, 24)} className="text-[14.5px] leading-[1.75] opacity-75">{l}</p>
                  ))}
                </div>
              </Rise>
            </div>
          </div>
        </section>

        {/* ── pricing ── */}
        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24">
          <Rise>
            <h2 className="studio-serif text-[40px] font-medium leading-tight tracking-tight sm:text-[48px]">
              Plain prices, picked <em style={{ color: 'var(--accent)' }}>à la carte</em>
            </h2>
            <p className="mt-3 max-w-xl text-[15.5px] leading-relaxed" style={{ color: 'var(--mut)' }}>
              The website is a one-time price. Everything else is optional, monthly, and cancel-anytime —
              tick only what you want. The site works fine with nothing added.
            </p>
          </Rise>
          <Rise className="mt-10">
            <div className="overflow-hidden rounded-3xl border border-[var(--line)] bg-white shadow-[0_30px_80px_-40px_rgba(40,25,10,0.25)]">
              {/* the base — the thing that exists without any box ticked */}
              <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[var(--line)] bg-[var(--paper2)] px-7 py-6 sm:px-9">
                <div>
                  <p className="text-[17px] font-semibold">The website</p>
                  <p className="mt-0.5 text-[13px]" style={{ color: 'var(--mut)' }}>Built from your real business, live on your domain in a day, hosting included.</p>
                </div>
                <p className="studio-serif text-[26px] font-medium">{WEBSITE_PRICE} <span className="text-[13px]" style={{ color: 'var(--mut)' }}>once</span></p>
              </div>
              <div className="px-7 py-6 sm:px-9">
                <div className="flex flex-wrap items-center gap-3">
                  <label htmlFor="studio-industry" className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--mut)' }}>
                    Add-ons for
                  </label>
                  <select id="studio-industry" value={industry} onChange={(e) => setIndustry(e.target.value)}
                    className="rounded-full border border-[var(--line)] bg-[var(--paper)] px-4 py-1.5 text-[13.5px] font-medium outline-none">
                    {MENU_INDUSTRIES.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div className="mt-5 grid gap-0.5">
                  {menu.map((item) => (
                    <label key={item.id} className="flex cursor-pointer items-baseline gap-4 rounded-2xl px-4 py-3.5 transition-colors hover:bg-[var(--paper)]">
                      <input type="checkbox" checked={picks.includes(item.id)} onChange={() => togglePick(item.id)}
                        className="studio-check relative top-1" />
                      <span className="min-w-0 flex-1">
                        <span className="text-[15px] font-medium">{item.title}</span>
                        <span className="mt-0.5 block text-[13px] leading-snug" style={{ color: 'var(--mut)' }}>{item.pitch}</span>
                      </span>
                      <span className="shrink-0 text-[13.5px] font-semibold tabular-nums" style={{ color: picks.includes(item.id) ? 'var(--accent)' : 'var(--ink)' }}>
                        {item.priceLabel}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              {/* the live total — warms when something is picked */}
              <div className="flex flex-wrap items-baseline justify-between gap-3 border-t px-7 py-5 transition-colors sm:px-9"
                style={{ borderColor: 'var(--line)', background: picks.length ? '#c14a1710' : 'transparent' }}>
                <p className="text-[13.5px]" style={{ color: 'var(--mut)' }}>
                  {picks.length ? `Your picks (${picks.length}) — we confirm the exact monthly before anything is charged` : 'Nothing picked — just the site'}
                </p>
                <p className="studio-serif text-[22px] font-medium">
                  {WEBSITE_PRICE} once{picks.length && total ? <span style={{ color: 'var(--accent)' }}> + {total}</span> : ''}
                </p>
              </div>
            </div>
          </Rise>
        </section>

        {/* ── contact ── */}
        <section id="contact" className="scroll-mt-20 border-t border-[var(--line)] bg-[var(--paper2)]">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <div className="grid gap-12 lg:grid-cols-[1fr_460px] lg:gap-20">
              <Rise>
                <h2 className="studio-serif text-[40px] font-medium leading-tight tracking-tight sm:text-[48px]" style={{ textWrap: 'balance' }}>
                  Get your free demo site<span style={{ color: 'var(--accent)' }}>.</span>
                </h2>
                <p className="mt-5 max-w-md text-[15.5px] leading-[1.7]" style={{ color: 'var(--mut)' }}>
                  Tell us your business and we’ll build the demo — finished, no strings.{' '}
                  {wired && STUDIO.instantReplyLive
                    ? 'This form runs the same lead automation we sell: you’ll hear back in under a minute.'
                    : 'A real person replies within one business day.'}
                </p>
              </Rise>
              <Rise delay={100}>
                {sent ? (
                  <div className="flex items-center gap-4 rounded-3xl border border-[var(--line)] bg-white p-7">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: '#c14a171f', color: 'var(--accent)' }}><Check size={22} /></span>
                    <div>
                      <p className="text-[15.5px] font-semibold">Got it — your demo is in the queue.</p>
                      <p className="mt-0.5 text-[13.5px]" style={{ color: 'var(--mut)' }}>No obligation either way.</p>
                    </div>
                  </div>
                ) : wired ? (
                  <form onSubmit={(e) => void submit(e)} className="grid gap-3 rounded-3xl border border-[var(--line)] bg-white p-7">
                    <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name"
                      className="rounded-xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3.5 text-[15px] outline-none" />
                    <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email"
                      className="rounded-xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3.5 text-[15px] outline-none" />
                    <textarea required value={message} onChange={(e) => setMessage(e.target.value)} rows={3}
                      placeholder="Your business name, town, and what you do — that’s all we need"
                      className="resize-none rounded-xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3.5 text-[15px] outline-none" />
                    {error && <p className="text-[13.5px] font-medium text-red-700">{error}</p>}
                    <button type="submit" disabled={sending}
                      className="studio-cta mt-1 inline-flex w-fit items-center gap-2.5 rounded-full px-7 py-4 text-[15px] font-semibold text-white disabled:opacity-60"
                      style={{ background: 'var(--accent)' }}>
                      {sending ? <Loader2 size={16} className="animate-spin" /> : null}
                      Build my free demo <ArrowRight size={17} />
                    </button>
                  </form>
                ) : (
                  // No channel token configured — the form never pretends. One honest step instead.
                  <div className="flex flex-wrap items-center gap-5 rounded-3xl border border-[var(--line)] bg-white p-7">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: '#c14a171f', color: 'var(--accent)' }}><Mail size={19} /></span>
                    <div className="min-w-0">
                      <p className="text-[15.5px] font-semibold">Email us your business name and town</p>
                      <a href={`mailto:${STUDIO.email}?subject=Build%20my%20free%20demo%20site`} className="text-[15px] font-medium underline underline-offset-4" style={{ color: 'var(--accent)' }}>
                        {STUDIO.email}
                      </a>
                    </div>
                  </div>
                )}
              </Rise>
            </div>
          </div>
        </section>
      </main>

      {/* ── footer ── */}
      <footer className="border-t border-[var(--line)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-10">
          <div>
            <p className="studio-serif text-[17px] font-semibold">{STUDIO.name}<span style={{ color: 'var(--accent)' }}>.</span></p>
            <p className="mt-1 text-[13px]" style={{ color: 'var(--mut)' }}>
              {STUDIO.city} · <a href={`mailto:${STUDIO.email}`} className="underline-offset-4 hover:underline">{STUDIO.email}</a>
            </p>
          </div>
          <Link to="/auth" className="text-[12.5px] underline-offset-4 hover:underline" style={{ color: 'var(--mut)' }}>Operator sign-in</Link>
        </div>
      </footer>
    </div>
  );
}
