// serve-drift.mjs — the two-minute fix for "it feels like a link": serve prototypes/ over plain http on your
// own network so a phone on the same Wi-Fi gets the full drift — real thumbnails, YouTube's player on open,
// the muted dwell preview — none of which the artifact host allows. Prints the URLs to open.
//
//   npm run serve:drift            # then open the printed http://<your-ip>:4173/the-drift.html on the phone
//
// Static files only, no directory listing, no caching (so a fresh drop shows up on reload). Local network
// only by intent: nothing here is public, which matters until the provisional is filed.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'prototypes');
const PORT = Number(process.env.PORT || 4173);
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const rel = normalize(path === '/' ? '/the-drift.html' : path).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  try {
    const st = await stat(file);
    if (!st.isFile()) throw new Error('not a file');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('not found'); }
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`the drift, served locally (no caching, LAN only)\n  this machine   http://localhost:${PORT}/the-drift.html`);
  for (const ip of ips) console.log(`  same Wi-Fi     http://${ip}:${PORT}/the-drift.html`);
  console.log('  seed           …/the-seed.html · worlds/index.json lists the editions the drift will load');
});
