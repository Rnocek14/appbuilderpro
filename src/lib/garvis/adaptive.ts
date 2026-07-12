// src/lib/garvis/adaptive.ts
// ADAPTIVE OPERATION — pure core (verified by adaptive.verify.ts). The layer the whole G5 build
// exists to feed: given the honest per-channel rows (what went out, what came back, what was
// spent), derive recommendations that PROPOSE shifts — with the numbers that justify them.
//
// The honesty contract is the whole design:
//   * 'measured' recommendations come ONLY from this world's rows. Every one carries its evidence.
//   * Small samples refuse to conclude: below MIN_SAMPLE a channel gets "too early to judge
//     (only N)" — never a verdict. An honest "we don't know yet" beats a confident guess.
//   * Cost-per-lead exists only where BOTH spend and leads are real logged/measured numbers.
//   * With nothing measured at all, the single recommendation is to instrument and run the
//     smallest real test — labeled heuristic, because that's what it is.

export interface ChannelIn {
  name: string;              // 'email' | 'direct mail' | 'website' | 'meta ads' | 'google ads' | …
  out: number;               // what went out / happened: sends, pieces, visits, clicks
  outLabel: string;          // "sends", "pieces mailed", "visits" — for evidence strings
  responses: number;         // what came back: replies, leads attributed to this channel
  responseLabel: string;     // "replies", "leads"
  spendUsd: number | null;   // real logged spend, or null when none logged
  instrumented: boolean;     // false = we can't see this channel's results at all
}

export interface AdaptiveRec {
  text: string;                                  // the proposed action, plain language
  evidence: string;                              // the actual numbers, always
  basis: 'measured' | 'heuristic';
  confidence: 'act' | 'watch' | 'too-early';
}

export interface ChannelFact {
  name: string;
  summary: string;           // "42 sends → 3 replies (7.1%)" — rate only when sample is honest
  cpl: number | null;        // spend / responses, only when both are real and responses > 0
  verdict: 'working' | 'silent' | 'too-early' | 'not-instrumented';
}

const MIN_SAMPLE = 10;       // below this, no rates and no verdicts — arithmetic, not statistics
const ACT_RESPONSES = 3;     // 'act' confidence needs at least this many real responses

const pct = (a: number, b: number) => `${((a / b) * 100).toFixed(1)}%`;
const usd = (n: number) => `$${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;

/** Per-channel facts: what a careful operator would read off the table. Pure + deterministic. */
export function channelFacts(channels: ChannelIn[]): ChannelFact[] {
  return channels.map((c) => {
    if (!c.instrumented) {
      return { name: c.name, summary: 'not instrumented — results invisible', cpl: null, verdict: 'not-instrumented' as const };
    }
    const cpl = c.spendUsd !== null && c.spendUsd > 0 && c.responses > 0 ? c.spendUsd / c.responses : null;
    const rate = c.out >= MIN_SAMPLE && c.responses > 0 ? ` (${pct(c.responses, c.out)})` : '';
    const spend = c.spendUsd !== null && c.spendUsd > 0 ? `, ${usd(c.spendUsd)} spent${cpl !== null ? ` → ${usd(cpl)}/lead` : ''}` : '';
    const summary = `${c.out} ${c.outLabel} → ${c.responses} ${c.responseLabel}${rate}${spend}`;
    const verdict: ChannelFact['verdict'] =
      c.responses > 0 ? 'working'
      : c.out >= MIN_SAMPLE ? 'silent'
      : 'too-early';
    return { name: c.name, summary, cpl, verdict };
  });
}

/** The recommendations. Deterministic: same rows, same advice. */
export function adapt(channels: ChannelIn[]): AdaptiveRec[] {
  const recs: AdaptiveRec[] = [];
  const facts = channelFacts(channels);
  const instrumented = channels.filter((c) => c.instrumented);
  const working = channels.filter((c, i) => facts[i].verdict === 'working');
  const silent = channels.filter((c, i) => facts[i].verdict === 'silent');
  const early = channels.filter((c, i) => facts[i].verdict === 'too-early');
  const dark = channels.filter((c) => !c.instrumented);

  // Nothing measured anywhere → the one honest recommendation.
  if (!instrumented.length || instrumented.every((c) => c.out === 0)) {
    recs.push({
      text: 'No measured results yet — run the smallest real test on one channel and let the rows decide.',
      evidence: 'Zero outbound recorded across instrumented channels.',
      basis: 'heuristic', confidence: 'too-early',
    });
    return recs;
  }

  // The core shift: something works while something else stays silent at real volume.
  for (const w of working) {
    for (const s of silent) {
      recs.push({
        text: `Shift effort from ${s.name} toward ${w.name}.`,
        evidence: `${w.name}: ${w.out} ${w.outLabel} → ${w.responses} ${w.responseLabel}; ${s.name}: ${s.out} ${s.outLabel} → 0 ${s.responseLabel}.`,
        basis: 'measured',
        confidence: w.responses >= ACT_RESPONSES ? 'act' : 'watch',
      });
    }
  }

  // CPL comparison — only between channels where BOTH sides are real logged numbers.
  const withCpl = channels
    .map((c, i) => ({ c, cpl: facts[i].cpl }))
    .filter((x): x is { c: ChannelIn; cpl: number } => x.cpl !== null)
    .sort((a, b) => a.cpl - b.cpl);
  if (withCpl.length >= 2) {
    const best = withCpl[0];
    const worst = withCpl[withCpl.length - 1];
    if (worst.cpl > best.cpl * 1.5) {
      recs.push({
        text: `${best.c.name} acquires a ${best.c.responseLabel.replace(/s$/, '')} far cheaper than ${worst.c.name} — weight the next budget toward it.`,
        evidence: `${best.c.name}: ${usd(best.cpl)}/lead (${usd(best.c.spendUsd!)} → ${best.c.responses}); ${worst.c.name}: ${usd(worst.cpl)}/lead (${usd(worst.c.spendUsd!)} → ${worst.c.responses}).`,
        basis: 'measured',
        confidence: best.c.responses >= ACT_RESPONSES ? 'act' : 'watch',
      });
    }
  }

  // A working channel with volume still small → the honest "double down carefully".
  for (const w of working) {
    if (w.responses > 0 && w.out < MIN_SAMPLE * 3) {
      recs.push({
        text: `${w.name} is producing — increase its volume before adding new channels.`,
        evidence: `${w.responses} ${w.responseLabel} from only ${w.out} ${w.outLabel}.`,
        basis: 'measured',
        confidence: w.responses >= ACT_RESPONSES ? 'act' : 'watch',
      });
    }
  }

  // Small samples: say so, per channel, instead of pretending.
  for (const e of early) {
    if (e.out > 0) {
      recs.push({
        text: `Too early to judge ${e.name} — keep it running to a readable sample.`,
        evidence: `Only ${e.out} ${e.outLabel} so far (below the ${MIN_SAMPLE} minimum for an honest read).`,
        basis: 'measured', confidence: 'too-early',
      });
    }
  }

  // Dark channels: the fix is instrumentation, not opinion.
  for (const d of dark) {
    if (d.out > 0) {
      recs.push({
        text: `${d.name} is running blind — instrument it before spending more.`,
        evidence: `${d.out} ${d.outLabel} went out with no way to see what came back.`,
        basis: 'measured', confidence: 'watch',
      });
    }
  }

  return recs.slice(0, 6);
}
