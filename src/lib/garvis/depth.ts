// src/lib/garvis/depth.ts
// THE DEPTH ENGINE (pure core) — the difference between "a smart generalist's 20-minute draft"
// and a plan that earns trust. Planning used to be single-pass: one model call, straight to the
// operator. The app GENERATION pipeline never worked that way (blueprint → contracts → verify →
// repair), and plans deserve the same engineering:
//
//     research → draft → ADVERSARIAL CRITIQUE → refine
//
// The critique pass is a red team with one job: find what makes a plan generic, unsupported, or
// operationally hollow — consultant slop that fits any business, market claims stated as fact
// without research behind them, sections with no numbers/sequences/named channels, internal
// contradictions, research findings the draft ignored. The refine pass applies every fix WITHOUT
// inventing facts: a missing number stays [YOU FILL] — depth means sharper, never faker.
//
// FAILURE DISCIPLINE: critique is an upgrade path, not a gate. An unparseable critique or a
// refine that comes back thinner than the draft ships the DRAFT — depth can only improve a plan,
// never block or degrade one. Pure: no DB, no network. Verified by depth.verify.ts.

export type CritiqueSeverity = 'must_fix' | 'sharpen';

export interface CritiquePoint {
  severity: CritiqueSeverity;
  /** Which part of the draft this targets (a section name or short quote). */
  section: string;
  /** What is wrong — generic, unsupported, hollow, contradictory, or ignoring research. */
  issue: string;
  /** The concrete instruction the refine pass will execute. */
  fix: string;
}

export interface Critique {
  verdict: 'ship' | 'refine';
  points: CritiquePoint[];
}

export const MAX_CRITIQUE_POINTS = 8;
const MIN_TEXT = 12;

export const CRITIQUE_SYSTEM = `You are the RED TEAM for a single-operator's business document. Your job is to find what
makes it weak, generic, or untrustworthy — not to praise it. Hunt specifically for:
1. CONSULTANT SLOP — advice so generic it fits any business ("leverage social media", "focus on quality").
2. UNSUPPORTED CLAIMS — market/competitor/number claims stated as fact with no research behind them and no
   "provisional" marker.
3. HOLLOW OPERATIONS — sections with no numbers, no sequences, no named channels/tools, nothing the operator
   could execute Monday morning.
4. CONTRADICTIONS — places where the document disagrees with itself or with the provided research.
5. IGNORED RESEARCH — findings in the provided research the document should have used and didn't.

Return STRICT JSON only (no fences, no preamble):
{"verdict":"ship"|"refine","points":[{"severity":"must_fix"|"sharpen","section":"<where>","issue":"<what is wrong>","fix":"<the concrete rewrite instruction>"}]}

RULES: at most ${MAX_CRITIQUE_POINTS} points, worst first. "must_fix" = the document is not credible until this changes;
"sharpen" = real improvement, not blocking. A genuinely strong document gets verdict "ship" with at most 2 sharpen
points — do not manufacture criticism. Every "fix" must be executable WITHOUT inventing facts: where a real number
is unknowable, the fix is to mark it [YOU FILL: …] or name the research that would supply it — never to make one up.`;

export const REFINE_SYSTEM = `You revise a business document by applying a red team's fixes. Rules:
- Apply EVERY numbered fix below, in place. Keep everything that was not criticized.
- Keep the document's structure and all == section == headers exactly.
- NEVER invent facts to satisfy a fix: unknowable numbers stay/become [YOU FILL: …]; unsupported claims get
  grounded in the provided research or marked provisional with the scan that would confirm them.
- Output the FULL revised document as plain text — no commentary, no fences, no change log.`;

/** Strip markdown fences defensively (same discipline as every parser here). */
function stripFences(text: string): string {
  const t = text.trim();
  const m = /^```[a-z]*\n?([\s\S]*?)\n?```$/.exec(t);
  return m ? m[1].trim() : t;
}

/**
 * Parse gauntlet for the critique. Returns null when nothing usable came back — the caller ships
 * the draft (critique failing must never cost the operator their plan).
 */
export function parseCritique(raw: string): Critique | null {
  let obj: unknown;
  try { obj = JSON.parse(stripFences(raw)); } catch { return null; }
  const o = (obj ?? {}) as Record<string, unknown>;
  const verdict = o.verdict === 'ship' ? 'ship' : o.verdict === 'refine' ? 'refine' : null;
  if (!verdict) return null;
  const rawPoints = Array.isArray(o.points) ? o.points : [];
  const points: CritiquePoint[] = [];
  for (const p of rawPoints.slice(0, MAX_CRITIQUE_POINTS)) {
    const pt = (p ?? {}) as Record<string, unknown>;
    const severity = pt.severity === 'must_fix' ? 'must_fix' : pt.severity === 'sharpen' ? 'sharpen' : null;
    const section = typeof pt.section === 'string' ? pt.section.trim() : '';
    const issue = typeof pt.issue === 'string' ? pt.issue.trim() : '';
    const fix = typeof pt.fix === 'string' ? pt.fix.trim() : '';
    if (!severity || issue.length < MIN_TEXT || fix.length < MIN_TEXT) continue; // malformed point → dropped, not guessed at
    points.push({ severity, section: section || '(whole document)', issue, fix });
  }
  return { verdict, points };
}

/** Does this critique warrant a refine pass? Ship-verdicts and pointless critiques don't. */
export function needsRefine(c: Critique): boolean {
  return c.verdict === 'refine' && c.points.length > 0;
}

/** Render the fixes as the refine pass's numbered work order (must_fix first). */
export function refineInstruction(c: Critique): string {
  const ordered = [...c.points].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'must_fix' ? -1 : 1));
  return ordered
    .map((p, i) => `${i + 1}. [${p.severity === 'must_fix' ? 'MUST FIX' : 'sharpen'}] ${p.section}: ${p.issue}\n   FIX: ${p.fix}`)
    .join('\n');
}

/** Honest provenance line for the shipped artifact — what the depth pass actually did. */
export function depthNote(c: Critique | null, refined: boolean): string {
  if (!c) return 'Depth pass: critique unavailable — shipped the reviewed draft.';
  const must = c.points.filter((p) => p.severity === 'must_fix').length;
  const sharpen = c.points.length - must;
  if (!refined) {
    return c.verdict === 'ship'
      ? `Depth pass: red team shipped the draft${sharpen ? ` (${sharpen} optional sharpen note${sharpen === 1 ? '' : 's'})` : ''}.`
      : 'Depth pass: refine came back weaker than the draft — kept the draft.';
  }
  return `Depth pass: red-teamed and refined (${must} must-fix, ${sharpen} sharpen point${sharpen === 1 ? '' : 's'} applied).`;
}
