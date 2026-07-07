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

function assembleCss(pal: { light: Tokens; dark: Tokens }): string {
  return `${emit(':root', pal.light)}
${emit('.dark', pal.dark)}
* { box-sizing: border-box; border-color: hsl(var(--border)); }
html, body, #root { height: 100%; }
body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
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
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
`;
}

/** Build the full /src/index.css for a named preset — same structure as the scaffold default. */
export function buildIndexCss(presetId: string): string {
  return assembleCss(PALETTES[presetId] ?? PALETTES.slate);
}

/**
 * The full DESIGN BUNDLE a chosen direction (or the blueprint) commits to. Every field maps to a
 * deterministic token — this is what makes a picked direction actually HAPPEN instead of being
 * flattened into "same white app, different accent" (only hue+headingFont used to survive).
 */
export interface AppDesign {
  /** Accent hue 0–359 (the one primary color). */
  accentHue?: number;
  /** Google Font for headings (display personality). */
  headingFont?: string;
  /** Google Font for body text (default Inter). */
  bodyFont?: string;
  /** Corner radius in px: 0 sharp editorial/brutalist … 10 default … 24 soft organic. */
  radius?: number;
  /** Which theme the app OPENS in — 'dark' for midnight/pro-tool directions. */
  mode?: 'light' | 'dark';
  /** Light-mode surface tint (the "paper"): hue 0-359, saturation 0-40, lightness 90-100.
   *  Warm cream ≈ {37, 30, 96}; cool near-white ≈ {215, 15, 98}. Defaults to the accent hue. */
  bgHue?: number;
  bgSat?: number;
  bgLight?: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const validFont = (f?: string): string => {
  const fam = (f ?? '').trim();
  return fam && /^[a-zA-Z0-9 ]{2,40}$/.test(fam) ? fam : '';
};

/**
 * Build a cohesive /src/index.css from a full design bundle — used at generation time so each app
 * gets a REAL identity: paper tint, radius, both fonts, and its opening theme, not just an accent.
 */
export function buildIndexCssForDesign(design: AppDesign): string {
  const accent = Number.isFinite(Number(design.accentHue)) ? (((Number(design.accentHue) % 360) + 360) % 360) : 215;
  const bgHue = Number.isFinite(Number(design.bgHue)) ? (((Number(design.bgHue) % 360) + 360) % 360) : accent;
  const bgSat = Number.isFinite(Number(design.bgSat)) ? clamp(Number(design.bgSat), 0, 40) : 26;
  const bgLight = Number.isFinite(Number(design.bgLight)) ? clamp(Number(design.bgLight), 90, 100) : 97.5;

  const pal = makePalette({
    id: 'custom', name: 'Custom', swatch: ['#eee', '#888'],
    hue: bgHue, sat: bgSat,
    primaryLight: [accent, 68, 45], primaryDark: [accent, 62, 60],
  });
  // Shift the whole light-surface ladder with the paper tint so a warm-cream or bone direction
  // keeps its contrast structure (card floats above bg, borders stay visible).
  const delta = 97.5 - bgLight;
  pal.light['--background'] = t(bgHue, bgSat, bgLight);
  pal.light['--card'] = t(bgHue, bgSat * 0.5, clamp(bgLight + 2.5, 90, 100));
  pal.light['--popover'] = pal.light['--card'];
  pal.light['--secondary'] = t(bgHue, bgSat, clamp(95.5 - delta, 80, 100));
  pal.light['--muted'] = t(bgHue, bgSat, clamp(95 - delta, 80, 100));
  pal.light['--accent'] = t(bgHue, bgSat, clamp(93 - delta, 80, 100));
  pal.light['--border'] = t(bgHue, bgSat, clamp(89 - delta, 74, 96));
  pal.light['--input'] = pal.light['--border'];

  const radiusPx = Number.isFinite(Number(design.radius)) ? clamp(Number(design.radius), 0, 28) : 10;
  pal.light['--radius'] = `${radiusPx / 16}rem`; // full precision — round() would turn 0.625 into 0.6
  if (design.mode === 'dark') pal.light['--default-theme'] = 'dark'; // read by the scaffold's getTheme()

  let css = assembleCss(pal);

  // Fonts: one @import for both families; headings get the display font, body gets --font-sans
  // (the scaffold Tailwind config maps font-sans onto it, so utilities follow too).
  const heading = validFont(design.headingFont);
  const body = validFont(design.bodyFont);
  const families = [...new Set([heading, body].filter(Boolean))]
    .map((f) => `family=${f.replace(/ /g, '+')}:wght@400;500;600;700`).join('&');
  if (families) css = `@import url('https://fonts.googleapis.com/css2?${families}&display=swap');\n${css}`;
  if (heading) {
    css += `:root { --font-display: "${heading}", Inter, ui-sans-serif, system-ui, sans-serif; }
h1,h2,h3,h4,h5,h6,.font-display { font-family: var(--font-display); }
`;
  }
  if (body) {
    css += `:root { --font-sans: "${body}", Inter, ui-sans-serif, system-ui, sans-serif; }
body { font-family: var(--font-sans); }
`;
  }
  return css;
}

/**
 * Back-compat wrapper: a palette from just an accent hue (+ optional heading font). Prefer
 * buildIndexCssForDesign for anything blueprint-driven.
 */
export function buildIndexCssForHue(hue: number, headingFont?: string): string {
  return buildIndexCssForDesign({ accentHue: hue, headingFont });
}
