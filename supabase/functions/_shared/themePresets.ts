// src/lib/themePresets.ts
// Curated, universally-liked color themes for generated apps. Because the whole app is driven by
// shadcn design tokens (CSS variables in /src/index.css), a "theme" is just a set of token values
// — applying one rewrites index.css and instantly recolors the entire app with NO model call.
//
// Each preset is a FULL palette, not just an accent swap: the background, cards, muted surfaces,
// borders and accent are all derived from the theme's hue, so switching presets changes the whole
// vibe of the app (not only text/buttons). Palettes are generated from a base hue + saturation so
// they stay cohesive and accessible (near-neutral surfaces, one vivid accent).

export interface ThemePreset {
  id: string;
  name: string;
  /** Two swatch colors for the picker: [surface tint, accent]. */
  swatch: [string, string];
}

interface PresetDef {
  id: string;
  name: string;
  swatch: [string, string];
  /** Hue (0–360) used to tint surfaces, and how saturated those surfaces are (0–40). */
  hue: number;
  sat: number;
  /** A neutral theme keeps a near-black/near-white primary; colored themes use a vivid accent. */
  mono?: boolean;
  /** Accent HSL "H S L" (no units) for light and dark when not mono. */
  primaryLight?: [number, number, number];
  primaryDark?: [number, number, number];
}

const t = (h: number, s: number, l: number) => `${round(h)} ${round(s)}% ${round(l)}%`;
const round = (n: number) => Math.round(n * 10) / 10;

type Tokens = Record<string, string>;

/** Derive a cohesive light + dark palette from a preset definition. */
function makePalette(d: PresetDef): { light: Tokens; dark: Tokens } {
  const h = d.hue;
  const s = d.sat;
  const pl = d.primaryLight ?? [h, Math.min(s + 12, 24), 15]; // mono: dark, hue-tinted near-black
  const pd = d.primaryDark ?? [h, 10, 96]; // mono dark: near-white
  const monoFgLight = t(h, 8, 98);
  const monoFgDark = t(h, Math.min(s + 12, 24), 13);

  const light: Tokens = {
    '--background': t(h, s, d.mono ? 99 : 97.5),
    '--foreground': t(h, Math.min(s + 8, 30), 11),
    '--card': t(h, s * 0.5, 100),
    '--card-foreground': t(h, Math.min(s + 8, 30), 11),
    '--popover': t(h, s * 0.5, 100),
    '--popover-foreground': t(h, Math.min(s + 8, 30), 11),
    '--primary': t(pl[0], pl[1], pl[2]),
    '--primary-foreground': d.mono ? monoFgLight : t(pl[0], Math.min(pl[1], 40), 98),
    '--secondary': t(h, s, 95.5),
    '--secondary-foreground': t(h, Math.min(s + 10, 30), 18),
    '--muted': t(h, s, 95),
    '--muted-foreground': t(h, Math.min(s, 14), 42),
    '--accent': t(h, s, 93),
    '--accent-foreground': t(h, Math.min(s + 10, 30), 18),
    '--destructive': '0 84.2% 60.2%',
    '--destructive-foreground': '0 0% 98%',
    '--border': t(h, s, 89),
    '--input': t(h, s, 89),
    '--ring': d.mono ? t(pl[0], pl[1], pl[2]) : t(pl[0], pl[1], pl[2]),
    '--radius': '0.625rem',
  };

  const dark: Tokens = {
    '--background': t(h, s, d.mono ? 5.5 : 7),
    '--foreground': t(h, 10, 96),
    '--card': t(h, s, d.mono ? 8 : 9.5),
    '--card-foreground': t(h, 10, 96),
    '--popover': t(h, s, d.mono ? 8 : 9.5),
    '--popover-foreground': t(h, 10, 96),
    '--primary': t(pd[0], pd[1], pd[2]),
    '--primary-foreground': d.mono ? monoFgDark : t(pd[0], Math.min(pd[1], 40), 12),
    '--secondary': t(h, s, 16),
    '--secondary-foreground': t(h, 10, 96),
    '--muted': t(h, s, 15.5),
    '--muted-foreground': t(h, Math.min(s, 14), 64),
    '--accent': t(h, s, 17),
    '--accent-foreground': t(h, 10, 96),
    '--destructive': '0 62.8% 30.6%',
    '--destructive-foreground': '0 0% 98%',
    '--border': t(h, s, 18),
    '--input': t(h, s, 18),
    '--ring': d.mono ? t(h, 12, 84) : t(pd[0], pd[1], pd[2]),
  };

  return { light, dark };
}

