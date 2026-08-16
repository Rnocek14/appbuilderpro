# Deep review — 2026-08 (inaugural)

Run 2026-08-16 per `deep-review-cadence.md`. Five independent reviewers, one per fixed target;
every Important finding below was re-verified by hand against the cited lines before filing.
Dispositions: **fix-now** (follow-up commits on this branch), **accepted** (reason recorded),
**dropped** (refutation recorded). Nothing here was fixed inside the review itself.

## Verdict in one paragraph

The primitives held: payload hashing is byte-identical on both sides and all five edge executors
verify it; every worker-secret check fails closed; approve/reject CAS is sound; deploys trust
only approved payloads; cross-tenant RLS isolation is intact everywhere checked. The holes are in
**coverage and posture**: one drain never re-verifies what the human approved, the tamper-check
has an off-switch via its null-hash grandfather, three safety nets (RLS verify, creditGuard's
model-call scan, the shadow isolation slice) are each blind to exactly the newest surface, and
one media seam spends real dollars outside the entire credit wall.

## Findings

| # | Sev | Verdict | Target | Finding | Disposition |
|---|-----|---------|--------|---------|-------------|
| 1 | Important | CONFIRMED | spine + hash | The send_batch drain binds nothing: approval checked by status only — no `payload.batch_id` match, no payload hash, no content hash; batch content/recipients are owner-mutable mid-drain, `approval_id` is re-pointable, and the approval is never consumed when the batch finishes (`standing-worker/index.ts:295-299`). Content-week's `pieces_hash` precedent exists and was not applied here. | **fix-now** |
| 2 | Important | CONFIRMED | hash | The null-hash grandfather is an off-switch: `payloadMatches` passes on null, and the owner-`for all` approvals policy allows UPDATEing `payload`+`payload_hash` on rows of ANY status — an owner-session compromise can null the hash on an approved-but-retryable `deploy_backend` row and push arbitrary functions+secrets (`payloadHash.ts:31`, `app_0022:83-84`). | **fix-now** |
| 3 | Important | CONFIRMED | RLS | The static RLS net has been dark since app_0100: `rls.verify.ts:16` filters `/^app_00\d+/`, excluding all 48 `app_01XX` migrations while reporting green — the exact net REVIEW.md tells reviewers to rely on. | **fix-now** |
| 4 | Important | CONFIRMED | credits | `generate-video` spends real Veo dollars with no `checkCredits`, no `spendCredits`, no `usage_events` row — invisible to the kill switch and both caps; creditGuard.verify can't see it because it only scans `complete(`-style calls, not raw provider fetches. | **fix-now** |
| 5 | Important | CONFIRMED | credits | `spend_guard_state` (app_0127) has no `auth.uid()` pin and no revoke — any anon-key session can read any user's spend totals, caps, and kill-switch state (the same defect class app_0094 fixed for the other credit RPCs). | **fix-now** |
| 6 | Important | CONFIRMED | credits | The `usage_events` client-insert policy constrains only `user_id`; one `cost_usd = -99999` row makes a user's spend sums permanently negative — the real-dollar caps never trip for exactly the accounts worth watching. | **fix-now** |
| 7 | Important | CONFIRMED | credits | app_0094 recreated `refresh_credits` from the app_0017 text and silently dropped app_0054's `credit_grant` ledger insert — on any fresh DB, monthly grants are off the ledger and the balance arithmetic is uncheckable. | **fix-now** |
| 8 | Important | CONFIRMED | stripe | Invoice Payment Links are reusable forever (no `completed_sessions` limit, never deactivated) and a second REAL payment on a settled invoice is swallowed silently by the already-paid branch — money moved, nobody told (`invoice-payment-link/index.ts:60-66`, `stripe-webhook` invoice branch). | **fix-now** |
| 9 | Important | CONFIRMED | stripe | On a CAS miss the invoice branch unconditionally alarms "VOIDED — refund it", but a concurrent manual mark-paid also causes the miss — a loud, actionable lie that tells an obedient operator to refund real revenue. | **fix-now** |
| 10 | Important | CONFIRMED | spine | The four sender executors' `send_claimed_at` claim never expires and is not released on an unexpected throw — a provider timeout strands the approval in a permanent pending↔409 loop with a generic error. The deploy executors already carry the fix (1-hour expiry + catch-release); the senders never got it. | **fix-now** |
| 11 | Important | PLAUSIBLE | stripe | `STRIPE_WEBHOOK_SECRET ?? ''`: with the secret unset (a state the product treats as supported), empty-key HMAC is computable by anyone and the public endpoint accepts forged events — the prize is uncapped `grant_credits` minting. | **fix-now** (fail closed when unset) |
| 12 | Important | PLAUSIBLE | credits | `checkCredits` runs the kill-switch/caps block only when the guard RPC succeeded — any RPC error (timeout under load, drift) silently bypasses the kill switch; and `spendCredits` never throws, so persistent record failures blind the caps with no surfaced signal. | **fix-now** (distinguish missing-RPC from other errors) |
| 13 | Normal | PLAUSIBLE | stripe | Marker-first idempotency: an abnormal termination between marker insert and side effects (the unbounded publish-preview fetch widens the window) permanently loses a PAID event — redelivery hits "already processed" forever. | follow-up (processing-status column on `stripe_events`; bound the fetch) |
| 14 | Normal | PLAUSIBLE | spine | `revertToPending` never checks execution markers — a lost response after a completed send returns an executed approval to pending, where a Reject falsifies the record and demotes a delivered invoice to draft. | follow-up (guard on `result.sent_at`/claim) |
| 15 | Normal | CONFIRMED | spine | A partial multi-platform publish collapses to wholly-`failed` while some platforms are live; the approval strands and every record denies the live posts. | follow-up |
| 16 | Normal | CONFIRMED | spine | send_email/sms/signature executor refusals reach the operator as the generic non-2xx line — the named reasons (kill switch, cap, suppression, placeholder) are discarded; publish_post was already patched with `invokeFailure`, the other three were not. | follow-up |
| 17 | Advisory | CONFIRMED | RLS | No isolation test (shadow-DB slice or static) covers `copy_quality_events`, `garvis_line`, `proactive_spoken`; `garvis_line` (PII + code hash) most deserves a negative test — its safety rests on the ABSENCE of write policies, exactly what a future migration could regress unseen. | follow-up (with #3's net repair) |
| 18 | Advisory | CONFIRMED | RLS | `invoices.paid_via` and `command_messages.channel` are owner-writable provenance columns — same-tenant forgery of the "reconciled by Stripe" badge and the SMS channel stamp (the repo's own standard is service-role-only provenance, per `garvis_line.verified_at`). | follow-up |
| 19 | Advisory | CONFIRMED | hash | social-publish/docusign payloads are ID pointers, so the hash binds almost nothing; content gates (AI label, `decideSendable`) blunt the worst outcomes. | accepted for now — revisit if either surface grows |
| 20 | Advisory | CONFIRMED | stripe | `handleInvoicePaid` has no owner scoping on `metadata.invoice_id`; traced non-exploitable (no flow lets one actor stamp another's invoice id; the signature is the boundary) — recorded so the reliance is explicit. | accepted (falls with #11's fix) |
| 21 | Nit | CONFIRMED | gates | 13 worker-secret sites use plain `===` instead of the constant-time compare `cronGate` was built to share. | follow-up, low priority |

## Clean bills (checked and held)

- payloadHash: client/server byte-identical; all five edge executors verify before acting; no
  executor reads action fields from the request instead of the verified payload.
- Worker auth: all 15 secret-comparison sites fail closed on unset secrets; send-email's worker
  path derives the owner from the approval row and is limited to `garvis-auto` rows.
- Approve/reject CAS, atomic in-flight claims, deploy replay guards, per-message/envelope/post
  idempotency backstops: sound. No path double-sends.
- Spend-guard TOCTOU overshoot bounded to one in-flight wave; retry paths capped everywhere.
- Cross-tenant RLS isolation intact for every table checked; all three new tables correctly
  owner-gated with documented deny-all write posture; heartbeat functions keep their revokes.
- Stripe routing change (SW7.1): invoice-first ordering, client-sale and top-up fall-throughs,
  no-resurrection guard — no regression found.

## Follow-up plan

Fix-now items land as `deep-review 2026-08 fix` commits on this branch, roughly in blast-radius
order: the credit wall (#4-7, #12), the webhook posture (#8, #9, #11), the approval spine
(#1, #2, #10), the nets (#3, #17). Normals and advisories are queued behind them and re-checked
at the 2026-09 review. Next review: first week of September, same five targets + rotating focus
(SSRF surface).
