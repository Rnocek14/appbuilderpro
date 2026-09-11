// src/lib/verification.ts
// HONEST VERIFICATION STATES — pure core (verified by verification.verify.ts).
//
// "Generated" must provably mean "runs", and until now the validate stage conflated two very
// different endings: tsErrors === 0 ("verified — compiles clean") and tsErrors === null ("the
// compiler never ran") both walked away wearing 'clean'. This core gives every build and edit
// exactly one honest ending:
//
//   compiled        — the real compiler ran and found nothing
//   compile_failed  — the real compiler ran and found N errors
//   static_only     — the compiler COULD NOT run here, with the named reason and the one next
//                     step (honesty spine: degraded features say what to set up)
//   unverified      — nothing checked anything (never claimed silently; only stated)
//
// The state names below are FROZEN by the verify suite: badge strings ripple through chat
// messages, stage notes, and generation records, so changing one is a deliberate act that
// updates the suite in the same commit.

export type VerificationState =
  | { level: 'compiled' }
  | { level: 'compile_failed'; errors: number }
  | { level: 'static_only'; reason: string }
  | { level: 'unverified'; reason: string };

/** Map the compile gate's outcome onto one state. `null` gate = the gate itself was skipped. */
export function verificationFromGate(gate: { ran: boolean; errors: number; reason: string | null } | null): VerificationState {
  if (!gate) return { level: 'unverified', reason: 'the compile gate did not run' };
  if (!gate.ran) return { level: 'static_only', reason: gate.reason ?? 'the compiler could not run here' };
  return gate.errors > 0 ? { level: 'compile_failed', errors: gate.errors } : { level: 'compiled' };
}

/** The short badge / stage-note label. */
export function verificationLabel(v: VerificationState): string {
  switch (v.level) {
    case 'compiled': return 'verified — compiles clean';
    case 'compile_failed': return `compile failed — ${v.errors} type error(s)`;
    case 'static_only': return 'static checks only';
    case 'unverified': return 'unverified';
  }
}

/** The sentence for the summary message. Never the word "clean" for anything the compiler did
 *  not actually check; degraded states name the next step. */
export function verificationNote(v: VerificationState): string {
  switch (v.level) {
    case 'compiled':
      return 'Verified: the real compiler ran over the whole project and found nothing.';
    case 'compile_failed':
      return `⚠️ The compiler found ${v.errors} type error(s) that couldn't be auto-resolved — open the preview and use "Fix with AI".`;
    case 'static_only':
      return `Static checks only — ${v.reason}. The compiler has not verified this build yet.`;
    case 'unverified':
      return `Unverified — ${v.reason}.`;
  }
}

/** True when this state is allowed to present as fully checked. */
export function isCompilerVerified(v: VerificationState): boolean {
  return v.level === 'compiled';
}
