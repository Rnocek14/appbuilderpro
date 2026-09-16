// supabase/functions/_shared/leadIntake.ts
// THE ONE LEAD-CAPTURE RAIL — shared by every endpoint a website form can post to (site-events
// for world-bound sites, claim-submit for demo/published client sites). Extracting it is what
// makes the pitch's boldest sentence ("captured, instantly acknowledged, chased when it goes
// quiet") structurally true on every site we generate, not just the world-bound ones: one
// implementation, so a new intake endpoint cannot quietly get a weaker rail.
//
// captureLead does, in order:
//   1. link-or-create the contact — an EXISTING contact is never modified (email_status,
//      including 'unsubscribed', is sacred; suppression survives every intake path).
//   2. insert the lead row (world_id nullable since app_0138; preview_site_id carries the
//      demo-site attribution the world path doesn't need).
//   3. drop a mind_event so the owner's waking moment surfaces the raised hand.
//   4. attempt the instant first touch (the opt-in standing rule) — through THE ONE SEND PATH,
//      every gate re-verified server-side. Fail-soft: any miss returns touched:false and the
//      capture stands.
// Owner webhook notification stays with the CALLERS — each endpoint words its own bell.

import { hashPayload } from './payloadHash.ts';
import { attributionFields, parseSrc } from './reAttributionCore.ts';

export interface LeadCaptureInput {
  ownerId: string;
  worldId: string | null;          // null ⇒ demo/published client site (no knowledge world)
  channelId: string | null;
  previewSiteId: string | null;
  name: string | null;
  /** Either this or `phone` must be real. A realtor's highest-intent inquiry is a phone call, and
   *  leads.email stopped being not-null in app_0141 precisely so one can be recorded. */
  email: string;
  phone: string | null;
  message: string | null;
  source: string;
  /** The ?src= tag as it arrived. A tag we minted resolves to the post that caused this; anything
   *  else is kept verbatim as the source and attributed to nobody (reAttributionCore). */
  srcTag?: string | null;
  /** What the prospect SAID influenced them, verbatim — the only strong evidence there is. */
  statedInfluence?: string | null;
  /** {{business}} fill for the first-touch template. The world path leaves it unset (the
   *  operator's own company from settings); the demo path passes the SITE's business name so a
   *  client's customer is acknowledged in the right voice. */
  businessName?: string | null;
  mindSubject?: string;
}

