// driftPalette.ts — the pure core of the drift's colour grammar (docs/dot-field-map.md §5).
//
// One meaning per channel: HUE names the region and nothing else; LIGHTNESS is read state; the
// intensity ramp lives on the nebula layer only; ember #E8833A is the one interaction accent and
// its hue band is never used for data. Hue is assigned from a region's bearing around the world's
// centre, quantized to eight families, with a deterministic collision rule so two regions that
// share a family are never closer than 0.5 plane-units. The prototype (prototypes/the-drift.html)
// embeds the same rules; the verify suite reads the prototype's WORLDS table and checks both agree.

export const EMBER_HEX = '#E8833A';
export const GROUND_HEX = '#0B0E14';
export const HUE_FAMILIES = 8;
export const HUE_START = 52;          // first family hue; the band 5–51 around ember stays empty
export const HUE_SPAN = 312;          // 52 → 364 (= 4)
export const EMBER_BAND: [number, number] = [5, 51];
export const MIN_SAME_FAMILY_DISTANCE = 0.5;
export const CONSUMER_COMPASS = { x: ['calm', 'wild'], y: ['serious', 'goofy'] } as const;

export interface Region { key: string; x: number; y: number; family?: number; hue?: number }

export function familyHue(family: number): number {
  return (HUE_START + family * (HUE_SPAN / HUE_FAMILIES)) % 360;
}

/** Bearing around the world centre, 0 = east, counter-clockwise; screen y grows downward. */
export function bearingOf(r: Region): number {
  return (Math.atan2(-r.y, r.x) + Math.PI * 2) % (Math.PI * 2);
}

/** Assign hue families in index order with the collision rule — the single source of truth. */
export function assignFamilies<T extends Region>(regions: T[]): T[] {
  const dist = (a: Region, b: Region) => Math.hypot(a.x - b.x, a.y - b.y);
  regions.forEach((r) => { r.family = Math.floor(bearingOf(r) / (Math.PI * 2) * HUE_FAMILIES) % HUE_FAMILIES; });
  for (let i = 0; i < regions.length; i++) {
    const r = regions[i]; const earlier = regions.slice(0, i);
    const clash = (fam: number) => earlier.some((e) => e.family === fam && dist(e, r) < MIN_SAME_FAMILY_DISTANCE);
    if (clash(r.family!)) {
      let best = -1; let bestD = 99;
      for (let fam = 0; fam < HUE_FAMILIES; fam++) {
        if (clash(fam)) continue;
        const d = Math.min((fam - r.family! + HUE_FAMILIES) % HUE_FAMILIES, (r.family! - fam + HUE_FAMILIES) % HUE_FAMILIES);
        if (d < bestD || (d === bestD && fam < best)) { bestD = d; best = fam; }
      }
      if (best >= 0) r.family = best;
    }
    r.hue = familyHue(r.family!);
  }
  return regions;
}

/* lightness is the read state and nothing else. A fixed L lets hue leak into brightness — an HSL
   yellow at L40 clears 4.5:1 against the ground while a blue at the same L fails 3:1 — so every hue
   is solved to the same contrast: read dots READ_CONTRAST, unread dots UNREAD_CONTRAST. A read blue
   is exactly as dim as a read yellow. The prototype carries the same solver; verify:driftpalette
   keeps the two in step. */
export const READ_CONTRAST = 3.5;
export const UNREAD_CONTRAST = 8;
export const DOT_SATURATION = { read: 30, unread: 52 } as const;
export function lightnessFor(hue: number, sat: number, target: number, groundHex: string = GROUND_HEX): number {
  const g = relativeLuminance(hexToRgb(groundHex));
  let lo = 10; let hi = 96;
  for (let k = 0; k < 28; k++) {
    const mid = (lo + hi) / 2;
    const c = (relativeLuminance(hslToRgb(hue, sat, mid)) + 0.05) / (g + 0.05);
    if (c < target) lo = mid; else hi = mid;
  }
  return Math.round(hi * 10) / 10;
}
export function dotColour(hue: number, read: boolean): string {
  const s = read ? DOT_SATURATION.read : DOT_SATURATION.unread;
  return `hsl(${hue} ${s}% ${lightnessFor(hue, s, read ? READ_CONTRAST : UNREAD_CONTRAST)}%)`;
}
export function nebulaSaturation(x: number): number { return Math.round(18 + 26 * (x + 1) / 2); }

/* ---- colour maths for the verify suite ---- */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const S = s / 100; const L = l / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S; const hp = ((h % 360) + 360) % 360 / 60; const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0; let g = 0; let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0]; else if (hp < 2) [r, g, b] = [x, c, 0]; else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c]; else if (hp < 5) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  const m = L - c / 2;
  return [r + m, g + m, b + m];
}
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = relativeLuminance(a); const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
export function parseHsl(css: string): [number, number, number] {
  const m = css.match(/hsl\((\d+(?:\.\d+)?) (\d+)% (\d+(?:\.\d+)?)%\)/);
  if (!m) throw new Error('not an hsl() string: ' + css);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
export function inEmberBand(hue: number): boolean { return hue >= EMBER_BAND[0] && hue <= EMBER_BAND[1]; }