// The catalog. Neutral themes (mono) for a clean, classic look; colored themes for personality.
const DEFS: PresetDef[] = [
  { id: 'slate', name: 'Slate', swatch: ['#e2e8f0', '#0f172a'], hue: 215, sat: 16, mono: true },
  { id: 'stone', name: 'Stone', swatch: ['#e7e5e4', '#1c1917'], hue: 30, sat: 8, mono: true },
  { id: 'violet', name: 'Violet', swatch: ['#ede9fe', '#7c3aed'], hue: 263, sat: 30, primaryLight: [262, 83, 58], primaryDark: [263, 70, 62] },
  { id: 'ocean', name: 'Ocean', swatch: ['#dbeafe', '#2563eb'], hue: 213, sat: 32, primaryLight: [221, 83, 53], primaryDark: [217, 91, 62] },
  { id: 'forest', name: 'Forest', swatch: ['#dcfce7', '#059669'], hue: 158, sat: 26, primaryLight: [142, 72, 38], primaryDark: [142, 69, 48] },
  { id: 'sunset', name: 'Sunset', swatch: ['#ffedd5', '#ea580c'], hue: 24, sat: 38, primaryLight: [24.6, 95, 53], primaryDark: [20.5, 90, 52] },
  { id: 'rose', name: 'Rose', swatch: ['#ffe4e6', '#e11d48'], hue: 350, sat: 32, primaryLight: [346.8, 77, 49.8], primaryDark: [346.8, 77, 55] },
  { id: 'midnight', name: 'Midnight', swatch: ['#c7d2fe', '#4f46e5'], hue: 240, sat: 30, primaryLight: [243, 75, 59], primaryDark: [245, 80, 66] },
];

const PALETTES: Record<string, { light: Tokens; dark: Tokens }> = Object.fromEntries(
  DEFS.map((d) => [d.id, makePalette(d)]),
);

export const THEME_PRESETS: ThemePreset[] = DEFS.map((d) => ({ id: d.id, name: d.name, swatch: d.swatch }));

export function getPreset(id: string): ThemePreset {
  return THEME_PRESETS.find((p) => p.id === id) ?? THEME_PRESETS[0];
}

function emit(selector: string, vars: Tokens): string {
  const lines = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join('\n');
  return `${selector} {\n${lines}\n}`;
}

// SIGNATURE-DEVICE utilities — the personality toolkit every generated app ships with. All
// token-driven (they recolor with the theme) and compositor-friendly. The DESIGN_GUIDE teaches the
// model when to reach for each; an app that uses 2-3 of these stops reading as "AI template".
const PERSONALITY_CSS = `/* ---- signature devices (see DESIGN guide: pick 2-3, never all) ---- */
/* Film-grain texture overlay — put class "grain" on a hero / dark band / full-bleed section. */
.grain { position: relative; isolation: isolate; }
.grain::after {
  content: ''; position: absolute; inset: 0; z-index: 1; pointer-events: none; opacity: 0.055;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E");
}
/* Infinite marquee — <div class="marquee"><div class="marquee-track"> content ×2 </div></div>. */
.marquee { overflow: hidden; }
.marquee-track { display: flex; gap: 3rem; width: max-content; animation: marquee-scroll 32s linear infinite; }
.marquee:hover .marquee-track { animation-play-state: paused; }
@keyframes marquee-scroll { to { transform: translateX(-50%); } }
/* Oversized display type for hero headlines / giant stats / footer wordmarks. */
.text-display { font-family: var(--font-display, inherit); font-size: clamp(2.75rem, 8vw, 6.5rem); line-height: 0.98; letter-spacing: -0.03em; font-weight: 700; }
/* Hollow outline type — ONE display word for editorial/brutalist punch. */
.text-outline { -webkit-text-stroke: 2px hsl(var(--foreground)); color: transparent; }
/* Section textures — archival dots / engineered ruled lines. */
.bg-dots { background-image: radial-gradient(hsl(var(--foreground) / 0.09) 1px, transparent 1px); background-size: 22px 22px; }
.bg-ruled { background-image: repeating-linear-gradient(to bottom, transparent, transparent 31px, hsl(var(--border)) 31px, hsl(var(--border)) 32px); }
/* Link underline that draws in on hover (nav/footer links). */
.underline-draw { background-image: linear-gradient(currentColor, currentColor); background-size: 0% 1.5px; background-repeat: no-repeat; background-position: left 100%; transition: background-size 0.25s cubic-bezier(0.16,1,0.3,1); }
.underline-draw:hover { background-size: 100% 1.5px; }
/* Hard offset block shadow (neobrutalist surfaces — pair with a 2px border). */
.shadow-hard { box-shadow: 4px 4px 0 hsl(var(--foreground)); }
.shadow-hard-primary { box-shadow: 4px 4px 0 hsl(var(--primary)); }
`;

