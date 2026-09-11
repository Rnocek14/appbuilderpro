// scripts/reviewGate.ts — the review gate's PURE core (verified by reviewGate.verify.ts).
//
// Parses an AI review's severity JSON and answers pass/fail. ADVISORY today, by pre-registered
// policy (docs/reviews/ai-review-ledger.md): the gate flips to a required check only after the
// ledger shows >= 60% precision on high-severity findings across >= 4 weeks — and even then it
// fails ONLY on CONFIRMED high-severity findings touching the protected paths below. Everything
// else stays advisory forever. Malformed input fails SAFE-OPEN with a named message: a broken
// reviewer must never block a hotfix.

export interface ReviewFinding {
  file: string;
  severity: 'high' | 'normal' | 'nit' | string;
  verdict?: 'CONFIRMED' | 'PLAUSIBLE' | string;
  summary?: string;
}

/** The paths where a confirmed high-severity finding may one day block a merge. */
export const PROTECTED_PATHS: readonly string[] = [
  'supabase/functions/send-', 'supabase/functions/sms-inbound', 'supabase/functions/social-publish',
  'supabase/functions/docusign-', 'supabase/functions/stripe-webhook', 'supabase/functions/deploy-',
  'supabase/functions/standing-worker', 'supabase/functions/garvis-line', 'supabase/functions/invoice-chase',
  'supabase/functions/_shared/payloadHash', 'supabase/functions/_shared/autonomyGate',
  'supabase/functions/_shared/cronGate', 'supabase/functions/_shared/credits',
  'src/lib/garvis/execution', 'src/lib/garvis/billing/', 'supabase/migrations/',
];

export function onProtectedPath(file: string): boolean {
  return PROTECTED_PATHS.some((p) => file.startsWith(p));
}

export interface GateVerdict {
  pass: boolean;
  reason: string;
  blocking: ReviewFinding[];
}

/** The gate: fail only on CONFIRMED high on a protected path. PLAUSIBLE never blocks (the
 *  ~79% adversarial-death rate of unverified findings is the whole reason verdicts exist). */
export function gateVerdict(raw: string): GateVerdict {
  let findings: ReviewFinding[];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const arr = Array.isArray(parsed) ? parsed : (parsed as { findings?: unknown })?.findings;
    if (!Array.isArray(arr)) return { pass: true, reason: 'no findings array — safe-open (a broken reviewer never blocks)', blocking: [] };
    findings = arr.filter((f): f is ReviewFinding => !!f && typeof (f as ReviewFinding).file === 'string');
  } catch {
    return { pass: true, reason: 'unparseable review output — safe-open (a broken reviewer never blocks)', blocking: [] };
  }
  const blocking = findings.filter((f) =>
    f.severity === 'high' && f.verdict === 'CONFIRMED' && onProtectedPath(f.file));
  return blocking.length
    ? { pass: false, reason: `${blocking.length} CONFIRMED high-severity finding(s) on protected paths`, blocking }
    : { pass: true, reason: 'no confirmed high-severity findings on protected paths', blocking: [] };
}
