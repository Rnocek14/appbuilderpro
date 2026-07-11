// src/lib/garvis/marketIntelRun.ts
// Impure half of Market Intelligence: run one category scan through the EXISTING rails —
// discover-media (Serper, metered) for finding, cluster-chat (metered) for the evidence-labeled
// fit verdicts — and land prospects as rows. READ-ONLY by construction: nothing here contacts
// anyone; a prospect becomes outreach only when the user moves it into contacts and the
// approval spine takes over. Caps are explicit: 2 queries and 8 stored prospects per scan.

import { supabase } from '../supabase';
import { recordMindEvent } from './mindStore';
import {
  researchPlanFor, parseSerperOrganic, parseFits, FIT_SYSTEM,
  type ScanCategory, type ProspectCandidate, type FitLabel,
} from './marketIntel';
import type { WorldDNA, BusinessContext } from './genesis';

export interface ProspectRow {
  id: string; category: string; name: string; url: string | null; snippet: string | null;
  fit: FitLabel; fit_reason: string | null;
  status: 'new' | 'qualified' | 'dropped' | 'contacted' | 'in_audience';
  contact_id?: string | null;
  contact_emails?: string[];
  scanned_at?: string | null;
  created_at: string;
}

export async function worldPlan(worldId: string) {
  const { data } = await supabase.from('knowledge_worlds').select('dna, business_context, title').eq('id', worldId).maybeSingle();
  return {
    title: (data?.title as string) ?? '',
    dna: (data?.dna as WorldDNA | null) ?? null,
    ctx: (data?.business_context as BusinessContext | null) ?? null,
    plan: researchPlanFor((data?.dna as WorldDNA | null) ?? null, (data?.business_context as BusinessContext | null) ?? null),
  };
}

export async function listProspects(worldId: string): Promise<ProspectRow[]> {
  const { data } = await supabase.from('prospects')
    .select('id, category, name, url, snippet, fit, fit_reason, status, contact_id, contact_emails, scanned_at, created_at')
    .eq('world_id', worldId).neq('status', 'dropped')
    .order('created_at', { ascending: false }).limit(60);
  return (data ?? []) as ProspectRow[];
}

export async function setProspectStatus(id: string, status: ProspectRow['status']): Promise<void> {
  const { error } = await supabase.from('prospects').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

export interface ContactScanResult { emails: string[]; contactPage: string | null; message: string }

/** Scan a prospect's OWN website for publicly listed contact emails (fetch-url mode 'contact':
 *  mailto: links + text emails + light de-obfuscation, falling back to their contact page).
 *  Only what the site itself publishes is ever returned — Garvis never guesses an address.
 *  The result lands on the prospect row either way: found emails, or scanned_at proving
 *  "we looked, nothing public" (honest state, distinct from "never looked"). */
export async function scanProspectEmails(worldId: string, prospect: ProspectRow): Promise<ContactScanResult> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  if (!prospect.url) return { emails: [], contactPage: null, message: 'This prospect has no website on record to scan.' };

  const { data, error } = await supabase.functions.invoke('fetch-url', {
    body: { url: prospect.url, mode: 'contact' },
  });
  if (error) throw new Error(error.message);
  const payload = data as { emails?: string[]; contactPage?: string | null; error?: string };
  if (payload?.error) throw new Error(payload.error);
  const emails = (payload?.emails ?? []).filter((e) => typeof e === 'string').slice(0, 6);
  const contactPage = payload?.contactPage ?? null;

  const { error: upErr } = await supabase.from('prospects')
    .update({ contact_emails: emails, scanned_at: new Date().toISOString() })
    .eq('id', prospect.id);
  if (upErr) throw new Error(`Scan worked but could not be saved: ${upErr.message}`);

  await recordMindEvent(uid, {
    event_type: 'note', source: 'market-intel',
    subject: `Scanned ${prospect.name} for contact emails: ${emails.length} found`,
    payload: { world_id: worldId, prospect_id: prospect.id, found: emails.length },
  });
  return {
    emails, contactPage,
    message: emails.length
      ? `${emails.length} public email${emails.length === 1 ? '' : 's'} found on their site.`
      : contactPage
        ? 'No public email found — their site has a contact page (linked) you can check yourself.'
        : 'No public email on their site. Their contact form may be the only route.',
  };
}

/** The joint the audit found missing: a QUALIFIED prospect had no path into the audience.
 *  Scans can't find emails (search snippets don't carry them), so the operator supplies the
 *  address they found on the prospect's site — Garvis never invents one. Contact creation is
 *  select-first-insert-if-missing (NEVER an overwriting upsert — that would reset a suppressed
 *  email_status back to 'unknown'), the prospect links to the contact and becomes 'in_audience'.
 *  'contacted' stays reserved for when outreach is actually queued/sent. */
