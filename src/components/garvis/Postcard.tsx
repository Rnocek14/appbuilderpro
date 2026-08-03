// src/components/garvis/Postcard.tsx
// The postcard, rendered as a real postcard you can look at — front and back, at true 6×9 (9:6
// landscape). Two honest looks for the front:
//   • WITH a photo (a listing: Just Listed / Just Sold) — the real property photo full-bleed or
//     framed, headline treatments over legibility scrims. Never a stock or invented house.
//   • WITHOUT a photo (seller prospecting: "life in Lake Geneva", "thinking of selling?") — a DESIGNED
//     brand card: the brand color as a field, big display type. No property is shown, so nothing is
//     misrepresented — it's a brand/lifestyle piece, not a claim about a specific home.
// Shared by the postcard designer and the campaign composer so there is one postcard, everywhere.
//
// FRONT_VARIANTS distinct LOOKS per mode (mailer.ts owns the count so the board's spin cycle and
// this renderer stay in lockstep). Every look is pure presentation over the same real materials —
// the copy, photo, and brand color come from the spec; the variants only change layout/typography.
// Print rules kept everywhere: high-contrast text, nothing outside the safe-zone padding.

import { useState } from 'react';
import { RotateCw } from 'lucide-react';
import { FRONT_VARIANTS, type MailerSpec } from '../../lib/garvis/mailer';

// Print-safe serif display stack for the editorial/luxury looks — installed everywhere, crisp on
// paper, and visually distinct from the app's UI sans (these cards leave the app).
const SERIF = "Georgia, 'Times New Roman', serif";

/** 6×9 front. Photo full-bleed/framed if present; otherwise a designed brand card. `variant`
 *  cycles genuinely different LOOKS (scrims, editorial frame, chip, split panel, letterpress
 *  border) so "spin another" gives a visibly different design from the same real materials — not
 *  the same card twice. */
