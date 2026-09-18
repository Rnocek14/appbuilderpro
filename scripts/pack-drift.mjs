// pack-drift.mjs — assemble the deployable drift: one folder a static host can serve as-is.
//
//   npm run pack:drift             # → dist-drift/ (index.html = the drift, seed.html, worlds/*.json)
//
// Any plain static host works (Cloudflare Pages, Netlify, Vercel, an S3 bucket): the page needs nothing
// but files, and the thumbnails and player come from YouTube directly. Keep the deployment PRIVATE until
// the provisional is filed — put it behind an access layer (Cloudflare Access is free for a handful of
// emails), never on an unguessable-but-public URL. The GitHub workflow .github/workflows/drift-deploy.yml
// runs this after the daily drop and deploys the result.
import { cpSync, mkdirSync, rmSync, existsSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const src = join(root, 'prototypes');
const out = join(root, 'dist-drift');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'worlds'), { recursive: true });
cpSync(join(src, 'the-drift.html'), join(out, 'index.html'));
cpSync(join(src, 'the-seed.html'), join(out, 'seed.html'));
let worlds = 0;
if (existsSync(join(src, 'worlds'))) for (const f of readdirSync(join(src, 'worlds')).filter((f) => f.endsWith('.json'))) { cpSync(join(src, 'worlds', f), join(out, 'worlds', f)); worlds++; }
// a fresh drop must never be served stale by an edge cache
writeFileSync(join(out, '_headers'), '/worlds/*\n  Cache-Control: no-store\n/index.html\n  Cache-Control: no-cache\n');
// the honest footer of the deployed build names the edition it carries
let edition = 'staged worlds only';
try { const E = JSON.parse(readFileSync(join(out, 'worlds', 'shorts.json'), 'utf8')); edition = `${E.name} · ${E.source} · ${E.date} · ${E.items.length} items · ${E.layoutHash}`; } catch {}
console.log(`dist-drift/ ready: index.html, seed.html, ${worlds} world file(s) · ${edition}`);
