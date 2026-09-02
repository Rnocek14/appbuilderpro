// worldPlacement.ts — pure placement of real items onto the wheel (docs/dot-field-map.md §5).
//
// A world edition is a list of items that each carry a region key, a sector and a radius. This module
// puts every item into exactly one cell of the lattice, deterministically: items are visited in a
// fixed order (a hash of their id, so input order is irrelevant), each starts at its target cell and
// spirals outward to the nearest free cell that is inside the rim and whose argmax region is the
// item's own — so the label never says "in chess" over golf dots. Nothing here depends on the user or
// on the wall clock. Given the same items, regions and geometry the output is byte-identical
// ("stable by construction"); given a persisted layout, previously placed items keep their cells and
// only new items take free cells ("stable by persistence" — say which one you mean).
//
// The prototype (prototypes/the-drift.html) carries the same geometry formulas for its staged worlds;
// worldPlacement.verify.ts checks the two agree by reading the prototype's text.

export interface Geometry { cols: number; rows: number }
export interface Wheel extends Geometry { hubC: number; hubR: number; rim: number }
export interface WheelRegion { key: string; sector: number; radius: number }
export interface PlacedRegion extends WheelRegion { bearing: number; cc: number; cr: number; spread: number }
export interface Item { id: string; region: string; sector: number; radius: number }
export interface Placement { c: number; r: number; id: string; region: string }
export interface Layout { cells: Placement[]; unplaced: string[]; hash: string }

export const SECTOR_DEG = 45;
export const WEIGHT_FLOOR = 0.015;      // no cell is ever voiceless — mirrors the prototype's currentWeights
export const SPREAD_BASE = 3.6;         // cells; a region's Gaussian spread is SPREAD_BASE + SPREAD_PER_RADIUS·radius
export const SPREAD_PER_RADIUS = 2.6;
export const MAX_SPIRAL = 14;           // cells; an item that finds no legal cell within this ring is reported unplaced
export const SCATTER_DEG = 14;          // an item's bearing is its sector's ± this, by a stable hash of its id

export function wheelOf(geo: Geometry): Wheel {
  return { ...geo, hubC: geo.cols / 2, hubR: geo.rows / 2, rim: (Math.min(geo.cols, geo.rows) - 3) / 2 };
}

/** FNV-1a, 32-bit, as 8 hex chars — the stable tiebreak and the layout hash. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

function assertFinite(what: string, sector: number, radius: number): void {
  if (!Number.isInteger(sector) || !Number.isFinite(radius)) throw new Error(`${what}: sector and radius must be finite numbers (got ${sector}, ${radius})`);
}

export function layoutRegions(regions: WheelRegion[], geo: Geometry): PlacedRegion[] {
  const w = wheelOf(geo);
  const keys = new Set<string>();
  for (const R of regions) {
    assertFinite(`region ${R.key}`, R.sector, R.radius);
    if (keys.has(R.key)) throw new Error(`duplicate region key "${R.key}"`);
    keys.add(R.key);
  }
  return regions.map((R) => {
    const bearing = R.sector * SECTOR_DEG; const a = bearing * Math.PI / 180;
    return { ...R, bearing, cc: w.hubC + R.radius * w.rim * Math.cos(a), cr: w.hubR - R.radius * w.rim * Math.sin(a), spread: SPREAD_BASE + SPREAD_PER_RADIUS * R.radius };
  });
}

export function cellDepth(c: number, r: number, geo: Geometry): number {
  const w = wheelOf(geo);
  return Math.hypot(c + 0.5 - w.hubC, r + 0.5 - w.hubR) / w.rim;
}

export function weightsAt(c: number, r: number, regions: PlacedRegion[]): number[] {
  return regions.map((R) => { const dx = c + 0.5 - R.cc; const dy = r + 0.5 - R.cr; return Math.exp(-(dx * dx + dy * dy) / (2 * R.spread * R.spread)) + WEIGHT_FLOOR; });
}

export function argmaxAt(c: number, r: number, regions: PlacedRegion[]): { index: number; share: number } {
  const w = weightsAt(c, r, regions);
  let best = 0; let total = 0;
  for (let i = 0; i < w.length; i++) { total += w[i]; if (w[i] > w[best]) best = i; }
  return { index: best, share: w[best] / total };
}

/** The item's own bearing: its sector's, scattered by a stable hash of its id — never by rank or recency. */
export function itemBearing(item: Item): number {
  const h = parseInt(fnv1a(item.id).slice(0, 4), 16) / 0xffff;      // 0..1
  return item.sector * SECTOR_DEG + (h * 2 - 1) * SCATTER_DEG;
}

