# The Design Constitution — Binding Decisions for the Experience Architecture

*Phase 3 working spine. Every document in `docs/experience-architecture/` elaborates these
decisions; none may contradict them silently. If a document author believes a decision fails a
scenario, the disagreement is flagged in `14-open-decisions.md`, not resolved by local deviation.
Grounding: `docs/operating-model/operating-model.md` (the object model) and
`docs/system-reconstruction/` (what exists). This file is kept in the repo deliberately: it is
the shortest complete statement of the design.*

---

## 1. North star and the metabolism

**North star:** Entering a World feels like entering an intelligent environment purpose-built
for that undertaking; entering a Workshop feels like gaining the tools, context, feedback, and
creative leverage of an expert team. The system produces **mastery, not merely organization** —
it makes the operator better at the undertaking, not just more automated.

**The metabolism** — the five-beat loop every part of the experience serves, mapped to postures:

```
WONDER (Think)  →  DEVELOP (Create)  →  COMMIT  →  RUN (Execute)  →  LEARN (Observe) → back to WONDER
Explore finds      Workshops develop     Artifacts    Missions and      Outcomes annotate
possibilities      and test selected     preserve;    Standing Orders   artifacts, feed the
                   possibilities         one approval do the work       Playbook, sharpen
                                         gates exits                   criteria & genomes
```

This is a loop, not a line: Observe feeds Think ("the campaign underperformed — why?" is a new
exploration). The Phase-3 addendum's formulation (Explore discovers → Workshop develops →
Artifacts preserve → Missions execute → Standing Orders sustain → outcomes feed intelligence) is
adopted with that one strengthening: **it is a cycle, and the product's job is to lower the cost
of every arrow.**

## 2. Terminology and presentation (binding table)

Canonical (spec) names never need to be user-visible. Genomes carry a **terminology skin**.

| Canonical | Default display | Notes |
|---|---|---|
| World | what it is: "Client" / "Business" / "Exploration" / "Build" / "Campaign" / "Automation" | "Worlds" acceptable in collective contexts ("your worlds"); never "World #" labels |
| Genome | "setup" / "kind" / "template" (in creation UI); invisible elsewhere | "Based on Mom's setup" |
| Area | area names themselves ("Outreach", "Listings", "Brand") | the word "Area" rarely shown |
| Workshop | "<Craft> Studio" for creative crafts ("Design Studio", "Outreach Studio"); "Workshop" acceptable; genome may skin | one concept, two acceptable words |
| Capability | invisible as a term; users see verbs, tools, studios | never say "capability" in UI |
| Mission | "Mission" | good word; keep |
| Standing Order | "Automation" (default) or "Routine" per genome skin | client-facing ones are "Automations" |
| Line | unnamed — it is *the bar* | spec name "the Bar/Line" |
| Spine / approvals | "Queue" / "Approvals" | |
| Situation | rendered as **Home** (the Brief + the Field) | word never shown |
| Memory / knowledge | "Memory" is fine user-facing; approved lessons = "Playbook" (per world) | |
| Counterparty | "the client" / "the agent" / by name | |
| Thread | "conversation" | |
| Agent runs / plan internals | "Activity" (the flight recorder) | |

## 3. Shell geometry — what is always visible

There are exactly **two levels of place**: **Home** (the portfolio) and **inside a World**.
Everything else is a view, a surface, or an overlay. No global feature sidebar exists.

Always present, on every screen, fixed positions:

1. **The Bar** (the Line) — one persistent input, bottom-center. Accepts natural language;
   routes intent (`utterance → {world, posture, capability, action}`). While typing, an
   **interpretation chip** shows what it's about to do ("→ Jane's Client · draft follow-up") so
   routing is never a mystery; the chip is correctable before commit. The Bar is also search
   (results view on demand) and command palette (explicit `/verbs` for those who want them). It
   carries a **scope chip** showing which world (or Home/global) it currently addresses; scope
   changes are always explicit and visible.
2. **The Pulse** — a small fixed attention signal (top-right): approvals waiting, blocked work,
   replies/new-needs-you, clock health. Opens **the Queue**. The Pulse never shows fake urgency:
   counts come from real rows (No-Theater inherited).
