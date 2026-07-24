# 01 — Product Vision: What This Actually Is

*Part of the system-reconstruction series. Reconstructed July 2026 from the repository, its 35+
planning documents, 233 commits, and the code itself. This document answers: what product is this,
what problem does it solve, who is it for, and what philosophy drives it.*

> **Status of this document:** synthesized primarily from the author's own reconciliation documents
> (`docs/os-blueprint.md`, `docs/holy-grail.md`, `docs/where-we-stand.md`,
> `docs/garvis-first-principles.md`, `docs/best-software-plan.md`) cross-checked against code.
> Where vision and code disagree, both are stated.

---

## 1. The one-paragraph answer

This repository contains **a personal operating system for one operator** (the author), built as two
fused halves:

1. **FableForge** — a Lovable-style AI app builder: describe an app in plain language → an 11-stage
   AI pipeline drafts a blueprint, generates files, renders a sandboxed live preview, and iterates
   conversationally, with real deploys (Netlify), real backend provisioning (Supabase), GitHub
   export, and a credits-metered AI gateway for apps shipped to clients.
2. **Garvis** — an AI chief of staff (the name is a Jarvis riff): a venture-running brain with a
   grounded knowledge memory, an approval spine for everything outbound, a heartbeat of cron jobs
   that works while the operator sleeps, and an acquisition machine that scrapes local businesses,
   builds them demo websites, pitches them by email/SMS, books them, bills them, and runs their
   marketing automations.

It is explicitly **not a SaaS competing for strangers**. The author's own words
(`docs/best-software-plan.md`): *"this is a personal operating system for one operator — create
ideas, build them into products (FableForge), ship them, and market/run them (Garvis)… The bar is
not 'would a stranger pay?' — it is 'does this multiply me, and does it keep running when I'm not
looking?'"*

## 2. The problem it solves

The operator runs (or wants to run) **many ventures at once** — a web-design/automation agency
selling to local businesses, family businesses (a recurring "mom's real estate" example), product
ideas ("Stoke" is named once), curiosity projects ("rabbit holes"). The product exists to let one
person:

- **Ideate, explore, test, build, market, and run** all of those ventures from one place
  (`docs/os-blueprint.md` §2: "your personal operating system for every idea, venture, and system
  you run… designed to hold many verticals and grow more over time. Breadth is not the bug;
  breadth is the point.").
- **Be multiplied by AI** that does real work (drafts, sites, campaigns, follow-ups, invoices)
  rather than chat.
- **Stay safe and honest** while the AI acts: nothing outbound without one approval; no invented
  numbers; refusals over fabrication.
- **Keep running unattended**: a clock (pg_cron heartbeat) that hunts clients daily, chases
  invoices, sends follow-ups, and consolidates lessons while the operator is away.

## 3. Who it is for

One person: the repository owner/operator. The README's setup flow assumes the operator promotes
*themselves* to admin. There are traces of an earlier SaaS framing (Free/Pro plans, Stripe
subscription tables, pricing pages) that the author later explicitly deprioritized: *"What
dissolves under this lens: stranger onboarding, social login, pricing-page coherence,
FableForge-as-product billing UX, teams/multiplayer"* (`docs/best-software-plan.md`). The
credits/billing engine survives — but re-aimed at **metering the client apps the operator ships**,
not at selling FableForge itself.

Second-order users exist downstream: the operator's *clients* (local businesses who receive demo
sites, booking pages, missed-call text-back automations, invoices) and the operator's *prospects*
(scraped businesses receiving pitches). They interact with published artifacts (preview sites,
claim pages, booking flows, client checkout), never with the OS itself.

## 4. The invariant loop (the product's core contract)

From `docs/os-blueprint.md` §2, stated as the invariant under every present and future vertical:

> **You speak → it drafts or does the work → one approval → it really happens → the result feeds
> the whole system's memory, so the next thing is smarter.**

The author's own audit says three of the five links are strong (draft, approve, happen) and two are
the active frontier (a unified home to speak from; a memory that compounds).

