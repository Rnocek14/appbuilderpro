// src/lib/garvis/content.verify.ts
// Standalone verification of content extraction (run: `npm run verify:content`).
// Pure-function asserts, no DB, no test framework (matches knowledge.verify.ts / objective.verify.ts).

import { extractGeneratedContent, shortScriptToMarkdown } from './content';
import type { AgentRun } from '../../types';
import type { ShortScriptResult } from './knowledge';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

const SCRIPT: ShortScriptResult = {
  hook: 'Stop scrolling — your app builder lies to you',
  script: 'Most AI builders dump files with no opinions. FableForge plans first...',
  caption: 'Build with a partner, not a vending machine. #buildinpublic',
  cta: 'Try FableForge',
  visual_beats: ['cut to editor', 'show plan card'],
  confidence: 0.7,
  fidelity: 'script_only',
  required_approval: true,
};

// Minimal AgentRun stub with the tool result the way runtime.ts persists it.
function runWith(history: { role: 'user' | 'assistant' | 'tool'; content: string }[]): AgentRun {
  return {
    id: 'r1', owner_id: 'o', app_id: 'app-fableforge', kind: 'content', title: 't',
    status: 'succeeded', input: null, output: 'Drafted a short.', recommendation: null,
    cost_usd: 0, created_at: '', finished_at: null, phase: 'act', priority: 0,
    budget_usd: 0.5, spent_usd: 0.01, lease_until: null,
    checkpoint: { step: 1, history }, error: null, started_at: null,
  };
}

// 1. Extracts the script from a realistic history.
const good = runWith([
  { role: 'assistant', content: 'call generate_short_script({"topic":"FableForge"})' },
  { role: 'tool', content: JSON.stringify({ short: SCRIPT }) },
]);
const extracted = extractGeneratedContent(good);
check('extracts one script from tool history', extracted.length === 1 && extracted[0].hook === SCRIPT.hook);
check('extracted script preserves fidelity flag', extracted[0].fidelity === 'script_only');

// 2. Graceful on no tool messages / unparseable / no checkpoint.
check('empty when no tool messages', extractGeneratedContent(runWith([{ role: 'assistant', content: 'thinking' }])).length === 0);
check('empty on unparseable tool content', extractGeneratedContent(runWith([{ role: 'tool', content: '{truncated json...' }])).length === 0);
check('empty when checkpoint is null', extractGeneratedContent({ ...good, checkpoint: null }).length === 0);
check('empty for null run', extractGeneratedContent(null).length === 0);

// 3. Markdown export includes the key fields.
const md = shortScriptToMarkdown(SCRIPT);
check('markdown includes hook + script + caption + CTA',
  md.includes(SCRIPT.hook) && md.includes('Most AI builders') && md.includes(SCRIPT.caption) && md.includes(SCRIPT.cta));

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} content check(s) failed`);
