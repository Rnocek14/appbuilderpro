// supabase/functions/sender-domain/index.ts
// PER-BRAND SENDING DOMAINS via Resend. Registers a client's domain with Resend, hands back the exact
// DNS records to add (SPF/DKIM/DMARC), triggers verification, and reports live status — so a client's
// emails send FROM their own verified domain and land in the inbox instead of spam. Operator-only (the
// caller's JWT must own the row). Nothing here sends — send-email keeps its gates; this only makes a
// from-address deliverable.
//
// Deploy: npx supabase functions deploy sender-domain
// Secrets: RESEND_API_KEY.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { normalizeSenderDomain, parseResendDomain } from '../../../src/lib/garvis/email/senderDomain.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?: 'connect' | 'refresh' | 'verify' | 'remove';
      id?: string; domain?: string; world_id?: string; client_subscription_id?: string;
    };
    const action = body.action ?? 'connect';

    // Operator-only: resolve the caller from their JWT.
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const uid = user.id;

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) return json({ error: 'Email is not connected — set RESEND_API_KEY in Supabase secrets.' }, 400);

    const resend = (path: string, init: RequestInit = {}) =>
      fetch(`https://api.resend.com${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${resendKey}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
      });

    // Load + own-check a stored row (for refresh/verify/remove).
    const loadOwned = async (id: string) => {
      const { data } = await admin.from('sender_domains')
        .select('id, owner_id, domain, provider_domain_id, status').eq('id', id).maybeSingle();
      const row = data as { id: string; owner_id: string; domain: string; provider_domain_id: string | null; status: string } | null;
      if (!row || row.owner_id !== uid) return null;
      return row;
    };

    // ── connect: register the domain with Resend, store the records ──────────
    if (action === 'connect') {
      const domain = normalizeSenderDomain(body.domain);
      if (!domain) return json({ error: 'Enter a real domain (like acme.com).' }, 400);

      // Already tracking it? Refresh instead of creating a duplicate.
      const { data: existing } = await admin.from('sender_domains')
        .select('id, provider_domain_id').eq('owner_id', uid).eq('domain', domain).maybeSingle();

      let providerId = (existing as { provider_domain_id?: string | null } | null)?.provider_domain_id ?? null;
      if (!providerId) {
        const res = await resend('/domains', { method: 'POST', body: JSON.stringify({ name: domain }) });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = (payload as { message?: string; error?: string }).message ?? (payload as { error?: string }).error ?? `Resend ${res.status}`;
          return json({ error: `Couldn’t register ${domain}: ${String(msg).slice(0, 180)}` }, 400);
        }
        const parsed = parseResendDomain(payload);
        providerId = parsed.providerDomainId;
        const nowIso = new Date().toISOString();
        const rowVals = {
          owner_id: uid, domain, provider: 'resend', provider_domain_id: providerId,
          status: parsed.status, records: parsed.records,
          world_id: body.world_id ?? null, client_subscription_id: body.client_subscription_id ?? null,
          last_checked_at: nowIso, updated_at: nowIso,
        };
        const { data: saved } = await admin.from('sender_domains')
          .upsert(rowVals, { onConflict: 'owner_id,domain' }).select('id, domain, status, records, provider_domain_id').maybeSingle();
        return json({ ok: true, domain: saved });
      }
      // Existing provider domain — fall through to a refresh.
      body.id = (existing as { id: string }).id;
    }

    // ── refresh / verify: re-read (or kick) verification, update the row ─────
    if (action === 'connect' || action === 'refresh' || action === 'verify') {
      const id = body.id;
      if (!id) return json({ error: 'Missing domain id.' }, 400);
      const row = await loadOwned(id);
      if (!row || !row.provider_domain_id) return json({ error: 'Domain not found.' }, 404);

      if (action === 'verify') {
        // Kick verification; ignore a non-200 here — the GET below reports the real state.
        await resend(`/domains/${row.provider_domain_id}/verify`, { method: 'POST' }).catch(() => undefined);
      }
      const res = await resend(`/domains/${row.provider_domain_id}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) return json({ error: `Couldn’t check ${row.domain}: Resend ${res.status}` }, 400);
      const parsed = parseResendDomain(payload);
      const nowIso = new Date().toISOString();
      const { data: saved } = await admin.from('sender_domains')
        .update({ status: parsed.status, records: parsed.records, last_checked_at: nowIso, updated_at: nowIso })
        .eq('owner_id', uid).eq('id', id)
        .select('id, domain, status, records, provider_domain_id').maybeSingle();
      return json({ ok: true, domain: saved });
    }

    // ── remove: delete from Resend (best-effort) + our row ──────────────────
    if (action === 'remove') {
      const id = body.id;
      if (!id) return json({ error: 'Missing domain id.' }, 400);
      const row = await loadOwned(id);
      if (!row) return json({ error: 'Domain not found.' }, 404);
      if (row.provider_domain_id) await resend(`/domains/${row.provider_domain_id}`, { method: 'DELETE' }).catch(() => undefined);
      await admin.from('sender_domains').delete().eq('owner_id', uid).eq('id', id);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Sender-domain request failed.' }, 500);
  }
});