3. **The context header** — where you are: at Home, nothing; inside a world, the world's Face
   chip (identity, genome presentation, counterparty) + area name. The "you are here" signal is
   never absent inside a world; it is also the isolation signal (see §13).

World switching: (a) the Bar by name/meaning; (b) a switcher overlay (recents with
where-you-left-off, pinned, then semantic search over all worlds); (c) Home. **Return to recent
work** is a first-class rail: Home's "Continue" strip and the switcher both resume the exact
surface (workshop session, thread, mission) you left, pre-dressed.

## 4. Home — the Situation rendered (not a dashboard)

Home has three stacked elements plus the Bar:

1. **The Brief** — a generated, honest narrative answering: what happened while you were away,
   what changed, what needs you, what's running, what opportunities appeared. Every sentence is
   evidence-linked (tap → the rows). Produced by the same machinery as the morning brief; a
   quiet night says so ("a quiet night sends NOTHING" inherited).
2. **The Field** — worlds as living entities, **ranked by attention, not inventory**: only
   alive/warn/blocked/glowing worlds render prominently; healthy-quiet worlds compress;
   dormant worlds don't render (reachable via "everything" and search). At 5 worlds the Field
   is a handful of orbs; at 100 it is the same size, because attention is scarce even when
   worlds aren't. Portfolio **Lenses** (saved views — §10) sit here as tabs/chips: "Clients",
   "Prospect pipeline", "Explorations", "Running automations".
3. **Continue** — the resume rail (recent sessions, exactly as left).

Rule: Home never shows a static card grid. Everything on it is (a) generated fresh from the
Situation, (b) ranked by attention, (c) traceable to rows.

## 5. Inside a World — the interaction grammar

Every world, regardless of genome, shares one skeleton (the grammar); genomes **dress** it, they
never rearrange it:

1. **The Face** — header: name, genome presentation ("Client · Website + Automations · since
   March · $500/mo"), honest health/momentum, counterparty chip, edges ("serves ← Agency").
2. **The Desk** — the world's *now*, and its default landing: staged next moves (zero decisions
   to start — the anticipation doctrine), running work, waiting approvals (world-scoped),
   recent artifacts, open asks (intake). The Desk is the world-scoped Situation.
3. **Areas** — the world's places, genome-determined, **3–7 visible** ("More" reveals the tail).
   An Area opens as either a **view** (records/artifacts: e.g., Listings, Invoices, Contacts)
   or a **Workshop** (when the area is a craft: Brand, Outreach, Design). Same header either way.
4. **The Bar** — same bar, scoped to the world (scope chip shows it).
5. **Postures** — Think · Create · Execute · Observe as *facing*, not navigation: a 4-dot dial
   on the Desk; the AI sets it from your words; it re-stages the Desk (Observe emphasizes
   results; Think emphasizes questions/knowledge) and re-stances the AI. Postures never gate
   features; they light the same room differently.

**Genome dressing controls:** which areas exist and their order; which workshops they open;
terminology skin; what the Face's health means (client: service health + money; exploration:
open questions + discoveries; build: pipeline state); which lenses the Desk stages; which
automations run; what the AI's stance is (a client world's counsel is service-minded; an
exploration's is socratic). **Genome dressing never changes:** the skeleton, the Bar, the Queue,
scope rules, artifact frames, work shapes.

## 6. Workshops — the craft environments (foundational)

**Definition:** a Workshop is a **session-based craft environment** an Area opens into,
structured around the craft loop **gather → diverge → develop → critique → converge → commit**.
It is where mastery happens. It is not a page, a form, a chat panel, or a tool list.

**Anatomy (the reusable grammar — six parts):**

