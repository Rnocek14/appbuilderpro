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

async function reason(admin: Admin, ownerId: string, system: string, user: string): Promise<string> {
  const m = modelForPlan(await getUserPlan(admin, ownerId));
  const r = await complete(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    { provider: m.provider, model: m.model, maxTokens: 2600 },
  );
  await spendCredits(admin, ownerId, { costUsd: r.costUsd, kind: 'plan', provider: m.provider, model: m.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens });
  return r.text.trim();
}

/** Intent → DNA → draft web. Two model calls, one draft row, zero worlds created. */
export async function generateDraftSrv(admin: Admin, ownerId: string, intent: string): Promise<GenerateDraftResultSrv> {
  const cleanIntent = intent.trim();
  if (cleanIntent.length < 12) {
    return { id: null, draft: null, problems: ['Say a little more about the business — a sentence is enough.'], warnings: [] };
  }

  // Stage 1 — business synthesis. Everything downstream derives from this record.
  const dnaText = await reason(admin, ownerId, DNA_SYSTEM, cleanIntent);
  const dna = parseDNA(dnaText);
  if (!dna) return { id: null, draft: null, problems: ['Could not synthesize the business DNA — try describing the business in one or two more sentences.'], warnings: [] };

  // Stage 2 — web synthesis, grounded in the DNA it just wrote.
  const genText = await reason(
    admin, ownerId, GENESIS_SYSTEM,
    `WORLD DNA:\n${JSON.stringify({ title: dna.title, objective: dna.objective, dna: dna.dna, businessContext: dna.businessContext }, null, 1)}\n\nDesign the work web for this business now. JSON only.`,
  );
  const parsed = parseGenesis(genText, dna);
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
