// src/lib/garvis/actionRegistry.ts
// THE ACTION REGISTRY — the executable half of the Orchestrator. Every entry wraps machinery that
// ALREADY exists and works (genesis, producers, campaigns, standing orders, the builder), exposed
// as a typed action the compiler can compose. The rule this file exists to enforce:
//
//     if a human can click it, the brain can propose it — and NOTHING ELSE.
//
// Outcome discipline: execute() returns what NOW EXISTS (a draft to review, an order armed, a
// handoff link), never a promise. Approval-gated machinery stays approval-gated — founding a
// company still lands as a reviewable draft; campaign assets still land as drafts in Marketing.
// Growing this catalog IS growing Garvis's agency: client onboarding, paperwork templating,
// DocuSign flows, opportunity hunts all join here as their engines land.

import { supabase } from '../supabase';
import type { ActionSpec, StepStatus } from './orchestrator';
import type { Charter, Archetype } from './workweb';

export interface ActionDef extends ActionSpec {
  execute: (params: Record<string, string>) => Promise<StepStatus>;
}

/** Resolve a world by (partial) title — same contract as the chat tools: no match is an ERROR the
 *  operator can fix by naming it exactly; never a silent fuzzy guess. */
async function resolveWorld(title: string): Promise<{ id: string; title: string }> {
  const { data } = await supabase.from('knowledge_worlds')
    .select('id, title').ilike('title', `%${title}%`).limit(2);
  const rows = (data ?? []) as { id: string; title: string }[];
  if (rows.length === 0) throw new Error(`No business named "${title}" — name an existing one exactly, or found it first.`);
  return rows[0];
}

/** Find the world's best-matching chartered area for a producer (strategy/intel first, else the
 *  first chartered area) — producers run against a real charter, same as a canvas click. */
async function resolveArea(worldId: string, preferred: Archetype[]): Promise<Charter> {
  const { data } = await supabase.from('knowledge_clusters')
    .select('slug, charter').eq('world_id', worldId).limit(32);
  const rows = ((data ?? []) as { slug: string; charter: Charter | null }[]).filter((r) => r.charter);
  if (!rows.length) throw new Error('That business has no chartered areas — approve its draft first.');
  for (const p of preferred) {
    const hit = rows.find((r) => r.charter!.archetype === p);
    if (hit) return hit.charter!;
  }
  return rows[0].charter!;
}

