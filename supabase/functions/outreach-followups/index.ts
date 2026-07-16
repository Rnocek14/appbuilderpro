// supabase/functions/outreach-followups/index.ts
// The follow-up cadence cron. Picks campaigns that were sent and are due for a bump (default 3
// business days, max 2 bumps), drafts a short follow-up, and ENQUEUES AN APPROVAL — it never sends
// on its own. Any blocking event (reply/unsub/bounce) stops the sequence. Ported from swift-prep-pros'
// followups.server.ts, generalized to owner-scoped tables + the app_0022 approval queue.
//
// Auth: shared secret (pg_cron / an external scheduler calls this; no user JWT). Deploy --no-verify-jwt.
// Secret: CRON_SECRET (+ OPENAI_API_KEY/LOVABLE_API_KEY for drafting). Trigger via pg_cron + pg_net, or
// any scheduler: POST with header x-cron-secret.

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-cron-secret' };
const MAX_FOLLOWUPS = 2;

async function draftFollowup(subject: string, body: string, firstName: string, n: number): Promise<{ subject: string; body: string } | null> {
  const openai = Deno.env.get('OPENAI_API_KEY');
  const lovable = Deno.env.get('LOVABLE_API_KEY');
  if (!openai && !lovable) return null;
  const url = openai ? 'https://api.openai.com/v1/chat/completions' : 'https://ai.gateway.lovable.dev/v1/chat/completions';
  const model = openai ? 'gpt-4o-mini' : 'google/gemini-2.5-flash';
  const system = 'You write short follow-ups to a cold email sent days ago. Under 50 words. Plain text. No "just following up"/"checking in". One question. No salutation if the first name is unknown.';
  const user = `Write follow-up #${n}. ${n === 1 ? 'A short nudge; re-ask the original question a different way; 2-3 sentences.' : 'A one-sentence breakup note; acknowledge silence is fine; one yes/no question; leave the door open.'}\n\nFirst name: ${firstName || '(unknown)'}\nOriginal subject: ${subject}\nOriginal body:\n"""${body}"""\n\nReturn strict JSON {"subject": string, "body": string}. Subject MUST start with "Re: " + the original subject.`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${openai ?? lovable}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], response_format: { type: 'json_object' }, temperature: 0.4 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}');
    if (!parsed.subject || !parsed.body) return null;
    parsed.subject = String(parsed.subject).startsWith('Re:') ? parsed.subject : `Re: ${subject}`;
    return { subject: String(parsed.subject).slice(0, 200), body: String(parsed.body).replace(/\\n/g, '\n') };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const limit = Math.min(25, Number(new URL(req.url).searchParams.get('limit') ?? 10));
  const nowIso = new Date().toISOString();

  const { data: due } = await admin.from('outreach_campaigns')
    .select('id, owner_id, contact_id, preview_site_id, follow_up_count')
    .eq('state', 'sent').eq('sequence_stopped', false)
    // WARM/COLD WALL: automation campaigns are messages to a client's own customers (recall,
    // review requests). Drafting a "following up on my earlier email about your website" cold
    // pitch at THOSE people would be nonsense and reputational damage. Cold outreach only.
    .neq('kind', 'automation')
    .lt('follow_up_count', MAX_FOLLOWUPS)
    .not('next_followup_at', 'is', null).lte('next_followup_at', nowIso)
    .order('next_followup_at', { ascending: true }).limit(limit);

  let drafted = 0, skipped = 0;
  for (const camp of due ?? []) {
    // Hard stop on any blocking reply.
    const { data: replies } = await admin.from('replies').select('id').eq('campaign_id', camp.id).limit(1);
    if ((replies ?? []).length) { await admin.from('outreach_campaigns').update({ sequence_stopped: true }).eq('id', camp.id); skipped++; continue; }

    const { data: msgs } = await admin.from('outreach_messages')
      .select('id, subject, body_text, to_address, contact_id').eq('campaign_id', camp.id).order('created_at', { ascending: true });
    const first = (msgs ?? [])[0];
    if (!first?.to_address) { skipped++; continue; }

    let firstName = '';
    if (camp.contact_id) {
      const { data: c } = await admin.from('contacts').select('full_name').eq('id', camp.contact_id).maybeSingle();
      firstName = (c?.full_name ?? '').trim().split(/\s+/)[0] ?? '';
    }
    const n = (camp.follow_up_count ?? 0) + 1;
    const draft = await draftFollowup(first.subject ?? '', first.body_text ?? '', firstName, n);
    if (!draft) { skipped++; continue; }

    const { data: newMsg } = await admin.from('outreach_messages').insert({
      owner_id: camp.owner_id, campaign_id: camp.id, contact_id: camp.contact_id,
      preview_site_id: camp.preview_site_id, sequence_step: n, subject: draft.subject,
      body_text: draft.body, to_address: first.to_address, status: 'draft',
    }).select('id').single();

    await admin.from('outreach_campaigns').update({ follow_up_count: n, next_followup_at: null }).eq('id', camp.id);

    // Enqueue the approval (never auto-send).
    if (newMsg) {
      await admin.from('approvals').insert({
        owner_id: camp.owner_id, kind: 'send_email', requested_by: 'worker',
        title: `Follow-up #${n} to ${first.to_address}`,
        preview: `${draft.subject}\n\n${draft.body}`,
        payload: { message_id: (newMsg as { id: string }).id, campaign_id: camp.id },
      });
      drafted++;
    }
  }

  return json({ ok: true, drafted, skipped, considered: (due ?? []).length });
});
