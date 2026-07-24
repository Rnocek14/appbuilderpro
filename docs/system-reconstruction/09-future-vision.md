# 09 — Future Vision: Everything Planned But Not (Fully) Built

*Part of the system-reconstruction series. This document collects the author's forward-looking
intent — the things a new team must not lose. Every item is sourced. Items are ordered from
"the governing end-state" down to "specced feature blocks." Nothing here is a recommendation;
it is a preservation of the author's plans exactly as they stand, with build-status noted.*

---

## 1. The governing end-state (the "grail")

From `docs/holy-grail.md` — the author's definition of the finish line, in one sentence:

> "The grail is a system that **runs arcs instead of plans, plans from situation instead of
> sentences, extends itself when it creates, earns autonomy instead of asking forever, and
> proves itself alive every night**."

The ten structural gaps it names, with status at reconstruction time:

| # | Gap | Status now |
|---|---|---|
| 1 | Reachability — catalog covers ~14 of hundreds of capabilities; "every new surface ships WITH its action" | Open (program, not project) |
| 2 | Temporal agency — durable arcs, waiting states, auto-resume, stall monitoring | **Largely built post-scan** (orchestrator_plans app_0091, ARC WAKE app_0095) |
| 3 | Situation, not retrieval — one world-model consulted by every compile | **Built post-scan** (situation.ts feeds Orchestrator + Commander); not yet every surface |
| 4 | Creation stops at the artifact boundary — generated tools should mount as in-system rooms; genesis emits room-backed areas; "Garvis growing new organs on demand" | **Step one built** (RoomsPanel iframes, app_0099); genesis-emits-rooms still open |
| 5 | Meta-learning — engines grade their OWN output (dry hunts mutate queries; dead campaigns change strategy; unfilled holes trigger intake asks) | Open — "measurement exists; actuation doesn't" |
| 6 | Earned autonomy — per-action-class trust dial | **Partially built** (content weeks auto_mode + speed-to-lead + autonomy_grants app_0097); generalization open |
| 7 | Senses — rendered-DOM fetch, whole-inbox, calendar, payments feeds, social listening | Mostly open (calendar-sense schema app_0098 + ICS reads only) |
| 8 | Identity — deep multi-entity isolation ("two companies, cleanly" ~70% true) | Partial (six leaks closed app_0093; per-world identity incomplete) |
| 9 | Self-proof — nightly live canary | **Built post-scan** (garvis-canary, app_0096) |
| 10 | One voice — one context assembler for Commander/agent-runs/builder | Open (knowledge unified; mind digest + situation not everywhere) |

*Note the pattern: gaps 2, 3, 4(step 1), 6(partial), 9 were CLOSED in the July 20–23 campaign.
The grail list is being executed in order. A new team should assume gaps 1, 5, 7, 8, 10 are the
live frontier.*

## 2. The UI end-state: the Field, the Line, postures

From `docs/garvis-first-principles.md` + the two mockups (`docs/mockups/garvis-inevitable.html`
is a working HTML demo of the intended experience):

- **Two destinations only.** The **Field** (home): dark, calm; the Line centered; missions as
  living orbs glowing their state (ember=working, warn=needs you, green=good news, dim=quiet);
  behind them the faint breathing "subconscious" graph; an approvals whisper in the corner. And
  **a Mission**: one camera move from the Field; one surface in four posture costumes
  (Think/Create/Execute/Observe) with a four-dot posture dial Garvis moves from your words.
- **The Line** — the only element that never moves; every transition is the world re-dressing
  around it. "Tony's constant is Jarvis's voice; ours is the Line."
- **The Intention Router** — the one new engineering artifact everything hangs on:
  `utterance → {mission, posture, area?, action?}` — commander.ts "grown up" with embedding
  world-resolution, a posture classifier, area resolution, one-line disambiguation (never a
  picker), every routing decision logged to mind_events as training evidence.
- **Smoothness mechanics**: state arrives pre-dressed (prefetch on orb hover); zero decisions on
  arrival (next move staged); one SPA scene, morphs not routes, ~500ms forge easing,
  reduced-motion honored.
- **The five-minute inevitability test** governs everything: nothing to learn, nothing to find,
  nothing to manage, nothing to fear, something to love.
- **The governing question for every future feature**: "not 'where does it go?' but 'which
  posture does it dress, and does it earn its light?'"

Status: the mockups exist and are polished; the engine mapping table exists (every layer maps to
a shipped subsystem); the presentation layer itself (Field, global Line, router, postures) is
**not built**. os-blueprint deliberately re-sequences it: "Substance before cinema."

## 3. The assembly program (os-blueprint phases — the approved build order)

`docs/os-blueprint.md` §6, the last plan written (July 23), staged and explicitly approved-style:

- **Phase 0 — Turn it on** (days): CI self-arm ON by default; server-side `self_arm`; self-heal
  on sign-in when clock reads "never"; stale-clock watchdog that pushes to the phone; all 21
  secrets documented + loud in UI; fix the `send_sms` approval-enum bug.
- **Phase 1 — One home you command**: layout route so AppShell mounts once; CommanderProvider +
  the Line as a persistent bar on every screen; one typed `Situation` object rendered as the
  Field (worlds as orbs).
- **Phase 2 — One memory that compounds**: one `assembleContext(scope)` for all three brains;
  embed all six subject types; machine-distill `mind_events → mind_beliefs`;
  `world_intelligence` on the clock; an insights proximity-scan worker.
