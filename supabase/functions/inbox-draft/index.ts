// supabase/functions/inbox-draft/index.ts
// OVERNIGHT REPLY DRAFTS — the "drafted-but-never-sent" pattern (the one form of email autonomy
// the market actually adopted). Nightly, for every POSITIVE reply that hasn't been answered:
// draft the response and stage it as a PENDING approval, so the morning queue holds a ready
// batch instead of a blank page. Nothing sends without the owner.
//
// HONESTY RULES:
//   - The draft answers ONLY from the thread itself (the original email + their reply). Anything
//     it can't know becomes a visible [YOU FILL: …] hole — a hole is honest, an invented fact is
//     not. The owner completes it in the approval preview.
//   - A reply we've already responded to (any later message on the campaign) is skipped — the
//     sweep never doubles a human's work.
//   - No AI key configured → {available:false}, drafts simply don't happen. Never a template
//     pretending to have read their words.
//
// Secrets: CRON_SECRET (x-cron-secret) + OPENAI_API_KEY or LOVABLE_API_KEY.
// Deploy: supabase functions deploy inbox-draft --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-cron-secret' };

async function draftReply(input: {
  firstName: string; fromName: string; business: string;
  originalSubject: string; originalBody: string; theirReply: string;
}): Promise<{ subject: string; body: string } | null> {
  const openai = Deno.env.get('OPENAI_API_KEY');
  const lovable = Deno.env.get('LOVABLE_API_KEY');
  if (!openai && !lovable) return null;
  const url = openai ? 'https://api.openai.com/v1/chat/completions' : 'https://ai.gateway.lovable.dev/v1/chat/completions';
  const model = openai ? 'gpt-4o-mini' : 'google/gemini-2.5-flash';
  const system =
    'You draft a reply to a warm prospect who wrote back. Warm, direct, under 120 words, plain text. ' +
    'Answer ONLY what the thread itself supports. For anything you cannot know (prices, dates, availability, specifics), ' +
    'insert a visible placeholder like [YOU FILL: your price] instead of inventing. One clear next step (a question or a proposed time). ' +
    'No hype, no apologies, no "hope this finds you well".';
  const user =
    `The prospect replied to our email — draft the response.\n\n` +
    `Their first name: ${input.firstName || '(unknown)'}\nOur sender: ${input.fromName}${input.business ? ` (${input.business})` : ''}\n\n` +
    `Our original email — subject: ${input.originalSubject}\n"""${input.originalBody.slice(0, 1500)}"""\n\n` +
    `THEIR REPLY:\n"""${input.theirReply.slice(0, 1500)}"""\n\n` +
    `Return strict JSON {"subject": string, "body": string}. Subject: "Re: " + the original subject unless theirs implies better.`;
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
    return { subject: String(parsed.subject).slice(0, 200), body: String(parsed.body).replace(/\\n/g, '\n').slice(0, 4000) };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Unauthorized' }, 401);
  if (!Deno.env.get('OPENAI_API_KEY') && !Deno.env.get('LOVABLE_API_KEY')) {
    return json({ available: false, reason: 'No drafting model configured (OPENAI_API_KEY or LOVABLE_API_KEY).' });
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const windowStart = new Date(Date.now() - 14 * 24 * 3_600_000).toISOString();

  // Recent positive replies, oldest first (answer the longest-waiting human first).
  const { data: replies } = await admin.from('replies')
    .select('id, owner_id, campaign_id, from_address, subject, body_text, received_at')
    .eq('classification', 'positive').not('campaign_id', 'is', null)
    .gte('received_at', windowStart).order('received_at', { ascending: true }).limit(25);

  let drafted = 0, skipped = 0;
  for (const r of (replies ?? []) as { id: string; owner_id: string; campaign_id: string; from_address: string | null; subject: string | null; body_text: string | null; received_at: string }[]) {
    try {
      // Already answered? Any message on the campaign created AFTER their reply (draft or sent —
      // ours either way) means a response exists. Our own drafts make this sweep idempotent.
      const { count: later } = await admin.from('outreach_messages')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', r.campaign_id).gt('created_at', r.received_at);
      if ((later ?? 0) > 0) { skipped++; continue; }

      // The thread: the last message WE sent before their reply.
      const { data: ours } = await admin.from('outreach_messages')
        .select('id, contact_id, subject, body_text, to_address, sequence_step')
        .eq('campaign_id', r.campaign_id).eq('status', 'sent')
        .order('created_at', { ascending: false }).limit(1);
      const prior = (ours ?? [])[0];
      if (!prior?.to_address) { skipped++; continue; }

      let firstName = '';
      if (prior.contact_id) {
        const { data: c } = await admin.from('contacts').select('full_name').eq('id', prior.contact_id).maybeSingle();
        firstName = ((c as { full_name?: string | null } | null)?.full_name ?? '').trim().split(/\s+/)[0] ?? '';
      }
      const { data: os } = await admin.from('outreach_settings')
        .select('from_name, company_name').eq('owner_id', r.owner_id).maybeSingle();

      const draft = await draftReply({
        firstName,
        fromName: ((os as { from_name?: string | null } | null)?.from_name ?? '').trim() || 'me',
        business: ((os as { company_name?: string | null } | null)?.company_name ?? '').trim(),
        originalSubject: prior.subject ?? '',
        originalBody: prior.body_text ?? '',
        theirReply: r.body_text ?? '',
      });
      if (!draft) { skipped++; continue; }

      const { data: newMsg } = await admin.from('outreach_messages').insert({
        owner_id: r.owner_id, campaign_id: r.campaign_id, contact_id: prior.contact_id,
        sequence_step: (prior.sequence_step ?? 0) + 1, subject: draft.subject,
        body_text: draft.body, to_address: prior.to_address, status: 'draft',
      }).select('id').single();
      if (!newMsg) { skipped++; continue; }

      await admin.from('approvals').insert({
        owner_id: r.owner_id, kind: 'send_email', requested_by: 'worker',
        title: `Reply draft → ${r.from_address ?? prior.to_address} (they wrote back)`,
        preview: `THEY SAID: ${(r.body_text ?? '').slice(0, 200)}\n\nDRAFT:\n${draft.subject}\n\n${draft.body}`,
        payload: { message_id: (newMsg as { id: string }).id, campaign_id: r.campaign_id, reply_id: r.id },
      });
      drafted++;
    } catch { skipped++; /* one thread's failure never blocks the rest */ }
  }

  return json({ ok: true, drafted, skipped, considered: (replies ?? []).length });
});