export function PostcardFront({ spec, accent, variant = 0 }: { spec: MailerSpec; accent: string; variant?: number }) {
  const hasPhoto = !!spec.front.imageUrl;
  const v = ((variant % FRONT_VARIANTS) + FRONT_VARIANTS) % FRONT_VARIANTS;
  const kicker = spec.front.kicker;
  const headline = spec.front.headline;

  if (hasPhoto) {
    const img = <img src={spec.front.imageUrl!} alt={spec.front.imageAlt} className="absolute inset-0 h-full w-full object-cover" />;

    // v3 — EDITORIAL FRAME: white mat around the photo, copy on the white band below. The classic
    // framed-print listing look; dark type on white, the most print-crisp of the set.
    if (v === 3) {
      return (
        <div className="mailer-card relative w-full overflow-hidden rounded-lg bg-white shadow-soft" style={{ aspectRatio: '9 / 6' }}>
          <div className="flex h-full w-full flex-col" style={{ padding: '4%' }}>
            <div className="relative w-full flex-1 overflow-hidden bg-neutral-200">{img}</div>
            <div style={{ paddingTop: '3.2%' }}>
              {kicker && <div className="text-[1.9vw] font-semibold uppercase lg:text-[11px]" style={{ color: accent, letterSpacing: '.16em' }}>{kicker}</div>}
              <div className="mt-[0.8%] text-[3.5vw] leading-tight text-neutral-900 lg:text-[21px]" style={{ fontFamily: SERIF }}>{headline}</div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="mailer-card relative w-full overflow-hidden rounded-lg bg-black shadow-soft" style={{ aspectRatio: '9 / 6' }}>
        {img}
        {v === 1 ? (
          // GALLERY — full veil, centered serif display: the luxury-magazine look.
          <div className="absolute inset-0 flex flex-col items-center justify-center p-[6%] text-center" style={{ background: 'rgba(18,13,8,.52)' }}>
            {kicker && <div className="text-[2.1vw] font-medium uppercase text-white/85 lg:text-[12px]" style={{ letterSpacing: '.22em' }}>{kicker}</div>}
            <div className="mt-[2.4%] text-[4.7vw] leading-[1.12] text-white lg:text-[28px]" style={{ fontFamily: SERIF }}>{headline}</div>
            <div className="mt-[3%] h-px w-[16%] bg-white/70" />
          </div>
        ) : v === 2 ? (
          // BANNER — accent kicker band up top, solid deep band below: bold, modern, unmissable.
          <>
            {kicker && (
              <div className="absolute inset-x-0 top-0 px-[5%] py-[2.6%] text-[2.1vw] font-semibold uppercase text-white lg:text-[12px]" style={{ background: accent, letterSpacing: '.18em' }}>{kicker}</div>
            )}
            <div className="absolute inset-x-0 bottom-0 px-[5%] py-[4%]" style={{ background: 'rgba(14,11,8,.9)' }}>
              <div className="text-[4.2vw] font-bold leading-tight text-white lg:text-[25px]">{headline}</div>
            </div>
          </>
        ) : v === 4 ? (
          // CHIP — the kicker as an accent chip over a soft scrim: social-forward and current.
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-[5%] pt-[16%]">
            {kicker && (
              <span className="inline-block rounded text-[2vw] font-bold uppercase text-white lg:text-[11px]" style={{ background: accent, letterSpacing: '.14em', padding: '4px 10px' }}>{kicker}</span>
            )}
            <div className="mt-[2%] text-[4.4vw] font-bold leading-tight text-white lg:text-[26px]">{headline}</div>
          </div>
        ) : (
          // CLASSIC — bottom gradient scrim, accent kicker, rule under the headline.
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-[5%] pt-[15%]">
            {kicker && <div className="text-[2.2vw] font-semibold uppercase lg:text-[12px]" style={{ color: accent, letterSpacing: '.18em' }}>{kicker}</div>}
            <div className="mt-[1%] text-[4.4vw] font-bold leading-tight text-white lg:text-[26px]">{headline}</div>
            <div className="mt-[2.6%] h-[3px] w-[14%] rounded-full" style={{ background: accent }} />
          </div>
        )}
      </div>
    );
  }

  // ---- Brand card (no photo) ----

  // v3 — SPLIT PANEL: deep copy column + accent field with a thin geometric ring motif.
  if (v === 3) {
    return (
      <div className="mailer-card relative w-full overflow-hidden rounded-lg shadow-soft" style={{ aspectRatio: '9 / 6', background: shade(accent, -45) }}>
        <div className="flex h-full">
          <div className="flex flex-col justify-center" style={{ width: '44%', padding: '6%' }}>
            {kicker && <div className="text-[2vw] font-medium uppercase text-white/75 lg:text-[11px]" style={{ letterSpacing: '.2em' }}>{kicker}</div>}
            <div className="mt-[5%] text-[4.1vw] leading-[1.15] text-white lg:text-[25px]" style={{ fontFamily: SERIF }}>{headline}</div>
            <div className="mt-[7%] h-px w-[30%] bg-white/60" />
          </div>
          <div className="relative flex-1" style={{ background: `linear-gradient(160deg, ${accent} 0%, ${shade(accent, -26)} 100%)` }}>
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ width: '58%', aspectRatio: '1', border: '1px solid rgba(255,255,255,.45)' }} />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ width: '42%', aspectRatio: '1', border: '1px solid rgba(255,255,255,.22)' }} />
          </div>
        </div>
      </div>
    );
  }

  // v4 — LETTERPRESS: solid deep field, double hairline border, centered serif. Timeless in print.
  if (v === 4) {
    return (
      <div className="mailer-card relative w-full overflow-hidden rounded-lg shadow-soft" style={{ aspectRatio: '9 / 6', background: shade(accent, -38) }}>
        <div className="absolute" style={{ inset: '4.5%', border: '1px solid rgba(255,255,255,.55)' }} />
        <div className="absolute" style={{ inset: '6%', border: '1px solid rgba(255,255,255,.22)' }} />
        <div className="absolute inset-0 flex flex-col items-center justify-center p-[10%] text-center">
          {kicker && <div className="text-[2.1vw] font-medium uppercase text-white/80 lg:text-[12px]" style={{ letterSpacing: '.24em' }}>{kicker}</div>}
          <div className="mt-[2.6%] text-[5vw] leading-[1.1] text-white lg:text-[30px]" style={{ fontFamily: SERIF }}>{headline}</div>
          <div className="mt-[3.2%] h-px w-[14%] bg-white/70" />
        </div>
      </div>
    );
  }

  // v1 — CENTERED SERIF: radial depth, display serif, double rule. The luxury default.
  if (v === 1) {
    return (
      <div className="mailer-card relative w-full overflow-hidden rounded-lg shadow-soft" style={{ aspectRatio: '9 / 6', background: `radial-gradient(120% 120% at 50% 0%, ${shade(accent, 10)} 0%, ${shade(accent, -42)} 78%)` }}>
        <div className="absolute inset-0 flex flex-col items-center justify-center p-[9%] text-center text-white">
          {kicker && <div className="text-[2.1vw] font-medium uppercase text-white/80 lg:text-[12px]" style={{ letterSpacing: '.22em' }}>{kicker}</div>}
          <div className="mt-[2.4%] text-[5.5vw] leading-[1.1] lg:text-[33px]" style={{ fontFamily: SERIF }}>{headline}</div>
          <div className="mt-[3.4%] h-px w-[16%] bg-white/70" />
          <div className="mt-[0.9%] h-px w-[10%] bg-white/30" />
        </div>
      </div>
    );
  }

  // v0 — left-aligned editorial · v2 — top-aligned editorial, both on brand gradients.
  const grad = v === 2
    ? `linear-gradient(30deg, ${shade(accent, -34)} 0%, ${accent} 100%)`
    : `linear-gradient(145deg, ${accent} 0%, ${shade(accent, -30)} 100%)`;
  const align = v === 2 ? 'items-start justify-start pt-[11%]' : 'items-start justify-center';
  return (
    <div className="mailer-card relative w-full overflow-hidden rounded-lg shadow-soft" style={{ aspectRatio: '9 / 6', background: grad }}>
      <div className={`absolute inset-0 flex flex-col p-[8.5%] text-white ${align}`}>
        {kicker && <div className="text-[2.2vw] font-medium uppercase text-white/85 lg:text-[12px]" style={{ letterSpacing: '.2em' }}>{kicker}</div>}
        <div className="mt-[2.6%] text-[5vw] font-bold leading-[1.08] lg:text-[30px]">{headline}</div>
        <div className="mt-[4.5%] h-[3px] w-[20%] rounded-full bg-white/70" />
        {v === 2 && <div className="mt-auto text-[1.8vw] uppercase text-white/60 lg:text-[10px]" style={{ letterSpacing: '.2em' }}>{spec.back.contactLine.split(' · ')[0]}</div>}
      </div>
    </div>
  );
}

