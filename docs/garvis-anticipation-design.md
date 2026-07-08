# Garvis: The Anticipation Layer & The Interface

*The design answer to two questions: "How does Garvis decide what should happen next without me
navigating there?" and "How does the interface stop feeling like 15 tools?" Grounded in a full UI
inventory and adversarially critiqued (2 hostile reviewers, 16 attacks absorbed — 4 rated fatal).*

---

## 1. The thesis

The hierarchy is now correct (Mission → Web → Studio → chat/files/versions/tools/approvals). What's
missing is the layer ABOVE it and the discipline AROUND it:

```
today:   user picks a studio  →  works a tool          (software)
target:  user states an objective → Garvis proposes strategies →
         studios activate as needed → Garvis surfaces the next move   (an operating system)
```

Tony Stark never says "open Marketing Studio." He says "we need to find Loki" and the room
reconfigures. The unit of intent is the **objective**; strategy and tooling are Garvis's job. The
user should spend most of their time **responding to good suggestions**, not hunting for tools.
That is the line between "an app with AI" and "an AI operating system" — and it is a *ranking
problem plus restraint*, not a new subsystem (§4).

---

## 2. The chaos diagnosis (measured, not vibes)

The inventory audit confirms the feeling. Today's sidebar has **19 destinations**; worse than the
count is the duplication:

- **Four surfaces for one concept**: Command plans/runs missions inline; Missions is a form-based
  duplicate (its own copy says "Prefer to just talk? Use Command — same engine"); MissionControl is
  a read-only feed over the same runs; Work Webs then *redefines* the mission as a territory.
- **Four memory stores**: Mind (identity/beliefs/decisions), Brain (documents/insights), the
  pending-knowledge queue buried on Garvis Overview, and the per-project Brain in the workspace —
  with no answer to "which one does Garvis remember with?"
- **Two parallel content factories**: the Marketing page (marketing_assets, its own approve/publish
  lifecycle) and the Studio system (knowledge_artifacts + the approvals queue) generate the same
  asset types through different data models and different approval flows.
- **"What should I do?" is answered in four places**: Opportunities page, MissionControl's top
  tiles, Command's greeting, and Garvis Overview's auto-recommendation — each with its own framing.
- The Garvis Overview page auto-runs four phases on mount and renders seven panels — the densest
  page in the app is also the least directed one.

A user feels "15 tools" because there literally are parallel tools for the same job. The fix is not
visual polish — it is **consolidation with one attention discipline**.

---

## 3. The consolidation: 19 destinations → 4 surfaces + 1 anchor

```
COMMAND   the front door: "What are we doing today?" + Next Moves (max 3) + active missions
WORK      objectives → strategies → the growing web → studios (focus mode)
BRAIN     memory: Mind (default tab: identity/beliefs/decisions) · Knowledge (docs/universe) · Insights
BUILD     the app builder: projects, new/import, autopilot+inbox, preview engine
────────
APPROVALS the trust anchor: stays a REAL PAGE (queue + execution ledger), plus a global
          overlay/badge reachable from anywhere. (Critic-fatal: an overlay-only approvals
          destroys the trust anchor and breaks existing wiring — the page stays.)
```

**Fold map (with route aliases in the same PR — nothing 404s, internal links migrated):**
- Missions + MissionControl + Marketing → **WORK** (marketing assets become studio artifacts;
  the marketing worker writes into a web's studios).
- Opportunities (page) → the **Next Moves rail** (with "See all (n)" — the cap limits *emphasis*,
  never *access*).
- Mind + Brain + pending-knowledge queue → **BRAIN**, Mind as the DEFAULT tab, an open-decisions
  badge on the nav item (the discipline loop must not get buried under the library).
- Garvis Overview's portfolio panels → a "Portfolio" card set inside WORK (apps are just another
  territory); its auto-recommendation joins the Next Move engine as one more collector.
- Labs/spike stays admin-only; Landing gets Garvis-aware copy later.

**Critic-fatal absorbed:** the command line is an *accelerator, never the only path* — COMMAND
always renders clickable cards (active missions, the 4 surfaces, approvals count) below the input.
Blank-page paralysis is real; the app's own onboarding research already said so.

---

