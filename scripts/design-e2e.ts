// scripts/design-e2e.ts
// LIVE end-to-end design verification — runs the REAL production pipeline (direction → blueprint →
// index.css tokens → shell → pages) against the configured model key, assembles the generated app
// with the real scaffold, and gates it with the real TypeScript compiler + static QA + a design
// scorecard (kit scroll usage, token discipline, direction-bundle application).
//
// Run: npx tsx scripts/design-e2e.ts            (costs real API tokens — a dollar-ish per run)
// Output: .design-e2e/app (the assembled project, inspectable) + a printed scorecard.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import {
  GENERATE_SYSTEM, GENERATE_FILES_STREAM, DIRECTIONS_SYSTEM,
  blueprintPrompt, filesPromptStream, filesPromptChunk, singleDirectionPrompt,
} from '../supabase/functions/_shared/prompts';
import { parseProtocol } from '../supabase/functions/_shared/streamparse';
import { SCAFFOLD_FILES } from '../supabase/functions/_shared/scaffold';
import { buildIndexCssForDesign, parseDesignSpec } from '../supabase/functions/_shared/themePresets';
import { validateProject } from '../supabase/functions/_shared/qa';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.design-e2e');
const APP = path.join(OUT, 'app');

// ---- config -------------------------------------------------------------
const SAMPLE_PROMPT =
  'Driftbrew — a specialty coffee subscription. A cinematic marketing site: landing page, ' +
  'how-it-works, pricing, and a subscribe flow with plan selection.';
const ARCHETYPE = { archetype: 'ORGANIC CALM', risk: 'opinionated' }; // paper tint + big radius → exercises the full bundle

// ---- plumbing -----------------------------------------------------------
function env(name: string): string {
  const m = new RegExp(`^${name}=(.*)$`, 'm').exec(fs.readFileSync(path.join(ROOT, '.env'), 'utf8'));
  return (m?.[1] ?? '').trim();
}
const API_KEY = env('VITE_AI_API_KEY');
const MODEL = env('VITE_AI_MODEL') || 'claude-sonnet-4-6';
if (!API_KEY) { console.error('No VITE_AI_API_KEY in .env — cannot run the live verification.'); process.exit(1); }

let spentIn = 0, spentOut = 0;
async function complete(system: string, user: string, maxTokens: number): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json() as { content: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number }; stop_reason?: string };
  spentIn += data.usage?.input_tokens ?? 0; spentOut += data.usage?.output_tokens ?? 0;
  if (data.stop_reason === 'max_tokens') console.warn('  ⚠ hit max_tokens');
  return data.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n');
}
function extractJson<T>(raw: string): T {
  const clean = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1)) as T;
}

