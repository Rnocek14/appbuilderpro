// Run: npx tsx src/lib/garvis/automationStats.verify.ts
import { AUTOMATION_STATS, statsFor, offerStatsFor, leadProofLine } from './automationStats';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('automationStats.verify');

// ── shape + honesty ────────────────────────────────────────────────────────
check('every block has a headline, ≥1 point, and a source (cited)', Object.values(AUTOMATION_STATS).every((b) => b.headline && b.points.length >= 1 && b.source));
check('every point has a stat', Object.values(AUTOMATION_STATS).every((b) => b.points.every((p) => !!p.stat)));
check('the money automations are covered', !!AUTOMATION_STATS.missed_call_text_back && !!AUTOMATION_STATS.review_request && !!AUTOMATION_STATS.reactivation && !!AUTOMATION_STATS.lead_followup);
check('missed-call proof carries the job-value + annual-loss stats', /\$3,000/.test(JSON.stringify(AUTOMATION_STATS.missed_call_text_back)) && /\$50k/.test(JSON.stringify(AUTOMATION_STATS.missed_call_text_back)));
check('review proof carries the 78% + 3–5× stats', /78%/.test(JSON.stringify(AUTOMATION_STATS.review_request)) && /3–5/.test(JSON.stringify(AUTOMATION_STATS.review_request)));
// HONESTY: industry stats, never a fabricated per-prospect number.
check('no fabricated "you are losing" per-prospect claim anywhere', !/you('| a)re losing/i.test(JSON.stringify(AUTOMATION_STATS)) && !/your business loses/i.test(JSON.stringify(AUTOMATION_STATS)));

// ── lookups ──────────────────────────────────────────────────────────────
check('statsFor returns the block for a known capability', statsFor('missed_call_text_back')?.headline.includes('missed call') === true);
check('statsFor returns null for an unknown capability (no placeholder)', statsFor('nonexistent') === null);

// ── offer assembly ─────────────────────────────────────────────────────────
const offered = offerStatsFor(['review_request', 'missed_call_text_back', 'review_request', 'unknown_cap']);
check('offerStatsFor keeps offer order', offered[0] === AUTOMATION_STATS.review_request && offered[1] === AUTOMATION_STATS.missed_call_text_back);
check('offerStatsFor de-dupes + drops unknowns', offered.length === 2);
check('offerStatsFor([]) is empty (never a blank stat band)', offerStatsFor([]).length === 0);

// ── compact proof line (pitch email) ────────────────────────────────────────
const proof = leadProofLine(['missed_call_text_back']);
check('leadProofLine pulls the strongest stat + its source', !!proof && proof.line.includes('30–40%') && proof.source.length > 0);
check('leadProofLine(no-data) → null', leadProofLine(['unknown_cap']) === null && leadProofLine([]) === null);

console.log(`\nautomationStats.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} automationStats check(s) failed`);
