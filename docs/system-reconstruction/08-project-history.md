# 08 — Project History: The Evolution of FableForge + Garvis

*Reconstructed from git on 2026-07-24. Source of truth: `origin/main`, 477 commits, root
`19cb2d1` (2026-06-17) through `e7fdc54` (2026-07-23). The working clone was originally shallow
(cut at PR #22, 2026-07-13, 233 commits); the full history was recovered with
`git fetch --unshallow` for this reconstruction. All dates are commit dates (`--date=short`).*

---

## 0. The shape of the whole thing

The entire visible history is **37 days long** (2026-06-17 → 2026-07-23), and 457 of the 477
commits land in the final 23 days. This is not a slowly-grown codebase; it is a sustained,
agent-driven build campaign run by one operator (**Rnocek14** — Riley) with Claude doing the
majority of the authoring:

| Author (git `%an`) | Commits |
|---|---|
| Claude | 341 |
| Rnocek14 | 90 |
| fableforge | 46 |

Co-author trailers confirm the tooling: `Co-Authored-By: Claude Fable 5` (271 commits),
`Claude Opus 4.8` (90), `Claude Opus 4.8 (1M context)` (10). Several commits are direct
evidence of *parallel* Claude sessions working the same repo — e.g. `ec28172` *"Fix committed
conflict markers in deploy workflow (both sessions made the same --project-ref fix)"* and the
duplicated migration numbers documented in §6.

Daily cadence (commits/day):

```
2026-06-17: 20   2026-07-08: 38   2026-07-14: 36   2026-07-19: 11
2026-06-22:  3   2026-07-09:  8   2026-07-15: 40   2026-07-20: 18
2026-07-01:  8   2026-07-10:  7   2026-07-16: 52   2026-07-21: 20
2026-07-02:  2   2026-07-11: 22   2026-07-17: 15   2026-07-22: 19
2026-07-06:  2   2026-07-12: 36   2026-07-18: 54   2026-07-23: 14
2026-07-07: 19   2026-07-13: 33
```

The two spikes (07-16 at 52, 07-18 at 54) are the two moments when multiple long-running branch
campaigns were being landed and reconciled simultaneously.

---

## 1. Era narrative — the story told chronologically

### Era 0 — FableForge, the Lovable-clone app builder (before git → 2026-06-17)

The root commit `19cb2d1` **"Snapshot before adding plan mode"** is not a hello-world; it is a
**58-file, 11,391-line snapshot of an already-complete product**. The README at that commit opens:

> `# FableForge 🔨` — *"Your own Lovable-style AI app builder. Describe an app in plain
> language; FableForge drafts a blueprint, generates the files, renders a sandboxed live
> preview, and lets you iterate conversationally — on **your** Supabase project, with **your**
> model keys, with no per-credit meter."*

It already had the 11-stage generation pipeline, Monaco workspace, Sandpack preview, RLS'd
Supabase schema (`supabase/schema.sql`, 357 lines), Free/Pro billing stubs, and an admin panel.
The project's pre-git life is invisible, but the snapshot proves FableForge existed as a working
app builder before day one of history.

**The June 17 burst (20 commits, one day)** then layered agentic intelligence onto the builder:

- `f6508da`–`b7402aa` — plan mode (DISCUSS / PLAN / BUILD), the "Plan first" toggle, cold-start
  planning, DISCUSS-only mode.
- `9dee1fa`–`da86c31` — web research mode via the Anthropic `web_search` tool, deep research
  ("feed full source code + analyze app, then compare to competitors"), honesty calibration
  ("no fake % completeness"), markdown-rendered research.
- `08c7e7e`–`4f8d89e` — **Project Brain** (persistent vision/goals/decisions injected into every
  mode), **living Project Map**, document upload into project context, the phased "What's next"
  roadmap.
- `ad9f332`–`fd48084` — self-QA static validator, Brain redesign ("North Star"), and the
  **supervised Autopilot loop** (`efa7865`) — the first appearance of the idea that the system
  should build *itself* in a loop.

The vocabulary that later defines Garvis — brain, map, roadmap, self-check, autopilot,
honesty-over-theater — is all born here, inside the app builder.

### Era 1 — Garvis is born as a portfolio control plane (2026-06-22)

After a five-day gap, `d30d22c` **"Consolidate in-flight FableForge work (uncommitted since
2026-06-17)"** (37 files, +4,528/−403) snapshots weeks of never-committed work — multi-provider
model picker, conversation threads, WebContainer runner, theming engine, backend generation, the
QA auto-fix loops — its body noting *"The working tree held weeks of never-committed work.
Snapshotting it so the branch builds and history is honest."*

Then, in two commits, Garvis appears:

- `eca1bef` **"Garvis Week-1: portfolio control plane (apps / app_metrics / agent_runs)"** —
  `src/pages/Garvis.tsx`, `usePortfolio.ts`, and migration `app_0003_garvis_portfolio.sql`.
- `70818ac` **"Garvis Week-2: shared agent runtime chassis (no reasoning yet)"** —
  `app_0004_garvis_runtime.sql`.

Garvis's original mission: manage the *portfolio of apps that FableForge builds*. An agent that
watches apps, not yet an agent that runs a business.

### Era 2 — Productization: credits, builder overhaul, Preview Engine, the Mind (2026-07-01 → 2026-07-07)

The `garvis-control-plane-v1` branch lands as **PR #1** (`4267e92`, 07-01) carrying `2b2d1ad`
"Agentic build engine + chat polish + managed-cloud Path B" — a single commit that adds **twelve
migrations at once** (`app_0005`–`app_0016`): knowledge, objectives, app profiles, liveness,
strategy, marketing, missions, opportunities, **knowledge universe**, connections, OAuth,
managed cloud. The entire future Garvis data surface is sketched here in schema form before most
of the UI exists.

