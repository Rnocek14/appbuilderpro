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
import { notifyText } from '../_shared/notify.ts';

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
  // Header only (deep scan): the ?secret= query fallback leaked the shared secret into proxy/edge
  // access logs and Referer headers. The inbound provider is configured to send the header.
  const provided = req.headers.get('x-inbound-secret');
  // Constant-time compare (same discipline as resend-webhook) — a plain !== leaks timing.
  const constantTimeEqual = (a: string, b: string): boolean => {
    const ab = new TextEncoder().encode(a), bb = new TextEncoder().encode(b);
    if (ab.length !== bb.length) return false;
    let diff = 0;
    for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
    return diff === 0;
  };
  if (!secret || !provided || !constantTimeEqual(provided, secret)) return json({ error: 'Unauthorized' }, 401);

  const payload = (await req.json().catch(() => ({}))) as {
    from?: string; to?: string | string[]; subject?: string; text?: string; body?: string;
    in_reply_to?: string; references?: string; provider_message_id?: string; message_id?: string;
  };
  const from = (payload.from ?? '').toLowerCase().trim();
  const subject = payload.subject ?? '';
  const text = (payload.text ?? payload.body ?? '').trim();

  // "Name <addr>" → { name, address } — the from field arrives in either shape.
  const parseAddr = (raw: string): { name: string | null; address: string } => {
    const m = /^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/.exec(raw);
    if (m) return { name: m[1].trim() || null, address: m[2].toLowerCase().trim() };
    return { name: null, address: raw.toLowerCase().trim() };
  };

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Correlate to the original message: by provider id (in-reply-to/references) first, else by recipient.
  const inReplyTo = payload.provider_message_id ?? payload.in_reply_to ?? payload.references ?? '';
  let msg: { id: string; owner_id: string; campaign_id: string | null; contact_id?: string | null } | null = null;
  if (inReplyTo) {
    const { data } = await admin.from('outreach_messages')
      .select('id, owner_id, campaign_id, contact_id').eq('provider_message_id', inReplyTo.replace(/[<>]/g, '')).maybeSingle();
    msg = data ?? null;
  }
  if (!msg && from) {
    // Fallback correlation must only match messages that actually WENT OUT — a reply can't
    // belong to a never-sent draft.
    const { data } = await admin.from('outreach_messages')
      .select('id, owner_id, campaign_id, contact_id').eq('to_address', from).not('sent_at', 'is', null)
      .order('sent_at', { ascending: false }).limit(1).maybeSingle();
    msg = data ?? null;
  }
  if (!msg) {
    // FORWARD-IN MAILBOX (Tier 2): mail that matches no outreach thread used to be silently
    // discarded. If it was addressed to an owner's forward-in alias (in-xxxxxxxxxx@…), it lands in
    // their inbox — the Queue's Messages lane — and surfaces in the waking moment. Mail to no known
    // alias stays honestly ignored: a stray address must not land in anyone's inbox.
    const toRaw = Array.isArray(payload.to) ? payload.to : payload.to ? [payload.to] : [];
    const aliases = toRaw.map((t) => parseAddr(String(t)).address).map((a) => a.split('@')[0]).filter((l) => /^in-[a-z0-9]{6,}$/.test(l));
    if (aliases.length === 0) return json({ ok: true, note: 'no matching message or alias; ignored' });
    const { data: prof } = await admin.from('profiles')
      .select('id, webhook_url').eq('inbound_alias', aliases[0]).maybeSingle();
    if (!prof) return json({ ok: true, note: 'alias unknown; ignored' });
    const ownerId = (prof as { id: string }).id;
    const sender = parseAddr(payload.from ?? '');
    await admin.from('inbound_mail').insert({
      owner_id: ownerId,
      from_address: sender.address, from_name: sender.name,
      to_address: toRaw[0] ? parseAddr(String(toRaw[0])).address : null,
      subject: subject.slice(0, 300),
      body_text: text.slice(0, 16000),
      message_id: (payload.message_id ?? payload.provider_message_id ?? '').replace(/[<>]/g, '') || null,
    });
    await admin.from('mind_events').insert({
      owner_id: ownerId, event_type: 'note', source: 'inbound-mail',
      subject: `Mail from ${sender.name || sender.address}: ${subject.slice(0, 120) || '(no subject)'}`,
      payload: { from: sender.address },
    }).then(() => {}, () => {});
    await notifyText(
      (prof as { webhook_url?: string } | null)?.webhook_url,
      `📥 Mail from ${sender.name || sender.address} — "${subject.slice(0, 120)}"\nIt's in your Queue → Messages.`,
    ).catch(() => {});
    return json({ ok: true, note: 'landed in the inbox' });
  }

  // Strip QUOTED content before any intent detection: the original outreach footer says
  // 'reply "unsubscribe"', so a quoted copy of it in an interested reply must never read as
  // an unsubscribe. Keep only the prospect's own words.
  const ownWords = text
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith('>'))
    .join('\n')
    .split(/\nOn .{0,120}wrote:\s*$/m)[0]
    .split(/\n-- ?\n/)[0]
    .trim();
  const classification = (await classifyAI(subject, ownWords)) ?? classifyHeuristic(ownWords);

  await admin.from('replies').insert({
    owner_id: msg.owner_id, message_id: msg.id, campaign_id: msg.campaign_id,
    from_address: from, subject, body_text: text.slice(0, 8000), classification,
  });
  await admin.from('outreach_messages').update({ status: 'replied' }).eq('id', msg.id);
  // Feedback substrate (app_0081): a reply is the strongest engagement signal — record it where
  // the analytics lenses can rank it alongside opens/clicks.
  await admin.from('outreach_events').insert({
    owner_id: msg.owner_id, message_id: msg.id, campaign_id: msg.campaign_id,
    contact_id: msg.contact_id ?? null, kind: 'replied', meta: { classification },
  });

  // Explicit unsubscribe intent → suppression + contact status, so this address can NEVER be
  // emailed again. This was the missing ingestion path: the 'unsubscribe' suppression reason
  // existed in the schema but nothing ever wrote it.
  // Opt-out intent is read from BOTH the subject and the body (deep scan P0): the default
  // List-Unsubscribe mailto carries subject "unsubscribe" with the address in the body
  // ("Please remove <addr>"), so a body-only check missed real unsubscribes entirely.
  const outRe = /\b(unsubscribe|remove me|remove this|please remove|stop emailing( me)?|take me off|do not (contact|email)|opt[ -]?out)\b/i;
  const wantsOut = outRe.test(ownWords) || outRe.test(subject ?? '');
  if (wantsOut && from) {
    await admin.from('suppression').upsert(
      { owner_id: msg.owner_id, email: from, domain: null, reason: 'unsubscribe' }, // per-address; never silences the whole domain
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

  // Push a POSITIVE reply to the owner — a warm reply cools fast; it must reach them off-app.
  if (classification === 'positive' && !wantsOut) {
    try {
      const { data: owner } = await admin.from('profiles').select('webhook_url').eq('id', msg.owner_id).single();
      await notifyText(
        (owner as { webhook_url?: string } | null)?.webhook_url,
        `💬 WARM REPLY — ${from}\n"${subject.slice(0, 120)}"\n${ownWords.slice(0, 300)}`,
      );
    } catch { /* best-effort */ }
  }

  return json({ ok: true, classification });
});
