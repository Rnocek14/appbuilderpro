// src/lib/garvis/prospects/cohortStats.verify.ts — the county index (npm run verify:cohortstats).
// A wrong finding embarrasses you with one owner; a wrong percentage embarrasses you in a newspaper
// in front of every business in the county. So most of these assertions are about REFUSALS: what the
// aggregate declines to say, and why.

import {
  cohortStats, statSentence, cohortMentionLine, MIN_SAMPLE, MIN_SLICE_SAMPLE,
  type CohortMember,
} from './cohortStats';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

const F = (code: string, confidence: 'detected' | 'likely' | 'needs_review' = 'detected') =>
  ({ code, confidence, category: 'conversion' as const, title: 'No way to get in touch' });

/** n members, all reachable, all with the given findings. */
const cohort = (n: number, findings: ReturnType<typeof F>[] = [], trade: string | null = 'roofers'): CohortMember[] =>
  Array.from({ length: n }, (_, i) => ({
    auditId: `a${i}`, trade, reachable: true, scanVersion: '1.4.0', findings,
  }));

// ── the denominator is scanned sites, never the whole frame ───────────────
{
  const members: CohortMember[] = [
    ...cohort(40, [F('conv.no_contact_path')]),
    ...Array.from({ length: 10 }, (_, i) => ({
      auditId: `dead${i}`, trade: 'roofers', reachable: false, scanVersion: null, findings: [],
    })),
  ];
  const s = cohortStats(members);
  check('frame size counts every business we set out to measure', s.members === 50);
  check('denominator is the SCANNED sites only', s.scanned === 40);
  check('unreachable sites are counted separately', s.unreachable === 10);
  check('a dead site is not a failure — 40/40, not 40/50', s.stats[0].pct === 100);
  check('the stat carries its own denominator', s.stats[0].denominator === 40);
  check('limits state the denominator explicitly', s.limits.some((l) => /out of the 40/.test(l)));
  check('limits disclose the unreachable sites', s.limits.some((l) => /10 sites did not load/.test(l)));
  check('an unreachable site is called an unknown, not a failure', s.limits.some((l) => /unknown, not a failure/i.test(l)));
}

// ── sample-size refusal ───────────────────────────────────────────────────
{
  const tiny = cohortStats(cohort(MIN_SAMPLE - 1, [F('conv.no_contact_path')]));
  check('below MIN_SAMPLE, the rate is null — never 0%', tiny.stats[0].pct === null);
  check('below MIN_SAMPLE the cohort is not publishable', !tiny.publishable);
  check('the blocker names the shortfall', tiny.blockers.some((b) => /minimum before any rate/.test(b)));
  check('statSentence renders NOTHING for an unreportable rate', statSentence(tiny.stats[0], 'roofer') === null);

  const enough = cohortStats(cohort(MIN_SAMPLE, [F('conv.no_contact_path')]));
  check('at exactly MIN_SAMPLE the rate reports', enough.stats[0].pct === 100);
  check('at exactly MIN_SAMPLE the cohort is publishable', enough.publishable);
}

// ── confidence: headline numbers are 'detected' only ──────────────────────
{
  const mixed: CohortMember[] = [
    ...cohort(20, [F('conv.no_contact_path', 'detected')]),
    ...cohort(20, [F('conv.no_contact_path', 'needs_review')]),
  ];
  const s = cohortStats(mixed);
  const stat = s.stats[0];
  check('headline n counts only detected findings', stat.n === 20);
  check('the wider count is still carried, not hidden', stat.nIncludingUnconfirmed === 40);
  check('the published percentage uses the conservative count', stat.pct === 50);
  check('limits explain that unconfirmed findings are excluded', s.limits.some((l) => /needed a human to confirm/i.test(l)));
}

// ── scan-version mixing blocks publication ────────────────────────────────
{
  const drifted: CohortMember[] = [
    ...cohort(20, [F('conv.no_contact_path')]),
    ...cohort(20, [F('conv.no_contact_path')]).map((m) => ({ ...m, scanVersion: '1.2.0' })),
  ];
  const s = cohortStats(drifted);
  check('mixed scan versions are detected', s.scanVersions.length === 2);
  check('mixed scan versions block publication', !s.publishable);
  check('the blocker explains why versions are not comparable', s.blockers.some((b) => /not comparable/i.test(b)));
  check('a single-version cohort is publishable', cohortStats(cohort(40, [F('x.y')])).publishable);
}

// ── one business counts once, however many instances it has ───────────────
{
  const s = cohortStats(cohort(40, [F('a11y.img_missing_alt'), F('a11y.img_missing_alt')]));
  check('a repeated code counts the BUSINESS once, not the instances', s.stats[0].n === 40);
  check('limits say the count is businesses, not instances', s.limits.some((l) => /not how many instances/i.test(l)));
}

// ── per-trade slices have their own denominators and their own refusal ────
{
  const members: CohortMember[] = [
    ...cohort(40, [F('conv.no_contact_path')], 'roofers'),
    ...cohort(MIN_SLICE_SAMPLE - 1, [F('conv.no_contact_path')], 'plumbers'),
    ...cohort(5, [F('conv.no_contact_path')], null),
  ];
  const s = cohortStats(members);
  const roofers = s.slices.find((x) => x.trade === 'roofers')!;
  const plumbers = s.slices.find((x) => x.trade === 'plumbers')!;
  check('slices are ordered largest first', s.slices[0].trade === 'roofers');
  check('a slice uses its OWN denominator, not the cohort total', roofers.denominator === 40);
  check('a big enough slice is reportable', roofers.reportable);
  check('an under-sampled slice is carried but marked unreportable', plumbers.reportable === false);
  check('an under-sampled slice reports no percentage', plumbers.stats[0].pct === null);
  check('a member with no trade still counts toward the overall denominator', s.scanned === 40 + (MIN_SLICE_SAMPLE - 1) + 5);
  check('a member with no trade joins no slice', !s.slices.some((x) => x.trade === 'null' || x.trade === ''));
}

