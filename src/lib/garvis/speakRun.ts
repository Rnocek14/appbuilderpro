// src/lib/garvis/speakRun.ts
// The dock's VOICE, impure half: ElevenLabs through the `speak` edge seam, with the browser's
// speechSynthesis as the honest fallback (no key / offline / error → the concierge still talks,
// it just sounds like a browser). Repeated lines ("Anytime.", the canned tier responses) are
// cached in-memory for the session so small talk never re-bills.

import { supabase } from '../supabase';
import { chunkForSpeech, staleAfter } from './speech';

const cache = new Map<string, string>();   // sentence-chunk → base64 mp3 (session-scoped)
const CACHE_CAP = 60;
let current: HTMLAudioElement | null = null;
let unavailable = false;                   // sticky once the seam says no key — stop asking
// SW8.4 — the generation token: bumped by every new turn and every barge-in; any in-flight
// fetch or queued chunk carrying an older token unwinds silently (a stale fetch never plays
// over a new turn — the speech.ts contract, exercised here).
let generation = 0;

/** One chunk's audio, from the session cache or the metered seam. Null = the seam can't. */
async function fetchAudio(line: string): Promise<string | null> {
  if (!line || unavailable) return null;
  const hit = cache.get(line);
  if (hit) return hit;
  try {
    const { data, error } = await supabase.functions.invoke('speak', { body: { text: line } });
    if (error || !data) return null;
    const d = data as { available?: boolean; ok?: boolean; audio?: string };
    if (d.available === false) { unavailable = true; return null; }   // no key — stop re-asking this session
    if (!d.ok || !d.audio) return null;
    if (cache.size >= CACHE_CAP) cache.delete(cache.keys().next().value!);
    cache.set(line, d.audio);
    return d.audio;
  } catch { return null; }
}

/** Play one chunk to its end (or to a barge-in — pause resolves the wait, the queue unwinds). */
function playAndWait(audio: string, gen: number): Promise<void> {
  return new Promise((resolve) => {
    if (staleAfter(gen, generation)) return resolve();
    try {
      current?.pause();
      const el = new Audio(`data:audio/mpeg;base64,${audio}`);
      current = el;
      el.onended = () => resolve();
      el.onerror = () => resolve();
      el.onpause = () => resolve();
      // Autoplay policies can reject play() — the reply text is on screen either way.
      void el.play().catch(() => resolve());
    } catch { resolve(); }
  });
}

/** SPEAK-WHILE-THINKING (SW8.4): sentence 1 starts the moment its audio lands; the rest
 *  PREFETCH immediately (per-sentence cache keys) and play in order, so the gaps are playback,
 *  not network. Resolves true once real audio started (or a newer turn took the voice); false
 *  means the seam is unusable and the caller should fall back to the browser voice. */
export async function speakChunked(text: string): Promise<boolean> {
  const gen = ++generation;               // a new turn cancels everything pending
  const chunks = chunkForSpeech(text);
  if (!chunks.length || unavailable) return false;
  const fetches = chunks.map((c) => fetchAudio(c));
  const first = await fetches[0];
  if (staleAfter(gen, generation)) return true;   // a newer turn owns the voice — not a seam failure
  if (!first) return false;
  await playAndWait(first, gen);
  for (let i = 1; i < chunks.length; i++) {
    if (staleAfter(gen, generation)) return true;
    const audio = await fetches[i];
    if (staleAfter(gen, generation)) return true;
    if (!audio) continue;                 // a missing middle chunk skips — the text is on screen
    await playAndWait(audio, gen);
  }
  return true;
}

/** BARGE-IN: the operator's first keystroke or mic press takes the floor — the current chunk
 *  stops NOW and every queued/in-flight one is canceled by the generation bump. */
export function bargeIn(): void {
  generation++;
  stopSpeaking();
}

/** Speak one short line (small talk, canned tiers) — same seam, same cache, same contract. */
export async function speakEleven(text: string): Promise<boolean> {
  const line = text.trim().slice(0, 300);
  const gen = ++generation;
  const audio = await fetchAudio(line);
  if (staleAfter(gen, generation)) return true;
  if (!audio) return false;
  void playAndWait(audio, gen);
  return true;
}

/** Cut the current line off (voice toggled off, a new line starting). */
export function stopSpeaking(): void {
  try { current?.pause(); } catch { /* fine */ }
  current = null;
}
