// src/lib/garvis/autoCut.ts
// AUTO JUMP-CUT — pure core (verified by autoCut.verify.ts). The single biggest CapCut-grade
// auto-edit: silence removal. "Remove every breath and pause" is the documented 2026 professional
// baseline; the jump cuts it produces supply most of the winning 2-4s cut cadence automatically,
// and the ugcEdit punch alternation then makes every one read as an intentional camera change.
// Thresholds encode the industry-reference defaults (TimeBolt/Descript, the best-documented pro
// proxies for CapCut's unpublished factory settings): cut silences > 0.5s, keep ~0.09s of air
// before speech and ~0.15s after, ignore blips too short to be a phrase.
// The honest spine: this core NEVER invents or discards footage on a guess — a take whose audio
// can't be analyzed, or that looks silent throughout, comes back WHOLE (one full-length segment),
// never an empty edit. Deterministic — same envelope, same cut.

import type { UgcTake } from './ugcEdit';

export interface SpeechSegment { startS: number; endS: number }

export interface AutoCutOpts {
  cutGapS?: number;      // a pause longer than this gets cut (default 0.5; UGC-ad lane runs 0.3)
  padStartS?: number;    // breathing room kept before each phrase (default 0.09)
  padEndS?: number;      // air kept after each phrase — cuts mid-word sound rushed (default 0.15)
  minSegmentS?: number;  // drop detections shorter than this — noise, not speech (default 0.3)
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A window-RMS envelope of the take's audio → the speech segments worth keeping. The threshold
 *  adapts to the take itself (quiet rooms and loud rooms both work): speech is what stands well
 *  clear of the take's own noise floor. Falls back to the WHOLE take when nothing reads as speech. */
export function detectSpeech(envelope: number[], windowS: number, durationS: number, opts: AutoCutOpts = {}): SpeechSegment[] {
  const whole: SpeechSegment[] = [{ startS: 0, endS: r2(Math.max(0, durationS)) }];
  if (!envelope.length || !(windowS > 0) || !(durationS > 0)) return whole;
  const cutGap = Math.max(0.1, opts.cutGapS ?? 0.5);
  const padStart = Math.max(0, opts.padStartS ?? 0.09);
  const padEnd = Math.max(0, opts.padEndS ?? 0.15);
  const minSeg = Math.max(0.05, opts.minSegmentS ?? 0.3);

  // Adaptive threshold: well above the take's noise floor (p10) and a slice of its peak (p95),
  // floored so digital silence never reads as speech.
  const sorted = envelope.slice().sort((a, b) => a - b);
  const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const threshold = Math.max(0.008, p(0.1) * 3, p(0.95) * 0.1);

  // Raw speech runs → merge runs whose gap is too short to cut → pad → clamp → re-merge overlaps.
  const runs: SpeechSegment[] = [];
  for (let i = 0; i < envelope.length; i++) {
    if (envelope[i] < threshold) continue;
    const startS = i * windowS;
    while (i < envelope.length && envelope[i] >= threshold) i++;
    runs.push({ startS, endS: i * windowS });
  }
  const merged: SpeechSegment[] = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && run.startS - last.endS < cutGap) last.endS = run.endS;
    else merged.push({ ...run });
  }
  const padded = merged
    .filter((s) => s.endS - s.startS >= minSeg)
    .map((s) => ({ startS: Math.max(0, s.startS - padStart), endS: Math.min(durationS, s.endS + padEnd) }));
  const out: SpeechSegment[] = [];
  for (const s of padded) {
    const last = out[out.length - 1];
    if (last && s.startS <= last.endS) last.endS = Math.max(last.endS, s.endS);
    else out.push({ ...s });
  }
  if (!out.length) return whole;
  return out.map((s) => ({ startS: r2(s.startS), endS: r2(s.endS) }));
}

/** Segments of ONE uploaded take → the sub-clip takes that feed buildUgcEdit. Every length is
 *  explicit, which makes the whole timeline computable — the door to SFX-on-cuts and timed inserts. */
export function segmentsToTakes(url: string, segments: SpeechSegment[]): UgcTake[] {
  return segments
    .filter((s) => s.endS > s.startS)
    .map((s) => ({ url, ...(s.startS > 0 ? { trimS: s.startS } : {}), lengthS: r2(s.endS - s.startS) }));
}

/** The honest one-liner for the operator: what the auto-cut actually did. */
export function cutSummary(segments: SpeechSegment[], durationS: number): string {
  const kept = segments.reduce((a, s) => a + Math.max(0, s.endS - s.startS), 0);
  const cuts = Math.max(0, segments.length - 1);
  if (cuts === 0 && kept >= durationS - 0.05) return 'no pauses worth cutting — the take runs whole';
  const pct = durationS > 0 ? Math.round(((durationS - kept) / durationS) * 100) : 0;
  return `cut ${cuts === 0 ? 'the dead air' : `${cuts} pause${cuts === 1 ? '' : 's'}`} — ${r2(durationS)}s → ${r2(kept)}s (−${pct}%)`;
}
