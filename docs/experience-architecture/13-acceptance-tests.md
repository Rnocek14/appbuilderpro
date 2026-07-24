# 13 — Acceptance Tests: The Exit Exam for the Experience

*Phase 3, Experience Architecture. Elaborates the constitution end to end — every test below is
a constitution clause made falsifiable. The operating model's model-level tests (operating model
§7) check the objects; these check the experience built on them. Nothing here introduces new
design; a test that seems to demand something the documents don't specify is a defect in those
documents, and the dispute goes to `14-open-decisions.md`, never into a quiet local fix.*

---

## 0. How these tests are used

**What a test is.** Each test names a property the experience must have, a concrete setup that
puts the property under load, an observable pass condition, an explicit fail condition, and the
documents and surfaces it binds. "Binds" means: those documents may not ship a design, and those
surfaces may not ship a build, that fails the test. A test failure is a blocking defect, not a
backlog item.

**When they run.** Three checkpoints, same tests, rising fidelity:

1. **Wireframe review** (against `12-wireframes.md`): the test is run as a walkthrough — every
   pass condition must be *depicted or deducible* from the frames. A wireframe that cannot show
   where the pass condition lives fails now, cheaply.
2. **Interactive prototype**: the test is run with a stopwatch, a script, and a second person as
   the naive operator.
3. **First build**: the test is run instrumented — counts, timers, marker strings, and audit
   scripts as specified per test. From this point the suite is regression: it runs before any
   release that touches a bound surface.

**Measurement discipline.** Every pass condition is stated so a designer, a tester, or a script
can decide it without argument: a count, a time, a freeze-frame question with one right answer,
or a marker-string search. Where a test needs seeded data, the seed is part of the test. Where a
threshold appears (60 seconds, one tap, two minutes), the threshold is binding until
`14-open-decisions.md` revises it with evidence.

**The cast.** Tests reuse the canonical worlds so setups stay concrete: *Jane's Bakery* (website
client), *Rossi Plumbing* (second client), *Mom's Real Estate* (family business), *the brother's
art world*, *the apparel venture*, *the bee-hives rabbit hole*, *the agency world* that serves
the clients.

---

## 1. The core suite

### AT-01 · No Second Assembly

**Anchors:** constitution §11; operating model §7.2; principles P14.

