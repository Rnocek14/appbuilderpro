// src/lib/garvis/genesisRun.ts
// Impure half of Project Genesis: run the two-stage synthesis (Intent → DNA → Work Web) through
// the existing cluster-chat seam (credit-metered — no new edge function), persist the draft, and
// on APPROVAL instantiate it through the same pipeline the builtin templates use.
//
// Nothing becomes a world without approval: generateDraft only ever writes a web_templates row
// with status 'draft'. approveDraft is the single instantiation path, and it stamps the world
// with its DNA + business context so every downstream generator speaks this world's voice.

import { supabase } from '../supabase';
import { recordMindEvent } from './mindStore';
import {
  DNA_SYSTEM, GENESIS_SYSTEM, parseDNA, parseGenesis,
  type GenesisDraft, type WorldDNA, type BusinessContext, type PlayData, type GenesisRationale,
} from './genesis';
import { instantiateWeb, type WebSummary } from './workwebRun';
import type { WebTemplate } from './workweb';

export interface DraftRow {
  id: string;
  title: string;
  objective: string | null;
  dna: WorldDNA | null;
  business_context: BusinessContext | null;
  template: WebTemplate;
  play: PlayData | null;
  rationale: GenesisRationale;
  questions: string[];
  intake_requests: string[];
  first_moves: string[];
  status: 'draft' | 'instantiated' | 'archived';
  world_id: string | null;
  created_at: string;
}

const DRAFT_COLS = 'id, title, objective, dna, business_context, template, play, rationale, questions, intake_requests, first_moves, status, world_id, created_at';

export interface GenerateDraftResult {
  id: string | null;
  draft: GenesisDraft | null;
  problems: string[];
  warnings: string[];
}

async function reason(system: string, context: string, message: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('cluster-chat', {
    body: { system, context, history: [], message },
  });
  if (error) throw new Error(error.message);
  return ((data as { text?: string })?.text ?? '').trim();
}

/** Intent → DNA → draft web. Two model calls, one draft row, zero worlds created. */
export async function generateDraft(intent: string): Promise<GenerateDraftResult> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const cleanIntent = intent.trim();
  if (cleanIntent.length < 12) {
    return { id: null, draft: null, problems: ['Say a little more about the business — a sentence is enough.'], warnings: [] };
  }

  // Stage 1 — business synthesis. Everything downstream derives from this record.
  const dnaText = await reason(DNA_SYSTEM, '', cleanIntent);
  const dna = parseDNA(dnaText);
  if (!dna) return { id: null, draft: null, problems: ['Could not synthesize the business DNA — try describing the business in one or two more sentences.'], warnings: [] };

  // Stage 2 — web synthesis, grounded in the DNA it just wrote.
  const genText = await reason(
    GENESIS_SYSTEM,
    `WORLD DNA:\n${JSON.stringify({ title: dna.title, objective: dna.objective, dna: dna.dna, businessContext: dna.businessContext }, null, 1)}`,
    'Design the work web for this business now. JSON only.',
  );
  const parsed = parseGenesis(genText, dna);
  if (!parsed.draft) return { id: null, draft: null, problems: parsed.problems, warnings: parsed.warnings };

  const d = parsed.draft;
  const { data: row, error } = await supabase.from('web_templates').insert({
    owner_id: uid,
    title: d.title,
    description: d.objective ?? '',
    objective: d.objective,
    dna: d.dna,
    business_context: d.businessContext,
    template: d.template,
    play: d.play,
    rationale: d.rationale,
    questions: d.questions,
    intake_requests: d.intakeRequests,
    first_moves: d.firstMoves,
    source: 'generated',
    status: 'draft',
  }).select('id').single();
  if (error || !row) return { id: null, draft: d, problems: [`The draft was designed but could not be saved: ${error?.message ?? 'unknown error'}`], warnings: parsed.warnings };

  await recordMindEvent(uid, {
    event_type: 'note', source: 'genesis',
    subject: `Drafted a world: ${d.title} (${d.template.nodes.length} areas — awaiting your review)`,
    payload: { draft_id: (row as { id: string }).id },
  });
  return { id: (row as { id: string }).id, draft: d, problems: [], warnings: parsed.warnings };
}