// ── rounding: whole numbers, and the raw counts always survive ────────────
{
  const members: CohortMember[] = [
    ...cohort(13, [F('conv.no_contact_path')]),
    ...cohort(27, []),
  ];
  const s = cohortStats(members);
  const stat = s.stats[0];
  check('percentage is a whole number', Number.isInteger(stat.pct));
  check('13 of 40 rounds to 33', stat.pct === 33);
  check('the raw numerator survives for checking', stat.n === 13);
  check('the raw denominator survives for checking', stat.denominator === 40);
  check('a clean scan (no findings) still counts in the denominator', s.scanned === 40);
}

// ── the mention line: the sentence that changes the email ─────────────────
{
  const good = cohortStats(cohort(618, [F('conv.no_contact_path')]));
  const line = cohortMentionLine({ stats: good, frame: 'plumber', area: 'Walworth County' });
  check('the mention line names the real scanned count', line === 'Your site was one of 618 plumber websites in Walworth County we looked at.');
  check('the count in the line is the SCANNED count, not the frame size',
    cohortMentionLine({
      stats: cohortStats([...cohort(40), ...Array.from({ length: 60 }, (_, i) => ({ auditId: `d${i}`, trade: null, reachable: false, scanVersion: null, findings: [] }))]),
      frame: 'plumber', area: 'X',
    })?.includes('40 plumber') === true);

  const tiny = cohortStats(cohort(5, [F('conv.no_contact_path')]));
  check('an unpublishable cohort yields NO mention line', cohortMentionLine({ stats: tiny, frame: 'plumber', area: 'X' }) === null);
  const drifted = cohortStats([...cohort(20), ...cohort(20).map((m) => ({ ...m, scanVersion: '1.1.0' }))]);
  check('a version-mixed cohort yields no mention line either', cohortMentionLine({ stats: drifted, frame: 'plumber', area: 'X' }) === null);
}

// ── degenerate input claims nothing ───────────────────────────────────────
{
  const empty = cohortStats([]);
  check('an empty cohort reports zero members', empty.members === 0);
  check('an empty cohort has no stats', empty.stats.length === 0);
  check('an empty cohort is not publishable', !empty.publishable);
  check('an empty cohort still ships its limits', empty.limits.length > 0);
  const allDead = cohortStats(Array.from({ length: 50 }, (_, i) => ({ auditId: `d${i}`, trade: 'roofers', reachable: false, scanVersion: null, findings: [] })));
  check('a cohort where nothing loaded is not publishable', !allDead.publishable);
  check('a cohort where nothing loaded reports 0 scanned, 50 unreachable', allDead.scanned === 0 && allDead.unreachable === 50);
}

// ── determinism ───────────────────────────────────────────────────────────
{
  const m = cohort(40, [F('a.b'), F('c.d')]);
  check('cohortStats is deterministic', JSON.stringify(cohortStats(m)) === JSON.stringify(cohortStats(m)));
  check('cohortStats does not mutate its input', m.length === 40 && m[0].findings.length === 2);
}

// ── nothing published asserts compliance or a legal outcome ───────────────
{
  const s = cohortStats(cohort(40, [F('a11y.img_missing_alt')]));
  const allText = [...s.limits, ...s.blockers, ...s.stats.map((x) => x.title)].join(' ');
  check('no aggregate string claims compliance', !/complian|conformance|certif/i.test(allText.replace(/does not establish compliance[^.]*\./i, '')));
  check('no aggregate string threatens legal consequence', !/lawsuit|sued|illegal|liable/i.test(allText));
  check('limits disclaim compliance explicitly', s.limits.some((l) => /does not establish compliance/i.test(l)));
  check('limits state nothing is extrapolated beyond the businesses actually scanned',
    s.limits.some((l) => /extrapolat/i.test(l) && /describe that list only/i.test(l)));
}


// ── statSentence refusals found by reading a rendered study as an editor ──
{
  const zeroOnUnconfirmed = { code: 'conv.no_booking', category: 'conversion' as const, title: 'No way to book online', n: 0, denominator: 41, pct: 0, nIncludingUnconfirmed: 21 };
  check('a 0% built entirely on unconfirmed findings is never published', statSentence(zeroOnUnconfirmed, 'roofer') === null);
  const trueZero = { ...zeroOnUnconfirmed, nIncludingUnconfirmed: 0 };
  check('a TRUE zero (nothing detected, nothing suspected) still publishes', statSentence(trueZero, 'roofer') !== null);
  const plural = { code: 'a11y.img_missing_alt', category: 'accessibility' as const, title: 'Images with no alt text', n: 14, denominator: 41, pct: 34, nIncludingUnconfirmed: 14 };
  check('the frame noun pluralises in sentences ("41 roofers", not "41 roofer")', /41 roofers we scanned/.test(statSentence(plural, 'roofer') ?? ''));
  check('an already-plural frame is not double-pluralised', !/contractorss/.test(statSentence(plural, 'roofing contractors') ?? ''));
}

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} cohort-stats check(s) failed`);