export interface LeadCaptureResult { leadId: string | null; contactId: string | null; touched: boolean }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// deno-lint-ignore no-explicit-any
export async function captureLead(admin: any, input: LeadCaptureInput): Promise<LeadCaptureResult> {
  const email = (input.email ?? '').trim().toLowerCase();
  const phone = (input.phone ?? '').trim();
  const hasEmail = EMAIL_RE.test(email);
  // A phone-only inquiry is a real inquiry (app_0141). What we cannot do is record one with no way
  // to answer it at all.
  if (!hasEmail && !phone) return { leadId: null, contactId: null, touched: false };

  let contactId: string | null = null;
  if (hasEmail) {
    const { data: existing } = await admin.from('contacts')
      .select('id').eq('owner_id', input.ownerId).eq('email', email).maybeSingle();
    if (existing) {
      contactId = existing.id as string;    // linked as-is; status untouched (suppression sacred)
    } else {
      const { data: c } = await admin.from('contacts')
        .insert({ owner_id: input.ownerId, email, full_name: input.name, email_status: 'unknown', is_primary: false })
        .select('id').maybeSingle();
      contactId = (c?.id as string | undefined) ?? null;
    }
  } else {
    // No email means no identity key this table enforces (uq_contacts_owner_email is on the email),
    // so match on the phone rather than mint a duplicate person on every call.
    const { data: existing } = await admin.from('contacts')
      .select('id').eq('owner_id', input.ownerId).eq('phone', phone).maybeSingle();
    if (existing) {
      contactId = existing.id as string;
    } else {
      const { data: c } = await admin.from('contacts')
        .insert({ owner_id: input.ownerId, phone, full_name: input.name, email_status: 'unknown', is_primary: false })
        .select('id').maybeSingle();
      contactId = (c?.id as string | undefined) ?? null;
    }
  }

  // WHICH POST CAUSED THIS. A tag we minted is looked UP — an id that matches nothing we own is not
  // evidence, and writes no attribution at all (reAttributionCore's rule). Everything else keeps the
  // raw source string and is attributed to nobody, which is the honest answer for most inquiries.
  const parsed = parseSrc(input.srcTag ?? input.source);
  let resolvedPostId: string | null = null;
  let resolvedCampaignId: string | null = null;
  if (parsed.kind === 'post' && parsed.id) {
    const { data: post } = await admin.from('social_posts')
      .select('id, campaign_id').eq('id', parsed.id).eq('owner_id', input.ownerId).maybeSingle();
    if (post) {
      resolvedPostId = post.id as string;
      resolvedCampaignId = (post.campaign_id as string | null) ?? null;
    }
  } else if (parsed.kind === 'campaign' && parsed.id) {
    const { data: camp } = await admin.from('marketing_campaigns')
      .select('id').eq('id', parsed.id).eq('owner_id', input.ownerId).maybeSingle();
    if (camp) resolvedCampaignId = camp.id as string;
  }
  // A returning person keeps the source that FIRST brought them.
  let existingFirstSource: string | null = null;
  if (contactId) {
    const { data: prior } = await admin.from('leads')
      .select('first_source').eq('owner_id', input.ownerId).eq('contact_id', contactId)
      .not('first_source', 'is', null).order('created_at', { ascending: true }).limit(1).maybeSingle();
    existingFirstSource = (prior?.first_source as string | null) ?? null;
  }
  const attribution = attributionFields({
    src: input.srcTag ?? input.source,
    statedInfluence: input.statedInfluence ?? null,
    resolvedPostId, resolvedCampaignId, existingFirstSource,
  });
  // A community only comes along with a campaign that has one — never inferred from anything else.
  let communityId: string | null = null;
  if (resolvedCampaignId) {
    const { data: camp } = await admin.from('marketing_campaigns')
      .select('community_id').eq('id', resolvedCampaignId).maybeSingle();
    communityId = (camp?.community_id as string | null) ?? null;
  }

  const { data: leadRow, error: leadErr } = await admin.from('leads').insert({
    owner_id: input.ownerId, world_id: input.worldId, channel_id: input.channelId,
    preview_site_id: input.previewSiteId, contact_id: contactId,
    name: input.name, email: hasEmail ? email : null, phone: phone || null, message: input.message,
    source: input.source,
    ...attribution,
    ...(communityId ? { community_id: communityId } : {}),
  }).select('id').single();
  if (leadErr || !leadRow) return { leadId: null, contactId, touched: false };
  const leadId = leadRow.id as string;

  // The waking moment's signal: a warm human raised their hand.
  await admin.from('mind_events').insert({
    owner_id: input.ownerId, event_type: 'note', source: 'site',
    subject: input.mindSubject ?? `Lead from the website: ${input.name || (hasEmail ? email : phone)}`,
    payload: {
      world_id: input.worldId, preview_site_id: input.previewSiteId, kind: 'lead',
      email_domain: hasEmail ? (email.split('@')[1] ?? '') : '',
      post_id: resolvedPostId, campaign_id: resolvedCampaignId,
    },
  }).then(() => {}, () => {});

  // SPEED-TO-LEAD: the instant first touch (standing rule, opt-in, app_0044). Answering within
  // minutes is the highest-evidence conversion lever there is — and the send STILL flows through
  // the one send path with every gate re-verified (suppression fail-closed, kill switch, daily
  // cap, double-send CAS).
  // There is no instant EMAIL touch for someone who left a phone number. The honest acknowledgment
  // for a call is a person calling back, not a message to an address we do not have.
  const touched = hasEmail
    ? await maybeInstantFirstTouch(admin, input.ownerId,
      { id: leadId, email, name: input.name }, contactId, input.businessName ?? null)
    : false;

  return { leadId, contactId, touched };
}

// ---------------------------------------------------------------------------
// SPEED-TO-LEAD — the instant first touch (Garvis's first STANDING RULE).
// ---------------------------------------------------------------------------
// The owner pre-authorizes exactly ONE narrow action class: a template acknowledgment to a
// brand-new inbound lead, in their own words ({{first_name}}/{{business}} fills — no AI invention
// at 11pm). The send is a normal approvals row (requested_by 'garvis-auto', decided_via
// 'standing_rule') executed through THE ONE SEND PATH (send-email, x-worker-secret entry), so
// every gate re-runs server-side: fail-closed suppression, kill switch, CAN-SPAM address, daily
// cap + warmup, double-send CAS — and the ledger + mind_event land like any human-clicked send.
// Fail-soft by design: any miss (feature off, no secret, active thread, gate block) returns false
// and the lead flow continues untouched.

