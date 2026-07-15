// src/components/garvis/StudioPreviewFrame.tsx
// A generated artifact used to render as a raw <pre> text dump — a postcard looked like a text file.
// This frames the SAME content in the medium it was made for, so the studio feels like it produces
// real deliverables: a postcard on a print card, a social caption in a phone, a script on a filmstrip.
//
// It is honest: the frame is styling around the real generated text (rendered as Markdown), not a
// fabricated asset. It never invents an image or a number — it just presents what was produced in a
// shape that reads like the thing it is. Unknown types fall back to a clean document sheet.

import type { ReactNode } from 'react';
import { Markdown } from '../Markdown';

export type Medium = 'postcard' | 'social' | 'video' | 'email' | 'landing' | 'doc';

/** Classify by slug first (stable), then kind/title. Cheap, deterministic, no AI. */
export function mediumOf(a: { slug?: string | null; kind?: string | null; title?: string | null }): Medium {
  const s = `${a.slug ?? ''} ${a.kind ?? ''} ${a.title ?? ''}`.toLowerCase();
  if (/postcard|mailer|direct[-_ ]?mail|eddm|flyer/.test(s)) return 'postcard';
  if (/social|instagram|facebook|caption|\bpost\b|reel|story/.test(s)) return 'social';
  if (/video|script|storyboard|shot[-_ ]?list|reel/.test(s)) return 'video';
  if (/email|sequence|newsletter|drip/.test(s)) return 'email';
  if (/landing|page|site|website/.test(s)) return 'landing';
  return 'doc';
}

const LABEL: Record<Medium, string> = {
  postcard: '📮 Postcard', social: '📱 Social post', video: '🎬 Video', email: '✉️ Email', landing: '🌐 Landing page', doc: '📄 Document',
};

export function mediumLabel(m: Medium): string { return LABEL[m]; }

/**
 * Frame `content` (the artifact detail) in its medium. `accent` (a brand-kit hex, optional) tints
 * the frame; it falls back to the forge ember so an un-branded world still looks intentional.
 */
export function StudioPreviewFrame({ medium, content, accent }: { medium: Medium; content: string; accent?: string }) {
  const body = content?.trim() || '—';
  const tint = accent && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(accent) ? accent : undefined;

  const md = <div className="prose-invert max-w-none text-xs leading-relaxed [&_h1]:text-sm [&_h2]:text-[13px] [&_h1]:mt-0 [&_p]:my-1.5"><Markdown content={body} /></div>;

  if (medium === 'social') {
    return (
      <Center>
        <div className="w-full max-w-[300px] overflow-hidden rounded-[2rem] border-4 border-forge-border bg-forge-bg shadow-liftEmber">
          <div className="flex items-center gap-2 border-b border-forge-border px-3 py-2">
            <span className="h-6 w-6 rounded-full" style={{ background: tint ?? 'var(--tw-forge-ember, #FF8A3D)' }} />
            <div className="h-2 w-20 rounded bg-forge-border" />
            <span className="ml-auto text-[10px] text-forge-dim">now</span>
          </div>
          <div className="max-h-80 overflow-auto px-3 py-2.5">{md}</div>
          <div className="flex gap-4 border-t border-forge-border px-3 py-2 text-forge-dim">
            <span>♡</span><span>💬</span><span>↗</span>
          </div>
        </div>
      </Center>
    );
  }

  if (medium === 'postcard') {
    return (
      <Center>
        {/* 6×9 print proportions — a real postcard shape, brand-tinted header band. */}
        <div className="w-full max-w-md overflow-hidden rounded-xl border border-forge-border bg-white/[0.03] shadow-liftEmber" style={{ aspectRatio: '3 / 2' }}>
          <div className="h-2" style={{ background: tint ?? '#FF8A3D' }} />
          <div className="max-h-full overflow-auto p-4">{md}</div>
        </div>
      </Center>
    );
  }

  if (medium === 'video') {
    return (
      <div className="overflow-hidden rounded-xl border border-forge-border bg-forge-bg">
        {/* filmstrip header */}
        <div className="flex items-center gap-1 border-b border-forge-border bg-black/30 px-2 py-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-8 w-12 shrink-0 rounded-sm border border-forge-border/60" style={{ background: i % 2 ? 'rgba(255,138,61,0.08)' : 'transparent' }} />
          ))}
        </div>
        <div className="max-h-80 overflow-auto p-3">{md}</div>
      </div>
    );
  }

  if (medium === 'email') {
    return (
      <div className="overflow-hidden rounded-xl border border-forge-border bg-forge-bg">
        <div className="space-y-1 border-b border-forge-border px-3 py-2 text-[11px] text-forge-dim">
          <div className="flex gap-2"><span className="w-10 shrink-0 text-forge-dim/60">From</span> <span className="text-forge-ink/80">you@yourbrand</span></div>
          <div className="flex gap-2"><span className="w-10 shrink-0 text-forge-dim/60">Subj</span> <span className="text-forge-ink/80">(see draft)</span></div>
        </div>
        <div className="max-h-80 overflow-auto p-3">{md}</div>
      </div>
    );
  }

  // landing + doc: a clean sheet
  return (
    <div className="overflow-hidden rounded-xl border border-forge-border bg-forge-bg">
      {medium === 'landing' && <div className="flex items-center gap-1.5 border-b border-forge-border px-3 py-1.5"><span className="h-2 w-2 rounded-full bg-forge-err/60" /><span className="h-2 w-2 rounded-full bg-forge-warn/60" /><span className="h-2 w-2 rounded-full bg-forge-ok/60" /><span className="ml-2 h-2 flex-1 rounded bg-forge-border" /></div>}
      <div className="max-h-80 overflow-auto p-3">{md}</div>
    </div>
  );
}

function Center({ children }: { children: ReactNode }) {
  return <div className="flex justify-center py-1">{children}</div>;
}