## 5. The design philosophies (recurring, explicit, load-bearing)

These appear across nearly every planning document and are enforced in code:

1. **Honesty by construction.** "No invented numbers, refusals over fabrication" (README).
   Evidence-counted claims only; the marketing/claims system had an explicit "market-claim honesty
   leak" fix (commit 4a33d39); ads copy was corrected for over-promising (abc0e57); AI-provenance
   disclosure is a "spine" (abc0e57); "honest extraction" in opportunity hunts; "money honesty"
   hardening (PR #81); a "placeholder send-gate" so nothing templated ever reaches a real prospect
   (PR #79).
2. **The approval spine.** ONE approval queue for everything outbound (`approvals` +
   `execution_runs` tables, app_0022). The author calls it "the crown jewel" — kind-agnostic, an
   inert row until `status='approved'`, executed via compare-and-set claim + payload-hash
   re-verification, writing an immutable ledger. Every rail (Resend, Netlify, Stripe, GitHub,
   Twilio, Ayrshare, DocuSign) goes through it.
3. **Works while you sleep.** The heartbeat/clock: `standing_orders` + `system_heartbeat` + ~12
   pg_cron jobs armed by `garvis_arm_heartbeat()`. "Anything that dies when the tab closes isn't a
   brain, it's a dashboard" (`docs/best-software-plan.md`).
4. **Verification as culture.** ~90 `verify:*` pure-core test suites wired into package.json and
   CI; "compile gate"; "readiness-gated merges"; "a step is complete only when QA is clean" — the
   author "vibe-codes their own brain" and treats CI as "the second operator."
5. **A vertical is data, not code.** Proven first at the studio level ("a studio is data, not
   code" — `workshops.ts`), scaled up as the target primitive `VerticalSpec`: "introducing a new
   venture kind is inserting a row" (`docs/os-blueprint.md` §4). Partially realized (charters make
   *instances* data-driven; the *type* layer still requires editing ≥4 code registries).
6. **Intention over navigation.** The first-principles doc reduces the whole product to: two nouns
   (Missions, and nothing else), one constant (the Line — the conversation bar), four postures
   (Think · Create · Execute · Observe), one subconscious (the knowledge graph), one spine
   (approvals). "Users manage intentions, never features, pages, studios, or files."
7. **Nothing built is wasted / assembly over invention.** The OS blueprint's bottom line: "the
   parts are unusually good and mostly real. What's missing is a body for them to live in… That is
   a wiring-and-assembly program, not an invention program."
8. **Subtraction comes last.** Explicit rule: duplicates are removed only after being superseded
   ("never as an amputation up front").

## 6. What the product has evolved through (short form; full story in 08-project-history.md)

The code "tells eight competing stories" (the author's phrase): app builder · chief of staff ·
marketing team · agency-in-a-box · real-estate lead tool · company genesis · second brain. The
rough arc:

1. **FableForge era** — a Lovable competitor: generation pipeline, workspace, billing, admin,
   deployments. The "legendary roadmap" (docs/legendary-roadmap.md) is about beating Lovable.
2. **Garvis birth** — an AI chief of staff bolted alongside (`/garvis/command`), with portfolio,
   runtime, knowledge, objectives, missions (migrations app_0003–app_0011).
3. **Knowledge universe era** — clusters, worlds, galaxy visualization, embeddings, world
   intelligence, genesis (company creation), the "second brain."
4. **Marketing machine / agency era** — outreach, prospects, client hunts, demo sites, claims,
   speed-to-lead, follow-ups, social, ads, video, studios and creative boards.
5. **Business operations era** — booking (the "AI-receptionist pillar"), SMS automations
   (missed-call text-back), client billing/tiers, invoicing/chasing, sending domains, DocuSign,
   MLS (real-estate vertical).
6. **Reconciliation era (July 2026)** — deep self-audits (`where-we-stand`, `best-software-plan`,
   `full-system-scan`, `garvis-master-audit`, `holy-grail`), the simplification commit ("Core loop
   up front, everything else under 'More'", 0cfc8fd), and the OS blueprint: assemble everything
   into one body — one home (the Field), one Line, one memory, one clock, one spine.

## 7. Central systems vs secondary systems

**Central (the organs, per the author's own OS blueprint):**
- The **Spine** — `approvals` + `execution_runs` (the one outbound gate + immutable ledger).
- The **Noun** — `knowledge_worlds` → `knowledge_clusters` (areas w/ charters) →
  `knowledge_artifacts`; with **missions** as bounded campaigns through a world.
- The **Home/Field** — `situation.ts` (`compileSituation()`) — the assembled state of everything.
- The **Line** — `commander.ts`, the one-call → one-decision conversation router.
- The **Memory** — mind (events/beliefs/decisions/identity), garvis_knowledge, documents,
  embeddings (pgvector), insights.
- The **Clock** — `standing_orders` + `system_heartbeat` + pg_cron + worker edge functions.
- The **acquisition funnel** — scrape → audit → demo site → pitch → follow-up → claim → book →
  bill (the revenue engine of the agency vertical).
- The **builder** — FableForge generation/edit/branch/deploy (re-framed late as "a tool a world
  can invoke, not a competing noun").

**Secondary / supporting:** studios (ads, copy, email, scene/video, cluster), creative boards,
explorer (rabbit-hole research), opportunity hunts, video pillar (storyboard → Shotstack; Veo
scene library), ads read-only sync/watch, DocuSign paperwork, MLS sync, voice-inbound, GitHub
export, managed cloud (provision-supabase), credits/AI-gateway.

## 8. The long-term vision (full detail in 09-future-vision.md)

The end-state the author is driving at, distilled from `holy-grail.md` and
`garvis-first-principles.md`:

- A system that **runs arcs instead of plans** (durable projects with waiting states that resume
  themselves across approvals), **plans from situation instead of sentences** (a live world-model
  consulted on every turn), **extends itself when it creates** (generated tools mounted as rooms;
  genesis emitting new area types; "Garvis growing new organs on demand"), **earns autonomy
  instead of asking forever** (per-action-class trust dials, audited, revocable), and **proves
  itself alive every night** (canary self-tests of live wiring, not just pure logic).
- A UI reduced to **two screens**: the Field (your ventures as living orbs over a faint
  "subconscious" graph, one conversation Line, an approvals whisper) and a Mission (one surface in
  four posture "costumes"). "Which posture does it dress, and does it earn its light?" is the
  governing question for every future feature.
- **Multiple businesses connected**: worlds as the unit; lessons learned in one venture surfacing
  by meaning in another ("exploring idea A makes it smarter at venture B"); portfolio-level
  synergy opportunities (`garvis_opportunities`); per-world sender identity ("two companies,
  cleanly" — currently "~70% true" by the author's measure).

## 9. What problem the author was solving *for themselves* at the end

The last era's documents converge on one diagnosis, worth preserving verbatim because it explains
the entire current shape of the repo (`docs/os-blueprint.md` §1):

> "It is not that nothing works… The emptiness has three causes: (1) the thing you happen to touch
> is one of the few genuine dead-ends; (2) the whole machine ships switched OFF [the heartbeat is
> never armed; ~21 secrets are invisible]; (3) you built seven apps in one, with no center…
> A pile of apps sharing a sidebar is not an operating system."

So the current mission of the project — at the moment this reconstruction was made — is
**assembly**: one home, one Line, one memory, one clock, one spine, and verticals-as-data. Phase 0
of that plan ("turn it on") was defined and partially begun (health panel, go-live checklist,
setup surfacing exist — see 03-feature-inventory.md).

---

*Cross-references: 02-repository-architecture.md (how the code is laid out), 03-feature-inventory.md
(status of every feature), 05-ai-system.md (how Garvis thinks), 08-project-history.md (the full
timeline), 09-future-vision.md (planned-but-unbuilt), 14-planning-documents.md (per-document
digests of the 35 design docs).*
