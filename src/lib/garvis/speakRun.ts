// src/lib/garvis/speakRun.ts
// The dock's VOICE, impure half: ElevenLabs through the `speak` edge seam, with the browser's
// speechSynthesis as the honest fallback (no key / offline / error → the concierge still talks,
// it just sounds like a browser). Repeated lines ("Anytime.", the canned tier responses) are
// cached in-memory for the session so small talk never re-bills.

import { supabase } from '../supabase';

const cache = new Map<string, string>();   // text → base64 mp3 (session-scoped)
const CACHE_CAP = 60;
let current: HTMLAudioElement | null = null;
let unavailable = false;                   // sticky once the seam says no key — stop asking

function playBase64(audio: string): void {
  try {
    current?.pause();
    const el = new Audio(`data:audio/mpeg;base64,${audio}`);
    current = el;
    // Autoplay policies can reject play() — the reply text is on screen either way.
    void el.play().catch(() => {});
  } catch { /* audio element unavailable — the text is on screen */ }
}

/** Speak through ElevenLabs. Resolves true when the seam produced audio (cached or fresh);
 *  false means the caller should fall back to the browser voice. Never throws. */
export async function speakEleven(text: string): Promise<boolean> {
  const line = text.trim().slice(0, 300);
  if (!line || unavailable) return false;
  const hit = cache.get(line);
  if (hit) { playBase64(hit); return true; }
  try {
    const { data, error } = await supabase.functions.invoke('speak', { body: { text: line } });
    if (error || !data) return false;
    const d = data as { available?: boolean; ok?: boolean; audio?: string };
    if (d.available === false) { unavailable = true; return false; }   // no key — stop re-asking this session
    if (!d.ok || !d.audio) return false;
    if (cache.size >= CACHE_CAP) cache.delete(cache.keys().next().value!);
    cache.set(line, d.audio);
    playBase64(d.audio);
    return true;
  } catch {
    return false;
  }
}

/** Cut the current line off (voice toggled off, a new line starting). */
export function stopSpeaking(): void {
  try { current?.pause(); } catch { /* fine */ }
  current = null;
}
