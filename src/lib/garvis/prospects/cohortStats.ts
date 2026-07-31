// src/lib/garvis/prospects/cohortStats.ts
// THE COUNTY INDEX — turning a pile of scans into a number you can publish and defend.
//
// One business's findings are a sales conversation. A THOUSAND businesses' findings are a statistic,
// and a statistic is a different kind of object with a different failure mode: a wrong finding
// embarrasses you with one owner, a wrong percentage embarrasses you in a newspaper, in front of
// every business in the county at once, permanently. So this module is mostly refusals.
//
// THE FIVE WAYS AN AGGREGATE LIES, and what is done about each:
//
//  1. THE DENOMINATOR. "41% of businesses can't take a booking" — 41% of WHAT? Of every business we
//     discovered? Of the ones whose site loaded? Those are different numbers and the gap between
//     them is where an honest study quietly becomes a dishonest one. A site that timed out is
//     UNKNOWN, not a failure, and folding unknowns into the denominator deflates every rate while
//     folding them into the numerator inflates it. Here the denominator is always and only the
//     members that were actually scanned successfully, it is reported next to every percentage, and
//     unreachable sites are counted and disclosed separately.
//
//  2. SAMPLE SIZE. Eleven roofers is not a finding about roofers. Every rate — overall and per
//     trade — is null below MIN_SAMPLE, and null is rendered as "not enough data", never as 0%.
//
//  3. MIXED CONFIDENCE. A published number must be built from things we would state plainly. A
//     'needs_review' finding has not been confirmed by anyone; counting it toward a headline
//     percentage launders an uncertainty into a fact. Headline stats count 'detected' only. The
//     wider count is still computed and shown alongside, labelled, so nothing is hidden — but the
//     number that goes in the press release is the conservative one.
//
//  4. MIXED SCAN VERSIONS. A cohort scanned half under v1.2.0 and half under v1.4.0 is comparing
//     unlike readings, because those versions detect different things ON PURPOSE. Any spread is
//     detected, reported, and blocks publication.
//
//  5. FALSE PRECISION. "40.63%" from 600 samples implies a resolution the method does not have.
//     Percentages render as whole numbers, and the raw n/d is always carried so anyone can check.
//
// WHAT THIS MODULE DELIBERATELY DOES NOT DO: it does not weight, model, extrapolate to businesses
// not scanned, compare against a national baseline it has not measured, or compute significance.
// It counts what was found in a named, reproducible set and says how big that set was. A study that
// only claims what it counted is one nobody can take apart.
//
// Pure + deterministic (no I/O, no clock). The impure half — loading a cohort's audits and writing
// the study row — lives in cohortStore.ts.

import type { ScanCategory, ScanConfidence } from '../../../../supabase/functions/_shared/scanTypes.ts';

/** Below this many successfully-scanned members, a rate is not reported at all. */
export const MIN_SAMPLE = 30;

/** Below this many members in a trade slice, the slice is not reported. Slices are smaller by
 *  nature, but a percentage of twelve is still not a percentage. */
export const MIN_SLICE_SAMPLE = 20;

/** One member of the cohort, as the store hands it over. */
export interface CohortMember {
  auditId: string;
  /** The trade/niche this business was discovered under, e.g. 'roofers'. Null when unknown — such a
   *  member still counts toward the overall denominator, it simply joins no slice. */
  trade: string | null;
  /** Did the site actually load? An unreachable site is an UNKNOWN, never a failure. */
  reachable: boolean;
  /** The detection-logic version this reading was taken under. */
  scanVersion: string | null;
  /** The findings recorded for this member. Empty is meaningful: a clean scan. */
  findings: { code: string; confidence: ScanConfidence; category: ScanCategory; title: string }[];
}

/** One publishable rate. */
export interface CohortStat {
  code: string;
  category: ScanCategory;
  /** The owner-facing label, taken from the findings themselves so wording never drifts from them. */
  title: string;
  /** Members with this finding at 'detected' confidence — the headline numerator. */
  n: number;
  /** Members scanned successfully — the ONLY denominator this module will use. */
  denominator: number;
  /** n/denominator as a whole-number percentage, or null when the sample is too small to report. */
  pct: number | null;
  /** The same count including 'likely' and 'needs_review'. Shown for transparency, never published
   *  as the headline, because it includes claims no human has confirmed. */
  nIncludingUnconfirmed: number;
}

/** A per-trade cut of the same question. */
export interface CohortSlice {
  trade: string;
  denominator: number;
  stats: CohortStat[];
  /** False when the slice is below MIN_SLICE_SAMPLE — it is carried so the operator can see the
   *  trade exists and is under-sampled, rather than it silently vanishing. */
  reportable: boolean;
}

export interface CohortStats {
  /** Every business the cohort set out to measure — the sampling frame's size. */
  members: number;
  /** Sites that loaded and were scanned. THE denominator for every rate. */
  scanned: number;
  /** Sites that did not load. Counted, disclosed, never treated as a failure. */
  unreachable: number;
  /** Every distinct scan version present. More than one blocks publication. */
  scanVersions: string[];
  stats: CohortStat[];
  slices: CohortSlice[];
  /** Plain-language statements that must ship with any published number. */
  limits: string[];
  /** False when something makes the aggregate unsafe to publish; `blockers` says what. */
  publishable: boolean;
  blockers: string[];
}

function pctOf(n: number, d: number, min: number): number | null {
  if (d < min || d === 0) return null;
  return Math.round((n / d) * 100);
}

/**
 * Aggregate one cohort. `members` is the whole frame — including the sites that did not load,
 * because the count of those is itself a disclosure the study owes its readers.
 */