export async function listDrafts(): Promise<DraftRow[]> {
  // Owner-scoped explicitly: the admin-read RLS policy exists for support, but an admin's own
  // WorkWebs page must never render other people's business DNA as approvable drafts.
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) return [];
  const { data } = await supabase.from('web_templates')
    .select(DRAFT_COLS).eq('status', 'draft').eq('owner_id', uid).order('created_at', { ascending: false }).limit(10);
  return (data ?? []) as unknown as DraftRow[];
}

export async function discardDraft(id: string): Promise<void> {
  const { data, error } = await supabase.from('web_templates')
    .update({ status: 'archived' }).eq('id', id).eq('status', 'draft').select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('Draft not found or no longer a draft.');
}

/** Remove one area from a draft before approval (the user's edit pass). Keeps the draft honest:
 *  rationale entries and play steps that pointed at the removed area go with it. */
export async function removeDraftNode(id: string, slug: string): Promise<DraftRow | null> {
  const { data } = await supabase.from('web_templates').select(DRAFT_COLS).eq('id', id).maybeSingle();
  const row = data as unknown as DraftRow | null;
  if (!row || row.status !== 'draft') return row;
  const prune = (nodes: WebTemplate['nodes']): WebTemplate['nodes'] =>
    nodes.filter((n) => n.slug !== slug).map((n) => ({ ...n, children: n.children ? prune(n.children) : n.children }));
  const template: WebTemplate = { ...row.template, nodes: prune(row.template.nodes) };
  const clusters = { ...row.rationale.clusters };
  delete clusters[slug];
  const play: PlayData | null = row.play
    ? { ...row.play, steps: row.play.steps.filter((s) => s.targetSlug !== slug) }
    : null;
  const { data: updated } = await supabase.from('web_templates')
    .update({ template, rationale: { ...row.rationale, clusters }, play: play && play.steps.length ? play : null, source: 'edited' })
    .eq('id', id).select(DRAFT_COLS).single();
  return (updated as unknown as DraftRow | null) ?? null;
}

/** The single instantiation path: draft → world, through the SAME validated pipeline the builtin
 *  templates use, then the world is stamped with its DNA + voice. */
export async function approveDraft(id: string): Promise<WebSummary> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  // ATOMIC CLAIM: flip draft → instantiated only where it is still a draft owned by this user.
  // Two racing approvals (second tab, retry) cannot both pass — the loser matches zero rows.
  // On instantiation failure the claim reverts, so the draft is never stranded.
  const { data: claimed, error: claimErr } = await supabase.from('web_templates')
    .update({ status: 'instantiated' })
    .eq('id', id).eq('owner_id', uid).eq('status', 'draft')
    .select(DRAFT_COLS);
  if (claimErr) throw new Error(claimErr.message);
  const row = (claimed?.[0] as unknown as DraftRow | undefined) ?? null;
  if (!row) throw new Error('This draft was already approved or discarded.');

  let summary: WebSummary;
  try {
    // The world's own business context + DNA ride along so every chartered area is SEEDED with
    // its expert playbook in this world's voice AND its industry's knowledge (born full, not
    // blank — a real estate world knows CMA + Fair Housing; a finance world knows the
    // due-diligence ladder + the Marketing Rule).
    summary = await instantiateWeb(row.template, row.business_context, row.dna);
  } catch (e) {
    await supabase.from('web_templates').update({ status: 'draft' }).eq('id', id); // release the claim
    throw e;
  }

  const [{ error: wErr }, { error: tErr }] = await Promise.all([
    supabase.from('knowledge_worlds').update({ dna: row.dna, business_context: row.business_context }).eq('id', summary.worldId),
    supabase.from('web_templates').update({ world_id: summary.worldId }).eq('id', id),
  ]);
  if (wErr) throw new Error(`The world was created but its DNA could not be saved: ${wErr.message}`);
  if (tErr) throw new Error(`The world was created but the draft could not be marked instantiated: ${tErr.message}`);

  await recordMindEvent(uid, {
    event_type: 'note', source: 'genesis',
    subject: `Created world "${row.title}" from an approved draft`,
    payload: { world_id: summary.worldId, draft_id: id },
  });
  return summary;
}
