// src/components/preview/sections.tsx
// The section library of the Business Website Preview Engine — every block a generated preview
// site can be assembled from. Hand-built and data-driven: the AI supplies props (copy, images,
// theme), never markup, so every site meets the design bar by construction.
//
// Theme contract (set by PreviewSiteRenderer as CSS vars on the site root):
//   --p primary · --pi text-on-primary · --bg page · --ink text · --mut secondary text
//   --card raised surface · --bor border · --r radius   (colors are HSL triplets)

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Star, Phone, Mail, MapPin, Clock, ChevronDown, ArrowRight, ShieldCheck } from 'lucide-react';

const scrollToQuote = () => {
  const el = document.getElementById('quote') ?? document.getElementById('ctaBanner');
  el?.scrollIntoView({ behavior: 'smooth' });
};

/** Primary button — used by every section so CTAs are identical everywhere. */
function Cta({ label, secondary }: { label: string; secondary?: boolean }) {
  return (
    <button
      type="button"
      onClick={scrollToQuote}
      className={secondary
        ? 'inline-flex items-center gap-2 rounded-[var(--r)] border border-[hsl(var(--bor))] bg-[hsl(var(--card))] px-6 py-3 text-sm font-semibold text-[hsl(var(--ink))] transition-transform hover:-translate-y-0.5'
        : 'inline-flex items-center gap-2 rounded-[var(--r)] bg-[hsl(var(--p))] px-6 py-3 text-sm font-semibold text-[hsl(var(--pi))] shadow-lg transition-transform hover:-translate-y-0.5'}
    >
      {label} <ArrowRight size={15} />
    </button>
  );
}

/** Scroll-reveal wrapper (self-contained IntersectionObserver — the scaffold kit belongs to
 *  generated apps, not the builder, so the preview engine carries its own). */
function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } }, { rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ transitionDelay: `${delay}ms`, transform: inView ? 'none' : 'translateY(18px)' }}
      className={`transition-all duration-700 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] ${inView ? 'opacity-100' : 'opacity-0'} ${className}`}>
      {children}
    </div>
  );
}

function SectionShell({ id, children, tight, alt }: { id: string; children: ReactNode; tight?: boolean; alt?: boolean }) {
  // pv-alt marks alternate bands as texture hosts — the dots/ruled signature devices paint here.
  return (
    <section id={id} className={`${alt ? 'pv-alt bg-[hsl(var(--card))]' : ''} ${tight ? 'py-10' : 'py-16 sm:py-24'}`}>
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">{children}</div>
    </section>
  );
}

function Heading({ heading, sub }: { heading?: string; sub?: string }) {
  if (!heading) return null;
  return (
    <Reveal>
      <h2 className="pv-display text-3xl font-semibold tracking-tight text-[hsl(var(--ink))] sm:text-4xl">{heading}</h2>
      {sub && <p className="mt-3 max-w-2xl text-[hsl(var(--mut))]">{sub}</p>}
    </Reveal>
  );
}

