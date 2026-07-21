// supabase/functions/automation-intake/index.ts
// THE CUSTOM-AUTOMATION INTAKE — public, anon-callable, the exact shape of claim-submit. A prospect
// on their demo types HOW THEY RUN THEIR BUSINESS; we detect which of our REAL automations fit (the
// pure, honest intakeAutomations engine — deliverable-only, gaps not promises), land it as the
// hottest inbound lead the system makes (an opportunity in the operator's feed), and notify the
// operator in-app (mind_events) and out-of-app (webhook). The client supplies only the preview
// id/slug — the owner is resolved server-side from preview_sites.user_id and is never trusted from
// the request.
//
// Deploy: npx supabase functions deploy automation-intake  (JWT-verified like claim-submit — the
// browser's anon invoke carries the anon JWT, so --no-verify-jwt is NOT needed).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { notifyText } from '../_shared/notify.ts';
import { intakeAutomations } from '../../../src/lib/garvis/automation/intake.ts';
import { detectVertical } from '../../../src/lib/garvis/verticals.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// A stable, dependency-free token so a resubmission dedupes but distinct descriptions don't collide.
function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const { previewSiteId, description, email } = (await req.json().catch(() => ({}))) as
      { previewSiteId?: string; description?: string; email?: string };
    const desc = (description ?? '').trim();
    if (!previewSiteId || desc.length < 8) {
      return json({ error: 'previewSiteId and a description (how you run things) are required.' }, 400);
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: site } = await admin.from('preview_sites')
      .select('id, slug, business_name, industry, user_id').eq('id', previewSiteId).single();
    if (!site) return json({ error: 'Preview not found.' }, 404);
    const ownerId = (site as { user_id: string }).user_id;
    const businessName = (site as { business_name: string }).business_name;
    const slug = (site as { slug: string }).slug;
    const industry = (site as { industry?: string | null }).industry ?? '';

    // Anon burst cap (fail-open): at most 5 inbound automation requests per preview per minute.
    const since = new Date(Date.now() - 60_000).toISOString();
    const dedupePrefix = `automation-intake::${previewSiteId}::`;
    const { count: recent, error: rlErr } = await admin.from('opportunities')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', ownerId).like('dedupe_key', `${dedupePrefix}%`).gte('found_at', since);
    if (!rlErr && (recent ?? 0) >= 5) return json({ error: 'Too many requests — try again shortly.' }, 429);

    // THE HONEST DETECTION: grounded signals from their words → deliverable proposals + gaps.
    const cleanEmail = (email ?? '').trim().toLowerCase().slice(0, 200);
    const cleanDesc = desc.slice(0, 2000);
    const vertical = detectVertical(`${industry} ${businessName}`);
    const result = intakeAutomations(cleanDesc, vertical);

    // The operator-facing summary: their words + what auto-mapped + what's bespoke (the gaps) — so
    // the operator can act without opening the site. Never fabricated; every line is grounded.
    const proposalLines = result.proposals.map((p) => `• ${p.title} — ${p.pitch} (${p.monthlyPrice})`);
    const gapLines = result.gaps.map((g) => `• (bespoke) ${g.reason}`);
    const summary = [
      `They wrote: “${cleanDesc}”`,
      cleanEmail ? `Reply-to: ${cleanEmail}` : 'No email left — follow up in-app or on the demo.',
      proposalLines.length ? `Auto-mapped automations:\n${proposalLines.join('\n')}` : 'Nothing auto-mapped — read their note and scope it by hand.',
      gapLines.length ? `Bespoke / not-yet-built:\n${gapLines.join('\n')}` : '',
    ].filter(Boolean).join('\n\n').slice(0, 4000);

    const origin = Deno.env.get('APP_ORIGIN') ?? (req.headers.get('origin') ?? '');
    const sourceUrl = origin ? `${origin}/preview-site/${slug}` : `/preview-site/${slug}`;
    const dedupeKey = `${dedupePrefix}${cleanEmail || shortHash(cleanDesc)}`.slice(0, 200);

    // Land the hot lead in the operator's triage feed. Upsert on (owner_id, dedupe_key) so a prospect
    // refining and resubmitting updates their card instead of piling up duplicates.
    const { error: upErr } = await admin.from('opportunities').upsert({
      owner_id: ownerId,
      title: `Automation request — ${businessName}`,
      summary,
      source_url: sourceUrl,
      kind: 'inbound_automation_request',
      status: 'new',
      dedupe_key: dedupeKey,
      found_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'owner_id,dedupe_key' });
    if (upErr) return json({ error: 'Could not record the request.' }, 500);

    // In-app realtime signal for the operator (mind_events is published to supabase_realtime).
    await admin.from('mind_events').insert({
      owner_id: ownerId, source: 'site', event_type: 'note',
      subject: `Automation request from ${businessName}${cleanEmail ? ` (${cleanEmail})` : ''}`,
      payload: {
        kind: 'inbound_automation_request', preview_site_id: previewSiteId, slug,
        matched: result.matched, proposals: result.proposals.map((p) => p.capabilityId),
      },
    }).then(() => {}, () => {});

    // Out-of-app push to the operator's webhook.
    const { data: owner } = await admin.from('profiles').select('webhook_url').eq('id', ownerId).single();
    await notifyText(
      (owner as { webhook_url?: string } | null)?.webhook_url,
      `⚡ AUTOMATION REQUEST — ${businessName}\n` +
      `"${cleanDesc.slice(0, 400)}"\n` +
      (proposalLines.length ? `${proposalLines.join('\n')}\n` : 'Nothing auto-mapped — scope by hand.\n') +
      (cleanEmail ? `Reply-to: ${cleanEmail}\n` : '') +
      sourceUrl,
    );

    // The PROSPECT sees only deliverable automations (never a not_built promise, never the gaps).
    return json({
      ok: true,
      matched: result.matched,
      proposals: result.proposals.map((p) => ({ title: p.title, pitch: p.pitch, monthlyPrice: p.monthlyPrice })),
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
