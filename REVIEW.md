# Review rules for this repo

These rules are the house doctrine (CLAUDE.md) translated into things a reviewer can enforce.
They bind every AI review of this repo — in-session `/code-review`, the PR review workflow, and
any deep-review pass. Severity tiers: **Important** (flag every time, block-worthy), **Advisory**
(mention once, never block), **Nit** (max 3 per review, style only).

## Important — the invariants that cost money or trust when broken

1. **Approval spine.** Any NEW outward side effect (email, SMS, social post, e-signature,
   deploy, payment, physical mail, repo push — anything leaving the system) must be an
   `ApprovalKind` in `src/lib/garvis/execution.ts`, executed only by a server-side executor
   that re-verifies the payload hash (`supabase/functions/_shared/payloadHash.ts`) against the
   approved row before acting. The reference set is the existing executors (`send-email`,
   `send-sms`, `social-publish`, `docusign-send`, `deploy-site`, `deploy-backend`, and the
   worker drains). Flag: an edge function performing outbound I/O without hash re-verification;
   any client-side direct send; any path where model output triggers an external action without
   a pending approval row or an `autonomy_grants` check via `_shared/autonomyGate.ts`.
2. **Unattended spend.** Every server-side model call is gated by `checkCredits` AND recorded
   by `spendCredits` (`_shared/credits.ts`) — `verify:creditguard` pins this; flag any new
   model call that would fail it, and any retry loop around a spend path without an attempt cap.
3. **Honesty spine.** No fabricated or estimated numbers presented as real; no hours-saved
   claims or persona language (banned by `automationCards.verify.ts`); failures surface as
   named, actionable messages (the `invokeFailure` pattern), never raw plumbing; degraded
   features say exactly what to set up, never fake results; progress/mind events are written
   when the thing HAPPENED, not when it was enqueued.
4. **Pairing rule.** New pure logic ships as `X.ts` with `X.verify.ts` beside it, wired as a
   `verify:*` script in package.json (CI auto-discovers). Flag pure logic landing without its
   suite, and logic embedded in an impure `*Run.ts` or component that belongs in a core.
5. **Migration discipline.** Migrations are additive and idempotent `app_01XX_*.sql`; numbers
   are never reused (re-derive the next number from `supabase/migrations/`, not from any doc);
   `supabase/_apply_garvis_all.sql` is regenerated in the same PR
   (`node scripts/generate-apply-all.mjs`); new owner-scoped tables enable RLS with
   owner-gated policies (`rls.verify.ts` will catch it — flag it earlier). A new
   `approval_kind` enum value gets its own migration file (the app_0064 precedent).
6. **Untrusted text.** External content (fetched pages, inbound messages, third-party document
   text) must not reach a model prompt as bare interpolation — flag new call sites that skip
   the quarantine/fencing pattern.

## Advisory — the product doctrine

7. **Simplicity doctrine.** One primary (orange) action per surface; occasional-use controls
   behind a disclosure, closed by default; a page must show something useful before any input
   (zero-input value); prefer folding into an existing surface over adding a route.
8. **Keyboard integrity.** Real `<button>`s, never clickable divs (`verify:selfinteraction`).
9. **Model IDs** never appear in commits, PR text, or code — configuration comes from env/vars.

## Reviewer discipline

- Every finding cites `file:line` and a concrete failure scenario — behavior claims need a
  citation, not an inference from naming.
- Max 3 nits per review. On re-review of the same PR, report new **Important** findings only.
- Skip entirely: `package-lock.json`, `supabase/_apply_garvis_all.sql` (generated),
  `prototypes/**`, `docs/**`, `public/**`.
- Do not report anything CI already enforces (typecheck, the `verify:*` sweep, build,
  deno-check, shadow-DB) — assume it runs.
- If the diff is clean, say so in one line. A short honest review beats a padded one.
