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

export async function fetchHuntReadiness(): Promise<Readiness> {
  const [sys, outreach, clock] = await Promise.all([
    fetchSystemStatus().catch(() => null),
    outreachSettings(),
    clockState().then((c) => c.state).catch(() => 'never' as const),
  ]);

  const secretSet = (name: string): boolean => !!sys?.secrets.find((s) => s.name === name)?.set;

  return huntReadiness({
    appOriginSet: secretSet('APP_ORIGIN'),
    placesKeySet: secretSet('GOOGLE_PLACES_API_KEY'),
    resendKeySet: secretSet('RESEND_API_KEY'),
    fromEmail: outreach?.from_email ?? null,
    physicalAddress: outreach?.physical_address ?? null,
    outboundEnabled: !!outreach?.outbound_enabled,
    clockArmed: clock === 'alive',
  });
}
