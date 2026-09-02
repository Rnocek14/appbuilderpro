// drift-edition-tables.ts — prints the edition tables of every world in prototypes/the-drift.html as the
// code places them (bearing family + collision rule + supply density + solved dot colours). The tables in
// docs/dot-field-map.md §3 are this script's output; regenerate them here, never by hand.
//   npx tsx scripts/drift-edition-tables.ts
import { readFileSync } from 'node:fs';
import { assignFamilies, dotColour, nebulaSaturation } from '../src/lib/driftPalette';
const src = readFileSync(new URL('../prototypes/the-drift.html', import.meta.url), 'utf8');
const lit = (name: string) => { const m = src.match(new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n\\});`)); return new Function('return ' + m![1])(); };
const WORLDS = lit('WORLDS');
for (const [key, W] of Object.entries<any>(WORLDS)) {
  const R = assignFamilies(W.regions.map((r: any) => ({ ...r })));
  const bearingFam = (r: any) => { const b = (Math.atan2(-r.y, r.x) + Math.PI * 2) % (Math.PI * 2); return Math.floor(b / (Math.PI * 2) * 8) % 8; };
  console.log(`\n### ${W.name} — edition ${W.edition}${W.xWords ? ` (x = ${W.xWords[0]} ↔ ${W.xWords[1]})` : ''}\n`);
  console.log('| # | region | x | y | family | hue | moved by collision | shares hue with | density | nebula sat |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  R.forEach((r: any, i: number) => {
    const bf = bearingFam(r); const moved = r.family !== bf ? `yes (${bf} → ${r.family})` : '';
    const shares = R.filter((o: any, j: number) => j !== i && o.family === r.family).map((o: any) => `${o.key} (${Math.hypot(o.x - r.x, o.y - r.y).toFixed(2)})`).join(', ');
    const density = (Math.abs(r.x) + Math.abs(r.y) >= 1.1) ? 0.65 : 0.85;
    console.log(`| ${i} | ${r.key} | ${r.x} | ${r.y} | ${r.family} | ${r.hue} | ${moved} | ${shares} | ${density} | ${nebulaSaturation(r.x)}% |`);
  });
}
console.log('\n### dot colours per family (solved, against #0B0E14)\n');
console.log('| family | hue | unread | read |'); console.log('|---|---|---|---|');
for (let f = 0; f < 8; f++) { const h = (52 + f * 39) % 360; console.log(`| ${f} | ${h} | ${dotColour(h, false)} | ${dotColour(h, true)} |`); }
