# 12 — Master Index: The System Reconstruction

*This folder is the master documentation for the entire system, reconstructed in July 2026 by a
full archaeological pass over the repository: every route, page, component, hook, edge function,
migration, prompt, planning document, and all 477 commits of history. Its goal: a completely new
engineering team should understand what this product is, what has been built, what is partially
built, what is planned, how every major system works, and what the long-term vision is — without
reading the original conversations or repository first.*

**Snapshot:** commit `e7fdc54`, July 24, 2026 · branch history unshallowed to the June 17 root.

---

## The system in one paragraph

**FableForge + Garvis** (repo `appbuilderpro`, package `fableforge`) is a personal AI operating
system for one operator, built in a 37-day AI-assisted sprint. It fuses a Lovable-style AI app
builder (FableForge — 11-stage generation, sandboxed preview, verified edits, real Netlify/
Supabase deploys) with an AI chief of staff (Garvis — knowledge worlds, missions/arcs, an
orchestrator over a fixed action catalog, a pg_cron heartbeat, and a client-acquisition machine
that scrapes local businesses, builds demo sites, pitches, books, bills, and automates for them).
Its two non-negotiable architectural religions are **honesty** (no invented numbers, refusals
over fabrication, enforced in parse gauntlets and send gates — in code, not prompts) and **the
approval spine** (one queue + one immutable ledger through which every outbound action must
pass). Its central tension, named by the author's own audits: the parts are unusually good and
mostly real, but the machine ships switched off (heartbeat unarmed, ~21 secrets dark) and the
whole is "seven apps sharing a sidebar" awaiting assembly into one OS — one home, one Line, one
memory, one clock, one spine.

## Reading order

**New team lead (2 hours):** 01 → 03 → 06 → 09 → 10.
**Engineer onboarding to the code:** 02 → 04 → 13 → 05 → 07.
**Product/design:** 01 → 14 (§C, the Tony Stark documents) → 09 → 08.
**"What breaks if I touch this?":** 06 (break-point index) → 03 (status tables) → 10 (§B/§C).

## The documents

| # | Document | What it contains |
|---|---|---|
| 01 | [Product Vision](01-product-vision.md) | What this actually is, for whom, the invariant loop, the eight design philosophies, central vs secondary systems, the author's final self-diagnosis |
| 02 | [Repository Architecture](02-repository-architecture.md) | Repo layout; the complete 66-entry route map with nav-linkage; every page (63) incl. dev/spike hidden surface; components, hooks, contexts; frontend placeholder inventory |
| 03 | [Feature Inventory](03-feature-inventory.md) | Every feature classified (Operational / Functional-isolated / Partial / Backend-only / Scaffolded / Experimental / Planned / Legacy / Unverified) with evidence; the built-vs-ON duality |
| 04 | [Database](04-database.md) | All 125 migrations read in order; ~124-table catalog by subsystem; the vector architecture; RLS posture; cron; legacy strata and dead schema |
| 05 | [AI System](05-ai-system.md) | The Garvis turn (modes, decision loop), Commander, Orchestrator/arcs, 25 chat tools + 21 actions, the spine, heartbeat workers, verbatim prompt inventory, 27 concept sections, the Run pattern, the verify harness, the FableForge pipeline, the preview engine, provider strategy |
| 06 | [Workflows](06-workflows.md) | ~16 end-to-end traces (UI→…→output) with exact break points; the master gate (arming + secrets); the deduplicated break-point index incl. the confirmed `send_sms` enum bug |
| 07 | [Integrations](07-integrations.md) | ~30 external services (25 live / 5 stubbed) with evidence; OAuth + connections systems; complete env-var inventory; testing/CI architecture; operational runbooks |
| 08 | [Project History](08-project-history.md) | The full 477-commit story in 9 eras; branch/PR ledger; pivotal commits (the July 14 Garvis rebrand); removed/reworked features; docs timeline; README evolution |
| 09 | [Future Vision](09-future-vision.md) | The grail end-state and its 10 gaps (with which were closed mid-sprint); the Field/Line/posture UI end-state; the OS-blueprint phase program; multi-business connection; every specced-but-unbuilt block; north-star metrics |
| 10 | [Open Questions](10-open-questions.md) | Conflicts between sources (noun: missions vs worlds; cinema vs substance; SaaS vs OS vs agency), code ambiguities (apps vs worlds, dual mission writers), resolved verifications (send_sms bug REAL), risks found by this reconstruction, questions only the operator can answer |
| 11 | [Glossary](11-glossary.md) | The project's large private vocabulary (Spine, Clock, Line, Field, World, Charter, Rabbit Hole, Genesis, Gardener, Farm, No-Theater, …), marked code ⚙ vs planning 📐 vs experimental 🧪 |
| 12 | Master Index | This document |
| 13 | [Edge Functions](13-edge-functions.md) | All 67 Supabase edge functions: purpose, trigger, tables, secrets, AI usage, status; the heartbeat scheduling architecture; the call graph; per-secret inventory |
| 14 | [Planning Documents](14-planning-documents.md) | Per-document digests of all 37 planning artifacts (the design-conversation record), organized into six families, plus chronology, recurring concepts, and contradictions |

## The five facts to internalize before touching anything

1. **Built ≠ on.** Most "real & wired" capability is dark until `garvis_arm_heartbeat()` runs
   and the relevant secret exists. The line between real and aspirational is drawn by secrets +
   one SQL call, and the Health board (`/garvis/health`) is the honest map of it.
2. **Nothing outbound moves without an approval row** (payload-hashed, CAS-claimed, ledgered in
   `execution_runs`) — except explicitly earned narrow autonomy classes. Breaking this invariant
   is the one unforgivable change.
3. **Honesty is enforced at exits, not in prompts.** Parse gauntlets, send gates, seed-source
   exclusions, `[YOU FILL]` holes, refusal paths. Removing a "friction" often removes a gate.
4. **Two nouns are still fighting** (`apps` vs `knowledge_worlds`; missions have two writers).
   The blueprint's resolution (worlds win; missions subordinate) was decided but not executed.
5. **The plans are a program, not a wishlist.** Grail gaps → defect ledger → fix waves → OS
   blueprint phases were being executed *in order* when the snapshot ends; Phase 0 ("turn it
   on") and Phase 1 (the Field + global Line) are the author's designated next moves.

## Method and confidence

Seven parallel specialized investigations (frontend, edge functions, database, AI system,
integrations/CI, git history, planning corpus) reconciled against the author's own audit
documents, with spot re-verification of load-bearing claims (deploy executors: real; marketing
publish rail: fixed; canvas social dead-end: still severed; `send_sms` enum: still broken).
Counts cited are from the final snapshot and supersede the drifting counts inside the author's
own week-by-week audits (see 10-open-questions.md §B12). Known limits of this reconstruction are
listed in 10-open-questions.md §E — chiefly: original chat conversations are not in the
repository (the 37 docs are their distillate), and live-deployment state (what's actually armed
and keyed in production) is unknowable from code.
