// supabase/functions/resend-inbound/index.ts
// Inbound reply handler. When a prospect replies, this records the reply, AI-classifies it
// positive/negative/neutral, stops the sequence, and flips the campaign to "replied" (or won/lost)
// so no follow-up ever goes to someone who already answered. Correlates by the in-reply-to /
// references headers (the provider message id) or falls back to the from-address.
//
// Auth: a shared inbound secret in the URL/header (Resend inbound / an email-forwarding webhook can't
// send a Supabase JWT). Deploy --no-verify-jwt. Secret: INBOUND_SECRET (+ OPENAI_API_KEY/LOVABLE_API_KEY
// optional for classification; without a key it stores the reply unclassified and still stops the sequence).

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-inbound-secret' };

function classifyHeuristic(text: string): 'positive' | 'negative' | 'neutral' {
  const t = text.toLowerCase();
  if (/\b(unsubscribe|remove me|stop|not interested|no thanks|do not contact)\b/.test(t)) return 'negative';
  if (/\b(interested|yes|sure|sounds good|let'?s talk|call me|how much|pricing|tell me more|book|schedule)\b/.test(t)) return 'positive';
  return 'neutral';
}

async function classifyAI(subject: string, body: string): Promise<'positive' | 'negative' | 'neutral' | null> {
  const openai = Deno.env.get('OPENAI_API_KEY');
  const lovable = Deno.env.get('LOVABLE_API_KEY');
  if (!openai && !lovable) return null;
  const url = openai ? 'https://api.openai.com/v1/chat/completions' : 'https://ai.gateway.lovable.dev/v1/chat/completions';
  const model = openai ? 'gpt-4o-mini' : 'google/gemini-2.5-flash';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${openai ?? lovable}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'Classify the reply to a cold outreach email as exactly one word: positive, negative, or neutral. positive = interested/wants to talk. negative = not interested/unsubscribe/hostile. neutral = auto-reply/ooo/unclear.' },
          { role: 'user', content: `SUBJECT: ${subject}\n\nBODY:\n${body.slice(0, 2000)}` },
        ],
        temperature: 0,
        max_tokens: 4,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const word = (data.choices?.[0]?.message?.content ?? '').toLowerCase().trim();
    return word.includes('positive') ? 'positive' : word.includes('negative') ? 'negative' : 'neutral';
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const secret = Deno.env.get('INBOUND_SECRET');
  const provided = req.headers.get('x-inbound-secret') ?? new URL(req.url).searchParams.get('secret');
  if (!secret || provided !== secret) return json({ error: 'Unauthorized' }, 401);

  const payload = (await req.json().catch(() => ({}))) as {
    from?: string; subject?: string; text?: string; body?: string;
    in_reply_to?: string; references?: string; provider_message_id?: string;
  };
  const from = (payload.from ?? '').toLowerCase().trim();
  const subject = payload.subject ?? '';
  const text = (payload.text ?? payload.body ?? '').trim();

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Correlate to the original message: by provider id (in-reply-to/references) first, else by recipient.
  const inReplyTo = payload.provider_message_id ?? payload.in_reply_to ?? payload.references ?? '';
  let msg: { id: string; owner_id: string; campaign_id: string | null } | null = null;
  if (inReplyTo) {
    const { data } = await admin.from('outreach_messages')
      .select('id, owner_id, campaign_id').eq('provider_message_id', inReplyTo.replace(/[<>]/g, '')).maybeSingle();
    msg = data ?? null;
  }
  if (!msg && from) {
    // Fallback correlation must only match messages that actually WENT OUT — a reply can't
    // belong to a never-sent draft.
    const { data } = await admin.from('outreach_messages')
      .select('id, owner_id, campaign_id').eq('to_address', from).not('sent_at', 'is', null)
      .order('sent_at', { ascending: false }).limit(1).maybeSingle();
    msg = data ?? null;
  }
  if (!msg) return json({ ok: true, note: 'no matching message; reply ignored' });

  const classification = (await classifyAI(subject, text)) ?? classifyHeuristic(text);

  await admin.from('replies').insert({
    owner_id: msg.owner_id, message_id: msg.id, campaign_id: msg.campaign_id,
    from_address: from, subject, body_text: text.slice(0, 8000), classification,
  });
  await admin.from('outreach_messages').update({ status: 'replied' }).eq('id', msg.id);

  // Explicit unsubscribe intent → suppression + contact status, so this address can NEVER be
  // emailed again. This was the missing ingestion path: the 'unsubscribe' suppression reason
  // existed in the schema but nothing ever wrote it.
  const wantsOut = /\b(unsubscribe|remove me|stop emailing( me)?|take me off|do not (contact|email))\b/i.test(text);
  if (wantsOut && from) {
    await admin.from('suppression').upsert(
      { owner_id: msg.owner_id, email: from, domain: from.split('@')[1] ?? null, reason: 'unsubscribe' },
      { onConflict: 'owner_id,email' },
    );
    await admin.from('contacts').update({ email_status: 'unsubscribed' }).eq('owner_id', msg.owner_id).eq('email', from);
    await admin.from('execution_runs').insert({
      owner_id: msg.owner_id, connector: 'resend', action: 'inbound_unsubscribe',
      request: { message_id: msg.id }, response: { email: from }, status: 'ok',
    });
  }

  if (msg.campaign_id) {
    const state = wantsOut ? 'unsubscribed' : classification === 'negative' ? 'lost' : 'replied';
    await admin.from('outreach_campaigns').update({ state, sequence_stopped: true }).eq('id', msg.campaign_id);
  }
  await admin.from('mind_events').insert({
    owner_id: msg.owner_id, source: 'execution', event_type: 'reply_received',
    subject: `${classification} reply from ${from}: ${subject.slice(0, 100)}`,
    payload: { message_id: msg.id, campaign_id: msg.campaign_id, classification },
  }).then(() => {}, () => {});

  return json({ ok: true, classification });
});
