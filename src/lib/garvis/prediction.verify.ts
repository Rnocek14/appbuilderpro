// Run: npx tsx src/lib/garvis/prediction.verify.ts
// Pins the prediction producer: falsifiable by construction, measured-or-says-heuristic, closed
// against real reply records, and wired so a throwing producer can never change a send outcome.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MIN_BASE_SENDS, MIN_CLOSED_FOR_LINE, PREDICTION_WINDOW_DAYS,
  campaignFromReasoning, closeSendPrediction, expectedReply, predictionFor, windowElapsed,
} from './prediction';
import { composeBriefing, type BriefingFacts } from './briefing';

let passed = 0;
let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

const CAMP = '3f2b6a1e-9c4d-4e8f-a1b2-c3d4e5f60789';

// THE PRODUCER — measured speaks with its numbers; heuristic says so and invents none.
{
  const low = predictionFor({ subject: 'Your site audit', to: 'kim@acme.com', campaignId: CAMP, base: { sends: 20, replies: 2 } });
  check('a measured minority rate predicts no reply, with the real numbers',
    low.prediction.startsWith('No reply within') && low.prediction.includes('10% reply rate over 20 elapsed sends'));
  check('…the decision names what was actually sent', low.decision === 'Sent "Your site audit" to kim@acme.com');
  check('…and the reasoning is labeled measured', low.reasoning.includes('Measured base rate'));
  const high = predictionFor({ subject: 's', to: 't@u.vw', campaignId: CAMP, base: { sends: 12, replies: 9 } });
  check('a measured majority rate predicts a reply', high.prediction.startsWith('A reply within'));
  const thin = predictionFor({ subject: 's', to: 't@u.vw', campaignId: CAMP, base: { sends: MIN_BASE_SENDS - 1, replies: 3 } });
  check('too few elapsed sends → HEURISTIC in so many words', thin.prediction.includes('heuristic'));
  check('…and the heuristic invents no percentage', !thin.prediction.includes('%'));
  check('no base at all → the same honest heuristic',
    predictionFor({ subject: 's', to: 't@u.vw', campaignId: CAMP, base: null }).prediction.includes('heuristic'));
  check('the window is stated in the prediction itself',
    low.prediction.includes(`${PREDICTION_WINDOW_DAYS} days`) && thin.prediction.includes(`${PREDICTION_WINDOW_DAYS} days`));
}

// THE MARKER — the campaign rides the reasoning so the closer can find the real record.
{
  const row = predictionFor({ subject: 's', to: 't@u.vw', campaignId: CAMP, base: null });
  check('the campaign marker round-trips', campaignFromReasoning(row.reasoning) === CAMP);
  check('a hand-written reasoning has no marker', campaignFromReasoning('I decided to raise prices.') === null);
  check('a mangled marker is not a match', campaignFromReasoning('[campaign:not-a-uuid]') === null);
  check('null reasoning is safe', campaignFromReasoning(null) === null);
}

// THE COMMITMENT PARSER — what the prediction promised, or null for decisions we never wrote.
{
  check('expects-no-reply parses', expectedReply(predictionFor({ subject: 's', to: 't', campaignId: CAMP, base: null }).prediction) === false);
  check('expects-a-reply parses', expectedReply('A reply within 7 days — more likely than not (…)') === true);
  check('a hand-written prediction is NOT ours to judge', expectedReply('Revenue doubles by Q4') === null);
  check('null prediction is safe', expectedReply(null) === null);
}

// THE WINDOW — elapsed means elapsed; garbage never counts as elapsed.
{
  const NOW = '2026-08-14T12:00:00.000Z';
  const daysAgo = (d: number) => new Date(Date.parse(NOW) - d * 86_400_000).toISOString();
  check('a fresh decision is not judged', !windowElapsed(daysAgo(2), NOW));
  check('an elapsed one is', windowElapsed(daysAgo(PREDICTION_WINDOW_DAYS), NOW));
  check('the boundary is inclusive', windowElapsed(daysAgo(PREDICTION_WINDOW_DAYS), NOW) && !windowElapsed(daysAgo(PREDICTION_WINDOW_DAYS - 0.01), NOW));
  check('an unparseable date never elapses', !windowElapsed('not-a-date', NOW) && !windowElapsed(daysAgo(30), 'garbage'));
}

