// src/components/garvis/Postcard.tsx
// The postcard, rendered as a real postcard you can look at — front and back, at true 6×9 (9:6
// landscape). Two honest looks for the front:
//   • WITH a photo (a listing: Just Listed / Just Sold) — the real property photo full-bleed, headline
//     over a legibility scrim. Never a stock or invented house.
//   • WITHOUT a photo (seller prospecting: "life in Lake Geneva", "thinking of selling?") — a DESIGNED
//     brand card: the brand color as a gradient field, big headline, kicker. No property is shown, so
//     nothing is misrepresented — it's a brand/lifestyle piece, not a claim about a specific home.
// Shared by the postcard designer and the campaign composer so there is one postcard, everywhere.

import { useState } from 'react';
import { RotateCw } from 'lucide-react';
import type { MailerSpec } from '../../lib/garvis/mailer';

/** 6×9 front. Photo full-bleed if present; otherwise a designed brand-gradient card. */
export function PostcardFront({ spec, accent }: { spec: MailerSpec; accent: string }) {
  const hasPhoto = !!spec.front.imageUrl;
  return (
    <div className="mailer-card relative w-full overflow-hidden rounded-lg shadow-soft" style={{ aspectRatio: '9 / 6', background: hasPhoto ? '#000' : `linear-gradient(135deg, ${accent} 0%, ${shade(accent, -28)} 100%)` }}>
      {hasPhoto ? (
        <>
          <img src={spec.front.imageUrl!} alt={spec.front.imageAlt} className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-[5%] pt-[15%]">
            {spec.front.kicker && <div className="text-[2.6vw] uppercase tracking-widest lg:text-[13px]" style={{ color: accent }}>{spec.front.kicker}</div>}
            <div className="text-[4.4vw] font-bold leading-tight text-white lg:text-[26px]">{spec.front.headline}</div>
          </div>
        </>
      ) : (
        // Designed brand card — no photo. Big type on the brand field, a thin rule, the kicker.
        <div className="absolute inset-0 flex flex-col justify-center p-[8%] text-white">
          {spec.front.kicker && <div className="text-[2.4vw] font-medium uppercase tracking-widest text-white/85 lg:text-[13px]">{spec.front.kicker}</div>}
          <div className="mt-[3%] text-[5vw] font-bold leading-[1.05] lg:text-[30px]">{spec.front.headline}</div>
          <div className="mt-[5%] h-[3px] w-[22%] rounded-full bg-white/70" />
        </div>
      )}
    </div>
  );
}

/** 6×9 back. Copy left, QR + address/postage zone right (bottom-right kept clear per USPS). */
export function PostcardBack({ spec, accent, qr }: { spec: MailerSpec; accent: string; qr: string | null }) {
  return (
    <div className="mailer-card relative w-full overflow-hidden rounded-lg border border-forge-border bg-white text-neutral-900 shadow-soft" style={{ aspectRatio: '9 / 6' }}>
      <div className="flex h-full">
        <div className="flex w-1/2 flex-col p-[4%]">
          <div className="text-[3.4vw] font-bold leading-tight lg:text-[19px]" style={{ color: accent }}>{spec.back.headline}</div>
          <div className="mt-[3%] whitespace-pre-line text-[2vw] leading-snug text-neutral-700 lg:text-[12px]">{spec.back.body}</div>
          <div className="mt-auto">
            <div className="text-[2.2vw] font-semibold lg:text-[13px]">{spec.back.cta}</div>
            <div className="mt-[2%] text-[1.7vw] text-neutral-500 lg:text-[10px]">{spec.back.contactLine}</div>
            {spec.back.complianceLine && <div className="mt-[1%] text-[1.4vw] text-neutral-400 lg:text-[9px]">{spec.back.complianceLine}</div>}
          </div>
        </div>
        <div className="flex w-1/2 flex-col items-end justify-between p-[4%]">
          {qr ? <img src={qr} alt="QR to the tracking link" className="h-[26%] w-auto" /> : <div className="h-[26%] w-[26%] rounded bg-neutral-100" />}
          <div className="w-full rounded border border-dashed border-neutral-300 p-[4%] text-right text-[1.5vw] text-neutral-300 lg:text-[9px]" style={{ minHeight: '38%' }}>
            address block · postage
          </div>
        </div>
      </div>
    </div>
  );
}

/** A postcard you can look at: one card in view, tap to flip front↔back. Both still print (the
 *  print CSS targets .mailer-card), so the flip is only for looking. */
export function PostcardViewer({ spec, accent, qr }: { spec: MailerSpec; accent: string; qr: string | null }) {
  const [side, setSide] = useState<'front' | 'back'>('front');
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-forge-border text-xs">
          <button onClick={() => setSide('front')} className={side === 'front' ? 'bg-forge-ember/15 px-2.5 py-1 text-forge-ember' : 'px-2.5 py-1 text-forge-dim hover:text-forge-ink'}>Front</button>
          <button onClick={() => setSide('back')} className={side === 'back' ? 'bg-forge-ember/15 px-2.5 py-1 text-forge-ember' : 'px-2.5 py-1 text-forge-dim hover:text-forge-ink'}>Back</button>
        </div>
        <button onClick={() => setSide((s) => (s === 'front' ? 'back' : 'front'))} className="inline-flex items-center gap-1 text-[11px] text-forge-dim hover:text-forge-ink"><RotateCw size={12} /> flip</button>
      </div>
      {/* Both render (so both print); only the selected side is shown on screen. */}
      <div className={side === 'front' ? '' : 'hidden'}><PostcardFront spec={spec} accent={accent} /></div>
      <div className={side === 'back' ? '' : 'hidden'}><PostcardBack spec={spec} accent={accent} qr={qr} /></div>
    </div>
  );
}

/** Lighten/darken a #rrggbb by pct (−100..100). Deterministic, for the no-photo gradient. */
function shade(hex: string, pct: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const f = pct / 100;
  const ch = (c: number) => {
    const v = Math.round(c + (f < 0 ? c * f : (255 - c) * f));
    return Math.max(0, Math.min(255, v));
  };
  const r = ch((n >> 16) & 0xff), g = ch((n >> 8) & 0xff), b = ch(n & 0xff);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