**Setup:** The operator chartered Jane's Bakery from the client setup and hand-edited it: removed
the Reviews area, set follow-up cadence to 4 days. Two weeks later a close-won event fires for
Rossi Plumbing (and, in a second run, the utterance "I just signed another website client, Rossi
Plumbing" is typed instead — both births must pass). Define an **assembly action** as any of:
adding or removing an area, mounting a verb, setting a cadence or budget, wiring a connection
type, naming a lens, or re-entering a fact the system already holds.

**Pass:** The Proposal for Rossi arrives pre-assembled from the proven stack, showing provenance
("based on your client setup ×2") and *already reflecting the operator's repeated edits* when
they were made twice (offered as a pattern update through the gate, never silently absorbed).
The count of **mandatory** assembly actions between utterance and Charter is exactly zero — the
one confirm is the only required act; every Proposal line is editable but none demands editing.
Connection grants are pre-staged asks, not re-designed wiring. Run the birth a third and tenth
time: the count stays zero and the provenance count climbs.

**Fail:** Any assembly action performed on Jane's world must be repeated for Rossi's; the
Proposal arrives generic and ignores the operator's established pattern; the pattern updates a
derived world without a proposal; or intake re-asks anything the funnel already produced (the
scrape, the audit, the thread history must be in the newborn world).

**Binds:** documents 09 (creation), 01 (P14), 03 (dressing/layering), 15 (blueprint). Surfaces:
the Bar, the interpretation chip, the Proposal, the Charter, intake-as-next-moves.

---

### AT-02 · The Hundredth World

**Anchors:** constitution §4, §10; operating model §7.4, §5.

**Setup:** Seed an account to 100 worlds: 40 client worlds (12 healthy-quiet, 3 blocked, 1
glowing), 30 dormant curiosities, 15 prospects, 10 running automation worlds, 5 ventures. Then
charter world 101 and use the product for a scripted hour.

**Pass:** Fixed chrome is pixel-identical to a 5-world account — the Bar, the Pulse, the context
header, nothing more. Home is the same height: the Field renders only attention-worthy worlds
(alive/warn/blocked/glowing), compresses healthy-quiet, and renders no dormant world; total
prominent orbs stay within the attention band regardless of inventory. There is exactly one
Queue. World 101 appears as a row in the client lens and nowhere else new — zero new navigation
items anywhere. Reaching any of the 100 worlds by name or meaning through the Bar or switcher
takes the same gesture count as at 5 worlds. "How's Rossi doing?" asked from inside the apparel
world is answered from real rows without leaving it.

**Fail:** Any chrome element that exists only because world count grew; a second queue, inbox,
or notification center; Home scroll length proportional to inventory; a dormant world rendering
uninvited; any per-world navigation entry; switcher search that degrades to paging through a
list.

**Binds:** documents 02 (shell), 08 (multi-world), 04 (dormancy), 11 (IA). Surfaces: Home (the
Brief, the Field, Continue), the switcher, Lenses, the Queue, the Bar.

---

### AT-03 · Context Clarity

**Anchors:** constitution §13, §3; principles P7, P9.

**Setup:** A scripted ten-minute run with freeze-frames: Home → route to Jane's world via the
Bar → open the Outreach Studio, start drafting → open the Queue overlay → approve an item
belonging to Mom's Real Estate → dismiss → keep drafting → hand off "5 more like this" to a
worker → switch to the apparel world. A second tester calls "freeze" at eight unannounced
moments.

**Pass:** At every freeze-frame two questions have instant, agreeing, on-screen answers: "Where
am I?" (context header) and "Where will my words act?" (the Bar's scope chip) — they can never
disagree and neither is ever absent inside a world. Every surface where the AI acts — the Bar,
the Counsel, the worker's run row, every Queue item — carries its scope chip (world +
counterparty). Approving Mom's item from inside Jane's world never changes place; dismissal
restores the exact editing state. Scope changes only by explicit act, and the change is visibly
announced by the chip before commit (the interpretation chip shows cross-scope routing before it
happens). "What do you know here?" typed to any Counsel produces its honest context manifest —
which scoped memory, which playbook, which grants it is drawing on.

**Fail:** Any freeze-frame where place or scope requires memory or a click to answer; a routed
utterance that acts in a scope the chip did not show; a Counsel whose manifest omits a source
its output demonstrably used (checked against the flight recorder); a Queue item without a world
stamp.

**Binds:** documents 02, 03, 16, 06. Surfaces: context header, scope chip, interpretation chip,
Counsel, Queue items, worker run rows, flight recorder.

---

### AT-04 · Cross-Client Isolation

**Anchors:** constitution §13, §10; operating model Counterparty + isolation contract.

**Setup:** The agency world serves Jane's Bakery (client A) and Rossi Plumbing (client B), each
with a counterparty and isolation contract. Seed A's world with distinctive marker strings in
its contacts, drafts, pricing, and thread history. Open the client-pipeline lens showing both.
Then: (1) work in B's world for an hour, including asking the Counsel to "write a testimonial
section like Jane's"; (2) run a bulk follow-up action from the lens across five clients; (3) in
the apparel world, ask to use the brother's artwork on a shirt.

**Pass:** The lens renders each counterparty's data only inside its own row; no roll-up,
compare, or summary composes A's data into B's cells. Every generation in B's scope is
marker-clean: a search of B's outputs, drafts, and flight-recorder context lists finds zero A
markers. The Jane-testimonial request is refused-with-path: the Counsel names the boundary and
offers the grant flow; the grant, once made, is listed on **both** worlds' Faces, is revocable
in one gesture, and every granted use carries a provenance chip. Revoking the grant stops the
next use. The bulk action stages per-world approvals, each Queue item carrying only its own
world's data and gate. The brother's artwork enters the apparel bench only through an
authorization from the art world, provenance chip attached on every placement.

