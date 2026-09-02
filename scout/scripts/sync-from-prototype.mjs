// scout/scripts/sync-from-prototype.mjs — one engine, two pages.
//
// The drift engine's single source of truth is prototypes/the-drift.html (it already carries
// the Capacitor haptics bridge, inert on plain web). This script derives scout/www/index.html
// from it so the native app never forks the interaction code. Since the seed (P15) it also
// derives scout/www/seed.html from prototypes/the-seed.html — the same Taptic bridge under a
// 32px proxy pitch — and cross-links the two HUDs so one build carries both feel tests.
// Run after any prototype change:
//
//   npm run sync:web
//
// Deliberately dumb string surgery — if a marker stops matching, it throws rather than
// shipping a silently stale or half-patched app.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const protos = join(here, '..', '..', 'prototypes');
const www = join(here, '..', 'www');
mkdirSync(www, { recursive: true });

function derive(srcName, outName, edits){
  let html = readFileSync(join(protos, srcName), 'utf8');
  for (const [from, to] of edits){
    if (!html.includes(from)) throw new Error(srcName + ': sync marker not found: ' + JSON.stringify(from.slice(0, 60)));
    html = html.replace(from, () => to);
  }
  writeFileSync(join(www, outName), html);
  console.log(`scout/www/${outName} regenerated from prototypes/${srcName} (${html.length} bytes)`);
}

// The native shell owns the status bar area; keep each page's own chrome unchanged apart from
// the HUD label and a hairline link to the other page.
derive('the-drift.html', 'index.html', [
  ['<title>P14 · The Drift</title>', '<title>Scout</title>'],
  ['<span>P14 · the drift — staged world, simulated steering</span>',
   '<span>scout v0 · staged world, simulated steering · <a href="seed.html" style="color:inherit">seed →</a></span>'],
]);
derive('the-seed.html', 'seed.html', [
  ['<title>P15 · The Seed</title>', '<title>Scout · Seed</title>'],
  ['<span>P15 · the seed — staged catalog, real timing</span>',
   '<span>scout v0 · the seed — staged catalog · <a href="index.html" style="color:inherit">← drift</a></span>'],
]);