| Part | What it is |
|---|---|
| **Bench** | the working canvas at center — the material being worked. Varies by craft via **bench archetypes** (below) |
| **Palette** | references & materials at hand: sources, brand assets, prior artifacts, authorized cross-world assets (with provenance chips), knowledge/Playbook cards, examples. Drag onto Bench |
| **Counsel** | the contextual AI: conversational, *grounded in the world's memory + domain pack*, and capable of **critique against explicit criteria** — not only generation |
| **Moves** | the craft's verbs as structured controls: vary, combine, constrain, compare, score, simulate, place-on-product, test-responsive… (capability invocations scoped to the session) |
| **Ledger** | session history: every variant, comparison, critique, decision *and why* — persisted, resumable, feeding Memory. Decisions become memory events |
| **Commit rail** | outputs leave the bench: → Artifact (versioned, framed), → Mission ("produce the collection"), → Standing Order ("weekly content from this recipe"), → delegation ("worker: 10 more like #3 overnight, per the ledger") |

**Bench archetypes** (≈9 cover all crafts; a craft picks one or composes two):
`gallery/variants` (visual work: apparel, ads, brand) · `document` (copy, proposals, plans) ·
`board` (campaigns, collections, pipelines-in-the-small) · `map/graph` (research, theories,
positioning) · `flow` (automations, workflows) · `table/dataset` (lists, leads, analysis) ·
`code+preview` (the builder — the deepest bench) · `timeline/planner` (launches, content
calendars) · `sim/lab` (simulations, experiments — the Lab Bench exists).

**Ideation is structural:** the Bench natively supports **variant sets**, side-by-side and
tournament **comparisons**, **constraints** ("more luxury, same palette"), and **scored
critique** against the craft's criteria (the anti-slop rubric and score≥8 bar generalized).
Divergence before convergence is the default shape of a session, not an option.

**Drive-mode continuity (binding):** any Move can be (a) done by hand, (b) asked-for once, or
(c) handed off — the worker continues the *same session* guided by the Ledger; the Ledger
records who did what. Manual → delegated → automated is a slider within one environment, never
an interface switch. A background capability (email scraper) still *has* a Workshop — its
configuration/inspection surface — but its default drive mode is automated.

**Sessions:** a Workshop holds sessions (resumable, named by intent); the Area accumulates the
committed artifacts and the Ledger across sessions. "Return after thirty days" lands on the
Ledger's story, not a blank canvas.

**New crafts:** "Open a workshop for X" composes one from the grammar (bench archetype +
relevant capabilities + a starter criteria pack + palette wiring); repeated use refines it; the
distilled definition can enter the Catalog/genome (a *learned workshop*), through the gate.

**Distinctions (binding):** Area = the persistent place; Workshop = the craft environment it
opens into; Capability = the verbs available inside; Artifact = what is committed out; Thread =
the Counsel's transcript (part of the Ledger); the Builder = the deepest Workshop
(`code+preview` bench), same grammar, uncompromised depth.

## 7. Explore — the posture and its surface

**Entering:** open questions on the Bar route to Explore automatically (the router detects
curiosity); "explore this" exists on every object (world, artifact, source, mission, inside the
builder); a curiosity utterance with no home lazily materializes a curiosity world — silently,
zero ceremony.

**The surface:** conversation-forward with a **live map**: the dialogue grows a visible
branching map (concepts, sources, questions, discoveries) as its permanent margin. The map IS
the record — Explore is never a disposable chat. Branching: any point forks; "hold that
thought" parks a **beacon** (an open gap, per the rabbit-hole doctrine: name the gap, hold the
guess); beacons are revisitable and listed. Competing hypotheses are first-class map objects
(claims with evidence edges), comparable side by side.

**Auto-persistence:** everything lands in the containing world's memory silently (no save
button). Passing curiosity vs persistent work is handled by **decay + promotion signals**, not
by asking: untouched explorations go dormant (never deleted); return visits, artifact creation,
and intent language ("this could be a business") trigger a quiet promotion offer.

**Deepening:** when a direction needs development, "take this into a workshop" → theory
workshop (map+table bench: hypotheses, assumptions, evidence, predictions), sim workshop (lab
bench), or any craft workshop — the exploration's map context rides along in the Palette.

**Promotion ("make this real"):** identity-preserving re-genome, experienced as **the world
growing around the map**: proposal (what mounts, what it asks, what it costs) → charter → the
same map and discoveries remain in place as the knowledge core of the now-operating world.
Never an export, never a copy, never a new empty thing.