export const ACTIONS: ActionDef[] = [
  {
    id: 'found_company',
    title: 'Found a company',
    category: 'company',
    risk: 'spend',
    description: 'Run business genesis on a one-line venture intent: DNA synthesis → a designed company (chartered areas, seeded playbooks, opening play) as a REVIEWABLE DRAFT. Use once per distinct company in the intent.',
    params: [{ name: 'intent', required: true, hint: 'the venture in one sentence, in the operator\'s words' }],
    produces: 'a company draft awaiting review/approval on the Businesses page (a live world only after approval)',
    execute: async (p) => {
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
  },
  {
    id: 'research_market',
    title: 'Research the market',
    category: 'planning',
    risk: 'spend',
    description: 'Run the grounded (Serper-cited when configured) market research producer for an EXISTING business — real snippets in, cited brief out, persisted as a knowledge artifact. Run before plans/campaigns so they inherit real research.',
    params: [{ name: 'world', required: true, hint: 'the business name (must already exist)' }],
    produces: 'a persisted research brief artifact in the business (cited when search is configured, framework-only when not)',
    execute: async (p) => {
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
  },
  {
    id: 'business_plan',
    title: 'Write the business plan',
    category: 'planning',
    risk: 'spend',
    description: 'MULTI-PASS business plan for an EXISTING business: auto-runs grounded research when none is on record, drafts against the full findings, red-teams the draft (consultant slop, unsupported claims, hollow operations), and refines against every fix. Order after research_market when both appear.',
    params: [{ name: 'world', required: true, hint: 'the business name (must already exist)' }],
    produces: 'a persisted, red-teamed business-plan artifact (plus the research it auto-ran, if any); thin output rejected, never shipped',
    execute: async (p) => {
      const w = await resolveWorld(p.world);
      const charter = await resolveArea(w.id, ['intel', 'studio']);
      const { produceBusinessPlan } = await import('./producers');
      const res = await produceBusinessPlan(w.id, charter);
      return { kind: 'done', note: res.message, link: `/garvis/home/${w.id}` };
    },
  },
  {
    id: 'marketing_campaign',
    title: 'Generate a marketing campaign',
    category: 'marketing',
    risk: 'spend',
    description: 'Run the 3-stage campaign generator (strategy+calendar → posts → email/landing copy). Pass `world` to ground the strategy in that business\'s newest research brief. Everything lands as DRAFTS the operator reviews in Marketing; social drafts can then queue through the real approval-gated posting rail.',
    params: [
      { name: 'subject', required: true, hint: 'what the campaign is selling/announcing' },
      { name: 'brief', required: false, hint: 'angle, audience, constraints — in the operator\'s words' },
      { name: 'world', required: false, hint: 'an existing business whose research should ground the strategy' },
    ],
    produces: 'a campaign with draft assets in Marketing, research-grounded when a business is named (nothing publishes without per-asset review)',
    execute: async (p) => {
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
  },
  {
    id: 'watch_page',
    title: 'Watch a page',
    category: 'automation',
    risk: 'safe',
    description: 'Standing order that fetches a URL on a cadence and records/notifies on change — for grant listings, RFP boards, competitor pages. One order per URL; static HTML only (JS-rendered portals will read as unchanged).',
    params: [
      { name: 'url', required: true, hint: 'the exact page URL to watch' },
      { name: 'label', required: true, hint: 'what this watch is for, in plain words' },
      { name: 'cadence', required: false, hint: 'hourly | daily | weekly (default daily)' },
    ],
    produces: 'an armed standing order (fires only while the heartbeat is armed — Health page shows the clock)',
    execute: async (p) => {
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
  },
  {
    id: 'hunt_opportunities',
    title: 'Hunt for opportunities',
    category: 'automation',
    risk: 'safe',
    description: 'Standing hunt for real work: jobs, RFPs, grants, commissions, open calls matching a focus (e.g. "mural commissions and public art projects"). Runs scheduled web-search sweeps, reads the results, extracts ONLY opportunities the pages actually describe, and files them deduped in the Opportunity feed for triage. Use when the intent is about FINDING work/opportunities, not customers to pitch.',
    params: [
      { name: 'focus', required: true, hint: 'what to hunt, in the operator\'s words ("mural and custom art jobs")' },
      { name: 'region', required: false, hint: 'geography to prefer ("Wisconsin", "Chicago area")' },
      { name: 'cadence', required: false, hint: 'daily | weekly (default daily)' },
      { name: 'world', required: false, hint: 'the business this hunt feeds (must already exist)' },
    ],
    produces: 'an armed daily/weekly hunt filling the Opportunity feed (needs SERPER_API_KEY + the armed heartbeat; JS-rendered pages are flagged unreadable, never silently skipped)',
    execute: async (p) => {
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
  },
  {
    id: 'cadence_digest',
    title: 'Schedule a business digest',
    category: 'automation',
    risk: 'safe',
    description: 'Standing order that compiles a recurring digest of an EXISTING business\'s real activity on a cadence.',
    params: [
      { name: 'world', required: true, hint: 'the business name (must already exist)' },
      { name: 'cadence', required: false, hint: 'daily | weekly (default weekly)' },
    ],
    produces: 'an armed digest order for that business (fires only while the heartbeat is armed)',
    execute: async (p) => {
      const w = await resolveWorld(p.world);
      const { createOrder } = await import('./standingRun');
      const cadence = (p.cadence === 'daily' ? 'daily' : 'weekly') as 'daily' | 'weekly';
      const order = await createOrder({ worldId: w.id, kind: 'cadence_digest', label: `${w.title} digest`, cadence });
      return { kind: 'done', note: `Digest "${order.label}" armed (${cadence}).`, link: '/garvis/automations' };
    },
  },
  {
    id: 'build_app',
    title: 'Build an app or website',
    category: 'app',
    risk: 'safe',
    description: 'Hand the intent to the app builder (compile-verified generation pipeline, live preview, one-click deploy). Use for websites, portfolios, tools, scrapers-as-apps. The build itself runs in the builder workspace.',
    params: [{ name: 'idea', required: true, hint: 'what to build, in one or two sentences' }],
    produces: 'the builder pre-filled with this idea — generation, verification and deploy happen there',
    execute: async (p) => ({
      kind: 'handoff',
      note: 'The builder is ready with this idea — generation runs there with the compile-verified pipeline.',
      link: `/new?idea=${encodeURIComponent(p.idea)}`,
    }),
  },
  {
    id: 'record_thesis',
    title: 'Record an operating thesis',
    category: 'setup',
    risk: 'safe',
    description: 'File a stated strategy/belief/constraint from the intent as PROPOSED knowledge (the operator approves it into reasoning memory). Use when the intent states a durable position worth remembering, not for tasks.',
    params: [
      { name: 'title', required: true, hint: 'the thesis in <=80 chars' },
      { name: 'body', required: true, hint: 'the thesis itself, 1-3 sentences, in the operator\'s words' },
    ],
    produces: 'a proposed knowledge row awaiting approval (approved lessons reach every agent run and builder edit)',
    execute: async (p) => {
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
  },
  {
    id: 'check_master_switch',
    title: 'Check the master switch',
    category: 'setup',
    risk: 'safe',
    description: 'Verify the unattended layer is actually running (heartbeat ticking). Add as a first step when the plan creates automations, so the operator learns immediately if scheduled work cannot fire.',
    params: [],
    produces: 'an honest reading of the clock (alive / stale / never ticked) with the fix location',
    execute: async () => {
      const { clockState, clockLine } = await import('./heartbeatStatus');
      const c = await clockState();
      return {
        kind: c.state === 'alive' ? 'done' : 'needs_review',
        note: clockLine(c),
        link: '/garvis/health',
      };
    },
  },
];

/** The pure specs (what the compiler prompt sees). */
export function actionSpecs(): ActionSpec[] {
  return ACTIONS.map(({ execute: _e, ...spec }) => { void _e; return spec; });
}

export function actionById(id: string): ActionDef | undefined {
  return ACTIONS.find((a) => a.id === id);
}
