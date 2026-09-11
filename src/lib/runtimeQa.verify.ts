// Run: npx tsx src/lib/runtimeQa.verify.ts
// Runtime QA's contract (SW9.7): the three REAL scanners run over what each route actually
// rendered, the drop list only ever removes codes that would convict the wrong party, errors feed
// repair, and a route with no capture is UNSCANNED — never silently clean. Plus the wiring pins:
// both shims post the capped capture, the probe carries it per route, the build pipeline consumes
// it, and the scanner modules themselves are imported, never forked.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  QA_HTML_CAP, RUNTIME_QA_DROPPED, runtimeQa, runtimeQaFixRequest, runtimeQaLine, runtimeQaDisclosure,
} from './runtimeQa';

let passed = 0;
let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

// A document shaped like what the blob shell actually serializes: CDN scripts, shell-owned head
// (no lang, no title), the app mounted under #root. Real generated apps violate the bespoke
// landing-page contract in exactly these ways, and none of it may produce a finding.
const shellDoc = (body: string, head = '') => `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<script src="https://esm.sh/react@18.3.1"></script>
<script src="https://cdn.tailwindcss.com"></script>
${head}
<style>html,body{margin:0;height:100%}#root{min-height:100%}</style>
</head>
<body><div id="root">${body}</div></body>
</html>`;

const CLEAN_BODY = `
<h1>Invoice dashboard</h1>
<p>Track drafts, sent invoices, and payments in one place. Amounts update as clients pay.</p>
<label for="q">Search invoices</label><input id="q" type="text" />
<img src="/logo.png" alt="Acme Invoicing logo" />
<button type="button">New invoice</button>
<a href="/settings">Settings</a>`;

// ---- the planted defects (the sub-wave's acceptance) ----
{
  const defective = shellDoc(`
<h1>Sign up</h1>
<p>Create an account to start tracking invoices and payments today.</p>
<input type="email" placeholder="Email address" />
<img src="/hero.png" />
<button type="button"><svg viewBox="0 0 10 10"><path d="M0 0" /></svg></button>`);
  const report = runtimeQa({ '/': defective });
  const errors = report.findings.filter((f) => f.severity === 'error');
  check('a planted unlabeled form field surfaces as an ERROR (severity high in the rendered DOM)',
    errors.some((f) => f.code === 'a11y.input_missing_label'));
  check('a planted alt-less image surfaces as an ERROR',
    errors.some((f) => f.code === 'a11y.img_missing_alt'));
  check('a planted nameless icon button surfaces as an ERROR',
    errors.some((f) => f.code === 'a11y.empty_button'));
  const fix = runtimeQaFixRequest(report);
  check('error findings feed the repair request, named by code and route',
    fix.includes('a11y.input_missing_label') && fix.includes('on /') && fix.includes('ROOT CAUSE'));
  check('the summary line counts, never adjectivizes', /Runtime QA: \d+ to fix/.test(runtimeQaLine(report)));
}

// ---- unreplaced placeholders are a block (renderQa's lens, kept at runtime) ----
{
  const report = runtimeQa({ '/': shellDoc('<h1>Welcome</h1><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>') });
  check('unreplaced placeholder copy is an ERROR (renderQa block)',
    report.findings.some((f) => f.code === 'render.placeholder_text' && f.severity === 'error'));
}

// ---- the drop list: shell-owned and off-topic codes never fire ----
{
  const report = runtimeQa({ '/': shellDoc(CLEAN_BODY) });
  const codes = new Set(report.findings.map((f) => f.code));
  for (const dropped of ['render.external_resource', 'render.no_contact_path', 'render.no_viewport',
    'a11y.missing_lang', 'render.thin_content', 'render.not_html', 'mobile.no_click_to_call']) {
    check(`dropped code never fires at runtime: ${dropped}`, !codes.has(dropped));
  }
  check('no ERROR findings on a clean shell-shaped document',
    report.findings.every((f) => f.severity !== 'error'));
  check('every dropped code carries a stated reason',
    Object.values(RUNTIME_QA_DROPPED).every((r) => typeof r === 'string' && r.length > 10));
}

// ---- advisories: disclosed, never fed to repair ----
{
  // No <title> anywhere → a11y.missing_title (med) — an advisory in the disclosure only.
  const report = runtimeQa({ '/': shellDoc(CLEAN_BODY) });
  const advisory = report.findings.find((f) => f.code === 'a11y.missing_title');
  check('a med-severity finding lands as an advisory', advisory?.severity === 'advisory');
  check('advisories never enter the fix request', !runtimeQaFixRequest(report).includes('a11y.missing_title'));
  const disc = runtimeQaDisclosure(report);
  check('the disclosure is a collapsed <details> block naming its findings',
    disc.startsWith('<details><summary>Runtime QA') && disc.includes('a11y.missing_title') && disc.includes('</details>'));
}