## 4. The anticipation engine ("Next Move")

**The answer to the week-long question, compressed: anticipation = signals × collectors ×
deterministic ranking × a 3-slot discipline × a feedback loop. Garvis already emits every signal
it needs.** No new intelligence infrastructure — a ranking function over the spine:

**Signals (all existing):** pending `approvals` (the user IS the bottleneck) · `replies`
(a positive reply is the highest-value event in the system) · stalled sequences (sent, no
follow-up queued) · `execution_runs` failures · `insights` ("Garvis noticed") ·
`garvis_opportunities` (heartbeat scans) · cluster/charter states · play completions ·
`mind_decisions` with open outcomes.

**Collectors (pure functions, verifiable):** each maps rows → candidate moves
`{kind, title, why, action, urgency, value, born_at}`. Examples:
- `approval_waiting` — pending > 1h → urgency ↑ with age.
- `reply_unanswered` — positive reply, no next touch → value = max.
- `blocking_dependency` — Print & Send has queued work but Mailing Lists has zero members
  (computable from charter archetype + artifact/list counts alone).
- `natural_next_step` — play finished, nothing queued from its outputs.
- `decision_unclosed` — a journal decision past its review date.

**Cold start (critic-serious absorbed):** a brand-new account has zero history — the rail must
never be empty at the front door. The deterministic floor needs no history: template-structural
moves ("Your Brand vault is empty — add the logo and tone so every studio writes in her voice",
"Mailing Lists is empty and blocks Direct Mail"). These are computable on day zero.

**Ranking:** deterministic score (urgency × value × decay), LLM used ONLY to phrase the one-line
"why" — never to invent the ranking. **The 3-slot discipline is the product**: Home shows at most
three; each mission header shows one. Scarcity is what makes it read as judgment instead of a
notification firehose.

**Feedback:** acting emits events → new candidates. Dismissing stores a penalty for that collector
kind (dismissals teach). Ignoring decays. This closes the loop without any model training.

**Honesty invariant (critic-fatal absorbed):** Garvis never shows an invented number. Strategy and
move claims are **evidence-counted, mind.ts-style**: "untested — new territory" or "run 3×: 41
sent, 5 replies, 2 conversations." Numeric estimates unlock only when the account has real prior
outcome data for that strategy type. A fabricated "Confidence: 82%" shown to a trusting user is
how the whole system loses its authority.

---

## 5. Objective → Strategy → the web that grows

**New object: `strategies`** (the one genuinely new table this design needs):

```sql
strategies (id, owner_id, mission_id, title, rationale,
            evidence jsonb,          -- counted facts only: runs/sent/replies per prior use
            play_id, required_areas text[],   -- template slugs this strategy needs
            status proposed|active|done|dismissed, results jsonb, timestamps)
```

- `propose-strategies` (edge fn): objective + world context + brain retrieval + past results →
  2–4 strategies, each with rationale and *evidence-counted* claims. Recommended combo marked.
- **Begin** = instantiate the **transitive closure** of the strategy's `required_areas` (every play
  `targetSlug` + its template ancestors — `validatePlay` already knows them; `runPlay` throws, not
  skips, on a missing target) → then run the play. The web **grows** strategy by strategy, exactly
  like the Explorer graph grows from curiosity.
- **Visibility rule (critic-serious absorbed):** lazy-build governs *creation only, never
  visibility*. Anything ever instantiated stays on the map forever (dim when dormant). Pre-Begin,
  the map shows **ghost placeholders** of what each proposed strategy would add — so "where did
  Direct Mail go?" can never happen.

**⚠️ Critic-fatal, must fix before lazy webs ship:** `syncUniverse` has full-graph-replace
semantics — clusters missing from the client's localStorage graph get **stale-deleted** on the next
sync. A server-side strategy instantiation would be wiped by the next Explorer autosave. The guard:
`syncUniverse` must never stale-delete rows where `charter IS NOT NULL` (chartered clusters are
server-authoritative), and `loadWorld` must merge unknown chartered clusters INTO the local graph.
Small diff, existential importance.

---

## 6. Specialists: Garvis changes hats

Personas are **data, not models** — a roster per (archetype, flavor) in the pure core:

