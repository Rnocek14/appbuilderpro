// src/lib/garvis/readinessRun.ts
// Impure half of the operator console: gather the real setup state for computeReadiness. Every read
// is owner-scoped; nothing is inferred that the data doesn't show. Connections (docusign, mls) come
// from the same sanitized status the Settings hub uses — never a token.

import { supabase } from '../supabase';
import { clockState } from './heartbeatStatus';
import { getBrandKit } from './artifacts';
import type { ReadinessState } from './readiness';

export async function loadReadiness(): Promise<ReadinessState> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');

  const [clock, worlds, settings, contacts, conns] = await Promise.all([
    clockState().catch(() => ({ state: 'never' as const })),
    // The primary world (most recently touched) stands in for "her business" in a single-client setup.
    supabase.from('knowledge_worlds').select('id').order('updated_at', { ascending: false }).limit(1),
    supabase.from('outreach_settings').select('from_email, physical_address, outbound_enabled').eq('owner_id', uid).maybeSingle(),
    supabase.from('contacts').select('id', { count: 'exact', head: true }),
    supabase.functions.invoke<{ connections?: { provider: string; connected: boolean }[] }>('connections', { body: { action: 'list' } })
      .then((r) => r.data?.connections ?? []).catch(() => [] as { provider: string; connected: boolean }[]),
  ]);

  const primaryWorldId = (worlds.data ?? [])[0]?.id as string | undefined;
  const brand = primaryWorldId ? await getBrandKit(primaryWorldId).catch(() => null) : null;
  const st = settings.data as { from_email?: string | null; physical_address?: string | null; outbound_enabled?: boolean } | null;
  const connected = (p: string) => conns.some((c) => c.provider === p && c.connected);

  return {
    clock: clock.state,
    worldCount: (worlds.data ?? []).length,
    brandPresent: !!brand,
    brandHasCompliance: !!brand?.compliance_line?.trim(),
    brandHasLook: !!(brand?.logo_url || (brand?.palette && brand.palette.length > 0)),
    emailFrom: !!st?.from_email?.trim(),
    emailAddress: !!st?.physical_address?.trim(),
    emailEnabled: !!st?.outbound_enabled,
    contactsCount: contacts.count ?? 0,
    docusignConnected: connected('docusign'),
    mlsConnected: connected('mls_reso'),
  };
}