export function cohortStats(members: CohortMember[], opts: { minSample?: number; minSliceSample?: number } = {}): CohortStats {
  const minSample = opts.minSample ?? MIN_SAMPLE;
  const minSliceSample = opts.minSliceSample ?? MIN_SLICE_SAMPLE;

  const scannedMembers = members.filter((m) => m.reachable);
  const scanned = scannedMembers.length;
  const unreachable = members.length - scanned;

  const scanVersions = [...new Set(scannedMembers.map((m) => m.scanVersion).filter((v): v is string => !!v))].sort();

  // Count per code. A member counts ONCE for a code no matter how many instances it has — this is
  // "what share of businesses have this problem", not "how many problems are there".
  const build = (pool: CohortMember[], denom: number, min: number): CohortStat[] => {
    const acc = new Map<string, { detected: number; any: number; category: ScanCategory; title: string }>();
    for (const m of pool) {
      const seen = new Set<string>();
      for (const f of m.findings) {
        if (seen.has(f.code)) continue;
        seen.add(f.code);
        const cur = acc.get(f.code) ?? { detected: 0, any: 0, category: f.category, title: f.title };
        cur.any++;
        if (f.confidence === 'detected') cur.detected++;
        acc.set(f.code, cur);
      }
    }
    return [...acc.entries()]
      .map(([code, v]): CohortStat => ({
        code, category: v.category, title: v.title,
        n: v.detected,
        denominator: denom,
        pct: pctOf(v.detected, denom, min),
        nIncludingUnconfirmed: v.any,
      }))
      // Most-common first — that is the order a reader wants and the order a headline is picked from.
      .sort((a, b) => b.n - a.n || a.code.localeCompare(b.code));
  };

  const stats = build(scannedMembers, scanned, minSample);

  const byTrade = new Map<string, CohortMember[]>();
  for (const m of scannedMembers) {
    if (!m.trade) continue;
    byTrade.set(m.trade, [...(byTrade.get(m.trade) ?? []), m]);
  }
  const slices: CohortSlice[] = [...byTrade.entries()]
    .map(([trade, pool]): CohortSlice => ({
      trade,
      denominator: pool.length,
      stats: build(pool, pool.length, minSliceSample),
      reportable: pool.length >= minSliceSample,
    }))
    .sort((a, b) => b.denominator - a.denominator || a.trade.localeCompare(b.trade));

  const blockers: string[] = [];
  if (scanned < minSample) {
    blockers.push(`Only ${scanned} site${scanned === 1 ? '' : 's'} were scanned successfully; ${minSample} is the minimum before any rate is reported.`);
  }
  if (scanVersions.length > 1) {
    blockers.push(`This cohort mixes scan versions (${scanVersions.join(', ')}). Those versions detect different things by design, so their readings are not comparable. Re-scan the whole cohort under one version before publishing.`);
  }

  const limits: string[] = [
    `Every percentage is out of the ${scanned} site${scanned === 1 ? '' : 's'} that loaded and were scanned, not out of the ${members.length} business${members.length === 1 ? '' : 'es'} in the sample.`,
    unreachable > 0
      ? `${unreachable} site${unreachable === 1 ? '' : 's'} did not load when we looked and are counted in neither the numerator nor the denominator. A site that was down is an unknown, not a failure.`
      : 'Every site in the sample loaded when we looked.',
    'Percentages count how many BUSINESSES have a given issue, not how many instances of it exist — one site with forty unlabelled images counts once.',
    'Headline percentages count only findings our scan detected unambiguously in the page source. Findings that needed a human to confirm them are excluded from these numbers, and are reported separately.',
    'This reads one page per business — usually the home page. A problem fixed on an inner page, or present only there, is not visible in these figures.',
    'This is an automated screen of page source. It cannot see colour contrast, keyboard behaviour, or anything a browser builds after the page loads, and it does not establish compliance with any standard.',
    'Nothing here is extrapolated. These are counts from a named list of businesses, and they describe that list only.',
  ];

  return {
    members: members.length,
    scanned,
    unreachable,
    scanVersions,
    stats,
    slices,
    limits,
    publishable: blockers.length === 0,
    blockers,
  };
}

/**
 * The publishable sentence for one stat. Returns null when the rate is not reportable — the caller
 * must render nothing rather than a hedge, because "we don't have enough data on X" in a press
 * release is still a sentence about X.
 */
export function statSentence(stat: CohortStat, frame: string): string | null {
  if (stat.pct === null) return null;
  return `${stat.pct}% of the ${stat.denominator} ${frame} we scanned — ${stat.n} of them — ${stat.title.toLowerCase().startsWith('no ') ? 'had' : 'showed'} ${stat.title.toLowerCase()}.`;
}

/**
 * The line that turns a cold email into a notification: "your business was one of N we looked at".
 *
 * This is the single highest-leverage sentence in the whole outreach path, and the reason the cohort
 * exists at all — it changes the email from a stranger selling something into a report about
 * something that already happened. It therefore has to be exactly true: it names the real count of
 * businesses actually scanned and the real area, and it is only ever produced for a cohort that is
 * publishable. An unpublishable cohort returns null and the pitch falls back to its ordinary
 * opening, because "one of 12 businesses we looked at" is not a study, it is a rounding error.
 */
export function cohortMentionLine(input: { stats: CohortStats; frame: string; area: string }): string | null {
  const { stats, frame, area } = input;
  if (!stats.publishable) return null;
  return `Your site was one of ${stats.scanned} ${frame} websites in ${area} we looked at.`;
}
