// Run: npx tsx src/lib/garvis/speech.verify.ts
// Pins speak-while-thinking: chunks are orderable sentences under the cap, tiny lines merge,
// endless lines wrap at spaces, the generation contract makes stale audio impossible, and the
// dock's barge-in wiring stops speech on the first keystroke or mic press.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPEAK_CHUNK_CAP, SPEAK_MAX_CHUNKS, chunkForSpeech, staleAfter } from './speech';

let passed = 0;
let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

// THE CHUNKER — sentence-shaped, capped, whole words only.
{
  const three = chunkForSpeech('The batch is staged. Two approvals wait in the Queue. Nothing sends until you say so.');
  check('three real sentences become three ordered chunks', three.length === 3 && three[0] === 'The batch is staged.');
  check('order is the text\'s own order', three[2]!.startsWith('Nothing sends'));
  check('a tiny sentence merges with its neighbor (no fetch for "Right.")',
    chunkForSpeech('Right. The batch is staged and waiting for your approval in the Queue.').length === 1);
  const endless = chunkForSpeech(`${'word '.repeat(150)}end.`);
  check('an endless sentence hard-wraps under the cap', endless.every((c) => c.length <= SPEAK_CHUNK_CAP) && endless.length > 1);
  check('…never mid-word', endless.every((c) => !c.startsWith('ord') && !/\bwor$/.test(c)));
  const many = chunkForSpeech(Array.from({ length: 12 }, (_, i) => `This is a full sentence number ${i} with enough words to stand alone.`).join(' '));
  check(`a long answer caps at ${SPEAK_MAX_CHUNKS} spoken chunks (the text is on screen)`, many.length === SPEAK_MAX_CHUNKS);
  check('empty and whitespace input chunk to nothing', chunkForSpeech('').length === 0 && chunkForSpeech('   \n ').length === 0);
  check('whitespace normalizes (newlines never leak into a chunk)', chunkForSpeech('One line.\n\nTwo   line.').every((c) => !/\n|  /.test(c)));
  check('deterministic', JSON.stringify(chunkForSpeech('A. B. C.')) === JSON.stringify(chunkForSpeech('A. B. C.')));
}

// THE GENERATION CONTRACT — the reason a stale fetch can never play over a new turn.
{
  check('a token from the current generation is live', !staleAfter(3, 3));
  check('ANY bump makes it stale', staleAfter(3, 4) && staleAfter(3, 99));
  check('stale never un-stales', staleAfter(4, 3));
}

// ---- the queue + barge-in wiring (textual contract) ----
const here = dirname(fileURLToPath(import.meta.url));
const run = readFileSync(join(here, 'speakRun.ts'), 'utf8');
const dock = readFileSync(join(here, '../../components/ConciergeDock.tsx'), 'utf8');
{
  check('every chunk fetch starts immediately (prefetch — gaps are playback, not network)',
    run.includes('chunks.map((c) => fetchAudio(c))'));
  check('every play is generation-guarded', run.includes('staleAfter(gen, generation)'));
  check('barge-in bumps the generation AND stops the current chunk',
    run.includes('export function bargeIn') && /generation\+\+;\s*\n\s*stopSpeaking\(\);/.test(run));
  check('a pause resolves the wait so the queue unwinds instead of hanging',
    run.includes('el.onpause = () => resolve()'));
  check('a newer turn owning the voice is NOT reported as seam failure (no false browser fallback)',
    run.includes('a newer turn owns the voice'));
  check('per-sentence cache keys (a repeated sentence never re-bills)',
    run.includes('cache.get(line)') && run.includes('cache.set(line,'));
  check('the dock speaks chunked', dock.includes('speakChunked(text)'));
  check('the first keystroke barges in', dock.indexOf('bargeIn();') > 0 && dock.includes('the first keystroke takes the floor'));
  check('mic activation barges in too', dock.includes('bargeIn();   // mic activation'));
  check('the browser voice fallback survives (keyless still talks)', dock.includes('if (!ok) browserSpeak(text)'));
}

console.log(`\nspeech.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} speech check(s) failed`);
