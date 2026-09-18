// driftPalette.verify.ts — the wheel's laws and the colour grammar, checked against the prototype's own tables.
//   npm run verify:driftpalette
// Pure: reads prototypes/the-drift.html as text, extracts the WORLDS and WHEEL literals and the constants,
// runs the same placement rule, and asserts the grammar. No browser, no network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placeRegions, contrastRatio, dotColour, hexToRgb, hslToRgb, inEmberBand, parseHsl, sectorHue,
  GROUND_HEX, HUE_FAMILIES, HUE_START, HUE_SPAN, HUB, MIN_SAME_SECTOR_RADIAL_GAP, WHEEL_WORDS,
  READ_CONTRAST, UNREAD_CONTRAST, type Region, type World } from './driftPalette';

const src = readFileSync(new URL('../../prototypes/the-drift.html', import.meta.url), 'utf8');
const lit = (name: string) => {
  const m = src.match(new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n\\});`));
  assert.ok(m, `${name} literal not found in the prototype`);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function('return ' + m![1])();
};
const constant = (name: string) => { const m = src.match(new RegExp(`\\b${name} = (\\d+(?:\\.\\d+)?)`)); assert.ok(m, name); return Number(m![1]); };

type Staged = Region & { authors: string[]; caps: string[]; x?: number; y?: number };
type StagedWorld = Omit<World, 'regions'> & { regions: Staged[] };
const WORLDS = lit('WORLDS') as Record<string, StagedWorld>;
const WHEEL = lit('WHEEL') as { home: string; lit: string[] };

console.log('driftPalette.verify — the wheel, one meaning per channel, checked against the prototype\n');

// the prototype and the core agree on the constants and the words
assert.equal(constant('HUE_FAMILIES'), HUE_FAMILIES, 'HUE_FAMILIES drifted between core and prototype');
assert.equal(constant('HUE_START'), HUE_START, 'HUE_START drifted');
assert.equal(constant('HUE_SPAN'), HUE_SPAN, 'HUE_SPAN drifted');
assert.equal(constant('HUB'), HUB, 'the hub radius drifted');
assert.ok(/const SECTOR_DEG = 360 \/ HUE_FAMILIES;/.test(src), 'the prototype no longer derives sectors from the hue families');
for (let f = 0; f < HUE_FAMILIES; f++) assert.ok(!inEmberBand(sectorHue(f)), `sector ${f} hue ${sectorHue(f)} sits in the ember band`);
assert.equal(constant('READ_CONTRAST'), READ_CONTRAST, 'READ_CONTRAST drifted between core and prototype');
assert.equal(constant('UNREAD_CONTRAST'), UNREAD_CONTRAST, 'UNREAD_CONTRAST drifted');
assert.ok(/function lightnessFor\(/.test(src), 'the prototype lost its per-hue lightness solver');
assert.ok(new RegExp(`GROUND_HEX = '${GROUND_HEX}'`).test(src), 'the prototype solves against a different ground than the core');
assert.deepEqual([WHEEL.home, ...WHEEL.lit], [WHEEL_WORDS.home, ...WHEEL_WORDS.lit], 'the ring words drifted');
assert.ok(/atHub \? W\.depth\[0\]/.test(src), 'at the hub the ring must show the world\'s own shallow word');
console.log(`  ok   constants agree; no sector hue in the ember band 5–51; ring words ${WHEEL.home.toUpperCase()} · ${WHEEL.lit[1].toUpperCase()}; ground ${GROUND_HEX}`);

const ground = hexToRgb(GROUND_HEX);
let worlds = 0; let regions = 0;
for (const [key, W] of Object.entries(WORLDS)) {
  worlds++;
  assert.equal(W.edition, 0, `${key}: edition must stay 0 (draft) until the coordinates are argued once`);
  assert.ok(Array.isArray(W.depth) && W.depth.length === 2 && W.depth[0] !== W.depth[1], `${key}: depth words must be a distinct pair`);
  assert.equal(W.sectors.length, HUE_FAMILIES, `${key}: a world has exactly ${HUE_FAMILIES} sectors (null for an empty one)`);
  for (const s of W.sectors) if (s !== null) assert.ok(typeof s === 'string' && s.length <= 15, `${key}: sector name "${s}" longer than 15 chars breaks the edge word`);
  const R = placeRegions(W.regions.map((r) => ({ ...r })));
  const hues = new Set(R.map((r) => r.hue));
  assert.ok(hues.size <= HUE_FAMILIES, `${key}: ${hues.size} hues exceed the ${HUE_FAMILIES}-family budget`);
  for (let i = 0; i < R.length; i++) for (let j = 0; j < i; j++) {
    if (R[i].sector === R[j].sector) {
      const gap = Math.abs(R[i].radius - R[j].radius);
      assert.ok(gap >= MIN_SAME_SECTOR_RADIAL_GAP, `${key}: ${R[i].key} and ${R[j].key} share a sector only ${gap.toFixed(2)} apart in depth`);
    }
  }
  for (const r of R) {
    regions++;
    assert.ok(!('x' in r) && !('y' in r), `${key}/${r.key}: a plane coordinate survived the wheel`);
    assert.ok(Number.isInteger(r.sector) && r.sector >= 0 && r.sector < HUE_FAMILIES, `${key}/${r.key}: sector out of range`);
    assert.ok(W.sectors[r.sector], `${key}/${r.key}: placed in an unnamed sector`);
    assert.ok(r.radius >= HUB + 0.05 && r.radius <= 0.98, `${key}/${r.key}: radius ${r.radius} is in the hub or beyond the rim`);
    assert.ok(r.key.length <= 15, `${key}/${r.key}: region key longer than 15 chars breaks the 390px label`);
    assert.ok(r.authors.length >= 2 && r.caps.length >= 3, `${key}/${r.key}: staged content incomplete`);
    assert.ok(!/rage|bait/i.test(r.key), `${key}/${r.key}: a moderation verdict dressed as geography`);
    assert.ok(r.tag === undefined || r.tag === 'serious' || r.tag === 'goofy', `${key}/${r.key}: register tag must be serious, goofy or absent`);
    assert.equal(r.hue, sectorHue(r.sector), `${key}/${r.key}: hue is not its sector's`);
    // lightness is the read channel and nothing else: every hue lands on the same two contrasts
    const unread = contrastRatio(hslToRgb(...parseHsl(dotColour(r.hue!, false))), ground);
    const read = contrastRatio(hslToRgb(...parseHsl(dotColour(r.hue!, true))), ground);
    assert.ok(unread >= 4.5 && read >= 3, `${key}/${r.key}: WCAG floors missed (${unread.toFixed(2)} / ${read.toFixed(2)})`);
    assert.ok(Math.abs(unread - UNREAD_CONTRAST) < 0.06, `${key}/${r.key}: unread dot ${unread.toFixed(2)}:1 misses ${UNREAD_CONTRAST}:1 — hue is leaking into brightness`);
    assert.ok(Math.abs(read - READ_CONTRAST) < 0.06, `${key}/${r.key}: read dot ${read.toFixed(2)}:1 misses ${READ_CONTRAST}:1`);
  }
  const named = W.sectors.filter(Boolean).length;
  console.log(`  ok   ${key}: ${R.length} regions in ${named} sectors, ${hues.size} hues, depth ${W.depth[0]} → ${W.depth[1]}, edition ${W.edition}`);
}
assert.ok(WORLDS.movies && WORLDS.movies.regions.length >= 12, 'the movie world is missing or thin');
assert.ok(/the rim: the viewport centre never leaves the wheel/.test(src), 'the prototype lost its rim clamp — the wall is the wheel');
console.log(`\ndriftPalette.verify: ${worlds} worlds, ${regions} regions, 0 problems`);
