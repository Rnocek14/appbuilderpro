// supabase/functions/research/index.ts
// Deep research: analyzes the project's full source code, then researches the market/competition
// with live web search (Anthropic web_search tool) and returns a grounded, cited comparison.
// Production counterpart of the client-side researchAnswer (used when not in direct mode).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { completeWithWebSearch, corsHeaders, getProviderConfig, modelForPlan } from '../_shared/ai.ts';
import { checkCredits, spendCredits, InsufficientCreditsError, getUserPlan } from '../_shared/credits.ts';

const RESEARCH_SYSTEM = `You are FableForge's senior product and market analyst. You will be given
the user's app — INCLUDING ITS FULL SOURCE CODE — and a question about its market or competition.
Do real, in-depth analysis, not a generic overview.

Work in two phases:
1) ANALYZE THE APP DEEPLY from the code provided: what it actually does, its real feature set, the
   stack/architecture, how complete and polished it is, and concrete strengths and gaps. Reference
   specific files, pages, and features — never be generic.
2) RESEARCH THE MARKET with web search: real direct and indirect competitors, what they offer,
   pricing/positioning where available, and where the market is heading. Use several searches.

Then deliver a rigorous COMPARISON: a feature-by-feature table of THIS app vs the top 3-5
competitors (grounded in its code); where it's ahead, at parity, behind; differentiation
opportunities and the most important gaps; and an honest verdict.

CALIBRATION: never state a bare completeness percentage (false precision) — assess against explicit
bars (e.g. "complete as a demo; early as a product, missing X/Y/Z"), and give honest effort sizing
(small/moderate/large/foundational). Don't assume the user wants to commercialize — frame "where you
are vs where you'd need to be" for a learning project, a side project, and a real product. Separate
FACT (code observations, cited market facts) from JUDGMENT (worth-pursuing, predictions) and note
confidence. Ground every app claim in the actual code; ground every market claim in a cited source.
Never invent competitors, features, prices, or numbers, and never present a guess as a measurement.`;

function buildCodeDigest(files: { path: string; content: string }[]): string {
  const TOTAL_CAP = 140_000;
  const PER_FILE_CAP = 14_000;
  const rank = (p: string) =>
    /App\.(t|j)sx?$/.test(p) ? 0 : /\/pages\//.test(p) ? 1 : /\/components\//.test(p) ? 2 : /\/lib\//.test(p) ? 3 : 4;
  const sorted = [...files].sort((a, b) => rank(a.path) - rank(b.path) || a.path.localeCompare(b.path));
  const parts: string[] = [];
  let used = 0;
  let included = 0;
  for (const f of sorted) {
    if (used >= TOTAL_CAP) break;
    let content = f.content ?? '';
    if (content.length > PER_FILE_CAP) content = content.slice(0, PER_FILE_CAP) + '\n…(file truncated)';
    const block = `\n===== ${f.path} =====\n${content}\n`;
    parts.push(block);
    used += block.length;
    included++;
  }
  if (included < sorted.length) parts.push(`\n…(${sorted.length - included} more file(s) omitted for length)`);
  return parts.join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const cfg = getProviderConfig();
  if (cfg.provider !== 'anthropic') {
    return json({ error: 'Research requires the Anthropic provider (web search is Anthropic-only).' }, 400);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const authClient = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  );
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const { projectId, message } = await req.json();
  if (!projectId || !message) return json({ error: 'projectId and message are required' }, 400);

  const { data: project } = await admin.from('projects').select('id, owner_id, name, description').eq('id', projectId).single();
  if (!project || project.owner_id !== user.id) return json({ error: 'Project not found' }, 404);

  // CREDIT GATE — research runs live web search + a large-context call; meter it.
  try {
    await checkCredits(admin, user.id, 'research');
  } catch (e) {
    if (e instanceof InsufficientCreditsError) return json({ error: e.message }, 402);
    throw e;
  }
  const m = modelForPlan(await getUserPlan(admin, user.id)); // free → cheaper Anthropic model

  const { data: files } = await admin
    .from('project_files').select('path, content')
    .eq('project_id', projectId).is('deleted_at', null);

  await admin.from('ai_messages').insert({ project_id: projectId, user_id: user.id, role: 'user', content: message });

  try {
    const ctx = [
      project.name ? `App name: ${project.name}` : '',
      project.description ? `Description: ${project.description}` : '',
      '',
      'FULL SOURCE CODE:',
      buildCodeDigest(files ?? []),
    ].filter(Boolean).join('\n');

    const result = await completeWithWebSearch([
      { role: 'system', content: RESEARCH_SYSTEM },
      { role: 'user', content: `${ctx}\n\n---\nThe user asks: ${message}\n\nAnalyze the app from its code above, research the market with web search, then deliver the comparison.` },
    ], { maxTokens: 8000, maxUses: 10, model: m.model });

    const answer = (result.text || 'I searched but did not find enough to answer confidently.') +
      (result.sources.length ? `\n\nSources:\n${result.sources.map((s) => `• ${s}`).join('\n')}` : '');

    await admin.from('ai_messages').insert({ project_id: projectId, user_id: user.id, role: 'assistant', content: answer });
    await spendCredits(admin, user.id, {
      costUsd: result.costUsd, kind: 'research', provider: cfg.provider, model: m.model,
      inputTokens: result.inputTokens, outputTokens: result.outputTokens, projectId,
    });

    return json({ answer });
  } catch (err) {
    return json({ error: `Research failed: ${String(err).slice(0, 200)}` }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}
