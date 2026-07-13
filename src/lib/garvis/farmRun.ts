// src/lib/garvis/farmRun.ts
// Impure half of the farm: territories, recipient import (dedup by household key, never
// resurrecting or overwriting what's already on file), do-not-mail suppression (sacred —
// select-first-insert like email suppression, never reset), and the reads the merge run needs.
// All writes owner-scoped; imports drop a mind_event so the world's heartbeat sees the farm grow.

import { supabase } from '../supabase';
import { recordMindEvent } from './mindStore';
import type { FarmRecipient } from './farm';

export interface TerritoryRow { id: string; name: string; zips: string[]; notes: string | null; created_at: string }
export interface TerritoryStats { recipients: number; absentee: number }
export interface DoNotMailRow { id: string; household_key: string; address_label: string; reason: string | null; created_at: string }

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error('Not signed in.');
  return id;
}

export async function listTerritories(worldId: string): Promise<TerritoryRow[]> {
  const { data, error } = await supabase.from('farm_territories')
    .select('id, name, zips, notes, created_at')
    .eq('world_id', worldId).order('created_at', { ascending: false }).limit(30);
  if (error) throw new Error(error.message);
  return (data ?? []) as TerritoryRow[];
}

export async function createTerritory(input: { worldId: string; name: string; zips?: string[]; notes?: string }): Promise<TerritoryRow> {
  const owner = await uid();
  const name = input.name.trim();
  if (!name) throw new Error('Give the territory a name (the neighborhood you mean).');
  const { data, error } = await supabase.from('farm_territories').insert({
    owner_id: owner, world_id: input.worldId, name,
    zips: (input.zips ?? []).map((z) => z.trim()).filter(Boolean),
    notes: input.notes?.trim() || null,
  }).select('id, name, zips, notes, created_at').single();
  if (error || !data) throw new Error(`Could not create the territory: ${error?.message ?? 'unknown error'}`);
  return data as TerritoryRow;
}

export async function deleteTerritory(id: string): Promise<void> {
  const owner = await uid();
  const { error } = await supabase.from('farm_territories').delete().eq('id', id).eq('owner_id', owner);
  if (error) throw new Error(error.message);
}

export async function territoryStats(territoryId: string): Promise<TerritoryStats> {
  const [all, abs] = await Promise.all([
    supabase.from('mail_recipients').select('id', { count: 'exact', head: true }).eq('territory_id', territoryId),
    supabase.from('mail_recipients').select('id', { count: 'exact', head: true }).eq('territory_id', territoryId).eq('is_absentee', true),
  ]);
  if (all.error) throw new Error(all.error.message);
  return { recipients: all.count ?? 0, absentee: abs.count ?? 0 };
}

/** Import parsed recipients. Upsert ignores households already on file — an import can only ADD;
 *  it never rewrites a household or resurrects a deleted one silently. Honest counts returned. */
export async function importRecipients(input: {
  territoryId: string; worldId: string; recipients: FarmRecipient[]; source?: string;
}): Promise<{ inserted: number; skippedExisting: number; total: number }> {
  const owner = await uid();
  if (input.recipients.length === 0) return { inserted: 0, skippedExisting: 0, total: (await territoryStats(input.territoryId)).recipients };

  const before = (await territoryStats(input.territoryId)).recipients;
  const rows = input.recipients.map((r) => ({
    owner_id: owner, territory_id: input.territoryId, world_id: input.worldId,
    full_name: r.fullName, situs_address1: r.situs.address1, situs_city: r.situs.city,
    situs_state: r.situs.state, situs_zip: r.situs.zip5,
    mail_address1: r.mail?.address1 ?? null, mail_city: r.mail?.city ?? null,
    mail_state: r.mail?.state ?? null, mail_zip: r.mail?.zip5 ?? null,
    is_absentee: r.isAbsentee, household_key: r.householdKey, attrs: r.attrs,
    source: input.source ?? 'csv',
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('mail_recipients')
      .upsert(rows.slice(i, i + 500), { onConflict: 'owner_id,territory_id,household_key', ignoreDuplicates: true });
    if (error) throw new Error(`Import failed at row ${i + 1}: ${error.message}`);
  }
  const after = (await territoryStats(input.territoryId)).recipients;
  const inserted = Math.max(0, after - before);
  const skippedExisting = input.recipients.length - inserted;

  await recordMindEvent(owner, {
    event_type: 'note', source: 'workweb',
    subject: `Farm grew: imported ${inserted} address${inserted === 1 ? '' : 'es'}${skippedExisting > 0 ? ` (${skippedExisting} already on file)` : ''}`,
    payload: { world_id: input.worldId, territory_id: input.territoryId, inserted, skipped: skippedExisting },
  });
  return { inserted, skippedExisting, total: after };
}

interface RecipientDbRow {
  full_name: string; situs_address1: string; situs_city: string; situs_state: string; situs_zip: string;
  mail_address1: string | null; mail_city: string | null; mail_state: string | null; mail_zip: string | null;
  is_absentee: boolean; household_key: string; attrs: Record<string, string> | null;
}

export const RECIPIENT_LOAD_CAP = 2000;

export async function listRecipients(territoryId: string): Promise<FarmRecipient[]> {
  const { data, error } = await supabase.from('mail_recipients')
    .select('full_name, situs_address1, situs_city, situs_state, situs_zip, mail_address1, mail_city, mail_state, mail_zip, is_absentee, household_key, attrs')
    .eq('territory_id', territoryId).order('created_at', { ascending: true }).limit(RECIPIENT_LOAD_CAP);
  if (error) throw new Error(error.message);
  return ((data ?? []) as RecipientDbRow[]).map((r) => ({
    fullName: r.full_name,
    situs: { address1: r.situs_address1, city: r.situs_city, state: r.situs_state, zip5: r.situs_zip },
    mail: r.mail_address1
      ? { address1: r.mail_address1, city: r.mail_city ?? '', state: r.mail_state ?? '', zip5: r.mail_zip ?? '' }
      : null,
    isAbsentee: r.is_absentee,
    householdKey: r.household_key,
    attrs: r.attrs ?? {},
  }));
}

export async function listDoNotMail(): Promise<DoNotMailRow[]> {
  const { data, error } = await supabase.from('do_not_mail')
    .select('id, household_key, address_label, reason, created_at')
    .order('created_at', { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as DoNotMailRow[];
}

/** The FULL do-not-mail key set — used at merge time so suppression is never capped. The list-view
 *  above pages to 500 for display; a merge must check every suppressed household, always. */
export async function loadDoNotMailKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('do_not_mail')
      .select('household_key').range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as { household_key: string }[]) keys.add(r.household_key);
    if (!data || data.length < PAGE) break;
  }
  return keys;
}

/** Suppression is sacred: select-first-insert so a re-add never resets the original record. */
export async function addDoNotMail(input: { householdKey: string; addressLabel: string; reason?: string }): Promise<void> {
  const owner = await uid();
  const { data: existing } = await supabase.from('do_not_mail')
    .select('id').eq('owner_id', owner).eq('household_key', input.householdKey).maybeSingle();
  if (existing) return;
  const { error } = await supabase.from('do_not_mail').insert({
    owner_id: owner, household_key: input.householdKey,
    address_label: input.addressLabel, reason: input.reason?.trim() || null,
  });
  if (error) throw new Error(`Could not add to do-not-mail: ${error.message}`);
}

export async function removeDoNotMail(id: string): Promise<void> {
  const owner = await uid();
  const { error } = await supabase.from('do_not_mail').delete().eq('id', id).eq('owner_id', owner);
  if (error) throw new Error(error.message);
}
