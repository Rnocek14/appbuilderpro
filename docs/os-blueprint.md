# The OS Blueprint — One System for Everything You Run

*The reconciliation doc. Written July 2026 after a full verified audit of the running code (43 pages
traced to their rails, 9 spine organs mapped to file+table, the 29-table data model, the on/off
reality). Its job is to make the other 30 docs **executable** by answering one question the app has
never answered for itself: how do the many capabilities you already built become **one operating
system for your life's ideas** instead of a pile of apps sharing a sidebar.*

---

## The one-sentence thesis

> **You already built the organs of an operating system — a situation model, an approval spine, a
> memory substrate, a clock, a charter/workshop engine — and then wired them as inputs to LLM
> prompts and buried them behind a 25-item sidebar. The work ahead is not to build more. It is to
> assemble what exists into one body — one home, one Line, one memory, one clock, one spine — and
> to make every future venture a row of data, not a new page.**

Everything below is that assembly, staged.

---

## 1. Why it feels empty (the honest diagnosis)

It is **not** that nothing works. A forensic trace of all 43 screens found **26 of them close a real
loop** to a real rail: email actually sends through Resend (with full CAN-SPAM/suppression gating),
posts actually publish to Ayrshare behind one approval, sites actually deploy to Netlify, invoices →
chase → paid is real, missed-call text-back fires through Twilio, the scrape → audit → demo → pitch →
follow-up funnel is real end-to-end.

The emptiness has three causes, and none of them is "the parts don't work":

1. **The thing you happen to touch is one of the few genuine dead-ends.** The "Change it with
   Garvis" social panel (`ArtifactSheet` on the Canvas) is *architecturally* incapable of
   publishing — its decision contract is only `reply | create_artifact | revise_artifact`
   (`clusterChat.ts`). It writes a text row to `knowledge_artifacts`, shows *"Made it — it's on your
   canvas,"* and the post in front of you never even updates. A real publish loop exists one room
   over (`SocialBoard` → `queueSocialPost` → approval → Ayrshare) with **no bridge** between them.
2. **The whole machine ships switched OFF.** `garvis_arm_heartbeat()` — the one call that turns on
   all 12 cron jobs — **is never invoked in app runtime** (only in docs and a CI step that defaults
   off). Every external rail *fails closed* without its key, and there are 21 invisible secrets.
   Out of the box, ~85–95% of the value-delivering surface does nothing. The clock never ticks.
3. **You built seven apps in one, with no center.** The code tells eight competing stories (app
   builder · chief of staff · marketing team · agency-in-a-box · real-estate lead tool · company
   genesis · second brain). Home drops you at a 25-item sidebar where every door advertises a
   different job. There is no single surface that says *"here is everything you are running."*

Under your actual vision — *an AI system for life to manage, market, and run all my systems* — cause
#3 is the real disease, and it has a precise name: **there is no OS.** A pile of apps sharing a
sidebar is not an operating system. The connective tissue that would make twenty verticals feel like
one system you command is exactly what's missing or dark.

---

## 2. The essence, stated as a contract

**What this system is:** your personal operating system for every idea, venture, and system you run
— a place to *ideate, explore, test, build, market, and run* — designed to hold **many** verticals
and grow more over time. Breadth is not the bug; breadth is the point. The bug is breadth *without a
spine*.

**The invariant loop under everything** (present and future verticals alike):

> **You speak → it drafts or does the work → one approval → it really happens → the result feeds the
> whole system's memory, so the next thing is smarter.**

Three of those five links are already excellent (draft, approve, happen). Two are weak: the *home you
speak from* isn't unified, and the *memory that compounds* doesn't. That's the whole gap.

**The noun (resolved).** The verified top-level unit today is the **World / Venture** — a
`knowledge_worlds` row. It is what the Universe orbs enumerate, what the WorkWebs gallery lists, and
what `/garvis/home/:businessId` means by "a business." A world can be a business, a side project, a
client engagement, or a *rabbit hole* (a curiosity world). **Worlds are the things you run — the
orbs.** Missions/arcs are the live work moving *through* a world. The legacy `apps` table is a second,
parallel "which venture" pointer that must be reconciled onto worlds (see §5).

So the mental model of the entire OS is exactly three levels, all of which already exist as tables:

