// src/components/preview/PreviewSiteRenderer.tsx
// Draws a complete preview website from a SiteSpec — theme tokens scoped as CSS variables on the
// site root (so the preview's identity never leaks into, or inherits from, the FableForge UI),
// Google Fonts loaded on demand, sticky nav with anchor links, sections dispatched through the
// registry, footer. `shot` mode renders a stripped, animation-free version for email screenshots.

import { useEffect, useMemo } from 'react';
import type { SiteSpec } from '../../lib/preview/spec';
import { SECTION_COMPONENTS } from './sections';
import { Phone } from 'lucide-react';

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

export function PreviewSiteRenderer({ spec, shot = false }: { spec: SiteSpec; shot?: boolean }) {
  useGoogleFonts(spec.theme.displayFont, spec.theme.bodyFont);
  useEffect(() => { document.title = spec.seo.title; }, [spec.seo.title]);

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

  return (
    <div className={`pv-site min-h-screen bg-[hsl(var(--bg))] antialiased ${shot ? 'pv-shot' : ''}`} style={vars}>
      {/* Scoped rules the utility classes can't express: display font on headings, smooth
          anchor scroll, and animation kill-switch for screenshot mode. */}
      <style>{`
        .pv-site { scroll-behavior: smooth; }
        .pv-site .pv-display, .pv-site h1, .pv-site h2, .pv-site h3 { font-family: "${spec.theme.displayFont}", ${spec.theme.bodyFont}, ui-sans-serif, sans-serif; }
        .pv-site ::selection { background: hsl(${spec.theme.primary} / 0.25); }
        @keyframes pv-kenburns { from { transform: scale(1); } to { transform: scale(1.09); } }
        .pv-site .pv-kenburns { animation: pv-kenburns 18s ease-out forwards; }
        @media (prefers-reduced-motion: reduce) { .pv-site .pv-kenburns { animation: none; } }
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
                <a key={n.anchor} href={`#${n.anchor}`} className="text-sm font-medium text-[hsl(var(--mut))] transition-colors hover:text-[hsl(var(--ink))]">{n.label}</a>
              ))}
            </nav>
            {phone
              ? <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-2 rounded-[var(--r)] bg-[hsl(var(--p))] px-4 py-2 text-sm font-semibold text-[hsl(var(--pi))]"><Phone size={14} /> <span className="hidden sm:inline">{phone}</span><span className="sm:hidden">Call</span></a>
              : <a href="#quote" className="rounded-[var(--r)] bg-[hsl(var(--p))] px-4 py-2 text-sm font-semibold text-[hsl(var(--pi))]">{spec.nav.find((n) => n.anchor === 'quote')?.label ?? 'Contact'}</a>}
          </div>
        </header>
      )}

      <main>
        {sections.map((s, i) => {
          // normalizeSpec guarantees the type is registered and props fit the section's shape.
          const C = SECTION_COMPONENTS[s.type] as React.ComponentType<Record<string, unknown>>;
          return C ? <C key={`${s.type}-${i}`} variant={s.variant} {...s.props} /> : null;
        })}
      </main>

      {!shot && (
        <footer className="border-t border-[hsl(var(--bor))] bg-[hsl(var(--card))] py-10">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-5 sm:px-8">
            <p className="pv-display text-base font-bold text-[hsl(var(--ink))]">{logoMain}{logoAccent && <span className="text-[hsl(var(--p))]">{logoAccent}</span>}</p>
            <p className="text-xs text-[hsl(var(--mut))]">{spec.footer.line}</p>
            <p className="mt-2 text-[10px] uppercase tracking-wider text-[hsl(var(--mut))]/70">Concept preview — not yet published</p>
          </div>
        </footer>
      )}
    </div>
  );
}
