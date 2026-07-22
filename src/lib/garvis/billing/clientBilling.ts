// src/lib/garvis/billing/clientBilling.ts
// Client data-access for the operator's own client-billing book (app_0077). Owner-scoped; best-effort
// reads return null/[] so the UI degrades to empty before the migration is applied.

import { supabase } from '../../supabase';
import type { TierId, Cadence } from './clientTiers';

export interface BillingSettings { website_payment_link: string | null; automation_payment_link: string | null }
export interface ClientSubRow {
  id: string; business_name: string; email: string | null; tier: TierId; cadence: Cadence;
  price_cents: number; status: 'pending' | 'active' | 'canceled'; notes: string | null;
  twilio_number: string | null; twilio_subaccount_sid: string | null;
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
  const u = await uid(); if (!u) throw new Error('Not signed in.');
  // supabase-js RESOLVES with {error} rather than throwing — surface it, or a failed save reads as success.
  const { error } = await supabase.from('agency_billing_settings').upsert({
    owner_id: u,
    website_payment_link: s.website_payment_link?.trim() || null,
    automation_payment_link: s.automation_payment_link?.trim() || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'owner_id' });
  if (error) throw new Error(error.message);
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
export async function createClientSub(input: NewClientSub): Promise<ClientSubRow> {
  const u = await uid(); if (!u) throw new Error('Not signed in.');
  const cents = Math.max(0, Math.round(Number.isFinite(input.price_cents) ? input.price_cents : 0));
  const { data, error } = await supabase.from('client_subscriptions').insert({
    owner_id: u, business_name: input.business_name.trim(), email: input.email?.trim() || null,
    tier: input.tier, cadence: input.cadence, price_cents: cents,
    status: 'pending', notes: input.notes?.trim() || null,
  }).select('*').single();
  if (error) throw new Error(error.message);
  return data as ClientSubRow;
}

export async function setClientStatus(id: string, status: 'pending' | 'active' | 'canceled'): Promise<void> {
  const u = await uid(); if (!u) throw new Error('Not signed in.');
  // Stamp activated_at only on activation; never null it on cancel/pause (keeps the churn/history date).
  const patch: Record<string, unknown> = { status };
  if (status === 'active') patch.activated_at = new Date().toISOString();
  const { error } = await supabase.from('client_subscriptions').update(patch).eq('owner_id', u).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteClientSub(id: string): Promise<void> {
  const u = await uid(); if (!u) throw new Error('Not signed in.');
  const { error } = await supabase.from('client_subscriptions').delete().eq('owner_id', u).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Record a client's dedicated Twilio identity (their own number + optional subaccount SID). Attribution
 *  today; the hook for per-client send routing later. Blank strings clear the field. */
export async function setClientTwilio(id: string, twilio: { twilio_number?: string | null; twilio_subaccount_sid?: string | null }): Promise<void> {
  const u = await uid(); if (!u) throw new Error('Not signed in.');
  const patch: Record<string, unknown> = {};
  if (twilio.twilio_number !== undefined) patch.twilio_number = twilio.twilio_number?.trim() || null;
  if (twilio.twilio_subaccount_sid !== undefined) patch.twilio_subaccount_sid = twilio.twilio_subaccount_sid?.trim() || null;
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from('client_subscriptions').update(patch).eq('owner_id', u).eq('id', id);
  if (error) throw new Error(error.message);
}
