// src/lib/garvis/crossVenture.ts
// CROSS-VENTURE TRANSFER — pure core (verified by crossVenture.verify.ts). The portfolio's one
// structural edge over a single business: a play PROVEN by world A's rows can be pointed at
// world B, where the same channel sits silent at real volume or was never run at all.
//
// The honesty contract inherits adaptive.ts's discipline wholesale (the SAME exported constants,
// never re-derived): the working side must be at MIN_SAMPLE with ACT_RESPONSES real responses —
// a transfer is an 'act'-grade claim across ventures, so it clears the 'act' bar, not the
// 'watch' bar; the silent side must ALSO be at MIN_SAMPLE (silence below sample is "too early",
// not evidence) — OR the channel is genuinely absent (zero out). Below sample on either side,
// no recommendation exists. A single-world portfolio produces nothing: there is no "other
// venture" to learn from. AT MOST ONE move ever returns — the strongest pair by response rate —
// because two transfer recommendations at once is a to-do list, not a decision.

import { MIN_SAMPLE, ACT_RESPONSES, type ChannelIn } from './adaptive';

export interface VentureIn {
  worldId: string;
  worldTitle: string;
  channels: ChannelIn[];
}

export interface TransferMove {
  channel: string;                 // the play being transferred (the channel name)
  fromWorldId: string; fromWorldTitle: string;
  toWorldId: string; toWorldTitle: string;
  text: string;                    // the proposed action, plain language
  evidence: string;                // BOTH worlds' numbers, always
  basis: 'measured';               // by construction — this engine has no heuristic mode
}

const pct = (a: number, b: number) => `${((a / b) * 100).toFixed(1)}%`;

/** Working at an honest, act-grade sample: enough volume for a rate, enough responses to act. */
function provenWorking(c: ChannelIn): boolean {
  return c.instrumented && c.out >= MIN_SAMPLE && c.responses >= ACT_RESPONSES;
}

/** Silent at real volume (instrumented, at sample, zero back) — or genuinely never run. */
function silentOrAbsent(c: ChannelIn | undefined): 'silent' | 'absent' | null {
  if (!c || (c.out === 0 && c.responses === 0)) return 'absent';
  if (c.instrumented && c.out >= MIN_SAMPLE && c.responses === 0) return 'silent';
  return null; // below sample, uninstrumented, or working — no honest transfer target
}

/**
 * The one move, or null. Deterministic: same rows, same answer. Candidates are ranked by the
 * working side's response rate; ties break by the working world's volume (a bigger sample is a
 * stronger claim), then lexically for total determinism.
 */
export function crossVentureMove(ventures: VentureIn[]): TransferMove | null {
  if (ventures.length < 2) return null;
  const candidates: (TransferMove & { rate: number; volume: number })[] = [];

  for (const from of ventures) {
    for (const ch of from.channels) {
      if (!provenWorking(ch)) continue;
      for (const to of ventures) {
        if (to.worldId === from.worldId) continue;
        const target = to.channels.find((c) => c.name === ch.name);
        const state = silentOrAbsent(target);
        if (!state) continue;
        const targetLine = state === 'absent'
          ? `${to.worldTitle} has never run it.`
          : `${to.worldTitle}: ${target!.out} ${target!.outLabel} → 0 ${target!.responseLabel}.`;
        candidates.push({
          channel: ch.name,
          fromWorldId: from.worldId, fromWorldTitle: from.worldTitle,
          toWorldId: to.worldId, toWorldTitle: to.worldTitle,
          text: `Transfer the play: ${ch.name} is proven in ${from.worldTitle} — run it for ${to.worldTitle}.`,
          evidence: `${from.worldTitle} ${ch.name}: ${ch.out} ${ch.outLabel} → ${ch.responses} ${ch.responseLabel} (${pct(ch.responses, ch.out)}). ${targetLine}`,
          basis: 'measured',
          rate: ch.responses / ch.out,
          volume: ch.out,
        });
      }
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) =>
    b.rate - a.rate
    || b.volume - a.volume
    || a.channel.localeCompare(b.channel)
    || a.toWorldId.localeCompare(b.toWorldId));
  const { rate: _r, volume: _v, ...move } = candidates[0];
  return move;
}