export async function prospectToAudience(worldId: string, prospect: ProspectRow, email: string): Promise<{ contactId: string; message: string }> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const to = email.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) throw new Error('Enter a valid email for this prospect.');

  let contactId: string;
  const { data: existing } = await supabase.from('contacts')
    .select('id, email_status').eq('owner_id', uid).eq('email', to).maybeSingle();
  if (existing) {
    const st = (existing as { email_status: string }).email_status;
    if (['unsubscribed', 'bounced', 'complained', 'invalid'].includes(st)) {
      throw new Error(`This email is marked ${st} — Garvis won't re-add someone who opted out.`);
    }
    contactId = (existing as { id: string }).id;
  } else {
    const { data: c, error: cErr } = await supabase.from('contacts')
      .insert({ owner_id: uid, email: to, full_name: prospect.name, email_status: 'unknown', is_primary: false })
      .select('id').single();
    if (cErr || !c) throw new Error(`Could not save the contact: ${cErr?.message ?? 'unknown error'}`);
    contactId = (c as { id: string }).id;
  }

  const { error: pErr } = await supabase.from('prospects')
    .update({ status: 'in_audience', contact_id: contactId }).eq('id', prospect.id);
  if (pErr) throw new Error(`Contact saved, but the prospect could not be linked: ${pErr.message}`);

  await recordMindEvent(uid, {
    event_type: 'note', source: 'market-intel',
    subject: `Moved prospect "${prospect.name}" into the audience`,
    payload: { world_id: worldId, prospect_id: prospect.id, contact_id: contactId },
  });
  return { contactId, message: `${prospect.name} is in your audience — queue outreach from a follow-up area (approval-gated as always).` };
}

export interface ScanResult { found: number; stored: number; judged: number; message: string }

/** One category scan: search (≤2 queries) → store candidates (≤8, deduped by url) → one batched
 *  fit-judgment call, reasons grounded in the snippets. Fail-soft at every stage. */
export async function scanCategory(worldId: string, category: ScanCategory, dna: WorldDNA | null, ctx: BusinessContext | null): Promise<ScanResult> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');

  const candidates: ProspectCandidate[] = [];
  const seen = new Set<string>();
  for (const q of category.queries.slice(0, 2)) {
    const { data, error } = await supabase.functions.invoke('discover-media', {
      body: { provider: 'serper', path: 'search', q },
    });
    if (error) throw new Error(error.message);
    const payload = data as { available?: boolean; data?: unknown; error?: string };
    if (payload?.error) throw new Error(payload.error);
    if (!payload?.available) throw new Error('Search is not configured on the server (SERPER_API_KEY missing).');
    for (const c of parseSerperOrganic(payload.data, 8)) {
      const key = c.url ?? c.name.toLowerCase();
      if (!seen.has(key)) { seen.add(key); candidates.push(c); }
    }
  }
  const kept = candidates.slice(0, 8);
  if (!kept.length) return { found: 0, stored: 0, judged: 0, message: 'The search returned nothing usable for this segment.' };

  // Store first (found is a fact even if judgment fails); unique(world_id, url) absorbs re-scans.
  const { data: inserted } = await supabase.from('prospects').upsert(
    kept.map((c) => ({ owner_id: uid, world_id: worldId, category: category.name, name: c.name, url: c.url, snippet: c.snippet || null })),
    { onConflict: 'world_id,url', ignoreDuplicates: true },
  ).select('id, name');
  const stored = inserted?.length ?? 0;

  // One batched judgment — evidence-labeled fits, grounded in the snippets.
  let judged = 0;
  try {
    const { data, error } = await supabase.functions.invoke('cluster-chat', {
      body: {
        system: FIT_SYSTEM,
        context: `BUSINESS DNA:\n${JSON.stringify({ dna, businessContext: ctx }, null, 1)}\n\nCANDIDATES:\n${kept.map((c) => `- ${c.name}: ${c.snippet || '(no snippet)'}`).join('\n')}`,
        history: [], message: `Judge fit for the "${category.name}" segment now. JSON only.`,
      },
    });
    if (!error) {
      const fits = parseFits((data as { text?: string })?.text ?? '');
      for (const f of fits) {
        if (f.fit === 'unknown') continue;
        const { error: upErr } = await supabase.from('prospects')
          .update({ fit: f.fit, fit_reason: f.reason })
          .eq('world_id', worldId).eq('category', category.name).eq('name', f.name);
        if (!upErr) judged++;
      }
    }
  } catch { /* fits stay 'unknown' — visible, never guessed */ }

  await recordMindEvent(uid, {
    event_type: 'note', source: 'market-intel',
    subject: `Scanned "${category.name}": ${kept.length} found, ${stored} new, ${judged} fit-judged`,
    payload: { world_id: worldId, category: category.name },
  });
  return { found: kept.length, stored, judged, message: `${kept.length} found · ${stored} new · ${judged} fit-judged. Judging is read-only — contacting stays behind approvals.` };
}
