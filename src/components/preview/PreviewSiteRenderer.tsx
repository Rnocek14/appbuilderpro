// src/components/preview/PreviewSiteRenderer.tsx
// Draws a complete preview website from a SiteSpec — theme tokens scoped as CSS variables on the
// site root (so the preview's identity never leaks into, or inherits from, the FableForge UI),
// Google Fonts loaded on demand, sticky nav with anchor links, sections dispatched through the
// registry, footer. `shot` mode renders a stripped, animation-free version for email screenshots.

import { useEffect, useMemo, useState } from 'react';
import type { SiteSpec } from '../../lib/preview/spec';
import { SECTION_COMPONENTS } from './sections';
import { ScrollProgress } from './motion';
import { Phone, Menu, X } from 'lucide-react';

/** Create-or-update one <meta> in <head> — the SPA route must unfurl/read as the BUSINESS. */
function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  if (!content) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

function useGoogleFonts(display: string, body: string) {
  useEffect(() => {
    const fams = [...new Set([display, body])]
      .map((f) => `family=${f.replace(/ /g, '+')}:wght@400;500;600;700`).join('&');
    const href = `https://fonts.googleapis.com/css2?${fams}&display=swap`;
    if (document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }, [display, body]);
}

export function PreviewSiteRenderer({ spec, shot = false, previewSiteId, leadSubmitUrl }: {
  spec: SiteSpec; shot?: boolean;
  /** When set, the quote form posts REAL leads through claim-submit instead of the placeholder. */
  previewSiteId?: string; leadSubmitUrl?: string;
}) {
  useGoogleFonts(spec.theme.displayFont, spec.theme.bodyFont);
  const [menuOpen, setMenuOpen] = useState(false);
  // The generated SEO was being produced then thrown away — title only. Write description + OG
  // so a shared preview link unfurls as the business, not as the platform.
  useEffect(() => {
    document.title = spec.seo.title;
    upsertMeta('name', 'description', spec.seo.description ?? '');
    upsertMeta('property', 'og:title', spec.seo.title);
    upsertMeta('property', 'og:description', spec.seo.description ?? '');
    upsertMeta('property', 'og:type', 'website');
    const heroImg = spec.sections.find((s) => s.type === 'hero')?.props.image as string | undefined;
    if (heroImg) upsertMeta('property', 'og:image', heroImg);
  }, [spec]);

  const vars = useMemo(() => ({
    '--p': spec.theme.primary,
    '--pi': spec.theme.primaryInk,
    '--bg': spec.theme.bg,
    '--ink': spec.theme.ink,
    '--mut': spec.theme.muted,
    '--card': spec.theme.card,
    '--bor': spec.theme.border,
    '--r': `${spec.theme.radius}px`,
    fontFamily: `"${spec.theme.bodyFont}", Inter, ui-sans-serif, system-ui, sans-serif`,
  }) as React.CSSProperties, [spec.theme]);

  // Email-shot mode: hero + trust + services only, no entrance animations (clean screenshot).
  const sections = shot
    ? spec.sections.filter((s) => ['hero', 'trust', 'services'].includes(s.type)).slice(0, 3)
    : spec.sections;

  const [logoMain, logoAccent] = spec.logoText.includes('|')
    ? spec.logoText.split('|', 2)
    : [spec.logoText, ''];
  const phone = spec.sections.find((s) => s.type === 'quote')?.props.phone as string | undefined;

  // Signature devices (themePresets personality kit, ported): activated as pv-f-* classes on the
  // root so the device CSS below can style hosts declaratively. Shot mode drops them — a static
  // screenshot gains nothing from texture/motion, and marquee would freeze mid-scroll.
  const flair = shot ? [] : (spec.theme.flair ?? []);
  // Motion tier gates the award-kit moves per section; shot mode forces calm (static frame).
  const motion = shot ? 'calm' : (spec.theme.motion ?? 'lively');

  return (
    <div className={`pv-site min-h-screen bg-[hsl(var(--bg))] antialiased ${shot ? 'pv-shot' : ''} ${flair.map((f) => `pv-f-${f}`).join(' ')}`} style={vars}>
      {/* Scoped rules the utility classes can't express: display font on headings, smooth
          anchor scroll, the signature-device kit, and animation kill-switch for screenshot mode. */}
      <style>{`
        .pv-site { scroll-behavior: smooth; }
        .pv-site .pv-display, .pv-site h1, .pv-site h2, .pv-site h3 { font-family: "${spec.theme.displayFont}", ${spec.theme.bodyFont}, ui-sans-serif, sans-serif; }
        .pv-site ::selection { background: hsl(${spec.theme.primary} / 0.25); }
        .pv-site::-webkit-scrollbar-thumb { background: hsl(${spec.theme.border}); border-radius: 6px; }
        @keyframes pv-kenburns { from { transform: scale(1); } to { transform: scale(1.09); } }
        .pv-site .pv-kenburns { animation: pv-kenburns 18s ease-out forwards; }
        /* Oversized display type for the hero headline — clamp() so it stays composed on phones. */
        .pv-site .pv-hero-display { font-size: clamp(2.5rem, 6.2vw, 4.9rem); line-height: 1.02; letter-spacing: -0.02em; }
        /* Card hover lift — compositor-friendly, snappy spring curve. */
        .pv-site .pv-lift { transition: transform 0.22s cubic-bezier(0.16,1,0.3,1), box-shadow 0.22s cubic-bezier(0.16,1,0.3,1); }
        .pv-site .pv-lift:hover { transform: translateY(-3px); box-shadow: 0 12px 28px -10px hsl(${spec.theme.ink} / 0.18); }
        /* Nav links: underline draws in on hover. */
        .pv-site .pv-nav-link { background-image: linear-gradient(currentColor, currentColor); background-size: 0% 1.5px; background-repeat: no-repeat; background-position: left 100%; transition: background-size 0.25s cubic-bezier(0.16,1,0.3,1), color 0.2s; padding-bottom: 2px; }
        .pv-site .pv-nav-link:hover { background-size: 100% 1.5px; }
        /* ---- signature devices (activated by pv-f-* on the root) ---- */
        .pv-f-grain .pv-grain-host { position: relative; isolation: isolate; }
        .pv-f-grain .pv-grain-host::after { content: ''; position: absolute; inset: 0; z-index: 1; pointer-events: none; opacity: 0.06; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E"); }
        .pv-f-dots .pv-alt { background-image: radial-gradient(hsl(${spec.theme.ink} / 0.07) 1px, transparent 1px); background-size: 22px 22px; }
        .pv-f-ruled .pv-alt { background-image: repeating-linear-gradient(to bottom, transparent, transparent 31px, hsl(${spec.theme.border}) 31px, hsl(${spec.theme.border}) 32px); }
        .pv-f-outline #ctaBanner h2 { -webkit-text-stroke: 2px hsl(${spec.theme.primaryInk}); color: transparent; font-size: clamp(2.2rem, 5vw, 4rem); line-height: 1.04; }
        .pv-f-hard-shadow .pv-card { box-shadow: 5px 5px 0 hsl(${spec.theme.ink} / 0.85); border-color: hsl(${spec.theme.ink} / 0.55); }
        .pv-f-hard-shadow .pv-card.pv-lift:hover { transform: translate(-2px, -2px); box-shadow: 8px 8px 0 hsl(${spec.theme.ink} / 0.85); }
        .pv-marquee { overflow: hidden; }
        .pv-marquee-track { display: flex; gap: 3rem; width: max-content; animation: pv-marquee 30s linear infinite; }
        .pv-marquee:hover .pv-marquee-track { animation-play-state: paused; }
        @keyframes pv-marquee { to { transform: translateX(-50%); } }
        @media (prefers-reduced-motion: reduce) { .pv-site .pv-kenburns, .pv-marquee-track { animation: none; } .pv-site .pv-lift, .pv-site .pv-nav-link { transition: none; } }
        .pv-shot *, .pv-shot *::before, .pv-shot *::after { transition: none !important; animation: none !important; opacity: 1 !important; transform: none !important; }
      `}</style>

      {!shot && (
        <header className="sticky top-0 z-40 border-b border-[hsl(var(--bor))] bg-[hsl(var(--bg)/0.92)] backdrop-blur">
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
            <a href="#hero" className="pv-display text-lg font-bold tracking-tight text-[hsl(var(--ink))]">
              {logoMain}{logoAccent && <span className="text-[hsl(var(--p))]">{logoAccent}</span>}
            </a>
            <nav className="hidden items-center gap-6 md:flex">
              {spec.nav.map((n) => (
                <a key={n.anchor} href={`#${n.anchor}`} className="pv-nav-link text-sm font-medium text-[hsl(var(--mut))] hover:text-[hsl(var(--ink))]">{n.label}</a>
              ))}
            </nav>
            <div className="flex items-center gap-2">
              {phone
                ? <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-2 rounded-[var(--r)] bg-[hsl(var(--p))] px-4 py-2 text-sm font-semibold text-[hsl(var(--pi))]"><Phone size={14} /> <span className="hidden sm:inline">{phone}</span><span className="sm:hidden">Call</span></a>
                : <a href="#quote" className="rounded-[var(--r)] bg-[hsl(var(--p))] px-4 py-2 text-sm font-semibold text-[hsl(var(--pi))]">{spec.nav.find((n) => n.anchor === 'quote')?.label ?? 'Contact'}</a>}
              {/* Mobile: the nav used to vanish entirely below md — on the device every owner
                  opens the email with. A plain disclosure menu, no dependencies. */}
              <button type="button" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--r)] border border-[hsl(var(--bor))] text-[hsl(var(--ink))] md:hidden">
                {menuOpen ? <X size={17} /> : <Menu size={17} />}
              </button>
            </div>
          </div>
          {menuOpen && (
            <nav className="border-t border-[hsl(var(--bor))] bg-[hsl(var(--bg))] px-5 py-3 md:hidden">
              {spec.nav.map((n) => (
                <a key={n.anchor} href={`#${n.anchor}`} onClick={() => setMenuOpen(false)}
                  className="block py-2.5 text-sm font-medium text-[hsl(var(--ink))]">{n.label}</a>
              ))}
            </nav>
          )}
          {/* Cinematic tier: reading-progress line under the sticky header. */}
          {motion === 'cinematic' && <ScrollProgress />}
        </header>
      )}

      <main>
        {sections.map((s, i) => {
          // normalizeSpec guarantees the type is registered and props fit the section's shape.
          const C = SECTION_COMPONENTS[s.type] as React.ComponentType<Record<string, unknown>>;
          const extra = s.type === 'quote' && previewSiteId && leadSubmitUrl
            ? { previewSiteId, submitUrl: leadSubmitUrl } : {};
          // flair/motion/siteName AFTER the props spread: spec-owned knobs, never section-prop-owned.
          return C ? <C key={`${s.type}-${i}`} variant={s.variant} {...s.props} {...extra} flair={flair} motion={motion} themePrimary={spec.theme.primary} siteName={spec.business_name} /> : null;
        })}
      </main>

      {!shot && (
        <footer className="border-t border-[hsl(var(--bor))] bg-[hsl(var(--card))] py-10">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-5 sm:px-8">
            <p className="pv-display text-base font-bold text-[hsl(var(--ink))]">{logoMain}{logoAccent && <span className="text-[hsl(var(--p))]">{logoAccent}</span>}</p>
            <p className="text-xs text-[hsl(var(--mut))]">{spec.footer.line}</p>
            <p className="mt-2 text-[10px] uppercase tracking-wider text-[hsl(var(--mut))]/70">
              Concept preview — not yet published{spec.aiImagery ? ' · imagery is AI-generated concept art' : ''}
            </p>
          </div>
        </footer>
      )}
    </div>
  );
}
