// src/lib/renderProbe.ts
// THE RENDER PROBE — pure core (verified by renderProbe.verify.ts). The runtime half of
// "generated means runs" (SW3.3): the compiler proves the code type-checks; this proves the
// routes actually RENDER. Route list is extracted from the app's own App.tsx (the same
// derive-from-the-source discipline as the page manifest), the live preview is driven route by
// route, and each route's snapshot is judged — an uncaught error or a blank screen is a named
// failure, never a shrug. The field's name for what this catches is the "Potemkin interface":
// an app that looks done while its pages crash or render nothing.

export interface RouteJudgement {
  route: string;
  ok: boolean;
  problem: string | null;
}

const ROUTE_RE = /<Route\s[^>]*?path\s*=\s*(?:"([^"]+)"|'([^']+)'|\{\s*['"]([^'"]+)['"]\s*\})/g;
const INDEX_ROUTE_RE = /<Route\s[^>]*?\bindex\b/;

/**
 * The static routes an App.tsx declares, probe-ready: parameterized (:id) and wildcard (*)
 * paths are skipped (no honest value to substitute), duplicates dropped, '/' first when the
 * app has a root or index route, capped so a 40-route app costs a bounded walk.
 */
export function extractRoutePaths(appTsx: string, cap = 12): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (p: string) => {
    let path = p.trim();
    if (!path || path.includes(':') || path.includes('*')) return;
    if (!path.startsWith('/')) path = `/${path}`;
    if (!seen.has(path)) { seen.add(path); out.push(path); }
  };
  if (INDEX_ROUTE_RE.test(appTsx)) add('/');
  let m: RegExpExecArray | null;
  while ((m = ROUTE_RE.exec(appTsx)) !== null) add(m[1] ?? m[2] ?? m[3] ?? '');
  // Root first: it is the door every operator opens first, and its failure is the loudest.
  out.sort((a, b) => (a === '/' ? -1 : b === '/' ? 1 : 0));
  return out.slice(0, cap);
}

const BLANK_DOM_CHARS = 8;

/** Judge one route's snapshot. `error` must be an error observed AFTER navigating to this
 *  route — the impure runner clears the store's error before each hop so stale errors from a
 *  previous route can never convict the next one. */
export function judgeSnapshot(route: string, snap: { error: string | null; dom: string | null }): RouteJudgement {
  if (snap.error) return { route, ok: false, problem: `uncaught error: ${snap.error.slice(0, 240)}` };
  if ((snap.dom ?? '').trim().length < BLANK_DOM_CHARS) {
    return { route, ok: false, problem: 'rendered a blank screen (no visible content, no thrown error)' };
  }
  return { route, ok: true, problem: null };
}

/** The one-line verdict for badges and the summary message. Counts, never adjectives. */
export function probeSummary(results: RouteJudgement[]): string {
  if (!results.length) return '';
  const bad = results.filter((r) => !r.ok);
  if (!bad.length) return `${results.length}/${results.length} routes render`;
  return `${bad.length} of ${results.length} route(s) broken: ${bad.map((r) => `${r.route} (${r.problem})`).join('; ')}`;
}

/** The repair context handed to the agentic fixer — names each broken route and its symptom. */
export function probeFixRequest(results: RouteJudgement[]): string {
  const bad = results.filter((r) => !r.ok);
  if (!bad.length) return '';
  return [
    'The app compiles, but DRIVING it found broken routes. Fix the ROOT CAUSE of each:',
    ...bad.map((r) => `- ${r.route}: ${r.problem}`),
    'A blank screen usually means the route renders null, a data guard never resolves, or the page component crashed before painting.',
  ].join('\n');
}
