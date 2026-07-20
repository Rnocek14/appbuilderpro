// src/lib/garvis/actionRegistry.ts
// THE ACTION REGISTRY — the executable half of the Orchestrator. Specs live in actionCatalog.ts
// (pure, shared with the compiler prompt and the coverage suite); this file supplies each spec's
// executor and zips them together — a spec without an executor (or vice versa) throws at module
// load, so the two halves cannot drift silently.
//
// Outcome discipline: execute() returns what NOW EXISTS (a draft to review, an order armed, a
// handoff link), never a promise. Approval-gated machinery stays approval-gated.

import { supabase } from '../supabase';
import { WaitingError, type ActionSpec, type StepStatus } from './orchestrator';
import { ACTION_SPECS, actionSpecs } from './actionCatalog';
import type { Charter, Archetype } from './workweb';

export { actionSpecs };

export interface ActionDef extends ActionSpec {
  execute: (params: Record<string, string>) => Promise<StepStatus>;
}

/** Resolve a world by (partial) title — same contract as the chat tools: no match is an ERROR the
 *  operator can fix by naming it exactly; never a silent fuzzy guess. */
async function resolveWorld(title: string): Promise<{ id: string; title: string }> {
  const { data } = await supabase.from('knowledge_worlds')
    .select('id, title').ilike('title', `%${title}%`).limit(2);
  const rows = (data ?? []) as { id: string; title: string }[];
  // A missing world is a SEAM, not a failure: it usually means "approve the draft first" — the
  // durable runner parks the step waiting and the arc resumes once the world exists.
  if (rows.length === 0) throw new WaitingError(`No business named "${title}" yet — approve its draft on Businesses (or name an existing one exactly), then resume this arc.`, { kind: 'world_exists', title });
  if (rows.length > 1) {
    // Two candidates: an exact-title match wins; otherwise refuse — running against the wrong
    // business is worse than pausing. Same seam as "missing": name it exactly and resume.
    const exact = rows.filter((r) => r.title.toLowerCase() === title.toLowerCase());
    if (exact.length !== 1) {
      throw new WaitingError(`More than one business matches "${title}" (${rows.map((r) => `"${r.title}"`).join(', ')}) — name the one you mean exactly, then resume this arc.`, { kind: 'world_named', title });
    }
    return exact[0];
  }
  return rows[0];
}

/** Find the world's best-matching chartered area for a producer (intel/studio first, else the
 *  first chartered area) — producers run against a real charter, same as a canvas click. */
async function resolveArea(worldId: string, preferred: Archetype[]): Promise<Charter> {
  const { data } = await supabase.from('knowledge_clusters')
    .select('slug, charter').eq('world_id', worldId).limit(32);
  const rows = ((data ?? []) as { slug: string; charter: Charter | null }[]).filter((r) => r.charter);
  if (!rows.length) throw new WaitingError('That business has no chartered areas yet — approve its draft on Businesses, then resume this arc.', { kind: 'world_area', world_id: worldId });
  for (const p of preferred) {
    const hit = rows.find((r) => r.charter!.archetype === p);
    if (hit) return hit.charter!;
  }
  return rows[0].charter!;
}

