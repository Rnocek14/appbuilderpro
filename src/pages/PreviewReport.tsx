// src/pages/PreviewReport.tsx
// PUBLIC audit report — "here's what your current website costs you, and here's the fix."
// The value-first framing that makes the preview a gift instead of a pitch: score, problems in
// owner language, gains, then one CTA back to the redesigned site. Themed with the preview's
// own tokens so report and site read as one coherent piece of work.

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, Check, ArrowRight } from 'lucide-react';
import { getPreviewSite, type PreviewSiteRow } from '../lib/preview/engine';
import { fallbackAudit } from '../lib/preview/strategy';
import { parseBusinessProfile } from '../lib/preview/spec';

export default function PreviewReport() {
  const { slug } = useParams<{ slug: string }>();
  const [row, setRow] = useState<PreviewSiteRow | null | 'loading'>('loading');

  useEffect(() => {
    if (!slug) { setRow(null); return; }
    void getPreviewSite(slug).then(setRow);
  }, [slug]);

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  if (row === 'loading') return <div className="flex min-h-screen items-center justify-center bg-white text-sm text-neutral-400">Loading report…</div>;
  if (!row) return <div className="flex min-h-screen items-center justify-center bg-white text-neutral-600">Report not found.</div>;

  // Older rows predate the audit column — synthesize one from the stored profile shape we have.
  const audit = row.audit ?? fallbackAudit(parseBusinessProfile({ business_name: row.business_name, industry: row.industry, services: ['services'] }).profile!);
  const t = row.spec.theme;
  const vars = {
    '--p': t.primary, '--pi': t.primaryInk, '--bg': t.bg, '--ink': t.ink,
    '--mut': t.muted, '--card': t.card, '--bor': t.border, '--r': `${t.radius}px`,
    fontFamily: `"${t.bodyFont}", Inter, ui-sans-serif, system-ui, sans-serif`,
  } as React.CSSProperties;
  const scoreHue = audit.score >= 70 ? 145 : audit.score >= 50 ? 40 : 8;

  return (
    <div className="min-h-screen bg-[hsl(var(--bg))] antialiased" style={vars}>
      <style>{`h1,h2,h3{font-family:"${t.displayFont}",${t.bodyFont},ui-sans-serif,sans-serif}`}</style>
      <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[hsl(var(--mut))]">Website audit · prepared for</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-[hsl(var(--ink))]">{row.business_name}</h1>

        <div className="mt-8 flex flex-wrap items-center gap-6 rounded-[var(--r)] border border-[hsl(var(--bor))] bg-[hsl(var(--card))] p-6">
          <div className="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-full border-4"
            style={{ borderColor: `hsl(${scoreHue} 70% 45%)`, color: `hsl(${scoreHue} 70% 38%)` }}>
            <span className="text-3xl font-bold tabular-nums">{audit.score}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">/ 100 · {audit.grade}</span>
          </div>
          <p className="min-w-0 flex-1 text-base leading-relaxed text-[hsl(var(--ink))]">{audit.headline}</p>
        </div>

        <h2 className="mt-10 text-xl font-semibold text-[hsl(var(--ink))]">What we found</h2>
        <div className="mt-4 space-y-3">
          {audit.problems.map((p, i) => (
            <div key={i} className="flex gap-3 rounded-[var(--r)] border border-[hsl(var(--bor))] bg-[hsl(var(--card))] p-4">
              <AlertTriangle size={17} className="mt-0.5 shrink-0" style={{ color: 'hsl(8 70% 48%)' }} />
              <div>
                <p className="text-sm font-semibold capitalize text-[hsl(var(--ink))]">{p.issue}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-[hsl(var(--mut))]">{p.impact}</p>
              </div>
            </div>
          ))}
        </div>

        <h2 className="mt-10 text-xl font-semibold text-[hsl(var(--ink))]">What the redesign fixes</h2>
        <div className="mt-4 space-y-2.5">
          {audit.gains.map((g, i) => (
            <p key={i} className="flex items-start gap-2.5 text-sm text-[hsl(var(--ink))]">
              <Check size={16} className="mt-0.5 shrink-0 text-[hsl(var(--p))]" /> {g}
            </p>
          ))}
        </div>

        <p className="mt-10 max-w-2xl text-sm leading-relaxed text-[hsl(var(--mut))]">{audit.summary}</p>

        <Link to={`/preview-site/${row.slug}`}
          className="mt-8 inline-flex items-center gap-2 rounded-[var(--r)] bg-[hsl(var(--p))] px-6 py-3.5 text-sm font-semibold text-[hsl(var(--pi))] shadow-lg transition-transform hover:-translate-y-0.5">
          See your redesigned website <ArrowRight size={15} />
        </Link>

        <p className="mt-12 text-[10px] uppercase tracking-wider text-[hsl(var(--mut))]/60">Concept preview — nothing publishes without your approval</p>
      </div>
    </div>
  );
}
