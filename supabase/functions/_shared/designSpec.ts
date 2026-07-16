// _shared/designSpec.ts — PURE design builders for the render-design edge function.
// Each builder returns a satori node tree (plain objects, no JSX) that reproduces the app's CSS
// brand designs as REAL pixels. This is the seam that turns "the brand card is a preview and can't
// be attached" into an actual PNG on the post/print. Satori constraint notes: every multi-child div
// needs display:flex; color-mix() is unsupported, so gradient ends are precomputed with mixHex.

export interface BrandCardSpec {
  headline: string;
  business: string;
  area?: string | null;
  accent: string;      // validated hex, e.g. #FF8A3D
}

export const DESIGN_SIZES: Record<string, { w: number; h: number }> = {
  '1080x1080': { w: 1080, h: 1080 },   // Instagram square
  '1080x1350': { w: 1080, h: 1350 },   // Instagram portrait
  '1200x628': { w: 1200, h: 628 },     // FB / LinkedIn / X link size
};

/** Channel-mix two hex colors (wa = weight of `a`, 0..1). The satori-safe stand-in for color-mix(). */
export function mixHex(a: string, b: string, wa: number): string {
  const parse = (h: string): [number, number, number] => {
    const s = h.replace('#', '');
    const f = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
    return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
  };
  const [ar, ag, ab] = parse(a); const [br, bg, bb] = parse(b);
  const m = (x: number, y: number) => Math.round(x * wa + y * (1 - wa));
  return `#${[m(ar, br), m(ag, bg), m(ab, bb)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

type Node = { type: string; props: Record<string, unknown> };

/** The no-photo brand card, faithful to SocialMock's Frame: accent gradient, big balanced headline,
 *  a quiet business footer. Not AI imagery — it is the business's own brand graphic (no disclosure). */
export function brandCardDesign(spec: BrandCardSpec, w: number, h: number): Node {
  const base = Math.min(w, h);
  // Same recipe as the CSS: linear-gradient(140deg, accent, color-mix(accent 52%, #0b0710))
  const dark = mixHex(spec.accent, '#0b0710', 0.52);
  const footer: unknown[] = [
    { type: 'div', props: { style: { fontSize: base * 0.028, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.92)' }, children: spec.business } },
  ];
  if (spec.area?.trim()) {
    footer.push({ type: 'div', props: { style: { fontSize: base * 0.028, color: 'rgba(255,255,255,0.65)' }, children: `· ${spec.area.trim()}` } });
  }
  return {
    type: 'div',
    props: {
      style: {
        width: w, height: h, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: `linear-gradient(140deg, ${spec.accent} 0%, ${dark} 100%)`,
        fontFamily: 'Inter',
      },
      children: [
        { type: 'div', props: {
          style: { display: 'flex', flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: `0 ${Math.round(w * 0.1)}px` },
          children: { type: 'div', props: {
            style: { color: '#ffffff', fontWeight: 700, fontSize: base * 0.082, lineHeight: 1.14, textAlign: 'center', textShadow: '0 2px 24px rgba(0,0,0,0.30)', textWrap: 'balance' },
            children: spec.headline,
          } },
        } },
        { type: 'div', props: {
          style: { display: 'flex', alignItems: 'center', gap: base * 0.012, paddingBottom: Math.round(h * 0.055) },
          children: footer,
        } },
      ],
    },
  };
}
