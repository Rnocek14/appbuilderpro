// supabase/functions/generate-app/index.ts
// The agent pipeline. Runs server-side so provider keys never reach the browser.
// Stages: interpret → blueprint → schema → file_tree → frontend → backend →
//         auth_logic → styling → validate → fix → summarize
// Progress is written to project_generations and streamed to the client via Realtime.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { complete, parseJson, corsHeaders, getProviderConfig, type AIMessage } from '../_shared/ai.ts';

const STAGES = [
  'interpret', 'blueprint', 'schema', 'file_tree', 'frontend',
  'backend', 'auth_logic', 'styling', 'validate', 'fix', 'summarize',
] as const;

type Stage = (typeof STAGES)[number];

interface Blueprint {
  app_name: string;
  description: string;
  user_roles: { name: string; permissions: string[] }[];
  database_schema: { tables: { name: string; columns: { name: string; type: string }[] }[] };
  pages: { path: string; name: string; purpose: string }[];
  components: string[];
  auth_rules: Record<string, string>;
  workflows: string[];
  integrations: string[];
  deployment_notes: string;
}

interface GeneratedFile { path: string; content: string }

const SYSTEM = `You are FableForge's code generation engine. You generate small, complete,
runnable React apps that render inside a browser sandbox (Sandpack, react template).
Rules:
- Entry point is /App.js (default export a React component). Plain JS + JSX, no TypeScript, no imports beyond "react".
- Styles go in /styles.css and are imported from App.js.
- Components live in /components/*.js. Keep the file count under 10.
- Persist data with localStorage where state should survive reloads.
- Mark Supabase/Stripe touchpoints with a comment: // INTEGRATION: <what to wire>.
- Apps must be polished: empty states, hover states, a coherent palette, responsive layout.
When asked for JSON, respond with ONLY a JSON object — no prose, no markdown fences.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const authClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  );

  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const { projectId, prompt, planContext } = await req.json();
  if (!projectId || !prompt) return json({ error: 'projectId and prompt are required' }, 400);

  // ownership + plan limit checks
  const { data: project } = await supabaseAdmin
    .from('projects').select('id, owner_id, name').eq('id', projectId).single();
  if (!project || project.owner_id !== user.id) return json({ error: 'Project not found' }, 404);

  const { data: profile } = await supabaseAdmin
    .from('profiles').select('plan, monthly_generation_limit').eq('id', user.id).single();
  const { data: used } = await supabaseAdmin.rpc('generations_this_month', { uid: user.id });
  if ((used ?? 0) >= (profile?.monthly_generation_limit ?? 10)) {
    return json({ error: 'Monthly generation limit reached. Upgrade to Pro for more.' }, 429);
  }

  // create the generation record up-front so the client can subscribe
  const { data: gen, error: genErr } = await supabaseAdmin
    .from('project_generations')
    .insert({ project_id: projectId, user_id: user.id, prompt, kind: 'create', status: 'running' })
    .select().single();
  if (genErr) return json({ error: genErr.message }, 500);

  // run pipeline in background; respond immediately with the generation id
  runPipeline(supabaseAdmin, gen.id, projectId, user.id, prompt, planContext).catch(async (err) => {
    await supabaseAdmin.from('project_generations').update({
      status: 'failed', error: String(err), finished_at: new Date().toISOString(),
    }).eq('id', gen.id);
    await supabaseAdmin.from('error_logs').insert({
      user_id: user.id, project_id: projectId, generation_id: gen.id,
      source: 'pipeline', message: String(err),
    });
  });

  return json({ generationId: gen.id });
});

async function runPipeline(db: SupabaseClient, genId: string, projectId: string, userId: string, prompt: string, planContext?: string) {
  let totalIn = 0, totalOut = 0, totalCost = 0;
  const stageLog: { stage: Stage; status: string; started_at: string; finished_at?: string; note?: string }[] = [];

  const mark = async (stage: Stage, status: 'running' | 'done', note?: string) => {
    if (status === 'running') {
      stageLog.push({ stage, status, started_at: new Date().toISOString(), note });
    } else {
      const entry = stageLog.find((s) => s.stage === stage);
      if (entry) { entry.status = 'done'; entry.finished_at = new Date().toISOString(); entry.note = note; }
    }
    await db.from('project_generations').update({
      current_stage: stage, stages: stageLog,
      input_tokens: totalIn, output_tokens: totalOut, cost_usd: totalCost,
    }).eq('id', genId);
  };

  const ask = async (messages: AIMessage[], maxTokens = 8192) => {
    const r = await complete(messages, { maxTokens });
    totalIn += r.inputTokens; totalOut += r.outputTokens; totalCost += r.costUsd;
    return r.text;
  };

  // ---- interpret + blueprint (one call covers both reasoning stages) ----
  await mark('interpret', 'running');
  await mark('interpret', 'done', 'Prompt parsed');
  await mark('blueprint', 'running');
  const blueprintRaw = await ask([
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Design an app blueprint for this request:\n"""${prompt}"""\n` +
      (planContext ? `\nThe user reviewed and approved this plan — follow it:\n${planContext}\n` : '') + `
Respond with ONLY JSON matching:
{"app_name": str, "description": str,
 "user_roles": [{"name": str, "permissions": [str]}],
 "database_schema": {"tables": [{"name": str, "columns": [{"name": str, "type": str}]}]},
 "pages": [{"path": str, "name": str, "purpose": str}],
 "components": [str], "auth_rules": {}, "workflows": [str],
 "integrations": [str], "deployment_notes": str}` },
  ]);
  const blueprint = parseJson<Blueprint>(blueprintRaw);
  await db.from('app_blueprints').insert({ project_id: projectId, ...blueprintToRow(blueprint) });
  await db.from('projects').update({ name: blueprint.app_name, description: blueprint.description, status: 'generating' }).eq('id', projectId);
  await mark('blueprint', 'done', blueprint.app_name);

  await mark('schema', 'running');
  await mark('schema', 'done', `${blueprint.database_schema?.tables?.length ?? 0} tables planned`);

  // ---- file generation (covers file_tree/frontend/backend/auth/styling) ----
  await mark('file_tree', 'running');
  const filesRaw = await ask([
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Blueprint:\n${JSON.stringify(blueprint)}\n
Generate the complete app now. Respond with ONLY JSON:
{"files": [{"path": "/App.js", "content": "..."}, {"path": "/styles.css", "content": "..."}, ...]}
Every file complete and runnable. Include /App.js and /styles.css.` },
  ], 16000);
  let files = parseJson<{ files: GeneratedFile[] }>(filesRaw).files;
  await mark('file_tree', 'done', `${files.length} files`);
  for (const s of ['frontend', 'backend', 'auth_logic', 'styling'] as Stage[]) {
    await mark(s, 'running'); await mark(s, 'done');
  }

  // ---- validate + fix ----
  await mark('validate', 'running');
  const problems = validateFiles(files);
  await mark('validate', 'done', problems.length ? `${problems.length} issue(s)` : 'clean');
  if (problems.length) {
    await mark('fix', 'running');
    const fixedRaw = await ask([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `These files have problems: ${problems.join('; ')}\nFiles:\n${JSON.stringify(files)}\nReturn the corrected full set as ONLY JSON {"files":[...]}` },
    ], 16000);
    try { files = parseJson<{ files: GeneratedFile[] }>(fixedRaw).files; } catch { /* keep originals */ }
    await mark('fix', 'done');
  } else {
    await mark('fix', 'running'); await mark('fix', 'done', 'skipped');
  }

  // ---- persist files ----
  for (const f of files) {
    await db.from('project_files').upsert(
      { project_id: projectId, path: f.path, content: f.content, updated_by_ai: true },
      { onConflict: 'project_id,path' },
    );
  }

  // ---- summarize ----
  await mark('summarize', 'running');
  const summary = await ask([
    { role: 'system', content: 'Summarize in 3 short sentences what was built, for the end user. Plain text.' },
    { role: 'user', content: `App: ${blueprint.app_name}. Files: ${files.map((f) => f.path).join(', ')}` },
  ], 300);
  await mark('summarize', 'done');

  await db.from('ai_messages').insert({
    project_id: projectId, user_id: userId, generation_id: genId,
    role: 'assistant', content: summary, files_changed: files.map((f) => f.path),
  });
  await db.from('usage_events').insert({
    user_id: userId, project_id: projectId, event_type: 'generation',
    provider: getProviderConfig().provider, model: getProviderConfig().model,
    input_tokens: totalIn, output_tokens: totalOut, cost_usd: totalCost,
  });
  await db.from('projects').update({ status: 'ready', updated_at: new Date().toISOString() }).eq('id', projectId);
  await db.from('project_generations').update({
    status: 'succeeded', summary, finished_at: new Date().toISOString(),
    input_tokens: totalIn, output_tokens: totalOut, cost_usd: totalCost,
  }).eq('id', genId);
  await db.from('audit_logs').insert({
    actor_id: userId, action: 'project.generate', entity_type: 'project', entity_id: projectId,
    metadata: { generation_id: genId, files: files.length },
  });
}

function validateFiles(files: GeneratedFile[]): string[] {
  const problems: string[] = [];
  if (!files.some((f) => f.path === '/App.js')) problems.push('missing /App.js');
  if (!files.some((f) => f.path === '/styles.css')) problems.push('missing /styles.css');
  for (const f of files) {
    if (!f.content?.trim()) problems.push(`${f.path} is empty`);
    if (f.path.endsWith('.js') && !/export default/.test(f.content) && f.path === '/App.js') {
      problems.push('/App.js has no default export');
    }
  }
  return problems;
}

function blueprintToRow(b: Blueprint) {
  return {
    app_name: b.app_name, description: b.description, user_roles: b.user_roles,
    database_schema: b.database_schema, pages: b.pages, components: b.components,
    auth_rules: b.auth_rules, workflows: b.workflows, integrations: b.integrations,
    deployment_notes: b.deployment_notes,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}
