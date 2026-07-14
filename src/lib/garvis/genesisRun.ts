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
  DNA_SYSTEM, GENESIS_SYSTEM, parseDNA, parseGenesis, structuralViolations,
  type GenesisDraft, type WorldDNA, type BusinessContext, type PlayData, type GenesisRationale,
} from './genesis';
import { instantiateWeb, type WebSummary } from './workwebRun';
import { distillRepo, hasEnoughSignal, repoIntent, parseRouteHead, type RepoFile, type RepoSignal } from './repoGenesis';
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

// ---------------------------------------------------------------------------
// Genesis from a GitHub repo — read the repo's real signal, distill an intent, run the SAME
// two-stage synthesis. No new engine: the repo just becomes the intent generateDraft consumes.
// ---------------------------------------------------------------------------

/** Pull {owner, repo} from a github URL or a bare "owner/repo". Null when it isn't one. */
export function parseRepoRef(input: string): { owner: string; repo: string } | null {
  const s = input.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/^github\.com\//i, '');
  const m = /^([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(s.split(/[?#]/)[0]);
  if (!m) return null;
  const owner = m[1]; const repo = m[2];
  if (!owner || !repo || /^https?:?$/i.test(owner)) return null;
  return { owner, repo };
}

/** Fetch one repo file through the fetch-url edge fn, keeping title + description + text (fetchLinks
 *  drops description, which is the strongest product signal). Best-effort — '' on any failure. */
async function fetchRepoFile(url: string): Promise<{ title: string; description: string; text: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('fetch-url', { body: { url } });
    if (error) return { title: '', description: '', text: '' };
    const d = data as { title?: string; description?: string; text?: string; error?: string };
    if (d.error) return { title: '', description: '', text: '' };
    return { title: d.title ?? '', description: d.description ?? '', text: d.text ?? '' };
  } catch { return { title: '', description: '', text: '' }; }
}

export interface RepoDraftResult extends GenerateDraftResult {
  signal?: RepoSignal | null;   // what was read from the repo (shown so the draft is inspectable)
  intent?: string;              // the distilled brief that Genesis synthesized from
}

/** Read a PUBLIC GitHub repo → distill a product brief → run Genesis. Private repos need a connected
 *  GitHub token (a later slice); here we read what's public via raw.githubusercontent.com/HEAD. */
export async function generateDraftFromRepo(repoInput: string): Promise<RepoDraftResult> {
  const ref = parseRepoRef(repoInput);
  if (!ref) return { id: null, draft: null, problems: ['That doesn’t look like a GitHub repo — paste a URL like github.com/owner/repo.'], warnings: [] };

  // HEAD resolves the default branch, so we don't have to guess main vs master.
  const base = `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/HEAD`;
  const [readme, pkg, html, root, routeIndex] = await Promise.all([
    fetchRepoFile(`${base}/README.md`),
    fetchRepoFile(`${base}/package.json`),
    fetchRepoFile(`${base}/index.html`),
    // Route-based apps (TanStack Start / Remix) keep their head in a route file, not index.html.
    fetchRepoFile(`${base}/src/routes/__root.tsx`),
    fetchRepoFile(`${base}/src/routes/index.tsx`),
  ]);

  const files: RepoFile[] = [];
  if (readme.text) files.push({ path: 'README.md', text: readme.text });
  if (pkg.text) files.push({ path: 'package.json', text: pkg.text });
  // fetch-url pre-extracts <title>/<meta description> from HTML — rebuild a minimal head so the pure
  // distiller reads them exactly as it would from a raw index.html.
  const mkHead = (title: string, description: string): RepoFile =>
    ({ path: 'index.html', text: `<title>${title}</title><meta name="description" content="${description.replace(/"/g, '&quot;')}">` });
  if (html.title || html.description) {
    files.push(mkHead(html.title, html.description));
  } else {
    // No index.html head → recover it from the route files (TanStack/Remix), so no app reads blank.
    const head = parseRouteHead([root.text, routeIndex.text].filter(Boolean).join('\n'));
    if (head.title || head.description) files.push(mkHead(head.title ?? '', head.description ?? ''));
  }

  if (!files.length) {
    return { id: null, draft: null, problems: [`Couldn’t read ${ref.owner}/${ref.repo} — if it’s private, connect GitHub first, or paste a short description of the product instead.`], warnings: [] };
  }

  const signal = distillRepo(files, ref);
  if (!hasEnoughSignal(signal)) {
    return { id: null, draft: null, signal, problems: [`Read ${ref.owner}/${ref.repo}, but its README/site didn’t say what the product does. Add a description to the repo, or tell me in a sentence what it is.`], warnings: [] };
  }

  const intent = repoIntent(signal, ref);
  const result = await generateDraft(intent);
  return { ...result, signal, intent };
}

/** Bring a WHOLE portfolio in at once: draft a world from each repo, sequentially (gentle on rate
 *  limits + credits), each isolated so one bad repo never sinks the batch. */
export async function generateDraftsFromRepos(inputs: string[]): Promise<{ input: string; result: RepoDraftResult }[]> {
  const out: { input: string; result: RepoDraftResult }[] = [];
  for (const input of inputs) {
    try {
      out.push({ input, result: await generateDraftFromRepo(input) });
    } catch (e) {
      out.push({ input, result: { id: null, draft: null, problems: [e instanceof Error ? e.message : 'Reading the repo failed.'], warnings: [] } });
    }
  }
  return out;
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

  // Re-check the structural invariants the parser enforced at synthesis (deep scan): removeDraftNode
  // can prune a draft below them — a launch with no audience, or no vault/intel/ledger, or nearly
  // empty. Release the claim and refuse rather than instantiate a broken world.
  const violations = structuralViolations(row.template);
  if (violations.length) {
    await supabase.from('web_templates').update({ status: 'draft' }).eq('id', id);
    throw new Error(`This draft can't become a world yet — ${violations.join('; ')}. Add the missing area(s) or start over.`);
  }

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

  // THE DRAFT'S HONESTY MUST SURVIVE APPROVAL (audit fix): the questions Garvis refused to
  // invent answers to, the assets it asked for, and the designed first moves used to die in the
  // web_templates row the moment the draft card disappeared. They now become the world's opening
  // intelligence: open questions the dashboards track, and a starting recommendation (clearly
  // labeled as the design's, replaced by the first real reflection). Fail-soft — a miss here
  // never fails the approval.
  try {
    const openQuestions = [
      ...row.questions,
      ...row.intake_requests.map((r) => `Upload: ${r}`),
    ].filter(Boolean).slice(0, 5);
    const recommendation = row.first_moves.length
      ? `From the world's design (pre-reflection): ${row.first_moves.slice(0, 3).join(' → ')}`
      : null;
    if (openQuestions.length || recommendation) {
      await supabase.from('world_intelligence').upsert({
        owner_id: uid, world_id: summary.worldId,
        objective: row.objective,
        ...(openQuestions.length ? { open_questions: openQuestions } : {}),
        ...(recommendation ? { recommendation } : {}),
      }, { onConflict: 'world_id' });
    }
  } catch { /* the world stands; its opening questions can be regenerated by reflection */ }

  await recordMindEvent(uid, {
    event_type: 'note', source: 'genesis',
    subject: `Created world "${row.title}" from an approved draft`,
    payload: { world_id: summary.worldId, draft_id: id },
  });
  return summary;
}
