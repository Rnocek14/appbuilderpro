# 02 — Workshop & Toolchain Model: The Workshop System as an Instrument Problem

*Phase 5.5 capability audit. Subject: the Workshop system itself — not any one craft's domain
gaps (the domain documents own those) but whether the reusable workshop framework can ACQUIRE
THE RIGHT INSTRUMENTS for each craft, and where a craft's instruments are so specialized that
only a deep, purpose-built environment will do. Rubric and formats: `_charter.md`. The grammar
under evaluation: `docs/experience-architecture/16-workshop-system.md`. Citation key: [X16 §n]
= that grammar doc; [RC03] = `docs/reality-check/03-instruments-figma-lens.md`; [RC13 §4 D5] =
the verdict's amendment D5; [A01]/[A03]/[A11] = completed sibling audits 01/03/11 in this
directory; [R03]–[R14] = the Phase-1 reconstruction per charter; [G: …] = a grep performed for
this audit.*

---

## 0. Framing — why this is an instrument problem, not an interaction problem

Three prior documents triangulate the question this one answers:

1. **[X16] specifies the grammar**: six-part anatomy (Bench · Palette · Counsel · Moves ·
   Ledger · Commit rail), nine bench archetypes, the craft loop. It is an interaction and
   governance spec — the charter's non-goals forbid re-litigating it.
2. **[RC03] convicted the grammar of having no hands**: "instruments for judging and
   interfaces for making" — world-class provenance, no cursor, no undo, no editing verb on
   the flagship visual bench. **[RC13 §4 D5]** amended: every bench ships a
   direct-manipulation contract (cursor/selection, real undo, drag/scrub/nudge/inline-edit,
   latency budgets), validated by prototype P3 (`prototypes/workshop-hands.html` [G: exists,
   1,090 lines] — PROTOTYPE-ONLY).
3. **This document asks the third question**: even with the grammar AND the hands, does a
   given craft's workshop hold the right *instruments* — the domain-true data views,
   manipulators, validators, publishers, and meters that let a professional perform the work,
   not merely arrange and judge it? Hands without instruments is a workbench with a vise and
   no tools.

