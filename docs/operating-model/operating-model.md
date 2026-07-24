# The Operating Model — The Correct Objects for This Platform

*Phase 2. Written on the factual foundation of `/docs/system-reconstruction/` (all citations of
current behavior refer to it). This document does not design pages, navigation, or layouts. It
discovers the object model — the small set of primitives from which the interface should later
emerge, the way Finder emerged from files/folders/applications, Notion from blocks/pages/
databases, GitHub from repos/commits/PRs, Linear from issues/cycles/projects.*

*Method: the model below was not invented fresh. It was **derived** — by taking every workspace
the vision demands (clothing brand, website client, inbox automation, consciousness research,
and the ~30 shapes already in the code), decomposing each into what it actually contains, and
keeping only the primitives that survive every case. Where the model contradicts today's
implementation or today's planning documents, the contradiction is stated explicitly.*

---

## 0. The discovery, in one page

The platform's confusion has never been a shortage of capability — it is that **four different
kinds of things have been treated as siblings**: places to be, things that are made, work that
is happening, and verbs the system can perform. Studios became destinations. Missions became
pages. The builder became a parallel universe. Every new idea became a new room, and the author's
own diagnosis followed: "seven apps sharing a sidebar."

The correct model separates those four categories absolutely, adds the substrates they all stand
on, and reduces to this:

```
SUBSTRATES (the OS itself — global, exactly seven, nothing else is global)
  Memory      everything remembered, one graph, semantic     (mind + knowledge + embeddings)
  Spine       one approval queue + one immutable ledger      (approvals + execution_runs)
  Clock       one heartbeat executing all recurring work     (pg_cron + workers)
  Catalog     the registry of every capability and genome    (actionCatalog, grown up)
  Situation   the compiled live state of everything          (situation.ts, made canonical)
  Line        the one conversation that routes intent        (commander → intention router)
  Identity    who you are, who you know, what's connected    (profile + contacts + connections)

CONTAINER (the one place-noun)
  World       a bounded context you run: venture, client, curiosity, product — kind is DATA

CONTENTS of a world (never global, never free-floating)
  Genome      the world's kind, expressed as data — what it mounts, measures, and asks
  Area        a chartered sub-context inside a world (today: cluster + charter)
  Artifact    anything made: doc, site, app, campaign, video, simulation, template
  Thread      a conversational trace, always scoped, always feeding Memory

WORK moving through a world (two temporal shapes, no more)
  Mission         finite work with an objective and an end   (missions/arcs/plans unified)
  Standing Order  recurring commitment on a trigger          (cron / event / condition)

VERBS (never places)
  Capability  one definition, three drive modes:
                driven by a human  → appears as a Studio
                driven by AI       → appears as a Worker / agent run
                driven by triggers → appears as an Automation
```

Seven substrates. One container. Four content objects. Two work objects. One verb object.
**Everything in the platform — everything in the vision — is one of these fifteen things.**

The prime mover binding them: **intent is the only creation verb.** Nobody ever assembles a
workspace. You say what you're trying to accomplish; the Line resolves it to an existing world
or proposes a new one; the genome instantiates the environment; one approval charters it. The
user never assembles the same workspace twice because the user never assembles a workspace at
all.

---

## 1. The seven decisions

Each decision below is stated, argued, and marked with what it **overturns** in the current
system or planning documents.

### Decision 1 — There is exactly one container, the World, and its kind is data

Every example in the vision — clothing brand, website client, inbox automation, consciousness
research — decomposes into the same anatomy: an identity, scoped memory, mounted capabilities,
things made, work in flight, connections outward, and a live state. They differ only in *which*
capabilities are mounted, *what* health means, and *what* the system should ask for. That
difference is configuration, not class. So there is one container class — the **World** — and a
**Genome** that expresses its kind as data.

This is the generalization of three things the codebase already proved: Charters make an *area's*
kind data ("a studio is data, not code" — shipped); Genesis instantiates a designed world from
intent ("DNA → designed world → approval" — shipped); VerticalSpec was specced to make a
*venture's* kind a row (os-blueprint §4 — not yet built). The model simply says: VerticalSpec was
right, and it is not a feature — it is the platform's center.

