# Cross-model second opinion: the Codex trial protocol

**Status: protocol only — no runs yet.** Written 2026-08-16, before the first review, so the
kill criteria below cannot drift to fit the results.

## Why try this at all (and why it might not survive)

The research that motivated this is two-sided, and both sides go on record:

- **For:** different reviewer models barely overlap — in our comparison reading, ~93% of
  findings from a second model family were unique, not duplicates. On the money/send/auth
  surfaces, one real unique catch pays for months of this.
- **Against:** the one controlled study we found on multi-model review found the second
  opinion can *hurt* overall outcomes (noise, false confidence, review fatigue). A second
  reviewer is not free even when the API bill is small.

So the trial is deliberately narrow, measured from day one, and dies on schedule if it does
not earn its keep.

## Protocol

1. **Scope** — only the security-lane paths (the `paths:` filter in
   `.github/workflows/security-review.yml` and `PROTECTED_PATHS` in `scripts/reviewGate.ts`):
   send paths, payment webhook, approval-spine shared modules, migrations. Never the whole
   diff, never UI.
2. **Trigger** — operator-invoked only (run Codex CLI/review manually against the PR diff).
   No workflow automation during the trial: an experiment does not get a lane.
3. **Standing** — advisory, always. A Codex finding never blocks anything; it becomes a PR
   comment or a note the operator triages like any other finding.
4. **The ledger is the experiment** — every Codex finding lands in
   `docs/reviews/ai-review-ledger.md` with lane `codex`, plus two extra judgments in Notes:
   - `unique` or `duplicate` (did the Claude lanes already surface it on this PR?)
   - `kept` or `dropped` (was it a real defect, by the same standard as the other lanes?)
5. **Budget** — ~$5/month cap on Codex API spend for this. Hitting the cap ends the month's
   runs; it does not extend the trial window.

## Kill criteria (pre-registered — evaluate on 2026-09-16)

After one month, the trial CONTINUES only if BOTH hold over its reviews:

1. **≥ 1 unique confirmed finding per ~10 reviews** — a real defect the Claude lanes missed,
   confirmed by reading the code, at a rate of at least one per ten Codex reviews.
2. **≥ 30% precision** — of all Codex findings logged, at least 30% were kept.

Anything less on either axis: **drop the trial**, record the closing tally at the bottom of
this file, and do not revisit without a materially different setup (different model, different
scope) and a fresh protocol. "It felt useful" does not override the numbers — that failure
mode is the exact reason the criteria are written down today.

## Tally (update as reviews run)

- Reviews run: 0
- Findings logged: 0 (unique: 0, duplicate: 0)
- Kept: 0 · Dropped: 0
- Spend this month: $0
- First run date: —
