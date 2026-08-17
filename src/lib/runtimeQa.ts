// src/lib/runtimeQa.ts
// RUNTIME QA (SW9.7) — pure adapter (verified by runtimeQa.verify.ts). The render probe already
// proves each route paints SOMETHING; this runs the three static scanners the platform already
// owns (renderQa, a11yScan, mobileScan — the deep-scan/publish-gate suites) over the serialized
// HTML each route actually RENDERED, so a generated app is screened with the same lenses we point
// at prospects' sites. The scanners are consumed as-is — this file only maps their findings into
// the build pipeline: error-severity findings feed the agentic repair loop, everything else folds
// into a collapsed "runtime QA" disclosure in the build summary.
//
// WHY THE DROP LIST EXISTS — the scanners were written for other documents, and running them
// verbatim over a preview snapshot would convict the wrong party:
//  - The blob shell owns the <html> tag and the <head> (viewport meta, lang, CDN scripts). A
//    finding about those describes OUR shell, not the generated app, so head-level codes are
//    dropped rather than blaming the app for markup it cannot touch. (Under WebContainer the app
//    does own its head — the drop deliberately trades that signal for one consistent behavior,
//    because the adapter cannot tell the runtimes apart and a wrong conviction costs more than a
//    missed advisory.)
//  - renderQa's contract is a self-contained bespoke LANDING PAGE: no external resources, a
//    contact path, landing-page copy floors. A React app in a preview shell legitimately violates
//    all of that, so those codes are off-topic here.
//  - Emptiness at runtime is already owned by the probe's blank-screen judge (renderProbe.ts),
//    with a floor calibrated for apps — renderQa's 200/600-char landing-page floors would flag
//    every small utility app.
//  - A browser-serialized DOM is tag-balanced by construction and the shim CAPS what it posts, so
//    the malformed/truncated-document codes could only ever false-positive here.
//
// SEVERITY MAPPING — 'error' (feeds repair) vs 'advisory' (disclosure only): renderQa 'block' and
// scanner severity 'high' are errors; everything else is an advisory. The a11y scanner hedges some
// high findings as confidence 'likely' because A STATIC page might wire the missing piece up at
// runtime (aria-label set in JS, a component library binding a label) — here the runtime already
// ran and we scan what it produced, so what the scanner sees is what assistive tech gets, and the
// hedge's stated reason does not apply. 'needs_review' findings stay advisories regardless.
//
// HONESTY: a route whose runtime never reported serialized HTML is listed as UNSCANNED, never
// silently counted as clean — and "nothing flagged" is what it says, an observation, not a grade.

import { renderQa } from '../../supabase/functions/_shared/renderQa';
import { scanAccessibility } from '../../supabase/functions/_shared/a11yScan';
import { scanMobile } from '../../supabase/functions/_shared/mobileScan';

/** What the preview shims post (document.documentElement.outerHTML, sliced to this). Large enough
 *  for a real generated app plus the shell's own chrome; the adapter notes when a capture hit it. */
export const QA_HTML_CAP = 150_000;

/** Codes dropped at runtime, each with the reason it would convict the wrong party here. */
export const RUNTIME_QA_DROPPED: Record<string, string> = {
  // Shell-owned: the preview shell writes the <html> tag and the <head>.
  'a11y.missing_lang': 'the shell owns the <html> tag',
  'render.no_viewport': 'the shell owns the <head>',
  'mobile.no_viewport': 'the shell owns the <head>',
  'mobile.viewport_not_device': 'the shell owns the <head>',
  'mobile.zoom_disabled': 'the shell owns the <head>',
  'render.external_resource': 'the shell legitimately loads React/Tailwind from CDNs',
  // Bespoke-landing-page contract, not an app.
  'render.no_contact_path': 'an app is not a prospect landing page',
  'mobile.no_click_to_call': 'an app is not a prospect landing page',
  'render.empty_body': "landing-page copy floor — the probe's blank-screen judge owns runtime emptiness",
  'render.thin_content': "landing-page copy floor — the probe's blank-screen judge owns runtime emptiness",
  // Cannot mean anything true about a capped, browser-serialized DOM.
  'render.not_html': 'the adapter only scans captures that exist; serialized DOM is always a document',
  'render.unclosed_critical': 'serialized DOM is balanced by construction; the cap would false-positive this',
  'render.script_error': 'a script that fails to parse at runtime announces itself as a console/uncaught error the probe already sees',
  // Duplicates of a11y codes that see the rendered result.
  'render.no_title': 'duplicate of a11y.missing_title',
  'render.img_missing_alt': 'duplicate of a11y.img_missing_alt',
};

export interface RuntimeQaFinding {
  code: string;                    // the scanner's stable code — never renamed here
  severity: 'error' | 'advisory';  // error ⇒ feeds the repair loop
  message: string;                 // the scanner's own observational sentence
  routes: string[];                // where it was observed (an SPA shares layout across routes)
}

export interface RuntimeQaReport {
  findings: RuntimeQaFinding[];    // errors first, then advisories, insertion order within each
  unscanned: string[];             // routes with no serialized HTML — honestly not scanned
  scanned: number;                 // routes actually scanned
}

