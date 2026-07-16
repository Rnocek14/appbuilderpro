# Automation opportunity detection

Turns a saved site audit into **grounded, deliverable** automation proposals — the "open
detection, bounded execution" model. Every proposal traces to something really observed on the
prospect's own page; nothing is fabricated, nothing we can't actually run is promised.

## The pieces

| File | Role |
|---|---|
| `registry.ts` | The **capability registry** — the typed catalog of what our rails can deliver. Each entry maps to a real rail (`send-email`, `invoice-chase`, `outreach-followups`, `outreach-reactivate`, `standing-worker`) and the signals that propose it. Capabilities we can see the need for but can't yet deliver are marked `status: 'not_built'` — documented, **never proposed**. |
| `detect.ts` | Derives `manual_process:*` / `platform:*` / `stack:*` signals from observed facts (siteAudit signals, `checks{}`, scraped text, and the tech fingerprint), then resolves them against the registry: deliverable matches → **proposals**; matched needs with nothing deliverable → **gaps** (the roadmap / bespoke queue). |
| `detect.verify.ts` | The detection honesty invariants (`npm run verify:automation`). |
| `triggers.ts` | The **trigger engine** — pure per-customer scheduling core. "Fire once, N days after an event on this customer's record" (recall, seasonal, post-job). Owns the **window guard** (turning a trigger on never blasts everyone due long ago) and **once-only** (a (customer, due date) fires at most once). No clock/IO — caller supplies `now` + the fire ledger. |
| `triggers.verify.ts` | The trigger invariants (`npm run verify:triggers`). |
| `triggersRun.ts` | The trigger **runner** — loads active triggers + customers + the fire ledger, computes what's due, and enqueues one **approval-gated** send per due customer through the existing one send path (claim-first idempotency). Nothing sends; each lands in the approval queue. Single-tenant today; the autonomous/heartbeat + multi-tenant version reuses this exact logic. Data model: `app_0076_automation_triggers.sql`. |

The tech fingerprint itself lives in `supabase/functions/_shared/techFingerprint.ts` (it runs
server-side in `fetch-url`, where the raw HTML is available) and is verified by
`npm run verify:techfingerprint`.

## The honesty invariants (enforced by the verify)

1. A signal is emitted **only** when the thing was observed. Missing data → no signal, never a guess
   (e.g. no scraped text ⇒ we don't assert "no online booking"; an un-fingerprinted row ⇒ no tech signals).
2. A `not_built` capability is **never** proposed — it surfaces as a gap instead (bounded execution).
3. Every proposal carries the `matchedSignal` that grounds it.
4. Detection is pure and deterministic (no model call).

## Extending it

- **New signal** you can observe → emit it in `detect.ts` `deriveSignals` with concrete `evidence`.
- **New deliverable automation** → add a `Capability` (status `ga`/`beta`) whose `matchesSignals`
  includes that signal. It becomes proposable automatically.
- **A need with no rail yet** → add the `Capability` as `not_built` (or a `GAP_HINTS` entry) so it
  shows up as an honest gap, not a promise.

## What's intentionally still thin

Detection only fires what it can ground **today**. Flagships like review automation, reactivation,
and recall are in the registry but stay quiet until their grounding signals exist (review counts,
warm-list events). As those data sources land, more of the registry lights up on its own. This is the
substrate for the **bespoke → graduation learning loop**: recurring gaps across prospects are what
tell you which capability to build next.
