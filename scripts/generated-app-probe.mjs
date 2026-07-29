// scripts/generated-app-probe.mjs — run a GENERATED APP the way a person would.
//
//   node scripts/generated-app-probe.mjs <project-dir>
//   node scripts/generated-app-probe.mjs --fixtures          (the two shipped proof fixtures)
//
// THE GAP THIS CLOSES
// generate-app plans, writes files, validates and self-heals — and never once runs what it made.
// validateProject reads source and infers; interactionIssues() (added to _shared/qa.ts) narrows
// that to "will it respond?", but it is still only reading. This builds the project with Vite,
// serves the output, and drives it in a real browser using the same generic prober that tests the
// prototypes. Two layers, reported separately, so it is obvious which one caught what.
//
// WHY IT CAN RUN WITHOUT AI KEYS
// It takes a project directory, not a prompt. The generator produces one; so do the fixtures in
// scripts/fixtures/generated-app/. That means the harness is testable — and tested — today, and
// wiring it to real generator output later is a matter of pointing it at the emitted files.
//
// HONEST LIMIT: a built app that passes here is not a good app. It compiles, boots, responds to
// every control, survives reduced motion and does not overflow a phone. Whether it does the right
// thing is not measured and cannot be measured this way.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, readdirSync, statSync, symlinkSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, extname, resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { probeUrl, launchOptions } from './lib/probe-core.mjs';
import { validateProject } from '../src/lib/qaCheck.ts';

const REPO = resolve(dirname(new URL(import.meta.url).pathname), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

/** Every source file in the project, in the shape validateProject expects. */
function collect(dir, base = '') {
  const out = [];
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === 'dist' || e === '.git') continue;
    const p = join(dir, e), rel = `${base}/${e}`;
    if (statSync(p).isDirectory()) out.push(...collect(p, rel));
    else if (/\.(tsx?|jsx?|sql)$/.test(e)) out.push({ path: rel, content: readFileSync(p, 'utf8') });
  }
  return out;
}

function serve(root) {
  return new Promise((res) => {
    const srv = createServer((req, rq) => {
      let p = join(root, decodeURIComponent(req.url.split('?')[0]));
      if (!existsSync(p) || statSync(p).isDirectory()) p = join(root, 'index.html');
      if (!existsSync(p)) { rq.writeHead(404); return rq.end('not found'); }
      rq.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
      rq.end(readFileSync(p));
    });
    srv.listen(0, '127.0.0.1', () => res({ srv, port: srv.address().port }));
  });
}

async function run(dir) {
  const name = dir.split('/').filter(Boolean).pop();
  console.log(`\n${'='.repeat(78)}\n${name}\n${'='.repeat(78)}`);
  let staticFail = 0, browserFail = 0;

  // ---- LAYER 1: the static half — what the generator's own self-heal loop sees ---------------
  const files = collect(dir);
  const issues = validateProject(files);
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  console.log(`\nSTATIC (validateProject — what the generator can see before it ships)`);
  if (!issues.length) console.log('  ok   nothing to report');
  for (const i of issues) console.log(`  ${i.severity === 'error' ? 'ERR ' : 'warn'} ${i.path} — ${i.message}`);
  staticFail = errors.length;

  // ---- build ----------------------------------------------------------------------------------
  const nm = join(dir, 'node_modules');
  if (!existsSync(nm)) symlinkSync(join(REPO, 'node_modules'), nm, 'dir');
  if (!existsSync(join(dir, 'vite.config.js')) && !existsSync(join(dir, 'vite.config.ts'))) {
    writeFileSync(join(dir, 'vite.config.js'),
      "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({ plugins: [react()], build: { minify: false } });\n");
  }
  console.log(`\nBUILD`);
  try {
    execFileSync('npx', ['vite', 'build', '--logLevel', 'error'], { cwd: dir, stdio: 'pipe' });
    console.log('  ok   vite build succeeded');
  } catch (e) {
    console.log(`  FAIL vite build failed\n${String(e.stderr || e.stdout || e).split('\n').slice(0, 8).map((l) => '       ' + l).join('\n')}`);
    return { name, staticFail, browserFail: 1, built: false };
  }

  // ---- LAYER 2: the browser half — what only running it can see -------------------------------
  const { srv, port } = await serve(join(dir, 'dist'));
  const browser = await chromium.launch(launchOptions(existsSync));
  const { findings } = await probeUrl(browser, `http://127.0.0.1:${port}/`, { name, settleMs: 25000 });
  await browser.close();
  srv.close();

  console.log(`\nBROWSER (probe-core — what only running it can see)`);
  for (const f of findings) {
    if (f.label.startsWith('·')) { console.log(`       ${f.label} ${f.detail}`); continue; }
    console.log(`  ${f.ok ? 'ok  ' : 'FAIL'} ${f.label}${f.detail ? ' — ' + f.detail : ''}`);
    if (!f.ok) browserFail++;
  }
  console.log(`\n  → static errors: ${staticFail} · static warnings: ${warnings.length} · browser problems: ${browserFail}`);
  return { name, staticFail, warnings: warnings.length, browserFail, built: true };
}

const args = process.argv.slice(2);
const FIXTURE_DIR = join(REPO, 'scripts/fixtures/generated-app');
const targets = args.includes('--fixtures')
  // Directories only — the README living beside them is documentation, not a fixture.
  ? readdirSync(FIXTURE_DIR).map((d) => join(FIXTURE_DIR, d)).filter((p) => statSync(p).isDirectory())
  : args.filter((a) => !a.startsWith('--'));
if (!targets.length) { console.error('usage: node scripts/generated-app-probe.mjs <project-dir> | --fixtures'); process.exit(2); }

const results = [];
for (const t of targets) {
  // Build in a scratch copy so fixtures stay pristine in git.
  const work = join('/tmp', `genapp-${t.split('/').pop()}-${process.pid}`);
  rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true });
  execFileSync('cp', ['-r', `${t}/.`, work]);
  results.push(await run(work));
  rmSync(work, { recursive: true, force: true });
}

console.log(`\n${'='.repeat(78)}\nSUMMARY`);
for (const r of results) {
  console.log(`  ${r.name.padEnd(22)} static errors ${String(r.staticFail).padStart(2)} · warnings ${String(r.warnings ?? 0).padStart(2)} · browser problems ${String(r.browserFail).padStart(2)}${r.built ? '' : '  (did not build)'}`);
}
console.log('\nA build that passes both layers is not a GOOD app — it is one that compiles, boots, and');
console.log('responds. Whether it does the right thing is not measured here and cannot be.');