function assembleCss(pal: { light: Tokens; dark: Tokens }, bodyStack = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'): string {
  return `${emit(':root', pal.light)}
${emit('.dark', pal.dark)}
* { box-sizing: border-box; border-color: hsl(var(--border)); }
html, body, #root { height: 100%; }
body {
  margin: 0;
  font-family: ${bodyStack};
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
  -webkit-font-smoothing: antialiased;
}
h1,h2,h3 { line-height: 1.2; font-weight: 600; letter-spacing: -0.015em; }
/* Branded "designed" touches: accent text selection, accent focus ring, themed scrollbar,
   tabular numerals for metrics. */
::selection { background-color: hsl(var(--primary) / 0.28); }
:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb { background: hsl(var(--border)); border-radius: 6px; }
::-webkit-scrollbar-thumb:hover { background: hsl(var(--muted-foreground) / 0.5); }
::-webkit-scrollbar-track { background: transparent; }
.tabular-nums, [data-metric] { font-variant-numeric: tabular-nums; }
/* Composed entrances: put .stagger on a list/grid container and its children cascade in.
   Delays are capped so long lists never feel slow. */
@keyframes stagger-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.stagger > * { opacity: 0; animation: stagger-in 0.45s cubic-bezier(0.16,1,0.3,1) forwards; }
.stagger > *:nth-child(1) { animation-delay: 0.04s; }
.stagger > *:nth-child(2) { animation-delay: 0.08s; }
.stagger > *:nth-child(3) { animation-delay: 0.12s; }
.stagger > *:nth-child(4) { animation-delay: 0.16s; }
.stagger > *:nth-child(5) { animation-delay: 0.2s; }
.stagger > *:nth-child(6) { animation-delay: 0.24s; }
.stagger > *:nth-child(7) { animation-delay: 0.28s; }
.stagger > *:nth-child(8) { animation-delay: 0.32s; }
.stagger > *:nth-child(n+9) { animation-delay: 0.36s; }
/* Hover lift for interactive/linked cards — transform+shadow only (compositor-friendly). */
.card-lift { transition: transform 0.2s cubic-bezier(0.16,1,0.3,1), box-shadow 0.2s cubic-bezier(0.16,1,0.3,1), border-color 0.2s; }
.card-lift:hover { transform: translateY(-2px); box-shadow: 0 8px 24px -8px hsl(var(--foreground) / 0.14); }
${PERSONALITY_CSS}@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  .marquee-track { animation: none !important; }
}
`;
}

/** Build the full /src/index.css for a named preset — same structure as the scaffold default. */
export function buildIndexCss(presetId: string): string {
  return assembleCss(PALETTES[presetId] ?? PALETTES.slate);
}

// ---------------------------------------------------------------------------
// DESIGN SPEC — the full identity contract from the blueprint's `design` object. This is what lets
// a chosen archetype SURVIVE into the shipped CSS: background character, surface saturation, radius,
// border weight, shadow style, and both fonts all land in tokens instead of being flattened to
// "one hue + Inter". (The flattening was the single biggest "every app looks the same AI" leak.)
// ---------------------------------------------------------------------------

