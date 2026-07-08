# Garvis v3 — A Universe You Talk To

*The synthesis of three threads: the first-principles reduction (`garvis-first-principles.md`),
the GPT critique (three layers, discoverability, the waking moment), and the owner's spatial
instinct: "the whole thing is like a universe and it has different solar systems." This document
is the product model. Demo updated: `docs/mockups/garvis-inevitable.html`.*

---

## 0. What this round changes (honest scorekeeping)

Three corrections from the GPT conversation are absorbed as-is, because they're right:

1. **"Missions are the only *explicit* noun."** Internally worlds/clusters/artifacts/approvals all
   still exist — the user just never has to speak the words. And it goes further: **the user never
   classifies intent at all.** "Why do bees build hexagons?" and "grow mom's business" enter the
   same way; Garvis decides what each becomes.
2. **Discoverability is real.** "People can't use capabilities they don't know exist" — eliminating
   all navigation was one step too far. The fix is NOT a sidebar (see §4 — the owner is right to
   resist it); it's making capability *visible as potential* inside the world itself.
3. **The emotional keystone: Garvis speaks first.** Opening the product should feel like a
   companion that was already working — "While you were away…" — not a blank prompt. This is the
   anticipation engine rendered in first person; it was already designed, it just wasn't the
   front door yet.

And one idea from the owner becomes the organizing frame: **the universe with solar systems.**
Not decoration — the actual navigation model (§2).

---

## 1. The three layers (GPT's framing, adopted)

```
LAYER 1 · INTENT      visible   — what the user says. Never classified, never named.
LAYER 2 · COGNITION   invisible — mission/posture/context/memory/strategy/tools.
                                   Garvis's thinking. Shown only as the x-ray (§2).
LAYER 3 · EXPRESSION  as needed — studios materialize when the thinking requires them;
                                   otherwise they don't exist.
```

The Work Web is **the x-ray, not the main UI**: normally you're just talking; occasionally you
zoom out and see inside the machine. That reframe is what makes the graph magical instead of
overwhelming — you *chose* to look.

---

## 2. The universe model — one camera, three altitudes

The owner's instinct, engineered: the whole product is one continuous space seen through one
camera at three altitudes. **Zoom is the only navigation besides the conversation.**

```
UNIVERSE   everything — each world is a solar system: Mom's Business, Website
           Outreach, Stoke, last night's rabbit hole. Position is MEANING
           (embedding proximity — mom's system sits near Lake Geneva Brief;
           Stoke near the neuroscience research). Filaments between systems are
           real connections Garvis found ("Garvis noticed" made visible).

SYSTEM     one world — the star is the objective, burning when active. Planets
           are production areas. Moons are artifacts. Comets are next moves
           streaking in (time-limited, attention-worthy). A faint nebula ring at
           the edge is capability that COULD condense here (§4). The approvals
           whisper is a satellite in fixed orbit.

STUDIO     in the work — the focused area dressed in its posture (Think/Create/
           Execute/Observe). The four postures from v2 are unchanged; they're
           the weather inside a planet, not places.
```

The conversation bar (v2's "Line" — the name is internal only; to users it's just *the
conversation*) is the constant at every altitude. Saying "mom's real estate" from anywhere lands
you in her system; "make the postcard more luxury" lands you inside the planet, in Create. The
universe is for **orientation, wandering, and the zoom-out that makes you feel your own mind** —
never a required traversal. The fast path is always speech.

---

## 3. Gravity — sparks become missions, nobody files paperwork

The user never says "new mission" or "new exploration." Everything enters as a **spark**. Sparks
that get engagement grow into **threads** (a small system forming). Threads that acquire stakes —
an objective, an audience, something that sends — **crystallize into missions** (a star ignites).
Garvis proposes the promotion; the user just keeps working.

This is not a new mechanic to build — **the lifecycle already exists in the schema**:
`cluster_maturity: spark → growing → mature → building → finished → dormant → archived`
(clustering.ts:42, app_0013). The universe renders what the data model already knows. Dormant
systems dim and drift outward; they never disappear (the standing rule: nothing you ever made
becomes unreachable).

**Exploration mode is not a mode.** It's low gravity. The spike (GalaxyView + SceneStage +
currents + bridges + open loops — already built, 900+ lines) is the *prototype of the universe
camera itself*: drift by clicking a node, a glowing current, or thinking out loud. In v3 its
vocabulary generalizes: currents → comets you can ride to adjacent ideas; bridges → filaments
between systems; the scene stage → what a spark looks like from inside. Work and exploration stop
being different apps; they're **altitudes and gravity in one space**. A rabbit hole about bee
hexagons and mom's seller campaign live in the same sky — which is the whole point, because that's
where "your neuroscience paper connects to Stoke's onboarding" becomes literally visible.

---

## 4. The physics = honesty rules