The same week is a monetization sprint: `338c861` credits foundation (`app_0017`), `194972f`
metering every AI edge function, `b15cc02` margin-driven credit re-grants, `8224ead` free-tier
model gating, then **PR #2** `591f567` "Builder overhaul: verified generation, chunked cloud
builds, monetization, design system v2" (adds Stripe + AI-gateway migrations). **PR #3**
(07-06) delivers the cinematic Explorer scene ("dive-as-travel, constellation-to-build").

July 7 is the hinge day of this era:

- `085295c` adds **Claude Fable 5 to the model picker** — the model that then co-authors most of
  the rest of the repo.
- `01e1dc8` **"Business Website Preview Engine — the app-builder side of the AI web agency"** —
  the first commit of the *sell-websites-to-local-businesses* business model that eventually
  takes over the product.
- `29419b6` **"Intelligence core v0: the owned record (events, beliefs, decisions, identity) +
  Mind page"** (`app_0019_intelligence_core.sql`) — Garvis gets a memory substrate.
- `0ccc4d9` "Prompt caching everywhere in direct mode — the $12-build fix" — cost reality
  intrudes.

### Era 3 — The architecture reckoning and the Universe/Knowledge era (2026-07-08 → 2026-07-10)

July 8 (38 commits) opens with the `claude/discussion-myiuld` branch (PRs #4–#8): Design DNA
surviving into generated apps, motion kits, the project asset library, the pipeline spine, and
two autonomy organs — `19b550b` **"Garvis worker: the unattended server-side agent runner
(laptop-closed autonomy)"** and `32e8ee0` `shot-worker` server-side screenshots *"for outreach
emails"* (outreach is already on the roadmap).

Then the defining branch of the repo begins: **`claude/garvis-system-architecture-d4cfog`**,
opening with `12bc78b` **"Garvis system architecture: full 9-repo audit + consolidation plan"**
— a 529-line doc consolidating nine repos' worth of ambition into this one. What follows on that
branch, PR after PR (#9–#16, #18), is the most conceptual stretch of the history:

- **PR #9** `ee4062d` Sprint 1: persistent brain (`app_0021_brain_vector`), execution spine
  (`app_0022`), outreach send path (`app_0023`).
- **PR #10** `e61c2c6` "Phase 5: **Work Webs** — missions become living work webs".
- **PR #11** `e1a6596` "Garvis Studios blueprint: cluster studios, **Mom Real Estate**,
  video/design harvest" — the first named real-world customer: the operator's mother's real
  estate business. Plus Cluster Studio Shell (`app_0026`) and the anticipation-layer design doc.
- **PR #12** — the metaphysics drop: `7d3d3b2` "First-principles product architecture: two
  nouns, one constant, four postures"; `43b949b` **"Garvis v3: a universe you talk to — the
  synthesis model"** (docs/garvis-universe-model.md, which credits *"the owner's spatial
  instinct: 'the whole thing is like a universe and it has different solar systems'"*);
  `c84a481` "P1: the waking moment — Garvis speaks first, from real rows"; `7f5db63` "Sprint M:
  **Living Memory** — World Intelligence, Living State, Reflection engine" (`app_0027`);
  `09e5655`/`97ba6b7` System Altitude and Universe altitude ("every world in one sky, the x-ray
  of living memory").
- **PRs #13–#15** — the **Genesis** sequence: `e1bfc59` "G1: Project Genesis — Intent → World
  DNA → generated Work Web" (`app_0028`), `d6878ea` "G2: photos become understanding"
  (`app_0029`), `d15d77b` "G3: the website bridge — a world builds its site from its own
  artwork" (`app_0030`).
- **PR #16/#18** — `3a24a69`/`7119004` "P4: the inhabited sky — WebGL universe with real depth
  and dive-as-travel", followed by `e19b7d4` audit remediation ("5 criticals + 10 highs") and
  `7f87e8b` the photographic pass ("dark dust lanes, fresnel bodies, spiked stars").

This is the **knowledge/universe era**: worlds, skies, DNA, genesis, living memory. The product
model doc set (`garvis-first-principles.md`, `garvis-universe-model.md`,
`garvis-genesis-blueprint.md`, `garvis-universe-visual-design.md`) all dates from these three days.

### Era 4 — The operator's marketing machine: heartbeat, money, one brain, and the Garvis rebrand (2026-07-11 → 2026-07-14)

Four days, ~127 commits, in which the universe grows *organs that do business*:

**July 11 — the vertical + the heartbeat.** `94f6310` G4 Market Intelligence (`app_0032_prospects`
— the prospects table is born), `f65e8c0` expertise packs, `ad1bea1` vertical intelligence,
`2b301c9` email discovery on prospect sites, `c586b51` "Direct mail becomes a real product:
print-ready 6x9 postcard + mail log", `d18807f` Ask Garvis retrieval, `940ab9c` producers layer,
`76496a0` G5 instrumentation ("sites report back, leads are first-class"), `86ce079` advertising
layer, `648e70a` "Tier 1 daily-driver: ops inbox+composer, contacts CRM, reminders, health
board", `9ad6246` video pillar, `6100d7b` deploy executor, `5d3fe2e` Goals Spine — and then the
signature triple: `505290d` **"The Heartbeat: Garvis works while you sleep + the email front
door"** (`app_0043_heartbeat`), `c81120a` speed-to-lead, `5ed5eb0` ad watchdog + reactivation,
`63496dd` "Complete the heartbeat: overnight reply drafts + the Sunday scorecard".

**July 12 — money and coherence.** `e1599c5` "F1 **The Money Loop**: invoices, gated sends, the
overnight chaser, real revenue" (`app_0047`); the UX redesign wave (`33136be` "workflow nav
16 → 7"); the **One brain** trilogy (`8734975` front door remembers, `8c299e4` "Command can
ACT", `bbe87d7` One Inbox); summoned canvases; the EXPLORE verb and rabbit-hole galaxy; the
Exploration Lab and decision laboratory; and the merge of **PRs #19–#21** including `d0cca2f`
"One Queue, one Memory, one sky" — which contains three of the seven file deletions in the whole
history (see §6).

**July 13 — hardening + the real-estate toolbelt.** Waves 1–3 (`b33d179`, `591f72c`, `f983add`:
projectRef pinning, unsubscribe loop, rate limits, credit integrity), `e6e3167` "actually close
the cross-tenant P0", then a run of durable organs: `815c9b4` Operator Assistant, `7be686c`
Deliverable Generator, `bda0b8f` Data & Numbers workspace, `08620b0` **"The clock: standing
orders"** (`app_0059`), `adc3673` forward-in mailbox, `84f2bf6` reminders that fire, `86991a0`
"The Farm: neighborhood prospecting becomes real", `4bebf7b` bulk send-to-segment (**PR #22**).
Then the Mom-Real-Estate delivery set: `e3cbe47` DocuSign e-signature, `e8e62c9` MLS/RESO data
rail, `684f936` transaction timelines, hardening A–D (code-splitting, RLS verify, Playwright
smoke, approval payload-hash binding), `74c8572` operator console, and `02e5948` **"Social
auto-posting: her real accounts, scheduled + approval-gated"** (**PR #23**) — "her" being the
first real client. Notably, `1f6fef0` ("Tier 1: make what exists true") makes the **only README
change in the repo's entire history**: `# FableForge 🔨` becomes `# FableForge 🔨 + Garvis` —
*"Two halves of one system"*, Garvis described as *"an AI chief of staff… Honest by
construction: no invented numbers, refusals over fabrication, nothing sent without your yes."*

**July 14 — the identity pivot.** `c81717c` **"Rebrand to Garvis, demote (keep) the app builder,
render work as real assets"** — the commit body records the decision verbatim: *"Riley: one
clear identity, but keep app-editing reachable. So the shell is now Garvis end-to-end and the
app builder is a demoted-but-present capability."* Nav now leads with "Operate" (Setup, Command,
Queue, Businesses, Money, Contacts, Memory, Galaxy); the app builder drops below it. The rest of
the day builds the **marketing canvas** (`6774990`), one-form campaign flow, real AI image
generation (gpt-image-1), the reel maker, the farm and MLS analysis on canvas, `33d74ea` **"Win
New Clients: one front door for the agency loop (find → audit → build → pitch)"**, the canvas
spine ("you → business → area → the work"), GitHub-repo-to-world import, money-readiness gating
— and closes with **PR #24**: `e8f1485` national sweep + `cb91a04` "Daily auto client-hunt: the
scheduling brain (rolls the country, caps itself)". The agency machine is now armed.

### Era 5 — Two campaigns in parallel: creative boards + the client-hunt sales machine (2026-07-15 → 2026-07-17)

From here to the end, work happens on **long-running parallel branches merged repeatedly**, and
the repo becomes a two-front campaign:

**Front 1 — `claude/garvis-system-architecture-d4cfog` (PRs #25, #31, #33, #35–#38):** the
creative-board system. `7bc4c8d` "Creative board: a spatial postcard workspace", `b84d3aa`
social board, `66c55f5` Email + Branding boards, groups + archive, Waves 1–4
(trust/fluidity/coherence/honesty — including `abc0e57` the "AI-provenance disclosure spine"),
`72bbeeb` "Enter the node: boards expand INTO the canvas", `f2fffdc` "The prompt box becomes
real: one LLM copy seam behind every board's words", `2c24085` "One creative system: merged
catalogs, retired duplicate rooms", `d318c59` the Idea Board + `idea_stream`, `d1ae0fb` an
editor-in-the-loop quality gate, and `ff36b28` **"docs: the Level-10 Blueprint — 7 research
specs synthesized into 6 build waves"** (517 lines).

**Front 2 — `claude/scraper-sales-model-ideas-gee7bx` (PRs #26–#30, #32, #34, #39–#42):** the
sales model. `9f7533c` persist prospect audits (Phase 0), `b2d9cc0` automation-opportunity
detection, `2d3b6d5` tech-stack fingerprinting, `789ec72`–`7a54753` **"Trigger engine …
(tentpole #1)"** + the Automations desk, `d162a8d` "Client billing: sell the tiers + track MRR
(Stripe Payment Links)", the UX funnel spine, `6845c48` unify Find onto Google Places, `9d53065`
"Deploy pipeline: the operator hour as one GitHub Action", `41341aa` **"Static export: the
$1,500 deliverable exists"**, engagement persistence ("the machine stops learning nothing"),
`b9fcc94` the multi-business P0 (contacts belong to a business), and on 07-17 the
**multi-business identity set**: per-brand social accounts (Ayrshare Profile-Keys), per-world
sender identity, per-brand Sunday scorecard.

July 16 (52 commits, the second-biggest day) is also the **deploy-pipeline slog**: nine
consecutive CI commits (`c04f1a9` go-live.sh → `55be279` garvis-go-live workflow → schema-repair
generator saga → multi-pass migration apply → `ec28172` the committed-conflict-markers fix that
proves two Claude sessions collided). Getting Supabase to deploy from CI took more commits than
some features.

### Era 6 — Preview excellence and the Orchestrator: a third front opens (2026-07-18 → 2026-07-19)

July 18 is the biggest day in history (54 commits) because a **third campaign branch** —
`claude/app-builder-branch-management-s4cqao` (PRs #44, #46, #47) — joins the two existing ones,
and all three merge into main the same day (`f94d0ba` *"Merge main into
garvis-system-architecture: reconcile both campaigns"*).

Three distinct threads interleave:

1. **Strategy self-awareness:** `5ab447e` "Add best-in-class strategy doc from full-codebase
   audit" is immediately reframed by `bdf83e2` **"Reframe strategy doc: personal operating
   brain, not SaaS"** — the doc now opens: *"this is a personal operating system for one
   operator… It is not a SaaS competing for strangers. The bar is… 'does this multiply me, and
   does it keep running when I'm not looking?'"*. Also `42b89b6` the where-we-stand capability
   audit and `1eb320b` "the holy-grail analysis: current scan + the ten structural gaps".
2. **Preview/design excellence (the demo sites that get sold):** rebuild-preview QA route,
   full-potential rebuilds, signature-device flair, the uniqueness wave, trade scenes,
   depth-sandwich hero, photoreal object guarantee, `995c7b8` the honesty guard ("hard-ban
   licensed/insured/bonded claims, even hedged"), the quant chapter, the claim chapter, and the
   **flagship artist site** lane (07-19) that ships in-app and saves as a real editable project.
3. **The Orchestrator lane:** `cffda33` "Add the Orchestrator: intent → compiled plan →
   populated system", `9abc490` the Depth Engine (plans researched, red-teamed, refined),
   `18106d9` the Opportunity Engine, `31a341a` the 33-intent coverage suite + pure action
   catalog, `1933578` client engagement layer, `1854368` Paperwork Engine, `0d5b3e5` "the
   project loop: plans become durable arcs that wait, resume, and nag" (`app_0091`), `d787501`
   the gauntlet test campaign, plus autonomy plumbing: `71cf527` the Master Switch, `d4d6c5e`
   the weekly consolidation loop, `d199d40` closed server loops.

Era 6 closes with `6491c4c` **"Add the July 2026 full-system scan: six-subsystem audit
synthesis"** (07-19) — the document that scripts the next era.

### Era 7 — The hardening campaign (2026-07-20 → 2026-07-21)

July 20 is a disciplined defect-ledger day driven by the scan: **fix passes A–E** (`2a831ef`,
`fed4940`, `f64ab24`, `b91a845`, `e271cb8`) closing labeled defects B1–B18 — heartbeat repairs,
intelligence-core defects, world-isolation leaks, security hardening, and "the
delivery-pipeline gate — 94 suites wired, fleet typechecked, deploy gated". `98cd8e9` records
the campaign in the scan doc ("full defect ledger closed"). On top of the fixes, the autonomy
architecture matures: `45fd71e` the arc wake loop, `ccc7e48` the **Situation model** ("every
planning surface sees current reality"), `11a768c` catalog expansion (14 → 20 actions, 42
intents), `dbddb3f` server-side arc advancement, `ce91109` **the nightly canary** ("the system
proves its own live wiring on the clock"), `6cdf88c` "Earned autonomy, generalized: a per-class
trust dial with instant revoke", `b4e3252` new senses (rendered fetch, calendar), `1e8ef0f`
Custom Rooms v1 + the DocuSign back half. A fourth branch, `agent/harden-garvis-execution`
(**PR #51**), contributes `aaa8df9` execution/workflow integrity hardening and `6bf8b25` the
focused Garvis workshop.

### Era 8 — The selling machine goes live: prospects, publish, SMS, booking (2026-07-21 → 2026-07-23)

The final era changes rhythm: instead of long branch campaigns, main receives a rapid stream of
**squash-merged PRs #54–#88** (PR numbers in the subjects), each one a slice of the
website-agency go-live path:

- **Pitch → sale → publish:** `fc41af4` site screenshot in the pitch email, `fbb2ea0`
  custom-automation intake, `c9695a3` **"Go Live: one-click host a demo as a real static site on
  Netlify"**, `92e3be1` "Make it mine: prospect pays → sale recorded → site auto-publishes",
  `51c502b` re-hosting scraped photos for durability, `3652237` "one-click Build & send per lead".
- **Discovery without Google:** `8e87acb` "Scrape everything: on-demand pool-filling engine +
  no-website sell list", `8635a64`/`b09089b` **"Claude web-search discovery: find + judge bad
  websites, no Google Places"** (#57), `df5e961` scrape quality (bot-blocking sites, hidden
  emails, real photos).
- **Demo quality:** `7d42b2e` premium model for every demo, `d7c6551`/`36e2763` bespoke,
  honesty-gated Claude-designed HTML demos, `9a067f9` Veo Scene Studio (photoreal scroll clips),
  `5aedcc7` Claude-designed by default + contrast gate, `e4adfd4` vision-grounded bespoke sites.
- **The automations product:** the four Twilio slices (#63–#67): SMS channel (TCPA-gated),
  channel-aware trigger runner, **missed-call text-back**, per-client config; `ea51973` ROI
  stats at the point of sale; `d71a1fc`/`6c11963` Twilio setup docs + go-live readiness panel.
- **The AI-receptionist pillar:** `a6f358f` **online booking** (`app_0109_booking`), `7e97348`
  confirmations + day-before reminders.
- **Simplification:** `0cfc8fd` **"Simplify the app: Core loop up front, everything else under
  'More'"** — the body names the disease and cure: *"The app showed ~18 items in one 'Operate'
  list — the 'everything feels difficult' problem. Now the sidebar opens on just the daily
  selling loop… Core — Home · Prospects · Queue · Clients"* — nothing deleted, everything still
  ⌘K-reachable.
- **Machine hardening A–C** (#79–#81): placeholder send-gate, publish/render reliability,
  automation correctness + money honesty.
- **Operations for real clients:** `96281d7` client connections checklist (`app_0110`),
  `7168cec` prospects pipeline staged board, `fc87c67` per-brand verified sending domains
  (`app_0111`), `275ee9d` live prospect board fixes, `24e774e` review-before-send, `e7fdc54`
  "Reply on the prospect: read their answer + a Replied filter" — the final commit.
- **The synthesis doc:** `22cf9ca` **"docs: the OS blueprint — assemble the existing organs into
  one system for life"** (PR #85, branch `claude/app-direction-purpose-gn3ffs`) — 355 lines
  whose thesis reads: *"You already built the organs of an operating system… and then wired them
  as inputs to LLM prompts and buried them behind a 25-item sidebar. The work ahead is not to
  build more. It is to assemble what exists into one body."*

History ends with the machine pointed outward: find prospects, build them a site, pitch, read
replies, take payment, publish, automate, book.

---

## 2. Branch / PR ledger

Every PR visible in merge commits or squash subjects, grouped by source branch. Branch names
were minted by Claude sessions and encode intent.

### Named branches (merge-commit PRs)

| PR(s) | Branch | Dates | What it delivered |
|---|---|---|---|
| #1, #2, #3, #6 | `garvis-control-plane-v1` | 07-01 → 07-08 | Garvis's first control plane; agentic build engine + managed-cloud Path B; credits/metering; builder overhaul (verified generation, chunked cloud builds, Stripe, design system v2); cinematic Explorer; prompt-caching cost fix; motion kit v2 |
| #4, #5, #7, #8 | `claude/discussion-myiuld` | 07-07 → 07-08 | Intelligence core v0 + Mind page; Design DNA into generated apps; preview engagement tracking; advanced motion kit; project asset library; pipeline spine; **Garvis worker** (unattended server-side runner); shot-worker screenshots |
| #9–#16, #18–#25, #31, #33, #35–#38, #43, #45, #48, #49, #53 | `claude/garvis-system-architecture-d4cfog` | 07-08 → 07-21 | The dominant line (25 PRs): 9-repo architecture audit; brain/execution/outreach spine; Work Webs; Cluster Studios + Mom Real Estate; first-principles + **universe model**; Living Memory; Genesis G1–G3; the inhabited-sky WebGL universe; heartbeat-era ops; hardening waves; standing orders; the Farm; DocuSign/MLS/timelines; social auto-posting; **the Garvis rebrand**; marketing canvas; national client-hunt; creative boards; Level-10 blueprint; CI/deploy pipeline; multi-business fixes; flagship artist site |
| #26–#30, #32, #34, #39–#42 | `claude/scraper-sales-model-ideas-gee7bx` | 07-15 → 07-18 | The sales model (11 PRs): persisted prospect audits; automation-opportunity detection + tech-stack fingerprinting; **trigger engine** (tentpole #1) + Automations desk; client billing/MRR (Stripe Payment Links); funnel-spine UX; Google Places unification; deploy-as-GitHub-Action; static export ("the $1,500 deliverable"); engagement feedback loops; multi-business identity (per-brand social/email/scorecard); content quality |
| #44, #46, #47, #50, #52, #55, #58, #87 | `claude/app-builder-branch-management-s4cqao` | 07-18 → 07-23 | Preview/design excellence lane + orchestrator support (8 PRs): feature branches with readiness-gated merge; rebuild-preview QA; signature-device flair; uniqueness wave; trade scenes; heroes (portal-zoom, depth-sandwich, layers); test campaign; quant/claim chapters; Netlify Go Live; sale → auto-publish; scrape-everything; Claude web-search discovery; review-before-send |
| #51 | `agent/harden-garvis-execution` | 07-20 → 07-21 | Execution/workflow integrity hardening (`app_0092_execution_truth`); the focused Garvis workshop experience |
| #85 | `claude/app-direction-purpose-gn3ffs` | 07-23 | `docs/os-blueprint.md` — the "one system for life" reconciliation doc |
| #17 | `Rnocek14/main` | 07-10 | Cross-fork sync merge (no feature content) |

### Squash-merged PRs (number in subject, no branch preserved)

| PRs | Dates | Theme |
|---|---|---|
| #54, #56, #57 | 07-21 | Pitch email w/ site + custom-automation intake; scrape-everything pool filler; Claude web-search discovery |
| #59–#62 | 07-22 | Premium-model demos; bespoke honesty-gated HTML demos (+motion); Veo Scene Studio |
| #63–#69 | 07-22 | Twilio SMS automation slices 1–4; ROI stats; Twilio docs; go-live readiness |
| #70–#76 | 07-22 | Photo re-hosting; Claude-designed default + contrast gate; one-click Build & send; vision-grounded bespoke sites; **Core-loop simplification (#74)**; scrape quality; demo conversion |
| #77–#84 | 07-23 | Online booking + reminders; machine hardening A–C; client connections; prospects pipeline board; sending domains |
| #86, #88 | 07-23 | Live prospect board fixes; reply-on-prospect + Replied filter |

(#47 merged after #48 — PR numbers are not strictly monotonic in the log. Also note `b09089b`
and `8635a64` are the same change landing twice — a branch commit and its squash (#57) — more
evidence of parallel sessions.)

---

## 3. Pivotal commits in depth

| Commit | Date | Why it matters | Stat evidence |
|---|---|---|---|
| `19cb2d1` "Snapshot before adding plan mode" | 06-17 | Root commit; a full Lovable-style builder arrives whole | 58 files, +11,391 (incl. `supabase/schema.sql` 357 lines, `job-worker` 313 lines) |
| `efa7865` supervised Autopilot loop | 06-17 | First appearance of self-driving builds — the germ of Garvis | — |
| `d30d22c` "Consolidate in-flight FableForge work" | 06-22 | Confesses weeks of uncommitted work; "history is honest" becomes a stated value | 37 files, +4,528/−403 |
| `eca1bef` "Garvis Week-1: portfolio control plane" | 06-22 | **Garvis is born** — 4 files, tiny: a page, a hook, a seed, one migration | 4 files, +425 |
| `2b2d1ad` "Agentic build engine + managed-cloud Path B" | 07-01 | Lands 12 migrations (`app_0005`–`app_0016`) — Garvis's whole data surface pre-drawn, incl. `app_0013_knowledge_universe` | 12 migrations in one commit |
| `01e1dc8` "Business Website Preview Engine — the app-builder side of the AI web agency" | 07-07 | The web-agency business model enters the codebase | `20260707140000_preview_engine.sql` |
| `29419b6` "Intelligence core v0 … + Mind page" | 07-07 | Events/beliefs/decisions/identity — the memory substrate | 15 files, +1,019 (`mind.ts` 218, `Mind.tsx` 270, `app_0019` 135) |
| `12bc78b` "Garvis system architecture: full 9-repo audit" | 07-08 | Nine repos of ambition consolidated into one plan | docs only, 529 lines |
| `43b949b` "Garvis v3: a universe you talk to" | 07-08 | The product model: universe/worlds/waking-moment; written from the owner's spatial instinct | `garvis-universe-model.md` +201, mockup HTML |
| `505290d` "The Heartbeat: Garvis works while you sleep" | 07-11 | Autonomy gets a pulse; everything scheduled descends from this | `app_0043_heartbeat.sql` |
| `e1599c5` "F1 The Money Loop" | 07-12 | Invoices, gated sends, overnight chaser — revenue becomes a first-class loop | `app_0047_money_loop.sql` |
| `1f6fef0` "Tier 1: make what exists true" | 07-13 | Only README rewrite ever: "FableForge 🔨 + Garvis — two halves of one system"; adds the RUNBOOK | README + `docs/RUNBOOK.md` |
| `c81717c` **"Rebrand to Garvis, demote (keep) the app builder"** | 07-14 | **The identity pivot.** Body records the operator's decision: "Riley: one clear identity." Shell, nav, landing all become Garvis; internal `ff:*` keys deliberately kept ("contracts, not brand") | ~30 files across shell/nav/pages |
| `33d74ea` "Win New Clients: one front door for the agency loop" | 07-14 | find → audit → build → pitch becomes the product's spine | — |
| `ff36b28` "docs: the Level-10 Blueprint" | 07-16 | 7 research specs → 6 build waves; the quality campaign's script | docs only, 517 lines |
| `41341aa` "Static export: the $1,500 deliverable exists" | 07-16 | The revenue unit is named in a commit subject | — |
| `bdf83e2` "Reframe strategy doc: personal operating brain, not SaaS" | 07-18 | The strategic self-understanding flips: not a product for strangers, a multiplier for one operator | `best-software-plan.md` +109/−144 |
| `cffda33` "Add the Orchestrator: intent → compiled plan → populated system" | 07-18 | Garvis stops being pages and starts being a planner-executor | + docs/orchestrator.md |
| `6491c4c` "July 2026 full-system scan" | 07-19 | Six-subsystem audit that scripts the July-20 fix campaign (B1–B18) | `docs/full-system-scan.md` |
| `e271cb8` "Fix pass E: the delivery-pipeline gate" | 07-20 | "94 suites wired, fleet typechecked, deploy gated" — CI discipline arrives | — |
| `c9695a3` "Go Live: one-click host a demo … on Netlify" → `92e3be1` "prospect pays → site auto-publishes" | 07-21 | The money path closes end-to-end | `app_0103_preview_hosting` |
| `0cfc8fd` **"Simplify the app: Core loop up front"** (#74) | 07-22 | The subtraction moment: ~18-item nav → Core (Home · Prospects · Queue · Clients) + "More"; nothing deleted | 2 files, +126/−68 (`AppShell.tsx`, `navConfig.ts`) |
| `a6f358f` "Online booking — the AI-receptionist pillar" (#77) | 07-23 | A new pillar named as such; 1,010-line commit | `booking/index.ts` 158, `app_0109_booking.sql` 103 |
| `22cf9ca` **"docs: the OS blueprint"** | 07-23 | The reconciliation: "not to build more… assemble what exists into one body — one home, one Line, one memory, one clock, one spine" | docs only, 355 lines |

---

## 4. Removed and reworked features

The repo is remarkably **additive**: across 477 commits only **7 files were ever deleted**
(`git log --diff-filter=D --summary`). Consolidation almost always happened by rework and
demotion, not removal — a policy made explicit in `0cfc8fd` ("nothing deleted, everything still
⌘K-searchable") and `c81717c` (brand renamed, internal `ff:*` contracts kept).

### Actual deletions

| Commit | Date | Deleted | Why |
|---|---|---|---|
| `65d7111` | 07-08 | `tsconfig.tsbuildinfo` | Build artifact committed by accident at root; cleaned (it reappears in later stats — hygiene was never fully won) |
| `d0cca2f` "One Queue, one Memory, one sky" | 07-12 | `src/pages/Approvals.tsx`, `src/pages/Inbox.tsx`, `src/pages/OpsInbox.tsx` | Three separate approval/inbox surfaces collapsed into ONE Queue — the biggest true removal, and a design-review-driven one |
| `6774990` | 07-14 | `src/components/garvis/CampaignComposer.tsx` | One-form campaign composer superseded by the atmospheric **marketing canvas** |
| `8bf0cc4` | 07-14 | `src/components/garvis/canvas/ProfileCanvas.tsx` | First "You" canvas replaced same-day by the generalized **canvas spine** (you → business → area → work) |
| `197cadc` | 07-16 | `.github/workflows/garvis-go-live.yml` | Standalone go-live workflow (added the same day in `55be279`) folded into the two-mode `deploy-supabase` workflow — a same-day CI rework |

### Major reworks without deletion (the real "legacy paths")

- **Three parallel creative systems → one.** `2c24085` (07-16) documents that the audit found
  *"three parallel creative systems for the same intents"*: the new spatial boards, the older
  IdeaStudio galleries mounted on the same WorkWeb page ("with drifted duplicate catalogs
  sharing kind IDs"), and legacy modal studios summoned by StudioDock. Resolution: the board
  became the superset; duplicate rooms were retired in place.
- **Navigation, three times.** `33136be` (07-12) cut workflow nav 16 → 7; `fc0c5cb` (07-15)
  killed "which door?" drift ("one nav source, palette parity"); `0cfc8fd` (07-22) reduced the
  ~18-item Operate pile to a 4-item Core loop + "More" disclosure. Each rework demoted rather
  than deleted.
- **FableForge → Garvis branding** (`c81717c`, 07-14): every rendered string swapped; internal
  keys/events/paths (`ff:*`, `.fableforge/`, package name) intentionally preserved as contracts.
  The old brand still lives inside the machine.
- **Discovery engine, twice re-founded:** manual Find → Google Places (`6845c48`,
  `2ea4345` "Port the swift-prep-pros discovery model") → **Claude web-search discovery, "no
  Google Places"** (#57, 07-21/22). The Places path remains but is no longer the tip.
- **Prospect audits were being thrown away** until `9f7533c` "Persist prospect audits instead of
  discarding them (Phase 0)" (07-15) — an implicit admission that an earlier pipeline discarded
  its own work product.
- **Two "app_0072/0073/0086/0087/0088/0091/0092" migrations each** (see §7) — parallel branches
  minted colliding migration numbers; `688af86` explicitly "resolve[s] the app_0091 migration
  collision". The colliding files were kept side by side rather than renumbered.
- **Docs superseded by docs:** `5ab447e`'s SaaS-framed strategy doc was rewritten within hours
  by `bdf83e2` (personal operating brain); the whole 30-doc corpus was then subordinated by
  `22cf9ca`'s OS blueprint, whose stated job is "to make the other 30 docs executable".

---

## 5. Docs timeline — the planning moments

Every first-add under `docs/` (`git log --diff-filter=A -- docs/`), in order. Clusters of doc
additions reliably precede build campaigns.

| Date | Commit | Doc(s) added | Planning moment |
|---|---|---|---|
| 07-01 | `2b2d1ad` | (first docs with the managed-cloud drop: cloud-console/cloud-panel, hybrid-db, phase6-backend-tier, legendary-roadmap) | Productization plan |
| 07-08 | `12bc78b` | `garvis-system-architecture.md` | The 9-repo consolidation — Garvis's constitution |
| 07-08 | `e1a6596` | `garvis-studios-blueprint.md` | Cluster studios + **Mom Real Estate** — first real client named |
| 07-08 | `443c152` | `garvis-anticipation-design.md` | Anticipation layer / interface redesign concept |
| 07-08 | `7d3d3b2` | `garvis-first-principles.md` | "Two nouns, one constant, four postures" |
| 07-08 | `43b949b` | `garvis-universe-model.md` (+ mockups) | **The universe model** — the product metaphor |
| 07-09 | `bcf17b2` | `garvis-genesis-blueprint.md` | Genesis (G1–G3) planned before built |
| 07-09/10 | `5a898c6`, `7f87e8b` | `garvis-universe-visual-design.md`, `garvis-universe-design-scan.md` | The inhabited sky, spec'd then scanned |
| 07-11 | `46af451` | `garvis-bones-audit.md` | Circulation-fault audit |
| 07-11 | `89af03a` | `garvis-glory-sprint.md` | Email discovery / mailer / Ask Garvis retrospective |
| 07-11 | `86ce079`, `24b3500` | `garvis-advertising-plan.md`, `garvis-master-audit.md` | Ads + full-system audit |
| 07-11 | `9ad6246`, `6100d7b`, `5d3fe2e` | `garvis-video-pillar.md`, `garvis-deploy-executor.md`, `garvis-wave-a-goals.md` | Pillar-by-pillar specs |
| 07-11 | `505290d`, `c81120a`, `5ed5eb0` | `garvis-heartbeat.md`, `garvis-speed-to-lead.md`, `garvis-watchdog.md` | The autonomy organ specs |
| 07-13 | `1f6fef0` | `docs/RUNBOOK.md` | "Zero-to-ticking" operational guide (+ the README rewrite) |
| 07-15 | `7a54753`, `d162a8d` | `automation-triggers-seed.sql`, `client-billing-setup.md` | The sellable-automations plan |
| 07-16 | `ff36b28` | `garvis-level-10.md` | 7 research specs → 6 build waves |
| 07-18 | `5ab447e`→`bdf83e2` | `best-software-plan.md` (then reframed) | Strategy: **personal operating brain, not SaaS** |
| 07-18 | `42b89b6`, `cffda33`, `1eb320b` | `where-we-stand.md`, `orchestrator.md`, `holy-grail.md` | Capability audit + orchestrator + "the ten structural gaps" |
| 07-19 | `6491c4c` | `full-system-scan.md` | The six-subsystem audit that scripts the July-20 fix campaign |
| 07-22 | `d71a1fc`, `6c11963` | `twilio-setup.md`, `go-live-checklist.md` | Go-live operations |
| 07-23 | `22cf9ca` | `os-blueprint.md` | **The OS blueprint** — "assemble the existing organs into one system for life"; final doc of the history |

Pattern: the repo *thinks in documents*. Every era boundary in §1 is marked by a docs-only
commit within a day of it.

---

## 6. README evolution — how the product described itself

The README changed exactly **twice** in 477 commits:

1. **`19cb2d1` (2026-06-17):** `# FableForge 🔨` — "Your own Lovable-style AI app builder…
   on **your** Supabase project, with **your** model keys, with no per-credit meter." Pure
   builder; Garvis does not exist.
2. **`1f6fef0` (2026-07-13):** `# FableForge 🔨 + Garvis` — "Two halves of one system." Garvis
   is described as "an AI chief of staff living at `/garvis/command`: ventures…, a grounded
   knowledge brain, standing orders on a real clock, money + invoice chasing, and ONE approval
   queue for everything outbound. Honest by construction: no invented numbers, refusals over
   fabrication, nothing sent without your yes." Adds the RUNBOOK pointer.
3. **Current (`e7fdc54`, 2026-07-23):** identical to the 07-13 version.

The README therefore *lags* the product by design: it still leads with the app-builder's feature
table while the commit log had long since moved to prospect boards, Twilio automations and
booking. The truer self-descriptions moved into `docs/` — from "Lovable-style app builder"
(06-17) → "AI chief of staff, two halves of one system" (07-13) → "a personal operating system
for one operator… not a SaaS" (07-18, best-software-plan.md) → "one operating system for your
life's ideas… assemble what exists into one body" (07-23, os-blueprint.md).

---

## 7. Migration timeline — feature order encoded in schema

Two numbering schemes coexist: `app_NNNN_*.sql` (the mainline, 0002 → 0111) and a handful of
timestamp-named files (`202607…`) from the builder-overhaul week. The sequence reads as a
feature EKG:

| Range | Date(s) | What the schema says was being built |
|---|---|---|
| `app_0002` | 06-22 | Chat threads (the builder's conversations) |
| `app_0003`–`app_0004` | 06-22 | **Garvis born**: portfolio control plane, agent runtime |
| `app_0005`–`app_0016` | 07-01 | The twelve-at-once drop: knowledge, objectives, profiles, liveness, strategy, marketing, missions, opportunities, **knowledge universe**, connections, OAuth, managed cloud |
| `app_0017` + Stripe/ai-gateway timestamps | 07-01/02 | Credits + monetization |
| `20260707*` preview trio + `app_0019` | 07-07 | **Preview Engine** (engine, intelligence, events) + intelligence core (Mind) |
| `app_0020`–`app_0023` + pipeline/worker timestamps | 07-08 | Assets, brain-vector, execution spine, outreach; Garvis worker |
| `app_0024`–`app_0027` | 07-08 | Work webs, contact dedupe, cluster studio, world intelligence (Living Memory) |
| `app_0028`–`app_0030` | 07-09 | Genesis G1–G3 (genesis, photo intake, website bridge) |
| `app_0031`–`app_0042` | 07-10/11 | Ledger policy; **prospects**; audience; contact scan; mail log; site events; ad spend; connections; daily driver; deploy bundles; Wave-A security; world goals |
| `app_0043`–`app_0046` | 07-11 | **The heartbeat suite** (heartbeat, speed-to-lead, watchdog, full heartbeat) |
| `app_0047`–`app_0054` | 07-12 | **Money loop**; command thread (one brain); exploration lab; reply-handled; invoice uniqueness; working state / universal search / record integrity |
| `app_0055`–`app_0058` | 07-13 | Hardening (beliefs search, credit integrity, ref pin, job retry) |
| `app_0059`–`app_0064` | 07-13 | **The clock**: standing orders, liveness verdicts, forward-in mailbox, reminder firing, the Farm, send batches |
| `app_0065`–`app_0070` | 07-13 | The real-estate toolbelt: e-sign, MLS, timelines, territory pin, approval payload-hash, **social posts** |
| `app_0071`–`app_0073` | 07-14/15 | Reel jobs; client discovery; cluster working state — **and a fork**: the scraper branch mints its own `app_0072_prospect_audits` and `app_0073_prospect_audit_tech` (first numbering collision; both kept) |
| `app_0076`–`app_0085` | 07-15 → 07-17 | The sales machine: **automation triggers**, client billing, trigger dedupe, client-hunt standing orders, idea stream, engagement (`app_0081` also doubled: `message_engagement` vs `outreach_events`), contacts-world P0, audit proposals (`app_0082` doubled), approvals-world, per-brand social profiles, sender identity |
| `app_0086`–`app_0091` | 07-18 | Doubled numbers everywhere as three branches raced: invoice provenance / loop closing (0086×2), social metrics / system control (0087×2), content week / consolidation tick (0088×2), opportunities (0089), client engagements (0090), orchestrator plans / preview hardening (0091×2 — collision explicitly resolved in merge `688af86`) |
| `app_0092`–`app_0099` | 07-20 | The hardening campaign: heartbeat repair (0092, doubled with `execution_truth` from the harden branch), paperwork isolation, credit grant pin, **arc wake**, canary tick, autonomy, calendar sense, rooms/e-sign filing |
| `app_0101`–`app_0111` | 07-21 → 07-23 | Go-live era (note 0100 skipped): email-shot wiring, inbound automation requests, **preview hosting (Netlify)**, Stripe sub refs, scroll scenes (Veo), **SMS channel**, missed-call, client automation, **booking**, client connections, sender domains |

The duplicate numbers (`0072/0073/0081/0082/0086/0087/0088/0091/0092`) are the schema-level
fossil record of the multi-branch, multi-session campaign structure described in §2.

---

## 8. Reading the history as one arc

FableForge was a tool for building apps. Within five days of history it grew a brain, a map and
an autopilot; within a week Garvis appeared to manage the apps the tool built; within three
weeks Garvis had swallowed the product (the rebrand of 07-14), turned toward a concrete business
(an AI web agency selling $1,500 sites + monthly automations, with Mom's real-estate business as
client zero), and grew the organs of autonomy — heartbeat, clock, canary, earned-autonomy dial,
arcs that wake themselves. The final week is subtraction and go-live: one Core loop (Home ·
Prospects · Queue · Clients), one approval spine, Netlify publishing, Twilio automations,
booking. The last doc of the history (`os-blueprint.md`) states the destination the log had been
converging on: *"not to build more… assemble what exists into one body — one home, one Line, one
memory, one clock, one spine — and make every future venture a row of data, not a new page."*

Recurring values visible in commit subjects across all eras: **honesty as a feature**
("stops lying", "honest failures", "no invented numbers", "market-claim honesty leak",
"AI-provenance disclosure", "money honesty" — dozens of commits), **approval-gating of anything
outbound**, **audit → fix-wave cadence** (adversarial reviews with counted, confirmed findings),
and **docs as steering** (every campaign begins with a blueprint and ends with a scan).
