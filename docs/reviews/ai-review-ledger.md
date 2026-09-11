# AI review findings ledger

The record that decides whether the AI review lanes ever get teeth. Both lanes
(`.github/workflows/ai-review.yml`, `.github/workflows/security-review.yml`) are **report-only
today**; `scripts/reviewGate.ts` computes what a gate *would* do and the workflow echoes it
without failing anything.

## Pre-registered flip criteria (written before any data existed — do not move them after)

The gate may become a **required check** only when BOTH hold:

1. **≥ 4 weeks** of ledger entries covering real PRs through both lanes.
2. **≥ 60% precision on high-severity findings**: of all findings the reviewer marked
   `high`, at least 60% were kept (a real defect fixed or consciously accepted as real)
   rather than dropped as false positives.

Even after the flip, the gate fails ONLY on `CONFIRMED` + `high` findings touching the
protected paths in `scripts/reviewGate.ts` (`PROTECTED_PATHS`). Everything else — every
`PLAUSIBLE`, every normal/nit, every off-path finding — stays advisory forever. Malformed
reviewer output passes safe-open: a broken reviewer never blocks a hotfix.

If the criteria are not met after 8 weeks of data, the gate stays advisory and the question
re-opens only with a fresh ledger.

## How to log

One row per finding, at the time the PR is resolved (merged or closed). "Kept" means the
finding changed the code or was acknowledged as a real defect; "dropped" means it was judged
a false positive or noise. Do not log the reviewer's clean bills — only findings.

| Date | PR | Lane | File / rule | Severity | Verdict | Kept? | Notes |
| ---- | -- | ---- | ----------- | -------- | ------- | ----- | ----- |

## Running precision (update as rows land)

- High-severity findings logged: 0
- High-severity kept: 0
- Precision: n/a (no data)
- First entry date: n/a — the 4-week clock has not started.