The metaphor stays Stark instead of screensaver only if **every visual property maps to a real
signal**. Nothing decorative. The physics table:

| Visual | Signal (already in the data) |
|---|---|
| Position / proximity | embedding similarity (pgvector, app_0021) |
| Filaments between systems | `insights` connections above threshold |
| Brightness | activity recency (`mind_events`) |
| Mass / size | accumulated artifacts + results (rollups) |
| Star burning vs banked | mission active vs review/dormant |
| Comets | Next Move engine output (ranked, decaying) |
| Warn halo | pending approvals touching that body |
| Nebula ring | capability potential (registry: plays/tools valid for this world) |
| Condensation | a capability beginning → its area instantiates (lazy webs, §anticipation doc) |
| Dimming / drifting outward | `dormant` / `archived` maturity |

**Capabilities as nebulae — the discoverability answer without a sidebar.** GPT's "living
capability layer" and the owner's "solar-system menu," fused: capabilities are **unformed matter
at the edge of every system** — faint, labeled, real ("Video · Automations · MLS import · Deeper
analytics"). You *see* what could exist here without a menu, because potential is rendered as
potential. Begin one and it condenses into a planet. When the mission's state makes a capability
timely, its nebula starts to glow and Garvis says so ("this campaign would perform better with a
30-second market video — want it?") — capability *unlocks are announced, not browsed*. And the
system's own planet names teach the rest (open Mom's system, see Audience/Design/Video/Automation/
Analytics → "oh, Garvis does all that") — the graph is the documentation. For everything else,
asking the conversation "what can we do here?" answers with live capability cards — the
Capability Explorer as an *answer*, never a page.

**The three questions, answered at every altitude** (GPT's governing principle, adopted):
*Where am I?* — the altitude label + the body you're on. *What is Garvis already doing?* — the
glow, the comets, the digest. *What else can we do?* — the nebula ring. If those three are always
visible, we get simplicity without hiding the power.

---

## 5. The waking moment — Garvis speaks first

The Universe altitude's default state when there's news is not a prompt. It's:

```
Good morning, Riley.
While you were away —
 · Bob Pier replied "interested." I staged a follow-up draft.
 · Lake Geneva lakefront inventory dropped again. The scarcity angle got stronger.
 · The postcard's landing page passed 60 visits; 11 valuation requests.
 · One approval is waiting — nothing goes out without you.
```

No dashboard. Life. Mechanically this is the Next Move engine + `mind_events` digest rendered in
first person, capped at ~5 lines, every line evidence-backed (the honesty invariant carries:
counted facts, never invented numbers). Each line is touchable — it takes you to its body in one
camera move. This is the single highest-leverage emotional feature in the product, and it's a
*rendering* of machinery that already exists.

---

## 6. Failure modes, pre-answered (self-critique)

- **Spatial navigation is slower for daily driving.** Yes — so it's never required. The
  conversation is the fast path from anywhere to anywhere; the universe is orientation and wonder.
- **Legibility at 20 systems / 16 planets.** Semantic neighborhoods + label-on-zoom + the standing
  rule from the last adversarial round: *map = overview, list = navigation* — a list lens is one
  key away at every altitude.
- **The metaphor must never gate function.** Everything doable in the universe is doable from the
  conversation and from plain cards. Screen-reader and reduced-motion paths are the list lens.
- **Render cost / motion sickness.** 2D parallax points + glow (the spike already proves the
  approach); one orchestrated camera move per transition; `prefers-reduced-motion` collapses
  motion to crossfades.
- **New-user cold sky.** An empty universe seeds itself from the waking moment's cousin: "Say
  anything — a question, a business, a thing you want to build — and I'll make it a world."

---

## 7. Nothing built is wasted (the v3 mapping)

| Universe concept | Existing engine |
|---|---|
| Universe camera + drift | GalaxyView/SceneStage spike (pan/zoom, currents, map-mode) |
| Systems | knowledge_worlds + charters (work webs) |
| Planets / studios | Cluster Studio shell, postures, tools |
| Gravity lifecycle | `cluster_maturity` enum — already in schema |
| Filaments / position | embeddings + insights (app_0021) |
| Comets / waking moment | Next Move engine + mind_events (anticipation doc) |
| Satellite (approvals) | app_0022 spine, unchanged |
| Nebulae | plays/tool registry (workweb.ts) + lazy instantiation (anticipation doc) |
| Sparks → missions | Explorer graph → strategies/missions promotion |

**Build order (revised presentation track):**
- **P1 — The waking moment + the conversation as global input.** Highest emotion per line of
  code; pure rendering of existing machinery. Old routes alias in.
- **P2 — The System altitude.** One world as a solar system (planets = areas with honest physics),
  studio focus as the third altitude; nebula ring from the registry; comets from Next Moves.
- **P3 — The Universe altitude.** All worlds, embedding-positioned, filaments, gravity dimming;
  the spike's camera generalized; sparks/threads/missions promotion flow.

The one-sentence product, final form (GPT's phrasing, kept): **Garvis is an AI operating system
where you express intent, and the right knowledge, tools, people, workflows, and studios emerge
around that intent automatically.** The universe is what that feels like to stand inside.

---

## 8. Addendum — Visible cognition without theater (the No-Theater Rules)

The round-3 critique asked "how does Garvis visibly think?" The answer must never be simulated
thinking. Garvis's cognition already leaves a real, timestamped trail; visible cognition is
RENDERING ROWS AS THEY LAND:

- ingest → embedding → `insights` row crosses threshold → **a filament appears** (real)
- an agent run executes → the x-ray streams its ACTUAL tool calls (`agent_runs` checkpoints exist)
- a play runs → planets light in the order steps actually complete
- the overnight worker acted → on arrival, a ~3s replay of the delta since last seen
  (`mind_events` diff) — you watch what it DID, recorded, not a simulation
- Next Move ranking shifts → a comet appears; decay removes it

**The rules (same discipline as "never invented confidence"):**
1. **Nothing animates unless a row changed.** Every motion maps to a DB event. Motion IS news.
2. **Nothing blocks on beauty.** The conversation answers immediately; spectacle is ambient or
   after-the-fact; a "watch it think" x-ray is opt-in, never a loading screen.
3. **Every pixel is a query.** If the table behind a visual can't be named, it doesn't ship.
4. **Potential drifts; commitments stay put.** Nebulae may move with relevance (Next Move score);
   planets — things the user made — never rearrange (spatial memory is sacred).

**Adopted from round 3:** the time scrubber + provenance trail ("where did this idea begin?") —
nearly free because `mind_events` is append-only and everything is timestamped; it's a query, not
a system. Ships as **P4** of the presentation track. Honest mass/health confirmed as already in
the physics table. Six-scale astronomy taxonomy declined — three altitudes suffice.

**Round-4 refinements (adopted):**
- **Rule 3 broadened:** every pixel represents STATE — usually a table, sometimes derived; never
  "it looks neat." A planet grows because artifacts:182 / connections:318, not because CSS says so.
- **Rule 5 added:** every transition reduces FRICTION, not adds delight. If it animates, it must
  make understanding easier.
- **Every waking line answers "why should I care?"** Not "market changed" but "lakefront inventory
  fell — this strengthens your seller campaign." The why carries evidence from the rows.
- **The optimization target, named:** *Garvis optimizes intellectual momentum.* Explorer, Work,
  the studios, the Next Move engine, the waking moment — all exist to keep the user moving.
  Anything that doesn't serve momentum doesn't ship.

**Status ruling:** the philosophy has converged. Further vision rounds risk decoration. The next
unit of work is P1 (the waking moment) in the real app, against real rows. **P1 SHIPPED on this
branch:** `src/lib/garvis/nextMove.ts` (pure collectors/ranker/digest, 27-check verify),
`nextMoveRun.ts` (row fetch, last-seen, dismissals), `WakingMoment.tsx` mounted as Command's front
door (replacing the old text greeting — two greetings is a notification center, not a partner).

**Round-5 refinements (adopted with the honesty filter):**
- **Observations, not notifications** — via NARRATIVE JOINS only: a send and a reply merge into one
  causal line ("That send worked — …") exactly when they share a real campaign_id. Narrative is a
  join, never a guess. ("Opened it three times" was REJECTED: we don't persist open events yet —
  saying it would be invented intelligence. When open-tracking lands via the Resend webhook + a
  table, that sentence becomes honest and then it ships.)
- **The reasoning layer** — moves carry `expected: {text, basis}` where basis ∈ measured (this
  account's rows) | heuristic (domain knowledge, labeled as such in the UI) | structural
  (dependency logic). A heuristic never masquerades as a measurement.
- **Rule 6 (the Garvis-specific standard):** *No feature is complete until it improves the next
  morning.* If a capability doesn't eventually make the waking moment smarter, it isn't integrated
  into the operating system yet.
- **The product equation, pinned:** Knowledge + Memory + Execution + Anticipation = **Momentum**
  → compounding intelligence. Every AI starts every morning at zero; Garvis starts at yesterday.
  Every feature is judged by whether it creates momentum.

**Next: Sprint M (memory quality) before P2** — the mornings are now bounded by memory quality.
Scope: world/mission summaries (compiled, budget-bounded, stored on `knowledge_worlds.mind`),
digest-grade artifact summaries, near-duplicate suppression in insights, retrieval ranking
(recency × salience × similarity), and why-this-matters generation for ingested documents — each
feeding the waking moment per Rule 6. Then P2 (the System altitude) inherits a star that actually
knows its objective, campaigns, warm leads, and discoveries.