// ---- aggregation across routes (an SPA shares its layout) ----
{
  const defective = shellDoc('<h1>Page</h1><p>Enough visible copy to look like a page.</p><input type="text" />');
  const report = runtimeQa({ '/': defective, '/about': defective, '/pricing': defective, '/contact': defective });
  const label = report.findings.find((f) => f.code === 'a11y.input_missing_label');
  check('an identical finding aggregates across routes instead of repeating',
    !!label && label.routes.length === 4
    && report.findings.filter((f) => f.code === 'a11y.input_missing_label').length === 1);
  check('long route lists are elided, not dumped', runtimeQaFixRequest(report).includes('+1 more'));
}

// ---- unscanned honesty ----
{
  const report = runtimeQa({ '/': shellDoc(CLEAN_BODY), '/broken': null, '/empty': '' });
  check('routes with no capture are listed unscanned, never counted clean',
    report.scanned === 1 && report.unscanned.join() === '/broken,/empty');
  check('the summary line says when routes were not captured', runtimeQaLine(report).includes('2 route(s) not captured'));
  check('the disclosure names the unscanned routes', runtimeQaDisclosure(report).includes('Not scanned') );
}
{
  const nothing = { findings: [], unscanned: [], scanned: 3 };
  check('nothing flagged is an observation, not a grade',
    runtimeQaLine(nothing) === 'Runtime QA: nothing flagged on 3 route(s)');
  check('nothing to disclose, no disclosure', runtimeQaDisclosure(nothing) === '');
  check('no captures at all → no verdict line (never an invented count)',
    runtimeQaLine({ findings: [], unscanned: ['/'], scanned: 0 }) === '');
  check('a clean report asks for no fixes', runtimeQaFixRequest(nothing) === '');
}

// ---- wiring pins (workerParity pattern: textual proof against the real sources) ----
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const adapter = read('src/lib/runtimeQa.ts');
const blobShell = read('src/components/editor/PreviewPane.tsx');
const wcShim = read('src/lib/webcontainer.ts');
const runtime = read('src/lib/previewRuntime.ts');
const probeRun = read('src/lib/renderProbeRun.ts');
const aiClient = read('src/lib/aiClient.ts');
{
  check('the adapter consumes the REAL scanners, never a fork',
    adapter.includes("from '../../supabase/functions/_shared/renderQa'")
    && adapter.includes("from '../../supabase/functions/_shared/a11yScan'")
    && adapter.includes("from '../../supabase/functions/_shared/mobileScan'"));
  for (const [name, src] of [['blob shell', blobShell], ['webcontainer shim', wcShim]] as const) {
    check(`${name} posts the capped serialized document`,
      src.includes('outerHTML.slice(0,${QA_HTML_CAP})') && src.includes('qaHtml:qaHtml()'));
  }
  check('the cap is one shared constant, imported by both shims',
    QA_HTML_CAP >= 50_000
    && blobShell.includes("import { QA_HTML_CAP } from '../../lib/runtimeQa'")
    && wcShim.includes("import { QA_HTML_CAP } from './runtimeQa'"));
  check('the snapshot store carries qaHtml but the PROMPT context never does (token honesty)',
    runtime.includes('qaHtml: string | null') && !runtime.includes('s.qaHtml'));
  check('the probe clears the previous route\'s capture before each hop (no stale conviction)',
    probeRun.includes('error: null, qaHtml: null'));
  check('the probe accepts a capture ONLY when the shim stamped it with the requested route',
    probeRun.includes('reported === route ? s.qaHtml : null'));
  check('both shims snapshot unconditionally after a navigate (same-route hops fire no events)',
    /navigate[\s\S]{0,900}scheduleSnapshot\(\);/.test(blobShell) && /navigate[\s\S]{0,900}schedule\(\); \/\/ same-route/.test(wcShim));
  check('the build pipeline scans, repairs on errors, and re-scans after repair',
    aiClient.includes('runtimeQa(probe.htmlByRoute)') && aiClient.includes('qa = runtimeQa(again.htmlByRoute)')
    && aiClient.includes('runtimeQaFixRequest'));
  check('the summary carries the QA line and the collapsed disclosure',
    aiClient.includes('runtimeQaLine(qa)') && aiClient.includes('runtimeQaDisclosure(qa)'));
}

console.log(`\nruntimeQa.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} runtime QA check(s) failed`);