const results: { name: string; ok: boolean; note?: string }[] = [];
const check = (name: string, ok: boolean, note?: string) => {
  results.push({ name, ok, note });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${note ? ` — ${note}` : ''}`);
};

// ---- the pipeline (mirrors chunkedGenerate) -------------------------------
async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(APP, { recursive: true });

  console.log('\n[1/6] DIRECTION (main model, full bundle)…');
  const dRaw = await complete(DIRECTIONS_SYSTEM, singleDirectionPrompt(SAMPLE_PROMPT, ARCHETYPE, [ARCHETYPE]), 4000);
  const direction = extractJson<{ direction?: Record<string, unknown>; directions?: Record<string, unknown>[] }>(dRaw);
  const d = (direction.direction ?? direction.directions?.[0] ?? {}) as Record<string, unknown>;
  fs.writeFileSync(path.join(OUT, 'direction-preview.html'), String(d.preview_html ?? ''));
  check('direction has token bundle (radius/mode)', Number.isFinite(Number(d.radius)) && typeof d.mode === 'string',
    `radius=${d.radius}rem mode=${d.mode} borders=${d.borders} shadows=${d.shadows} fonts=${d.headingFont}+${d.bodyFont}`);
  check('direction preview is substantial html', String(d.preview_html ?? '').length > 1500, `${String(d.preview_html ?? '').length} chars`);

  console.log('\n[2/6] BLUEPRINT (with the chosen direction)…');
  const directionCtx = [
    `DESIGN DIRECTION — the user chose "${d.name}" (${d.archetype}, ${d.risk}). Follow it EXACTLY:`,
    String(d.brief ?? ''),
    `Set the blueprint's design fields verbatim: archetype="${d.archetype}", accentHue=${d.accentHue}, accentSat=${d.accentSat}, accentLight=${d.accentLight}, headingFont="${d.headingFont}", bodyFont="${d.bodyFont}", mode="${d.mode}", surfaceSat=${d.surfaceSat}, radius=${d.radius}, borders="${d.borders}", shadows="${d.shadows}".`,
  ].join('\n');
  const bpRaw = await complete(GENERATE_SYSTEM, blueprintPrompt(`${SAMPLE_PROMPT}\n\n${directionCtx}`), 8192);
  const blueprint = extractJson<Record<string, unknown>>(bpRaw);
  const design = parseDesignSpec(blueprint.design);
  check('blueprint carries a parseable design bundle', design != null,
    design ? `hue=${design.accentHue} radius=${design.radius} mode=${design.mode} borders=${design.borders}` : 'parseDesignSpec returned null');
  check('blueprint kept the direction radius', design != null && Math.abs(Number(design.radius ?? 0.625) - Number(d.radius)) <= 0.25, `${design?.radius} vs ${d.radius}`);

  console.log('\n[3/6] TOKENS (deterministic index.css)…');
  const css = design ? buildIndexCssForDesign(design) : '';
  check('index.css applies the radius', design != null && css.includes(`--radius: ${Math.min(1.5, Math.max(0, Number(design.radius ?? 0.625)))}rem`), `${design?.radius}rem`);
  check('index.css loads the display font', !design?.headingFont || css.includes('--font-display'));

  console.log('\n[4/6] SHELL (contracts + App.tsx + layout)…');
  const bpJson = JSON.stringify(blueprint);
  const shellRaw = await complete(GENERATE_FILES_STREAM,
    filesPromptStream(bpJson, false, false) +
    '\n\nTHIS CALL — CONTRACTS + SHELL ONLY: emit /src/lib types + db.ts, /src/App.tsx (ALL routes, pages lazy-loaded), shared layout components (shell/nav/footer). Do NOT emit /src/pages/* in this call — each page is generated next against these exact contracts, so App.tsx MAY route to pages not yet emitted (this call only). End with §END.', 12000);
  const shellFiles = parseProtocol(shellRaw).changes.filter((f) => f.path && f.content.trim());
  const written = new Map(shellFiles.map((f) => [f.path, f.content]));
  const appTsx = written.get('/src/App.tsx') ?? '';
  check('shell emitted App.tsx + lib', !!appTsx && [...written.keys()].some((p) => p.startsWith('/src/lib/')), `${written.size} files`);

  console.log('\n[5/6] PAGES (parallel, 9000 tokens each)…');
  const pagePaths = new Set<string>();
  for (const m of appTsx.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) if (m[1].startsWith('./pages/')) pagePaths.add('/src/' + m[1].slice(2) + (/\.(t|j)sx?$/.test(m[1]) ? '' : '.tsx'));
  for (const m of appTsx.matchAll(/(?:^|\n)\s*import[^'"\n]*from\s*['"]([^'"]+)['"]/g)) if (m[1].startsWith('./pages/')) pagePaths.add('/src/' + m[1].slice(2) + (/\.(t|j)sx?$/.test(m[1]) ? '' : '.tsx'));
  const contractsContext = [...written.entries()].filter(([p]) => p.startsWith('/src/')).map(([p, c]) => `--- ${p} ---\n${c}`).join('\n\n').slice(0, 60000);
  const pageList = [...pagePaths].slice(0, 4); // landing + 3 — enough signal without burning the whole build
  console.log(`  generating: ${pageList.map((p) => p.split('/').pop()).join(', ')}`);
  await Promise.all(pageList.map(async (p) => {
    const r = await complete(GENERATE_FILES_STREAM, filesPromptChunk(bpJson, p, contractsContext, false, false), 9000);
    for (const f of parseProtocol(r).changes) if (f.path && f.content.trim() && !f.path.startsWith('/src/components/ui/')) written.set(f.path, f.content);
  }));
  check('every requested page was emitted', pageList.every((p) => written.has(p)), pageList.filter((p) => !written.has(p)).join(', ') || undefined);

  console.log('\n[6/6] ASSEMBLE + GATES…');
  const all = new Map<string, string>();
  for (const f of SCAFFOLD_FILES) all.set(f.path, f.content);
  all.set('/src/index.css', css);
  for (const [p, c] of written) if (!p.startsWith('/src/components/ui/')) all.set(p, c);
  for (const [p, c] of all) {
    const abs = path.join(APP, p.slice(1));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, c);
  }

  // Static QA (the production gate)
  const appFiles = [...all.entries()].map(([p, content]) => ({ path: p, content }));
  const qaErrors = validateProject(appFiles).filter((i) => i.severity === 'error');
  check('static QA: 0 errors', qaErrors.length === 0, qaErrors.slice(0, 5).map((i) => `${i.path}: ${i.message}`).join(' | ') || undefined);

  // REAL compiler
  console.log('  npm install + tsc (the real gate)…');
  execSync('npm install --no-audit --no-fund --loglevel=error', { cwd: APP, stdio: 'pipe' });
  let tscOut = '';
  try { execSync('npx tsc --noEmit', { cwd: APP, stdio: 'pipe' }); } catch (e) {
    tscOut = String((e as { stdout?: Buffer }).stdout ?? '');
  }
  const tscErrors = tscOut.split('\n').filter((l) => /error TS/.test(l));
  check('REAL tsc: 0 type errors', tscErrors.length === 0, tscErrors.slice(0, 6).join(' | ') || undefined);

  // Design scorecard over the generated (non-scaffold) sources
  const gen = [...written.entries()].filter(([p]) => /\.(t|j)sx?$/.test(p));
  const landing = gen.find(([p]) => /home|landing|index/i.test(p) && p.includes('/pages/'))?.[1]
    ?? gen.filter(([p]) => p.includes('/pages/')).map(([, c]) => c).join('\n');
  check('landing uses kit motion (ScrollScene/Parallax/CountUp/Marquee)', /ScrollScene|Parallax|CountUp|Marquee/.test(landing));
  check('landing uses scroll reveals (<Reveal> or stagger)', /<Reveal|"stagger"|'stagger'|stagger /.test(landing));
  const banned: string[] = [];
  for (const [p, c] of gen) {
    for (const m of c.matchAll(/\b(bg-white|bg-gray-\d+|bg-slate-\d+|text-gray-\d+|text-slate-\d+|text-black)\b/g)) banned.push(`${p.split('/').pop()}:${m[1]}`);
  }
  check('token discipline: no hardcoded colors', banned.length === 0, [...new Set(banned)].slice(0, 6).join(', ') || undefined);
  check('no hand-rolled scroll hooks misuse', !/useScrollProgress\s*\([^)]|\[\s*ref\s*,\s*inView\s*\]\s*=\s*useInView/.test(landing));

  // ---- summary ----
  const fails = results.filter((r) => !r.ok);
  console.log(`\n================ DESIGN E2E: ${results.length - fails.length}/${results.length} passed ================`);
  if (fails.length) for (const f of fails) console.log(`  FAILED: ${f.name}${f.note ? ` — ${f.note}` : ''}`);
  console.log(`tokens spent: ${spentIn} in / ${spentOut} out · app assembled at .design-e2e/app`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