```
World  (a venture / idea / system you run)      knowledge_worlds     ← the orb on your home
  └─ Area (a chartered capability: social, email, research, …)   knowledge_clusters + charter
       └─ Artifact (a made thing)                                knowledge_artifacts
```

…with **Missions** as bounded campaigns through a world, the **Spine** as the one outbound gate, the
**Clock** running it all while you're away, and **Memory** compounding across every world.

---

## 3. The architecture — seven organs of one body

Each organ already exists in some form. The table gives the honest current state, the target role,
and the verdict. Detail and file:line evidence are in the per-organ sections that follow.

| Organ | Today | Target role | Verdict |
|---|---|---|---|
| **The Spine** — `approvals` + `execution_runs` | Real, kind-agnostic gate + immutable ledger; broadly wired | The one outbound gate for **every** vertical | **Keep as-is** (fix 3 bugs, make routing a registry) |
| **The Noun** — `knowledge_worlds` (+ missions) | Worlds are the de-facto unit; `apps` is a parallel legacy noun; missions are an overloaded run-log with two incompatible writers | One unit: a World you run; missions = campaigns through it | **Extend** |
| **The Home** — `situation.ts` | `compileSituation()` already assembles the exact state a home needs — but pipes it into an **LLM prompt**, not a screen | The **Field**: every world as an orb glowing its real state | **Extend** (render the object that already exists) |
| **The Line** — `commander.ts` | A real one-call→one-decision router, but page-local (one route) and emits do-verbs, not `{world, posture, area}` | One persistent conversation bar on **every** screen | **Extend** |
| **The Memory** — mind/knowledge/brain | **Three** separate context assemblers that don't share; embeddings cover only 2 of 6 declared object types | One `assembleContext(scope)`; embed everything | **Extend** |
| **The Clock** — `standing_orders` + heartbeat | Machinery is **done**; it just never self-arms and has a silent second-secret gate | On by default, self-healing, loud when it stops | **Extend** (activation posture only) |
| **Vertical-as-Data** — charter/workshop | A capability is already *data-derived* from a `Charter`; but a genuinely new vertical needs ≥4 code registries edited | A `VerticalSpec` **row** = detect + context + tools + postures + copy | **Extend** (formalize the primitive) |

Two supporting organs: the **Catalog** (the Line can reach only 21 of hundreds of capabilities — new
verticals must auto-expose their powers) and the **Shell** (AppShell re-mounts per page, so nothing
can be global — a layout route is the enabling change).

### 3.1 The Spine — keep it; it's the crown jewel
`approvals` (app_0022) is already kind-agnostic (an inert row until `status='approved'`), and
`execution_runs` is an immutable, broadly-wired ledger (`resend|netlify|stripe|github|twilio|ayrshare
|docusign` all write it). `approveAndExecute` claims via CAS, re-verifies a payload hash, and invokes
the right edge function. **This is the reusable outbound gate for every present and future vertical**
and needs no reinvention — only: (a) fix the `send_sms` enum bug (the value is used in code and edge
fns but **no migration ever adds it to the `approval_kind` enum**, so every SMS approval insert fails
at the DB); (b) turn the hardcoded per-kind `if/else` into a `{kind → executor}` registry so a new
vertical registers an executor instead of editing the spine; (c) close the dead expiry lane
(`expires_at`/`'expired'` are read everywhere but never written).

### 3.2 The Noun — one unit, missions subordinate
Make `knowledge_worlds` the durable noun and a *mission* a bounded campaign **through** a world
(exactly the app_0024 comment intent). Concretely: `useMissions.planMission` must **resolve-or-create
a world for every objective** (a curiosity objective creates a curiosity world), so every mission is
territory-bound and its artifacts have somewhere to accumulate. Collapse the two mission writers
(`useMissions.planMission` with tasks/no-world vs `workwebRun.runPlay` with world/no-tasks) behind one
writer with one status lifecycle. Reconcile `apps` → `worlds` (§5).