- **Phase 3 — Bridge the dead-ends & unify the noun**: Canvas social → queueSocialPost bridge;
  (marketing email → real rail — partially done already); consume or delete scroll_scenes
  (consumed by bespoke sites already); world_id mandatory on missions; collapse the two mission
  writers; unify 5 WorkerKind ↔ 24 tool ids; Intention Router v1 + posture dressing.
- **Phase 4 — Vertical-as-Data**: `VerticalSpec` type + `vertical_specs` table (detect signals,
  context pack, areas w/ tools + seed artifacts + workshop copy, postures); externalize the
  ~1000-line context PACKS to data; genesis validates against rows; a build-failing **coverage
  contract** so new verticals auto-expose their powers to the Line. "Introducing a new venture
  kind is inserting a row — that is the whole game."
- **Phase 5 — Consolidate & subtract** (only after supersession): merge three money doors;
  collapse Mind/Brain/Memory; fold five intention front doors into Line + Field; alias every old
  route.

Success metrics defined: alive out of the box (binary) · one home (binary) · compounding seams
closed (today ~1 of 5) · unattended hours · verticals added as data (today 0) · clicks to a
closed loop (today ~5–7 + invisible secret config).

## 4. Multi-business connection (the "many ventures" thread)

Scattered across documents but consistent:

- **Worlds as the portfolio unit**; `apps → worlds` reconciliation forced by the blueprint (give
  `apps` a `world_id`; migrate app_id-keyed intelligence tables).
- **Cross-venture memory**: "a lesson learned in one venture surfaces by meaning in another" —
  blocked on embedding coverage (Phase 2).
- **Portfolio synergies**: `garvis_opportunities` (connections between the operator's OWN
  ventures) — table live, surface thin.
- **Deep identity isolation**: per-world sender identity/domains (built), contact stamping,
  world-aware sending, per-world inbound, per-world provider connections (MLS, DocuSign),
  world-scoped invoice numbering (open).
- **A world can be**: a business, a side project, a client engagement, or a rabbit hole — the
  explicit resolution that curiosity and commerce share one substrate.

## 5. The specced-but-unbuilt feature blocks (preserve these — they are designs, not ideas)

1. **Level 10 blueprint** (`garvis-level-10.md`, the largest block): score ≥ 8 judge bar on all
   creative output; graduated content-week autonomy (shipped); seven pillar specs — images,
   producer, social, email, **Lob print-vendor direct mail**, video, quality. Includes disclosed
   AI b-roll policy (in tension with video-pillar's "never a fabricated frame" — see
   10-open-questions.md).
2. **Hybrid DB** (`hybrid-db.md`): shared free-tier database for generated apps (edge-mediated
   S1 design) vs dedicated-pro provisioning — "the clearest planned-but-unbuilt subsystem."
3. **Cloud Console CC2–CC9** (`cloud-console.md`): Lovable-Cloud-parity in-app backend
   management; CC1 (db-console) built.
4. **Reels engine**: `reel_jobs`/`reel_clips` schema (Sora/Runway/Luma per-scene pipeline,
   "faceless account roster") — dead schema awaiting its engine.
5. **DocuSign back half**: upload → auto-template → auto-populate from client records
   (engagement/subscription/MLS listing) → trigger-staged envelopes → signed-PDF filing (filing
   shipped).
6. **Ad placement writes** — explicitly gated on owner registrations + read-sync proving out;
   watchdog stays detection-only until then.
7. **Senses**: headless rendered-DOM fetch (JS portals; hunts currently count them "thin");
   IMAP/Gmail whole-inbox; calendar beyond ICS; payments/financial feeds; social listening.
8. **Engine self-tuning** (grail gap 5): outcome-graded hunts/campaigns/plans proposing their own
   revisions **through the existing knowledge approval gate** (the safety design is already
   decided: self-tuning proposals are approval-gated lessons, not silent mutations).
9. **Anticipation surfaces** (`garvis-anticipation-design.md`): 19 destinations → 4 surfaces;
   the deterministic Next Move engine with a 3-slot discipline (partially shipped); the "waking
   moment" — Garvis speaks first when you arrive (mocked, not built); the Morning Test.
10. **Genesis extensions** (`garvis-genesis-blueprint.md`): vision photo intake (app_0029
    exists), website bridge (app_0030 exists), market intel, expertise packs, vertical
    intelligence — genesis emitting **room-backed** area types is the open end.
11. **Voice** — no plan document exists for talking TO Garvis by voice; the Jarvis framing and
    the Line's design ("Tony's constant is Jarvis's voice; ours is the Line") deliberately
    substitute text for voice today. Telephony voice (missed-call, receptionist) is the built
    path; a Garvis voice interface is implied future work only.
12. **Data export + account deletion; mobile 3D fallback; table overflow wrappers**
    (master-audit Tier 3) — compliance/polish backlog.

## 6. North-star metrics the author chose (repeat across three docs)

- **Unattended hours** — time the heartbeat does real work with no operator touch and no silent
  failure (the #1 metric everywhere).
- **Loops closed** — of the instrumented capture points, how many feed behavior (~1 of 6 at
  scan time).
- **Idea → live URL time**; **first-forge success rate**.
- **Approval throughput** — proposals surfaced vs acted on ("leverage or noise").
- **Verticals added as data** (today 0); **clicks to a closed loop** (today ~5–7).

---

*The single most useful thing a new team can take from this document: the author's plans are not
aspirational scatter — they form an ordered program (grail gaps → fix campaign → OS blueprint
phases) that was actively mid-execution when the repository snapshot ends. The next planned
moves, in the author's own sequencing, were Phase 0 (turn it on) and Phase 1 (the Field + the
global Line).*