export interface DesignSpec {
  accentHue: number;
  /** Accent chroma/lightness — lets muted editorial accents and vivid pop accents both exist. */
  accentSat?: number;   // 0-100, default 68
  accentLight?: number; // 25-65, default 45
  headingFont?: string;
  bodyFont?: string;
  /** Background character: clean white / warm paper / colored field / committed dark. */
  mode?: 'light' | 'paper' | 'tinted' | 'dark';
  /** How hue-tinted the neutral surfaces are (0 = pure gray, 40 = strongly tinted). */
  surfaceSat?: number;  // default 26
  /** Corner radius in rem: 0 (editorial/brutalist) … 1.5 (playful pills). */
  radius?: number;      // default 0.625
  borders?: 'hairline' | 'standard' | 'bold';
  shadows?: 'soft' | 'hard' | 'none';
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const FONT_RE = /^[a-zA-Z0-9 ]{2,40}$/;

// Google Fonts families that ship ONE static weight — requesting wght axes for these returns
// HTTP 400 and the @import dies silently. Browsers synthesize heavier weights acceptably.
const SINGLE_WEIGHT_FONTS = new Set([
  'Anton', 'Archivo Black', 'Gloock', 'Young Serif', 'Instrument Serif', 'Abril Fatface',
  'Bebas Neue', 'Alfa Slab One', 'Righteous', 'Shrikhand', 'Special Elite', 'Monoton',
]);

/** Tolerant reader: blueprint `design` JSON (unknown shape) → a validated DesignSpec, or null. */
export function parseDesignSpec(design: unknown): DesignSpec | null {
  const d = (design ?? {}) as Record<string, unknown>;
  const hue = Number(d.accentHue);
  if (!Number.isFinite(hue)) return null;
  const str = (v: unknown) => (typeof v === 'string' && FONT_RE.test(v.trim()) ? v.trim() : undefined);
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
  const oneOf = <T extends string>(v: unknown, opts: readonly T[]): T | undefined =>
    typeof v === 'string' && (opts as readonly string[]).includes(v) ? (v as T) : undefined;
  return {
    accentHue: hue,
    accentSat: num(d.accentSat),
    accentLight: num(d.accentLight),
    headingFont: str(d.headingFont),
    bodyFont: str(d.bodyFont),
    mode: oneOf(d.mode, ['light', 'paper', 'tinted', 'dark'] as const),
    surfaceSat: num(d.surfaceSat),
    radius: num(d.radius),
    borders: oneOf(d.borders, ['hairline', 'standard', 'bold'] as const),
    shadows: oneOf(d.shadows, ['soft', 'hard', 'none'] as const),
  };
}

/** Derive the light+dark palettes for a spec — the mode/saturation/border knobs land here. */
function makeSpecPalette(spec: DesignSpec): { light: Tokens; dark: Tokens } {
  const h = (((spec.accentHue % 360) + 360) % 360);
  const s = clamp(spec.surfaceSat ?? 26, 0, 40);
  const aS = clamp(spec.accentSat ?? 68, 0, 100);
  const aL = clamp(spec.accentLight ?? 45, 25, 65);
  const pal = makePalette({
    id: 'custom', name: 'Custom', swatch: ['#eee', '#888'],
    hue: h, sat: s,
    primaryLight: [h, aS, aL], primaryDark: [h, Math.max(aS - 6, 0), clamp(aL + 15, 40, 72)],
  });
  const mode = spec.mode ?? 'light';
  if (mode === 'paper') {
    // Warm paper: bg and cards nearly merge — structure comes from hairline rules, not boxes.
    pal.light['--background'] = t(h, Math.max(s, 14), 96.5);
    pal.light['--card'] = t(h, Math.max(s, 12), 98.5);
    pal.light['--popover'] = t(h, Math.max(s, 12), 98.5);
    pal.light['--muted'] = t(h, Math.max(s, 14), 93.5);
  } else if (mode === 'tinted') {
    // A visibly colored field with white cards floating on it.
    pal.light['--background'] = t(h, clamp(s + 12, 16, 44), 93);
    pal.light['--card'] = t(h, s * 0.4, 99.5);
    pal.light['--popover'] = t(h, s * 0.4, 99.5);
    pal.light['--border'] = t(h, clamp(s + 8, 12, 40), 85);
    pal.light['--input'] = t(h, clamp(s + 8, 12, 40), 85);
  }
  const borders = spec.borders ?? 'standard';
  if (borders === 'hairline') {
    pal.light['--border'] = t(h, s, 92.5); pal.light['--input'] = t(h, s, 92.5);
    pal.dark['--border'] = t(h, s, 15); pal.dark['--input'] = t(h, s, 15);
  } else if (borders === 'bold') {
    // Near-ink borders: even at 1px the UI reads drawn/printed; pair with border-2 + .shadow-hard.
    pal.light['--border'] = t(h, Math.min(s + 8, 30), 24); pal.light['--input'] = t(h, Math.min(s + 8, 30), 24);
    pal.dark['--border'] = t(h, 12, 78); pal.dark['--input'] = t(h, 12, 78);
  }
  const radius = clamp(spec.radius ?? 0.625, 0, 1.5);
  pal.light['--radius'] = `${radius}rem`;
  return pal;
}

/**
 * Build /src/index.css from a full DesignSpec — the archetype's whole bundle survives: background
 * character, both fonts, radius, borders, shadow style, and the signature-device utilities.
 */
export function buildIndexCssForDesign(spec: DesignSpec): string {
  const pal = makeSpecPalette(spec);
  // Committed-dark identity: the dark palette IS the app (both :root and .dark), matching
  // archetypes like Midnight Pro Tool where light mode would break the brand.
  if (spec.mode === 'dark') pal.light = { ...pal.dark, '--radius': pal.light['--radius'] };

  const heading = spec.headingFont && FONT_RE.test(spec.headingFont) ? spec.headingFont : undefined;
  const body = spec.bodyFont && FONT_RE.test(spec.bodyFont) && spec.bodyFont !== heading ? spec.bodyFont : undefined;
  const bodyStack = body
    ? `"${body}", Inter, ui-sans-serif, system-ui, sans-serif`
    : 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  // One @import PER family (a bad request for one family must not kill the other), and no weight
  // axis for single-weight display faces — the css2 API hard-errors on unavailable weights.
  const fontUrl = (fam: string, weights: string) => {
    const axis = SINGLE_WEIGHT_FONTS.has(fam) ? '' : `:wght@${weights}`;
    return `@import url('https://fonts.googleapis.com/css2?family=${fam.replace(/ /g, '+')}${axis}&display=swap');\n`;
  };
  const importLine =
    (heading ? fontUrl(heading, '500;600;700;800') : '') +
    (body ? fontUrl(body, '400;500;600') : '');

  const fontRules = heading
    ? `:root { --font-display: "${heading}", ${bodyStack}; }
h1,h2,h3,h4,h5,h6,.font-display { font-family: var(--font-display); }
`
    : '';

  // Shadow character: hard = brutalist offset blocks (card-lift snaps instead of floating);
  // none = flat archetypes where hover feedback is border/color only.
  const shadowRules = spec.shadows === 'hard'
    ? `.card-lift:hover { transform: translate(-2px, -2px); box-shadow: 6px 6px 0 hsl(var(--foreground)); }
`
    : spec.shadows === 'none'
      ? `.card-lift:hover { transform: none; box-shadow: none; border-color: hsl(var(--foreground) / 0.35); }
`
      : '';

  return `${importLine}${assembleCss(pal, bodyStack)}${fontRules}${shadowRules}`;
}

/**
 * Back-compat wrapper: build /src/index.css from just an accent hue (+ optional heading font) —
 * the pre-DesignSpec contract. New callers should pass the full spec via buildIndexCssForDesign.
 */
export function buildIndexCssForHue(hue: number, headingFont?: string): string {
  return buildIndexCssForDesign({ accentHue: hue, headingFont });
}
