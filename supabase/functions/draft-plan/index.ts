// supabase/functions/draft-plan/index.ts
// Cold-start plan mode (production): proposes what a new app will be — pages, features, files —
// for the user to approve BEFORE generating any files. Generates nothing; returns a plan.
// The approved plan is later sent to generate-app as planContext so the build follows it.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { complete, parseJson, corsHeaders } from '../_shared/ai.ts';

const GENERATE_PLAN_SYSTEM = `You are FableForge's planning assistant. The user wants to build a new
app. Propose a short, concrete plan for what you'll build — do NOT write code. Be opinionated and
specific: name the actual pages and core features, call out any genuine product decision as an
option (with its tradeoff), and surface anything you'd want confirmed. Respond with ONLY a JSON
object — no prose, no fences.`;

function generationPlanPrompt(userPrompt: string): string {
  return `Plan the app for this request:\n"""${userPrompt}"""\n
Respond with ONLY JSON matching:
{"summary": "1-2 sentences on what you'll build and the overall approach",
 "steps": ["the key pages/features you'll build, one per item"],
 "fileHints": ["/src/pages/X.tsx — what it is", "/src/components/Y.tsx — what it is"],
 "options": ["a real product choice — its tradeoff (omit if none)"],
 "openQuestions": ["anything you'd want confirmed before building (omit if none)"]}
Keep it a focused MVP (about 5-9 pages/components). Always include summary, steps, and fileHints.`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authClient = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  );
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const { prompt } = await req.json();
  if (!prompt) return json({ error: 'prompt is required' }, 400);

  try {
    const r = await complete([
      { role: 'system', content: GENERATE_PLAN_SYSTEM },
      { role: 'user', content: generationPlanPrompt(prompt) },
    ], { maxTokens: 4000 });
    const p = parseJson<{ summary?: string; steps?: string[]; fileHints?: string[]; options?: string[]; openQuestions?: string[] }>(r.text);
    const plan = {
      summary: (p.summary ?? '').trim(),
      steps: p.steps ?? [],
      fileHints: p.fileHints ?? [],
      options: p.options ?? [],
      openQuestions: p.openQuestions ?? [],
    };
    return json({ plan });
  } catch (err) {
    return json({ error: `Could not draft a plan: ${String(err).slice(0, 200)}` }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}
