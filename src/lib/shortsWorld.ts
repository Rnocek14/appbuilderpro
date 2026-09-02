// shortsWorld.ts — the pure core of a real world built from YouTube Shorts (docs/dot-field-shorts.md).
//
// A world spec names eight sectors, the regions inside them (each with a radius, an optional register
// tag and the search queries that feed it) and the depth words. Videos fetched by scripts/shorts-drop.ts
// (or generated as a fixture) are filtered to short-form, given a radius inside their region by a
// keyword rubric (v0 — an honest placeholder for the classifier of docs/dot-field-map.md §8), placed
// on the wheel by worldPlacement, and written as one frozen edition JSON with a layout hash. Nothing
// here fetches, reads the clock, or looks at a user.
//
// You control THIS app's algorithm, not YouTube's: the drop is the day's selection, the placement is a
// lookup, and steering changes the glow and the fill. The player on open is YouTube's own.

import { placeItems, type Item, type Layout, type WheelRegion } from './worldPlacement';

export const RUBRIC_VERSION = 'v0-keyword';
export const SHORTS_MAX_SECONDS = 180;          // Shorts may run to three minutes since late 2024 (SOURCED: YouTube)
export const SHORTS_SURE_SECONDS = 60;          // at or under a minute, short-form without asking
export const MAX_RADIUS_ADJUST = 0.10;          // the rubric moves an item at most this far from its region's radius
export const RADIUS_MIN = 0.18; export const RADIUS_MAX = 0.97;
export const GEOMETRY = { cols: 47, rows: 47 };

export type Register = 'serious' | 'goofy';
export interface RegionSpec { key: string; sector: number; radius: number; tag?: Register; queries: string[] }
export interface WorldSpec { name: string; depth: [string, string]; sectors: string[]; regions: RegionSpec[]; rubric: { deeper: string[]; shallower: string[] } }
export interface RawVideo {
  id: string; title: string; description: string; channel: string; channelId: string; publishedAt: string;
  seconds: number; views: number; likes: number; thumb: string | null; embeddable: boolean; region: string;
}
export interface EditionItem {
  id: string; title: string; channel: string; channelId: string; publishedAt: string; seconds: number; views: number;
  thumb: string | null; embedId: string | null; region: string; sector: number; radius: number;
}
export interface Edition {
  name: string; edition: number; rubric: string; source: 'youtube' | 'fixture'; date: string;
  depth: [string, string]; sectors: string[]; regions: { key: string; sector: number; radius: number; tag?: Register }[];
  items: EditionItem[]; cells: Layout['cells']; unplaced: string[]; layoutHash: string;
  counts: { fetched: number; shorts: number; placed: number; perRegion: Record<string, number> };
}

/** ISO 8601 duration (PT1M23S) → seconds. Anything unparseable is 0, which the short filter rejects. */
export function parseIsoDuration(iso: string): number {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return 0;
  return (+(m[1] || 0)) * 86400 + (+(m[2] || 0)) * 3600 + (+(m[3] || 0)) * 60 + (+(m[4] || 0));
}

/** Short-form, by the only signals the API gives: length, and the #shorts marker (ESTIMATE heuristic). */
export function isShortCandidate(v: { seconds: number; title: string; description: string }): boolean {
  if (!(v.seconds > 0) || v.seconds > SHORTS_MAX_SECONDS) return false;
  return v.seconds <= SHORTS_SURE_SECONDS || /#shorts?\b/i.test(v.title + ' ' + v.description);
}

/** Rubric v0: ± per keyword hit, clamped. A placeholder with a name, not a classifier. */
export function radiusAdjust(v: { title: string; description: string }, rubric: WorldSpec['rubric']): number {
  const text = (v.title + ' ' + v.description).toLowerCase();
  const hits = (words: string[]) => words.reduce((n, w) => n + (text.includes(w.toLowerCase()) ? 1 : 0), 0);
  const raw = 0.025 * (hits(rubric.deeper) - hits(rubric.shallower));
  return Math.max(-MAX_RADIUS_ADJUST, Math.min(MAX_RADIUS_ADJUST, raw));
}