### 3.3 The Home — the Field already exists as data
This is the highest-morale finding in the whole audit: **`situation.ts` already assembles what a home
screen needs** — your businesses, which arcs are running/waiting/**blocked**, which clients owe intake,
active standing orders, pending approvals, new opportunities, outstanding invoices, and *whether the
clock is even ticking* — honest and byte-budgeted, verified by `situation.verify.ts`. It is currently
serialized to a **string for an LLM prompt**. The home-that-shows-everything is roughly **one
component away**: define one typed `Situation` object, persist it with identity, render worlds as orbs
glowing that state, and point the Universe scene + the Mission Control monitor at the *same* object so
they can never disagree.

### 3.4 The Line — `commander.ts` grown up, made global
`commander.ts` is the right seed (one call → one typed decision → tolerant fail-soft, with a
persistent `command_messages` transcript and a `mind_events` routing log). It's ~⅓ of the target. To
finish it: (a) change its output from do-verbs to the router tuple `{world, posture, area?, action?,
spine?}`; (b) add embedding **world-resolution** so "let's work on mom's stuff" resolves to the
*existing* world via `match_embeddings` (already defined, never called by the router); (c) add a
posture classifier (Think/Create/Execute/Observe — 0% built today); (d) **make it global** — extract
the input into a `<Line>` component the shell renders on every route, reading a lifted
`CommanderProvider` so its transcript survives navigation.

### 3.5 The Memory — one assembler, embed everything
There are three independent context assemblers (Commander, agent-runs, builder) with different
sources, budgets, and scope filters — and the builder is blind to the mind entirely. Embeddings are
**written for only `document` and `artifact`** though the schema promises six types, so beliefs,
decisions, lessons, clusters, worlds, and apps are semantically unsearchable. Target: one
`assembleContext(scope)` every surface calls; widen embedding write+read to all object types; and
close the compounding seams (§5) so a lesson learned in one venture surfaces by meaning in another.

### 3.6 The Clock — on by default, self-healing, loud
The machinery is *done* (12 cron jobs, `standing_orders` as the durable job table, `system_heartbeat`
as the pulse). It only fails on **posture**: nothing self-arms in runtime, the CI self-arm step
exists but defaults off, and there's a silent second gate (the armed Vault secret must equal each
function's `WORKER_SECRET` env or every cron 401s into the void). Fix: flip CI self-arm on by default
(it already self-provisions the secret atomically, closing the second-gate trap); add a server-side
`self_arm` action so the secret never leaves the server; self-heal on sign-in when the clock reads
`never`; and add a stale-clock watchdog that **pushes to your phone** when the heartbeat stops.

### 3.7 Vertical-as-Data — the primitive that makes breadth survivable
See §4 — this is the load-bearing reframe.

---

## 4. The one reframe that makes "many verticals and more" actually work

Your vision needs *many* verticals, growing over time. That is only survivable if **adding a vertical
is a data operation, not a code operation.** Otherwise every new idea becomes another bespoke,
orphaned room — and the empty feeling compounds forever. This is not theory: it is exactly why you
already have **three** money doors, a **dead duplicate** galaxy (`Universe.tsx`, imported by no
route), and **five** different "tell me what to do" front doors. Those aren't sloppiness — they are
the *inevitable* result of hand-building each capability.

**The good news:** the codebase is already ~60% of the way to "a vertical is data." A capability is
derived purely from a `Charter` (`archetype` + `flavor`), and `workshops.ts` says so outright: *"the
gallery, focused workspace, command palette, and future agent planner can all describe the same
capability without inventing parallel logic."* The instance layer (a cluster + charter + artifacts)
is fully data-driven and shipped.

**What's missing** is the *type* layer. Adding a genuinely new vertical kind today requires editing
≥4 code registries in lockstep (`Flavor` + `toolsFor`, `Vertical` + `PACKS` + `SIGNALS`,
`WorkshopDefinition`, `StudioSpec`) plus genesis guidance, and the vertical isn't even persisted —
it's re-detected from text every time, so it can drift.

**The target primitive — `VerticalSpec` (one row):**

```ts
VerticalSpec = {
  id, detect: { signals[] } | 'manual',
  context_pack: {...},                    // was verticals.ts PACKS (~1000 lines of code → data)
  areas: [{ archetype, flavor, tools: [toolId],
            seed_artifacts: [{slug, kind, title, detail}],
            workshop: { name, kicker, outcome, steps } }],
  postures: { modes[] },                  // Think/Create/Execute/Observe gating
}
```

Stored in a `vertical_specs` table (built-ins have `owner_id = null`), with `vertical`/`spec_id`
persisted onto the charter. Executors stay as code, dispatched purely by id (the `GARVIS_TOOLS` array
is already this shape). Then **introducing a new venture kind is inserting a row** — and it instantly
inherits the home, the Line, the memory, the spine, and the clock. That is the whole game.

---

## 5. The canonical data model (29 tables) and the seams to close

**Identity:** `profiles` (root tenant; every table FKs `owner_id`).

**The Noun (world → cluster → artifact):** `knowledge_worlds` (the venture/orb) · `knowledge_clusters`
(areas; a `charter` jsonb upgrades a thought into a production area *without moving it*) ·
`knowledge_artifacts` (made things). `world_intelligence` (one living-state row per world).

**Work through a world:** `garvis_missions` (+ `garvis_tasks`). Bind to `world_id` always.

**The Spine:** `approvals` (the one queue) · `execution_runs` (the one immutable ledger).

**The Clock:** `standing_orders` (durable jobs/watchers) · `system_heartbeat` (the pulse).

**Memory:** `mind_events` (append-only spine, immutable by trigger, 20+ writers) · `mind_beliefs` ·
`mind_decisions` · `mind_identity` · `garvis_knowledge` (the approval-gated learn store) ·
`garvis_goals` · `documents` · `embeddings` (one polymorphic vector space) · `insights` ("Garvis
noticed…").

**Acquisition/CRM:** `opportunities` (external hunts) · `garvis_opportunities` (portfolio synergies) ·
`contacts` · `client_engagements`.

**Legacy / to reconcile:** `apps` (the *old* top-level noun; still the `app_id` target of
`mind_events`/`goals`/`knowledge`/`missions`) · `app_metrics` (**dead** — schema exists, zero
writers) · `projects` + `project_files` (the builder sandbox, deliberately separate; the app-builder
is a **tool a world can invoke**, not a competing noun).

### The core ambiguity to resolve
`apps` and `worlds` are **two unlinked "which venture" pointers** with no FK between them. The
direction of travel is clearly `apps → worlds` (all new surfaces key on `world_id`; only older
intelligence tables key on `app_id`). **Decision the blueprint forces:** make `knowledge_worlds` the
single noun; give `apps` a `world_id` (or fold owned products in as worlds), and migrate the
`app_id`-keyed intelligence tables to `world_id`. Until this is done, a "revenue/stage per orb" home
has to reach across an unbridged seam.

### The five compounding seams (capture built, feedback missing)
These are why the system "remembers more but doesn't get better." Closing them is the highest
learning-per-line work in the codebase:

1. **`mind_events → mind_beliefs` is not built.** The richest capture (20+ writers) feeds a belief
   table that **only a human can fill**; `supporting/contradicting_event_ids` are never machine-set.
2. **`mind_decisions` outcomes are manual-only.** Nothing observes reality to close a prediction, so
   the hit-rate measures only what you hand-close.
3. **`embeddings` covers 2 of 6 declared types.** Clusters, knowledge, worlds, apps are never
   embedded — so semantic recall across your own graph can't fire.
4. **`insights` (connections) has no scanner.** The "Garvis noticed a connection" surface only grows
   when you upload a file; no periodic proximity scan over the vector space exists.
5. **`world_intelligence` recomputes only on visit,** not on the clock — so "your universe grew while
   you were away" is actually stale until you click in.

*(Loops that ARE closed, for grounding: `execution_runs` ledger, `garvis-consolidate` weekly lessons,
`draft_verdicts` kept/rewritten feedback, `system_heartbeat`.)*

---

## 6. The build order (what you're approving)

Each phase is shippable on its own and unlocks the next. **Subtraction comes last**, as a consequence
of the spine existing — never as an amputation up front.

### Phase 0 — Turn it on, make "on" the default *(days)*
The fastest possible kill of the "it doesn't do anything" feeling.
- Flip the CI self-arm step **on by default** (it already self-provisions `WORKER_SECRET` atomically,
  closing the second-gate trap by construction).
- Add a server-side `self_arm` action + self-heal on sign-in when the clock reads `never`.
- Add a stale-clock watchdog that pushes to your webhook/phone the moment the heartbeat stops.
- Document all 21 secrets in `.env.example` with the pillar each lights up; make missing secrets
  **loud** in the UI, not silent.
- Fix the `send_sms` enum bug.
- **Result:** the deployment is alive out of the box; the clock ticks; you can see what's on.

### Phase 1 — One home you command (the Field + the global Line)
The single biggest "it stopped feeling empty" change.
- Introduce a **layout route** so `AppShell` mounts once and survives navigation (today 39 pages each
  render their own instance and it re-mounts every click).
- Lift `useCommander` into a `CommanderProvider` above the router; extract the **Line** as a
  persistent bar rendered on every screen.
- Define one typed `Situation` object (derive the existing string digest from it — zero behavior
  change for the LLM callers) and render the **Field**: your worlds as orbs, each glowing its real
  state, the approvals whisper in the corner.
- **Result:** you open the app and *see everything you run, alive*, and talk to all of it from one bar
  that never moves. Reuses `situation.ts` and the universe scene loaders that already exist.

### Phase 2 — One memory that compounds
- Extract `assembleContext(scope)` and route all three assemblers through it (the builder finally
  gains the mind; Commander finally gains the knowledge digest).
- Widen embedding write+read to all six subject types.
- Close the compounding seams: machine-distill `mind_events → mind_beliefs`; put `world_intelligence`
  on the clock; add an `insights` proximity-scan worker.
- **Result:** exploring idea A makes it smarter at venture B; the system visibly gets better with use.

### Phase 3 — Bridge the dead-ends & unify the noun
- Wire the amputated limbs to the rails you already own: the Canvas social "change it" → a "Queue to
  publish" path into `queueSocialPost`; the Marketing email "Publish" → real `send-email` (not
  `mailto:`); consume the `scroll_scenes` library or delete SceneStudio.
- Make `world_id` mandatory on missions; collapse the two mission writers; unify the two decomposition
  vocabularies (5 WorkerKind ↔ 24 tool ids).
- Ship the **Intention Router v1** (`utterance → {world, posture, area, action}`) + posture dressing.
- **Result:** every "make" reaches a rail; the Line routes to anything, anywhere.

### Phase 4 — Vertical-as-Data
- Define the `VerticalSpec` type + `vertical_specs` table; externalize the context pack first (lowest
  risk), then the tool pack and workshop copy; make genesis validate against **rows**.
- Add the **coverage contract**: a build-failing test when an operator-facing surface has no catalog
  capability, so new verticals auto-expose their powers to the Line.
- **Result:** your next idea/system is a row — and it's instantly part of the whole OS.

### Phase 5 — Consolidate & subtract
Now that the Field + Line + one memory exist, the duplicates are *superseded*, so removing them is
safe, not destructive.
- Merge the three money doors; collapse Mind/Brain/Memory; delete dead `Universe.tsx`; fold the five
  intention front doors into the Line + Field; alias every old route in (the `<Navigate replace>`
  pattern already exists) so no deep link 404s.
- **Result:** fewer, truer surfaces — the visible cure for "lost the essence."

---

## 7. What we are explicitly NOT doing

- **Not cutting capabilities.** Breadth is the point of an OS-for-life. We're giving breadth a body.
- **Not rebuilding from scratch.** Every organ exists; this is assembly and wiring, not invention.
- **Not chasing the full cinematic mockup first.** The 3D galaxy, camera morphs, and posture
  choreography are polish that comes *after* the Field + Line + memory + clock are real. Substance
  before cinema.

---

## 8. How we'll know it worked

- **Alive out of the box:** clock ticks on first deploy without a manual SQL line. *(Binary.)*
- **One home:** opening the app shows every world glowing its real state, and one Line commands them.
  *(Binary.)*
- **Loops closed:** of the 5 compounding seams, how many feed behavior. *(Today: ~1.)*
- **Unattended hours:** time the heartbeat does real work with no operator touch and no silent
  failure.
- **Verticals added as data:** number of new venture kinds introduced by a row, not a PR. *(Today: 0
  — the whole point of Phase 4.)*
- **Clicks to a closed loop:** from home, steps to make a thing that actually goes out. *(Today: ~5–7
  plus invisible secret config.)*

---

*Bottom line: the parts are unusually good and mostly real. What's missing is a body for them to live
in — one home, one Line, one memory, one clock, one spine — and a way to add the next venture without
building the next room. That is a wiring-and-assembly program, not an invention program, which is the
best possible place to be. Approve the order in §6 and we start at Phase 0.*