// THE CLOSER — judged against what actually happened, never by the model that predicted it.
{
  const noReply = predictionFor({ subject: 's', to: 't', campaignId: CAMP, base: null }).prediction;
  const hit = closeSendPrediction(noReply, false);
  check('no-reply-expected + silence = hit', hit !== null && hit.hit && hit.outcome.includes('as predicted'));
  const miss = closeSendPrediction(noReply, true);
  check('no-reply-expected + a real reply = MISS, said plainly',
    miss !== null && !miss.hit && miss.outcome.includes('A reply arrived') && miss.outcome.includes('contrary to the prediction'));
  check('a hand-written decision is left alone', closeSendPrediction('Revenue doubles by Q4', true) === null);
}

// THE BRIEFING LINE — only at enough closed predictions for the rate to mean anything.
{
  const base: BriefingFacts = {
    hour: 8, sinceHours: 14, episodes: [], opportunities: 0,
    arcsFinished: [], arcsWaiting: [], approvals: 0, clocks: 0, channels: 0, predictions: null,
  };
  check('the constant is the documented one', MIN_CLOSED_FOR_LINE === 5);
  check('at ≥5 closed the record shows',
    composeBriefing({ ...base, predictions: { closed: 5, hits: 3 } }).lines.some((l) => l === 'Predictions: 3 of 5 hit.'));
  check('below 5 closed it stays silent (a rate over 4 points is theater)',
    !composeBriefing({ ...base, predictions: { closed: 4, hits: 4 } }).lines.some((l) => l.startsWith('Predictions:')));
  check('a failed probe stays silent', !composeBriefing(base).lines.some((l) => l.startsWith('Predictions:')));
}

// ---- the wiring (textual contract) ----
const here = dirname(fileURLToPath(import.meta.url));
const sendEmail = readFileSync(join(here, '../../../supabase/functions/send-email/index.ts'), 'utf8');
const consolidate = readFileSync(join(here, '../../../supabase/functions/garvis-consolidate/index.ts'), 'utf8');
const srv = readFileSync(join(here, '../../../supabase/functions/_shared/predictionSrv.ts'), 'utf8');
{
  check('send-email fires the producer FIRE-AND-FORGET (a throw never changes a send outcome)',
    sendEmail.includes('openSendPrediction(admin, uid, { subject: msg.subject ?? \'\', to, campaignId: msg.campaign_id ?? null }).then(() => {}, () => {})'));
  const fireAt = sendEmail.indexOf('openSendPrediction(admin');
  check('…AFTER the send is recorded (message stamped, ledger written)',
    fireAt > sendEmail.indexOf("status: 'sent', sent_at: sentAt") && fireAt > sendEmail.indexOf("ledger({ status: 'ok'"));
  check('…and before the success response', fireAt < sendEmail.indexOf('return json({ ok: true, resend_id'));

  check('garvis-consolidate closes elapsed predictions per owner',
    consolidate.includes('closeSendPredictions(admin, ownerId).catch(() => 0)'));
  check('…BEFORE the thin-skip (a quiet owner\'s predictions still close on time)',
    consolidate.indexOf('closeSendPredictions(admin, ownerId)') < consolidate.indexOf('skippedThin++'));

  check('the producer opens nothing without a campaign to judge against',
    srv.includes('if (!input.campaignId) return;'));
  check('the closer touches only campaign-marked rows and CASes on still-open',
    srv.includes('campaignFromReasoning(d.reasoning)') && srv.includes(".eq('id', d.id).is('outcome', null)"));
  check('the producer spends nothing — no model call anywhere in it',
    !srv.includes('complete(') && !srv.includes('spendCredits'));
  check('the base rate counts only fully-elapsed sends (unelapsed ones would bias it down)',
    srv.includes('PREDICTION_WINDOW_DAYS * 86_400_000') && srv.includes(".lte('sent_at', winEnd)"));
}

console.log(`\nprediction.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} prediction check(s) failed`);
