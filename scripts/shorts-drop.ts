// shorts-drop.ts — the daily drop: fetch real YouTube Shorts per region, place them on the wheel, write one
// frozen edition JSON with a layout hash. Impure shell around the pure cores in src/lib/shortsWorld.ts and
// src/lib/worldPlacement.ts (docs/dot-field-shorts.md).
//
//   YOUTUBE_API_KEY=… npx tsx scripts/shorts-drop.ts [--date 2026-09-02] [--out prototypes/worlds/shorts.json] [--per 24]
//   npx tsx scripts/shorts-drop.ts --fixture          # no key, no network: a synthetic drop, labelled as one
//
// Quota (YouTube Data API v3, 10,000 units/day free): search.list costs 100 units, videos.list 1 per call.
// The sports spec runs ~26 searches ≈ 2,600 units + a handful of lookups — well inside one day's quota.
// Terms: the app shows YouTube's own player on open, never a copy, and shows the channel name. Whether a
// third-party browse layer over Shorts is acceptable under the API Services Terms for a commercial ship is a
// counsel question, not a build question — see docs/dot-field-shorts.md.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildEdition, fixtureVideos, parseIsoDuration, SPORTS_SHORTS, type RawVideo } from '../src/lib/shortsWorld';

const argv = process.argv.slice(2);
const opt = (name: string, dflt: string) => { const i = argv.indexOf('--' + name); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; };
const date = opt('date', new Date().toISOString().slice(0, 10));
const out = opt('out', 'prototypes/worlds/shorts.json');
const per = Number(opt('per', '24'));
const forceFixture = argv.includes('--fixture');
const key = process.env.YOUTUBE_API_KEY;
const spec = SPORTS_SHORTS;

let units = 0;
async function yt(path: string, params: Record<string, string>): Promise<any> {
  const u = new URL('https://www.googleapis.com/youtube/v3/' + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('key', key!);
  const res = await fetch(u);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const hint = res.status === 403 ? ' (403: the key is invalid, the YouTube Data API is not enabled on its project, or today\'s quota is spent)' : '';
    throw new Error(`YouTube API ${path} → HTTP ${res.status}${hint}\n${body.slice(0, 400)}`);
  }
  return res.json();
}

async function searchIds(q: string, publishedAfter: string, max: number): Promise<string[]> {
  units += 100;
  const j = await yt('search', { part: 'id', type: 'video', videoDuration: 'short', videoEmbeddable: 'true', order: 'viewCount',
    safeSearch: 'moderate', relevanceLanguage: 'en', publishedAfter, maxResults: String(Math.min(50, max)), q });
  return (j.items || []).map((it: any) => it.id?.videoId).filter(Boolean);
}

async function details(ids: string[]): Promise<Map<string, any>> {
  const m = new Map<string, any>();
  for (let i = 0; i < ids.length; i += 50) {
    units += 1;
    const j = await yt('videos', { part: 'snippet,contentDetails,statistics,status', id: ids.slice(i, i + 50).join(','), maxResults: '50' });
    for (const v of j.items || []) m.set(v.id, v);
  }
  return m;
}

async function fetchDrop(): Promise<RawVideo[]> {
  const since = new Date(Date.parse(date + 'T00:00:00Z') - 7 * 86400000).toISOString();
  const wanted = new Map<string, string>();                 // id → region (first query wins, deterministic by spec order)
  for (const R of spec.regions) for (const q of R.queries) {
    const ids = await searchIds(q, since, per);
    for (const id of ids) if (!wanted.has(id)) wanted.set(id, R.key);
    process.stderr.write(`  ${R.key.padEnd(16)} "${q}" → ${ids.length}\n`);
  }
  const det = await details([...wanted.keys()]);
  const raw: RawVideo[] = [];
  for (const [id, region] of wanted) {
    const v = det.get(id); if (!v) continue;
    const th = v.snippet?.thumbnails || {};
    raw.push({
      id, title: v.snippet?.title || '', description: v.snippet?.description || '', channel: v.snippet?.channelTitle || '',
      channelId: v.snippet?.channelId || '', publishedAt: v.snippet?.publishedAt || '', seconds: parseIsoDuration(v.contentDetails?.duration || ''),
      views: Number(v.statistics?.viewCount || 0), likes: Number(v.statistics?.likeCount || 0),
      thumb: (th.high || th.medium || th.default)?.url || null, embeddable: v.status?.embeddable !== false, region,
    });
  }
  return raw;
}

const source: 'youtube' | 'fixture' = key && !forceFixture ? 'youtube' : 'fixture';
if (source === 'fixture') process.stderr.write(forceFixture ? 'fixture requested — synthetic drop\n' : 'YOUTUBE_API_KEY not set — writing a fixture drop (labelled as one)\n');
const videos = source === 'youtube' ? await fetchDrop() : fixtureVideos(spec, date);
const edition = buildEdition(videos, spec, date, source, per);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(edition, null, 1) + '\n');

const rows = edition.regions.map((R) => `  ${R.key.padEnd(16)} ${String(edition.counts.perRegion[R.key] || 0).padStart(3)}`).join('\n');
process.stderr.write(`\n${edition.name} · ${edition.date} · ${edition.source} · rubric ${edition.rubric}\n${rows}\n` +
  `  fetched ${edition.counts.fetched} · shorts ${edition.counts.shorts} · placed ${edition.counts.placed} · unplaced ${edition.unplaced.length}` +
  ` · layout ${edition.layoutHash}${source === 'youtube' ? ` · quota ≈ ${units} units` : ''}\n→ ${out}\n`);