**The code reality underneath, stated once.** The shipped ancestor of [X16] is not the
nine-bench session grammar — it is the **Work-Web area grammar**: `src/lib/garvis/workweb.ts`
defines SEVEN area archetypes (`intel · audience · studio · launch · loop · ledger · vault`)
× seventeen flavors → a verified tools registry, with the binding comment "adding a domain =
adding a template and (maybe) a flavor's tool row — never a new subsystem" [G:
workweb.ts:13–15, 21] [R03 §2]. Around it sit per-flavor bench-like components
(PostcardBoard, SocialBoard, EmailBoard, BrandBoard, IdeaBoard, LabBench, the Builder) [G:
src/components/garvis/canvas/*]. The nine-bench session grammar itself — sessions, Ledger,
Palette, variant sets, criteria packs, commit rail — is DOCUMENTED-ONLY, with one archetype
prototyped (P3, gallery). These two layers must not be conflated: the Work-Web proves the
*composition-by-data* pattern works; the session grammar proposes what each area opens INTO.

---

## 1. How a workshop acquires instruments — six categories, four channels

### 1.1 The six instrument categories

Operationally, a craft's workshop is adequately instrumented when all six categories are
present at the craft's professional bar:

| Category | Definition (operational test) | House examples in code |
|---|---|---|
| **Data views** | renders the craft's material in its native form — if the bench cannot show the truth of the domain (parcels on a map, rows with provenance, a live preview), no other instrument matters | Builder live preview [R03 §1]; prospect pipeline board [R03 §4]; data workspace typed tables [R05 §9.21] |
| **Manipulators** | hand-speed operations that CHANGE material — D5's contract; never wait on a model | agentic editor + branches (code) [R05 §14]; P3's drag/scrub/undo (prototype only) |
| **Generators** | model- or pipeline-backed production of new material (vary, draft, compile, enrich) | campaign generator [R05 §9.6]; compileMailer [R05 §9.24]; 11-stage app pipeline [R05 §12.2] |
| **Validators** | deterministic domain gates that refuse bad work — fail-closed, never advisory | dedupe/do-not-mail [R05 §9.11]; enforceListingHonesty [R05 §9.4]; tsc gate [R05 §12.2]; TCPA gate [R05 §9.24] |
| **Publishers** | how committed work exits — the commit rail's executors, always approval-spined | send-email [R13 §7.1]; social-publish [R13 §9.8]; deploy rail [R13 §5] |
| **Meters** | outcome instruments that close the loop back into criteria | QR/site-events attribution [R13 §7.13]; social-sync [R13 §9.9]; draft_verdicts kept-vs-rewritten [R13 §7.7] |

Mapped onto [X16 §4]'s six-part anatomy: **Bench = views + manipulators. Moves = generators +
validators. Commit rail = publishers. Ledger/criteria/Playbook = meters.** The Palette is a
view of everything already made. This mapping is the audit's working lens: [RC03]'s finding
restated in it is that the spec is rich in generators, meters, and governance, and starved of
manipulators — and this document adds: category-completeness varies BY CRAFT, which is what
the REUSABLE vs DEEP ruling turns on.

### 1.2 The four acquisition channels

A workshop gets instruments through exactly four channels, and which channel a craft needs is
the diagnostic:

1. **Archetype choice** supplies views + baseline manipulators — they ARE the bench. Nine
   renderings exist in the spec; a craft whose material fits one inherits the surface free.
2. **Capability mounting** supplies generators + validators as Moves — a scoped slice of the
   catalog [X16 §4.4]. The Work-Web already does this by data: `TOOL_IDS` registry with the
   rule "adding a tool here without an executor is a verify failure" [G: workweb.ts:82,
   96–103].
3. **Integrations** supply publishers + meters through connectors — the [A11] estate; every
   outbound instrument is an executor behind the approval spine.
4. **Domain packs** supply data, not code — templates, criteria, compliance notes, starter
   recipes, plays (§4).

### 1.3 Instrument supply per bench archetype — what's generic, what isn't

| Archetype [X16 §5] | Framework ships (views + manipulators) | Domain mounts (channels 2–4) | DEEP trigger — when the generic surface cannot carry the craft |
|---|---|---|---|
| `gallery/variants` | image wall, variant sets, lightbox compare, D5 drag/scrub/undo | vary/restyle generators; product templates as pack data; disclosure validators; publish rails | when making needs placement/mask/transform at true dimensions — the [RC03 Attack 12] failure |
| `document` | a real editor, forks, margin apparatus | voice packs, rubric validators, merge data | rarely — text editing is the one generic manipulator that fully exists |
| `board` | cards, columns, regroup, sequence | balance targets and pillar mixes as data; gap-scan | effectively never — boards compose references |
| `map/graph` | nodes, typed edges, evidence columns | citation validators; calibration meters | when nodes are GEOSPATIAL — tiles, polygons, projections are different mathematics, not a graph skin |
| `flow` | diagram, test lane | step executors; dry-run replayer; arm publisher | almost immediately — the instruments are an execution engine, not a rendering (§2.4) |
| `table/dataset` | virtualized grid, segments, per-cell provenance | enrichers, scorers, dedupe/consent validators | effectively never — grids are the most generic surface there is |
| `code+preview` | editor + live runtime | checks, deploy executors | already deep, already built — the existence proof (§2.3) |
| `timeline/planner` | lanes over time, conflict overlay | cadence-evidence joins from the Playbook | effectively never |
| `sim/lab` | run records, parameter sweeps, overlays | model definitions as data; calibration meters | when the simulation needs a real solver (physics, finance engines) — per-model code |

The pattern the table exposes: **views and manipulators are the archetype — they cannot be
mounted, only built.** Generators, validators, publishers, and meters mount as capabilities
and connectors regardless of ruling. So the DEEP/REUSABLE question reduces to one testable
criterion: *does the craft's material render and manipulate on one of the nine generic
surfaces, or does it need a surface (or engine) only that craft family will ever use?*

---

## 2. The central ruling, per craft family

Summary first; each family argued below. "Ruling" uses the charter's binding pair.

| Craft family | Ruling | One-line reason |
|---|---|---|
| Map/GIS territory work | **DEEP-ENVIRONMENT** | tiles, polygon editing, and geo-joins are an engine, not a bench skin |
| Visual design — apparel/production grade | **DEEP-ENVIRONMENT** | making at print fidelity needs a real 2D surface with template geometry |
| Visual design — template-bound (postcard/brand cards) | REUSABLE-FRAMEWORK | the template does the fidelity work; design-as-data compiles (exists) |
| Code (the Builder) | **DEEP-ENVIRONMENT — already built** | the one deep environment in production; proof deep can wear the grammar |
| Automation-flow design | **DEEP-ENVIRONMENT** | dry-run/test/versioned-arm are an execution engine wearing a diagram |
| Research / theory / simulation | REUSABLE-FRAMEWORK | map+table+lab benches are domain-agnostic; mostly WORKING today |
| Campaign planning | REUSABLE-FRAMEWORK | boards compose sibling commits; plays-as-data already models it |
| Data / CRM grids | REUSABLE-FRAMEWORK | one grid serves every craft; gaps are substrate and data buys |
| Content calendars | REUSABLE-FRAMEWORK | one timeline bench serves social, farm cadence, launches |

**The DEEP-ENVIRONMENT list: map/GIS · production-grade visual design · code (built) ·
automation-flow.** Four deep environments for the whole platform is the honest bill — and one
is already paid.

### 2.1 Map/GIS territory work — DEEP-ENVIRONMENT

Already ruled in [A03 §7] and [A11 §2.1/§8]; affirmed here as the charter's canonical case
("do NOT force mapping … into one canvas"). What the generic grammar cannot supply:

- **Tile rendering and a camera** — a `map/graph` bench renders nodes in abstract space;
  territory work needs projected, tiled, zoomable geodata (MapLibre/Mapbox GL — [G] zero map
  libraries anywhere in `src/`, confirmed independently by [A01 §2] and [A03 §1.1]).
- **Polygon/carrier-route drawing with vertex editing** — a manipulator class (snap, split,
  merge boundaries) no generic bench has any analog for.
- **Geo-joins** — point-in-polygon list extraction, tract⇄parcel demographic joins
  (Census ACS), parcel attribute layers (ATTOM/Regrid) — spatial computation, not row
  filtering [A11 §2.1].
- **Choropleth data views** — turnover/absentee/tenure rendered AS geography, with
  drop-history playback per territory [A03 §7].

Everything behind the map — farmMath, rosters, suppression, criteria — reuses the existing
substrate unchanged [A03 §7], which is exactly the deep-environment shape: a specialized
surface over shared machinery, wearing the same six-part grammar (its Ledger records boundary
decisions; its commit rail mints territory artifacts).

### 2.2 Visual design (apparel / brand / postcard) — split ruling, DEEP for the making layer

The one family where the honest ruling splits, and the split follows the instrument lens
exactly:

**Template-bound composition is REUSABLE-FRAMEWORK — and already works.** The postcard is
design-as-data: `compileMailer` encodes USPS 6×9 geometry, bleed, and the address zone; brand
kits and vault photos flow in; honesty gates strip illegitimate imagery [R05 §9.24, §9.4].
The design surface is a form over a template because the template carries the fidelity. This
is why [A03 §6] could rule the whole real-estate marketing workshop REUSABLE-FRAMEWORK with a
straight face — its one missing visual instrument is a print-DPI parity render (level-10 #1,
specced only [R14]), a validator/exporter, not a surface. This document stays consistent with
that ruling.

**Free-form visual making is DEEP-ENVIRONMENT.** The moment the craft is apparel-grade —
place artwork on a garment, scale against a placement guide, mask to a seam, manage
colorways, export production separations — the generic `gallery/variants` bench fails even
WITH D5's hands, because the missing instruments are not drag-and-undo but:

- **Real product templates as first-class geometry** — named print placements, true
  dimensions, colorway slots [X16 §5.1 specs them; code reality: mockup templating MISSING —
  generic gpt-image-1 only [A01 §14]; the buy is Printful's mockup API [A11 §2.3]].
- **Print-dimension fidelity** — DPI-true raster, bleed/safe zones, per-placement export with
  separations; `render-design` rasterizes social sizes only [R13 §8.9] and the print-DPI
  render is specced, unbuilt [R14] [A03 §1.8].
- **Brand-kit tokens enforced at the surface** — palette/type as constraints the manipulators
  obey, not Palette cards the operator remembers (kits exist as data [R05 §9.27]; no surface
  enforces them).
- **Manipulators below sentence granularity** — mask, transform, kern, per-object color:
  [RC03 Attack 12]'s list, verbatim; without them "every adjustment under the granularity of
  a sentence becomes 'generate again'."

The layer ABOVE making — variant walls, tournaments, critique, kill-with-why — remains the
reusable gallery grammar; the deep surface docks under it the way the Builder docks under the
Site Studio [X16 §13.3].

### 2.3 Code (the Builder) — DEEP-ENVIRONMENT, already built

Ruled deep by the grammar itself ("the deepest workshop … uncompromised depth" [X16 §3, §5.7])
and — uniquely — already real: 11-stage generation with a real tsc gate and agentic repair,
conversational edit with review-before-write, feature branches with green-only merge, live
preview, deploy/provision/migration executors behind the approval spine — all WORKING [A01
§18] [R05 §12.2, §14] [R13 §5]. It is also the only bench [RC03] scores as an instrument
("real editor, real runtime, honest speed" — the fast-preview/full-runtime latency split of
[R07 §8.2-as-cited-there] exists only here). Audit significance, twofold: (a) deep
environments are affordable — one has shipped; (b) the Builder is the standing proof that a
deep environment can wear the six-part grammar rather than becoming "a parallel universe with
its own conventions" [X16 §3] — the failure mode the platform already survived once.

### 2.4 Automation-flow design — DEEP-ENVIRONMENT

The `flow` bench [X16 §5.5] is IN the nine, so this ruling needs the sharpest argument: the
archetype's specified instruments are not renderings — they are an execution engine.
Test-on-one requires stepping a live case through a candidate recipe with every decision
visible; **dry-run requires replaying 30 days of history through a recipe that must not fire
exits**; version diff requires recipes as versioned, diffable objects; **arm** requires
staged deploy with autonomy-notch demotion on material edits [X16 §13.5]. None of that is a
canvas — it is a second runtime for automations with a no-side-effects mode. Code reality:
the execution half exists and is strong (trigger engine with window guards, once-only fire
keys, claim-first, consent gates, `trigger_fires` ledger; standing-worker as "the de-facto
second application" [A01 §19] [R03 §8] [R13 §6.3]) but is configured through forms and
registry rows, not designed on any surface ([G] no flow-diagram library in `src/` or
`package.json`); and **automation versioning / staging / test harness / self-repair is
MISSING with no evidence anywhere** [A01 §19, charter-confirmed]. What the generic grammar
cannot supply: recipes as schema-backed versioned artifacts; a shadow-execution engine
(replay without exits); a per-step trace view; staged arming wired into the autonomy ladder.
Domain doc 09 owns the build; the ruling here is that no amount of nine-bench configuration
produces it.

### 2.5 Research / theory / simulation — REUSABLE-FRAMEWORK

The strongest reusable case, because most of it already runs: Explorer/rabbit-holes with
galaxy + cluster cartography, deep cited research, Lab Bench deterministic simulations with
declared assumptions, theory scaffold with required falsifiers, data workspace where every
number is computed — all WORKING [A01 §17] [R05 §9.21] [R13 §8.13]. The instruments are
generic by nature: graph views, evidence tables, run overlays; the validators (citation
required, falsifier required, computed-not-narrated) are domain-agnostic honesty gates the
house already builds well. Domain intelligence enters entirely as data — evidence-quality
criteria, calibration records [X16 §8]. Gaps are wiring, not surfaces: builder research
evaporates into chat (DISCONNECTED [A01 §17]), insights fire only on upload (DISCONNECTED),
and the map⇄table⇄lab handoff ("promote-finding") is documented-only. Sim caveat from §1.3:
a craft needing a real solver buys/builds the solver as a mounted capability — the lab
*surface* stays generic.

### 2.6 Campaign planning — REUSABLE-FRAMEWORK

`board + timeline` composes references to work made in sibling studios; its native moves
(balance, gap-scan, sequence, simulate-cadence) are queries over tagged cards and Playbook
evidence — no specialized surface anywhere [X16 §14]. Code already models the essence as
data: `plays.ts` ordered productions across a web's clusters with slug-stable re-runs, the
3-stage campaign generator with deterministic verifier, the composer producing postcard + 4
posts + email from one form — WORKING [A01 §16] [R05 §9.26, §9.6]. The grammar's one binding
rule — "the campaign workshop composes; it never bypasses the gates of the pieces it
composes" [X16 §14] — is already structurally true on the approval spine. Missing: the board
surface itself and per-channel attribution depth (PARTIAL [A01 §16]) — builds on shared
components, which is what REUSABLE means.

### 2.7 Data / CRM grids — REUSABLE-FRAMEWORK

`table/dataset` is the most generic surface in the nine, and every craft flank uses it
(outreach rows, prospect pipeline, evidence tables, exception lanes). Code reality: working
hand-rolled tables (prospect board with live post-send signals, contacts CRM with activity
timeline, data workspace with typed columns and honest stats [A01 §12, §17]); [G] no grid
library (ag-grid/TanStack) — a real virtualized grid with per-cell-group provenance,
segments, and sample-check is one shared build serving every workshop. The real gaps are
below the surface and already ruled elsewhere: six unreconciled people tables (PARTIAL +
ARCH-CHANGE [A01 §12]) and enrichment data buys [A11 §2.2] — substrate and integrations, not
environment.

### 2.8 Content calendars — REUSABLE-FRAMEWORK

`timeline/planner` renders lanes over time with load/cadence visible; simulate-cadence is a
Playbook-evidence join ("Tuesday sends performed best — 3 replies" [X16 §5.8]). Code
reality: the scheduling RAILS exist and run (content weeks with the platform's one earned-
autonomy loop, marketing schedule → real social rail, segment sends clock-drained [A01 §10]
[R06 §9]) but no calendar/planner surface exists — [G] no calendar library;
`TimelinePanel.tsx` renders transaction checklists, not a planning bench. One timeline bench
serves the social slate, farm mailing cadence, launch plans, and newsletter rhythm — the
definition of a reusable build.

---

## 3. The worked toolchain — direct mail as the instrument relay (the template)

The charter's template chain, [A03 §1]'s sixteen steps restated through the instrument lens.
**Statuses, evidence, and break points are [A03 §1]'s verbatim rulings — this table stays
consistent with that audit and cites it per row**; what this document adds is the instrument
category and bench each step demands (the bracketed annotation in the Step column).

| Step | Status | Evidence | Build/Buy | Owner object | Approval posture | Portfolio surface | Breaks at |
|---|---|---|---|---|---|---|---|
| 1. Territory selection [view+manipulator · map DEEP] | MISSING + EXT-REQUIRED | [A03 §1.1]; [G] no map lib | Buy tiles (MapTiler/Protomaps), build geo canvas [A11 §2.1] | Workshop (deep: map) | none | territory lens across clients | T-ME — step doesn't exist |
| 2. Prospect discovery [generator · table] | PARTIAL + EXT-REQUIRED | [A03 §1.2]; CSV-only [R05 §9.11] | Buy ATTOM/DataTree | Capability | approve (spend) | data-freshness check | T-ME for automation |
| 3. Source/permission check [validator · table] | PARTIAL | [A03 §1.3]; do_not_mail fail-closed, no provenance/licensing | Build provenance cols; Buy DNC scrub | substrate + Standing Order | approve | no-provenance-blocks-merge rule | T-10 |
| 4. Enrichment [generator · table] | PARTIAL + EXT-REQUIRED | [A03 §1.4]; isAbsentee honest-only | Buy ATTOM/Estated | Capability | slate | coverage % lens | T-ME |
| 5. Dedup [validator · table] | WORKING | [A03 §1.5]; householdKey verified [R05 §9.11] | done | Capability | none | — | holds to T-1K |
| 6. Segmentation [manipulator · table] | PARTIAL | [A03 §1.6]; farmMath screens, no behavioral segments | Build atop step 4 | Workshop bench (table) | none | cohort recipe rollout | T-10 |
| 7. Campaign ideation [generator · document/board] | WORKING | [A03 §1.7]; 3-stage generator [R03 §6], plays.ts | done | Workshop | none | campaign calendar lens | T-100 (play versioning) |
| 8. Postcard design [view+manipulator · template-bound gallery] | WORKING | [A03 §1.8]; compileMailer USPS-true [R05 §9.24]; print-DPI render specced-only [R14] | Build print-DPI render | Workshop bench → Artifact | approve | — | T-10 — ends in a browser print dialog |
| 9. Variable-data merge [generator+validator] | PARTIAL → MISSING at scale | [A03 §1.9]; address block fail-closed only | Build per-piece merge + token table | Capability | none | — | T-ME beyond address block |
| 10. CASS validation [validator] | MISSING + EXT-REQUIRED | [A03 §1.10]; farm.ts:38 self-declares the gap | Buy Lob verify/Smarty | Capability (gate) | none (fail-closed) | undeliverable-rate check | T-ME |
| 11. Approval [publisher gate] | WORKING (manual) / MISSING (`send_mail` kind) | [A03 §1.11]; spine real, no mail executor | Build kind + cost-ceiling executor [R14] | Mission step | approve | daily drop slate | T-10 |
| 12. Print/mail handoff [publisher] | MISSING + EXT-REQUIRED | [A03 §1.12]; "Garvis never mails" [R05 §9.4] | Buy Lob (specced) | Capability behind executor | approve → earned | spend-anomaly check | T-ME — the #1 gap |
| 13. Delivery status [meter] | MISSING + EXT-REQUIRED | [A03 §1.13]; webhooks on paper only [R14] | Buy Lob webhooks | substrate + Standing Order | none | failed-pieces exceptions only | T-ME |
| 14. Response attribution [meter] | PARTIAL 🔌 + EXT-REQUIRED (calls) | [A03 §1.14]; QR `?src=postcard` real [R13 §7.13]; no call numbers | Build tokens; Buy Twilio numbers | Capability + ledger | none | response-rate lens | QR to T-100; calls T-ME |
| 15. Follow-up [publisher+generator · flow] | PARTIAL 🔌 | [A03 §1.15]; speed-to-lead real; SMS enum-dead [R06 §15 #0] | Build enum line; call cadences | Mission + Standing Order | approve → earned | due-follow-ups slate | T-10 |
| 16. Outcome learning [meter → criteria join] | PARTIAL | [A03 §1.16]; logMailBatch honest; no drop-over-drop model | Build cohort→farmMath join | ledger + Standing Order | none | cohort creative compare | T-10 |

**What the chain teaches about the workshop SYSTEM (the template insight domain docs should
copy):**

1. **A real toolchain is a relay across benches, not one room.** Sixteen steps traverse map
   (1) → table (2–6) → document/board (7) → gallery (8–9) → gate (10–11) → publishers
   (12) → meters (13–14) → flow (15) → ledger (16): five archetypes and one deep
   environment. The instrument that carries the baton between them — [X16 §5.6]'s
   `export-to-craft`, a segment landing in a sibling workshop's Palette — is therefore
   load-bearing platform machinery, and in code it exists only as hard-wired seams (the
   composer's one-form fan-out [R03 §6]; campaignCore [R05 §9.6]). Generic export-to-craft:
   DOCUMENTED-ONLY.
2. **The chain's category census is the diagnosis.** Validators and generators are the
   house's strong suits (steps 5, 7, 8 WORKING; the fail-closed pattern best-in-corpus
   [A03 §1 verdict]). Every publisher and meter past the QR pixel is MISSING — and those are
   integration instruments (channel 3), invisible to any amount of bench design. The
   workshop question for this chain was never the canvas; it is instrument supply at the
   edges — consistent with [A03]'s split: "everything up to the moment something must touch
   the physical world … is real."
3. **Only two steps demand deep surfaces** (1 and, at production grade, 8) — the other
   fourteen ride the reusable framework. That ratio generalizes: deep environments are rare,
   expensive, and decisive; everything between them is configuration over shared machinery.

---

## 4. How domain intelligence enters a workshop — data requirements, not philosophy

[X16] narrates domain expertise as stance and counsel; operationally it must arrive as three
data forms plus one honest exception:

**4.1 Packs — frozen expert defaults, shipped as rows.** Template sets (garment mockups with
named placements and dimensions; ad slots [X16 §5.1]), compliance notes, starter criteria,
starter recipes for born-automated crafts [X16 §13.5], plays, expertise seeds. The pattern is
PROVEN in code: `verticals.ts` real-estate overlay with mid-2026-verified Fair Housing/HUD
rules, `expertise.ts` seed packs, `plays.ts`, the Mom template — all data, zero new
subsystems [A03 §0] [R05 §9.14]. Gap: packs are static strings with no update mechanism when
law or platform rules change (breaks at T-100 [A03 §3]).

**4.2 Criteria — versioned judgment, owned by the operator.** 4–8 named criteria with a
keep-bar, seeded by the pack, sharpened by outcomes, every score naming its pack version
[X16 §8]. Code reality: the anti-slop bar EXISTS as hard-coded judgment (board-copy judge
≥8 fail-closed [R05 §9.4]; bespokeHonest; evidence-quality prompts) — but a criteria-pack
OBJECT (named, versioned, editable, score-carrying) exists nowhere: DOCUMENTED-ONLY. This is
the single highest-leverage build in the workshop system, because it is what converts domain
intelligence from prompt text into an auditable instrument.

**4.3 Outcome joins — the queries that close the loop.** Annotation of artifacts with result
rows, flowing back to the sessions and criteria that made them [X16 §8, §10]. The meters
exist piecemeal (draft_verdicts kept-vs-rewritten — a real learning loop [R13 §7.7];
social_post_metrics; results-by-channel honest row counts; content-week streaks) but the JOIN
— outcome → artifact → session decision → criterion standing — is MISSING; decision outcomes
close manually [R06 §8] [A01 §0]. Without it, criteria never learn and the Playbook stays
hand-fed.

**4.4 The exception that defines the ruling.** When a craft's intelligence CANNOT be
expressed as packs + criteria + joins — because it is computation (geodesic joins, color
management, flow replay semantics, type rendering) — that is precisely the DEEP-ENVIRONMENT
signal of §2. The rule of thumb for every future domain doc: *if the domain expert's
knowledge fits in rows, the craft is REUSABLE; if it needs an engine, it is DEEP.*

---

## 5. Standing up a NEW workshop — what is config, what is code

[X16 §12] promises "open a workshop for X" in one confirm for crafts no genome anticipated.
Audited against code, the composition stack splits cleanly:

| Layer | Config or code | State today | Evidence |
|---|---|---|---|
| Area charter (archetype + flavor + status + refs) | **config** | WORKING — `makeCharter`, jsonb on clusters | [G: workweb.ts:42] [R03 §2] |
| Verb mounting with executor contract | **config-with-contract** | WORKING at area level — TOOL_IDS registry, verify-enforced | [G: workweb.ts:96–103] |
| Web templates a mission instantiates | **config** | WORKING — templates spawn whole area webs | [G: workweb.ts:180+] [A03 §0] |
| Domain packs / plays / compliance | **data** | WORKING pattern | [R05 §9.14, §9.26] |
| The nine bench renderers | **code, built once each** | 2 of 9 credible (code+preview WORKING; sim/lab WORKING); map/graph partial (Explorer); table partial (hand-rolled); gallery/document/board/flow/timeline: per-flavor components or absent | [A01 §17–18]; [G: canvas/*] |
| D5 manipulation substrate (undo, drag, scrub, latency) | **code, once, under all benches** | PROTOTYPE-ONLY (P3) | [G: prototypes/workshop-hands.html] [RC13 §4 D5] |
| Session substrate (Ledger, Palette gather, park/resume, driver stamps) | **code, once** | DOCUMENTED-ONLY — `mind_events` + `compileSituation` are adjacent seeds | [A01 §0] [R05 §9.15] |
| Criteria-pack object + critique surface | **code once + data per craft** | DOCUMENTED-ONLY (judges hard-coded) | §4.2 |
| Commit rail (four exits, unified) | **code, once** | PARTIAL — approvals spine + artifacts + missions real; the unified rail with provenance-to-session is not | [R03 §2] [A01 §0] |
| Deep surfaces (geo, design, flow engine) | **code, per craft family** | 1 of 4 built (Builder) | §2 |

**The verdict on composition.** The Work-Web layer already IS a workshop composer — for
areas: adding real estate or an app launch is a template plus tool rows, exactly as [X16
§12]'s proposal card imagines, and it ships. But at the SESSION-bench layer, every existing
bench-like surface is a bespoke React component (PostcardBoard, SocialBoard, LabBench…), so
composing a new craft's bench today means writing code — the "second assembly" [X16 §12]
forbids. Classification of "open a workshop for X": **DOCUMENTED-ONLY + ARCH-CHANGE** — the
structural change being the inversion from per-flavor components to nine configurable
archetype renderers + one session substrate that per-craft config parameterizes.

**The sequence for an undefined future craft (jewelry, grant writing, podcast production),
once the substrate exists:** (1) archetype choice — config, one confirm; (2) verb mounting
from the catalog by craft affinity — config against the executor contract; (3) starter
criteria + nearest domain pack — data, labeled provisional; (4) palette wiring — queries
over the world's memory; (5) refinement through use — Ledger-recorded, no settings page;
(6) distillation through the human gate [X16 §12.3]. And one binding behavior the composer
must have: when the craft's material does NOT render on any of the nine (a new geometry, a
new runtime), the honest proposal is "nearest bench + named gap," never a faked deep
environment — the anti-generic invariant applied to composition itself. That is how the
tenth deep environment gets discovered: by the composer refusing, with a reason, in
writing.

---

## Matrix rows

| Capability | Class | Evidence | Needed-at | Owner object | Note |
|---|---|---|---|---|---|
| Work-Web area grammar (7 archetypes × flavors → verified tool registry) | WORKING | [G: workweb.ts] [R03 §2] | T-ME | substrate | the shipped composition-by-data proof |
| Six-part session anatomy (Bench/Palette/Counsel/Moves/Ledger/rail) | DOCUMENTED-ONLY | [X16 §4]; no session object in code | T-ME | Workshop | the grammar itself, unbuilt |
| Bench manipulation substrate (D5: undo, drag, scrub, latency budgets) | PROTOTYPE-ONLY | prototypes/workshop-hands.html; [RC13 §4 D5] | T-ME | substrate | built once, under all nine benches |
| Session Ledger + driver stamps + resumable story | DOCUMENTED-ONLY | [X16 §4.5]; mind_events adjacent [A01 §0] | T-ME | substrate | the delegation instrument |
| Criteria-pack object (named, versioned, editable, score-carrying) | DOCUMENTED-ONLY | [X16 §8]; judges hard-coded [R05 §9.4] | T-ME | substrate | converts judgment from prompt to instrument |
| Outcome → criteria learning join | MISSING | meters exist [R13 §7.7]; join nowhere [R06 §8] | T-10 | substrate + Standing Order | packs/criteria stay hand-fed without it |
| Gallery/variants bench (variant sets, tournament, compare) | DOCUMENTED-ONLY | boards are single-shot generators [R05 §9.4]; P3 prototypes it | T-ME | Workshop | boards WORKING as generator surfaces only |
| Document bench (living doc + forks + rubric dock) | PARTIAL | copyStudio/DeliverableStudio real [A01 §11]; no fork/critique apparatus | T-ME | Workshop | closest generic bench to done |
| Board bench (cards, balance, gap-scan) | MISSING | no board-composition surface; plays-as-data adjacent [R05 §9.26] | T-10 | Workshop | shared build; serves campaign + social + lineup |
| Map/graph bench (claims, evidence columns, calibration) | PARTIAL | Explorer galaxy + theory scaffold WORKING [A01 §17] | T-ME | Workshop | evidence-columns + prediction registry missing |
| Flow bench + dry-run/test-on-one/versioned arm | MISSING | no flow lib [G]; versioning/test harness no-evidence [A01 §19] | T-10 | Workshop (deep) | an execution engine, not a rendering |
| Table/dataset bench (virtualized grid, segments, cell provenance) | PARTIAL | hand-rolled tables WORKING [A01 §12, §17]; [G] no grid lib | T-10 | Workshop | one shared grid serves every craft |
| Timeline/planner bench (lanes, cadence, overlay compare) | MISSING | [G] no calendar lib; TimelinePanel = checklists only | T-10 | Workshop | serves social, farm cadence, launches |
| Sim/lab bench | WORKING | LabBench deterministic [R05 §9.21] | T-ME | Workshop | honest-assumptions pattern already right |
| Code+preview deep environment (the Builder) | WORKING | [A01 §18] [R05 §12.2, §14] | T-ME | Workshop (deep) | the existence proof for DEEP-in-grammar |
| Geo/territory deep environment | MISSING + EXT-REQUIRED | [G] no map lib; [A03 §7] [A11 §2.1] | T-ME | Workshop (deep) | tiles bought, canvas built |
| Production design surface (placements, print fidelity, brand tokens) | MISSING + EXT-REQUIRED | render-design social-only [R13 §8.9]; print-DPI specced [R14]; mockups via Printful [A11 §2.3] | T-10 | Workshop (deep) | template-bound compile is the T-ME floor |
| Automation-flow deep environment (recipe objects + shadow replay + staged arm) | MISSING | trigger engine WORKING [R03 §8]; design/test layer absent [A01 §19] | T-10 | Workshop (deep) | domain doc 09 owns the build |
| Export-to-craft relay (segment → sibling Palette) | PARTIAL | hard-wired seams only: composer fan-out [R03 §6], campaignCore [R05 §9.6] | T-10 | Capability | the baton of every multi-bench toolchain |
| Unified commit rail (→Artifact/Mission/Automation/hand-off + provenance) | PARTIAL | approvals + artifacts + missions real [R03 §2]; unified rail + session provenance docs-only | T-ME | substrate | gates exist; the ceremony and provenance don't |
| Grounded session open (Palette gather pre-run) | PARTIAL | compileSituation digest WORKING [R05 §9.15]; per-workshop staging absent | T-ME | substrate | anti-generic invariant's delivery vehicle |
| Workshop composer ("open a workshop for X" in one confirm) | DOCUMENTED-ONLY + ARCH-CHANGE | [X16 §12]; benches are bespoke components [G: canvas/*] | T-100 | substrate | requires archetype-renderer inversion |
| Learned-workshop distillation (definition → genome via gate) | DOCUMENTED-ONLY | [X16 §12.3] | T-100 | substrate | provenance-carrying genome growth |