function Stars({ rating = 5 }: { rating?: number }) {
  return (
    <span className="inline-flex gap-0.5 text-[hsl(var(--p))]">
      {Array.from({ length: 5 }, (_, i) => <Star key={i} size={14} className={i < Math.round(rating) ? 'fill-current' : 'opacity-25'} />)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export function Hero(p: { eyebrow?: string; heading?: string; sub?: string; cta?: string; secondaryCta?: string; phone?: string; image?: string; rating?: number; reviewCount?: number; variant?: string }) {
  // Call button dials the REAL phone (injected by normalizeSpec); digits parsed from the label are
  // only a fallback, and a label with no digits ("Call us today") routes to the quote form instead
  // of rendering a dead tel: link.
  const telDigits = (p.phone ?? p.secondaryCta ?? '').replace(/[^\d+]/g, '');
  const telHref = telDigits.length >= 7 ? `tel:${telDigits}` : '#quote';
  const hasImage = !!p.image;

  // SPLIT variant — content on the page paper, photo in a framed panel on the right. Reads
  // editorial/professional (legal, medical, real estate); the model or recipe picks it.
  if (p.variant === 'split' && hasImage) {
    return (
      <section id="hero" className="pv-grain-host relative isolate overflow-hidden">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.1fr_1fr]">
          <Reveal>
            {p.eyebrow && <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[hsl(var(--p))]">{p.eyebrow}</p>}
            <h1 className="pv-display pv-hero-display font-semibold tracking-tight text-[hsl(var(--ink))]" style={{ textWrap: 'balance' }}>{p.heading}</h1>
            {p.sub && <p className="mt-5 max-w-xl text-lg leading-relaxed text-[hsl(var(--mut))]">{p.sub}</p>}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {p.cta && <Cta label={p.cta} />}
              {p.secondaryCta && (
                <a href={telHref}
                  className="inline-flex items-center gap-2 rounded-[var(--r)] border border-[hsl(var(--bor))] px-6 py-3 text-sm font-semibold text-[hsl(var(--ink))] transition-colors hover:bg-[hsl(var(--card))]">
                  <Phone size={15} /> {p.secondaryCta}
                </a>
              )}
            </div>
            {p.rating != null && (
              <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-[hsl(var(--bor))] bg-[hsl(var(--card))] px-3.5 py-1.5 text-sm text-[hsl(var(--ink))]">
                <Stars rating={p.rating} />
                <span className="font-semibold">{p.rating.toFixed(1)}</span>
                {p.reviewCount != null && <span className="text-[hsl(var(--mut))]">({p.reviewCount} reviews)</span>}
              </div>
            )}
          </Reveal>
          <Reveal delay={120}>
            <div className="relative overflow-hidden rounded-[calc(var(--r)*1.5)] border border-[hsl(var(--bor))] shadow-2xl">
              <img src={p.image} alt="" className="aspect-[4/5] w-full object-cover sm:aspect-[4/4.4]" />
              <div className="absolute inset-0 ring-1 ring-inset ring-black/10" />
            </div>
          </Reveal>
        </div>
      </section>
    );
  }

  return (
    <section id="hero" className="pv-grain-host relative isolate overflow-hidden">
      {hasImage
        ? <>
            {/* pv-kenburns: an 18s slow zoom — the single frame reads as cinema, not a stock jpeg. */}
            <img src={p.image} alt="" className="pv-kenburns absolute inset-0 -z-10 h-full w-full object-cover" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/80 via-black/55 to-black/25" />
          </>
        : <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[hsl(var(--p))] via-[hsl(var(--p)/0.85)] to-[hsl(var(--ink))]" />}
      <div className="mx-auto flex min-h-[520px] w-full max-w-6xl flex-col justify-center px-5 py-24 sm:min-h-[600px] sm:px-8">
        <Reveal>
          {p.eyebrow && <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-white/75">{p.eyebrow}</p>}
          <h1 className="pv-display pv-hero-display max-w-3xl font-semibold tracking-tight text-white" style={{ textWrap: 'balance' }}>{p.heading}</h1>
          {p.sub && <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/85">{p.sub}</p>}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {p.cta && <Cta label={p.cta} />}
            {p.secondaryCta && (
              <a href={telHref}
                className="inline-flex items-center gap-2 rounded-[var(--r)] border border-white/40 px-6 py-3 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/10">
                <Phone size={15} /> {p.secondaryCta}
              </a>
            )}
          </div>
          {p.rating != null && (
            <div className="mt-8 inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-sm text-white backdrop-blur">
              <Stars rating={p.rating} />
              <span className="font-semibold">{p.rating.toFixed(1)}</span>
              {p.reviewCount != null && <span className="text-white/70">· {p.reviewCount} Google reviews</span>}
            </div>
          )}
        </Reveal>
      </div>
    </section>
  );
}

export function Trust(p: { items?: string[]; flair?: string[] }) {
  const items = (p.items ?? []).slice(0, 4);
  // "marquee" signature device: the static proof grid becomes an infinite scrolling ticker
  // (track duplicated once — the -50% keyframe loops seamlessly; hover pauses it).
  if (p.flair?.includes('marquee') && items.length >= 2) {
    return (
      <section id="trust" className="pv-marquee border-y border-[hsl(var(--bor))] bg-[hsl(var(--card))] py-5">
        <div className="pv-marquee-track">
          {[...items, ...items].map((t, i) => (
            <span key={i} className="inline-flex shrink-0 items-center gap-2.5" aria-hidden={i >= items.length}>
              <ShieldCheck size={18} className="shrink-0 text-[hsl(var(--p))]" />
              <span className="whitespace-nowrap text-sm font-medium text-[hsl(var(--ink))]">{t}</span>
            </span>
          ))}
        </div>
      </section>
    );
  }
  return (
    <section id="trust" className="border-y border-[hsl(var(--bor))] bg-[hsl(var(--card))]">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-4 px-5 py-6 sm:grid-cols-4 sm:px-8">
        {items.map((t, i) => (
          <Reveal key={i} delay={i * 70} className="flex items-center gap-2.5">
            <ShieldCheck size={18} className="shrink-0 text-[hsl(var(--p))]" />
            <span className="text-sm font-medium text-[hsl(var(--ink))]">{t}</span>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function Services(p: { heading?: string; sub?: string; services?: { name: string; blurb?: string }[]; cta?: string }) {
  const services = p.services ?? [];
  return (
    <SectionShell id="services">
      <Heading heading={p.heading} sub={p.sub} />
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((s, i) => (
          <Reveal key={i} delay={(i % 3) * 80}>
            <div className="pv-card pv-lift group h-full rounded-[var(--r)] border border-[hsl(var(--bor))] bg-[hsl(var(--card))] p-6 shadow-sm">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--p)/0.12)] text-[hsl(var(--p))]"><Check size={16} /></span>
              <h3 className="pv-display mt-4 text-lg font-semibold text-[hsl(var(--ink))]">{s.name}</h3>
              {s.blurb && <p className="mt-1.5 text-sm leading-relaxed text-[hsl(var(--mut))]">{s.blurb}</p>}
            </div>
          </Reveal>
        ))}
      </div>
      {p.cta && <Reveal className="mt-10"><Cta label={p.cta} /></Reveal>}
    </SectionShell>
  );
}

export function About(p: { heading?: string; body?: string; image?: string }) {
  return (
    <SectionShell id="about" alt>
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <Heading heading={p.heading} sub={p.body} />
        {p.image && (
          <Reveal delay={120}>
            <img src={p.image} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-[var(--r)] object-cover shadow-xl" />
          </Reveal>
        )}
      </div>
    </SectionShell>
  );
}

export function Showcase(p: { heading?: string; photos?: { url: string; alt?: string }[] }) {
  const photos = (p.photos ?? []).slice(0, 4);
  if (!photos.length) return null;
  return (
    <SectionShell id="showcase">
      <Heading heading={p.heading} />
      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {photos.map((ph, i) => (
          <Reveal key={i} delay={(i % 2) * 100}>
            <img src={ph.url} alt={ph.alt ?? ''} loading="lazy"
              className={`w-full rounded-[var(--r)] object-cover shadow-md ${i % 3 === 0 ? 'aspect-[16/10]' : 'aspect-[4/3]'}`} />
          </Reveal>
        ))}
      </div>
    </SectionShell>
  );
}

export function Gallery(p: { heading?: string; photos?: { url: string; alt?: string }[] }) {
  const photos = (p.photos ?? []).slice(0, 9);
  if (!photos.length) return null;
  return (
    <SectionShell id="gallery">
      <Heading heading={p.heading} />
      <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((ph, i) => (
          <Reveal key={i} delay={(i % 3) * 70}>
            <img src={ph.url} alt={ph.alt ?? ''} loading="lazy" className="aspect-square w-full rounded-[var(--r)] object-cover transition-transform hover:scale-[1.02]" />
          </Reveal>
        ))}
      </div>
    </SectionShell>
  );
}

export function Reviews(p: { heading?: string; reviews?: { author: string; rating?: number; text: string }[]; summary?: string; googleRating?: number; reviewCount?: number }) {
  const reviews = (p.reviews ?? []).slice(0, 6);
  return (
    <SectionShell id="reviews" alt>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Heading heading={p.heading} />
        {p.googleRating != null && (
          <Reveal delay={100}>
            <div className="flex items-center gap-2 rounded-full border border-[hsl(var(--bor))] bg-[hsl(var(--bg))] px-4 py-2">
              <Stars rating={p.googleRating} />
              <span className="text-sm font-semibold text-[hsl(var(--ink))]">{p.googleRating.toFixed(1)} on Google</span>
              {p.reviewCount != null && <span className="text-sm text-[hsl(var(--mut))]">({p.reviewCount})</span>}
            </div>
          </Reveal>
        )}
      </div>
      {reviews.length
        ? <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {reviews.map((r, i) => (
              <Reveal key={i} delay={(i % 3) * 80}>
                <figure className="pv-card pv-lift h-full rounded-[var(--r)] border border-[hsl(var(--bor))] bg-[hsl(var(--bg))] p-6 shadow-sm">
                  <Stars rating={r.rating ?? 5} />
                  <blockquote className="mt-3 text-sm leading-relaxed text-[hsl(var(--ink))]">“{r.text}”</blockquote>
                  <figcaption className="mt-4 text-xs font-medium uppercase tracking-wide text-[hsl(var(--mut))]">{r.author}</figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        : p.summary && <Reveal className="mt-8"><p className="max-w-2xl text-lg leading-relaxed text-[hsl(var(--ink))]">“{p.summary}”</p></Reveal>}
    </SectionShell>
  );
}

export function ServiceArea(p: { heading?: string; areas?: string[] }) {
  const areas = (p.areas ?? []).filter(Boolean);
  if (!areas.length) return null;
  return (
    <SectionShell id="serviceArea" tight>
      <Heading heading={p.heading} />
      <div className="mt-6 flex flex-wrap gap-2">
        {areas.map((a, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--bor))] bg-[hsl(var(--card))] px-3.5 py-1.5 text-sm text-[hsl(var(--ink))]">
            <MapPin size={13} className="text-[hsl(var(--p))]" /> {a}
          </span>
        ))}
      </div>
    </SectionShell>
  );
}

export function Faq(p: { heading?: string; faqs?: { q: string; a: string }[] }) {
  const faqs = (p.faqs ?? []).slice(0, 8);
  if (!faqs.length) return null;
  return (
    <SectionShell id="faq">
      <Heading heading={p.heading} />
      <div className="mt-8 max-w-3xl divide-y divide-[hsl(var(--bor))] rounded-[var(--r)] border border-[hsl(var(--bor))] bg-[hsl(var(--card))]">
        {faqs.map((f, i) => (
          <details key={i} className="group px-6 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-[hsl(var(--ink))]">
              {f.q}
              <ChevronDown size={16} className="shrink-0 text-[hsl(var(--mut))] transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-2.5 text-sm leading-relaxed text-[hsl(var(--mut))]">{f.a}</p>
          </details>
        ))}
      </div>
    </SectionShell>
  );
}

export function Hours(p: { heading?: string; hours?: string | Record<string, string> }) {
  if (!p.hours) return null;
  const rows = typeof p.hours === 'string' ? null : Object.entries(p.hours);
  return (
    <SectionShell id="hours" tight alt>
      <div className="flex flex-wrap items-start gap-10">
        <Heading heading={p.heading} />
        <div className="min-w-[260px] flex-1">
          {rows
            ? <table className="w-full max-w-sm text-sm">
                <tbody>
                  {rows.map(([d, h]) => (
                    <tr key={d} className="border-b border-[hsl(var(--bor))] last:border-0">
                      <td className="py-2 font-medium text-[hsl(var(--ink))]">{d}</td>
                      <td className="py-2 text-right tabular-nums text-[hsl(var(--mut))]">{h}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            : <p className="inline-flex items-center gap-2 text-[hsl(var(--ink))]"><Clock size={16} className="text-[hsl(var(--p))]" /> {String(p.hours)}</p>}
        </div>
      </div>
    </SectionShell>
  );
}

export function MapSection(p: { heading?: string; address?: string; phone?: string }) {
  if (!p.address) return null;
  return (
    <SectionShell id="map">
      <Heading heading={p.heading} />
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <iframe
          title="Map"
          src={`https://maps.google.com/maps?q=${encodeURIComponent(p.address)}&z=13&output=embed`}
          className="h-[320px] w-full rounded-[var(--r)] border border-[hsl(var(--bor))]"
          loading="lazy"
        />
        <div className="space-y-3 rounded-[var(--r)] border border-[hsl(var(--bor))] bg-[hsl(var(--card))] p-6">
          <p className="flex items-start gap-2.5 text-sm text-[hsl(var(--ink))]"><MapPin size={16} className="mt-0.5 shrink-0 text-[hsl(var(--p))]" /> {p.address}</p>
          {p.phone && <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-2.5 text-sm font-semibold text-[hsl(var(--p))]"><Phone size={16} /> {p.phone}</a>}
        </div>
      </div>
    </SectionShell>
  );
}

export function Quote(p: { heading?: string; sub?: string; phone?: string; email?: string; cta?: string; previewSiteId?: string; submitUrl?: string }) {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const name = useRef<HTMLInputElement | null>(null);
  const contact = useRef<HTMLInputElement | null>(null);
  const msg = useRef<HTMLTextAreaElement | null>(null);
  // REAL lead capture: with a previewSiteId + endpoint the form posts through claim-submit (rate
  // limited, webhook-notified, lands in the Claims lane). Without them (static export v1, dev
  // previews) it stays the honestly-labeled placeholder.
  const wired = !!(p.previewSiteId && p.submitUrl);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wired) { setSent(true); return; }
    setSending(true);
    try {
      await fetch(p.submitUrl!, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          previewSiteId: p.previewSiteId,
          name: name.current?.value ?? '',
          contact: contact.current?.value ?? '',
          message: `Quote request (demo form): ${msg.current?.value ?? ''}`,
        }),
      });
    } catch { /* the visitor still sees success; the owner-side webhook is best-effort */ }
    setSending(false);
    setSent(true);
  };
  return (
    <SectionShell id="quote" alt>
      <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
        <div>
          <Heading heading={p.heading} sub={p.sub} />
          <form className="mt-8 grid max-w-xl gap-4" onSubmit={(e) => void submit(e)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <input ref={name} required placeholder="Name" className="rounded-[var(--r)] border border-[hsl(var(--bor))] bg-[hsl(var(--bg))] px-4 py-3 text-sm text-[hsl(var(--ink))] outline-none focus:border-[hsl(var(--p))]" />
              <input ref={contact} required placeholder="Phone or email" className="rounded-[var(--r)] border border-[hsl(var(--bor))] bg-[hsl(var(--bg))] px-4 py-3 text-sm text-[hsl(var(--ink))] outline-none focus:border-[hsl(var(--p))]" />
            </div>
            <textarea ref={msg} required placeholder="What do you need?" rows={4} className="rounded-[var(--r)] border border-[hsl(var(--bor))] bg-[hsl(var(--bg))] px-4 py-3 text-sm text-[hsl(var(--ink))] outline-none focus:border-[hsl(var(--p))]" />
            <button type="submit" disabled={sending} className="inline-flex w-fit items-center gap-2 rounded-[var(--r)] bg-[hsl(var(--p))] px-6 py-3 text-sm font-semibold text-[hsl(var(--pi))] shadow-lg transition-transform hover:-translate-y-0.5 disabled:opacity-60">
              {p.cta ?? 'Send'} <ArrowRight size={15} />
            </button>
            {sent && <p className="text-sm font-medium text-[hsl(var(--p))]">{wired ? 'Sent — your request went through. You’ll hear back shortly.' : 'Thanks! This is a preview site — on the live site this reaches you instantly.'}</p>}
          </form>
        </div>
        <div className="pv-card h-fit space-y-4 rounded-[var(--r)] border border-[hsl(var(--bor))] bg-[hsl(var(--bg))] p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--mut))]">Prefer to talk?</p>
          {p.phone && <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-2.5 text-base font-semibold text-[hsl(var(--ink))]"><Phone size={17} className="text-[hsl(var(--p))]" /> {p.phone}</a>}
          {p.email && <a href={`mailto:${p.email}`} className="flex items-center gap-2.5 text-sm text-[hsl(var(--ink))]"><Mail size={16} className="text-[hsl(var(--p))]" /> {p.email}</a>}
          <p className="text-xs leading-relaxed text-[hsl(var(--mut))]">Free, no-obligation quotes. Your request goes straight to the owner.</p>
        </div>
      </div>
    </SectionShell>
  );
}

export function CtaBanner(p: { heading?: string; sub?: string; cta?: string }) {
  return (
    <section id="ctaBanner" className="pv-grain-host bg-[hsl(var(--p))] py-16">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <Reveal>
          <h2 className="pv-display text-3xl font-semibold tracking-tight text-[hsl(var(--pi))]">{p.heading}</h2>
          {p.sub && <p className="mt-2 text-[hsl(var(--pi)/0.85)]">{p.sub}</p>}
        </Reveal>
        {p.cta && (
          <Reveal delay={100}>
            <button type="button" onClick={scrollToQuote}
              className="rounded-[var(--r)] bg-[hsl(var(--pi))] px-7 py-3.5 text-sm font-bold text-[hsl(var(--p))] shadow-xl transition-transform hover:-translate-y-0.5">
              {p.cta}
            </button>
          </Reveal>
        )}
      </div>
    </section>
  );
}

export function SeoText(p: { heading?: string; body?: string }) {
  if (!p.body) return null;
  return (
    <SectionShell id="seoText" tight>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--mut))]">{p.heading}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[hsl(var(--mut))]">{p.body}</p>
    </SectionShell>
  );
}

/** Dispatch table — normalizeSpec guarantees only these types reach the renderer. */
export const SECTION_COMPONENTS = {
  hero: Hero, trust: Trust, services: Services, about: About, showcase: Showcase,
  gallery: Gallery, reviews: Reviews, serviceArea: ServiceArea, faq: Faq, hours: Hours,
  map: MapSection, quote: Quote, ctaBanner: CtaBanner, seoText: SeoText,
} as const;
