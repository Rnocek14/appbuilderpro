// supabase/functions/invoice-chase/index.ts
// THE CHASER — the heartbeat asks about money so the owner doesn't have to (60% of owners avoid
// confronting late payers; the median SMB sits on $17.5K unpaid). Daily: every SENT, unpaid,
// dated invoice is placed on the chase ladder (upcoming → due → firm → final — the same verified
// escalation as src/lib/garvis/money.ts, transcribed here for the Deno runtime), and each stage
// fires ONCE as a PENDING approval through the one send path. Polite, factual, never fake
// collections — and nothing sends without the owner.
//
// Secrets: CRON_SECRET (x-cron-secret). Deploy: supabase functions deploy invoice-chase --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2';
import { cronAuthorized } from '../_shared/cronGate.ts';
import { stampHeartbeat } from '../_shared/heartbeat.ts';
import { hashPayload } from '../_shared/payloadHash.ts';
import { autonomyAllowed, executeSendNow } from '../_shared/autonomyGate.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-cron-secret, x-worker-secret' };
const usd = (n: number) => `$${Number(n).toFixed(2)}`;

interface Inv {
  id: string; owner_id: string; contact_id: string | null; number: string; title: string;
  to_email: string; amount_usd: number; due_date: string | null; payment_url: string | null;
  status: string; paid_at: string | null; last_chase_stage: number;
}

// Mirrors chaseStage in src/lib/garvis/money.ts (verified there): 1 ≤3d before · 2 due-6d past ·
// 3 7-13d past · 4 14d+ past. Keep in lockstep with the reference.
function stageFor(inv: Inv, now: Date): number {
  if (inv.status !== 'sent' || inv.paid_at || !inv.due_date) return 0;
  const days = Math.floor((now.getTime() - new Date(`${inv.due_date}T00:00:00Z`).getTime()) / 86_400_000);
  if (days >= 14) return 4; if (days >= 7) return 3; if (days >= 0) return 2; if (days >= -3) return 1;
  return 0;
}

function chaseCopy(stage: number, inv: Inv, fromName: string): { subject: string; body: string } {
  const base = `invoice ${inv.number} (${inv.title}, ${usd(inv.amount_usd)}${inv.due_date ? `, due ${inv.due_date}` : ''})`;
  const pay = inv.payment_url ? `Pay online here: ${inv.payment_url}` : 'Reply to this email and we can arrange payment.';
  switch (stage) {
    case 1: return { subject: `Heads-up: invoice ${inv.number} is due ${inv.due_date}`, body: `Hi,\n\nA friendly heads-up that ${base} comes due in a few days.\n\n${pay}\n\nThanks!\n— ${fromName}` };
    case 2: return { subject: `Invoice ${inv.number} is now due`, body: `Hi,\n\nJust flagging that ${base} is now due.\n\n${pay}\n\nIf it's already on its way, ignore this — and thank you.\n— ${fromName}` };
    case 3: return { subject: `Following up: invoice ${inv.number} is past due`, body: `Hi,\n\n${base.charAt(0).toUpperCase() + base.slice(1)} is now past due, and I wanted to check in directly.\n\n${pay}\n\nIf something's wrong with the invoice or the timing, reply and tell me — happy to sort it out.\n— ${fromName}` };
    default: return { subject: `Final notice: invoice ${inv.number}`, body: `Hi,\n\nThis is my last automatic note about ${base}, now more than two weeks past due.\n\n${pay}\n\nIf I don't hear back, I'll pause any further work until it's settled — but one reply is all it takes to fix this.\n— ${fromName}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  if (!cronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  await stampHeartbeat(admin, 'garvis-invoice-chase-daily');
  const now = new Date();

  const { data: invoices, error } = await admin.from('invoices')
    .select('id, owner_id, world_id, contact_id, number, title, to_email, amount_usd, due_date, payment_url, status, paid_at, last_chase_stage')
    .eq('status', 'sent').not('due_date', 'is', null).limit(500);
  if (error) return json({ error: error.message }, 500);

  let drafted = 0, skipped = 0;
  for (const inv of (invoices ?? []) as Inv[]) {
    try {
      const stage = stageFor(inv, now);
      if (stage === 0 || stage <= inv.last_chase_stage) { skipped++; continue; }  // each rung fires once

      const { data: os } = await admin.from('outreach_settings')
        .select('from_name, company_name, outbound_enabled').eq('owner_id', inv.owner_id).maybeSingle();
      if (!(os as { outbound_enabled?: boolean } | null)?.outbound_enabled) { skipped++; continue; }
      // Per-brand identity (scan B8): a world-scoped invoice chases as ITS business (app_0085,
      // applied as a unit); only unscoped invoices fall back to the owner-global identity.
      let fromName = '';
      if ((inv as { world_id?: string | null }).world_id) {
        const { data: wsi } = await admin.from('world_sender_identities')
          .select('from_name, company_name').eq('world_id', (inv as { world_id?: string | null }).world_id).maybeSingle();
        fromName = ((wsi as { from_name?: string | null } | null)?.from_name ?? '').trim()
          || ((wsi as { company_name?: string | null } | null)?.company_name ?? '').trim();
      }
      if (!fromName) {
        fromName = ((os as { from_name?: string | null } | null)?.from_name ?? '').trim()
          || ((os as { company_name?: string | null } | null)?.company_name ?? '').trim() || 'Me';
      }
      const copy = chaseCopy(stage, inv, fromName);

      const { data: camp } = await admin.from('outreach_campaigns').insert({
        owner_id: inv.owner_id, contact_id: inv.contact_id, kind: 'invoice_chase', state: 'pending_approval',
      }).select('id').single();
      if (!camp) { skipped++; continue; }
      const { data: msg } = await admin.from('outreach_messages').insert({
        owner_id: inv.owner_id, campaign_id: camp.id, contact_id: inv.contact_id,
        sequence_step: stage, subject: copy.subject, body_text: copy.body, to_address: inv.to_email, status: 'draft',
      }).select('id').single();
      if (!msg) { skipped++; continue; }
      // Earned autonomy (app_0097): a granted 'invoice_chase' class self-approves under its
      // daily cap and executes through the one send path. Otherwise: pending, as ever.
      const auto = await autonomyAllowed(admin, inv.owner_id, 'invoice_chase');
      const apPayload: Record<string, unknown> = { message_id: msg.id, invoice_id: inv.id, chase_stage: stage };
      if (auto) apPayload.autonomy_class = 'invoice_chase';
      const { data: apRow } = await admin.from('approvals').insert({
        owner_id: inv.owner_id, kind: 'send_email',
        ...(auto
          ? { requested_by: 'garvis-auto', status: 'approved', decided_via: 'autonomy_grant', decided_at: new Date().toISOString() }
          : { status: 'pending', requested_by: 'worker' }),
        title: `${['', 'Reminder', 'Due note', 'Past-due follow-up', 'Final notice'][stage]} for ${inv.number} → ${inv.to_email}`,
        preview: `${copy.subject}\n\n${copy.body.slice(0, 400)}`,
        payload: apPayload, payload_hash: await hashPayload(apPayload),
      }).select('id').single();
      if (auto && apRow) await executeSendNow((apRow as { id: string }).id);
      await admin.from('invoices').update({ last_chase_stage: stage, updated_at: now.toISOString() }).eq('id', inv.id);
      drafted++;
    } catch { skipped++; /* one invoice's failure never blocks the rest */ }
  }

  return json({ ok: true, drafted, skipped, considered: (invoices ?? []).length });
});
