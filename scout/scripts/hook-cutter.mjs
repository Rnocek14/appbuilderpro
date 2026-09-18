// scout/scripts/hook-cutter.mjs — the world-#2 de-risk spike.
//
//   node scripts/hook-cutter.mjs [rssUrl] [numHooks] [outDir]
//
// Proves the podcast Audio Drift ingestion claim end-to-end with zero gated APIs:
// RSS enclosure (open by design) → partial download → energy-peak analysis → 1.5s hook
// clips, exactly the Podz-shaped pipeline, self-served. This is a SPIKE: naive XML
// parsing, first-episode-only, loudness-variance peak picking. The production cutter
// would add speech/music discrimination and chapter-aware offsets; the point here is
// that nothing in the path requires anyone's permission.
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const ffmpeg = createRequire(import.meta.url)('ffmpeg-static');
const RSS = process.argv[2] || 'https://feeds.npr.org/510289/podcast.xml';
const N_HOOKS = Number(process.argv[3] || 5);
const OUT = process.argv[4] || join(process.cwd(), 'hooks-out');
const FETCH_BYTES = 4_000_000;           // ~4MB ≈ first few minutes of a 128kbps mp3
const SR = 22050, WIN_MS = 100, HOOK_S = 1.5, MIN_GAP_S = 8;
const SKIP_HEAD_S = 20;                  // clear pre-roll/ads before hunting hooks

const xml = await (await fetch(RSS)).text();
const title = (xml.match(/<title>(?:<!\[CDATA\[)?([^<\]]+)/) || [])[1] || 'unknown';
const epTitle = (xml.split('<item>')[1]?.match(/<title>(?:<!\[CDATA\[)?([^<\]]+)/) || [])[1] || 'episode';
const enclosure = (xml.match(/<enclosure[^>]*url="([^"]+)"/) || [])[1];
if (!enclosure) throw new Error('no enclosure url found in feed');
console.log(`feed: ${title}\nepisode: ${epTitle}\naudio: ${enclosure.slice(0, 90)}…`);

const res = await fetch(enclosure, { headers: { Range: `bytes=0-${FETCH_BYTES - 1}` } });
const audio = Buffer.from(await res.arrayBuffer());
mkdirSync(OUT, { recursive: true });
const src = join(OUT, 'episode-head.mp3');
writeFileSync(src, audio);
console.log(`downloaded ${(audio.length / 1e6).toFixed(1)}MB (HTTP ${res.status})`);

// decode to mono PCM and score 100ms windows: loudness × short-term variance
// (speech with energy and movement — a crude but honest "something is happening here")
const pcm = execFileSync(ffmpeg, ['-v', 'error', '-i', src, '-ac', '1', '-ar', String(SR),
  '-f', 's16le', '-'], { maxBuffer: 1 << 28 });
const samplesPerWin = SR * WIN_MS / 1000;
const nWin = Math.floor(pcm.length / 2 / samplesPerWin);
const rms = new Float64Array(nWin);
for (let w = 0; w < nWin; w++) {
  let acc = 0;
  for (let i = 0; i < samplesPerWin; i++) {
    const s = pcm.readInt16LE((w * samplesPerWin + i) * 2) / 32768;
    acc += s * s;
  }
  rms[w] = Math.sqrt(acc / samplesPerWin);
}
const score = new Float64Array(nWin);
const HOOK_WINS = Math.round(HOOK_S * 1000 / WIN_MS);
for (let w = 0; w < nWin - HOOK_WINS; w++) {
  let mean = 0, varr = 0;
  for (let i = 0; i < HOOK_WINS; i++) mean += rms[w + i];
  mean /= HOOK_WINS;
  for (let i = 0; i < HOOK_WINS; i++) varr += (rms[w + i] - mean) ** 2;
  score[w] = mean * Math.sqrt(varr / HOOK_WINS);
}

const firstWin = SKIP_HEAD_S * 1000 / WIN_MS;
const picked = [];
const order = [...score.keys()].filter(w => w >= firstWin).sort((a, b) => score[b] - score[a]);
for (const w of order) {
  if (picked.length >= N_HOOKS) break;
  const t = w * WIN_MS / 1000;
  if (picked.every(p => Math.abs(p - t) >= MIN_GAP_S)) picked.push(t);
}
picked.sort((a, b) => a - b);

const hooks = picked.map((t, i) => {
  const out = join(OUT, `hook-${i + 1}-${t.toFixed(1)}s.mp3`);
  spawnSync(ffmpeg, ['-v', 'error', '-y', '-ss', t.toFixed(2), '-i', src, '-t', String(HOOK_S),
    '-af', 'afade=t=in:d=0.06,afade=t=out:st=1.42:d=0.08', out]);
  return { at: +t.toFixed(1), file: out };
});
console.log(JSON.stringify({ feed: title, episode: epTitle, analyzedSec: +(nWin * WIN_MS / 1000).toFixed(0), hooks }, null, 2));