const DEFAULT_FT_SUBJECT = 'Got your message — I’ll reply personally shortly';
const DEFAULT_FT_BODY =
  `Hi {{first_name}},\n\nThanks for reaching out to {{business}} — your message just landed and I wanted you to hear back right away.\n\nI’ll read it properly and reply personally within a few hours. If it’s time-sensitive, just reply to this email and it goes straight to me.\n\nTalk soon`;

// deno-lint-ignore no-explicit-any
async function maybeInstantFirstTouch(admin: any, ownerId: string, lead: { id: string; email: string; name: string | null }, contactId: string | null, businessName: string | null): Promise<boolean> {
  try {
    const workerSecret = Deno.env.get('WORKER_SECRET');
    if (!workerSecret || !contactId) return false;

    // The standing rule + the same floor every send needs (send-email re-verifies all of it).
    const { data: s } = await admin.from('outreach_settings')
      .select('auto_first_touch, outbound_enabled, from_email, physical_address, company_name, from_name, first_touch_subject, first_touch_body')
      .eq('owner_id', ownerId).maybeSingle();
    if (!s?.auto_first_touch || !s.outbound_enabled || !s.from_email || !s.physical_address?.trim()) return false;

    // Never barge into an active conversation: any message SENT to this contact in the last
    // 7 days means a human thread exists — stay out of it.
    const since = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString();
    const { count: recent } = await admin.from('outreach_messages')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', ownerId).eq('contact_id', contactId).eq('status', 'sent').gte('sent_at', since);
    if ((recent ?? 0) > 0) return false;

    // The owner's template, filled deterministically — never generated. {{business}} prefers the
    // capturing site's business (a client's customer hears the CLIENT's name, not the agency's).
    const first = (lead.name ?? '').trim().split(/\s+/)[0] || 'there';
    const biz = (businessName ?? '').trim() || (s.company_name ?? '').trim() || (s.from_name ?? '').trim() || 'us';
    const fill = (t: string) => t.replaceAll('{{first_name}}', first).replaceAll('{{business}}', biz);
    const subject = fill((s.first_touch_subject ?? '').trim() || DEFAULT_FT_SUBJECT).slice(0, 200);
    const bodyText = fill((s.first_touch_body ?? '').trim() || DEFAULT_FT_BODY).slice(0, 4000);

    // campaign → message → standing-rule approval (the normal spine rows, honestly labeled).
    const { data: camp } = await admin.from('outreach_campaigns').insert({
      owner_id: ownerId, contact_id: contactId, kind: 'auto_first_touch', state: 'pending_approval',
    }).select('id').single();
    if (!camp) return false;
    const { data: msg } = await admin.from('outreach_messages').insert({
      owner_id: ownerId, campaign_id: camp.id, contact_id: contactId,
      sequence_step: 0, subject, body_text: bodyText, to_address: lead.email, status: 'draft',
    }).select('id').single();
    if (!msg) return false;
    const apPayload = { message_id: msg.id, standing_rule: 'auto_first_touch', lead_id: lead.id };
    const { data: approval } = await admin.from('approvals').insert({
      owner_id: ownerId, kind: 'send_email', status: 'approved',
      requested_by: 'garvis-auto', decided_via: 'standing_rule',
      decided_at: new Date().toISOString(),
      title: `Instant first touch → ${lead.email}`,
      preview: `${subject}\n\n${bodyText.slice(0, 400)}`,
      payload: apPayload, payload_hash: await hashPayload(apPayload),
    }).select('id').single();
    if (!approval) return false;

    // THE ONE SEND PATH — every gate re-runs there; a block is an honest skipped ledger row.
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-worker-secret': workerSecret,
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ approval_id: approval.id }),
    });
    const out = (await res.json().catch(() => ({}))) as { ok?: boolean };
    if (!out?.ok) return false;

    // Stamp the fact on the lead — "answered instantly" is a real timestamp, never a guess.
    await admin.from('leads').update({ first_touch_at: new Date().toISOString() }).eq('id', lead.id);
    return true;
  } catch {
    return false; // the first touch must never break lead capture
  }
}
