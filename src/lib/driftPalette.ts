// driftPalette.ts — the pure core of the drift's colour grammar and wheel geometry (docs/dot-field-map.md).
//
// Rev. 5: the map is a WHEEL. Direction is a kind, depth is intensity, the hub is the mainstream. Eight
// sectors 45° apart (0 = east, counter-clockwise) carry a world's kinds; a region sits at (sector, radius).
// One meaning per channel: HUE names the kind — sector i wears family hue i in every world, exactly —
// and nothing else; LIGHTNESS is read state, solved per hue to one contrast; the intensity ramp lives on
// the nebula layer only; ember #E8833A is the one interaction accent and its hue band is never used for
// data. The prototype (prototypes/the-drift.html) embeds the same rules; the verify suite reads the
// prototype's WORLDS table and checks both agree.

export const EMBER_HEX = '#E8833A';
export const GROUND_HEX = '#0B0E14';
export const HUE_FAMILIES = 8;
export const HUE_START = 52;          // first family hue; the band 5–51 around ember stays empty
export const HUE_SPAN = 312;          // 52 → 364 (= 4)
export const EMBER_BAND: [number, number] = [5, 51];
export const SECTOR_DEG = 360 / HUE_FAMILIES;
export const HUB = 0.15;              // inside this radius the kind is undefined: the mainstream
export const MIN_SAME_SECTOR_RADIAL_GAP = 0.3;   // two regions in one sector are told apart by depth (and name)
export const DEEP_END = 0.75;         // from here out supply is honestly sparser
export const WHEEL_WORDS = { home: 'home', lit: ['shallower', 'deeper'] } as const;   // at the hub the ring shows the world's own shallow word

export type Register = 'serious' | 'goofy';
export interface Region { key: string; sector: number; radius: number; tag?: Register; bearing?: number; hue?: number; family?: number; density?: number }
export interface World { name: string; edition: number; depth: [string, string]; sectors: (string | null)[]; regions: Region[]; hint?: string }

export function sectorHue(sector: number): number {
  return (HUE_START + sector * (HUE_SPAN / HUE_FAMILIES)) % 360;
}
export function sectorBearing(sector: number): number { return sector * SECTOR_DEG; }
export function densityFor(radius: number): number { return radius >= DEEP_END ? 0.65 : 0.85; }
export function nebulaSaturation(radius: number): number { return Math.round(18 + 26 * radius); }

/** Give every region its bearing, hue and density from its sector and radius — the single source of truth. */
export function placeRegions<T extends Region>(regions: T[]): T[] {
  for (const r of regions) {
    r.bearing = sectorBearing(r.sector);
    r.family = r.sector;
    r.hue = sectorHue(r.sector);
    r.density = densityFor(r.radius);
  }
  return regions;
}

/** Cell-lattice position of a region on a world of `cols`×`rows` cells with the wheel inscribed. */
export function cellOf(r: Region, cols: number, rows: number): [number, number] {
  const hubC = cols / 2; const hubR = rows / 2; const rim = (Math.min(cols, rows) - 3) / 2;
  const a = sectorBearing(r.sector) * Math.PI / 180;
  return [hubC + r.radius * rim * Math.cos(a), hubR - r.radius * rim * Math.sin(a)];
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