**Fail:** Any A marker in B-scoped output or context; a lens cell mixing counterparties; a
cross-world reference that works without a grant; a grant invisible on either Face; a bulk
action that approves as one undifferentiated blob; revocation that leaves a live reference
working.

**Binds:** documents 08, 07 (grants and reuse), 06 (per-client automations), 03 (the Face), 17
(pattern promotion). Surfaces: Lenses, the Queue, the Counsel, the Palette, Faces, provenance
chips.

---

### AT-05 · Exploration Preservation

**Anchors:** constitution §7; operating model §7.3, D5–D6; anti-goal "Explore never a
disposable chat."

**Setup:** Grow the bee-hives rabbit hole across three weeks of sessions: a map of ~40 nodes,
six parked beacons, two competing hypotheses with evidence edges, three artifacts (a diagram, a
dataset, a sim run), several threads. Then: (1) abandon it untouched for a month; (2) return;
(3) say "this could be a business — a pollination-audit service for orchards," and charter the
promotion.

**Pass — the disposability half:** Nothing in Explore ever asked to be saved (no save control
exists); every session's map, branches, and beacons are in the world's memory automatically.
After the idle month the world is dormant — absent from the Field, findable by meaning — and
returning renders the full map exactly as left, beacons still open and listed.

**Pass — the promotion half:** Promotion is proposal → charter, experienced as the world growing
around the map: after charter it is the *same world* (same identity, same map in place as the
knowledge core), with operating areas newly mounted around it. Audit: every node, beacon,
hypothesis, artifact, and thread reachable before promotion is reachable after, by the same
references; the count of re-entered facts, copies, and exports is zero. The proposal states
what mounts, what it asks, what it costs — and nothing it lists is a migration.

**Fail:** A save/export/copy step anywhere; any pre-promotion object unreachable or re-parented
into a "new" container; discoveries living only in a chat transcript; a promotion that ends in
an empty Desk with the exploration "linked" from elsewhere; deletion of anything, ever.

**Binds:** documents 04, 09, 03. Surfaces: the Explore map, beacons, the Proposal, the Charter,
the Desk after promotion, world memory search.

---

### AT-06 · One-Minute Creation

**Anchors:** constitution §11 (pipeline + ceremony ladder); principles P4, P5.

**Setup:** Stopwatch, three utterances at three rungs, a naive operator reading everything
presented: (a) curiosity — "why do coral reefs bleach?"; (b) venture — "start a clothing brand
around desert motifs"; (c) client/money — "I signed Rossi Plumbing, $500/mo, website plus
missed-call textback."

**Pass:** (a) First substantive response within 5 seconds, zero prompts, zero confirmations,
zero naming — the containing world materializes silently and is discoverable later by meaning.
(b) The Proposal renders and one confirm charters; utterance-commit to an inhabitable Desk —
staged first moves, zero decisions to start — in under 60 seconds including reading time.
(c) The Proposal includes automations with cadence and cost, intake it will ask, and the
explicit connection grants it needs; charter completes in under 60 seconds of active
interaction; grant asks and intake arrive as the Desk's first staged moves, so the world is
inhabitable immediately even while external connections finish; no form wizard exists on any
path.

**Fail:** Any wizard or multi-step form; any mandatory field beyond the single confirm at rungs
b/c; a blank world on arrival ("what would you like to do?" is an automatic fail); rung-a
curiosity interrupted by any ceremony; a chartered client world whose connections were silently
inherited rather than granted.

**Binds:** documents 09, 02 (the Bar), 10 (journeys), 01 (P4/P5). Surfaces: the Bar, the
interpretation chip, the Proposal, the Charter, the Desk's staged first moves.

---

### AT-07 · Manual-to-Autonomous Continuity

**Anchors:** constitution §6 (drive-mode continuity); operating model D3, §7.7 (gate test).

**Setup:** One Outreach Studio session in Mom's Real Estate, four beats: (1) the operator drafts
two follow-ups by hand; (2) asks the Counsel for one more; (3) hands off — "ten more like #3
overnight, per the ledger"; (4) next morning, promotes the pattern — "do this weekly."

