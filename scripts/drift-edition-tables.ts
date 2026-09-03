// drift-edition-tables.ts — prints the edition tables of every world in prototypes/the-drift.html as the
// code places them on the wheel (sector → bearing and hue, radius → density and nebula chroma, solved dot
// colours). The tables in docs/dot-field-map.md §3 are this script's output; regenerate them here, never by hand.
//   npx tsx scripts/drift-edition-tables.ts
import { readFileSync } from 'node:fs';
import { placeRegions, dotColour, nebulaSaturation, sectorHue, HUE_FAMILIES, SECTOR_DEG } from '../src/lib/driftPalette';
const src = readFileSync(new URL('../prototypes/the-drift.html', import.meta.url), 'utf8');
const lit = (name: string) => { const m = src.match(new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n\\});`)); return new Function('return ' + m![1])(); };
const WORLDS = lit('WORLDS');
for (const [, W] of Object.entries<any>(WORLDS)) {
  const R = placeRegions(W.regions.map((r: any) => ({ ...r })));
  console.log(`\n### ${W.name} — edition ${W.edition} (depth: ${W.depth[0]} → ${W.depth[1]})\n`);
  console.log('| # | region | sector | bearing | radius | hue | register | density | nebula sat |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  R.forEach((r: any, i: number) => {
    console.log(`| ${i} | ${r.key} | ${W.sectors[r.sector]} | ${r.bearing}° | ${r.radius} | ${r.hue} | ${r.tag || ''} | ${r.density} | ${nebulaSaturation(r.radius)}% |`);
  });
}
console.log('\n### sectors and their hues (every world)\n');
console.log('| sector | bearing | hue | unread dot | read dot |'); console.log('|---|---|---|---|---|');
for (let i = 0; i < HUE_FAMILIES; i++) console.log(`| ${i} | ${i * SECTOR_DEG}° | ${sectorHue(i)} | ${dotColour(sectorHue(i), false)} | ${dotColour(sectorHue(i), true)} |`);