**Why "World" and not "Workspace."** The object is what the vision calls a workspace, and
"workspace" is the correct explanatory synonym. But the canonical name should remain **World**:
it is the noun that already won in the code (`knowledge_worlds` is the emergent top-level unit —
reconstruction 01 §7), it is the noun the entire visual identity is built on (orbs, universe,
the Field), and it carries the right connotation — a world is *inhabited and ongoing*, while a
workspace is merely *furnished*. Specifications may use the words interchangeably; the product
has one soul-word and it is already World.

**Overturns:** the `apps` table as a parallel venture-noun (fold into Worlds — already the
author's decided direction); the FableForge "project" as a sibling container (see Decision 6);
"the eight competing stories" — app builder, chief of staff, marketing team, agency-in-a-box,
real-estate tool, genesis, second brain are revealed as **genome families, not products**.

### Decision 2 — Places, things, work, and verbs never mix

The four ontological categories:

- A **place** is somewhere state accumulates (World, Area).
- A **thing** is an inert made object (Artifact, Thread).
- **Work** is a process with a lifecycle (Mission, Standing Order).
- A **verb** is a capability the system can perform (Capability).

The rule: *no object is ever two of these,* and *the interface layer must never promote one
category into another.* Today's system violates this everywhere — the violations are precisely
its famous pathologies: Studios-as-destinations (verb promoted to place), the Missions page
(work promoted to place), Mind/Brain/Memory rooms (substrate promoted to three places), the
builder-as-app (verb + thing promoted to a parallel universe), five "tell me what to do" front
doors (the Line's job scattered into places).

This decision is what makes the eventual UI small. If only places can be *gone to*, the
navigable surface is: the collection of worlds, and the inside of one world. Everything else is
reached by verb ("make…", "send…", "check…") or by reference ("the postcard", "Jane's invoice").
That is the Mac insight: you navigate volumes and folders; you never navigate to "Copying" or to
"the concept of Printing."

**Overturns:** studio routes, mission/marketing/opportunities/mind/brain rooms as destinations
(they survive as views *of* worlds, work, and substrates — a UX-phase concern, not repeated
here).

### Decision 3 — Studio, Worker, and Automation are one object in three drive modes

A capability is a verb the system can perform: draft an email, build a site, run a hunt, render
a video, chase an invoice, book an appointment. Today the same verb exists in up to three
disconnected costumes: a Studio when a human drives it, a mission worker / agent run when AI
drives it, a cron drain when the clock drives it. The email verb already proves they are one
thing: Email Studio, `inbox-draft` worker, and the follow-up cron all converge on the same send
rail with the same gates.

So the model defines **Capability** once — inputs, outputs, tools, prompts, safety gates,
required connections, measurement contract — and gives it three **drive modes**:

| Drive mode | Paced by | Today's name for it |
|---|---|---|
| Human-driven | the operator's attention | a Studio (with its Workshop copy) |
| AI-driven | a mission's plan or a one-off run | a Worker / agent run |
| Trigger-driven | the Clock or an event | an Automation / standing drain |

A "Workshop" is not an object: it is the human-facing description bundle (name, kicker, steps,
outcome) inside a capability's definition — which is exactly what `workshops.ts` already says it
is.

Consequences that matter:
- **One catalog.** Every capability is registered once and is therefore reachable by the Line —
  this *dissolves* the reachability gap (grail gap #1: "the brain can touch 14–21 of hundreds of
  capabilities") instead of chasing it with a coverage program. There is no longer a way to
  build a UI-only capability, because being in the catalog is what being a capability *means*.
- **One safety story.** Gates (spine, honesty holes, suppression, consent) attach to the
  capability, so no drive mode can bypass what another enforces — the property send-email
  already has becomes universal by construction.
- **Autonomy is a dial on (capability × world × action-class)**, not a global posture — the
  earned-autonomy design (content weeks, speed-to-lead, `autonomy_grants`) generalized.
- **Capabilities can be born.** The growth path: built-in → configured → **learned** (a repeated
  manual pattern distilled into a definition, through the knowledge gate) → **generated** (a
  built app mounted as a room-backed capability — grail gap #4, whose first step already
  shipped as RoomsPanel). This is "creation that extends the creator" made structural.

**Overturns:** the three disconnected registries (5 WorkerKinds vs 21 orchestrator actions vs 25
chat tools — reconstruction 10 §B9) — they become views of one catalog; studios and automations
as separate feature families.

### Decision 4 — Work has exactly two temporal shapes

Everything the system *does over time* is either:

- a **Mission** — finite work with an objective, a plan, and an end. Its execution machinery is
  what the code calls arcs/plans (compiled steps, waiting states, wake-on-approval, stall
  nagging). Missions end in an outcome that is recorded and judged (feeding Memory).
- a **Standing Order** — a recurring commitment with a trigger (schedule, event, or condition),
  a capability to drive, a scope (which world), and an autonomy level. Client automations,
  follow-up crons, watchdogs, daily hunts, invoice chases, content weeks — all one shape.

This collapses today's overlapping vocabulary (missions, tasks, arcs, plans, runs, standing
orders, automations, triggers) into two user-meaningful shapes with clear internals: *runs* are
how any work executes step-to-step; *plans/arcs* are how missions structure themselves;
*triggers* are how standing orders wake. None of those internals are user-level objects.

It also resolves the noun war between the planning documents (reconstruction 10 §A1). The
first-principles doc said "Missions. Nothing else."; the os-blueprint said Worlds. Both were
partly right: **the container is the World; the Mission is the work moving through it.** A
mission always belongs to a world (the blueprint's own unexecuted rule: `world_id` mandatory,
one writer, one lifecycle). "A rabbit hole is a mission whose objective is curiosity" was the
one wrong clause — a rabbit hole is a *world* (see Decision 5), because curiosity accumulates
territory, and territory is what worlds are.

**Overturns:** the two incompatible mission writers; missions floating without worlds; the
separate automation/trigger feature family (it is standing orders in a client-genome world).

### Decision 5 — Explore is a posture everywhere; a Rabbit Hole is a world born lazily

The prompt asks whether Explore is a workspace, a mode, a project type, a global capability, or
something else. The answer is a compound, and each half is load-bearing:

**1. Exploring is a *posture*, available inside every world.** Curiosity is not a place you go;
it is a way of facing whatever you're already running. "What don't we know about Jane's
market?" is exploration *inside* the client world — and its discoveries must land in that
world's memory, not in an Explore silo. (The current system's sharpest knowledge-loss bug —
builder research evaporating into chat — is exactly what happens when exploration is somewhere
else.) The four postures from the first-principles doc (Think · Create · Execute · Observe)
survive in this model as the four ways of facing a world; Explore is the Think posture with
gravity turned off.

**2. Free curiosity lazily materializes a world of the curiosity genome — a Rabbit Hole.** When
exploration has no existing world ("why do bee hives work?"), the system creates one silently:
zero ceremony, no form, no name required — the container exists so that *discoveries always
have somewhere to live*, not because the user asked for a container. A rabbit-hole world is a
real world: clusters, artifacts, threads, media, simulations, connections into the global
memory graph. It is simply born with the lightest genome — no clock work, no counterparty, no
health metrics, dormancy-friendly.

**3. "Create Project" is a genome change, not a conversion.** When a rabbit hole gets serious —
the user wants to build the thing, or found the company — the world **stays the same world** and
acquires a heavier genome: operating areas mount, missions become available, the clock can be
engaged, intake asks arrive. Every discovery is preserved *by construction*, because nothing
moved. (The bridge already exists in embryo: `compileBuildBrief` turns a rabbit hole into a
fully-briefed build. The model makes that the normal case of a general rule.)

Why not the alternatives:
- *Explore as a workspace/app* — recreates the silo; orphans in-world curiosity; already tried
  (the spike pages) and already leaking (Explore is "filed under spike naming" while being
  embedded in the Command home — the code itself is trying to escape the silo).
- *Explore as a project type only* — makes curiosity heavyweight; kills the "zero decisions to
  start" property the first-principles doc correctly demanded.
- *Explore as only a global capability* — capabilities produce outputs, but exploration produces
  *territory* (an expanding web of connected partial understanding). Territory needs a
  container. Hence the compound: the verb is global, the territory materializes as a world.

The defining experience the prompt describes — branch, compare, simulate, test, visualize, save,
generate artifacts/videos/maps/apps, create missions/businesses *directly from exploration* — is
in this model exactly: **every capability of the platform, invocable from the Think posture of a
curiosity world, with promotion always one utterance away.** Explore feels magical not because
it has special tools but because it is a full citizen: the same world anatomy, the same
capabilities, the same memory — with the ceremony stripped out.

**Overturns:** Explore as admin-gated "Labs" spike; exploration outputs that don't persist;
the idea that promotion means export/copy.

### Decision 6 — Evolution is identity-preserving: re-genome, spawn, and link — never convert

"How does one workspace become another?" is the question the whole model must answer well,
because the vision's examples are all *trajectories*: curiosity → project → company; prospect →
client; idea → app → product. The rule:

> **A world's identity is permanent. Its genome is mutable. Growth is layering, never
> migration.**

The evolution operations, exhaustively:

| Operation | What happens | Example |
|---|---|---|
| **Seed** | a world is born with a minimal genome, usually lazily | "why do bee hives work?" |
| **Promote** | genomes layer on; areas/capabilities/asks mount; nothing moves | rabbit hole → venture ("Create Project") |
| **Spawn** | a world *creates a linked world* when a new identity emerges | agency world close-wins a deal → a client world is born, pre-populated from the prospect record (scrape, audit, demo site, thread history) |
| **Link** | typed edges between worlds | `serves` (agency→client), `supplies`, `informs` (research world → product world), `competes-with` |
| **Split** | an area that has become its own identity leaves home as a spawned world with lineage | the clothing brand's wholesale channel becomes its own business |
| **Merge** | two worlds that turned out to be one; artifacts and memory re-scope, edges preserved | two overlapping explorations |
| **Sleep / Wake** | dormancy is a first-class state; the Situation stops surfacing a sleeping world but memory keeps it findable by meaning | last month's rabbit hole |
| **Archive** | never delete — the ghosts doctrine ("nothing the user ever made becomes unreachable") | a dead venture |

**When does something deserve to be its own world?** Four tests, any one sufficient:
1. **The pronoun test** — you naturally say "it": "how's *it* doing?" ("mom's business", "the
   consciousness thing").
2. **The counterparty test** — it has an external identity: a client, a brand with its own
   audience, an entity with its own accounts/credentials/consent (isolation then *requires* a
   world boundary — the world-isolation bug class from the reconstruction is the price of
   getting this wrong).
3. **The memory test** — it accumulates knowledge you'd want scoped and retrievable as its own
   context.
4. **The lifecycle test** — it can succeed, fail, sleep, or end independently of its parent.

Failing all four, it's an **Area** (a chartered sub-context) or just a **Mission** (finite work)
inside an existing world. The Line applies these tests silently — resolve-or-create — and the
cost of a wrong guess is deliberately low because split and merge exist.

**What "Project" is, finally.** The word should retire as a platform concept. It currently means
three unrelated things: a container (which is a World), bounded work (which is a Mission), and a
FableForge code sandbox (which is a **deep Artifact** — a buildable thing with internal files,
versions, branches, and deployments, operated on by the build capability). Projects-as-container
is wrong for this platform because most of what it holds does not end — businesses, clients, and
curiosities are *ongoing*; "project" smuggles in an end-date ontology that only Missions should
carry. The button "Create Project" can keep its label — the model just defines what it does:
promote the world, stage a mission.

**Overturns:** `projects` as a sibling noun (it becomes the internal storage of app/site
artifacts); any export/convert/copy flow between explore and build; `apps` (each row becomes a
world of the product genome, or an artifact-link within one).

### Decision 7 — Exactly seven substrates are global; everything else lives in a world

What belongs *outside* every world — the OS itself:

1. **Memory** — one graph of everything remembered: events, documents, artifacts' embeddings,
   beliefs, decisions, approved knowledge. Globally searchable by meaning; scoped views per
   world; the knowledge gate (nothing becomes reusable "truth" without approval) is preserved
   untouched. Memory is *the* mechanism by which hundreds of worlds make each other smarter —
   "exploring idea A makes it smarter at venture B" is a memory property, not a feature.
2. **Spine** — the one approval queue and the one immutable execution ledger. Every outbound
   crossing from any world, any capability, any drive mode. Non-negotiable, exactly as built.
3. **Clock** — one heartbeat; standing orders register per-world, execute globally, stamp their
   liveness. (The activation posture — self-arming, loud when dark — is an implementation
   mandate the model inherits from the blueprint unchanged.)
4. **Catalog** — the registry of capability definitions and genome definitions, versioned. The
   Line can reach exactly what the catalog holds; the catalog holds everything, by definition.
5. **Situation** — the compiled, budgeted, honest state of everything: which worlds are alive,
   what's blocked, what's owed, what's waiting, whether the clock ticks. One object, consumed by
   the Line, by every mission compile, and (in the UX phase) by the home surface — so they can
   never disagree.
6. **Line** — the single conversational interface, running the intention loop:
   `utterance → {world (resolve-or-create), posture, capability?, action?} → work → memory →
   situation`. This is the platform's syscall. Five front doors collapse into it.
7. **Identity** — the operator's profile; **Contacts** (people are global — one person can span
   worlds, with per-world relationship stamps, resolving the six-people-tables debt); and
   **Connections** (external accounts and credentials, ownable by the operator or scoped to a
   world/counterparty).

Nothing else is global. If a proposed feature doesn't fit in a world and isn't one of these
seven, the model says it's mis-conceived.

---

## 2. The objects, precisely

For each object: what it is, what it contains, its lifecycle, and what it maps to in the
current system (so the UX and migration phases inherit a concrete correspondence).

### World
- **Is:** a bounded context you run — the only place-noun. A venture, a client, a curiosity, a
  product, a family business, a brand.
- **Contains:** its genome (stack), areas, artifacts, threads, missions, standing orders,
  scoped memory, scoped connections, an optional counterparty, typed edges to other worlds, and
  a live state (its slice of the Situation).
- **Lifecycle:** seed → active → operating (clock engaged) → dormant → archived. Never deleted.
- **Maps to:** `knowledge_worlds` (canonical), absorbing `apps` and the container role of
  `projects`; `world_intelligence` becomes its state row.

### Genome
- **Is:** a world's kind, as data: which areas to mount, which capabilities attach (with drive
  modes and autonomy defaults), what seed artifacts and intake questions to create, what health
  and "done" mean, what the clock should run, what isolation the world requires.