const EXECUTORS: Record<string, ActionDef['execute']> = {
  found_company: async (p) => {
    const { generateDraft } = await import('./genesisRun');
    const res = await generateDraft(p.intent);
    if (!res.id || !res.draft) {
      throw new Error(res.problems[0] ?? 'Genesis could not draft this company.');
    }
    return {
      kind: 'needs_review',
      note: `Company draft "${res.draft.title}" is ready — review its areas, money verdict and open questions, then approve to instantiate.`,
      link: '/garvis/webs',
    };
  },

  onboard_client: async (p) => {
    const { onboardClient } = await import('./clientEngagementRun');
    const res = await onboardClient({ clientName: p.client_name, business: p.business, scope: p.scope, email: p.email ?? null });
    return {
      kind: 'needs_review',
      note: `Engagement for ${p.client_name} opened — ${res.intakeCount} intake item(s) to collect.${res.draftProblem ? ` Their world draft failed (${res.draftProblem}) — re-run it from Businesses.` : ' Their business draft is ready: approve it on Businesses, then link it in the Client book.'}`,
      link: '/garvis/client-book',
    };
  },

  research_market: async (p) => {
    const w = await resolveWorld(p.world);
    const charter = await resolveArea(w.id, ['intel']);
    const { produceResearch } = await import('./producers');
    const res = await produceResearch(w.id, charter);
    return {
      kind: 'done',
      note: `${res.message}${res.grounded ? '' : ' (not grounded — set SERPER_API_KEY for cited research)'}`,
      link: `/garvis/home/${w.id}`,
    };
  },

  business_plan: async (p) => {
    const w = await resolveWorld(p.world);
    const charter = await resolveArea(w.id, ['intel', 'studio']);
    const { produceBusinessPlan } = await import('./producers');
    const res = await produceBusinessPlan(w.id, charter);
    return { kind: 'done', note: res.message, link: `/garvis/home/${w.id}` };
  },

  marketing_campaign: async (p) => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) throw new Error('Not signed in.');
    // Named business → its newest earned research grounds the strategy stage.
    let research: string | null = null;
    if (p.world) {
      const w = await resolveWorld(p.world);
      const { data: clusterRows } = await supabase.from('knowledge_clusters').select('id').eq('world_id', w.id);
      const ids = ((clusterRows ?? []) as { id: string }[]).map((c) => c.id);
      if (ids.length) {
        const { data: r } = await supabase.from('knowledge_artifacts')
          .select('title, detail').in('cluster_id', ids).eq('kind', 'research')
          .neq('source', 'garvis-seed').order('created_at', { ascending: false }).limit(1);
        const row = (r ?? [])[0] as { title: string; detail: string | null } | undefined;
        if (row?.detail) research = `${row.title}\n${row.detail}`;
      }
    }
    const { generateCampaign } = await import('./marketingRun');
    const res = await generateCampaign({ ownerId: uid, subject: p.subject, brief: p.brief ?? null, appId: null, research });
    return {
      kind: 'needs_review',
      note: `Campaign drafted${research ? ' (strategy grounded in the business\'s research)' : ' (ungrounded — no research on record for it)'} — ${res.summary ?? 'review the assets and approve what should ship'}.`,
      link: '/garvis/marketing',
    };
  },

  email_segment: async (p) => {
    const seg = ['all', 'new', 'contacted', 'qualified', 'customer'].includes(p.segment) ? p.segment : null;
    if (!seg) throw new Error(`Segment must be one of all/new/contacted/qualified/customer — got "${p.segment}".`);
    const { createBatch } = await import('./outreachBatchRun');
    const res = await createBatch({ segment: seg as 'all' | 'new' | 'contacted' | 'qualified' | 'customer', subject: p.subject, body: p.body });
    return {
      kind: 'needs_review',
      note: `Batch queued to the "${seg}" segment — ${res.queued} recipient(s)${res.excluded.length ? `, ${res.excluded.length} excluded (suppression/bounces)` : ''}${res.truncatedFrom ? `, capped from ${res.truncatedFrom}` : ''}. ONE approval in the Queue releases it; the clock drains it under your daily cap.`,
      link: '/garvis/queue',
    };
  },

  queue_social_post: async (p) => {
    const { queueSocialPost } = await import('./socialRun');
    const platforms = (p.platforms ?? 'twitter').split(',').map((s) => s.trim()).filter(Boolean);
    const res = await queueSocialPost({ text: p.text, platforms });
    return {
      kind: 'needs_review',
      note: `Post queued for ${platforms.join(', ')} — approve it in the Queue and it goes out.${res.warnings.length ? ` (${res.warnings.join('; ')})` : ''}`,
      link: '/garvis/queue',
    };
  },

  hunt_opportunities: async (p) => {
    const { buildQueries } = await import('./opportunityHunt');
    const worldId = p.world ? (await resolveWorld(p.world)).id : null;
    const { createOrder } = await import('./standingRun');
    const cadence = (p.cadence === 'weekly' ? 'weekly' : 'daily') as 'daily' | 'weekly';
    const order = await createOrder({
      worldId, kind: 'opportunity_hunt', label: `Hunt: ${p.focus.slice(0, 60)}`, cadence,
      config: { focus: p.focus, region: p.region ?? null, queries: buildQueries(p.focus, p.region ?? null) },
    });
    const { clockState } = await import('./heartbeatStatus');
    const clock = await clockState();
    return {
      kind: 'done',
      note: `Hunt "${order.label}" armed (${cadence}) — new opportunities land in the feed with a ping.${clock.state === 'alive' ? '' : ' ⚠ The heartbeat is not ticking — arm it on the Health page or this never runs.'}`,
      link: clock.state === 'alive' ? '/garvis/opportunity-feed' : '/garvis/health',
    };
  },

  watch_page: async (p) => {
    const { createOrder } = await import('./standingRun');
    const cadence = (['hourly', 'daily', 'weekly'].includes(p.cadence ?? '') ? p.cadence : 'daily') as 'hourly' | 'daily' | 'weekly';
    const order = await createOrder({ worldId: null, kind: 'watch_url', label: p.label, cadence, url: p.url });
    const { clockState } = await import('./heartbeatStatus');
    const clock = await clockState();
    return {
      kind: 'done',
      note: `Watch "${order.label}" armed (${cadence}).${clock.state === 'alive' ? '' : ' ⚠ The heartbeat is not ticking — arm it on the Health page or this never fires.'}`,
      link: clock.state === 'alive' ? '/garvis/automations' : '/garvis/health',
    };
  },

  cadence_digest: async (p) => {
    const w = await resolveWorld(p.world);
    const { createOrder } = await import('./standingRun');
    const cadence = (p.cadence === 'daily' ? 'daily' : 'weekly') as 'daily' | 'weekly';
    const order = await createOrder({ worldId: w.id, kind: 'cadence_digest', label: `${w.title} digest`, cadence });
    return { kind: 'done', note: `Digest "${order.label}" armed (${cadence}).`, link: '/garvis/automations' };
  },

  build_app: async (p) => ({
    kind: 'handoff',
    note: 'The builder is ready with this idea — generation runs there with the compile-verified pipeline.',
    link: `/new?idea=${encodeURIComponent(p.idea)}`,
  }),

  template_document: async (p) => {
    const link = p.world ? `/garvis/webs/${(await resolveWorld(p.world)).id}` : '/garvis/webs';
    return {
      kind: 'handoff',
      note: `The Paperwork studio is ready${p.world ? ` in ${p.world}'s business` : ' (open the business it belongs to)'} — paste the sample document, extract the template, review, and Save.${p.note ? ` (${p.note.slice(0, 120)})` : ''}`,
      link,
    };
  },

  record_thesis: async (p) => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) throw new Error('Not signed in.');
    const { error } = await supabase.from('garvis_knowledge').insert({
      owner_id: uid, kind: 'decision', title: p.title.slice(0, 80), body: p.body,
      source: 'orchestrator', status: 'proposed',
    });
    if (error) throw new Error(error.message);
    return { kind: 'needs_review', note: `Thesis "${p.title.slice(0, 60)}" filed as proposed knowledge — approve it to make it part of Garvis's reasoning.`, link: '/garvis/memory' };
  },

  check_master_switch: async () => {
    const { clockState, clockLine } = await import('./heartbeatStatus');
    const c = await clockState();
    return {
      kind: c.state === 'alive' ? 'done' : 'needs_review',
      note: clockLine(c),
      link: '/garvis/health',
    };
  },

  // ---- catalog expansion (July 2026) ----

  create_invoice: async (p) => {
    const amount = Number(p.amount_usd);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error(`"${p.amount_usd}" is not a billable amount — say the real number.`);
    const worldId = p.world ? (await resolveWorld(p.world)).id : null;
    const { createInvoice } = await import('./moneyRun');
    const inv = await createInvoice({
      title: p.title, toEmail: p.to_email,
      lineItems: [{ description: p.title, qty: 1, unit_usd: amount }],
      dueDate: p.due_date || null, worldId, source: 'garvis_tool',
    });
    return { kind: 'done', note: `Invoice ${inv.number} drafted for $${amount.toFixed(2)} → ${p.to_email}. Queue the send from Money when you're ready (approval-gated).`, link: '/garvis/money' };
  },

  add_reminder: async (p) => {
    const { addReminder } = await import('./remindersRun');
    const due = p.due_at && !Number.isNaN(Date.parse(p.due_at)) ? new Date(p.due_at).toISOString() : null;
    await addReminder({ title: p.title, dueAt: due });
    return { kind: 'done', note: `Reminder set: "${p.title.slice(0, 80)}"${due ? ` (fires ${new Date(due).toLocaleString()})` : ' (no time — it lives on the board)'}.`, link: '/garvis/home' };
  },

  start_content_week: async (p) => {
    const w = await resolveWorld(p.world);
    const posts = Math.min(7, Math.max(1, Number(p.posts_per_week) || 3));
    const seg = ['all', 'new', 'contacted', 'qualified', 'customer'].includes(p.email_segment ?? '')
      ? (p.email_segment as 'all' | 'new' | 'contacted' | 'qualified' | 'customer') : null;
    const { createContentWeekOrder } = await import('./contentWeekRun');
    const order = await createContentWeekOrder({
      worldId: w.id,
      config: { platforms: ['twitter', 'linkedin'], postsPerWeek: posts, emailSegment: seg, sendHourUtc: 16, minScore: 6 },
    });
    return { kind: 'done', note: `"${order.label}" armed for ${w.title} — each week stages as ONE approval; auto-mode is earned after 3 clean weeks.`, link: '/garvis/automations' };
  },

  start_idea_stream: async (p) => {
    const w = await resolveWorld(p.world);
    const { createOrder } = await import('./standingRun');
    const cadence = (p.cadence === 'daily' ? 'daily' : 'weekly') as 'daily' | 'weekly';
    const order = await createOrder({ worldId: w.id, kind: 'idea_stream', label: `${w.title} idea stream`, cadence });
    return { kind: 'done', note: `Idea stream "${order.label}" armed (${cadence}) — fresh, non-repeating angles land on the board.`, link: '/garvis/automations' };
  },

  start_client_hunt: async (p) => {
    const { createClientHuntOrder } = await import('./standingRun');
    const searches = Math.min(20, Math.max(1, Number(p.searches_per_day) || 6));
    const order = await createClientHuntOrder({
      niches: p.niche ? [p.niche.trim()] : [], scope: { mode: 'topN', n: 50 },
      searchesPerDay: searches, demoQuota: 2,
    });
    return { kind: 'done', note: `"${order.label}" armed — daily discovery, honest site audits, demo builds, and pitches that WAIT in your Queue (needs GOOGLE_PLACES_API_KEY + the armed heartbeat).`, link: '/garvis/automations' };
  },

  add_contact: async (p) => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) throw new Error('Not signed in.');
    const email = p.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error(`"${p.email}" is not a valid email — say the real one.`);
    const worldId = p.world ? (await resolveWorld(p.world)).id : null;
    // Select-first: never resets email_status on an existing contact (suppression is sacred).
    const { data: existing } = await supabase.from('contacts').select('id').eq('owner_id', uid).eq('email', email).maybeSingle();
    if (existing) return { kind: 'done', note: `${email} is already in the CRM — nothing duplicated.`, link: '/garvis/contacts' };
    const { error } = await supabase.from('contacts').insert({
      owner_id: uid, world_id: worldId, full_name: p.name.trim(), email, email_status: 'unknown', is_primary: false,
    });
    if (error) throw new Error(error.message);
    return { kind: 'done', note: `${p.name.trim()} (${email}) added to the CRM${p.world ? ` under ${p.world}` : ''}.`, link: '/garvis/contacts' };
  },
};

// Zip specs + executors; any mismatch is a LOUD startup error, never silent drift.
export const ACTIONS: ActionDef[] = ACTION_SPECS.map((spec) => {
  const execute = EXECUTORS[spec.id];
  if (!execute) throw new Error(`actionRegistry: spec "${spec.id}" has no executor.`);
  return { ...spec, execute };
});
for (const id of Object.keys(EXECUTORS)) {
  if (!ACTION_SPECS.some((s) => s.id === id)) throw new Error(`actionRegistry: executor "${id}" has no spec in the catalog.`);
}

export function actionById(id: string): ActionDef | undefined {
  return ACTIONS.find((a) => a.id === id);
}