export function itemsFrom(videos: RawVideo[], spec: WorldSpec, source: Edition['source']): EditionItem[] {
  const byKey = new Map(spec.regions.map((R) => [R.key, R]));
  const seen = new Set<string>();
  const out: EditionItem[] = [];
  for (const v of videos) {
    const R = byKey.get(v.region);
    if (!R || seen.has(v.id) || !v.embeddable || !isShortCandidate(v)) continue;
    seen.add(v.id);
    const radius = Math.max(RADIUS_MIN, Math.min(RADIUS_MAX, R.radius + radiusAdjust(v, spec.rubric)));
    out.push({ id: v.id, title: v.title, channel: v.channel, channelId: v.channelId, publishedAt: v.publishedAt, seconds: v.seconds,
      views: v.views, thumb: v.thumb, embedId: source === 'youtube' ? v.id : null, region: R.key, sector: R.sector, radius: +radius.toFixed(3) });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function buildEdition(videos: RawVideo[], spec: WorldSpec, date: string, source: Edition['source'], perRegionCap = 24): Edition {
  const all = itemsFrom(videos, spec, source);
  // cap per region in id order — deterministic, never by rank
  const perRegion: Record<string, number> = {}; const items: EditionItem[] = [];
  for (const it of all) { perRegion[it.region] = (perRegion[it.region] || 0); if (perRegion[it.region] < perRegionCap) { perRegion[it.region]++; items.push(it); } }
  const regions: WheelRegion[] = spec.regions.map((R) => ({ key: R.key, sector: R.sector, radius: R.radius }));
  const layout = placeItems(items.map((it): Item => ({ id: it.id, region: it.region, sector: it.sector, radius: it.radius })), regions, GEOMETRY);
  return {
    name: spec.name, edition: 0, rubric: RUBRIC_VERSION, source, date, depth: spec.depth, sectors: spec.sectors,
    regions: spec.regions.map((R) => ({ key: R.key, sector: R.sector, radius: R.radius, ...(R.tag ? { tag: R.tag } : {}) })),
    items, cells: layout.cells, unplaced: layout.unplaced, layoutHash: layout.hash,
    counts: { fetched: videos.length, shorts: all.length, placed: layout.cells.length, perRegion },
  };
}

/* ---- the first real world: sports shorts on the wheel (edition 0; coordinates ESTIMATE, argued by nobody yet) ---- */
export const SPORTS_SHORTS: WorldSpec = {
  name: 'shorts',
  depth: ['casual', 'extreme'],
  sectors: ['ball', 'court', 'combat', 'motor', 'air & mountain', 'wheels', 'mind & pub', 'club & field'],
  regions: [
    { key: 'soccer',          sector: 0, radius: 0.30, queries: ['soccer skills #shorts', 'football goals #shorts'] },
    { key: 'nfl',             sector: 0, radius: 0.60, tag: 'serious', queries: ['nfl highlights #shorts', 'american football hits #shorts'] },
    { key: 'basketball',      sector: 1, radius: 0.30, queries: ['basketball highlights #shorts'] },
    { key: 'dunks',           sector: 1, radius: 0.60, queries: ['dunk contest #shorts', 'streetball #shorts'] },
    { key: 'boxing',          sector: 2, radius: 0.50, queries: ['boxing knockout #shorts'] },
    { key: 'mma',             sector: 2, radius: 0.85, tag: 'serious', queries: ['mma finish #shorts', 'ufc #shorts'] },
    { key: 'rally',           sector: 3, radius: 0.45, queries: ['rally #shorts'] },
    { key: 'moto',            sector: 3, radius: 0.75, queries: ['motocross whip #shorts', 'supercross #shorts'] },
    { key: 'ski & snow',      sector: 4, radius: 0.55, queries: ['ski jump #shorts', 'snowboard #shorts'] },
    { key: 'base & wingsuit', sector: 4, radius: 0.95, tag: 'serious', queries: ['wingsuit #shorts', 'base jump #shorts'] },
    { key: 'skate',           sector: 5, radius: 0.45, queries: ['skateboarding #shorts'] },
    { key: 'bmx & parkour',   sector: 5, radius: 0.75, queries: ['bmx #shorts', 'parkour #shorts'] },
    { key: 'darts & pool',    sector: 6, radius: 0.25, tag: 'goofy', queries: ['darts 180 #shorts', 'pool trick shot #shorts'] },
    { key: 'chess',           sector: 6, radius: 0.60, tag: 'serious', queries: ['chess blitz #shorts'] },
    { key: 'golf',            sector: 7, radius: 0.20, queries: ['golf swing #shorts'] },
    { key: 'cricket',         sector: 7, radius: 0.50, queries: ['cricket six #shorts'] },
  ],
  rubric: {
    deeper: ['insane', 'brutal', 'knockout', 'crash', 'extreme', 'world record', 'fastest', 'biggest', 'wipeout', 'no way', 'dangerous'],
    shallower: ['tutorial', 'basics', 'beginner', 'warm up', 'drill', 'relaxing', 'casual', 'how to', 'explained'],
  },
};

/** A deterministic fixture drop: obviously synthetic ids and channels, real shape. Never a player. */
export function fixtureVideos(spec: WorldSpec, date: string, perRegion = 5): RawVideo[] {
  const out: RawVideo[] = [];
  const day = Date.parse(date + 'T12:00:00Z');
  const verbs = ['Clean', 'Wild', 'Quiet', 'Late', 'First'];
  const nouns = ['line', 'finish', 'attempt', 'session', 'take'];
  spec.regions.forEach((R, ri) => {
    for (let n = 0; n < perRegion; n++) {
      const k = ri * perRegion + n;
      const seconds = 15 + ((k * 37) % 150);
      out.push({
        id: `fx-${String(ri).padStart(2, '0')}-${n}`,
        title: `${verbs[k % 5]} ${R.key} ${nouns[(k * 3) % 5]} #shorts`,
        description: 'fixture item — stands in for a real short until YOUTUBE_API_KEY is set',
        channel: `Fixture ${R.key}`, channelId: `fx-channel-${ri}`,
        publishedAt: new Date(day - ((k % 6) + 1) * 86400000 - k * 3600000).toISOString(),
        seconds, views: 1000 + ((k * 7919) % 90000), likes: 50 + ((k * 131) % 5000), thumb: null, embeddable: true, region: R.key,
      });
    }
  });
  return out;
}