**Pass:** All four beats happen in one environment — the same session, the same Bench, no
interface switch at any beat. The Ledger interleaves rows attributed to hand, Counsel, worker,
and clock, each stating who did what and why. The overnight worker demonstrably continues the
*same session*: its outputs cite the ledger decisions (tone choice, excluded contacts) and land
on the same Bench for morning review. The weekly automation is created from the session's
commit rail, references the session as its recipe, and appears with its heartbeat trace from
day one. Taking back the hand mid-run is one gesture, and the Ledger records the takeover. The
gate check rides along: at every beat, sending crosses the same approval gate — hand-sent,
asked-for, delegated, and scheduled sends all produce identical Queue items; no drive mode
reaches the exit another mode gates.

**Fail:** Delegation opens a different surface or loses session context; automation is
configured in a separate builder with no ledger lineage; the worker's output arrives as a
disconnected batch; any drive mode bypassing the gate; the slider presented as a mode switch
that changes rooms.

**Binds:** documents 05, 16, 06. Surfaces: Workshop (Bench, Counsel, Ledger, commit rail),
worker run rows, the Queue, heartbeat trace.

---

### AT-08 · Specialized-Tool Depth

**Anchors:** constitution §9, §6 (the Builder), §15 anti-goal "no flattening of deep tools."

**Setup:** Two task-parity gauntlets, each a written list of tasks a competent standalone tool
performs natively. **Builder gauntlet** (against a Lovable-class app builder): open a client
site from its artifact frame; navigate files; make a code edit with diff; see the live preview
update; branch, compare branches; add a dependency; deploy — through the world's gate. **Apparel
gauntlet** (against a standalone design tool): generate a variant set from a brief; constrain
("more luxury, same palette"); run a tournament compare; score against the craft criteria;
place-on-product; export production-ready assets via the commit rail.

**Pass:** Every gauntlet task completes without leaving the bench and without a generic editor
interposing. Both benches keep the full six-part grammar — Bench, Palette, Counsel, Moves,
Ledger, commit rail — and gain the world's context (the Palette carries brand assets, playbook,
prior artifacts) that the standalone tool lacks. Deep artifacts open their real environments
from the frame; nowhere does a site or app flatten into a thumbnail card with a rename field.

**Fail:** Any gauntlet task that requires exporting to an external tool; a "preview only"
rendering where the standalone tool would edit; a deep bench missing Ledger or commit rail
(depth without the grammar fails too); one generic editor pretending to edit two kinds.

**Binds:** documents 07 (artifacts and the Builder), 16 (bench archetypes), 05. Surfaces:
artifact frame, the Builder bench, the gallery bench, the Palette, commit rail.

---

### AT-09 · Return After Thirty Days

**Anchors:** constitution §4, §6 (sessions), §8; the anticipation doctrine.

**Setup:** Freeze a working account for 30 days with life ongoing: two automations running (one
develops a failure in week 3), a mission parked waiting on approval, a client reply arrived, the
bee-hives exploration dormant, an apparel session mid-critique. Return, stopwatch running.

**Pass:** Home tells the gap as a story: the Brief narrates what happened, what changed, what
needs you, what's running — every sentence evidence-linked, automated activity digested with
real counts ("34 follow-ups sent, 3 replies — these rows"), and the week-3 failure named, not
smoothed over. The Queue's top item is the blocked mission with its whole decision inline. The
Continue rail resumes the apparel session *pre-dressed*: the Ledger's story on screen — variants,
critiques, the last decision and its why — never a blank canvas. Time from opening the product
to a first informed action (approving the blocked step) is under two minutes, with zero
archaeology — no hunting through worlds to reconstruct state.

**Fail:** A dashboard of cards instead of the Brief; a "welcome back" empty state; any Brief
sentence that doesn't tap through to rows; a resumed session that lost state or lands on an
empty bench; the failed automation absent from both Brief and Queue; the dormant exploration
rendered as clutter (it must stay dormant — quiet is also part of honest).

**Binds:** documents 02 (Brief, Continue), 06 (digests, silence-is-loud), 16 (Ledger, session
resume), 10 (journeys). Surfaces: the Brief, Continue rail, the Queue, the Ledger, heartbeat
traces.

