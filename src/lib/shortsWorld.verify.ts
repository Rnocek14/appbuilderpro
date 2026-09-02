// shortsWorld.verify.ts — the shorts world's laws: what counts as a short, how the rubric may move an
// item, what an edition must contain, and that the fixture is honest about being one.
//   npm run verify:shortsworld
import assert from 'node:assert/strict';
import { parseIsoDuration, isShortCandidate, radiusAdjust, itemsFrom, buildEdition, fixtureVideos, SPORTS_SHORTS,
  MAX_RADIUS_ADJUST, RUBRIC_VERSION, SHORTS_MAX_SECONDS } from './shortsWorld';
import { placeItems, layoutRegions, argmaxAt } from './worldPlacement';

console.log('shortsWorld.verify — a real world, honestly labelled\n');

// durations
assert.equal(parseIsoDuration('PT1M23S'), 83); assert.equal(parseIsoDuration('PT45S'), 45); assert.equal(parseIsoDuration('PT1H'), 3600);
assert.equal(parseIsoDuration('garbage'), 0); assert.equal(parseIsoDuration('P1DT1S'), 86401);
// shorts: a minute is a short; up to three minutes with the marker; nothing longer; nothing unparsed
assert.ok(isShortCandidate({ seconds: 45, title: 'x', description: '' }));
assert.ok(isShortCandidate({ seconds: 150, title: 'wild line #shorts', description: '' }));
assert.ok(!isShortCandidate({ seconds: 150, title: 'a long clip', description: 'no marker' }));
assert.ok(!isShortCandidate({ seconds: SHORTS_MAX_SECONDS + 1, title: '#shorts', description: '' }));
assert.ok(!isShortCandidate({ seconds: 0, title: '#shorts', description: '' }));
console.log('  ok   durations parse; the short filter is length + marker, never a guess');

// the rubric is bounded and named
const R = SPORTS_SHORTS.rubric;
assert.ok(Math.abs(radiusAdjust({ title: 'insane brutal knockout crash extreme world record fastest', description: '' }, R)) <= MAX_RADIUS_ADJUST + 1e-9);
assert.ok(radiusAdjust({ title: 'beginner tutorial basics', description: '' }, R) < 0);
assert.equal(radiusAdjust({ title: 'a plain title', description: '' }, R), 0);
assert.equal(RUBRIC_VERSION, 'v0-keyword', 'rename the rubric when it stops being a keyword list');
console.log(`  ok   rubric ${RUBRIC_VERSION} moves an item at most ±${MAX_RADIUS_ADJUST} from its region`);

// the spec itself
const spec = SPORTS_SHORTS;
assert.equal(spec.sectors.length, 8);
for (const s of spec.sectors) assert.ok(s.length <= 15, `sector "${s}" too long for the edge word`);
for (const r of spec.regions) {
  assert.ok(r.key.length <= 15, `region "${r.key}" too long for the label`);
  assert.ok(r.radius >= 0.2 && r.radius <= 0.98, `${r.key}: radius outside the wheel`);
  assert.ok(spec.sectors[r.sector], `${r.key}: unnamed sector`);
  assert.ok(r.queries.length >= 1, `${r.key}: no search query feeds it`);
  assert.ok(r.tag === undefined || r.tag === 'serious' || r.tag === 'goofy');
}
for (let i = 0; i < spec.regions.length; i++) for (let j = 0; j < i; j++) if (spec.regions[i].sector === spec.regions[j].sector)
  assert.ok(Math.abs(spec.regions[i].radius - spec.regions[j].radius) >= 0.3 - 1e-9, `${spec.regions[i].key}/${spec.regions[j].key}: same sector, too close in depth`);
console.log(`  ok   spec: ${spec.regions.length} regions in 8 sectors, every one fed by a query`);

// the fixture edition: honest, deterministic, complete
const fx = fixtureVideos(spec, '2026-09-02');
const E = buildEdition(fx, spec, '2026-09-02', 'fixture');
const E2 = buildEdition(fixtureVideos(spec, '2026-09-02'), spec, '2026-09-02', 'fixture');
assert.deepEqual(E, E2, 'the fixture edition is not deterministic');
assert.equal(E.source, 'fixture');
assert.ok(E.items.every((it) => it.embedId === null), 'a fixture item must never carry a player id');
assert.ok(E.items.every((it) => it.id.startsWith('fx-')), 'fixture ids must be obviously synthetic');
assert.equal(E.unplaced.length, 0, 'the fixture drop must place every item');
assert.equal(E.cells.length, E.items.length);
assert.ok(/^[0-9a-f]{8}$/.test(E.layoutHash));
// every placed cell sits under its own region's land
const placedR = layoutRegions(E.regions, { cols: 47, rows: 47 });
for (const p of E.cells) assert.equal(placedR[argmaxAt(p.c, p.r, placedR).index].key, p.region, `${p.id} sits under another region`);
console.log(`  ok   fixture edition: ${E.items.length} items placed, hash ${E.layoutHash}, no player ids`);

// a youtube-sourced edition carries the player id, drops non-embeddable and long videos, dedupes
const yt = fixtureVideos(spec, '2026-09-02', 2).map((v, i) => ({ ...v, id: 'yt' + i, embeddable: i % 7 !== 0, seconds: i % 5 === 0 ? 400 : v.seconds }));
yt.push({ ...yt[1] });   // duplicate
const items = itemsFrom(yt, spec, 'youtube');
assert.ok(items.every((it) => it.embedId === it.id));
assert.ok(items.every((it) => it.seconds <= SHORTS_MAX_SECONDS));
assert.equal(new Set(items.map((it) => it.id)).size, items.length, 'duplicate ids survived');
assert.ok(items.length < yt.length, 'nothing was filtered');
console.log(`  ok   youtube edition: ${items.length} of ${yt.length} kept (embeddable, short, unique), each with its player id`);

// the per-region cap is by id order, never by rank
const capped = buildEdition(fixtureVideos(spec, '2026-09-02', 9), spec, '2026-09-02', 'fixture', 4);
assert.ok(Object.values(capped.counts.perRegion).every((n) => n <= 4));
// placement here and in the core agree (same function, same geometry)
const direct = placeItems(capped.items.map((it) => ({ id: it.id, region: it.region, sector: it.sector, radius: it.radius })), capped.regions, { cols: 47, rows: 47 });
assert.equal(direct.hash, capped.layoutHash);
console.log('  ok   per-region cap holds; the edition hash is the placement hash');

console.log('\nshortsWorld.verify: 0 problems');
