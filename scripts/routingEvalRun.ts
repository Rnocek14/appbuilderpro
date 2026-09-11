// scripts/routingEvalRun.ts — THE LIVE ROUTING EVAL (human/CI-run; costs real model calls).
// Run: ANTHROPIC_API_KEY=... HEADLESS_MODEL=<model-id> npx tsx scripts/routingEvalRun.ts [--limit N]
//
// Feeds every ROUTING_CASES intent to the REAL compiler prompt — COMPILER_SYSTEM +
// catalogContext(ACTION_SPECS) + "OWNER SAYS: <intent>", the exact composition cluster-chat sends
// (orchestratorRun.ts) — parses each reply through the REAL gauntlet, and grades routing with the
// same grader the contract suite pins. This is the net for misses like 2026-08-18, run at model
// scale instead of waiting for the operator to hit one.
//
// Config (env — the model id is configuration, never code):
//   ANTHROPIC_API_KEY        required
//   HEADLESS_MODEL           model id (ROUTING_EVAL_MODEL overrides)
//   ROUTING_EVAL_THRESHOLD   pass bar, default 0.9 — accuracy below it exits 1
//   ANTHROPIC_BASE_URL       optional override

import { COMPILER_SYSTEM, catalogContext, parsePlan } from '../src/lib/garvis/orchestrator';
import { ACTION_SPECS } from '../src/lib/garvis/actionCatalog';
import { ROUTING_CASES, type RoutingCase } from '../src/lib/garvis/routingCases';
import { gradeRouting } from './routingEval';

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error('ANTHROPIC_API_KEY is not set — the live eval needs a real key.'); process.exit(1); }
const model = process.env.ROUTING_EVAL_MODEL || process.env.HEADLESS_MODEL;
if (!model) { console.error('Set HEADLESS_MODEL (or ROUTING_EVAL_MODEL) — the model id is configuration, never code.'); process.exit(1); }
const base = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
const threshold = Number(process.env.ROUTING_EVAL_THRESHOLD || '0.9');

const limitArg = process.argv.indexOf('--limit');
const limit = limitArg >= 0 ? Math.max(1, Number(process.argv[limitArg + 1]) || 1) : Infinity;

const cases = ROUTING_CASES.filter((c) => c.liveEval !== false).slice(0, limit);
const context = catalogContext(ACTION_SPECS);

async function compileLive(intent: string): Promise<string> {
  const body = JSON.stringify({
    model, max_tokens: 2500, system: COMPILER_SYSTEM,
    messages: [{ role: 'user', content: [context, `OWNER SAYS: ${intent}`].join('\n\n') }],
  });
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body,
    });
    if (res.ok) {
      const data = await res.json() as { content?: { type: string; text?: string }[] };
      return (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
    }
    if (attempt >= 2 || (res.status < 500 && res.status !== 429)) {
      throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
}

async function runCase(c: RoutingCase): Promise<{ c: RoutingCase; pass: boolean; reason: string }> {
  try {
    const raw = await compileLive(c.intent);
    const parsed = parsePlan(raw, ACTION_SPECS);
    const got = parsed.plan ? parsed.plan.steps.map((s) => s.action) : [];
    const grade = gradeRouting(c, got);
    return { c, ...grade };
  } catch (e) {
    return { c, pass: false, reason: `call failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

const CONCURRENCY = 4;
const results: { c: RoutingCase; pass: boolean; reason: string }[] = [];
let cursor = 0;
async function worker() {
  while (cursor < cases.length) {
    const c = cases[cursor++];
    const r = await runCase(c);
    results.push(r);
    console.log(`  ${r.pass ? 'ok  ' : 'MISS'} - ${r.c.name}${r.pass ? '' : ` — ${r.reason}`}`);
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, cases.length) }, worker));

const passedN = results.filter((r) => r.pass).length;
const accuracy = results.length ? passedN / results.length : 0;
console.log(`\nrouting eval: ${passedN}/${results.length} routed as pinned (${(accuracy * 100).toFixed(1)}%) — model ${model}, threshold ${threshold * 100}%`);
const misses = results.filter((r) => !r.pass);
if (misses.length) {
  console.log('\nMisses to triage (fix the catalog boundary, keep the case):');
  for (const m of misses) console.log(`  - "${m.c.intent}" → ${m.reason}`);
}
if (accuracy < threshold) { console.error(`\nBelow threshold — routing regressed or a boundary needs sharpening.`); process.exit(1); }