---

## 2. The implied suite — constitution clauses made falsifiable

### AT-10 · Recurring Work Stays Visible

**Anchors:** constitution §8 ("a trust invariant, not a preference"); principles P10.

**Setup:** A weekly content automation runs cleanly for eight weeks in Jane's world; its class
earns auto-approval in week 5. In week 9 its connection breaks so it stops producing. Meanwhile
its outputs (posts, sends) appear across the Desk, artifact frames, and the Brief.

**Pass:** Everywhere an output appears, the producing automation's heartbeat trace is one tap
away: last ran, next run, what it did, what it sent. Pause is one gesture from any of those
places. The auto-approval dial was *offered by the Queue* after the clean streak, is revocable
in one gesture, and every auto-approved action since week 5 sits in the ledger view. When the
automation stops in week 9, silence is loud: a Queue item within one missed heartbeat, the
Pulse's clock-health reflects it, and the next Brief says it plainly. At no point does knowing
"what runs on its own here?" require a settings page — the Desk and Face answer it.

**Fail:** Any output more than one tap from its trace; a stopped routine that stays silent
anywhere (Brief, Queue, or Pulse missing it fails the test); auto-approved actions vanishing
from the ledger; pause buried in configuration; recurring work discoverable only by remembering
it exists.

**Binds:** documents 06, 02 (Pulse), 05 (earned autonomy). Surfaces: heartbeat trace, the
Queue, the Pulse, the Brief, the Desk, the autonomy dial and its ledger view.

---

### AT-11 · Every Claim Taps to Rows

**Anchors:** constitution §4 (Home rules), §3 (the Pulse never fakes urgency); No-Theater;
principles P9.

**Setup:** An audit pass across one week of generated surfaces: every Brief, every Face vital,
every Pulse count, every mission state label, every outcome annotation. Include one genuinely
quiet night.

**Pass:** One hundred percent of sampled claims survive "which row is that?" — every sentence,
count, glow, and health vital taps through to the real rows that justify it. The Pulse's counts
equal the Queue's contents exactly. The quiet night produces a Brief that says it was quiet (or
sends nothing) — never padding. Calibration records are honest: where predictions exist, the
hit-rate shown matches the closed outcomes. Zero decorative numbers exist anywhere in the
product.

**Fail:** Any claim, count, or glow that cannot produce its rows on tap; a Pulse count that
disagrees with the Queue; manufactured urgency or filler insight on a quiet day; a health vital
computed from nothing the operator can inspect.

**Binds:** documents 02, 03, 06, 12 (every wireframe must show the tap-through affordance).
Surfaces: the Brief, Faces, the Pulse, mission spines, outcome annotations, Playbook evidence.

---

### AT-12 · The Ceremony Ladder Holds at Both Ends

**Anchors:** constitution §11 (binding ladder); principles P4.

**Setup:** Four utterances, one per rung, each measured for prompts, confirmations, forms, and
named asks: curiosity ("what makes glass frogs transparent?"), venture ("build a tiny app for
tracking my reading"), client/money ("set up Rossi as a paying client"), counterparty-with-
isolation ("run Mom's real-estate business alongside my agency").

**Pass:** The ladder is exact and monotonic. Curiosity: zero prompts, zero confirms, zero
naming, nothing to dismiss. Venture: exactly one confirm. Client/money: proposal plus explicit
connection grants — and *not less*: a money world chartering without its grant asks fails just
as hard as an over-asked rabbit hole. Counterparty-with-isolation: proposal plus an isolation
review that names what is kept separate. No lighter rung ever asks more than a heavier one. A
wrong guess is cheap by construction: under-chartered worlds promote in one utterance
(AT-05), and mis-split worlds merge without loss — so the router is entitled to guess light.

**Fail:** A name demanded for a rabbit hole; any interstitial before the first exploratory
response; a heavier rung's asks skipped (under-ceremony is a failure of the same rank as
over-ceremony); ceremony that varies by entry surface (the Bar, an event, and "explore this"
must land on the same rung for the same weight).

