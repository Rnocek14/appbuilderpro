// supabase/functions/lob-verify/index.ts
// The VERIFICATION RAIL (SW10.2): run Lob US address verifications over a territory's
// unverified recipients and write each answer honestly — 'verified' or 'undeliverable' only for
// answers Lob actually gave; an error or an unrecognized reply leaves the row 'unverified',
// never guessed. Throttled, and HARD-CAPPED per invocation (VERIFY_RUN_CAP) so the button in the
// farm UI can never become un-ceilinged third-party spend.
//
// Fail-closed: requires outreach_settings.mail_enabled (the mail kill switch, off by default)
// and a LOB_API_KEY secret — both absences are NAMED, actionable errors, never silent degrades.
//
// ONE-TIME SETUP:
//   supabase functions deploy lob-verify --project-ref <ref>
//   supabase secrets set LOB_API_KEY=<your Lob secret key>

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/ai.ts';
import { mapDeliverability, VERIFY_RUN_CAP, VERIFY_THROTTLE_MS } from '../_shared/lobCore.ts';

interface RecipientRow {
  id: string;
  situs_address1: string; situs_city: string; situs_state: string; situs_zip: string;
  mail_address1: string | null; mail_city: string | null; mail_state: string | null; mail_zip: string | null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { territory_id } = (await req.json().catch(() => ({}))) as { territory_id?: string };
    if (!territory_id) return json({ error: 'territory_id is required.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // The mail kill switch gates SPEND too — a verification lookup is real third-party money.
    const { data: settings } = await admin.from('outreach_settings')
      .select('mail_enabled').eq('owner_id', user.id).maybeSingle();
    if (!settings?.mail_enabled) {
      return json({ error: 'Direct mail is disabled — turn on Mail in Settings → Outreach before verifying addresses.' }, 422);
    }
    const apiKey = Deno.env.get('LOB_API_KEY');
    if (!apiKey) return json({ error: 'Lob is not connected — set the LOB_API_KEY secret to verify addresses.' }, 422);

    // Territory ownership, then the unverified slice — HARD-CAPPED per run.
    const { data: terr } = await admin.from('farm_territories')
      .select('id, owner_id').eq('id', territory_id).maybeSingle();
    if (!terr || terr.owner_id !== user.id) return json({ error: 'Territory not found.' }, 404);

    const { data: rows } = await admin.from('mail_recipients')
      .select('id, situs_address1, situs_city, situs_state, situs_zip, mail_address1, mail_city, mail_state, mail_zip')
      .eq('territory_id', territory_id).eq('owner_id', user.id)
      .eq('verify_status', 'unverified')
      .order('created_at', { ascending: true })
      .limit(VERIFY_RUN_CAP);
    const batch = (rows ?? []) as RecipientRow[];
    if (!batch.length) return json({ ok: true, verified: 0, undeliverable: 0, errors: 0, remaining: 0, message: 'Nothing unverified in this area.' });

    const basic = 'Basic ' + btoa(`${apiKey}:`);
    let verified = 0; let undeliverable = 0; let errors = 0;

    for (const r of batch) {
      // Mail goes to the owner's mailing address when the source gave one — verify THAT.
      const a = r.mail_address1
        ? { line: r.mail_address1, city: r.mail_city ?? '', state: r.mail_state ?? '', zip: r.mail_zip ?? '' }
        : { line: r.situs_address1, city: r.situs_city, state: r.situs_state, zip: r.situs_zip };
      let mapping: { status: string; detail: string | null } = { status: 'unverified', detail: null };
      try {
        const resp = await fetch('https://api.lob.com/v1/us_verifications', {
          method: 'POST',
          headers: { Authorization: basic, 'Content-Type': 'application/json' },
          body: JSON.stringify({ primary_line: a.line, city: a.city, state: a.state, zip_code: a.zip }),
        });
        if (resp.ok) {
          const body = await resp.json() as { deliverability?: string };
          mapping = mapDeliverability(body.deliverability);
        } else {
          errors++; // a failed lookup leaves the row 'unverified' — we looked and could not tell
        }
      } catch {
        errors++;
      }
      if (mapping.status === 'verified' || mapping.status === 'undeliverable') {
        if (mapping.status === 'verified') verified++; else undeliverable++;
        await admin.from('mail_recipients').update({
          verify_status: mapping.status, verify_detail: mapping.detail, verified_at: new Date().toISOString(),
        }).eq('id', r.id).then(() => {}, () => {});
      }
      await sleep(VERIFY_THROTTLE_MS);
    }

    const { count: remaining } = await admin.from('mail_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('territory_id', territory_id).eq('verify_status', 'unverified');

    return json({ ok: true, verified, undeliverable, errors, remaining: remaining ?? 0 });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