**In-world Explore:** same surface scoped to the world; discoveries land in *that* world's
memory; the map view is the world's knowledge graph filtered to the session.

## 8. Work — Missions, Standing Orders, the Queue

**Missions** (finite): created anywhere (Bar, workshop commit rail, promotion, Desk), always
world-bound. A mission renders as a **plan spine**: steps with honest states (running, waiting
on approval X, blocked on intake Y, done), wake-on-approval visible ("resumes when you approve
the draft"). Every AI step has a **flight recorder** ("Activity"): what it read, did, decided —
inspectable, always.

**Standing Orders** (recurring; display "Automations"): every one has a **heartbeat trace** —
last ran / next run / what it did / what it sent — one tap away wherever the automation or its
output appears. Silence is loud: a routine that fails or stops surfaces to the Queue; "while
you were away" in the Brief digests automated activity. Pause is one gesture from anywhere its
output appears. **Recurring work must never become invisible** — this is a trust invariant, not
a preference.

**The Queue** (the Spine's face): ONE queue globally — approvals, blocked work, failures,
needs-you — filterable by world/class, each item carrying full decision context inline (the
draft, the diff, the compare, the evidence) so approving never requires navigating away.
Batch-by-class exists; bulk actions stage per-item approvals (no gate bypass). **Earned
autonomy appears here**: after clean streaks the Queue itself offers the dial ("5 clean
approvals of client follow-ups — auto-approve this class? Instantly revocable"), and every
auto-approved action remains in the ledger view.

Cross-world work views ("what's running everywhere") are **Lenses** (§10), not places.

## 9. Artifacts — one frame, many bodies

Every artifact has the same **frame**: identity, kind, version rail, provenance trail (which
session/mission/capability made it, from what — tap through to the Ledger), publish state
(draft → approved → live, spine-wired), and universal actions (open, compare, share, reuse,
publish). Inside the frame, the **body** is kind-specific: image viewer, doc editor, campaign
board, dataset table, site/app preview. **Compare is universal** (any two versions or
variants). Deep artifacts (sites, apps) open their builder environments from the frame. No
generic editor pretends to edit everything.

## 10. Lenses — portfolio management at any scale

A **Lens** is a saved view over worlds and their contents: filter (genome, counterparty, stage,
health, lifecycle) + grouping + rendering (board / table / field / roll-up). Lenses are how ten
website clients appear together (pipeline board: stage columns, post-send signals, replied
filter), how the agency world rolls up its `serves` edges, how "everything running" reads.
Portfolio level answers **across**; world level answers **within**. Lenses can *act* only
through per-world gates (bulk = staged approvals). Built-in lenses ship with genomes (client
pipeline, prospect funnel, running automations); users save their own; the hundredth world adds
a row to a lens, never a nav item.

## 11. Creation — the Proposal, the Charter, the ceremony ladder

The intent pipeline's UX:

1. **Utterance** (or event: close-won spawns a client world; a claim can propose one).
2. **Resolve** — existing world? The interpretation chip shows the answer; near-duplicates are
   surfaced ("this looks like Mom's Real Estate — open it, or spawn something related?").
3. **The Proposal** — one screen, the world-to-be: name/presentation, genome stack ("Client +
   Website + Automations, based on: your proven client setup ×9"), the areas it will mount,
   the automations it wants to run (each with cadence and cost), seed artifacts, intake
   questions it will ask, **connections it needs (explicit, scoped grants — never silently
   inherited)**, and what it inherits from siblings with provenance ("pricing playbook from
   your last 4 clients"). Everything editable inline (remove an area, change a cadence).
4. **Charter** — one confirmation births it. Then intake asks arrive as the Desk's first next
   moves — never a form wizard.

**Ceremony is proportional to genome weight (binding ladder):** curiosity → silent, free;
venture → one confirm; client/money → proposal + connection grants; counterparty with
isolation → proposal + isolation review. A rabbit hole must cost *nothing* to start.

**Inheritance without breakage:** a genome is a stack of layers (base + learned pattern + local
overrides). Customization writes local diffs; improvements to shared layers propagate as
**proposals** to derived worlds ("your client setup improved: adopt the new booking flow?") —
never silent mutation. This is how "add another agent based on Mom's setup" works at n=2 and
n=50.

## 12. Mastery — the learning loops (foundational)

1. **Domain packs in use, not courseware:** genome-supplied concepts, best practices, examples,
   and expert **criteria** surface where they matter — criteria inside critique, concept cards
   in the Palette when relevant, playbook evidence inside recommendations.
2. **Critique is a first-class verb** with explicit rubrics; scores come with *why*; the user
   sees the criteria and can edit them. Judgment transfers to the operator, not just the output.
3. **Outcomes annotate their artifacts** ("this subject line: 3 replies", "this design: 2
   conversions") and roll into the world's **Playbook** — visible, editable, human-gated,
   consulted by every Workshop session ("Tuesday sends performed best — evidence").
4. **Calibration:** theory/decision workshops capture predictions; outcomes close them; the
   hit-rate is shown honestly (mind_decisions generalized).
5. **Patterns promote with provenance:** playbook entries → genome-level patterns through the
   gate; every reused pattern shows where it was earned. Counterparty data never travels —
   *patterns travel, data doesn't.*
6. **Anti-generic invariant:** a Workshop must open already grounded (world data, playbook,
   domain pack in the Palette); if the system has relevant context and produces generic output,
   that is a defect. The Counsel's first duty is to *know the situation*.

## 13. Isolation, provenance, and context clarity

- **Scope chips everywhere the AI acts** (Bar, Counsel, worker runs): which world, which
  counterparty. Scope change is always explicit.
- "What do you know here?" is always answerable: the Counsel produces its honest **context
  manifest** on demand.
- Cross-world references require explicit mention + a **grant**: the brother's artwork enters
  the clothing world through an authorization from the artist world, and every use carries the
  provenance chip. Grants are visible, revocable, listed on both worlds' Faces.
- Bulk/portfolio surfaces render counterparty data only within each row's scope; the Queue
  stamps every item with its world.

## 14. Progressive complexity, mobile, voice

**Three layers of use, all always available, revealed by behavior:** (1) *speak & approve* —
the Bar, the Brief, the Queue: the whole system operable as propose→approve; (2) *drive* —
Desks, Workshops, Lenses: hands-on craft; (3) *inspect* — flight recorders, Ledgers, Playbooks,
genome layers, grants: full control. Nothing essential is chat-only; nothing advanced is
hidden — it is simply not first.

**Mobile:** operate-mode first: Brief, Queue (full inline approve), Bar (voice-friendly),
Continue, world Desks read-mostly; Workshops are desktop-first with mobile review/critique/
approve states (compare two variants on a phone: yes; run the apparel bench: no).

**Voice/passive:** an explore-walk is a thread; its map renders when you return. The
architecture requires nothing new for this — it falls out of threads + auto-persistence — and
no current surface may *depend* on voice.

## 15. Anti-goals (binding, from the brief)

No giant sidebar. No genome becomes a disconnected mini-product. No capability-visibility "just
in case." Recurring automation never buried. Explore never a disposable chat. No cross-world
leakage through global intelligence. No flattening of deep tools into generic cards. No
dashboard of static cards. No exposing architectural words (Genome, Capability, Spine,
Situation, Line) in the interface. Consistency via the grammar, variation via dressing — never
generic-and-empty, never identical-everywhere.

## 16. Document plan and diagram assignments

01 principles · 02 shell (diagram: global shell & context hierarchy) · 03 world grammar
(diagram: world composition) · 04 explore (diagrams: explore/rabbit-hole lifecycle;
exploration→project evolution) · 05 capabilities (diagram: drive modes) · 06 work (diagram:
mission & standing-order lifecycle) · 07 artifacts & builders · 08 multi-world (diagram:
portfolio vs world navigation) · 09 creation (diagram: intent→world) · 10 journeys (all seven
scenarios) · 11 information architecture (only after 01–10) · 12 wireframes · 13 acceptance
tests · 14 open decisions · 15 master blueprint · 16 workshop system (foundational) ·
17 mastery & learning loops (foundational).
