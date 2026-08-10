# Working in this repo

## The simplicity doctrine (whole-platform audit, Aug 2026)

The operator's standing complaint was "so many options and buttons and places to go — you don't
even know what you're doing." Every surface obeys three rules, and changes that violate them
regress the product even when each added control is individually justified:

1. **Work first, chrome collapsed.** A page opens on the operator's actual work (the studio, the
   queue, the list), never on preamble. Occasional-use panels (goals, standing orders, ask bars,
   settings) live behind a thin chip strip or disclosure, closed by default. Nothing is removed —
   it is one click away.
2. **One primary action per surface.** Each page/panel has exactly one orange (primary) button —
   the thing the operator does daily. Set-once controls (destinations, music, lanes, kits,
   creating more of a thing) go behind a "setup" disclosure. Optional inputs may sit next to the
   primary action only if they feed it directly.
3. **Zero-input value.** A page must show something useful before the operator types or clicks
   anything: the best default result, the live state, or an honest empty state with the ONE next
   step. "Type something and hit search to see anything" is a defect.

Reference implementations: Home (the waking moment — actions first), Queue (one decision at a
time, keyboard pass), Prospects (one button fills the pipeline), the growth world page
(chip-strip preamble → studio), Fact Channel Studio (pulse → Draft → episodes; "Channel setup"
disclosure).

## House patterns (established across the build)

- Pure core `X.ts` + `X.verify.ts` (tsx assert suite, auto-discovered by CI via `verify:*`
  scripts) + impure `XRun.ts`. Shared client/edge logic lives in
  `supabase/functions/_shared/*Core.ts`, re-exported client-side.
- Migrations are additive/idempotent `app_01XX_*.sql`; regenerate `supabase/_apply_garvis_all.sql`
  with `node scripts/generate-apply-all.mjs`; the shadow-DB CI tier applies everything to real
  Postgres. Never reuse a migration number.
- Nothing sends without approval: consequential actions flow through the Queue (payload-hash
  approvals). Automation legibility uses the standing cards (`automationCards.ts`) — three rungs,
  no persona language, no hours-saved claims (both banned by its verify suite).
- Honesty spine: AI media carries provenance and a server-side disclosure gate; failures surface
  as named, actionable messages (`invokeFailure`), never raw plumbing; degraded features say what
  to set up, never fake results.
- `verify:selfinteraction` lints for keyboard traps (clickable divs); real `<button>`s only.
- e2e: hermetic authed-mock specs (`e2e/*.authed-mock.spec.ts`) against mocked Supabase routes;
  prefer `getByRole` with exact names — page copy legitimately repeats feature names.

## Gates before any push

`npx tsc --noEmit` · the affected `verify:*` suites (CI runs all of them) · `npm run build` ·
the growth e2e spec if UI changed. Commits end with the Claude Code trailer; model IDs never
appear in commits, PRs, or code.