export function targetCell(item: Item, geo: Geometry): [number, number] {
  const w = wheelOf(geo); const a = itemBearing(item) * Math.PI / 180;
  return [Math.floor(w.hubC + item.radius * w.rim * Math.cos(a)), Math.floor(w.hubR - item.radius * w.rim * Math.sin(a))];
}

/** Offsets at Chebyshev distance d, in a fixed order — the spiral is deterministic. */
export function ring(d: number): [number, number][] {
  if (d === 0) return [[0, 0]];
  const out: [number, number][] = [];
  for (let dc = -d; dc <= d; dc++) for (let dr = -d; dr <= d; dr++) if (Math.max(Math.abs(dc), Math.abs(dr)) === d) out.push([dc, dr]);
  return out.sort((A, B) => A[0] - B[0] || A[1] - B[1]);
}

export function placeItems(items: Item[], regions: WheelRegion[], geo: Geometry, persisted?: Map<string, [number, number]>): Layout {
  const placedR = layoutRegions(regions, geo);
  const keyIndex = new Map(placedR.map((R, i) => [R.key, i]));
  const ids = new Set<string>();
  for (const it of items) {
    if (!keyIndex.has(it.region)) throw new Error(`item ${it.id}: unknown region "${it.region}"`);
    assertFinite(`item ${it.id}`, it.sector, it.radius);
    if (ids.has(it.id)) throw new Error(`duplicate item id "${it.id}"`);
    ids.add(it.id);
  }
  // one visiting order for everything — a hash of the id, then the id — so input order never matters,
  // including which of two items claiming the same persisted cell wins
  const order = (A: Item, B: Item) => (fnv1a(A.id) < fnv1a(B.id) ? -1 : fnv1a(A.id) > fnv1a(B.id) ? 1 : A.id < B.id ? -1 : A.id > B.id ? 1 : 0);
  const sorted = [...items].sort(order);
  const occupied = new Set<string>();
  const cells: Placement[] = [];
  const unplaced: string[] = [];
  const argmaxCache = new Map<string, number>();
  const argmaxOf = (c: number, r: number) => {
    const k = c + ',' + r; let v = argmaxCache.get(k);
    if (v === undefined) { v = argmaxAt(c, r, placedR).index; argmaxCache.set(k, v); }
    return v;
  };
  // persisted items first: they keep their cells, whatever the rule would say today ("stable by persistence")
  const remaining: Item[] = [];
  for (const it of sorted) {
    const keep = persisted?.get(it.id);
    if (keep && Number.isInteger(keep[0]) && Number.isInteger(keep[1]) && keep[0] >= 0 && keep[1] >= 0 && keep[0] < geo.cols && keep[1] < geo.rows && !occupied.has(keep[0] + ',' + keep[1])) {
      occupied.add(keep[0] + ',' + keep[1]); cells.push({ c: keep[0], r: keep[1], id: it.id, region: it.region });
    } else remaining.push(it);
  }
  // then the rest, in the same order
  for (const it of remaining) {
    const [tc, tr] = targetCell(it, geo);
    const want = keyIndex.get(it.region)!;
    let done = false;
    for (let d = 0; d <= MAX_SPIRAL && !done; d++) {
      for (const [dc, dr] of ring(d)) {
        const c = tc + dc; const r = tr + dr;
        if (c < 0 || r < 0 || c >= geo.cols || r >= geo.rows) continue;
        if (cellDepth(c, r, geo) > 1) continue;
        if (occupied.has(c + ',' + r)) continue;
        if (argmaxOf(c, r) !== want) continue;
        occupied.add(c + ',' + r); cells.push({ c, r, id: it.id, region: it.region }); done = true; break;
      }
    }
    if (!done) unplaced.push(it.id);
  }
  cells.sort((A, B) => A.c - B.c || A.r - B.r);
  return { cells, unplaced, hash: layoutHash(cells) };
}

export function layoutHash(cells: Placement[]): string {
  return fnv1a([...cells].sort((A, B) => A.c - B.c || A.r - B.r).map((p) => `${p.c},${p.r},${p.id}`).join('\n'));
}

export function persistedFrom(layout: Layout): Map<string, [number, number]> {
  return new Map(layout.cells.map((p) => [p.id, [p.c, p.r] as [number, number]]));
}
