# The monthly deep review

A standing, dated, whole-surface review of the places where a bug costs money or trust — run
monthly, findings filed as a dated entry (`deep-review-YYYY-MM.md` in this directory), fixes
landed as separately-estimated follow-ups. Fix scope on the money spine is unbounded by
definition and never squeezed into the review session itself.

This is the third rung of the review stack:
1. **Every PR** — the AI review lane (`ai-review.yml`, REVIEW.md rules) + the security lane
   (`security-review.yml`) on protected paths. Report-only; the ledger measures them.
2. **In-session** — `/code-review` before substantial pushes.
3. **Monthly** — this deep review: adversarial, end-to-end, across file boundaries the per-PR
   lanes can't see.

## Fixed targets (every month, no skipping)

| # | Target | What "reviewed" means |
|---|--------|----------------------|
| 1 | Execution spine end-to-end | approvals lifecycle: CAS decisions, executor claims/releases, revert-to-pending, double-execution races, decision-record integrity |
| 2 | payloadHash, both sides | client/server canonicalization parity, every executor verifies before acting, producers hash what they store, the grandfathered null-hash path stays narrow |
| 3 | autonomyGate / cronGate / credits | worker-secret checks fail closed (unset secret ≠ open door), no ungated privileged function, spend-guard races bounded, recorded-spend integrity |
| 4 | stripe-webhook | signature, idempotency-marker races, per-handler internal idempotency, routing fallthroughs, metadata trust chain |
| 5 | RLS in new migrations | every table created since the last review: RLS + owner policies; ALTERs re-checked against existing broad policies; cross-checked against the shadow-DB isolation coverage |

Plus one **rotating focus** chosen from: SSRF surface (safeFetch call sites), untrusted-text
quarantine coverage, secrets handling in workflows, credit-grant paths.

## Discipline

- Reviewers follow REVIEW.md: file:line + a concrete failure scenario per finding, verdicts
  (CONFIRMED = full path traced / PLAUSIBLE), max 3 nits, never duplicate what CI enforces.
- Multiple independent reviewers (one per target), findings adversarially re-checked before
  filing — a finding that dies under a second read is recorded as dropped, not deleted.
- Every finding gets a disposition in the dated entry: **fix-now** (follow-up commit, linked),
  **accepted** (with the reason), or **dropped** (with the refutation). No fourth state.
- The dated entry also records the clean bills — "checked and held" is information.

## Schedule

- Run in the first week of each month. First review: **2026-08** (the inaugural entry sits
  next to this file).
- If a month is skipped, the next entry says so and covers the gap window.