- **Behavior:** genomes *layer* (curiosity + venture + client can stack); they are versioned in
  the Catalog; built-in genomes ship with the platform; **learned genomes** are distilled from
  repetition ("the user never assembles the same workspace twice" is enforced here: the second
  time a pattern is assembled by hand, the system proposes a genome — through the knowledge
  gate, like every lesson).
- **Maps to:** VerticalSpec (specced, unbuilt) + genesis's World DNA + charter archetypes/
  flavors + the PACKS context data — unified into one definition format.

### Area
- **Is:** a chartered sub-context inside a world: social, email, research, the shop floor of one
  capability family. The one level of internal structure (worlds do not nest — structure deeper
  than areas is expressed with linked worlds, keeping every container shallow and legible).
- **Maps to:** `knowledge_clusters` + charter, unchanged in role.

### Artifact
- **Is:** anything made: document, image, video, simulation record, campaign, email, template,
  site, app. One class; kind is data; every artifact has versions, provenance (which thread/
  mission/capability made it, from what), and — when it is outbound-capable — a publish state
  wired to the Spine.
- **Deep artifacts:** sites and apps open into their own editing environment (the builder), own
  internal files/branches/deployments, and can be **mounted back** as a room (becoming part of a
  world's surface) or as a generated capability (Decision 3).
- **Maps to:** `knowledge_artifacts` (canonical) + `project_files`/branches/deployments as the
  internals of app-kind artifacts + `marketing_assets`, `preview_sites`, `scroll_scenes`, etc.
  as kinds.

### Thread
- **Is:** a conversational trace, always scoped (to a world, area, mission, or artifact), always
  feeding Memory. The Line is not a thread; it is the router that *lands* you in threads.
- **Maps to:** `command_messages`, studio chats, cluster-chat — unified in role (one
  conversation model, many scopes).

### Mission
- **Is:** finite work with an objective moving through a world: launch the campaign, rebuild the
  site, chase the certification, run the experiment series. Compiles to a plan; parks `waiting`
  at approval seams; wakes itself; ends with a judged outcome that feeds Memory.
- **Maps to:** `garvis_missions` + `garvis_tasks` + `orchestrator_plans`/arc-wake — one noun,
  one writer, one lifecycle (executing the blueprint's decided-but-unbuilt unification).

### Standing Order
- **Is:** a recurring commitment: trigger (schedule | event | condition) + capability + scope +
  budget + autonomy level. Client automations, hunts, watchdogs, chases, digests.
- **Maps to:** `standing_orders` + `automation_triggers`/`trigger_fires` — unified.

### Capability
- **Is:** a verb, defined once (Decision 3): contract, tools, prompts, gates, required
  connections, measurement, workshop copy; drivable by human, AI, or trigger; versioned in the
  Catalog; autonomy earned per (capability × world × class).
- **Maps to:** studios/workshops + orchestrator actions + chat tools + worker kinds + cron
  drains — one registry with five current views.

### Counterparty
- **Is:** the real-world other side a world wraps, when it has one: the client business, the
  brand's audience-facing identity, the family member's enterprise. Holds their contacts, their
  connections/credentials, consent state, money relationship (subscriptions, invoices), and the
  **isolation contract** the world must honor (their data, their sender identity, their
  channels — scoped, never bleeding).
- **Maps to:** `client_engagements` + client connections + per-world sender identity/domains +
  client subscriptions/invoices — gathered into one attachable object.

---

## 3. Direct answers to the question list

| Question | Answer |
|---|---|
| What is a Project? | Retired as a concept. The container is a World; bounded work is a Mission; a builder "project" is a deep Artifact. (§1 D6) |
| What is a Workspace? | The explanatory synonym for a World: an instantiated intent. One class; kind is a Genome. |
| What is a Business? | A World with an operating genome: money capabilities mounted, clock engaged, usually a Counterparty (customers) and health measured in commitments and cash. Structurally nothing more. |
| What is a Client? | A World of the client genome, spawned from your agency world on close-won, linked `serves`, carrying a Counterparty with an isolation contract — born already containing the scrape, audit, demo site, rebuilt site, deployment, CRM stamps, outreach history, automations, and analytics that the funnel already produced. |
| What is a Studio? | A Capability being driven by a human. Not a place. |
| What is a Workshop? | The human-facing description bundle inside a Capability's definition. |
| What is a Mission? | Finite work with an objective moving through a World; plans, waits, wakes, ends, and is judged. |
| What is an Artifact? | Anything made; one class, kind as data, with versions, provenance, and (when outbound) a Spine-wired publish state. |
| What is an Automation? | A Standing Order: a Capability on a trigger with a scope and an earned autonomy level. |
| What is Research? | A Capability (evidence in → cited artifacts + knowledge out), invocable in any world; its outputs must persist to Memory — a research result that lands only in chat is a defect by definition. |
| What is Exploration? | The Think posture, available in every world. |
| What is Rabbit Hole? | A World of the curiosity genome, materialized lazily under free exploration; promotable without loss. |
| What is Knowledge? | The approved stratum of Memory — lessons that passed the human gate and may steer behavior. |
| What is Memory? | The global remembering substrate: events, documents, embeddings, beliefs, decisions, plus Knowledge. Scoped views per world; semantic across all worlds. |
| What is Global? | Exactly seven substrates: Memory, Spine, Clock, Catalog, Situation, Line, Identity. Nothing else. |
| What belongs inside a World? | Genome, areas, artifacts, threads, missions, standing orders, scoped memory and connections, its counterparty, its edges, its live state. |
| What belongs outside? | Only the substrates. |
| When does something become its own world? | Any of: the pronoun test, the counterparty test, the memory test, the lifecycle test (§1 D6). Otherwise it's an area or a mission. |
| How are capabilities attached? | By genome (defaults), by hand (mount), by proposal (the system notices need — through the knowledge gate), and by generation (room-backed capabilities). |
| How do capabilities evolve? | Versioned definitions in the Catalog; measurement contracts feed outcomes to Memory; self-tuning proposals ride the knowledge gate; built-in → configured → learned → generated. |
| How does one workspace become another? | It doesn't *become* — it stays itself and re-genomes, or spawns a linked world. Identity is permanent; kind is layered. |

---

## 4. The intent pipeline (how environments come to exist)

The prime mover, end to end — every element already exists in embryo (cited):

```
1. UTTERANCE    "I want to launch a clothing brand." / "I just signed another website client."
                / "automate this inbox" / "I want to research consciousness"
                                                        (the Line — commander.ts grown up)
2. RESOLVE      Does this belong to an existing world?  (embedding resolution over worlds +
                or is it new?                            missions — specced in first-principles §5)
3. CLASSIFY     Which genome(s)? What posture?          (genesis's DNA classification, generalized)
4. PROPOSE      The system drafts the world: areas, capabilities, seed artifacts, intake asks,
                clock work, isolation needs.            ("genesis PROPOSES, the user CHARTERS")
5. CHARTER      One approval births it — or, for curiosity-genome worlds, birth is silent and
                free (the ceremony is proportional to the genome's weight: a rabbit hole costs
                nothing; a client world with money flows and a counterparty asks once).
6. INHABIT      The world arrives pre-dressed: state compiled, next move staged, asks visible.
                                                        (the anticipation doctrine: "state
                                                         arrives pre-dressed; zero decisions
                                                         to start")
7. COMPOUND     Everything done in it feeds Memory; repetition across worlds distills into
                learned genomes and learned capabilities — the second assembly never happens.
```

Worlds can also be born from **events**, not utterances: close-won spawns a client world; a
claimed demo site can propose one; an inbound automation request seeds one. Event-born worlds
follow the same propose→charter path with the same proportional ceremony.

---

## 5. Coexistence at scale (hundreds of worlds, elegantly)

The model's answer to "how do hundreds of businesses, projects, automations, explorations, and
creative endeavors coexist" is five mechanisms, none of which is "better navigation":

1. **Genome uniformity.** A hundred worlds are operable because they are one class: the same
   anatomy, the same postures, the same spine, the same questions ("how's it doing?" "what's
   next?" "what's blocked?") answerable identically for a clothing brand and a client and a
   rabbit hole.
2. **Situation-driven surfacing.** What appears is driven by *state* (alive, blocked, owed,
   waiting, glowing), never by *inventory*. A hundred dormant worlds cost nothing; the Situation
   surfaces the five that matter today. (No-Theater rule inherited: every glow must survive
   "which row is that?")
3. **Semantic memory.** Nothing is *found by location*; everything is found by meaning. The
   embedding space must therefore cover every object type — the model elevates the
   reconstruction's "2 of 6 types embedded" finding from a bug to a violated invariant.
4. **One Spine, one Clock.** A hundred worlds still produce one approval queue and one heartbeat
   — attention and trust do not fragment with scale. Autonomy dials are what keep the queue
   humane as the count grows: routine classes earn silence; novel classes ask.
5. **Typed edges + rollups.** Worlds form a shallow graph, not a tree. The agency world rolls up
   its `serves` edges (all client worlds' health in one glance); a research world `informs` the
   product worlds that draw on it. Cross-business connection — the vision's "connecting multiple
   businesses" — is these edges plus shared Memory, not a folder hierarchy.

---

## 6. What this model preserves untouched, and what it overturns

**Preserved as-is (the platform's proven organs, inherited without modification):**
the Spine and its gates; the honesty architecture (evidence-counted claims, holes, refusals,
No-Theater); the Clock's machinery; the knowledge gate; the earned-autonomy pattern; the
verify-suite culture; genesis's propose→charter contract; the preview/build engines as
capabilities; the ghosts doctrine.

**Overturned (each with its section):**

| Current | Model | Where |
|---|---|---|
| `apps` + `projects` + `knowledge_worlds` as three container nouns | One container: World | D1, D6 |
| Studios/missions/mind/brain as destinations | Category separation; verbs and work are not places | D2 |
| Studios ≠ workers ≠ automations | One Capability, three drive modes | D3 |
| Missions/tasks/arcs/plans/runs/standing-orders/triggers vocabulary | Mission + Standing Order; the rest are internals | D4 |
| Explore as spike/page; "rabbit hole = a mission" | Think-posture everywhere + curiosity-genome worlds; promotion = re-genome | D5 |
| Convert/export flows between explore and build | Identity-preserving evolution: promote/spawn/link/split/merge | D6 |
| Client machinery scattered (engagements, connections, identity, billing) | Counterparty attached to a client-genome world, with an isolation contract | §2 |
| Five intention front doors; three context assemblers; capability registries ×5 | One Line; one Memory; one Catalog | D7 |
| "Project" as a universal word | Retired; World / Mission / deep Artifact | §3 |

---

## 7. Acceptance tests for the model

The UX phase (and every future feature) should be checked against these, the way the author
checked features against the five-minute test:

1. **The fifteen-things test.** Every proposed feature must be expressible as one of the fifteen
   objects (or a view of them). If it needs a sixteenth, the model is wrong or the feature is —
   and that argument must be had explicitly.
2. **The no-second-assembly test.** If a user ever assembles the same environment twice by hand,
   a genome failed to exist or failed to be learned. That is a defect, not a feature request.
3. **The promotion-without-loss test.** From any curiosity world, reaching "operating business"
   must require zero copies, zero exports, zero re-entry of anything the exploration already
   discovered.
4. **The hundredth-world test.** Creating the 100th world must make the platform *smarter*
   (more memory, more learned genomes) and no *heavier* (no new nav, no new queue, no new
   inbox).
5. **The stranger test.** "How's ___ doing?" must be answerable by the Line for any world, from
   anywhere, from real rows — because worlds are one class and the Situation is one object.
6. **The category test.** No verb may become a place; no work may become a place; no substrate
   may fragment into rooms. (The reconstruction documents what happens otherwise.)
7. **The gate test.** No drive mode of any capability may reach an exit that another drive mode
   gates. One capability definition, one safety story.

---

## 8. Open questions deliberately left for the next phases

1. **Surface naming** — this document fixes object semantics, not labels. Whether users see
   "World," "Space," or "Workspace"; whether "Create Project" keeps its label while performing
   promotion — UX-phase decisions, free to vary over the fixed semantics.
2. **Posture mechanics** — Think/Create/Execute/Observe are affirmed as the four ways of facing
   a world, but their interaction design (dials, dressing, transitions) is UX-phase work.
3. **Genome format** — the definition schema (extending VerticalSpec) and how layering resolves
   conflicts (two genomes mounting the same capability with different autonomy defaults) is an
   engineering-phase design.
4. **Migration order** — the mapping in §2 names every correspondence, but sequencing the data
   migration (apps→worlds first? capability-registry unification first?) belongs to the
   implementation plan, constrained by the blueprint's rule: subtraction last, supersession
   first.
5. **Counterparty portals** — whether client-genome worlds ever grow an external door for the
   counterparty themselves (beyond today's booking/claim/checkout pages) is a product decision
   the model supports but does not force.

---

*The one-sentence summary: seven substrates that are the OS, one container whose kind is data,
things/work/verbs that never pretend to be places, evolution that layers instead of migrates,
and a Line that turns intent into inhabited environments — so that a clothing brand, a website
client, an inbox automation, and a consciousness rabbit hole are not four features but four
genomes of one World, running on one Memory, one Spine, one Clock.*
