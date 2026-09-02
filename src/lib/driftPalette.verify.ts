// driftPalette.verify.ts — the colour grammar's laws, checked against the prototype's own world tables.
//   npm run verify:driftpalette
// Pure: reads prototypes/the-drift.html as text, extracts the WORLDS literal and the hue constants,
// runs the same family/collision rule, and asserts the grammar. No browser, no network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assignFamilies, contrastRatio, dotColour, hexToRgb, hslToRgb, inEmberBand, parseHsl, familyHue,
  GROUND_HEX, EMBER_HEX, HUE_FAMILIES, HUE_START, HUE_SPAN, MIN_SAME_FAMILY_DISTANCE, CONSUMER_COMPASS,
  READ_CONTRAST, UNREAD_CONTRAST, type Region } from './driftPalette';

const src = readFileSync(new URL('../../prototypes/the-drift.html', import.meta.url), 'utf8');
const lit = (name: string) => {
  const m = src.match(new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n\\});`));
  assert.ok(m, `${name} literal not found in the prototype`);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function('return ' + m![1])();
};
const constant = (name: string) => { const m = src.match(new RegExp(`\\b${name} = (\\d+(?:\\.\\d+)?)`)); assert.ok(m, name); return Number(m![1]); };

type World = { name: string; edition: number; xWords?: string[]; regions: (Region & { authors: string[]; caps: string[] })[] };
const WORLDS = lit('WORLDS') as Record<string, World>;
const AXES = lit('AXES') as { x: string[]; y: string[] };

console.log('driftPalette.verify — one meaning per channel, checked against the prototype\n');

// the prototype and the core agree on the constants
assert.equal(constant('HUE_FAMILIES'), HUE_FAMILIES, 'HUE_FAMILIES drifted between core and prototype');
assert.equal(constant('HUE_START'), HUE_START, 'HUE_START drifted');
assert.equal(constant('HUE_SPAN'), HUE_SPAN, 'HUE_SPAN drifted');
for (let f = 0; f < HUE_FAMILIES; f++) assert.ok(!inEmberBand(familyHue(f)), `family ${f} hue ${familyHue(f)} sits in the ember band`);
assert.equal(constant('READ_CONTRAST'), READ_CONTRAST, 'READ_CONTRAST drifted between core and prototype');
assert.equal(constant('UNREAD_CONTRAST'), UNREAD_CONTRAST, 'UNREAD_CONTRAST drifted');
assert.ok(/function lightnessFor\(/.test(src), 'the prototype lost its per-hue lightness solver');
assert.ok(new RegExp(`GROUND_HEX = '${GROUND_HEX}'`).test(src), 'the prototype solves against a different ground than the core');
console.log('  ok   constants agree; no family hue in the ember band 5–51; both solve lightness against ' + GROUND_HEX);

const ground = hexToRgb(GROUND_HEX);
const ember = hexToRgb(EMBER_HEX);
let worlds = 0; let regions = 0;
for (const [key, W] of Object.entries(WORLDS)) {
  worlds++;
  const R = assignFamilies(W.regions.map((r) => ({ ...r })));
  // ≤ 8 hues per world, and same-family pairs never closer than 0.5
  const hues = new Set(R.map((r) => r.hue));
  assert.ok(hues.size <= HUE_FAMILIES, `${key}: ${hues.size} hues exceed the ${HUE_FAMILIES}-family budget`);
  for (let i = 0; i < R.length; i++) for (let j = 0; j < i; j++) {
    if (R[i].family === R[j].family) {
      const d = Math.hypot(R[i].x - R[j].x, R[i].y - R[j].y);
      assert.ok(d >= MIN_SAME_FAMILY_DISTANCE, `${key}: ${R[i].key} and ${R[j].key} share a hue at distance ${d.toFixed(2)}`);
    }
  }
  for (const r of R) {
    regions++;
    assert.ok(Math.abs(r.x) <= 1 && Math.abs(r.y) <= 1, `${key}/${r.key}: coordinates outside [-1,1]`);
    assert.ok(r.key.length <= 15, `${key}/${r.key}: region key longer than 15 chars breaks the 390px label`);
    assert.ok(r.authors.length >= 2 && r.caps.length >= 3, `${key}/${r.key}: staged content incomplete`);
    assert.ok(!/rage|bait/i.test(r.key), `${key}/${r.key}: a moderation verdict dressed as geography`);
    // lightness is the read channel and nothing else: every hue lands on the same two contrasts
    // against the ground (WCAG floors 3:1 read, 4.5:1 unread), so hue never leaks into brightness
    const unread = contrastRatio(hslToRgb(...parseHsl(dotColour(r.hue!, false))), ground);
    const read = contrastRatio(hslToRgb(...parseHsl(dotColour(r.hue!, true))), ground);
    assert.ok(unread >= 4.5, `${key}/${r.key}: unread dot ${unread.toFixed(2)}:1 < 4.5:1`);
    assert.ok(read >= 3, `${key}/${r.key}: read dot ${read.toFixed(2)}:1 < 3:1`);
    assert.ok(Math.abs(unread - UNREAD_CONTRAST) < 0.06, `${key}/${r.key}: unread dot ${unread.toFixed(2)}:1 misses ${UNREAD_CONTRAST}:1 — hue is leaking into brightness`);
    assert.ok(Math.abs(read - READ_CONTRAST) < 0.06, `${key}/${r.key}: read dot ${read.toFixed(2)}:1 misses ${READ_CONTRAST}:1`);
    // no data colour may impersonate ember
    const dEmber = contrastRatio(hslToRgb(...parseHsl(dotColour(r.hue!, false))), ember);
    assert.ok(Math.abs(r.hue! - 26) >= 26 || dEmber > 1.15, `${key}/${r.key}: hue ${r.hue} too close to ember`);
  }
  // the same words in every consumer world; a world that names its own x says so with xWords
  if (!W.xWords) {
    assert.deepEqual(AXES.x, [...CONSUMER_COMPASS.x], `${key}: consumer compass x words drifted`);
    assert.deepEqual(AXES.y, [...CONSUMER_COMPASS.y], `${key}: consumer compass y words drifted`);
  } else {
    assert.equal(W.xWords.length, 2, `${key}: xWords must be a pair`);
  }
  assert.equal(W.edition, 0, `${key}: edition must stay 0 (draft) until the coordinates are argued once`);
  console.log(`  ok   ${key}: ${R.length} regions, ${hues.size} hues, edition ${W.edition}${W.xWords ? `, x = ${W.xWords.join(' ↔ ')}` : ''}`);
}
// the prototype's own placeRegions produces the same families as the core (spot-check the rule text is present)
assert.ok(/collision rule \(deterministic, index order\)/.test(src), 'the prototype lost its collision-rule comment — did the rule change?');
console.log(`\ndriftPalette.verify: ${worlds} worlds, ${regions} regions, 0 problems`);
