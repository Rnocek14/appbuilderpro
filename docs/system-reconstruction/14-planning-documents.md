# 14 — The Planning Documents: A Complete Archaeology of the Author's Intent

*Part of the system-reconstruction series. This document digests every planning artifact in
`/docs` (excluding this `system-reconstruction/` output area), the two HTML mockups in
`docs/mockups/`, and the root `README.md`. These files are treated as first-class design documents:
they encode what the author wanted the system to BE, in the author's (and the author's AI
collaborators') own words. For each document: what it is, when it was written, the vision it lays
out, the concepts it introduces, the product philosophy it encodes, and — critically — what it
PLANS that may not be implemented.*

*Git context: the repository's first commit (`ef207e3`, 2026-07-13) imported 27 of these documents
at once; they were written over an earlier development period and their internal order can be
reconstructed from migration numbers and cross-references (§ Synthesis). The remaining documents
landed between 2026-07-15 and 2026-07-23: `automation-triggers-seed.sql` + `client-billing-setup.md`
(Jul 15), `garvis-level-10.md` (Jul 16), `best-software-plan.md` → `where-we-stand.md` →
`orchestrator.md` → `holy-grail.md` (Jul 18, in that order), `full-system-scan.md` (Jul 19, addendum
Jul 20), `twilio-setup.md` + `go-live-checklist.md` (Jul 22), and `os-blueprint.md` (Jul 23) — the
last planning document written before this reconstruction.*

---

# Part I — Per-document digests

The documents fall into six natural families:

| Family | Documents |
|---|---|
| **A. Builder-era specs** (pre-Garvis / FableForge product) | README.md, phase6-backend-tier.md, legendary-roadmap.md, cloud-panel.md, cloud-console.md, hybrid-db.md |
| **B. The founding architecture** | garvis-system-architecture.md, garvis-studios-blueprint.md |
| **C. The vision/UX line** | garvis-anticipation-design.md, garvis-first-principles.md, garvis-universe-model.md, garvis-universe-visual-design.md, garvis-universe-design-scan.md, mockups/garvis-ui-concept.html, mockups/garvis-inevitable.html |
| **D. Capability sprints** (each documents a shipped increment) | garvis-genesis-blueprint.md, garvis-bones-audit.md, garvis-glory-sprint.md, garvis-master-audit.md, garvis-deploy-executor.md, garvis-wave-a-goals.md, garvis-heartbeat.md, garvis-speed-to-lead.md, garvis-watchdog.md, garvis-video-pillar.md, garvis-advertising-plan.md |
| **E. The audit/strategy line** (July 2026 re-reckonings) | garvis-level-10.md, best-software-plan.md, where-we-stand.md, orchestrator.md, holy-grail.md, full-system-scan.md, os-blueprint.md |
| **F. Operator runbooks** | RUNBOOK.md, go-live-checklist.md, twilio-setup.md, client-billing-setup.md, automation-triggers-seed.sql |

---

## A. Builder-era specs

### README.md — the front door
**What it is:** The product README, kept updated through the project's life; the only document
that describes both halves in one breath.