**Binds:** documents 09, 04, 01. Surfaces: the Bar, the interpretation chip, the Proposal, the
Charter, the isolation review.

---

### AT-13 · Critique Transfers Judgment

**Anchors:** constitution §12.2, §6 (scored critique); principles P1.

**Setup:** In the apparel workshop, four variants on the Bench. The operator asks for critique.
Then the operator edits one criterion ("drop minimalism; add wearability at distance"), runs a
new set a week later, and — in a third session — scores the variants herself before revealing
the system's scores.

**Pass:** Critique is scored against explicit criteria; every score arrives with its why,
per-criterion, in the craft's language. The criteria pack is visible in the session, tappable,
and editable in place; the edit persists to the world and the next session demonstrably applies
it (and says so). The predict-first flow exists: the operator can score first, the system
reveals second, and the deltas are kept — so "is my eye getting better?" has an honest,
inspectable answer over time. Critique is available in every workshop, on demand, against that
craft's criteria — including the Builder.

**Fail:** Bare numbers without reasons; criteria hidden, hard-coded, or silently reverted after
editing; critique that exists only for visual crafts; a scoring system the operator cannot
interrogate ("why 6?" must always answer); no way to compare her judgment to the system's over
time.

**Binds:** documents 17 (mastery), 16 (workshop grammar), 07 (compare). Surfaces: the Bench,
the criteria pack, the Ledger (critiques and deltas persist there), the Counsel.

---

### AT-14 · Anti-Generic — Workshops Open Grounded

**Anchors:** constitution §12.6 ("generic output despite available context is a defect"), §6
(Palette).

**Setup:** Jane's world is rich: brand assets, a playbook with send-time and subject-style
evidence, two past campaigns with outcomes, counterparty facts (bakery, Tuesday markets, her
voice notes). Open the Outreach Studio fresh and ask for a first draft of the fall campaign
opener. As control, pose the identical request to a context-free assistant.

