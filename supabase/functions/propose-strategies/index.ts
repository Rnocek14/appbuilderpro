// supabase/functions/propose-strategies/index.ts — SW9.2: 2-4 grounded strategies for a world,
// stored PROPOSED. The model sees ONLY real facts (the world's own record) and must cite them
// verbatim; the strategies gauntlet (parseStrategies) relabels any uncited "measured" claim
// heuristic and drops fake citations — a bare world yields honestly-labeled heuristics.
// Adopting/retiring only ever shapes nextMove/briefing inputs; NOTHING here sends anything.
// Frontier-tier brain (brainModelForPlan) behind the spend guard; credits-gated per call.
// Deploy: supabase functions deploy propose-strategies

import { createClient } from 'npm:@supabase/supabase-js@2';
import { complete, brainModelForPlan } from '../_shared/ai.ts';
import { checkCredits, spendCredits, getUserPlan } from '../_shared/credits.ts';
import { gatherSrv } from '../_shared/producersSrv.ts';
import { quarantineExternal } from '../_shared/untrustedText.ts';
import { parseStrategies, MIN_STRATEGIES, MAX_STRATEGIES } from '../../../src/lib/garvis/strategies.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

const SYSTEM = `You propose ${MIN_STRATEGIES}-${MAX_STRATEGIES} STRATEGIES for one solo operator's business — distinct, workable
ways to pursue the objective, each grounded in the business's real record.
Return STRICT JSON only: an array of {"title":"<≤80 chars>","rationale":"<2-4 sentences>",
"basis":"measured"|"heuristic","evidence":["<verbatim FACT line>", ...]}.
Rules: basis "measured" ONLY when every evidence entry copies a FACT line VERBATIM — a strict
gate relabels anything paraphrased. With thin facts, propose fewer, label them heuristic, and
say in the rationale what evidence would upgrade them. Never invent numbers, channels, or
history. No preamble, no markdown fences.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!bearer) return json({ error: 'Unauthorized' }, 401);
    const { data: u } = await admin.auth.getUser(bearer);
    if (!u.user) return json({ error: 'Unauthorized' }, 401);
    const ownerId = u.user.id;

    const body = (await req.json().catch(() => ({}))) as { world_id?: string; objective?: string };
    if (!body.world_id) return json({ error: 'world_id required' }, 400);
    const { data: world } = await admin.from('knowledge_worlds')
      .select('id, title').eq('id', body.world_id).eq('owner_id', ownerId).maybeSingle();
    if (!world) return json({ error: 'Business not found.' }, 404);

    try { await checkCredits(admin, ownerId, 'plan'); }
    catch (e) {
      if ((e as { status?: number }).status === 402) return json({ error: e instanceof Error ? e.message : 'Out of credits.' }, 402);
      throw e;
    }

    // THE FACTS — real rows only, each one line, each citable verbatim. A bare world simply
    // has few facts; the parser's grounding gate does the honest labeling from there.
    const m = await gatherSrv(admin, body.world_id);
    const { data: clusterRows } = await admin.from('knowledge_clusters').select('id').eq('world_id', body.world_id);
    const clusterIds = ((clusterRows ?? []) as { id: string }[]).map((c) => c.id);
    const facts: string[] = [];
    if (m.ctx?.business_name) facts.push(`Business: ${m.ctx.business_name}${m.ctx.craft ? ` — ${m.ctx.craft}` : ''}`);
    if (m.goal) facts.push(m.goal);
    if (clusterIds.length) {
      const { data: research } = await admin.from('knowledge_artifacts')
        .select('title').in('cluster_id', clusterIds).eq('kind', 'research')
        .neq('source', 'garvis-seed').order('created_at', { ascending: false }).limit(3);
      for (const r of (research ?? []) as { title: string }[]) facts.push(`Research on record: "${r.title}"`);
    }
    const [{ count: sent }, { count: replied }, { data: chans }] = await Promise.all([
      admin.from('outreach_messages').select('id', { count: 'exact', head: true }).eq('owner_id', ownerId).eq('status', 'sent'),
      admin.from('outreach_campaigns').select('id', { count: 'exact', head: true }).eq('owner_id', ownerId).in('state', ['replied', 'won']),
      admin.from('growth_channels').select('id, name').eq('world_id', body.world_id).limit(5),
    ]);
    if ((sent ?? 0) > 0) facts.push(`${sent} outreach emails sent all-time, ${replied ?? 0} campaigns drew a reply`);
    for (const c of (chans ?? []) as { id: string; name: string }[]) {
      const { count: eps } = await admin.from('channel_episodes').select('id', { count: 'exact', head: true }).eq('channel_id', c.id);
      facts.push(`Channel "${c.name}" exists with ${eps ?? 0} episodes drafted`);
    }

    const model = brainModelForPlan(await getUserPlan(admin, ownerId));
    const objective = (body.objective ?? '').trim().slice(0, 300) || `Grow "${(world as { title: string }).title}"`;
    const res = await complete([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: quarantineExternal(
        `OBJECTIVE: ${objective}\n\nFACTS (the only ground truth — cite these VERBATIM):\n${facts.map((f) => `- ${f}`).join('\n') || '- (no recorded facts yet — everything you propose is heuristic)'}\n\nPropose the strategies now. Strict JSON array.`,
        8_000).text },
    ], { provider: model.provider, model: model.model, maxTokens: 1600 });
    await spendCredits(admin, ownerId, { costUsd: res.costUsd, kind: 'plan', provider: model.provider, model: model.model, inputTokens: res.inputTokens, outputTokens: res.outputTokens });

    const drafts = parseStrategies(res.text, facts);
    if (drafts.length < MIN_STRATEGIES) {
      return json({ ok: false, error: 'The proposals came back too thin to file — run it again, or add research so the strategies have ground to stand on.' });
    }
    const { data: rows, error: insErr } = await admin.from('strategies').insert(drafts.map((d) => ({
      owner_id: ownerId, world_id: body.world_id, title: d.title, rationale: d.rationale,
      basis: d.basis, evidence: d.evidence, status: 'proposed',
    }))).select('id, title, rationale, basis, evidence, status, created_at');
    if (insErr) return json({ error: insErr.message }, 500);
    return json({ ok: true, strategies: rows ?? [] });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