/** 6×9 back. Copy left, QR + address/postage zone right (bottom-right kept clear per USPS). */
export function PostcardBack({ spec, accent, qr }: { spec: MailerSpec; accent: string; qr: string | null }) {
  return (
    <div className="mailer-card relative w-full overflow-hidden rounded-lg border border-forge-border bg-white text-neutral-900 shadow-soft" style={{ aspectRatio: '9 / 6' }}>
      <div className="flex h-full">
        <div className="flex w-1/2 flex-col p-[4%]">
          <div className="mb-[2.6%] h-[3px] w-[13%] rounded-full" style={{ background: accent }} />
          <div className="text-[3.4vw] leading-tight lg:text-[20px]" style={{ color: accent, fontFamily: SERIF }}>{spec.back.headline}</div>
          <div className="mt-[3%] whitespace-pre-line text-[2vw] leading-relaxed text-neutral-700 lg:text-[12px]">{spec.back.body}</div>
          {/* The Offer field prints: shown as its own emphasized line when it isn't already baked into the body (the dock's Offer edit was silently invisible before). */}
          {spec.back.offer.trim() && !spec.back.body.includes(spec.back.offer.trim()) && (
            <div className="mt-[2%] whitespace-pre-line text-[2vw] font-semibold leading-snug text-neutral-800 lg:text-[12px]">{spec.back.offer}</div>
          )}
          <div className="mt-auto border-t border-neutral-200 pt-[2.4%]">
            <div className="text-[2.2vw] font-semibold lg:text-[13px]">{spec.back.cta}</div>
            <div className="mt-[1.6%] text-[1.7vw] text-neutral-500 lg:text-[10px]">{spec.back.contactLine}</div>
            {spec.back.complianceLine && <div className="mt-[0.8%] text-[1.4vw] uppercase text-neutral-400 lg:text-[8.5px]" style={{ letterSpacing: '.06em' }}>{spec.back.complianceLine}</div>}
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
export function PostcardViewer({ spec, accent, qr, variant = 0 }: { spec: MailerSpec; accent: string; qr: string | null; variant?: number }) {
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
      <div className={side === 'front' ? '' : 'hidden'}><PostcardFront spec={spec} accent={accent} variant={variant} /></div>
      <div className={side === 'back' ? '' : 'hidden'}><PostcardBack spec={spec} accent={accent} qr={qr} /></div>
    </div>
  );
}

/** Lighten/darken a #rrggbb by pct (−100..100). Deterministic, for the no-photo fields. */
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
