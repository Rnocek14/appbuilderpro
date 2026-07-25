# 08 — Research, Explore, and Simulation: Can It Actually Think Deeply?

*Phase 5.5 capability audit. Domain: open-ended exploration (rabbit holes), deep research,
theory comparison, and simulation/experimentation — the "perform the work deeply" clause of the
charter test, applied to knowledge work itself. Rubric, formats, and evidence protocol:
`_charter.md`. Evidence: [R03] §3 · [R05] §8.5, §9.9–9.13, §9.20–9.21, §9.25 · [R06] §8, §13b,
§15 · [R13] §6.10–6.11, §8.4–8.7, §8.13 · [R04] §2c (app_0013/0018/0019/0021/0049/0052), §5 ·
`docs/experience-architecture/04-explore-and-rabbit-hole.md` (cited [EA-04] — DOCUMENTED-ONLY
designs) · `prototypes/explore-make-real.html` (PROTOTYPE-ONLY, staged data by its own header) ·
direct greps of `src/` and `supabase/functions/` cited inline.*

---

## 0. What this domain already is (the honest headline)

This domain holds the system's most distinctive real code and its widest docs-to-code gap at
once. The **shipped Explorer is real**: 2,439 lines of spike UI (`ClusterSpike` 424 +
`GalaxyView` 939 + `IdeaRoom` 713 + `SceneStage` 363 — matching [R03 §3]'s "~2,400 lines"),
backed by a genuine data model (12 cluster kinds including theory/evidence/scenario/experiment,
typed edges `relates|leads_to|contradicts|supports`, epistemic honesty labels
`established…hypothesis` — app_0049 [R04 §2c]), metered through one credit-gated chokepoint
(`explorer-turn` [R13 §6.11]), persisted local-first with Supabase sync under the rule "the
universe only grows" [R05 §9.9], and bridged to the app builder via `compileBuildBrief`
[R06 §13b]. The Lab Bench and Decision Laboratory are small but honest to the bone: deterministic
models with stated basis and limits, falsifier-required theory scaffolds [R05 §9.21].

And yet the charter test — *perform the work deeply* — fails on four specific edges: **research
is single-hop** (one web-search completion, never plan → read → follow up), **nothing closes an
epistemic loop on the clock** (predictions close manually, insights fire only on upload, no
experiment lifecycle), **simulation means five hard-coded closed-form formulas**, and the
entire beacon/theory-card/promotion-ceremony experience of [EA-04] — the strongest design
document in the corpus — exists as prose and one staged-data prototype. One genuine post-Phase-1
improvement was found by grep and is recorded in §2: **builder research no longer evaporates**.

---

## 1. Chain 1 — EXPLORATION (open question → territory → something real)

| Step | Status | Evidence | Build/Buy | Owner object | Approval posture | Portfolio surface | Breaks at |
|---|---|---|---|---|---|---|---|
| 1. Open a curiosity ("what are you curious about today?") | **WORKING 🔌 (credit-gated)** | `/garvis/explore` route (`App.tsx:148`); every Knowledge-Universe model call funnels through `exploreComplete` → `explorer-turn` (operator key server-side, per-turn `explore` credit, real cost returned) [R05 §9.25] [R13 §6.11]; new curiosity = new world, never erases one (`ClusterSpike.tsx` header; `universe.ts` [R05 §9.9]) | Build (done) | Workshop (Explore) | none (internal); spend metered auto | Explorations-across-worlds lens is DOCUMENTED-ONLY [EA-04 §9.3] | Holds to T-100 on credits; the admin-only "Labs" nav filing [R03 §3] is a T-ME discoverability break |
| 2. Turns grow clusters + artifacts | **WORKING** | `clustering.ts`: 12 kinds incl. theory/evidence/scenario/experiment/insight; artifacts live ON the cluster ("nothing gets lost… one hop from the idea", `clustering.ts:40–43`); clean branching with hysteresis ("can't flicker into a hairball", `clustering.ts:406–446`) | Build (done) | Capability | none | — | Holds — pure cores, verified |
| 3. Media/source enrichment | **WORKING 🔌** | `gatherWikiMedia`/`gatherDiscover`/`gatherVideos` (`GalaxyView.tsx` imports); `discover-media` + Serper [R06 §8]; `fetch-url` hardened reader [R13 §8.4] | Build (done) | Capability | none (read) | — | Holds |
| 4. The live-map surface | **WORKING as shipped spike; the [EA-04] surface is PROTOTYPE-ONLY** | Shipped: `GalaxyView` radial flowmap + right detail panel + `IdeaRoom` drift-by-currents + `SceneStage` — a *drift* grammar, not a dialogue grammar. Designed: conversation-forward thread + live map margin, delta chips, map-forward re-entry [EA-04 §3] — exists only in `prototypes/explore-make-real.html` (its own header: "Staged data, real timing") | Build: the dual surface is the [EA-04] spec over the existing graph — data model already fits | Workshop surface | none | — | T-ME — the shipped drift UI works for one person; the designed surface is what makes explorations legible enough to hold hundreds |
| 5. Branching / what-if scenarios | **WORKING** | `addChild`, scenario kind ("controlled divergence, never replaces the original", `clustering.ts:30`, `489–496`), `shouldSpawnCluster` split-on-substructure; branch resume via focus | Build (done) | Capability | none | — | Holds |
| 6. Beacons ("hold that thought" + held guess) | **PARTIAL** | grep `beacon` over `src/` → **zero hits**; the shipped half is the open-loop ledger (`loops.ts`: named gaps as embers, dup-merge, epiphany counting, close-on-matching-dive — max 12, localStorage per world). The held **guess**, guess-scoring at close, and calibration feed are [EA-04 §4.2] only; the prototype's "hold" button is staged | Build: add guess field + close-scoring to `loops.ts`, persist to `knowledge_worlds.mind` (column already exists, app_0018 [R04 §8]) | Capability | none | — | T-ME — loops don't survive device switch (localStorage; cloud column ready, unwritten) |
| 7. Auto-persistence | **WORKING** | Local-first `ff:worlds:v1` + Supabase sync (app_0013/0018) [R05 §9.9]; `working_state` cross-device row (app_0052 [R04 §2c]); chartered clusters never stale-deleted | Build (done) | substrate | none | — | Holds; localStorage-first is a T-ME posture (loops, currents never leave the device [R05 §9.12]) |
| 8. Decay / dormancy / re-entry story | **DOCUMENTED-ONLY** | active/cooling/dormant tiers, map-forward re-entry narrative [EA-04 §9.2, §12]; shipped: `lastSeen()` + world list, no decay rendering, no re-entry story | Build (rendering only — storage already never deletes) | Workshop surface | none | The Field's quiet band [EA-04] is also docs-only ([R03 §2] Field = UI-ONLY) | T-10 — without decay rendering, dozens of explorations become an undifferentiated list |
| 9. Cross-world noticing (gardener) | **WORKING** | `recurringThreads` ≥2 distinct worlds, similarity 0.55, "only SURFACES", fail-soft [R05 §9.11]; swept on Explorer entry (`ClusterSpike.tsx` imports `sweepRecurringThreads`) | Build (done) | Capability | none | This IS a portfolio surface — the only shipped cross-exploration one | Holds |
| 10. Promotion — rabbit hole → build | **WORKING (as a bridge)** | `compileBuildBrief` (pure, `buildBrief.ts`) distills focused idea + reasoning thread + branches + sources + open questions → `buildBridge` → NewProject → FableForge → app mounts back as a Room [R06 §13b] | Build (done) | Mission (the build) | approve (builds spend) | — | Holds for T-ME |
| 11. Promotion — "make this real" identity-preserving growth | **PROTOTYPE-ONLY / DOCUMENTED-ONLY** | The world-grows-around-the-map ceremony (Proposal screen, Charter, zero copies, beacons→asks, predictions→tracked calls) is [EA-04 §10] + `explore-make-real.html` P2. The shipped bridge (step 10) is honest but is an *export*: the brief leaves, the exploration stays behind — the promotion-without-loss test [EA-04 §16.4] is unmet | Build: charter-upgrade path exists as precedent (cluster → production area, `workshops.ts` [R05 §9.2]) — promotion is a world-level charter, not a new mechanism | Workshop → world ceremony | approve (one confirm by design) | Promotion offers ride the Brief [EA-04 §9.3] — docs-only | T-ME — this is the domain's marquee designed experience, and none of it is wired |
| 12. Free-floating research (no world) | **MISSING (deliberate, pinned by a verify case)** | Verified current class by grep: `orchestratorCases.verify.ts:223–227` — intent "Research whether AI headshot apps are a saturated market" must compile to a **hole**: "research is business-bound today; found the venture first (or ask inside a builder project)". Still on the author's "decide, don't drift" list [R06 §15 #13] [R03 §11]. Nuance: the Explorer's lazy world-birth answers the *curiosity* case (any question gets a world); the hole is Command/orchestrator-driven standalone research | Build: [EA-04 §2.1]'s silent curiosity-world birth IS the design answer — route the orchestrator hole to it | Capability | none | — | T-ME — today the front door refuses; the side door (Explore) accepts. Two doors, one honest, one designed |

**Chain verdict.** Steps 1–3, 5, 7, 9–10 close their loops in code today — a person can fall
down a rabbit hole, keep it forever, and turn it into a built app. What does NOT exist is
everything that makes exploration *compound* and *legible*: held guesses, decay rendering,
re-entry stories, the promotion ceremony, and any surface listing explorations across worlds.
The reconciliation to state plainly: **the shipped Explorer and the [EA-04] design are two
different interaction grammars over one (already sufficient) data model.** The spike is
drift-and-gather; the design is dialogue-and-territory. Nothing in the schema blocks the
design — `knowledge_clusters`, edges, epistemics, `mind` jsonb, and `working_state` cover it —
the gap is pure surface and wiring.

---

## 1.5 The three-layer reconciliation — shipped spike vs prototype vs experience docs

The brief demands honesty about one specific confusion: this domain has THREE artifacts that
all look like "the Explorer," and they are not the same thing. Layer by layer:

1. **Shipped** (`src/pages/spike/` + `src/lib/garvis/clustering|universe|loops|currents|lab|
   inquiry`): a drift-grammar Explorer. You enter an idea, currents pull you forward, the
   galaxy is the zoom-out, artifacts accumulate on branches, everything persists. Real,
   metered, verified pure cores. Its own file headers call it a spike; [R03 §3] files it
   "OPERATIONAL, filed as EXPERIMENTAL… grade B 'does nothing unattended'."
2. **Prototype** (`prototypes/explore-make-real.html`, P2): a dialogue-grammar Explorer —
   conversation-forward with a map margin, sentence-level provenance highlighting, a "hold"
   affordance, and the "make this real" grow-in-place ceremony. Its header states the contract:
   *"Staged data, real timing. One self-contained file, zero external requests."* Nothing in it
   executes against the real graph. Preserved per charter non-goals as a validated interaction
   experiment.
3. **Documented** ([EA-04], 672 lines): the full binding design — seven anti-disposable-chat
   mechanisms, beacons with held guesses, theory cards with tallies, decay tiers
   (active/cooling/dormant, 2wk/6wk canonical), re-entry stories, watches, fold-in/split,
   promotion/demotion symmetry, nine acceptance checks.

What reconciles them, per mechanism (the honest map from design to code):

| [EA-04] mechanism | Shipped analogue | Gap class |
|---|---|---|
| No unscoped conversation (§2) | TRUE in Explore (lazy world birth, `universe.ts`); FALSE at the Command front door (verify-pinned refusal, §1 step 12) | PARTIAL |
| The map is the record (§3) | Galaxy IS the primary surface; but no transcript-subordination — the spike has no persistent thread to subordinate | PARTIAL (different grammar) |
| Parked thoughts are rows (§4.2) | `loops.ts` open-loop ledger — gap named, no guess held, localStorage-only | PARTIAL |
| Nothing unsaved (§9.1) | TRUE — local-first + sync, "the universe only grows" [R05 §9.9] | WORKING |
| Decay is rendering (§9.2) | Storage never deletes (TRUE); rendering tiers absent | DOCUMENTED-ONLY |
| Provenance on everything made (§7) | Artifacts live on their spawning cluster; sim records carry basis; edges are typed | WORKING (weaker: no per-turn citation of map elements) |
| Promotion zero re-entry (§10) | `compileBuildBrief` bridge — real but export-shaped, not identity-preserving | PARTIAL |
| Branch combine/synthesis (§4.4) | `findBridge` exists on demand; no join ceremony, no guess-checking at joins | PARTIAL |
| Watches on explorations (§9.3) | `watch_url` standing order exists globally 🔌 [R13 §6.3]; not mountable from an exploration surface | DISCONNECTED (two built halves, no wire) |
| Theory cards, tallies, criteria packs (§5) | Typed edges + epistemic labels + COMPARE/THEORY instruments; no card, no tally, no packs | PARTIAL |
| Inline sims (§6) | Lab bench opens from a branch; nothing runs in-thread | PARTIAL |
| Voice explore-walk (§13) | Nothing | MISSING |

And [EA-04]'s own nine acceptance checks (§16), scored against shipped code today — the
sharpest single reading of the docs-to-code distance:

| [EA-04] acceptance check | Shipped verdict |
|---|---|
| 1. Abandonment (return in a year, land on the map, nothing lost) | **PASS-minus** — worlds persist and reopen; no re-entry story, and loops are device-local |
| 2. Disposable-chat (no transcript as primary record) | **PASS by accident** — the spike has no primary transcript at all |
| 3. Zero-ceremony (utterance → live session, no dialogs) | **PASS** in Explore; FAIL at the Command door (business-bound refusal) |
| 4. Promotion-without-loss (zero copies/exports/re-asks) | **FAIL** — `compileBuildBrief` is an export by construction |
| 5. Evidence (every tally/claim survives "which rows?") | **PARTIAL** — artifacts and sim records yes; no tallies exist to test; sim evidence not labeled on edges |
| 6. Scope (counterparty isolation in exploration) | **UNTESTABLE** — explorations don't mount counterparty scoping; the ~70%-true isolation estimate is world-level [R03 §8] |
| 7. Mastery (visible calibration after ten sessions) | **FAIL** — the hit-rate math exists (`mind.ts:142`), nothing feeds or renders it from exploration |
| 8. Walk (voice parity) | **FAIL** — no voice surface |
| 9. Fold-in (attach exploration to operating world) | **FAIL** — no fold-in verb anywhere in the catalog |

The load-bearing conclusion: **the schema is not the gap.** `knowledge_worlds/_clusters/
_cluster_edges/_artifacts` + `epistemic` + `charter` + `mind` jsonb + `working_state`
[R04 §2c, §3.3] can carry every mechanism above. The gap is surface and wiring — which is
exactly what the charter's "what must be TRUE underneath" test wants to hear, because it means
the five prototypes were validated against a substrate that already exists.

---

## 2. Chain 2 — DEEP RESEARCH (question → cited, persistent, compounding knowledge)

| Step | Status | Evidence | Build/Buy | Owner object | Approval posture | Portfolio surface | Breaks at |
|---|---|---|---|---|---|---|---|
| 1. Multi-hop research (plan → search → read → follow up → synthesize) | **MISSING** | Both engines are single-hop: `research` edge fn = ONE completion with Anthropic web_search (maxUses 10 searches inside one turn; project-bound; `AI_PROVIDER=anthropic` or 400) [R13 §8.13]; `produceResearch` = one Serper gather → one synthesis [R05 §9.20]; `marketIntel` capped 2 queries/scan [R05 §9.21]. No engine ever reads a result and issues a follow-up query on what it learned | Build: an arc-shaped research mission over existing pieces (orchestrator arcs + fetch-url + web_search already exist [R05 §4.3]); Buy alternative: none needed — the primitives are in-house | Mission (a research arc) | none (internal); spend metered | Control-plane: research spend per world | T-ME — "deep research" is the industry bar now; one-shot answers are not it |
| 2. Web search rails | **WORKING 🔌** | Anthropic web_search server-side (`completeWithWebSearch`, 8000 tokens) [R13 §8.13]; Serper via `discover-media` 🔌; `claudeScout` citation-required discovery [R03 §4] | done | Capability | none | — | Holds |
| 3. Citations / source honesty | **WORKING (in-artifact)** | `produceResearch`: "Cite every factual claim with [n]… say so under 'STILL UNKNOWN' — never invent" + appended real SOURCES section "so the brief is checkable, not a black box" (`producersCore.ts:40–53`); `RESEARCH_SYSTEM`: "ground every market claim in a cited source" [R13 §8.13]; URL-allowlist gauntlet drops hallucinated links [R05 §9.17] | done | Capability | none | — | Holds |
| 4. Source management (first-class source objects, dedupe, reuse) | **PARTIAL** | Sources live as text inside artifact bodies and as `link`-kind artifacts on clusters (`buildBrief.ts sourcesOf`); no source table, no cross-run dedupe, no "what do we already have on X" over sources specifically. [EA-04 §3.2]'s source nodes with row references = DOCUMENTED-ONLY | Build: small — sources are already extractable | Capability | none | Lens: source coverage per exploration | T-10 — re-fetching what a sibling world already read |
| 5. PDF / document ingest | **WORKING (was "coming" — now verified built)** | Resolves [R03 §3]'s "PDF ingest was 'coming'; post-audit state unverified": `src/lib/docExtract.ts` extracts .pdf via `pdfjs-dist` (dynamic import, 200-page cap, scanned-PDF → honest refusal "Nothing was ingested") and .docx via `mammoth`; feeds `ingest-document` (summarize → embed ≤11 chunks → cosine-classify → propose home world + insights; "Nothing is auto-filed") [R13 §8.6]. Consumers: `ProjectWorkspace`, `PaperworkStudio`, `brain.ts` (grep) | done; OCR for scans = Buy if ever needed (Textract/Document AI-class) | Capability | none (filing is approval-first) | — | Holds; no OCR is an honest, stated limit |
| 6. Builder research persistence | **WORKING — FIXED since Phase 1 (inventory row stale)** | [R06 §8] and 01-inventory §17 record this DISCONNECTED ("evaporates into chat"). Grep shows the planned fix landed: `aiClient.ts:359–376` `persistResearch()` files EVERY research answer ≥200 chars through `ingest-document` (`source_kind:'research'`, 60k cap, fire-and-forget: "a missing function… must never break research itself"), called on both edge and DIRECT paths (`aiClient.ts:296,354`) | done | Capability | none | — | Best-effort/silent-failure is acceptable at T-ME; at T-100 unfiled research should surface as an exception |
| 7. Embeddings + hybrid retrieval | **PARTIAL** | One polymorphic 1536-dim space, HNSW, owner-scoped `match_embeddings` [R04 §5]; `ask.ts` hybrid vector+lexical with honest lexical fallback [R05 §9.21]; **writes cover 2 of 6 declared subject types** — beliefs/decisions/clusters/worlds unsearchable by meaning [R06 §8 seam 3]; `embed-worker` degrades to `{embedded:0}`, never a hard error [R13 §8.7] | Build: call the existing worker for the other 4 subject types | substrate | none | — | T-10 — semantic recall can't span the graph, so cross-client pattern-finding starves |
| 8. Cross-exploration connection (the "insights scanner") | **DISCONNECTED** | `insights` rows produced only on document upload; "no periodic proximity scanner" [R06 §8 seam 4] [R03 §3]; the cosine machinery, `universeView` filaments (≥2 worlds by measured cosine [R05 §9.9]), and on-demand `findBridge` (`clusteringRun`) all exist — nothing runs them on the clock | Build: one standing order over existing machinery (the 01-inventory repair shape, register #4) | Standing Order | none (surfacing only) | This is THE portfolio-knowledge surface at scale | T-10 — ten worlds' overlaps go unnoticed except at upload moments |
| 9. Research depth (red-team → refine) | **DISCONNECTED** | Depth engine ("CONSULTANT SLOP… UNSUPPORTED CLAIMS… depth means sharper, never faker" [R05 §8.5]) wired to 1 of ~9 producers — business plans only [R03 §2]; confirmed live in `producers.ts:544–565` (fail-open: unparseable critique ships the draft) | Build: wire the other producers through the existing loop (register #3) | substrate | none | — | T-ME — research briefs ship un-red-teamed today |
| 10. Knowledge → reasoning loop | **WORKING 🔌 (with the five seams)** | capture → weekly consolidation → approval-gated lessons → reaches agent runs AND builder [R06 §8]; producers auto-load prior research to diverge from [R05 §9.20]; the five compounding seams [R06 §8] remain the honest ceiling | Build: seams 1–5 (distiller, decision-close, embedding coverage, insights cron, world-intel cron) | substrate | approve (lessons gate — by design) | — | T-10 for the seams; the gate itself scales fine |

**Chain verdict.** Single-hop research with excellent citation honesty, feeding a real ingest
and retrieval spine that now (post-Phase-1 fix) actually captures builder research. The two
breaks that matter: **no multi-hop engine** (the defining capability of "deep research" as the
market now defines it — and every primitive needed is already in-house: durable arcs, hardened
fetch, web search, ingest), and **nothing connects knowledge on the clock** (seams 3+4+8 —
embeddings coverage, insights cron). Both are wiring, not invention.

---

## 3. Chain 3 — THEORY COMPARISON (hunch → structured theory → discriminated → calibrated)

| Step | Status | Evidence | Build/Buy | Owner object | Approval posture | Portfolio surface | Breaks at |
|---|---|---|---|---|---|---|---|
| 1. Theory scaffold from a hunch | **WORKING** | `inquiry.ts` THEORY instrument: claim/definitions/assumptions/related work/observations/predictions + **FALSIFIERS required** — "a scaffold with no FALSIFIERS is rejected BY NAME… agreement from an AI is not evidence"; substance-gated parsers; spawns up to 3 `experiment` child sparks [R05 §9.21] | Build (done) | Capability | none | — | Holds |
| 2. Side-by-side comparison | **WORKING** | COMPARE instrument: agree/conflict/**hinges** (the assumptions the disagreement turns on)/**discriminators** (observations one could actually look for)/verdict + honest readout; result = artifact + **typed edge on the map** (`contradicts|supports|relates`) (`inquiry.ts:16–60`) | Build (done) | Capability | none | — | Holds |
| 3. Theory cards with live evidence tallies | **DOCUMENTED-ONLY** | "4 supporting · 1 contradicting · 2 untested assumptions", every count opens its rows, evidence rows matched by question [EA-04 §5]; shipped honest cousins: epistemic labels on clusters (app_0049 [R04 §2c]) and the typed edges of step 2 — but no tally, no theory-status view, no evidence-row management | Build: a view over existing `knowledge_cluster_edges` — the data model already carries directional supports/contradicts | Workshop surface | none | — | T-ME — the rigor surface [EA-04] promises is unbuilt |
| 4. Assumptions tracking | **MISSING (as a ledger)** | Assumptions exist only as strings inside compare/theory artifact text (`inquiry.ts CompareSide.assumptions`) and sim template declarations (`lab.ts`); no assumption objects, no untested-assumption → open-question wiring, no assumption audit [EA-04 §5] | Build: smallest version = assumptions as `question`-kind child clusters (kind exists) | Capability | none | — | T-ME |
| 5. Predictions staked + calibration record | **PARTIAL (manual close)** | `mind_decisions` journal: decision/prediction/outcome/`outcome_hit` (app_0019 [R04 §2c]); `decisionHitRate` counts ONLY closed decisions "so the journal can't flatter itself" (`mind.ts:142–145`) and open ones surface as "do not re-litigate, do watch for outcomes" (`mind.ts:210`); **outcomes close only manually** [R06 §8 seam 2]; no auto-close from experiments/results rows; beacon-guess calibration MISSING (no beacons, §1 step 6) | Build: outcome-observation pass on the heartbeat (seam 2), wired to results rows the system already counts [R05 §9.27] | substrate + Standing Order | none | Calibration view across worlds [EA-04 §16.7] — docs-only | T-ME for automation; the honest math is done and waiting |
| 6. Critique-against-rubric ("critique this theory") | **MISSING** | Editable research criteria packs (evidence quality, steelman, falsifiability) [EA-04 §5]; the house has the pattern built for copy (`copyJudge.ts` editor-in-the-loop [R13 §10.14]) and for documents (depth CRITIQUE_SYSTEM [R05 §8.5]) — nothing points either at theories | Build: a THEORY_CRITIQUE system prompt on the copyJudge pattern | Capability | none | — | T-10 |
| 7. Discriminating test → Lab handoff | **PARTIAL** | COMPARE emits discriminators (step 2) and THEORY emits experiments; `suggestTemplate` maps branch text → a sim bench (`lab.ts:269–282`); but nothing stages "run THIS test" from a comparison into the Lab, and no result ever writes back to the theory [EA-04 §6] | Build: wire discriminator → lab bench → result edge | Mission | none | — | T-ME |

**Chain verdict.** The instruments are real and epistemically serious — falsifier-required
scaffolds and hinge/discriminator comparisons are better than most shipping research tools —
but they are **one-shot instruments, not a loop**. A theory made today accumulates no evidence
tally, its predictions close only if the operator remembers, and no experiment result ever
touches its card. Everything needed for the loop exists in fragments (edges, epistemics,
`mind_decisions` hit-rate math, sim records); the loop itself is unwired.

---

## 4. Chain 4 — SIMULATION / EXPERIMENTATION (model → runs → evidence)

**What the Lab Bench can actually simulate (audited).** `lab.ts` (371 lines, pure, verified) is
exactly five hard-coded closed-form templates: time-dilation (Lorentz), black-hole time dilation
(Schwarzschild static observer — refuses inside the horizon rather than pretend), compound
growth, city-rollout unit economics, and binomial reach-odds. Each is arithmetic over user-set
dials (≤5 params) with stated basis, assumptions, limits, and real-world anchors.
"Sensitivity" = a +10% finite-difference bump per parameter, ranked by |Δ%|, refusing when the
base is zero/null or a parameter is pinned at its bound (`lab.ts:291–308`). There are **no
dynamical systems, no agent-based or Monte Carlo simulation, no time-series, and no user-defined
models** — `suggestTemplate` is a keyword matcher over five fixed benches. This is a
deliberately honest calculator, not a simulation engine, and its own header says so ("v1 ships
ONLY deterministic models — known equations… the model never invents a number").

| Step | Status | Evidence | Build/Buy | Owner object | Approval posture | Portfolio surface | Breaks at |
|---|---|---|---|---|---|---|---|
| 1. Open a bench from a branch | **WORKING** | `suggestTemplate` deterministic keyword scan, "freely overridable in the bench (never a hidden decision)" (`lab.ts:267–282`); LabBench/SimVisual/MechanismCanvas render layer (233/306/226 lines) [R03 §3] | Build (done) | Workshop (the Lab) | none | — | Holds |
| 2. Run + record | **WORKING** | `simRecordArtifact`: template+inputs+basis+outputs serialized as a `simulation`-kind artifact on the exact spawning branch; content-hash id so identical re-runs dedupe (`lab.ts:339–359`); tolerant parse-back | Build (done) | Capability | none | — | Holds |
| 3. Sensitivity / parameter sweep | **PARTIAL** | Finite-difference single-bump ranking only (`lab.ts:291–308`); no sweeps, no compare-two-runs view, no vary/sweep/compare/score moves [EA-04 §6] | Build: sweeps are trivial over the pure `compute` | Workshop bench | none | — | T-ME |
| 4. Inline quick sims in conversation | **DOCUMENTED-ONLY** | "Simulate 200 bees with rule X" in-thread [EA-04 §6]; shipped path is opening the bench UI | Build (surface) | Workshop | none | — | T-ME |
| 5. User-defined / domain models | **MISSING** | Templates are code, not data; no authoring path; nothing beyond the five | Build: templates-as-rows (the `vertical_specs` pattern [R03 §9]); or step 7 | Capability | approve (a new model's basis needs review) | Cohort: a validated model shared across client worlds | T-ME for any domain the five don't cover — i.e., almost every serious client question |
| 6. Experiment design + tracking (lifecycle) | **MISSING (fragments exist)** | `experiment` cluster kind ("a way to test something", `clustering.ts:31`) + inquiry's experiment sparks + SimRecords exist; **no experiment object** (hypothesis→setup→run→result→closes-prediction), no experiments table [R04 §3.3 has none], no result write-back (§3 step 7) | Build: an experiment charter on clusters + a close-decision hook into `mind_decisions` | Mission (an experiment IS a mission with a verify) | none | Exception rule: experiments stalled >N weeks | T-ME — "experimentation" today means the operator remembers to check |
| 7. External compute / notebooks (real modeling) | **MISSING + EXT-REQUIRED (with an in-house asset)** | No Python, no sandboxed code exec for models, no notebook anywhere (grep: no jupyter/pyodide). Build-vs-buy note: the house ALREADY ships a browser WebContainer full runtime with real tsc + terminal in the builder [R03 §1] — a JS sandbox that could host user-authored deterministic models with zero new vendors; for Python-class work: **Pyodide** (browser, free, keeps the no-server-secrets posture) as first choice; **E2B / Modal** (server sandboxes) only if runs must survive the tab — which cuts against the builder's own browser-bound precedent | Buy: Pyodide (OSS) first; E2B/Modal at T-100 | Capability | none (compute) / approve (cost if server-side) | Control-plane: compute spend | T-10 — client-grade questions (churn curves, inventory, scheduling) exceed five formulas immediately |
| 8. Sim results as labeled evidence | **DOCUMENTED-ONLY (edge label) / WORKING (record honesty)** | "supports (in simulation)" distinct edge rendering, model-assumption citation [EA-04 §6] — not in `EdgeType`; but every shipped record carries basis/assumptions/limits inline, so the honesty exists on the record, not on the map | Build: one edge-label variant | Capability | none | — | T-10 |

**Chain verdict.** WORKING, niche, and honest — and the niche is narrow enough that the honest
description is "five interactive worked examples with provenance." The charter question "can it
perform the work" for a client's real modeling question is **no** beyond those five shapes. The
highest-leverage move is not a simulation engine: it is (a) templates-as-data so domain models
accumulate, and (b) the experiment lifecycle that makes ANY result — sim, market scan, or real
campaign — close a staked prediction. That second piece is what turns the calibration math
already sitting in `mind.ts` into the mastery loop [EA-04 §16.7] promises.

---

## 5. Proposed Workshop: RESEARCH / THEORY WORKSHOP (charter 14-field spec)

| Field | Spec |
|---|---|
| **Job** | Take a question from open curiosity to a defensible, cited position: territory mapped, sources on record, theories staked with falsifiers, assumptions audited, predictions closed against outcomes |
| **Knowledge required** | Research-craft criteria (evidence quality, falsifiability, steelman-before-dismissal — editable packs); the world's vertical vocabulary [R05 §9.14]; prior research on record (producers already auto-load it [R05 §9.20]) |
| **Source data required** | Web search (Anthropic web_search 🔌, Serper 🔌); ingested documents incl. PDFs (`docExtract` → `ingest-document`); the world's artifacts/edges/epistemics; `mind_decisions` journal; gardener threads |
| **Direct-manipulation surface** | The map (clusters, typed edges, epistemic labels — exists) PLUS a theory table (claim · assumptions · evidence for/against · predictions · status) as the same material's row view [EA-04 §8] — the map+table dual is the bench |
| **AI's role** | Socratic counter-party (asks back, steelmans, names assumptions); continuous extraction into the map; COMPARE/THEORY instruments; red-team critique via the depth engine; **never a confidence-number inventor** — tallies and hit-rates are counted, never scored |
| **Tools** | `explorer-turn`, `research`/`completeWithWebSearch`, `fetch-url`, `ingest-document`/`embed-worker`, `ask` hybrid retrieval, `inquiry` COMPARE/THEORY, `produceResearch`, `findBridge`, `compileBuildBrief` |
| **External integrations** | Anthropic web_search 🔌, Serper 🔌, embeddings provider 🔌 — all already integrated; nothing new required at T-ME |
| **Evaluation/critique criteria** | Falsifier presence (already enforced); citation coverage + STILL-UNKNOWN honesty; depth red-team categories (slop, unsupported claims, hollow ops, contradictions, ignored research [R05 §8.5]); prediction hit-rate (closed-only) |
| **Output Artifacts** | Cited research briefs; theory scaffolds; comparisons with typed edges; source nodes; build briefs; deliverable docs (via `deliverableRun` grounding) |
| **Missions it creates** | Multi-hop research arcs (§2 step 1 — the missing engine); discriminating-test experiments (→ Lab); promotion → build missions |
| **Standing Orders it establishes** | `watch_url` on live sources (exists [R13 §6.3]); the insights proximity scan (to build — register #4); reflection cadence per world (exists, off-clock [R06 §8 seam 5]) |
| **Outcome signals it learns from** | `mind_decisions.outcome_hit` rate; loop closes + epiphany counts (`loops.ts`); whether briefs get cited by later producers; kept-vs-rewritten verdicts pattern (`draft_verdicts` precedent [R13 §7.7]) |
| **Expert controls** | Epistemic label overrides; edge editing/merging; criteria-pack editing; depth on/off per run; source allowlists; template of what counts as evidence per world |
| **Fast-path (AI-assisted)** | "Research X here" → single cited brief, auto-filed through ingest (exists TODAY: `produceResearch` + `persistResearch`), suggested edges to existing territory |

**Verdict: DEEP-ENVIRONMENT.** The nine-bench grammar supplies chat/artifacts/versions, but a
graph-with-typed-edges canvas synchronized to a theory table, with calibration counted from the
decision journal, is a specialized surface the generic cluster-studio canvas cannot express —
and 2,439 lines of shipped spike UI already exist as its seed.

---

## 6. Proposed Workshop: SIMULATION WORKSHOP (the Lab) (charter 14-field spec)

| Field | Spec |
|---|---|
| **Job** | Turn a question into a runnable model with a stated basis; vary/sweep/compare parameters; commit runs as reproducible, provenance-carrying evidence that can close predictions |
| **Knowledge required** | The model catalog (each with basis, assumptions, limits, anchors — the `lab.ts` honesty contract, kept as the non-negotiable); which model shapes fit which question kinds |
| **Source data required** | Branch context (for suggestion); user parameters; the world's REAL rows (goals, results, MLS stats, send metrics) offered as dial-replacements so estimates give way to measurements |
| **Direct-manipulation surface** | The bench: dials (min/max/step), live outputs, sensitivity ranking, MechanismCanvas visual, a run ledger with side-by-side run compare — dials-and-canvas, not chat |
| **AI's role** | Template suggestion (overridable), narration of computed results (`DATA_SYSTEM` discipline: "NEVER compute a new number yourself" [R05 §9.21]), proposing discriminating tests; the compute itself is pure code, always |
| **Tools** | `SIM_TEMPLATES`, `sensitivity`, `simRecordArtifact`/`parseSimRecord`, `suggestTemplate`, inquiry experiment sparks, (to build) sweep + compare-runs |
| **External integrations** | None today. Candidates: Pyodide (browser Python, free, first) → E2B/Modal (server sandboxes) only when runs must outlive the tab; the in-house WebContainer runtime [R03 §1] is the JS-sandbox asset already paid for |
| **Evaluation/critique criteria** | Reproducibility (same inputs → same record id — enforced); basis stated on every output; limits rendered beside every result; null-over-invented for uncomputable outputs (enforced) |
| **Output Artifacts** | `simulation`-kind records on the spawning branch; (to build) sweep tables; experiment results with edges to the theories they test |
| **Missions it creates** | "Validate this dial against your market" tasks (the anchors already point there); experiment missions with a verify step (the `missionRun` verified-handoff spine fits exactly [R05 §9.1]) |
| **Standing Orders it establishes** | (to build) re-run-on-new-data: when the real rows behind a dial change, re-run and diff — the watch-shaped automation [EA-04 §9.3] applied to models |
| **Outcome signals it learns from** | Sim prediction vs later measured rows (MISSING — the §4 step 6 lifecycle is the prerequisite); which templates get used vs overridden |
| **Expert controls** | Parameter range editing; output selection for sensitivity; template override (never hidden); (to build) model authoring with mandatory basis/assumptions/limits fields — the honesty contract as a form |
| **Fast-path (AI-assisted)** | "Simulate this" on any branch → suggested template pre-filled from context → one run → record on the branch (exists today, minus the pre-fill of world rows) |

**Verdict: DEEP-ENVIRONMENT** for the bench surface (dials, canvas, run ledger are not the
nine-bench grammar) — but the model catalog itself should be REUSABLE-FRAMEWORK-style **data**,
per the house's own `vertical_specs` direction [R03 §9], so that a validated model travels
across client worlds without code.

---

## 6.5 Deltas vs Phase 1 / the 01-inventory (grep-verified corrections)

This audit's greps found the reconstruction and the sibling inventory stale in three places and
confirmed them in two — recorded here so the 13-gap-matrix aggregation dedupes against THESE
classes, not the older ones:

| Item | Phase-1 / 01-inventory class | Current class (this audit) | Proof |
|---|---|---|---|
| Builder research persistence | DISCONNECTED — "evaporates into chat" [R06 §8]; 01-inventory §17 + register #6 | **WORKING** (best-effort) | `aiClient.ts:359–376` `persistResearch()` files every ≥200-char research answer through `ingest-document` on both edge and DIRECT paths; the code comment narrates the fix of exactly the [R06 §8] defect |
| PDF ingest | PARTIAL — "no PDF ingest… post-audit state unverified" [R03 §3] | **WORKING** (no OCR) | `src/lib/docExtract.ts` (pdfjs-dist + mammoth, 200-page cap, scanned-PDF honest refusal); consumed by ProjectWorkspace, PaperworkStudio, brain.ts |
| Beacons | implied buildable from [EA-04] | **PARTIAL** (loops only) | grep `beacon` over `src/` → zero hits; `loops.ts` is the shipped half (no guess, no calibration, localStorage) |
| Free-floating research | MISSING (deliberate) [R06 §15 #13] | **CONFIRMED MISSING (deliberate)** | `orchestratorCases.verify.ts:223–227` still pins the refusal as a compile hole — the hole is tested, which is the house style for "decided, not drifted" |
| Insights scanner / world-intel cron / depth wiring / embedding 2-of-6 | DISCONNECTED / PARTIAL [R06 §8 seams] | **CONFIRMED unchanged** | embed-worker callers unchanged (grep: `embeddings.ts`, `ingest-document`, `system-control`, `healthRun`); `producers.ts:544–565` depth on business plans only |

One classification judgment worth stating: `persistResearch` is fire-and-forget by explicit
design ("a missing function or un-applied migration must never break research itself"). At T-ME
that is the right honesty trade; at T-100 a silently-failing knowledge pipe is a control-plane
exception ("N research runs unfiled this week"), not a shrug — the row's Breaks-at reflects
that.

---

## 6.6 Scale gates — where this domain's current design fails, tier by tier

- **T-ME (now):** The domain performs curiosity and shallow research well and deep work poorly.
  The four T-ME breaks that gate "serious undertaking" work: no multi-hop research, a
  five-formula simulation ceiling, no experiment lifecycle, and the unbuilt promotion ceremony
  (today's operator tolerates the export-shaped bridge; a client-facing practice cannot).
- **T-10:** State locality bites first — `loops.ts` and `currents.ts` never leave the device
  [R05 §9.12], so ten client engagements explored across a laptop and a desktop shed their
  open questions. Then legibility: no decay rendering and no Explorations lens means ~30
  explorations render as one undifferentiated pile; the gardener (shipped) and the insights
  scanner (disconnected) are the only cross-world noticing.
- **T-100:** Knowledge economics dominate — source re-fetching across sibling worlds wastes
  spend; validated sim models need cohort distribution (templates-as-data); embedding coverage
  (2/6) starves any "what do my hundred clients' worlds have in common" query; silent
  best-effort filing needs exception surfacing.
- **T-1K:** Nothing in this domain is the bottleneck at T-1K provided T-100 lands — research/
  explore is per-world work whose substrate (RLS, credits, owner-scoped kNN) already partitions
  correctly [R04 §4.4, §5]. The control-plane items (spend anomaly per world, unfiled-research
  exceptions, model-version drift across cohorts) belong to document 10's fleet plane.

---

## 7. The fifteen questions

| # | Question | Answer |
|---|---|---|
| 1 | Exists-working | Explorer (turns, clusters, branching, media, persistence, gardener) 🔌; credit gating; compileBuildBrief→app→Room; single-hop cited research ×2 engines; PDF/docx ingest + ingest-document pipeline; builder-research persistence (post-Phase-1 fix, `aiClient.ts:366`); ask hybrid retrieval; inquiry COMPARE/THEORY with falsifiers + typed edges; Lab Bench (5 deterministic templates, finite-difference sensitivity, deduped records) |
| 2 | Partial/scaffold | Beacons (open-loop ledger without held guesses, localStorage-only); embeddings 2/6 subject types; predictions/calibration (honest hit-rate math, manual close); source management (in-artifact only); sensitivity (single-bump, no sweeps); discriminator→Lab handoff; e-commerce of ideas: `knowledge_worlds.mind` column ready, unwritten |
| 3 | Docs/prompts/prototypes only | The entire [EA-04] surface grammar: conversation+live-map dual view, delta chips, beacons with guesses, decay tiers, re-entry story, theory cards with tallies, "make this real" identity-preserving promotion (also `explore-make-real.html`, staged data), fold-in/split, inline sims, sim-evidence edge labels, watches on explorations, calibration view |
| 4 | Missing | Multi-hop research engine; assumptions ledger; theory critique packs; experiment lifecycle/tracking; user-defined models; external compute/notebooks; free-floating orchestrator research (deliberate, verify-pinned); insights scanner on the clock (DISCONNECTED); depth on 8 of 9 producers (DISCONNECTED) |
| 5 | Build internal | Nearly everything: multi-hop arc over existing primitives; beacon guesses on `loops.ts`; theory-tally view over existing edges; experiment-as-mission; insights cron; embedding coverage; templates-as-data |
| 6 | External API | Only compute: Pyodide (free, first) or E2B/Modal for Python-class modeling; OCR (Textract-class) only if scanned PDFs ever matter; search rails already integrated |
| 7 | Reusable Capability | Web-search research, ingest/retrieval, COMPARE/THEORY instruments, sim records, findBridge — all world-agnostic already |
| 8 | Domain Workshop | Two: Research/Theory Workshop (§5), Simulation Workshop (§6) — both DEEP-ENVIRONMENT |
| 9 | Mission | Multi-hop research arcs; experiments (design→run→verify→close prediction); promotion builds |
| 10 | Standing Order | watch_url source watches (exists); insights proximity scan; world-intel/reflection cadence; re-run-on-new-data for models; outcome-observation pass closing decisions |
| 11 | Requires approval | Publishing/sending anything derived from research (existing spine); new model templates' basis review; promotion charter (one confirm by design); data purchases |
| 12 | Safe autonomous | All of it that stays inward: exploring, filing, embedding, connecting, re-running sims, surfacing threads — this domain is the charter's clearest "Initiative-inward" territory; spend is the only guard (credits already meter every turn) |
| 13 | Portfolio-level | Explorations lens across worlds (docs-only); gardener threads (shipped, the seed); insights scanner as the cross-client pattern-finder; research spend per world; source dedupe across sibling clients |
| 14 | Breaks at 10/100/1k | T-ME: multi-hop absence, 5-formula ceiling, no experiment lifecycle, promotion ceremony unbuilt. T-10: localStorage-held loops/currents, no decay rendering, no explorations lens, embedding coverage, source re-fetching. T-100: silent best-effort filing needs exception surfacing; validated models need cohort distribution; calibration needs to aggregate |
| 15 | Mastery needs | The loop, not more instruments: guesses held → predictions staked → experiments run → outcomes observed on the clock → hit-rate visible → criteria packs editable. Every piece has shipped math or a shipped precedent; none of it is connected end to end |

---

## Matrix rows

| Capability | Class | Evidence | Needed-at | Owner object | Note |
|---|---|---|---|---|---|
| Explorer rabbit holes (turns/clusters/branch/media) | WORKING | [R03 §3] [R13 §6.11] | T-ME | Workshop | 🔌 credit-gated; spike UI, real data model |
| Explore → build brief → app → Room | WORKING | [R06 §13b] | T-ME | Mission | the shipped promotion |
| "Make this real" identity-preserving promotion | PROTOTYPE-ONLY | [EA-04 §10] + prototypes/explore-make-real.html | T-ME | Workshop | data model ready; ceremony unwired |
| Conversation+live-map dual surface | DOCUMENTED-ONLY | [EA-04 §3] | T-ME | Workshop | shipped grammar is drift, not dialogue |
| Beacons with held guesses | PARTIAL | grep: no `beacon`; `loops.ts` | T-ME | Capability | open loops exist; guess+calibration missing |
| Exploration decay/re-entry story | DOCUMENTED-ONLY | [EA-04 §9.2, §12] | T-10 | Workshop | storage never deletes; rendering absent |
| Explorations lens (cross-world) | DOCUMENTED-ONLY | [EA-04 §9.3] | T-10 | substrate | gardener is the shipped seed |
| Free-floating research (no world) | MISSING | orchestratorCases.verify.ts:223 | T-ME | Capability | deliberate, verify-pinned hole; Explore side door exists |
| Multi-hop research engine | MISSING | [R13 §8.13] [R05 §9.20] | T-ME | Mission | all primitives in-house; arcs exist |
| Cited single-hop research (web_search + Serper) | WORKING | [R13 §8.13] [R05 §9.20] | T-ME | Capability | 🔌 Anthropic-only edge; [n]+SOURCES honesty |
| PDF/docx ingest | WORKING | src/lib/docExtract.ts + [R13 §8.6] | T-ME | Capability | was "coming" [R03 §3] — now built; no OCR |
| Builder research persistence | WORKING | aiClient.ts:359–376 | T-ME | Capability | FIXED post-Phase-1; 01-inventory row stale |
| Source management (first-class) | PARTIAL | buildBrief.ts sourcesOf | T-10 | Capability | in-artifact text only |
| Embedding coverage (6/6 subjects) | PARTIAL | [R06 §8 seam 3] | T-10 | substrate | 2/6 written; worker ready |
| Insights proximity scanner | DISCONNECTED | [R06 §8 seam 4] | T-10 | Standing Order | upload-only; machinery exists |
| Depth red-team on all producers | DISCONNECTED | [R03 §2]; producers.ts:544 | T-ME | substrate | 1 of ~9 wired |
| Theory scaffold (falsifier-required) | WORKING | [R05 §9.21] | T-ME | Capability | rejects no-falsifier by name |
| Compare instrument (hinges/discriminators + typed edge) | WORKING | inquiry.ts | T-ME | Capability | |
| Theory cards / evidence tallies | DOCUMENTED-ONLY | [EA-04 §5] | T-ME | Workshop | edges + epistemics shipped; view absent |
| Assumptions ledger | MISSING | grep; [EA-04 §5] | T-ME | Capability | strings in artifacts only |
| Prediction calibration (auto-close) | PARTIAL | mind.ts:142; [R06 §8 seam 2] | T-ME | Standing Order | honest math shipped; manual close |
| Theory critique packs | MISSING | [EA-04 §5]; copyJudge precedent | T-10 | Capability | |
| Lab Bench (5 deterministic templates) | WORKING | lab.ts | T-ME | Workshop | closed-form only; finite-difference sensitivity |
| Parameter sweeps / run compare | PARTIAL | lab.ts:291 | T-ME | Workshop | single-bump only |
| User-defined / domain models | MISSING | lab.ts (templates are code) | T-10 | Capability | templates-as-data direction |
| Experiment lifecycle/tracking | MISSING | [R04 §3.3]; clustering.ts:31 | T-ME | Mission | kinds + sparks + records exist; no loop |
| External compute / notebooks | MISSING + EXT-REQUIRED | grep | T-10 | Capability | Pyodide first; E2B/Modal later; WebContainer in-house asset |
| Sim-evidence edge labeling | DOCUMENTED-ONLY | [EA-04 §6] | T-10 | Capability | record-level honesty shipped |
| Exploration state cloud-held (loops/currents) | PARTIAL | loops.ts; [R05 §9.12] | T-10 | substrate | localStorage; `mind` column ready |
