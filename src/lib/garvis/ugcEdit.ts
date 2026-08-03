// src/lib/garvis/ugcEdit.ts
// THE OWN-FOOTAGE EDIT — pure core (verified by ugcEdit.verify.ts). Turns REAL uploaded footage
// (talking-head takes, product demos, process clips) into the 2026 native edit grammar, encoded
// from measured practice:
//   - HARD CUTS ONLY (~95% of winning shorts' transitions); the cut between takes IS the edit.
//   - PUNCH ALTERNATION: consecutive takes alternate full frame ↔ ~115% punch-in (fit:crop), so
//     every jump cut reads as an intentional camera change; long takes get a 3-8% slow push
//     (bezier ease) — the single most effective retention device in talking-head vertical.
//   - WORD-KARAOKE CAPTIONS from the footage's OWN audio: Shotstack RichCaptionAsset with
//     src alias://aroll transcribes the A-roll and animates the active word — big bold
//     white-with-stroke, lower-middle, inside the platform safe zone.
//   - HOOK CARD on frame one (5-8 words, ≤1.5s) — after 1 second, half the scroll is gone.
//   - B-ROLL AS A LAYER over continuous A-roll audio (muted overlay track, 2-5s inserts),
//     never a cut that interrupts the voice.
//   - MUSIC UNDER SPEECH at ~0.15 volume (platforms normalize to -14 LUFS; hot mixes get squashed).
// The honesty spine: real footage is the SPINE and is never fabricated; AI elements enter only as
// clearly-provenance-stamped b-roll inserts (the hybrid lane), and phone-source quirks are fixed
// with transcode, not faked. Deterministic — same inputs, same edit JSON.

export interface UgcTake {
  url: string;          // the uploaded clip's public URL (Shotstack fetches it)
  trimS?: number;       // seconds to skip from the take's start
  lengthS?: number;     // seconds to keep; omit = the take's natural length ('auto')
}

export interface UgcBroll {
  url: string;          // image or video insert (AI diagram, product close-up…)
  kind: 'image' | 'video';
  atS: number;          // when it appears on the timeline
  lengthS: number;      // 2-5s is the native band; clamped to 1-8
}

export interface UgcEditOpts {
  hookText?: string;        // the frame-one card; clipped to 60 chars
  accent?: string;          // brand color for the active caption word + hook underline
  musicUrl?: string;        // CC0 bed; rides at duckedVolume under speech
  broll?: UgcBroll[];
  punchScale?: number;      // alternation punch (default 1.15; clamped 1.05-1.3 — past ~135% goes soft)
  captions?: boolean;       // default true
}

const clip01 = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Compile real takes + options into a Shotstack edit. Track order (top→bottom): hook card,
 *  captions, b-roll overlay, A-roll, music. Pure + deterministic. */
export function buildUgcEdit(takes: UgcTake[], opts: UgcEditOpts = {}): Record<string, unknown> {
  const punch = clip01(opts.punchScale ?? 1.15, 1.05, 1.3);
  const accent = opts.accent || '#FFD166';

  // A-ROLL: consecutive smart clips (start 'auto' sequences them; length 'auto' = natural take
  // length) with alternating punch. Every take carries a gentle slow push on top of its base
  // framing; transcode fixes phone rotation/VFR sync. The first take is aliased for captions.
  const aroll = takes.map((t, i) => {
    const base = i % 2 === 1 ? punch : 1.0;
    return {
      start: i === 0 ? 0 : 'auto', length: t.lengthS ?? 'auto',
      fit: 'crop',
      scale: [{ from: base, to: Math.round(base * 1.06 * 100) / 100, start: 0, length: t.lengthS ?? 8, interpolation: 'bezier', easing: 'easeInOut' }],
      asset: { type: 'video', src: t.url, transcode: true, volume: 1, ...(t.trimS ? { trim: t.trimS } : {}) },
      ...(i === 0 ? { alias: 'aroll' } : {}),
    };
  });

  const tracks: Record<string, unknown>[] = [];

  // HOOK CARD — frame one IS the thumbnail in a vertical feed. Top third, bold, gone by 1.5s.
  if (opts.hookText?.trim()) {
    tracks.push({
      clips: [{
        start: 0, length: 1.5, transition: { out: 'fade' },
        asset: {
          type: 'rich-text', text: opts.hookText.trim().slice(0, 60),
          font: { family: 'Montserrat ExtraBold', color: '#ffffff', size: 88, lineHeight: 1.1 },
          style: { textTransform: 'uppercase' },
          stroke: { color: '#000000', width: 3 },
          background: { color: '#000000', opacity: 0.35, padding: 28, borderRadius: 20 },
          align: { horizontal: 'center', vertical: 'top' },
          animation: { style: 'typewriter' },
          width: 900, height: 500,
        },
        offset: { y: -0.28 },
      }],
    });
  }

  // WORD-KARAOKE CAPTIONS from the A-roll's own audio — lower-middle, inside the safe zone.
  if (opts.captions !== false) {
    tracks.push({
      clips: [{
        start: 0, length: 'end',
        asset: {
          type: 'rich-caption', src: 'alias://aroll',
          font: { family: 'Montserrat ExtraBold', color: '#ffffff', size: 76, lineHeight: 1.15 },
          stroke: { color: '#000000', width: 2 },
          background: { color: '#000000', opacity: 0.5, padding: 20, borderRadius: 16 },
          active: { font: { color: accent } },
          animation: { style: 'karaoke' },
        },
        offset: { y: 0.14 },
      }],
    });
  }

  // B-ROLL — a muted visual layer OVER the continuous voice, 2-5s inserts, hard in/out.
  const broll = (opts.broll ?? [])
    .filter((b) => b.url && b.atS >= 0)
    .sort((a, b) => a.atS - b.atS)
    .map((b) => ({
      start: Math.round(b.atS * 100) / 100, length: clip01(b.lengthS, 1, 8), fit: 'crop',
      asset: b.kind === 'video'
        ? { type: 'video', src: b.url, volume: 0, transcode: true }
        : { type: 'image', src: b.url },
      ...(b.kind === 'image' ? { effect: 'zoomInSlow' } : {}),
    }));
  if (broll.length) tracks.push({ clips: broll });

  tracks.push({ clips: aroll });

  // MUSIC as an AudioAsset clip (soundtrack volume can't tween) — quiet under speech, fades out.
  if (opts.musicUrl?.trim()) {
    tracks.push({
      clips: [{ start: 0, length: 'end', asset: { type: 'audio', src: opts.musicUrl.trim(), volume: 0.15, effect: 'fadeOut' } }],
    });
  }

  return {
    timeline: { background: '#000000', tracks },
    output: { format: 'mp4', resolution: 'hd', aspectRatio: '9:16', fps: 30 },
  };
}

/** One honest line describing the edit — for the artifact record and the approval preview. */
export function describeUgcEdit(takes: UgcTake[], opts: UgcEditOpts = {}): string {
  const parts = [`${takes.length} real take${takes.length === 1 ? '' : 's'}, hard cuts, alternating punch-ins`];
  if (opts.captions !== false) parts.push('word-karaoke captions from the footage\'s own audio');
  if (opts.hookText?.trim()) parts.push('frame-one hook card');
  if (opts.broll?.length) parts.push(`${opts.broll.length} b-roll insert${opts.broll.length === 1 ? '' : 's'} over continuous voice`);
  if (opts.musicUrl?.trim()) parts.push('music bed ducked under speech');
  return parts.join(' · ');
}
