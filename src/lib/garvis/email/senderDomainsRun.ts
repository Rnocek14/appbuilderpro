// src/lib/garvis/email/senderDomainsRun.ts
// Client data-access for per-brand sending domains. Reads go straight to the owner-scoped table; the
// Resend calls (connect/verify/refresh/remove) go through the sender-domain edge function, which holds
// RESEND_API_KEY. Best-effort reads so the page degrades to empty before the migration is applied.

import { supabase } from '../../supabase';
import type { DomainStatus, DnsRecord } from './senderDomain';

export interface SenderDomainRow {
  id: string;
  domain: string;
  status: DomainStatus;
  records: DnsRecord[];
  provider_domain_id: string | null;
  world_id: string | null;
  client_subscription_id: string | null;
  last_checked_at: string | null;
  created_at: string;
}

async function uid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function listSenderDomains(): Promise<SenderDomainRow[]> {
  const u = await uid(); if (!u) return [];
  const { data } = await supabase.from('sender_domains')
    .select('id, domain, status, records, provider_domain_id, world_id, client_subscription_id, last_checked_at, created_at')
    .eq('owner_id', u).order('created_at', { ascending: false });
  return (data ?? []) as SenderDomainRow[];
}

/** Invoke the edge function and surface its error as a throw (supabase-js resolves errors, never throws). */
async function call(body: Record<string, unknown>): Promise<{ domain?: SenderDomainRow }> {
  const { data, error } = await supabase.functions.invoke('sender-domain', { body });
  const d = data as { ok?: boolean; error?: string; domain?: SenderDomainRow } | null;
  if (error || !d?.ok) throw new Error(d?.error ?? error?.message ?? 'Request failed.');
  return d;
}

export async function connectSenderDomain(
  domain: string, opts?: { world_id?: string | null; client_subscription_id?: string | null },
): Promise<SenderDomainRow | undefined> {
  return (await call({ action: 'connect', domain, world_id: opts?.world_id ?? undefined, client_subscription_id: opts?.client_subscription_id ?? undefined })).domain;
}

export async function refreshSenderDomain(id: string): Promise<SenderDomainRow | undefined> {
  return (await call({ action: 'refresh', id })).domain;
}

export async function verifySenderDomain(id: string): Promise<SenderDomainRow | undefined> {
  return (await call({ action: 'verify', id })).domain;
}

export async function removeSenderDomain(id: string): Promise<void> {
  await call({ action: 'remove', id });
}