**The vision:** *"Two halves of one system"* — **FableForge** ("your own Lovable-style AI app
builder... on **your** Supabase project, with **your** model keys") and **Garvis** — *"an AI chief
of staff living at `/garvis/command`: ventures (growth ops, answering desks, document studios, data
workspaces, trackers, product labs), a grounded knowledge brain, standing orders on a real clock,
money + invoice chasing, and ONE approval queue for everything outbound."*

**The philosophy, stated in the product's own tagline:** *"Honest by construction: no invented
numbers, refusals over fabrication, nothing sent without your yes."* This single sentence is the
compressed form of the honesty doctrine that recurs in every other document.

**Concrete features documented:** the 11-stage generation pipeline (interpret → blueprint → schema
→ file tree → frontend → backend → auth → styling → validate → fix → summarize), Monaco workspace
with version history, Sandpack preview, multi-provider AI (Anthropic/OpenAI/OpenRouter/local),
13-table RLS schema, Free/Pro plans with a *"cleanly stubbed checkout"*, Lovable project import
(GitHub or zip), and **Autopilot** — *"turns FableForge from a tool you babysit into a queue you
feed"*, with budget caps, an approval inbox (*"when a decision would genuinely change what gets
built... the agent queues a question instead of guessing"*), project memory, and morning reports.

**Plans vs reality flags in the README itself:** Stripe billing is described as stub-mode with a
wiring guide; deployments are described as recorded rows with *"a clean hook point for real deploy
pipelines"* — a description that later documents (best-software-plan.md) explicitly call a lie to
delete, because real Netlify deploys were built later. Closing line: *"Forge well. It's your anvil
now."*

### phase6-backend-tier.md — "the real systems unlock"
**What it is:** A plan (builder era, pre-Garvis) for generated apps to gain real backends.

**The vision:** move FableForge from *"generates beautiful frontends + a Supabase schema"* to
*"generates working systems"* — email, scraping, payments, AI, cron, webhooks — *"at par or better
than Lovable."* The architecture: generated apps call Supabase Edge Functions; secrets live
server-side; the model declares an **Integration Manifest** in the blueprint; a Lovable-style
**SecretsModal** pops up asking for each key *"with... what it's for, a link to where to get the
key"*; a one-click **Deploy backend** pushes migrations/functions/secrets via the Management API.

**Key concepts introduced:** the integrations manifest (`/supabase/.fableforge/secrets.json`), the
edge-function template (CORS/auth/validation/signature-verification baked in), the **Backend Map**
(*"a generated view of functions, secrets, schedules, and webhooks so the user sees the whole
system"*), and the "better than Lovable" scorecard (auto-detect secrets **and explain why**).

**Philosophy:** *"Security model (non-negotiable): Secret keys ONLY server-side... Never a `VITE_`
var."*

**Planned-not-necessarily-implemented:** the full integration catalog depth, preview shims for
undeployed functions, and the Backend Map view; later audits confirm the deploy pipeline shipped
but treat the generated-apps backend tier as a smaller slice of what this doc imagined.

### legendary-roadmap.md — "clearly better than Lovable"
**What it is:** Roadmap (builder era) covering Phases 7–10 after the build engine reached parity.

**The vision:** close the productized-surface and autonomy gaps: **Phase 7** one-click hosting
(Netlify file-digest deploy, WebContainer build), **Phase 8** security hardening (Vault secrets,
the `apply-migration` confused-deputy fix — later marked "✅ DONE" in-place), **Phase 9** GitHub
export + cross-file search, **Phase 10** autonomy (*"durable plan/DAG"*, *"'done' = verified...
not a prompt vibe-check"*, the *"Garvis→build bridge"* letting a Garvis mission enqueue real
autopilot steps, and edge-mirroring the DIRECT-only intelligence).

**Notable:** this is the earliest doc where "Garvis" appears as an existing subsystem
(`garvis_tasks`, missions, workers), and where the discipline *"each phase ends green on
tsc/vite build/deno check + its verify"* is stated — the house verification religion.

**Planned-not-implemented flags:** 10d ("edge-mirror the DIRECT-only intelligence") is still
listed as a top weakness in best-software-plan.md months later; Vercel as second deploy provider
never appears again.

### cloud-panel.md and cloud-console.md — the in-app backend manager
**What they are:** Two successive specs (panel = v1, console = the expanded parity plan) for
managing an app's backend inside FableForge, *"like Lovable's 'Cloud' tab... not by going to
Supabase."*

**The plan:** a `db-console` → `cloud-console` edge function proxying the Supabase Management API,
with phases CP1–CP5 / CC1–CC9: database viewer → row editing → table create/alter → secrets
manager → auth users → storage → functions+logs → monitoring → backups → usage. Safety: identifier
validation, writes gated to PK'd tables, everything against the caller's own project.

**The one deliberately-deferred business decision, named as such:** *"Fully-managed provisioning
(FableForge operates the backend under its own account...) = data custody + cost + compliance...
the pivot is a separate, deliberate product/infra choice."*

**Planned-not-implemented flags:** the higher phases (CC2–CC9: table alter UI, storage browser,
backups, usage analytics) are specs only; later scans mention the DB console and logs as real but
never claim the full parity map.

### hybrid-db.md — shared free tier + dedicated pro
**What it is:** A spec for the two-tier database model for generated apps.

**The vision:** free apps share a small number of operator-owned Supabase projects; pro apps get a
dedicated project (already built via `provision-supabase`). The honest technical catch is stated
plainly: *"schema-per-app + anon key is **not safe** on Supabase's model"* — so the recommended
design is **S1, an edge-mediated `data-api`** where generated apps never hold the shared key and
isolation is enforced server-side (with the verify test *"a second app cannot reach the first's
rows"*).

**Planned-not-implemented flag:** S1 is referenced by cloud-console.md as "built as its own
verifiable phase" *in the future tense*; no later audit confirms the shared tier shipped. This is
one of the clearest planned-but-likely-unbuilt subsystems.

---

## B. The founding architecture

### garvis-system-architecture.md — the nine-repo audit that founded Garvis
**What it is:** The keystone architecture document: a *"deep scan of all nine repos"* the author
owns, an executive verdict, a consolidation plan, data model, UX model, workflow maps, and a
build roadmap — with two shipped-sprint addenda (§10a, §10b) appended as work landed.

**The founding sentence:** *"What Garvis is becoming: a personal AI operating system with one
intelligence core (memory, knowledge graph, agent runtime, approval-gated execution) and multiple
work surfaces... this system already exists in embryo, and it lives in exactly one place — this
repo (FableForge)."*

**The five real gaps it named (priority order):** (1) *"No email sending anywhere in Garvis"*;
(2) no persistent embeddings/file intake (*"the 'living brain' can't ingest"*); (3) no unified
approval/execution ledger; (4) security debts (apply-migration authz, Vault, DIRECT-mode keys);
(5) the Garvis→build bridge.

**The biggest risk it named — dilution, not technology:** *"nine repos, ~1.1M lines of TS, one
person... The vision fails by dilution, not by any single technical gap."* The one-sentence path:
*"treat FableForge as the Garvis platform; make the brain persistent...; give Garvis hands (one
approval queue + one send path); port the outreach schema from swift-prep-pros; mount video as a
service; register the real products as connected 'apps' — and stop feature work everywhere else
while you do it."*

**Key concepts introduced (that everything later builds on):**
- **Hub-and-spoke, not monorepo** — capabilities merge in; products (a stroke-therapy clinic with
  PHI, a hyperlocal newspaper, a privacy SaaS, a degree planner) stay spokes registered as `apps`.
  *"Clinical data does not belong inside a personal OS."*
- **The one send path** — *"exactly one send path (`send-email`...). Nothing else may send."*
- **The two-write invariant** — every module writes a `mind_events` row (what happened) and an
  `embeddings` row (what it means): *"the invariant that keeps it one brain, not silos."*
- **The Tony Stark surface** — four surfaces (Command / Universe / Work / Workshop), one command
  line, *"navigation is conversation-first"*, the forge/ember design system (`#0C0E13` +
  `#FF8A3D`) as Garvis's identity.
- **Compliance as design** — CAN-SPAM caps/warmup/kill switch/suppression are called
  *"non-negotiable"* before any send path exists.
- §10b's **Work Web insight**: *"a mission is not a checklist — it is a living work web"*; the
  **seven archetypes** (Intel · Audience · Studio · Launch · Loop · Ledger · Vault) as the
  domain-agnostic deep structure; *"Adding a domain = adding a template + maybe a flavor row —
  never a new subsystem"*; **plays** as deterministic campaigns that *"work with zero AI keys"*
  and AI merely enriches.

**Keep/Kill table (brutal version):** KEEP appbuilderpro; MERGE swift-prep-pros' outreach model;
HARVEST-then-FREEZE traction-engine (video) and theory-thread (knowledge patterns); KILL
path-to-success-tracker; *"REBUILD: nothing."*

**Planned-not-implemented flags:** the Gmail/Drive/Calendar connectors ("later, OAuth via existing
PKCE flow"), the full connector registry health board, and Phase 9 "Productization / multi-tenant"
remain unbuilt per later audits.

### garvis-studios-blueprint.md — Work Webs, Studios, Mom Real Estate, video/design/lists/MLS
**What it is:** The deep follow-up scan. Verdict: *"the skeleton is built and correct; the studio
muscle is not there yet"* — honest scoreline *"Work Web engine 8/10, Cluster-as-Studio 3/10, Mom
Real Estate 4/10... Video 0/10... Design/image 0/10 in Garvis (but 90% harvestable from your
other repos)."*

**The four missing things (same four for every domain):** in-cluster AI chat, per-cluster
files/assets, artifact versions, real generative tools.

**The one hard rule:** *"don't let it sprawl. The cluster studio is *one* reusable shell. Every
'studio'... is that same shell with a different tool pack + a different artifact renderer. Build
the shell once; the studios are data."* North star: *"one intelligence operating through many
studios. The studios are data; the shell is the product; approval + ledger keep it safe; the brain
keeps it connected."*

**What it specifies concretely:** the complete Mom Real Estate work web (Brand / Market Intel /
Audience / MLS / Angles / Direct Mail Studio with six sub-areas / Ads / Video / Email / Landing /
CRM / Automation / Results / Opportunities); the Direct Mail pipeline (gpt-image-1 artwork →
postcard template → print PDF → list pick → cost estimate → approval → *"MVP = download
print-ready PDF + CSV for a print vendor; later = Lob API"*); the traction-engine video harvest
plan with **non-negotiable security fixes** (its RLS was world-writable, `verify_jwt=false`
everywhere, a service-role key shipped in a request body); the audience data model (properties/
households/lists/segments/consent — *"the biggest genuinely-new data build"*); the MLS three-tier
plan (*"MLS data is contractually controlled. Never scrape it."*); and the Cluster AI Chat as
*"the piece that makes clusters feel alive"* with the acceptance test: *"'make the postcard copy
more luxury, less salesy' → Garvis writes postcard-copy v2, marks it active, shows the diff, sends
nothing."*

**DON'T BUILD list (deliberate omissions):** Canva integration, MLS scraping, a CMYK pipeline,
*"a second agent system"*, ads platform APIs before there's ad spend.

**Planned-not-implemented flags:** the full audience model (properties/households/EDDM), the
listings/comps tables, Lob fulfillment, and the traction-engine video port were still open at the
July full-system scan (video went a different route: Shotstack storyboard render; the Sora/Runway/
Luma reel factory remained "dead schema").

---

## C. The vision/UX line (the "Tony Stark" documents)

These five documents plus the two mockups are a continuous design argument, each explicitly
building on (and adversarially critiquing) the previous.

### garvis-anticipation-design.md — the Anticipation Layer & the interface
**What it is:** A design doc answering *"How does Garvis decide what should happen next without me
navigating there?"* and *"How does the interface stop feeling like 15 tools?"* — noting it was
*"adversarially critiqued (2 hostile reviewers, 16 attacks absorbed — 4 rated fatal)."*

**The thesis:** *"Tony Stark never says 'open Marketing Studio.' He says 'we need to find Loki'
and the room reconfigures. The unit of intent is the **objective**... The user should spend most
of their time **responding to good suggestions**, not hunting for tools. That is the line between
'an app with AI' and 'an AI operating system' — and it is a *ranking problem plus restraint*, not
a new subsystem."*

**The measured chaos diagnosis:** 19 sidebar destinations; four surfaces for the mission concept;
four memory stores; two parallel content factories; "what should I do?" answered in four places.
*"The fix is not visual polish — it is **consolidation with one attention discipline**."*

**The consolidation:** 19 destinations → **COMMAND / WORK / BRAIN / BUILD + APPROVALS** ("the
trust anchor: stays a REAL PAGE... an overlay-only approvals destroys the trust anchor").

**The Next Move engine:** *"anticipation = signals × collectors × deterministic ranking × a 3-slot
discipline × a feedback loop. Garvis already emits every signal it needs."* Ranking is
deterministic; *"LLM used ONLY to phrase the one-line 'why' — never to invent the ranking. **The
3-slot discipline is the product**... Scarcity is what makes it read as judgment instead of a
notification firehose."*

**The honesty invariant, in its sharpest form:** *"Garvis never shows an invented number. Strategy
and move claims are evidence-counted...: 'untested — new territory' or 'run 3×: 41 sent, 5
replies, 2 conversations.' Numeric estimates unlock only when the account has real prior outcome
data... A fabricated 'Confidence: 82%' shown to a trusting user is how the whole system loses its
authority."*

**Other concepts introduced:** the `strategies` table (evidence jsonb of *"counted facts only"*);
ghost placeholders on the web map (*"lazy-build governs creation only, never visibility"*);
specialist **hats** (*"Personas are data, not models... One intelligence, many stances; never
'multiple people'"*); the three laws of layout (one focal region; at most three attention asks;
nothing on screen the objective doesn't need). The critic-fatal `syncUniverse` stale-delete bug is
flagged here (*"small diff, existential importance"*) and closed in garvis-universe-model.md.

**NEVER list:** *"invented confidence numbers; overlay-only approvals; hiding anything the user
made; a second agent system for personas."*

**Planned-not-implemented flags:** the `strategies` table and `propose-strategies` function, the
Sprint C "cinematic layer," and the full 4-surface nav consolidation do not appear in the later
code audits; the os-blueprint (July 23) still complains of a 25-item sidebar and five "tell me
what to do" front doors — i.e., the consolidation this doc designed was largely not executed.

### garvis-first-principles.md — the product reduced to two nouns
**What it is:** The most radical vision document: *"Forget every page we built. Organize the
entire product around human intention. What should disappear?"*

**The reduction:** *"Garvis has **two nouns, one constant, four postures, one subconscious, one
spine**"* — Missions (the only noun: *"grow mom's business · sell websites · build Stoke · a
rabbit hole (a mission whose objective is curiosity)"*); **the Line** (the conversation bar, *"the
ONLY element that never moves"* — *"Tony's constant is Jarvis's voice; ours is the Line"*);
postures Think · Create · Execute · Observe (*"VERBS, not places"*); the subconscious (the graph
behind everything); the spine (approvals + ledger, *"the one interruption Garvis is allowed"*).

**What disappears:** the sidebar (*"Entirely."*), every studio as a destination, feature names
from the user's vocabulary (*"The user says 'make the postcard better,' never 'open
gen-postcard'"*). What survives deliberately: *"first principles does not overrule safety"* —
approvals keep a real page; everything is clickable; evidence-counted claims only.

**Key concepts:** the two screens (the Field with mission orbs; the Mission in four costumes); the
four smoothness mechanics (one persistent anchor; *"state arrives pre-dressed"* — *"No screen
ever appears empty and then loads"*; *"zero decisions to start"*; *"one camera, no routes"*); and
the **Intention Router** — *"the one new engineering artifact"*: `utterance → {mission, posture,
area?, action?}`, described as *"`commander.ts` grown up."*

**The governing question for all future features:** *"not 'where does it go?' but 'which posture
does it dress, and does it earn its light?' If a capability can't be expressed as a posture of a
mission or a whisper of the spine, it doesn't get pixels."* Plus the **five-minute inevitability
test** ("Nothing to learn... Nothing to find... Nothing to manage... Nothing to fear... Something
to love").

**Planned-not-implemented flags:** the Field/mission-morph single-scene SPA, the posture dial, the
Intention Router (P1–P3) — os-blueprint.md (Jul 23) reports the posture classifier is *"0% built
today"* and the Line is still page-local. This document is the purest statement of intent that the
codebase never fully caught up to.

### garvis-universe-model.md — "A Universe You Talk To" (the converged product model)
**What it is:** The synthesis of first-principles + an external GPT critique + *"the owner's
spatial instinct: 'the whole thing is like a universe and it has different solar systems.'"*
Uniquely, this doc accumulates six rounds of refinements and then logs the actual shipping of
P1/P2/P3 — it is both vision and build journal.

**The three layers (adopted from GPT):** INTENT (visible — *"never classified, never named"*),
COGNITION (invisible), EXPRESSION (as needed). *"The Work Web is **the x-ray, not the main UI**."*

**The universe model:** one camera, three altitudes — UNIVERSE (all worlds as solar systems,
*"Position is MEANING"*), SYSTEM (star = objective; planets = production areas; moons =
artifacts; comets = next moves; *"a faint nebula ring at the edge is capability that COULD
condense here"*), STUDIO. **Gravity:** *"Everything enters as a **spark**... Threads that acquire
stakes **crystallize into missions** (a star ignites)... nobody files paperwork."*

**The physics = honesty rules table** — every visual property maps to a real signal (position =
embedding similarity; filaments = insights; brightness = event recency; comets = ranked moves;
nebula ring = capability registry). **Capabilities as nebulae** is the discoverability answer
without a sidebar: *"capability unlocks are announced, not browsed... the graph is the
documentation."*

**The waking moment — the emotional keystone:** *"Opening the product should feel like a companion
that was already working — 'While you were away…' — not a blank prompt."* The sample copy ("Good
morning, Riley. While you were away — Bob Pier replied 'interested.' I staged a follow-up
draft...") is the single most intent-revealing passage in the corpus. *"This is the single
highest-leverage emotional feature in the product, and it's a *rendering* of machinery that
already exists."*

**The No-Theater Rules (the design constitution):**
1. *"Nothing animates unless a row changed. Motion IS news."*
2. *"Nothing blocks on beauty."*
3. *"Every pixel is a query. If the table behind a visual can't be named, it doesn't ship."*
4. *"Potential drifts; commitments stay put (spatial memory is sacred)."*
5. *"Every transition reduces FRICTION, not adds delight."*
6. **The Morning Test:** *"No feature is complete until it improves the next morning... Garvis
   starts every morning with a better understanding of yesterday."*

**The product equation, pinned:** *"Knowledge + Memory + Execution + Anticipation = **Momentum** →
compounding intelligence. Every AI starts every morning at zero; Garvis starts at yesterday."*
And the optimization target: *"Garvis optimizes intellectual momentum."*

**Notable honesty ruling inside the design process itself:** the "opened it three times" waking
line was *"REJECTED: we don't persist open events yet — saying it would be invented
intelligence."* Vision rounds were then closed by fiat: *"the philosophy has converged. Further
vision rounds risk decoration."*

**Shipped within this doc:** Sprint M (world_intelligence, Living State with `{text, evidence}`
pairs, momentum as *"a DERIVED label... never an opinion"*, the Reflection engine whose parser
*"DELETES items without evidence"*), P1 waking moment, P2 System altitude, P3 Universe altitude
(+ time scrubber where *"scrubbing into the past DIMS momentum light, because momentum history
isn't persisted and the sky refuses to pretend otherwise"*), and the syncUniverse charter guard.

### garvis-universe-visual-design.md — P4: the Inhabited Sky (3D spec)
**What it is:** The spec for turning the honest SVG diagrams into *"one continuous 3D scene you
fly through"* (three.js/R3F), with the promise: *"Every No-Theater invariant survives: the scene
compilers stay untouched... only the RENDERER gains a dimension."*

**Key content:** one-camera model (Universe/System/Planet = camera distances; *"the transition IS
the information"*), the material-language table mapping every render element to unchanged truth
signals, the motion policy (*"bodies do NOT revolve idly"*), post-processing discipline (*"No lens
flares (pure decoration on a claim-bearing surface)"*), and the studio landing (camera holds
orbit; a docked panel slides in — *"the sheet becomes the cockpit window you dock against"*).
Acceptance: *"entering the Universe should feel like opening a window, not a dashboard — and every
glow you see must still survive the question 'which row is that?'"*

### garvis-universe-design-scan.md — "is this the best we can actually do?"
**What it is:** A brutally specific art-direction audit of the 3D scene against astronomy
reference photography and *"the JARVIS golden holographic data-core."* Verdict: *"the current
scene is ~5.5/10 against those references; the browser ceiling with this exact stack is ~8.5/10."*
It itemizes seven visual failures (no dark dust lanes because *"an additive-only particle system
can never produce darkness"*; stars without a power-law; planets as flat discs needing terminator
+ fresnel; undisciplined bloom; the holo ring as fuzz; plain labels) and records what shipped in
the pass. The invariant check closes it: *"every change above is presentation... the sky gets
photographic, the truth stays the truth."*

### mockups/garvis-ui-concept.html — the three-screen concept
**What it envisions (working HTML demo):** *"3 screens · 4 surfaces + 1 anchor · max 3 things ask
for attention."* Screen 1 **Command**: "What are we working on today, Riley?" over a command line,
six quick cards (missions + Work/Brain/Build/Approvals), and the Next Moves rail (exactly three:
an approval waiting, "Bob Pier replied 'interested'... Strike while it's warm," and a blocking
dependency "Mailing Lists is empty and blocks Print & Send"). Screen 2 **Mission**: objective
headline ("Grow Mom's Business", target chip "20 new listings by spring"), strategy cards with
**evidence-counted claims** ("run 3× · 412 mailed · 11 calls · 2 listings" vs *"untested — new
territory, no track record yet"*), and the ghost-strip web preview. Screen 3 **Web + Studio**:
orbital SVG map ("MAP = OVERVIEW · LIST = NAVIGATION"), tree rail, the Creative studio with tool
row / versioned artifact with a v1→v2 diff / studio chat showing the **copywriter hat** chip
(*"Same Garvis, wearing its copywriter hat for this"* — reply: *"luxury reads statements, not
pitches. Saved as v2; v1 kept"*), and a right rail limited to approvals + results + next move.
The stated laws are rendered in the page itself: *"one focal point per screen · at most three
attention requests... Typing is an accelerator, never the only path."*

### mockups/garvis-inevitable.html — the Field → Mission transition, live
**What it envisions:** The first-principles/universe vision as an interactive dark scene. A
drifting canvas constellation (**the subconscious**) behind everything; **the Line** docked
bottom-center with a pulsing ember cursor and the caption *"the conversation is the one constant —
the world re-dresses around it"*; an approvals **whisper** pill top-right ("◆ 2 waiting for you —
Nothing leaves without you"); mission **orbs** sized/colored by state ("Grow Mom's Business" big
ember with "**a reply came in** · postcard v2 ready"; "Website Outreach" calm green; violet
curiosity orbs "Stoke" and "why hexagons? — last night's rabbit hole"; a dashed ghost "new world —
or just say it"); the **waking moment** panel whose lines animate in one-by-one ("Good morning,
Riley. While you were away —"). Clicking an orb triggers a warp-bloom camera move into the
Mission: posture dial (Think/Create/Execute/Observe), a real orbiting planet map with a comet
("The next move, arriving"), the stat row (412 mailed · 63 visits · 11 valuations · 2 listings),
the **nebula strip** ("could grow here — unformed until you begin" — Market video · timely,
Automations, MLS import, Deeper analytics — click to condense), and per-posture costumes
(Create = studio with diff; Think = evidence-sourced facts including a filament note *"this
connects to your seller-psychology notes and last night's hexagon rabbit hole — efficient
structures win under scarcity. Garvis noticed"*; Execute = queue with Approve buttons). Honors
`prefers-reduced-motion` and a time-aware greeting. This file is the fullest single rendering of
the product's intended feel.

---

## D. Capability-sprint documents (built increments, in build order)

### garvis-genesis-blueprint.md — the Genesis engine (the biggest sprint doc)
**What it is:** Audit + implementation plan + shipped-log for the question *"that decides whether
Garvis is an operating system or a demo collection: can it take 'let's build a full business
system for my artist brother,' plus uploaded photos, and generate the world, work web, website,
lead finder, outreach, and content system for THAT business — without anyone hand-coding a
template?"*

**Executive verdict:** it failed the artist-brother test at four specific steps, *"but the honest
surprise of the audit: the distance is far shorter than the question implies... the platform was
accidentally built FOR genesis... **Genesis is not a new subsystem — it is a new SOURCE for
structures the system already runs.**"*

**The governing principle:** *"genesis generates DATA that existing validators accept — never new
vocabulary. The AI may compose worlds only from the 7 archetypes, 10 flavors, and 14 TOOL_IDS
that code already executes. That single constraint is what prevents chaos."* And the philosophy of
consent: *"genesis PROPOSES, the user CHARTERS (same philosophy as approvals: plans free,
commitments human)."*

**Named villains it killed:** the hardcoded two-template wall; plays-as-TypeScript-functions; the
`DEFAULT_LAKE_GENEVA_CONTEXT` fallback causing *"cross-web contamination"* (an art world getting
Lake Geneva real-estate copy) — replaced with *"an honest 'set the business context first' error,
never another world's copy"*; images rejected at intake; three disconnected asset systems; the
approval bypass on deploys.

**Shipped sprints logged in the doc:** G1 Genesis core (with the owner's reframe — *"teach Garvis
how to design businesses, not replace two hardcoded templates"* — adding **World DNA** before
structure and *"every structure explains itself"*: per-area rationale + stated omissions,
*"'(no reason given)' is rendered, never hidden"*); G2 Photos (the `completeVision` seam; vision
captions with an *"HONEST quality note (hero-grade / usable / weak — and why)"*; the hard rule
*"describe only what is visible — never invent an artist, title, or price"*; batch
propose-sort-approve); G3 the website bridge (compileWebsiteBrief: *"use ONLY these images; no
stock, no placeholders"*; the lead-form contract *"stores inquiries, never sends"*); G4 v1 Market
Intelligence (*"the research plan derives DETERMINISTICALLY from the World DNA... Fit is an
evidence-labeled verdict, never a score"*); the **expertise packs** (*"worlds are born full"* of
labeled frameworks — *"The frameworks are expert structure; the DATA still comes from scans,
uploads, and results rows"*); and **vertical intelligence** (deterministic keyword-mapping to 14
verticals with researched domain packs — Fair Housing, SEC Marketing Rule, HIPAA, FTC — *"each
with domain KPIs... compliance content names the rule, not a vibe"*).

**The adopted operating-loop reframe (owner's post-G3 review):** *"an OPERATING SYSTEM never ends
at build. The loop is UNDERSTAND → BUILD → OPERATE → OBSERVE → LEARN → IMPROVE → REBUILD →
UNDERSTAND. A world should behave like a company: wake, learn, adapt, recommend."* With the
standing constraint: *"The operating loop is only as honest as its instruments... no adaptive
recommendation ships ahead of the rows it stands on."*

**Final invariant:** *"Intent → World → Work Web → Studios → Assets → App/Marketing/Outreach →
Approval → Execution → Learning, with no step that only works for templates we hand-imagined.
That is the operating system."*

**Planned-not-implemented flags:** image-pixel (CLIP) embeddings, derivative/thumbnail service,
PDF text extraction, the private bucket for non-image cluster files, G6/G7 as originally scoped —
each *deferred and stated as such* in the doc itself.

### garvis-bones-audit.md — "do we have a skeleton or a surface?"
**What it is:** A five-scenario adversarial code trace. Verdict: *"**The skeleton is real. The
circulation was not.**... knowledge was being written into tables that nothing downstream read,
and the new seed packs were polluting the honest signals."*

**The worst finding, a No-Theater violation:** *"Seeded playbooks made newborn worlds LIE"* —
seeds indistinguishable from earned work made a 10-minute-old world render active/glowing with
13 polluted signals. Fixed: seeds carry `source:'garvis-seed'` and are excluded from every derived
signal — *"A newborn world is dormant, quiet, and small again — full of knowledge, empty of
claims."* Closing invariant: *"knowledge a world is BORN with is context, never activity. Only
things that happened may light the sky."*

**Other fixes:** studio chat gained the BUSINESS block + KNOWN UNKNOWNS (*"don't guess these"*);
genesis questions now survive approval into `open_questions`; prospect→audience with the operator
supplying the email (*"the input field IS the honesty"*); the closed {{token}} set.

**Named remaining gaps (priority order):** retrieval unbuilt (*"`match_embeddings` has ONE
caller"*); knowledge not flowing into builds; learning manual (no cron reflection); direct mail
dead-ending after content; websites one-way (no site events); and #6 — *"the archetype vocabulary
is a demand-gen funnel"*: operations businesses *"get a forced marketing skeleton... Honest fix is
a vocabulary extension... which is a design decision, not a patch."* (This last gap is never
recorded as closed anywhere in the corpus.)

### garvis-glory-sprint.md — "from functional to actually useful"
**What it is:** Sprint log for the owner's blunt questions: *"Do the studios actually produce? Can
we make a direct mailer that looks good and send it out? Do we get a real scan for emails we can
use?"* — *"The honest answer before this sprint was 'the copy, yes; the finished product and the
plumbing around it, no.'"*

**What shipped:** real email discovery from prospects' own sites (*"Garvis never guesses or
constructs an address"*; a miss is honest state: *"'we looked, nothing public'... distinct from
'never looked'"*); the print-ready 6×9 postcard with USPS geometry, real vault photos (*"never
stock"*), visible `[EDIT]` holes, QR from the tracking link, and the mail log (*"Garvis doesn't
mail for you — you print or send to a vendor, then log what went out"*); **Ask Garvis** hybrid
retrieval (artifacts embed on write; answers *"grounded only in the retrieved sources; nothing
found → it says so plainly"*); auto-reflection when genuinely due; the **producers layer**
(research does actual web search with a *"checkable SOURCES footer of real URLs — and a 'STILL
UNKNOWN' section... never an invented statistic"*; gen-social ties captions to real vault photos);
and **G5 instrumentation** — the `site-events` ingest with write-only channel tokens, leads as
first-class rows firing the top waking move (*"they asked, answer while it's warm"*), postcard QR
`?src=postcard` attribution, and the Results-by-channel table — *"every number a count of rows,
nothing modeled."*

**The end-to-end claim:** *"No step dead-ends at content."* Invariant: *"real materials only...
real findings only... every external action still behind approvals, every visible number still
derived from a real row."*

### garvis-master-audit.md — all-in-one readiness (route-by-route)
**What it is:** An audit driving the built app *"route-by-route in a real headless browser"* plus
four code-path audits. Verdict: *"The spine is real and honest end-to-end; the operator surface on
top of it is where the gaps are."*

**Notable fixes logged:** "**Approvals toast lied**" (it said "Approved and executed" for kinds
with no executor — changed to *"Approved — recorded for you to run where the capability lives"*);
lead/reply webhook notifications (*"the business reaches the owner instead of waiting to be
discovered"*); invisible credits surfaced; and **brain unification** — Command gained
list_worlds/ask_worlds/draft_world (*"act-gated — proposes a world for approval, never creates one
silently... One brain, two domains"*).

**Shipped Tier 1 (daily-driver):** Ops inbox + composer through the same send spine; Contacts CRM
with timeline; Reminders (*"the user's words outrank Garvis's inference"* — reminder_due base
value 110); the Health board probing every function.

**Planned tiers flagged:** Tier 2 (PDF ingest, deploy executor, video render) and Tier 3 (data
export/account deletion — *"compliance-relevant"*, mobile 3D fallback, scheduler cron, ad write)
— several of which later docs close (deploy executor, video) and several never (data export,
account deletion, ad campaign write).

### garvis-deploy-executor.md — approved deploys actually ship
**What it is:** Sprint note closing *"the last gap between 'Garvis proposes' and 'Garvis does it
end to end' for the build pillar."* Architecture: *"capture at authorization, execute on
approval"* — the built `dist/` is captured into `deploy_bundles` when it exists (builds are
browser-bound), and approving executes it. The workspace Publish routes *"through the spine: your
click *is* the approval."* The bundle-less case is handled honestly: *"No fake deploy, ever"* — a
`skipped` ledger row with an actionable reason. `deploy_backend`/`publish_post` are named as still
needing the same treatment.

### garvis-wave-a-goals.md — the trust floor + the Goals Spine
**What it is:** Two shipped layers: Wave A security/integrity (the `preview_sites` cross-tenant
lockdown — *"anyone holding the public anon key could dump every tenant's prospect pipeline"*;
approval-required deploys server-side; SSRF hardening with DNS-rebinding defense; select-first
contact writes so *"Suppression stays sacred"*) and the **Goals Spine**: `world_goals` — *"a goal
is the owner's own statement of what a world is trying to achieve"* — with honest progress
(*"a meter renders ONLY with a real numerator AND denominator... otherwise 'not instrumented
yet'"*) steering Next Move (+15/+10 deterministic boosts that *"NAME the goal in its why"*),
producers, Ask, and the Commander.

**Honesty section header worth quoting:** *"Honestly not done yet (documented, not hidden):
apply-migration, github-export, and provision-supabase still execute on direct ownership checks
without an approval row."*

### garvis-heartbeat.md — "Garvis works while you sleep"
**What it is:** The sprint that gave Garvis a pulse, answering the owner's demand: *"I need this
system to be working for me at all times."* The audit's blunt prior finding: *"nothing ran
unattended — the worker tick was a commented-out SQL block."*

**What shipped:** one-call arming (`garvis_arm_heartbeat`) storing URL+secret in Vault and
scheduling pg_cron jobs (initially three: hourly pulse / daily follow-up drafts / 5-minute worker
tick); the **morning brief** pushed 7–9am in the owner's timezone; and the email front door
(the outreach settings card whose master switch *"can't be flipped on without a from-address AND a
real mailing address"*).

**The pulse honesty rules:** *"a quiet night sends NOTHING (no 'all good!' noise); every number is
a count of real owner-scoped rows...; and the pulse never acts outward — it tells you what's
waiting, the approval queue still gates everything."* The overnight loop summary: *"Offloaded, but
never out of your control."*

### garvis-speed-to-lead.md — the instant first touch (the first standing rule)
**What it is:** The doc establishing **tiered autonomy** architecture via its first instance.
Research framing: *"answering a lead within 5 minutes makes contact ~100x more likely... and only
~7% of businesses manage it, because humans sleep. This is the one lever where 'works while you
sleep' is directly, measurably revenue... without ever becoming a spam cannon."*

**The design:** at 3am a form lead triggers the owner's own acknowledgment template — *"No AI
writes anything at 3am"* — through THE ONE SEND PATH with every gate re-verified; `first_touch_at`
is *"a real timestamp — 'answered instantly' is never a guess"*; active threads are never barged
into; *"the ack buys you the morning, it doesn't impersonate a conversation."*

**The architecture this establishes:** *"autonomy that survives is *pre-authorized narrow action
classes behind the same guardrails*, expanded one class at a time."* The authority is *"a normal
approvals row — `requested_by 'garvis-auto'`, `decided_via 'standing_rule'`... No side channel."*
The kill switch kills it. Future classes *"follow this same shape."*

### garvis-watchdog.md — the ad watchdog + reactivation sweep
**What it is:** Two heartbeat organs. The 2am **ads watchdog** judges yesterday vs a 7-day
baseline with verified thresholds (spend spike ≥2.5×; spend stopped; CTR collapse; CPC spike),
*"MIN-SAMPLE GATED throughout: fewer than 4 baseline days → no verdict, ever"*, a missing report
*"is late data, never treated as zero"*, findings pushed *"with their arithmetic"*, and
*"Detection only... 'Nothing was changed — review in Ads Manager.'"* The monthly **reactivation
sweep** stages check-ins for 60–365-day-quiet real conversations as pending approvals with *"no
AI invention, no fake-familiarity theater, and an explicit easy-out line."*

### garvis-video-pillar.md — from scripts to real videos
**What it is:** The sprint closing "the audit's one genuinely-absent pillar." A storyboard
compiler builds a timed Ken-Burns video from the business's **own photos** (browser preview with
zero setup; Shotstack mp4 render when a key exists, honest degrade otherwise). The honesty
boundary is argued explicitly: *"It never generates or hallucinates footage of things that don't
exist. Where a beat has no matching photo, the storyboard shows a **shoot direction** ('shoot:
hands working the clay') — a task for the operator, not a fabricated frame."* Roadmap noted: TTS
voiceover and AI-image beats *"behind approval"* — later specced in garvis-level-10.md.

### garvis-advertising-plan.md — every channel, honestly instrumented
**What it is:** The paid-acquisition plan + shipped-state doc. Its operating rule inherits the
spine: *"Garvis produces launch-ready campaigns and MEASURES results through its own
instrumentation... Platform-reported metrics flatter themselves; the form on YOUR site is the
truth."*

**Shipped:** the `ads` studio flavor; `gen-ads` producing assets at real platform limits
(*"limits are ENFORCED by the parser"*; compliance packs for Housing/SEC/health *"ride in the
artifact"*); end-to-end `?src`/UTM attribution; spend logging (*"cost-per-lead = logged spend ÷
measured leads, two real numbers"*); the read-only ads-sync connections layer; and the adaptive
engine with honest confidence tiers (*"`act` (≥3 real responses), `watch`, `too-early`...
'running blind — instrument first' for dark channels"*).

**The channel catalog rule:** *"master ONE paid channel to a measured CPL before adding the
next."* The boundary held: *"LEADS remain Garvis's own measured form submissions."*

**Planned-not-implemented flags (explicitly gated on the owner):** Meta Marketing API and Google
Ads API registrations (*"real credentials only the account owner can obtain"*); campaign
creation/budget changes as approval-gated actions *"THEN adaptive recommendations can propose
'shift $X from Meta to Google' as an approval card that executes."* Ad *placement* remains
deliberately absent through the final scans.

---

## E. The audit/strategy line (mid-July re-reckonings)

### garvis-level-10.md — the Level-10 Blueprint (149KB; the largest planning artifact)
**What it is:** *"Compiled 2026-07-16 from seven code-grounded research specs"* — a
quality-obsessed plan to take each content pillar to a 10/10 professional bar, organized into six
build waves with a deduplicated quick-wins checklist (all items unchecked — this is a plan, not a
log) and the seven verbatim research specs, each with file:line-cited gaps, an ordered build spec,
effort sizing, and honest research notes (external facts labeled *"verified-by-web"* vs
*"from-knowledge"*).

**The bar:** *"Level-10 means two things and only two things: **output a working professional
would post without edits**... and **automation that holds that bar on its own**, because every
generated piece carries the board-copy editor's score... and nothing automated ships below **score
≥ 8**. Features exist to serve those two outcomes; anything else is decoration."*

**The scores-today table (a rare self-grading):** copywriting 5, ideation 5, social 4, email 4,
direct mail 4, automations 4, inbox+CRM 3, images 3, video 2 — with per-wave targets. And the
honesty coda: *"9s and 10s come only from lived use... The waves buy the ceiling; usage buys the
last two points."*

**The seven specs, compressed:**
1. **Server-rendered designed images** — satori + resvg-wasm on the edge; brand cards/postcard
   PNGs at print DPI; the parity rule (preview CSS ported into a verified pure core so
   *"preview === render"*); the honesty ruling that a deterministic brand graphic is *"the user's
   own design"* and must NOT carry an AI disclosure; `[EDIT:]` holes *"must print visibly, never
   be dropped."*
2. **The content producer + graduated autonomy** — the fullest autonomy design in the corpus: a
   `content_week` standing order stages *"ONE approval card: 'Content week of Jul 20 — 4 posts +
   1 email, judge scores 8–10'"*; drafts judged **fail-CLOSED** with sub-8 discards kept for
   audit; after *"3 consecutive weeks approved without edits, Garvis offers auto-mode"*; a
   rejection *"revokes autonomy — safe regression"*; and tamper-evidence: *"'the machine said
   this was a 9 when I approved it' is provable from the record"* (judge scores hash-bound into
   the approval payload).
3. **Social vs Buffer/Later** — calendar + queue slots, analytics sync-back (`social-sync`),
   carousels, best-time *"only when the sample supports them"* (*"below sample → an honest 'not
   enough history yet', never an invented hint"*), scheduled-post reconciliation where *"only
   provider-confirmed facts flip status — never a clock-based guess."*
4. **Email vs Mailchimp/Klaviyo** — `outreach_events` persistence (the doc corrects its own
   premise: the table *"does not exist yet"*), behavioral segments (with the encoded honesty rule
   that `never_opened` *"requires sentCount ≥ minSends... so an un-emailed contact is never
   claimed as 'ignoring you'"*), composable drip flows drained by the clock *"with every send
   re-checking every gate,"* per-batch honest rates (*"'no opens recorded — open tracking may be
   off for your domain', never a fake 0%"*), branded HTML shell (plain default), and subject A/B
   with a small-list guard (*"an A/B over 8 people is theater"*). Deliberately does NOT use
   Resend's scheduled sends because *"a Resend-scheduled email would freeze the gates at queue
   time, violating the fail-closed rule."*
5. **Lob direct-mail fulfillment + CRM vs Follow Up Boss** — the "Riley's mom" scenario: CASS
   verification fail-closed *"exactly like email suppression"*; cost shown BEFORE approval with
   the approved estimate as *"a hard ceiling the executor enforces"*; per-household QR tokens;
   Lob webhooks with monotonic status ranks; returned mail becoming *"evidence-based fail-closed
   learning... NOT do_not_mail, which stays a human opt-out list."* CRM side: pipeline board,
   per-contact next actions, Zillow/Realtor portal-lead parsing (*"a low-confidence parse stays
   plain mail, never an invented contact"*) feeding the same instant first touch, and Twilio SMS
   behind the spine with express consent + quiet hours + STOP *"sacred, mirrors suppression."*
   Gmail OAuth is **deferred with reasons** (restricted scopes, CASA assessment) in favor of an
   honest forward-in workaround.
6. **Video + images** — TTS voiceover per scene, SRT captions into the render, CC0 music beds
   (*"only CC0, so no attribution obligation can be silently violated"*), durable mp4s (fixing
   24-hour Shotstack URL rot), the **server-side AI-disclosure hard gate** (fail-closed at
   social-publish, with a DB trigger making provenance *"only accrete"*), and a two-headed
   AI-b-roll seam (Sora 2 + Veo 3.1) whose prompts *"regex-refuse"* real-property depictions.
7. **Quality system + voice memory** — one `QUALITY_BAR = 8` constant (*"the bar is a magic
   number with no automation behind it"* today); `copy_quality_events` persistence; voice
   exemplars embedding-retrieved from *"ALL approved/sent/starred work"* with a weekly-refreshed
   learned style card; best-of-3 for high-stakes pieces judged *"POINTWISE and independently
   (never pairwise... where position bias bites)"* — citing 2025-26 LLM-as-judge bias
   literature; and scorecard lines so *"the owner can watch the system's taste with the same
   honesty as leads and revenue."*

**Planned-not-implemented flags:** this entire document is a forward plan. The full-system scan
three days later shows content_week landed (then regressed via a migration collision, B1) and
social-sync landed (then fell off the heartbeat, B2); most of Waves 3–6 (calendar/slots, flows,
A/B, Lob, Twilio-as-specced-here, TTS/captions/music, best-of-3, voice profiles) have no
confirmation anywhere in the later audits and stand as the largest block of specced-but-unbuilt
work in the corpus.

### best-software-plan.md — "The Operating Brain — Audit & Plan"
**What it is:** A full-codebase audit (July 2026) *re-read through a corrected lens*: *"**this is a
personal operating system for one operator**... It is not a SaaS competing for strangers. The bar
is not 'would a stranger pay?' — it is **'does this multiply me, and does it keep running when I'm
not looking?'**"*

**Its headline finding:** *"The machine is far more real than its own docs claim."* And its
re-prioritized weaknesses: (1) *"Unattended reliability is the whole game, and it's the least
protected... You vibe-code your own brain — and nothing gates a regression... there's no second
operator to notice"*; (2) *"Brain-critical intelligence requires an open browser tab... An
operating brain must think **while you sleep** — anything that dies when the tab closes isn't a
brain, it's a dashboard"*; (3) tab-bound generation orchestration; (4) *"'Verified' silently
degrades"* (honest verification badges demanded: *"You need to know which promise you're
holding"*); (5) the rotting edge-generation fork; (6) operator UX debt (three memory rooms, three
money rooms).

**What dissolves under the lens:** stranger onboarding, social login, pricing-page coherence,
teams — the SaaS surface deprioritized wholesale.

**The plan:** P0 *"CI as your second operator"* (*"You are protecting *future you* from
*tonight's you*"*) + server-side intelligence + durable generation + honest badges + kill the
fork; P1 sharpen the agent (edit_file scalpel, `see_preview` vision — *"give the agent eyes and a
scalpel"*); P2 *"branches as the idea-exploration engine"* (*"let branches be how you think"*);
P3 close operator loops (one room per job; the ship→market seam; *"Truth in docs... Delete both
lies"*).

**North-star metrics:** idea → live URL time; first-forge success rate; **unattended hours**
(*"the metric that makes it a *brain*"*); merge integrity.

### where-we-stand.md — full-system capability audit
**What it is:** The July 2026 honest map from seven audit passes, with a per-pillar letter-grade
scorecard (App building A−, Email outreach A, Prospecting A−, Design B+, Research B, Social B−,
Lists/CRM C+, Video C/D, Marketing brain C, *"Gets better with time C+"*).

**The three system-level findings (the most quoted diagnosis in the corpus):**
1. *"**The brain is built, and it is switched off.**"* — the heartbeat arm call *"is defined in
   migrations and **never called anywhere**"*; ~10–12 required secrets undocumented; *"the line
   between 'real' and 'aspirational' in this entire system is drawn almost exactly by which
   secrets exist and whether one SQL line was run — and that line is invisible."*
2. *"**The signature disease: built-but-not-connected**"* — eight instances listed (marketing
   assets publishing via `mailto:`; draft verdicts displayed but never fed back; engagement
   captured but the named trigger never fired; reel schema with no engine...). *"Each connection
   is mostly glue code. Collectively they are the difference between a set of impressive parts
   and a compounding system."*
3. *"**Three brains that don't share one memory**"* — Commander/agent-runs/builder each assemble
   different context; *"the builder gets neither."*

**The path:** Phase 0 *"Turn it on and make 'on' visible"*; Phase 1 protect the foundation;
Phase 2 close the instrumented loops (*"highest learning-per-line-of-code"*); Phase 3 connect the
amputated limbs; Phase 4 sharpen the agent. Bottom line: *"All three are wiring problems, not
invention problems — which is the best possible place to be."*

### orchestrator.md — Garvis's agency layer
**What it is:** The doc for the organ *"that turns ANY spoken intent into populated reality"* —
before it, one classifier *"could reach ~10% of the machinery."*

**Architecture:** pure core + **parse gauntlet** (*"the trust boundary between the model's
proposal and real execution"*: unknown actions dropped *"never improvised"*, missing params
*"demoted to questions (never invented)"*, honesty structural via first-class `holes` and
`questions` plan fields); the **action registry** rule — *"if a human can click it, the brain can
propose it — and nothing else"* — with actions returning *"outcome language... never promises"*;
and **two-tier consent**: *"plan approval is *structural* consent; outbound machinery still
creates its own approvals downstream. The Orchestrator can never bypass the spine."*

**The growth thesis:** *"growing it IS growing Garvis"* — every future engine lands as registry
actions, *"immediately reachable from one spoken sentence."* v1 honesty: plans in-memory (no
plans table yet), 9 actions, Commander integration not yet wired. *"A hole shown amber today is a
registry entry tomorrow — that is the design."*

### holy-grail.md — the ten structural gaps
**What it is:** The philosophical centerpiece of the audit line: *"What Garvis Is, and What
Separates It From 'Creator of Everything and Understanding'"* — written after the 16-commit July
rebuild, *"not a feature list, but the gaps in KIND between a very good system and the grail."*

**The scan (what it can do):** CREATE / UNDERSTAND / ACQUIRE / OPERATE summaries, each grounded
(14 orchestrator actions, 10 cron jobs, 55 edge functions, 90 verify suites).

**The ten gaps, ranked by "how much grail each unlocks":**
1. **Reachability** — *"the brain can touch 14 of its own ~hundreds of capabilities. The catalog
   is the bottleneck of agency."*
2. **Temporal agency** — *"it compiles plans, it doesn't run projects... A chief of staff runs
   ARCS"* — *"the highest-leverage single build remaining."*
3. **Situation, not retrieval** — *"Memory recalls similar text; it does not hold 'the state of
   things'... the orchestrator plans from current reality, not just from the sentence."*
4. **Creation stops at the artifact boundary** — *"The strong form of 'creator of everything':
   creation that EXTENDS THE CREATOR... Garvis growing new organs on demand."*
5. **Meta-learning** — *"the loops improve the operator's judgment, not the engines... the next
   octave proposes revisions to the MACHINE."*
6. **Earned autonomy** — *"trust is binary... The grail is a dial."*
7. **Senses** — *"it perceives a sliver."*
8. **Identity** — *"'Two companies, cleanly' remains ~70% true."*
9. **Self-proof** — *"it verifies logic, not liveness... Grail systems demonstrate their own
   health."*
10. **One voice** — three context assemblers remain.

**The one-sentence summary:** *"the grail is a system that runs arcs instead of plans, plans from
situation instead of sentences, extends itself when it creates, earns autonomy instead of asking
forever, and proves itself alive every night."*

### full-system-scan.md — July 19 six-subsystem audit + the July 20 fix-campaign addendum
**What it is:** The most rigorous audit: six parallel deep audits classifying every capability
(*"done-verified / done-unverified / partial / stub / missing"*) with wiring checked, an
18-item defect ledger (B1–B18), a structural roadmap, and a risk register — then a July 20
addendum recording that *"the fix campaign landed. Every defect in §3's ledger is closed."*

**Executive verdict:** *"The system's **safety architecture is genuinely production-grade** —
arguably better engineered than most commercial products"* (97/97 tables RLS'd; one hash-checked
send path re-running every gate at send time; fail-closed fuzz-tested parse gauntlets; *"the
honesty contract... enforced at the exits, not just in prompts"*). The creation machinery is
*"real, not stubbed."* The gaps: ~20 regressions (two feature-killing migration collisions),
*"the delivery pipeline is the existential risk"* (*"The system that verifies everything doesn't
verify itself end-to-end"* — 40 of 94 verify suites orphaned, no deno check on 56 functions), and
the still-open holy-grail layer.

**Most instructive defects for a reconstructor:** B1/B2 (a later migration silently recreating a
check constraint dropped `content_week`; the 11th cron job dropped by an arm redefinition —
*"Master Switch shows ARMED with the job missing — invisible loss"*); B8 six world-isolation read
leaks (*"Client A's data visible in client B's studio"*); B10 cross-user credit grants; B15
*"Zero fetch timeouts in all 56 edge functions."*

**The addendum's still-open list (the honest frontier as of Jul 20):** *"full server-side executor
porting, catalog expansion, Custom Rooms, generalized earned autonomy, engine self-tuning, senses,
nightly canary, DocuSign back half."* (Subsequent commits on Jul 20 — visible in git history —
then closed several: arc wake loop, situation model, nightly canary, earned autonomy generalized,
senses, catalog to 20 actions.)

### os-blueprint.md — "One System for Everything You Run" (the final reconciliation)
**What it is:** The last and most self-aware planning document (Jul 23): *"the reconciliation
doc... Its job is to make the other 30 docs **executable**"* by answering *"how the many
capabilities you already built become **one operating system for your life's ideas** instead of a
pile of apps sharing a sidebar."*

**The one-sentence thesis:** *"You already built the organs of an operating system — a situation
model, an approval spine, a memory substrate, a clock, a charter/workshop engine — and then wired
them as inputs to LLM prompts and buried them behind a 25-item sidebar. The work ahead is not to
build more. It is to assemble what exists into one body — one home, one Line, one memory, one
clock, one spine — and to make every future venture a row of data, not a new page."*

**The honest diagnosis of "why it feels empty":** not broken parts (26 of 43 screens close real
loops) but (1) genuine dead-ends in the most-touched places (the Canvas social panel
*"architecturally incapable of publishing"* while *"a real publish loop exists one room over...
with no bridge"*); (2) *"**The whole machine ships switched OFF**... Out of the box, ~85–95% of
the value-delivering surface does nothing. The clock never ticks"*; (3) *"**You built seven apps
in one, with no center**... The code tells eight competing stories... there is no OS."*

**The invariant loop as a contract:** *"You speak → it drafts or does the work → one approval →
it really happens → the result feeds the whole system's memory, so the next thing is smarter."*
— *"Three of those five links are already excellent... Two are weak: the *home you speak from*
isn't unified, and the *memory that compounds* doesn't. That's the whole gap."*

**The noun, resolved:** `knowledge_worlds` is the unit — *"Worlds are the things you run — the
orbs"*; the legacy `apps` table must be reconciled onto worlds; the app builder is *"a tool a
world can invoke, not a competing noun."*

**The seven organs table:** Spine (*"keep as-is... the crown jewel"* — with three named bugs
including the `send_sms` enum never added to `approval_kind`), Noun, Home (*"the highest-morale
finding: `situation.ts` already assembles what a home screen needs... serialized to a **string
for an LLM prompt**. The home-that-shows-everything is roughly **one component away**"*), Line,
Memory (three assemblers; embeddings covering 2 of 6 types; **the five compounding seams** —
*"why the system 'remembers more but doesn't get better'"*), Clock (*"fails only on posture"*),
and **Vertical-as-Data** — *"the load-bearing reframe"*: *"adding a vertical is a data operation,
not a code operation. Otherwise every new idea becomes another bespoke, orphaned room — and the
empty feeling compounds forever."* The `VerticalSpec` row: *"introducing a new venture kind is
inserting a row — and it instantly inherits the home, the Line, the memory, the spine, and the
clock. That is the whole game."*

**Build order:** Phase 0 turn it on (CI self-arm on by default, self-heal, stale-clock phone
push, loud secrets, the enum fix); Phase 1 the Field + global Line; Phase 2 one memory that
compounds; Phase 3 bridge the dead-ends & unify the noun (Intention Router v1); Phase 4
Vertical-as-Data; Phase 5 consolidate & subtract — *"Subtraction comes last, as a consequence of
the spine existing — never as an amputation up front."*

**Explicit non-goals:** *"Not cutting capabilities. Breadth is the point of an OS-for-life...
Not chasing the full cinematic mockup first... Substance before cinema."*

**Success metrics:** alive out of the box (binary); one home (binary); compounding seams closed
(*"Today: ~1"* of 5); unattended hours; *"verticals added as data (Today: 0)"*; clicks to a
closed loop.

**Status:** written the day before this reconstruction; its phases are a proposal (*"Approve the
order in §6 and we start at Phase 0"*) — the largest block of currently-unexecuted intent.

---

## F. Operator runbooks (the "turn it on" documents)

### RUNBOOK.md — "from zero to a ticking system"
Setup guide born from an audit finding (*"the end-to-end setup the readiness audit found
missing... ~1 hour with this page (it was 4–8 undocumented hours before)"*). Documents the
zero-click GitHub **Deploy Supabase** action; the three-paste DB path
(`_apply_garvis_all.sql`); the two function-deploy commands; the secrets table with per-feature
degradation promises (*"every one degrades with a named message in the UI"*); the heartbeat arm
call (*"the step everything 'while you sleep' depends on"* — 11 jobs); the forward-in mailbox
(Tier 2 inbox without OAuth — *"Mail to an unknown alias is ignored, never misfiled"*); and,
notably, **"What works with NO AI key (the deterministic floor)"** — an explicit inventory of
the system's zero-AI capabilities, the runbook expression of the fail-soft doctrine.

### go-live-checklist.md — "everything you need set up to start selling"
The seven-tier commercial activation ladder (Jul 22): Tier 0 ship the code (with the warning that
migrations only apply on a `mode=full` deploy); Tier 1 the brain (12 cron jobs); Tier 2 client
acquisition (with the sharpest ops warning in the corpus: `APP_ORIGIN` unset means *"hunts build
demos but **no pitch is ever queued**... and you'll see 'nothing happened'"*); Tier 3 email; Tier
4 texting (A2P 10DLC); Tier 5 get paid (Stripe Payment Links); Tier 6 optional pillars. Framing:
*"The whole system is **opt-in and fails closed**... nothing goes out by accident along the
way"*; and *"Minimum to sell your first client today: Tier 0 + Tier 2 + Tier 3... and Tier 5."*
Also documents the **nightly canary** as shipped (*"stays silent — it self-tests the live wiring
every night and only messages you when something... actually breaks"*).

### twilio-setup.md — SMS + missed-call activation
A pure operator walkthrough (Jul 22) for the Twilio-backed automations, including A2P 10DLC brand/
campaign registration with honest sample copy, the voice-webhook wiring for missed-call text-back
(*"the inbound call is the consent"*), cost tables, and a compliance section titled *"already
enforced in code — don't defeat it"* (STOP/HELP honored; warm customers only; *"Don't send
marketing blasts on a customer-care campaign"*).

### client-billing-setup.md — "get paid in ~10 minutes"
The revenue runbook (Jul 15): two offers (**New Website** from $1,500 one-time; **Website +
Automation** from $500/mo) sold via Stripe Payment Links; webhook auto-publish so *"a paid sale
records itself **and the site goes live automatically**"* (the `💰 SOLD` notification); Go Live
one-click Netlify hosting; and fulfilment notes per offer. This document marks the vision's
commercial turn: Garvis as an **agency-in-a-box** selling websites + automations to local
businesses.

### automation-triggers-seed.sql — the trigger-engine test seed
A seed script (Jul 15) creating a test customer list and a `hygiene_recall` automation trigger
("6-month recall reminders", anchor `last_visit_at`, offset 180 days, window 21) so the operator
can *"watch the trigger engine fire end-to-end, WITHOUT the UI"* — customers land *"in your Queue
as approval-gated sends. Approve to send."* Notable details: `consent_basis
'warm_transactional'` on every seeded customer and a no-email customer included to demonstrate
honest skipping. Confirms the automations pillar (dentist-style recall reminders) as a real,
approval-gated engine with consent modeled from the first row.

---

# Part II — Synthesis

## 1. The chronology: how the vision evolved

Reconstructing order from migration numbers, cross-references, and git dates, the corpus tells a
seven-act story:

**Act 1 — The builder (pre-Garvis).** README (early form), phase6-backend-tier, legendary-roadmap,
cloud-panel/cloud-console, hybrid-db. The product is FableForge, the competitor is **Lovable**,
and the goals are backend generation, one-click hosting, and cloud-console parity. Garvis exists
only as background machinery (missions, workers).

**Act 2 — The founding (garvis-system-architecture).** The nine-repo audit reframes everything:
FableForge is not the product; it is *the platform* for **a personal AI operating system**. The
decisions here — one Supabase, one send path, one approval queue + ledger, hub-and-spoke,
harvest-don't-merge, the two-write memory invariant, the forge/ember identity — hold for the rest
of the project. Sprint 1 (brain + spine + outreach) and Phase 5 (Work Webs, the seven archetypes,
"studios are data") ship inside this doc's addenda.

**Act 3 — The studio buildout + the vision spiral.** garvis-studios-blueprint specifies the
cluster-studio shell and the Mom Real Estate system; in parallel the vision line runs
anticipation-design → first-principles → universe-model (+ visual-design and design-scan, + both
mockups): 19 destinations → 4 surfaces → 2 nouns → 3 altitudes. The honesty doctrine sharpens at
each step (evidence-counted claims → No-Theater Rules → the Morning Test) until universe-model
declares *"the philosophy has converged. Further vision rounds risk decoration"* and pivots to
shipping the waking moment / system / universe altitudes.

**Act 4 — Genesis and the operating loop.** garvis-genesis-blueprint turns templates into
generated **World DNA** worlds; the bones-audit catches the system lying to itself (seed
pollution) and restates the deepest invariant (*"only things that happened may light the sky"*);
glory-sprint makes the studios *produce* and lands instrumentation (G5); then a rapid cadence of
organ-sprints: master-audit (daily-driver Tier 1), deploy-executor, wave-a (security + goals),
heartbeat, speed-to-lead (the autonomy pattern), watchdog, video-pillar, advertising-plan. The
vocabulary shifts from "missions/campaigns" to "the machine that runs a business": clock,
pulse, standing rules, ledger.

**Act 5 — The commercial turn (Jul 15–16).** automation-triggers-seed and client-billing-setup
recast Garvis as an **agency-in-a-box**: sell websites ($1,500) and automations ($500/mo) to
local businesses; the demo→pitch→pay→auto-publish loop. garvis-level-10 then sets a
professional-quality bar per content pillar with the graduated-autonomy design (score ≥ 8,
3-clean-weeks auto-mode).

**Act 6 — The re-reckoning (Jul 18–20).** Four audits in three days (best-software-plan,
where-we-stand, holy-grail, full-system-scan) converge on the same three diagnoses from different
angles: **the brain is switched off** (arming/secrets invisible), **built-but-not-connected**
(capabilities never wired to the rails that would make them matter), and **the grail layer is
missing** (arcs, situation, self-extension, earned autonomy, senses, self-proof). orchestrator.md
adds the agency layer between intent and machinery. The fix campaign (Jul 20 addendum + commits)
closes the defect ledger and lands several grail items (arc wake loop, situation model, canary,
generalized earned autonomy, senses, catalog expansion).

**Act 7 — Go-live and the OS reckoning (Jul 21–23).** The runbooks (twilio-setup,
go-live-checklist) and a burst of selling-machine commits (Netlify Go Live, Stripe webhook →
auto-publish, prospect pipeline, booking, SMS automations) make the commercial loop real. Then
os-blueprint closes the corpus with the most honest self-assessment yet: the organs exist but
there is no body — *"one home, one Line, one memory, one clock, one spine"* — and proposes the
assembly program (Phase 0–5) that was still unexecuted when this reconstruction was written.

## 2. The recurring concepts (the corpus's stable vocabulary)

- **The approval spine / ONE queue + ONE ledger** — in every document from
  garvis-system-architecture onward. *"Nothing sends without your yes"*; approvals as *"the trust
  anchor"* that must remain *"a REAL PAGE"*; payload-hash tamper-evidence; the CAS claim; the
  os-blueprint's verdict: *"the crown jewel."*
- **The one send path** — exactly one Resend caller, all gates re-checked server-side at send
  time, fail-closed suppression; cloned for social (Ayrshare), sign (DocuSign), SMS (Twilio),
  and specced for mail (Lob). The single most consistently enforced architectural invariant.
- **Honesty / no invented numbers / No-Theater** — evolves from a UI rule (evidence-counted
  claims, anticipation-design) to a physics (every pixel is a query, universe-model) to a data
  discipline (seeds are context not activity, bones-audit) to exit-enforced architecture
  (full-system-scan: *"enforced at the exits, not just in prompts"*). Recurring sub-forms:
  `[EDIT]`/`[YOU FILL]` holes rendered visibly; *"refusals over fabrication"*; honest degrade
  messages per missing secret; "not instrumented" as a state, never a fake zero; min-sample
  gates; *"undercounting is honest; guessing is not."*
- **Worlds / the Universe / solar systems** — the spatial model of the owner's whole life
  (businesses, clients, curiosities in one sky), with position/light/mass as derived signals and
  the final ruling that `knowledge_worlds` is *the* noun.
- **Missions → arcs** — from checklist to *"living work web"* (territory) to durable **arcs**
  (holy-grail gap 2: *"a plan you watch"* vs *"a project that runs"*), landed as the arc wake
  loop.
- **Studios are data / the shell is the product** — the anti-sprawl rule from
  studios-blueprint, generalized by first-principles (*"the product is data"*) and finalized by
  os-blueprint's **Vertical-as-Data** (`VerticalSpec` rows).
- **The heartbeat / the clock / "works while you sleep"** — the pulse, standing orders, the
  morning brief's quiet-night rule, the Master Switch, and the recurring tragedy that the clock
  ships unarmed (where-we-stand finding #1; os-blueprint cause #2).
- **The waking moment / "Garvis speaks first"** — the emotional keystone: *"a companion that was
  already working,"* every line evidence-backed and touchable.
- **Anticipation / Next Moves** — deterministic ranking over real signals, the 3-slot scarcity
  discipline, dismissals that teach, goals that steer.
- **Genesis / World DNA** — businesses designed from intent within a closed vocabulary, with
  rationale, omissions, and questions as first-class outputs.
- **Earned/graduated autonomy** — speed-to-lead's *"pre-authorized narrow action classes...
  expanded one class at a time"* → content-week's 3-clean-weeks auto-mode with instant
  revocation → holy-grail's *"trust is a dial"* → the generalized per-class trust ledger.
- **The deploy executor / capture-at-authorization** — the pattern for making browser-bound
  builds honest through the spine.
- **The watchdog / canary / self-proof** — detection-only ad anomaly alerts; *"grail systems
  demonstrate their own health"*; the nightly canary that *"stays silent."*
- **The Line / the conversation constant** — from "command line" (studios-blueprint UX) to the
  named Line (first-principles) to the Intention Router to os-blueprint's global `<Line>`.
- **Multi-business / portfolio / client operations** — Mom Real Estate as the founding client
  scenario; client engagements; client billing/MRR; per-world isolation (and its leaks, B8);
  *"'Two companies, cleanly' remains ~70% true."*
- **The video pillar** — perpetually the weakest pillar (0/10 → scripts → photo-montage +
  Shotstack → Veo scenes), always bounded by the same honesty rule: never fabricated footage of
  things that don't exist.
- **Compounding / Momentum / the Morning Test** — the product equation (*"Knowledge + Memory +
  Execution + Anticipation = Momentum"*), the five compounding seams, *"unattended hours"* as
  the north-star metric, *"every AI starts every morning at zero; Garvis starts at yesterday."*

## 3. Contradictions and tensions between documents

1. **Radical reduction vs. accretion.** first-principles decrees the sidebar disappears
   *"entirely"* and destinations drop to two; anticipation-design consolidates to 4 surfaces + 1
   anchor. Yet the sprint docs kept adding pages (health, contacts, inbox, billing, automations,
   prospects...), and os-blueprint (Jul 23) finds a **25-item sidebar**, five intention front
   doors, three money doors, and three memory rooms. The consolidation was designed twice
   (anticipation §3, os-blueprint Phase 5) and executed neither time. os-blueprint resolves the
   philosophical tension explicitly: subtraction must come *last*, after the spine exists —
   *"never as an amputation up front."*
2. **"Missions are the only noun" vs. "Worlds are the noun."** first-principles: *"NOUNS —
   Missions. Nothing else."* os-blueprint: *"make `knowledge_worlds` the durable noun and a
   mission a bounded campaign **through** a world."* universe-model had already begun this shift
   (mission = star igniting inside a world). The final model inverts the first-principles
   hierarchy while keeping its UX intent (the user still never files paperwork).
3. **Cinema first vs. substance first.** The visual-design/design-scan docs invest heavily in the
   3D sky (P4, bloom discipline, fresnel planets); os-blueprint explicitly demotes it: *"Not
   chasing the full cinematic mockup first... Substance before cinema."* Both cite the same
   No-Theater rules; they disagree on sequencing.
4. **SaaS posture vs. personal OS.** The README/pricing/plans machinery (Free/Pro, monthly
   limits, upgrade prompts) and hybrid-db's multi-tenant free tier assume external users;
   best-software-plan dissolves that framing (*"not a SaaS competing for strangers"*) — yet
   client-billing/go-live re-introduce commerce in a different direction (the operator selling
   TO clients). The unresolved artifact: FableForge's own $19-vs-$49 pricing contradiction is
   left standing *because* it only matters under the abandoned framing.
5. **Docs vs. reality drift — flagged by the docs themselves.** best-software-plan: README/RUNBOOK
   *"still describe deploy as stubbed. Delete both lies."* full-system-scan B4/B18: the
   documented manual DB path six migrations stale; *"stale '9 jobs' copy in MasterSwitch/
   RUNBOOK."* The corpus is unusually self-correcting, but at any instant several runbook claims
   lag the code (in both directions — the machine was also *"far more real than its own docs
   claim"*).
6. **Cron-job count drift.** heartbeat says 3 jobs; watchdog 5; RUNBOOK arms 11 (while its prose
   says "9 pg_cron jobs" — an internal inconsistency); holy-grail says 10; full-system-scan says
   10-should-be-11; go-live-checklist says 12. Each is true of its moment; none was
   retro-corrected.
7. **Direct mail: manual honesty vs. Lob automation.** glory-sprint's mailer doctrine is
   *"Sending mail is the operator's physical act"* (log-what-you-mailed); level-10 Spec 5 plans
   full Lob fulfillment through a `send_mail` approval. No later document reconciles them; the
   scan-era audits still describe mail as print-it-yourself, so the manual model remained the
   shipped one and Lob remained a plan.
8. **Video's honest boundary vs. AI b-roll.** video-pillar: *"never generates or hallucinates
   footage."* level-10 Spec 6 permits Sora/Veo b-roll *"for lifestyle beats only, never depicting
   a specific real property, always provenance-stamped... and labeled at publish"* — a widening
   of the boundary, disciplined by the disclosure hard gate rather than prohibition. (The later
   Veo Scene Studio commits follow the level-10 posture.)
9. **The four-postures model vs. what shipped.** Think/Create/Execute/Observe is central to
   first-principles, universe-model, and both mockups — yet os-blueprint reports the posture
   classifier *"0% built"* and lists postures as a `VerticalSpec` field for the future. The
   posture vocabulary shaped the mockups more than the code.
10. **Where "adding a capability" lives.** studios-blueprint: a studio = a flavor + tool pack +
    renderer case ("never a new subsystem"). holy-grail gap 1: every UI capability must also
    become a **catalog action**. os-blueprint: it must also be a `VerticalSpec` row. These are
    three successively larger answers to the same question — data-driven at the instance level
    (shipped), reachable-by-intent level (partially shipped), and type level (unshipped).

## 4. The biggest planned-but-unimplemented blocks (as of the corpus's end)

1. **The os-blueprint assembly program** (Phases 0–5): the Field home, the global Line +
   Intention Router, one context assembler + full embedding coverage, the five compounding
   seams, `VerticalSpec`, and the final consolidation/subtraction.
2. **Most of garvis-level-10 Waves 3–6**: social calendar/queue slots/carousels/best-time, the
   email engine (outreach_events-driven segments, drip flows, A/B, branded shell), Lob mail
   fulfillment, Twilio-as-specced CRM texting depth, TTS/captions/music into renders, best-of-3 +
   voice profiles + the quality scorecard.
3. **The anticipation-design strategies layer**: the `strategies` table, propose-strategies,
   ghost-web Begin flow, and specialist hats.
4. **Ad platform write access** (campaign creation/budget changes as approval cards) — gated on
   owner registrations that never happened in-corpus.
5. **hybrid-db S1** (the shared free tier) and cloud-console CC2–CC9.
6. **The ops/records archetype vocabulary** (bones-audit gap 6) — the admission that the seven
   archetypes are demand-gen shaped and operations businesses get *"a forced marketing
   skeleton."*
7. **Gmail/whole-inbox OAuth, calendar as a first-class sense** (beyond the booking pillar),
   custom domains, client-payment webhook reconciliation, data export/account deletion.

## 5. What the corpus reveals about the author's method

Worth recording as archaeology: the documents themselves follow a repeatable loop — **vision doc →
adversarial critique (named "hostile reviewers," "critic-fatal absorbed") → build sprint with a
verified pure core → honest audit that grades the result and names what's missing → the next
vision doc consumes the audit.** Nearly every document ends with a deferred-items section labeled
"honest" ("Deferred, stated"; "Honestly not done yet — documented, not hidden"; "v1 honesty").
The honesty doctrine is not just a product feature; it is the documentation style — which is
precisely what makes this corpus a reliable substrate for reconstruction: when these documents
say something is missing, it was missing; when they say something shipped, the migration numbers
and verify suites they cite almost always exist.
