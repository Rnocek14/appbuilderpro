// supabase/functions/_shared/genesisSrv.ts — SW6.3: Project Genesis, server-side DRAFT stage.
// Mirror of src/lib/garvis/genesisRun.generateDraft: the same two-stage synthesis (Intent → DNA
// → Work Web) through the same pure parsers, persisting ONLY a web_templates draft row. Nothing
// becomes a world without the operator's approval — approval remains the client ceremony
// (approveDraft), so this module never writes knowledge_worlds. Parity pinned by arcParity.verify.
//
// Spend discipline: callers gate with checkCredits BEFORE invoking; both model calls here record
// their real cost with spendCredits.

import { complete, modelForPlan } from './ai.ts';
import { spendCredits, getUserPlan } from './credits.ts';
import { DNA_SYSTEM, GENESIS_SYSTEM, parseDNA, parseGenesis, type GenesisDraft } from '../../../src/lib/garvis/genesis.ts';

// Loose admin type on purpose — the full supabase-js builder type trips TS's depth guard.
// deno-lint-ignore no-explicit-any
type Admin = any;

export interface GenerateDraftResultSrv {
  id: string | null;
  draft: GenesisDraft | null;
  problems: string[];
  warnings: string[];
}

async function reason(admin: Admin, ownerId: string, system: string, user: string, maxTokens = 2600): Promise<string> {
  const m = modelForPlan(await getUserPlan(admin, ownerId));
  const r = await complete(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    { provider: m.provider, model: m.model, maxTokens },
  );
  await spendCredits(admin, ownerId, { costUsd: r.costUsd, kind: 'plan', provider: m.provider, model: m.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens });
  return r.text.trim();
}

// A full work-web JSON routinely outruns the default budget — a truncated object is exactly the
// "did not return valid JSON" failure the operator saw live (2026-08-18). Give stage 2 room.
const GENESIS_MAX_TOKENS = 5000;
const JSON_ONLY_REMINDER = '\n\nReturn ONLY the complete JSON object — no prose, no code fences, nothing after the closing brace.';

/** Intent → DNA → draft web. Two model calls, one draft row, zero worlds created. */
export async function generateDraftSrv(admin: Admin, ownerId: string, intent: string): Promise<GenerateDraftResultSrv> {
  const cleanIntent = intent.trim();
  if (cleanIntent.length < 12) {
    return { id: null, draft: null, problems: ['Say a little more about the business — a sentence is enough.'], warnings: [] };
  }

  // Stage 1 — business synthesis. Everything downstream derives from this record. A parse miss
  // gets ONE retry with the JSON-only reminder: truncation and stray prose are transient shapes,
  // not verdicts on the intent.
  let dna = parseDNA(await reason(admin, ownerId, DNA_SYSTEM, cleanIntent));
  if (!dna) dna = parseDNA(await reason(admin, ownerId, DNA_SYSTEM, cleanIntent + JSON_ONLY_REMINDER));
  if (!dna) return { id: null, draft: null, problems: ['Could not synthesize the business DNA — try describing the business in one or two more sentences.'], warnings: [] };

  // Stage 2 — web synthesis, grounded in the DNA it just wrote. Same one-retry contract.
  const genPrompt = `WORLD DNA:\n${JSON.stringify({ title: dna.title, objective: dna.objective, dna: dna.dna, businessContext: dna.businessContext }, null, 1)}\n\nDesign the work web for this business now. JSON only.`;
  let parsed = parseGenesis(await reason(admin, ownerId, GENESIS_SYSTEM, genPrompt, GENESIS_MAX_TOKENS), dna);
  if (!parsed.draft) {
    const second = parseGenesis(await reason(admin, ownerId, GENESIS_SYSTEM, genPrompt + JSON_ONLY_REMINDER, GENESIS_MAX_TOKENS), dna);
    if (second.draft) parsed = second;
  }
  if (!parsed.draft) return { id: null, draft: null, problems: parsed.problems, warnings: parsed.warnings };

  const d = parsed.draft;
  const { data: row, error } = await admin.from('web_templates').insert({
    owner_id: ownerId,
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

  await admin.from('mind_events').insert({
    owner_id: ownerId, event_type: 'note', source: 'genesis',
    subject: `Drafted a world: ${d.title} (${d.template.nodes.length} areas — awaiting your review)`,
    payload: { draft_id: (row as { id: string }).id },
  }).then(() => {}, () => {});
  return { id: (row as { id: string }).id, draft: d, problems: [], warnings: parsed.warnings };
}
