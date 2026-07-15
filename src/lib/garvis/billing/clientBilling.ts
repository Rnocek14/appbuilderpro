// src/lib/garvis/billing/clientBilling.ts
// Client data-access for the operator's own client-billing book (app_0077). Owner-scoped; best-effort
// reads return null/[] so the UI degrades to empty before the migration is applied.

import { supabase } from '../../supabase';
import type { TierId, Cadence } from './clientTiers';

export interface BillingSettings { website_payment_link: string | null; automation_payment_link: string | null }
export interface ClientSubRow {
  id: string; business_name: string; email: string | null; tier: TierId; cadence: Cadence;
  price_cents: number; status: 'pending' | 'active' | 'canceled'; notes: string | null;
  created_at: string; activated_at: string | null;
}

async function uid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function getBillingSettings(): Promise<BillingSettings> {
  const u = await uid(); if (!u) return { website_payment_link: null, automation_payment_link: null };
  const { data } = await supabase.from('agency_billing_settings')
    .select('website_payment_link,automation_payment_link').eq('owner_id', u).maybeSingle();
  return (data as BillingSettings) ?? { website_payment_link: null, automation_payment_link: null };
}

export async function saveBillingSettings(s: BillingSettings): Promise<void> {
  const u = await uid(); if (!u) return;
  await supabase.from('agency_billing_settings').upsert({
    owner_id: u,
    website_payment_link: s.website_payment_link?.trim() || null,
    automation_payment_link: s.automation_payment_link?.trim() || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'owner_id' });
}

export async function listClientSubs(): Promise<ClientSubRow[]> {
  const u = await uid(); if (!u) return [];
  const { data } = await supabase.from('client_subscriptions').select('*')
    .eq('owner_id', u).order('created_at', { ascending: false });
  return (data ?? []) as ClientSubRow[];
}

export interface NewClientSub {
  business_name: string; email?: string | null; tier: TierId; cadence: Cadence; price_cents: number; notes?: string | null;
}
export async function createClientSub(input: NewClientSub): Promise<ClientSubRow | null> {
  const u = await uid(); if (!u) return null;
  const { data } = await supabase.from('client_subscriptions').insert({
    owner_id: u, business_name: input.business_name.trim(), email: input.email?.trim() || null,
    tier: input.tier, cadence: input.cadence, price_cents: Math.max(0, Math.round(input.price_cents)),
    status: 'pending', notes: input.notes?.trim() || null,
  }).select('*').single();
  return (data as ClientSubRow) ?? null;
}

export async function setClientStatus(id: string, status: 'pending' | 'active' | 'canceled'): Promise<void> {
  const u = await uid(); if (!u) return;
  await supabase.from('client_subscriptions')
    .update({ status, activated_at: status === 'active' ? new Date().toISOString() : null })
    .eq('owner_id', u).eq('id', id);
}

export async function deleteClientSub(id: string): Promise<void> {
  const u = await uid(); if (!u) return;
  await supabase.from('client_subscriptions').delete().eq('owner_id', u).eq('id', id);
}
