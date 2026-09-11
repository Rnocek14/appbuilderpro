// src/lib/garvis/huntReadinessRun.ts
// Impure half of the hunt/send readiness check: gather the real inputs (secret presence from
// system-control, outreach settings from the DB, the clock state) and run them through the pure
// core. Fail-soft — a probe that can't answer contributes a conservative "not set", so the light
// under-promises rather than claiming ready when it isn't.

import { supabase } from '../supabase';
import { fetchSystemStatus } from './systemControl';
import { clockState } from './heartbeatStatus';
import { huntReadiness, type Readiness } from './huntReadiness';

interface OutreachRow { from_email?: string | null; physical_address?: string | null; outbound_enabled?: boolean }

async function outreachSettings(): Promise<OutreachRow | null> {
  try {
    const { data } = await supabase.from('outreach_settings')
      .select('from_email, physical_address, outbound_enabled').maybeSingle();
    return (data as OutreachRow | null) ?? null;
  } catch { return null; }
}

interface BillingRow { website_payment_link?: string | null; automation_payment_link?: string | null }

async function billingLinks(): Promise<BillingRow | null> {
  try {
    const { data } = await supabase.from('agency_billing_settings')
      .select('website_payment_link, automation_payment_link').maybeSingle();
    return (data as BillingRow | null) ?? null;
  } catch { return null; }
}

async function huntOrderActive(): Promise<boolean> {
  try {
    const { data } = await supabase.from('standing_orders').select('id')
      .eq('kind', 'client_hunt').eq('status', 'active').limit(1);
    return !!data?.length;
  } catch { return false; }
}

async function webhookSet(): Promise<boolean> {
  try {
    const { data } = await supabase.from('profiles').select('webhook_url').maybeSingle();
    return !!(data as { webhook_url?: string | null } | null)?.webhook_url;
  } catch { return false; }
}

export async function fetchHuntReadiness(): Promise<Readiness> {
  const [sys, outreach, clock, billing, hunt, webhook] = await Promise.all([
    fetchSystemStatus().catch(() => null),
    outreachSettings(),
    clockState().then((c) => c.state).catch(() => 'never' as const),
    billingLinks(),
    huntOrderActive(),
    webhookSet(),
  ]);

  const secretSet = (name: string): boolean => !!sys?.secrets.find((s) => s.name === name)?.set;
  const isUrl = (v: string | null | undefined) => /^https?:\/\/\S+$/i.test((v ?? '').trim());

  return huntReadiness({
    appOriginSet: secretSet('APP_ORIGIN'),
    placesKeySet: secretSet('GOOGLE_PLACES_API_KEY'),
    resendKeySet: secretSet('RESEND_API_KEY'),
    fromEmail: outreach?.from_email ?? null,
    physicalAddress: outreach?.physical_address ?? null,
    outboundEnabled: !!outreach?.outbound_enabled,
    clockArmed: clock === 'alive',
    huntOrderActive: hunt,
    netlifyTokenSet: secretSet('NETLIFY_AUTH_TOKEN'),
    stripeWebhookSet: secretSet('STRIPE_WEBHOOK_SECRET'),
    websiteLinkSet: isUrl(billing?.website_payment_link),
    carePlanLinkSet: isUrl(billing?.automation_payment_link),
    // The brief reaches a webhook when set, else the owner's own inbox via their from_email.
    notifyChannel: webhook || !!(outreach?.from_email && outreach.from_email.trim()),
  });
}
