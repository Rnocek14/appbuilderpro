# Phase 5.5 Audit Charter — binding rubric for all capability-audit documents

*Purpose: determine whether the system can actually PERFORM the work its Worlds represent — not
merely organize or prototype it. This is an operational gap analysis, not architecture. The
central test every document serves:*

> **Can this personal AI let the operator start almost any serious undertaking, assemble the
> correct expert environment, perform the work deeply, automate the repeatable portions,
> preserve the knowledge, and manage the result alongside hundreds or thousands of other active
> operations?**

**Non-goals:** no philosophy, no UI redesign, no re-litigating the operating model or the
Phase-3 grammar. The five prototypes are preserved as validated interaction experiments; this
phase determines what must be TRUE UNDERNEATH them.

## Evidence protocol (binding)

Ground every claim in the verified Phase-1 reconstruction: `docs/system-reconstruction/`
03 (feature inventory) · 04 (database) · 05 (AI system) · 06 (workflows + break points) ·
07 (integrations) · 13 (edge functions). Cite as `[R03]`, `[R13 §x]` etc. Grep the actual code
only to resolve what Phase 1 doesn't answer (e.g., "does any map component exist?"). NEVER
assert a capability without a citation or a grep result. When Phase 1 marks something 🔌
(dark-until-armed/keyed), classification below still counts it by its code reality, with the 🔌
noted.

## Classification rubric (exact — every capability gets exactly one)

| Class | Definition |
|---|---|
| **WORKING** | Closes its loop in code today (🔌 allowed) |
| **DISCONNECTED** | Built to standard but not wired to what makes it matter (the built-but-not-connected disease) |
| **PARTIAL** | One or more edges of the loop missing in code |
| **PROTOTYPE-ONLY** | Exists only in `prototypes/` or spike pages |
| **DOCUMENTED-ONLY** | Exists only in planning/experience docs |
| **MISSING** | Nowhere |
| **EXT-REQUIRED** | Needs an external API/service to exist at all (name the candidate) |
| **ARCH-CHANGE** | Requires a structural change (schema/spine/model), not just new code |

Classes combine only as `X + EXT-REQUIRED` or `X + ARCH-CHANGE` suffixes.

## Toolchain format (binding — the user's direct-mail example is the template)

Every domain document defines its complete end-to-end operational sequence(s), one table per
chain, one row per step:

| Step | Status | Evidence | Build/Buy | Owner object | Approval posture | Portfolio surface | Breaks at |
|---|---|---|---|---|---|---|---|

- **Owner object**: Capability / Workshop / Mission / Standing Order / substrate.
- **Approval posture**: `approve` (always) · `slate` (batched daily decision) · `earned`
  (autonomous after clean record, revocable) · `auto` (safely autonomous — justify) · `none`
  (internal, Initiative-inward).
- **Portfolio surface**: what of this step must be visible/actionable across many clients
  (lens, control-plane check, exception rule) or `—`.
- **Breaks at**: 10 / 100 / 1k client count where this step's current design fails, and why
  (one clause).

## Workshop spec format (binding — 14 fields, from the phase brief)

Every proposed Workshop is specified with exactly: **job · knowledge required · source data
required · direct-manipulation surface · AI's role · tools · external integrations ·
evaluation/critique criteria · output Artifacts · Missions it creates · Standing Orders it
establishes · outcome signals it learns from · expert controls · fast-path (AI-assisted)**.
Then a one-line verdict: `REUSABLE-FRAMEWORK` (the nine-bench grammar suffices) or
`DEEP-ENVIRONMENT` (needs a specialized surface — say what the grammar cannot supply). Do NOT
force mapping, visual design, coding, automation-flow, research, and campaign planning into one
canvas for consistency's sake.

## Scale gates (binding tier definitions for every "breaks at" and the roadmap)

- **T-ME** — the operator personally, this quarter (mom's real estate, first clients).
- **T-10** — ten active clients: slates, inherited service packages, per-client automations.
- **T-100** — one hundred: cohort rollouts, versioning, policy engine, exception-only attention.
- **T-1K** — one thousand: full control plane (failures, credentials, cost anomalies, policy
  violations, capability drift, canary deploys), nothing normal ever seen.
- **T-SPEC** — speculative.

## The fifteen questions (every domain document answers all, explicitly, in a closing table)

1 exists-working · 2 partial/scaffold · 3 docs/prompts/prototypes only · 4 missing · 5 build
internal · 6 external API · 7 reusable Capability · 8 domain Workshop · 9 Mission · 10 Standing
Order · 11 requires approval · 12 safe autonomous · 13 portfolio-level · 14 breaks at
10/100/1k · 15 domain knowledge/tools/feedback loops needed for mastery.

## Gap-matrix row protocol (binding — enables 13-gap-matrix aggregation)

Every domain document ENDS with a section `## Matrix rows` containing ONLY a table:

| Capability | Class | Evidence | Needed-at | Owner object | Note |

`Needed-at` ∈ {T-ME, T-10, T-100, T-1K, T-SPEC}. Keep capability names short and unique-ish;
the aggregator dedupes.

## Assignment map (evidence starting points per document)

- 01 inventory ← R03 + R13 + R07 + R05 reorganized by audit domain; flag every DISCONNECTED.
- 03 real-estate ← R03 §8 (MLS), R13 (mls-sync, render-design), R05 (farm/verticals/expertise),
  R06 §5; map/demographics: grep for map/geo components (expect MISSING).
- 04 website agency ← R03 §4/§8, R06 §5-6 (the A-grade funnel + client ops).
- 05 outreach/direct-mail ← R03 §5, R06 §5/§12, R13 (send-email family); Lob was specced in
  level-10 [R14]; SMS enum bug [R10 #10]; inbox: forward-in only [R03].
- 06 social ← R03 §6, R07 (Ayrshare), content weeks/earned autonomy [R05].
- 07 apparel/creative ← almost all new; artwork grants: docs/experience-architecture only;
  e-commerce via builder + Stripe [R03 §1/§8].
- 08 research/sim ← R03 §3, R05 (explorer, lab, depth, producers).
- 09 automation platform ← R03 §8 (triggers), R13 (standing-worker, automation-runner!),
  R04 (trigger_fires); versioning/testing/repair expect MISSING.
- 10 control plane ← R13 (system-control, garvis-canary, scorecard), R04 (execution_runs,
  autonomy_grants) as substrate; nearly all fleet-level = MISSING/ARCH-CHANGE.
- 11 build-vs-buy ← R07 catalog + each domain's EXT-REQUIRED rows.
- 12 scale/security/cost ← R07 §7, R04 (RLS/credits), R03 §10, R06 §0.