```
direct_mail studio → Marketing Director · Creative Director · Copywriter · Print Specialist · Data Analyst
video studio       → Film Director · Editor · Social Strategist · Voice Talent · Motion Designer
audience           → Data Scientist · CRM Specialist · Consumer Psychologist
```

The studio-chat system prompt carries the roster; Garvis silently adopts the best-fit hat per turn
and returns `hat` in the decision JSON. The UI shows a small chip on the reply. **Critic-serious
absorbed:** the chip is self-explaining on hover/tap — *"Same Garvis, wearing its copywriter hat
for this"* — and the hat stays stable within a thread unless the ask clearly changes. One
intelligence, many stances; never "multiple people."

---

## 7. The interface (the Stark translation)

What the three reference stills actually teach: **one focal point; ambient context; information as
light; tools materialize when relevant; the UI recedes, the work glows.**

**Screen 1 — COMMAND (home).** A dark, calm field. Centered: "What are we doing today?" Below it,
always-visible cards (never blank-page): active missions, the four surfaces, approvals badge. To
the side: the Next Moves rail — max three, each one sentence + one button. The ember radial glow
(already in the design system) breathes behind it.

**Screen 2 — MISSION (objective-first).** The objective is the headline ("Grow Mom's Business",
target chip "20 new listings"). Strategy cards beneath: title, rationale, **evidence-counted
claim**, Begin. A recommended combo is marked. Below, the web — as ghosts until begun.

**Screen 3 — THE WEB + STUDIO (focus mode).**
- **Map = overview, list = navigation** (critic-serious absorbed): the orbital map shows ≤ 8–10
  orbiters — children collapse into a parent badge count; singles group by archetype. Every glow
  state pairs with a text label (working / needs you / done / ghost). The indented tree remains the
  actual navigation rail — it already exists.
- **Focus mode**: click an area → the map dims into the left rail, the studio takes center (chat at
  bottom, tools as contextual cards, artifacts with version pills), approvals/results on the right.
  A **persistent slim header** keeps the objective + rollup chips, and a labeled exit ("← back to
  Grow Mom's Business") pins top-left — spatial memory survives the zoom (critic-minor absorbed).
- Motion: one orchestrated transition (map ⇄ focus), the existing ember/smolder idiom for "Garvis
  is working," nothing else animates. `prefers-reduced-motion` honored.

**The three laws of the layout:** (1) at most one focal region per screen; (2) at most three
things may ask for attention; (3) nothing exists on screen that the current objective doesn't need
— but nothing the user ever made is more than one click from visible.

*A working visual of all three screens: `docs/mockups/garvis-ui-concept.html` (also published as a
live artifact).*

---

## 8. Build order

- **Sprint A — Consolidation + Next Moves v1.** Nav → 4 surfaces + Approvals; route aliases +
  internal-link migration (grep every `navigate('/garvis/…')`); fold Marketing/Missions/
  MissionControl/Opportunities into WORK/rail; Next Move collectors (pure + verify) with the
  deterministic cold-start floor; rail on COMMAND + mission headers. *No new intelligence — pure
  rules + existing signals.*
- **Sprint B — Strategies + growing webs.** `strategies` table + `propose-strategies` fn
  (evidence-counted claims only); Begin = transitive-closure instantiation; ghost placeholders;
  **the `syncUniverse` chartered-cluster guard ships first in this sprint**.
- **Sprint C — The cinematic layer.** Orbital overview (badge-collapsed), focus-mode transition +
  slim header, specialist hats in studio chat, dismissal-feedback on the rail.

---

## 9. Keep / kill / merge (this round)

- **KEEP**: Approvals as a real page (trust anchor). The tree list as primary web navigation. The
  forge/ember design system (it already is the identity).
- **MERGE**: Marketing → studios; Missions/MissionControl → WORK; Mind+Brain+knowledge-queue →
  BRAIN (Mind default tab); Opportunities → Next Moves rail.
- **KILL**: the Garvis Overview mega-page (its panels redistribute: recommendation → rail,
  portfolio → WORK, knowledge queue → BRAIN); the standalone Marketing lifecycle.
- **NEVER**: invented confidence numbers; overlay-only approvals; hiding anything the user made;
  a second agent system for personas.