/** Scan one route's serialized HTML through all three scanners → (code, severity, message) rows. */
function scanOne(html: string): Array<{ code: string; severity: 'error' | 'advisory'; message: string }> {
  const rows: Array<{ code: string; severity: 'error' | 'advisory'; message: string }> = [];
  for (const issue of renderQa(html).issues) {
    if (issue.code in RUNTIME_QA_DROPPED) continue;
    rows.push({ code: issue.code, severity: issue.severity === 'block' ? 'error' : 'advisory', message: issue.message });
  }
  for (const f of [...scanAccessibility(html).findings, ...scanMobile(html).findings]) {
    if (f.code in RUNTIME_QA_DROPPED) continue;
    const severity = f.severity === 'high' && f.confidence !== 'needs_review' ? 'error' : 'advisory';
    rows.push({ code: f.code, severity, message: f.detail });
  }
  return rows;
}

/** Run the scanners over every captured route and aggregate identical findings across routes. */
export function runtimeQa(htmlByRoute: Record<string, string | null>): RuntimeQaReport {
  const byKey = new Map<string, RuntimeQaFinding>();
  const unscanned: string[] = [];
  let scanned = 0;
  for (const [route, html] of Object.entries(htmlByRoute)) {
    if (!html || !html.trim()) { unscanned.push(route); continue; }
    scanned++;
    // A capture that hit the shim's cap was CUT mid-document: cross-reference checks (label
    // pairing, id targets) can false-positive on the missing half, and error-severity false
    // positives would feed the repair loop. Truncated routes report ADVISORIES only, and say so.
    const truncated = html.length >= QA_HTML_CAP;
    for (const row of scanOne(html)) {
      const severity = truncated ? 'advisory' as const : row.severity;
      const key = `${row.code}\n${row.message}`;
      const prior = byKey.get(key);
      if (prior) { if (!prior.routes.includes(route)) prior.routes.push(route); }
      else byKey.set(key, { ...row, severity, routes: [route] });
    }
    if (truncated) {
      const key = 'qa.capture_truncated\n';
      const prior = byKey.get(key);
      if (prior) { if (!prior.routes.includes(route)) prior.routes.push(route); }
      else byKey.set(key, {
        code: 'qa.capture_truncated', severity: 'advisory',
        message: `the capture hit the ${Math.round(QA_HTML_CAP / 1000)}k cap — content past the cut is unscanned, and this route's findings are advisories only`,
        routes: [route],
      });
    }
  }
  const all = [...byKey.values()];
  return {
    findings: [...all.filter((f) => f.severity === 'error'), ...all.filter((f) => f.severity === 'advisory')],
    unscanned,
    scanned,
  };
}

const routeList = (routes: string[]) =>
  routes.length > 3 ? `${routes.slice(0, 3).join(', ')} +${routes.length - 3} more` : routes.join(', ');

/** The repair context for error findings — appended to the render probe's fix request. '' when clean. */
export function runtimeQaFixRequest(report: RuntimeQaReport): string {
  const errors = report.findings.filter((f) => f.severity === 'error');
  if (!errors.length) return '';
  return [
    "Static QA over each route's RENDERED HTML found defects. Fix the ROOT CAUSE of each:",
    ...errors.map((f) => `- [${f.code}] on ${routeList(f.routes)}: ${f.message}`),
    'These were observed in the serialized runtime DOM, so a fix must change what actually renders.',
  ].join('\n');
}

/** The one-line verdict for the build summary. Counts, never adjectives; '' when nothing ran. */
export function runtimeQaLine(report: RuntimeQaReport): string {
  if (!report.scanned) return '';
  const errors = report.findings.filter((f) => f.severity === 'error').length;
  const advisories = report.findings.length - errors;
  const parts: string[] = [];
  if (errors) parts.push(`${errors} to fix`);
  if (advisories) parts.push(`${advisories} advisor${advisories === 1 ? 'y' : 'ies'}`);
  if (!parts.length) parts.push(`nothing flagged on ${report.scanned} route(s)`);
  if (report.unscanned.length) parts.push(`${report.unscanned.length} route(s) not captured`);
  return `Runtime QA: ${parts.join(', ')}`;
}

/**
 * The collapsed disclosure for the build summary — advisories (and any leftover errors) with their
 * scanner sentences, closed by default so the chat stays on the operator's work. '' when there is
 * nothing to disclose. Renders through the chat's sanitized markdown (<details> survives DOMPurify).
 */
export function runtimeQaDisclosure(report: RuntimeQaReport): string {
  if (!report.findings.length && !report.unscanned.length) return '';
  const lines = report.findings.map((f) =>
    `- ${f.severity === 'error' ? '⚠️ ' : ''}**${f.code}** (${routeList(f.routes)}) — ${f.message}`);
  if (report.unscanned.length) {
    lines.push(`- Not scanned (no HTML captured): ${report.unscanned.join(', ')}`);
  }
  return [
    `<details><summary>Runtime QA — ${report.findings.length} finding(s)</summary>`,
    '',
    ...lines,
    '',
    '</details>',
  ].join('\n');
}