**Pass:** The Palette is pre-loaded on open — brand assets, prior artifacts, relevant playbook
cards, the domain pack's concepts — before the operator asks for anything. The first draft is
demonstrably grounded: it uses counterparty facts and cites playbook evidence ("Tuesday 9am has
your best open rate — evidence"), and its flight recorder lists the scoped sources consulted.
The blind test decides it: shown the two drafts, judges identify which system knew Jane at
better than chance, every time the world's context is relevant. When the system has relevant
context and still produces generic output, the product treats it as a defect — the grounding
miss is loggable from the surface, not shrugged off.

**Fail:** An empty Palette on open; a first draft interchangeable with the control; a Counsel
that must be *asked* to consult the playbook it already holds; grounding that exists in the
flight recorder but leaves no trace in the work (citations must surface where the operator can
see them).

**Binds:** documents 16, 17, 03 (genome stance). Surfaces: the Palette, the Counsel, the flight
recorder, playbook cards.

---

### AT-15 · Patterns Travel, Data Doesn't

**Anchors:** constitution §12.5, §13; principles P11.

**Setup:** Jane's world earns a playbook entry ("Tuesday 9am sends best; subject style: plain
question"), with her marker-stringed campaign rows as evidence. The operator promotes it through
the gate to a pattern on the client setup. Client C is chartered next month from that setup.

**Pass:** C's Proposal shows the inheritance with provenance ("earned across 4 clients"), and
the pattern arrives as judgment, not data: a marker search of C's world — its palette, drafts,
Counsel context, flight recorders — finds zero Jane-originated content, names, numbers, or
rows. Promotion required the human gate; nothing entered the shared layer silently. The
provenance chip answers "where was this earned?" at two depths honestly: at the operator's
portfolio level it names the source worlds (they are all hers); inside anything a counterparty
can see, it never does. Revoking the pattern at the setup layer stops it appearing in the next
charter, and existing worlds keep their local copy as a visible local override.

**Fail:** Any counterparty datum riding the pattern into C; a silent promotion; a pattern with
no provenance; provenance that leaks one client's identity into another client's visible
surfaces; a revocation that silently strips worlds already using the pattern.

**Binds:** documents 17, 09 (inheritance with provenance), 08. Surfaces: the Proposal's
inheritance section, playbook cards, provenance chips, the knowledge gate.

---

## 3. Guard checks — small invariants, run with every checkpoint

Compact tests; same fields, terser. Each is still blocking.

**G-1 · Postures never gate.** *Setup:* in one world, cycle all four postures. *Pass:* every
feature reachable in each posture; the dial only re-stages the Desk and re-stances the AI.
*Fail:* anything reachable in one posture and absent in another. *Binds:* 03; the posture dial,
the Desk.

**G-2 · No architecture words.** *Setup:* string audit of every shipped surface, empty state,
tooltip, and generated sentence. *Pass:* zero occurrences of Genome, Capability, Spine,
Situation, or Line as user-visible labels; no "World #n" labels; display names come from the
constitution's terminology table only. *Fail:* one occurrence. *Binds:* every document; every
surface; 12 in particular.

**G-3 · Overlays return you intact.** *Setup:* mid-draft in a workshop, open and dismiss the
Queue, the switcher, and search. *Pass:* dismissal restores the exact prior state — scroll,
selection, uncommitted text. *Fail:* any state loss or place change from an overlay. *Binds:*
02; the Queue, switcher, search results.

**G-4 · Approvals are whole decisions.** *Setup:* sample ten Queue items across kinds (send,
publish, deploy, money). *Pass:* each is decidable inline — the draft, the diff, the compare,
the evidence are in the item; approving never requires navigating away; batch actions stage
per-item approvals. *Fail:* an item that forces a context hunt; a bulk action that bypasses a
gate. *Binds:* 02, 06, 07; the Queue.

**G-5 · Operate from a phone.** *Setup:* on a phone: read the Brief, approve three Queue items,
speak one Bar instruction, compare two variants, resume a session. *Pass:* all five complete;
nothing essential is chat-only; deep benches decline gracefully into review/critique/approve
states. *Fail:* an essential flow that needs a desktop; a bench pretending to full depth on a
phone instead of offering its honest review state. *Binds:* 02, 16; mobile shell, the Queue,
the Bar.

---

## 4. Coverage matrix — what binds what

| Test | 02 shell | 03 world | 04 explore | 05 capab. | 06 work | 07 artifacts | 08 multi | 09 creation | 16 workshops | 17 mastery |
|---|---|---|---|---|---|---|---|---|---|---|
| AT-01 no-second-assembly | · | ● | · | · | · | · | · | ● | · | ● |
| AT-02 hundredth-world | ● | · | ● | · | ● | · | ● | · | · | · |
| AT-03 context-clarity | ● | ● | · | · | ● | · | · | · | ● | · |
| AT-04 isolation | · | ● | · | · | ● | ● | ● | · | · | ● |
| AT-05 exploration | · | ● | ● | · | · | · | · | ● | · | · |
| AT-06 one-minute | ● | · | · | · | · | · | · | ● | · | · |
| AT-07 continuity | · | · | · | ● | ● | · | · | · | ● | · |
| AT-08 depth | · | · | · | ● | · | ● | · | · | ● | · |
| AT-09 thirty-days | ● | · | · | · | ● | · | · | · | ● | · |
| AT-10 recurring-visible | ● | · | · | ● | ● | · | · | · | · | · |
| AT-11 evidence | ● | ● | · | · | ● | · | · | · | · | · |
| AT-12 ceremony | · | · | ● | · | · | · | · | ● | · | · |
| AT-13 critique | · | · | · | · | · | ● | · | · | ● | ● |
| AT-14 anti-generic | · | ● | · | · | · | · | · | · | ● | ● |
| AT-15 patterns-travel | · | · | · | · | · | · | ● | ● | · | ● |

Documents 01 (principles), 10 (journeys), 11 (IA), 12 (wireframes), and 15 (blueprint) are bound
by the whole suite: journeys must walk through passing states, wireframes must depict every pass
condition's affordance, the IA and blueprint must leave no test structurally impossible. G-1
through G-5 bind every checkpoint of every document.

A design change that would flip any cell from pass to fail is a constitutional question, and it
goes to `14-open-decisions.md` before it goes anywhere else.
