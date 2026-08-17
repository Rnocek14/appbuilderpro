// src/lib/renderProbeRun.ts
// The render probe's impure half (pure core + contract: renderProbe.ts): drive the LIVE
// preview through the app's static routes and judge what each one actually renders. Works
// against whichever runtime is up — the blob shell and the WebContainer speak the same
// navigate command. Fail-soft by design: no live preview means an honest not-ran, and the
// walk always tries to put the operator back on the route they were looking at.

import { getPreviewSnapshot, navigatePreview, updatePreviewSnapshot } from './previewRuntime';
import { judgeSnapshot, type RouteJudgement } from './renderProbe';

const ROUTE_SETTLE_MS = 800;      // after the snapshot moves, let effects/data guards paint
const ROUTE_TIMEOUT_MS = 4_000;   // a route that never reports at all is judged on silence

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function waitForUpdate(sinceMs: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (getPreviewSnapshot().updatedAt > sinceMs) return;
    await sleep(120);
  }
}

export interface ProbeOutcome {
  ran: boolean;
  reason?: string;
  results: RouteJudgement[];
  /** Per-route serialized HTML (capped by the shim) for the runtime QA adapter (SW9.7).
   *  null = the runtime never reported a capture for that route — unscanned, never "clean". */
  htmlByRoute: Record<string, string | null>;
}

export async function probeRoutes(paths: string[]): Promise<ProbeOutcome> {
  if (!paths.length) return { ran: false, reason: 'no static routes found in App.tsx', results: [], htmlByRoute: {} };
  const original = getPreviewSnapshot().route;
  const results: RouteJudgement[] = [];
  const htmlByRoute: Record<string, string | null> = {};

  for (const route of paths) {
    // Clear the store's error BEFORE the hop: a stale error from the previous route must never
    // convict this one (the pure judge's stated precondition). qaHtml is cleared for the same
    // reason — the previous route's serialized DOM must never be scanned as this route's.
    updatePreviewSnapshot({ error: null, qaHtml: null });
    const baseline = getPreviewSnapshot().updatedAt;
    if (!navigatePreview(route)) {
      return { ran: false, reason: 'no live preview to drive — open the preview and ask me to check the routes', results, htmlByRoute };
    }
    await waitForUpdate(baseline, ROUTE_TIMEOUT_MS);
    await sleep(ROUTE_SETTLE_MS);
    const s = getPreviewSnapshot();
    results.push(judgeSnapshot(route, { error: s.error, dom: s.dom }));
    // Accept the capture ONLY when the shim says it serialized THIS route (deep review: a
    // late-debounced snapshot from the previous route — or a slow route's pre-navigation DOM —
    // must be an honest "not captured", never scanned under the wrong route's name).
    // Normalize both runtimes' spellings: blob-shell hash '#/x', WebContainer '/#/x', plain '/x'.
    const reported = (s.route ?? '').replace(/^\/?#/, '') || null;
    htmlByRoute[route] = reported === route ? s.qaHtml : null;
  }

  if (original) { updatePreviewSnapshot({ error: null }); navigatePreview(original); }
  return { ran: true, results, htmlByRoute };
}
