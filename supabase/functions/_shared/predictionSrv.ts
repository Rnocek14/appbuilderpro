// supabase/functions/_shared/predictionSrv.ts — SW7.2: the impure halves of the prediction
// producer (pure core: src/lib/garvis/prediction.ts).
//
//   openSendPrediction  — called FIRE-AND-FORGET from send-email after the send is recorded.
//                         A throwing producer must never change a send outcome; the caller
//                         attaches the house .then(()=>{},()=>{}) and this function also keeps
//                         its own work best-effort. No model call, no spend — two counts and
//                         one insert.
//   closeSendPredictions — called from garvis-consolidate per owner: every open decision this
//                          producer wrote whose window has elapsed is judged against the real
//                          campaign reply record. Hand-written decisions are never touched.

import {
  predictionFor, closeSendPrediction, campaignFromReasoning, windowElapsed,
  PREDICTION_WINDOW_DAYS, MIN_BASE_SENDS,
} from '../../../src/lib/garvis/prediction.ts';

// deno-lint-ignore no-explicit-any
type Admin = any;

/** Open a falsifiable decision for one executed send. Only sends that ride a campaign get one —
 *  the campaign's reply record is what the closer judges against. */
export async function openSendPrediction(admin: Admin, ownerId: string, input: {
  subject: string; to: string; campaignId: string | null;
}): Promise<void> {
  if (!input.campaignId) return;
  // The measured base: sends whose window has FULLY elapsed (recent-but-unelapsed sends can
  // still draw replies and would bias the rate down).
  const now = Date.now();
  const winStart = new Date(now - 45 * 86_400_000).toISOString();
  const winEnd = new Date(now - PREDICTION_WINDOW_DAYS * 86_400_000).toISOString();
  const { count: sends } = await admin.from('outreach_messages')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId).eq('status', 'sent').gte('sent_at', winStart).lte('sent_at', winEnd);
  let base: { sends: number; replies: number } | null = null;
  if ((sends ?? 0) >= MIN_BASE_SENDS) {
    const { count: replies } = await admin.from('outreach_campaigns')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', ownerId).in('state', ['replied', 'won']).gte('last_send_at', winStart);
    base = { sends: sends ?? 0, replies: replies ?? 0 };
  }
  const row = predictionFor({ subject: input.subject, to: input.to, campaignId: input.campaignId, base });
  await admin.from('mind_decisions').insert({
    owner_id: ownerId, ...row, decided_at: new Date().toISOString(),
  });
}

/** Close every elapsed open prediction for one owner. Returns how many closed. */
export async function closeSendPredictions(admin: Admin, ownerId: string): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data } = await admin.from('mind_decisions')
    .select('id, prediction, reasoning, decided_at')
    .eq('owner_id', ownerId).is('outcome', null)
    .lt('decided_at', new Date(Date.now() - PREDICTION_WINDOW_DAYS * 86_400_000).toISOString())
    .limit(40);
  const rows = (data ?? []) as { id: string; prediction: string | null; reasoning: string | null; decided_at: string }[];
  let closed = 0;
  for (const d of rows) {
    const campaignId = campaignFromReasoning(d.reasoning);
    if (!campaignId) continue;                       // a hand-written decision is never auto-closed
    if (!windowElapsed(d.decided_at, nowIso)) continue;
    const { data: camp } = await admin.from('outreach_campaigns').select('state').eq('id', campaignId).maybeSingle();
    if (!camp) continue;                             // campaign gone — the operator can close it by hand
    const replied = ['replied', 'won'].includes((camp as { state: string }).state);
    const res = closeSendPrediction(d.prediction, replied);
    if (!res) continue;
    // CAS on still-open: the operator may have recorded their own verdict meanwhile — theirs wins.
    const { error } = await admin.from('mind_decisions')
      .update({ outcome: res.outcome, outcome_hit: res.hit, outcome_at: nowIso, updated_at: nowIso })
      .eq('id', d.id).is('outcome', null);
    if (!error) closed++;
  }
  return closed;
}
