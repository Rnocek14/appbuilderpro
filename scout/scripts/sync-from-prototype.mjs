// scout/scripts/sync-from-prototype.mjs — one engine, three skins.
//
// The drift engine's single source of truth is prototypes/the-drift.html (it already carries
// the Capacitor haptics bridge, inert on plain web). This script derives scout/www/index.html
// from it so the native app never forks the interaction code. Run after any prototype change:
//
//   npm run sync:web
//
// Deliberately dumb string surgery — if a marker stops matching, it throws rather than
// shipping a silently stale or half-patched app.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..', 'prototypes', 'the-drift.html');
const out = join(here, '..', 'www', 'index.html');

let html = readFileSync(src, 'utf8');
function mustReplace(from, to){
  if (!html.includes(from)) throw new Error('sync marker not found: ' + JSON.stringify(from.slice(0, 60)));
  html = html.replace(from, to);
}

mustReplace('<title>P14 · The Drift</title>', '<title>Scout</title>');
mustReplace('P14 · the drift — staged world, simulated steering',
            'scout v0 · staged world, simulated steering');
// The native shell owns the status bar area; keep the web page's own chrome unchanged.

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log('scout/www/index.html regenerated from prototypes/the-drift.html (' + html.length + ' bytes)');
