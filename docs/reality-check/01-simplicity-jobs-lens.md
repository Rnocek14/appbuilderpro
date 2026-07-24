*This document is an adversarial critique written through the publicly-known product philosophy of
Steve Jobs — ruthless simplicity, saying no, the first five minutes, remove until it breaks. It is
an interpretive lens exercise for internal planning. Nothing in it is, or claims to be, the words of
the man himself.*

# Reality Check 01 — The Simplicity Attack

**Target:** `docs/experience-architecture/` — `_constitution.md`, `15-master-experience-
blueprint.md`, `02-global-shell.md`, `09-creation-and-genesis.md`, `03-world-experience.md`,
`10-key-user-journeys.md` (skimmed). Product context: `docs/operating-model/operating-model.md` §0.

**The standard applied:** not "is this coherent?" — it is fanatically coherent — but "would a person
who has never seen it, and will never read one of these seventeen documents, fall in love in five
minutes?" Coherence is the designer's pleasure. Simplicity is the user's.

---

## Part I — The first five minutes, actually walked

Blank account. Zero worlds. Zero history. Here is what the documents say happens, in order.

**Minute 0.** Per 02 §12.2: *"A new account's Home is the Bar plus one line: 'Say anything — a
question, a business, a thing to build — and I'll make it a world.'"* That is the entire onboarding.
A blinking cursor and a sentence that uses a word — "world" — the user has no referent for. The most
feared object in software design, the blank page, has been installed as the front door and called a
philosophy. This is the product's single most important screen, and across the constitution, the
shell spec, the creation spec, and the master blueprint, it receives **one row in an FAQ table**.
The hundredth-world test appears, by my count, in every document; the zeroth-world moment appears
once.

**Minute 1.** The user types "I want a website for my bakery." Before they can press Enter, a chip
materializes after 150ms showing a scope glyph, a world name, a posture dot, a verb, and an object
(02 §3.2) — five glyphs of machine self-narration above the first sentence they have ever typed.

**Minute 2.** Enter opens the Proposal (09 §4): name and presentation line, setup stack with
provenance, areas it will mount, automations with cadence and cost and caps, seed artifacts, two
separated intake lists, grant sentences, inherited playbook cards, first moves. Nine regions. And
here is the cruelty: every gram of the Proposal's charm depends on history the new user does not
have. "Based on your proven client setup ×9" (09 §4.2) is magic at world forty and a hollow generic
template at world one. The walkthroughs know this — that is why they all start late: 09 §10 starts
at n=2 with Mom's world already tuned over months; Journey 1 (10 §1.1) opens with an agency *already
ten clients deep*. The documents never walk the one user every real user will actually be.

**Minute 3–5.** The newborn Desk stages intake asks. The user is now inside a "world" with a "Face,"
vitals, a posture dial, areas, a scoped Bar — an entire grammar — and one bakery website that does
not exist yet.

**Verdict on the first five minutes:** the design has optimized the hundredth minute at the direct
expense of the first five. The first session is the demo. There is no demo here; there is an
admissions interview.

---

## Part II — The attacks

### 1. The zero-state is a rounding error in the spec

Cited above; it deserves its own number because it is the deadliest. 02 §12.2 (one sentence), 09 §10
(starts at n=2), 10 Journey 1 (starts at ten clients). Every proof in these documents compounds on
prior worlds — provenance, playbooks, learned setups, streaks. At n=0 all of it evaluates to empty
string. The moment it hurts: a new user charters their first world and every region that was
supposed to earn trust ("×9," "earned: Jane's Bakery," "9-client evidence") is silent, and what
remains is a form with beautiful typography.

### 2. The Proposal is a wizard rotated ninety degrees

09 §0.3 boasts: *"One screen, never a wizard... There is no step 2 of 6."* Then 09 §4 specifies nine
regions on one *scrollable* screen, "everything on it is a decision already drafted, waiting to be
corrected." A screen of nine drafted decisions is nine decisions. Scrolling is the new clicking
Next. The rung-1 example (09 §6) claims "thirty seconds of reading" while narrating a name edit, a
stack inspection, an assembly question that redraws the screen, a connections row, and a removal.
The moment it hurts: the user just closed a deal — "Rosa said yes" — and their reward is a contract-
shaped document to proofread. 03 §3.3 has the best sentence in the whole corpus: *"the operator's
first decision is always about the undertaking, never about the software."* The Proposal violates it
at the most emotionally charged moment the product has.

### 3. The interpretation chip is a confirmation dialog in a trench coat

02 §3.2 insists *"The chip is not a confirmation dialog"* — and then specifies that it renders on
every utterance, previews the full routing tuple, supports Tab-cycling of three alternate readings,
and exists "so you could have objected." A thing you must glance at before every Enter, forever, or
accept misroute risk, is a confirmation step — amortized across your whole life with the product.
The same section contains the honest design: the 6-second undo transient (§3.6), which costs nothing
until something actually goes wrong. Pick that one. A router confident enough to act should act;
showing its reasoning above the input on every keystroke is the product hedging its central bet in
public.

### 4. The Bar's three registers make the user learn the seams anyway

02 §3 justifies one input for intent + search + commands "because splitting them would force the
user to decide *which kind of asking* they are doing before asking." Then §3.1 defines three
registers with "visible mode signatures," and §3.5 makes search trigger on "a noun-like utterance" —
so the user must now model how the machine classifies noun-ness. The moment it hurts: the user types
"jane invoice" wanting to *find* it and watches the chip propose *drafting* one. The decision they
were spared has been replaced by a negotiation with a classifier.

### 5. The posture dial is a mood ring

03 §5: four dots that "re-light the room," never gate anything, are set *by the AI from your words*
most of the time, and re-rank only classes 4–6 of the Desk while classes 1–3 hold position in every
posture. So the dial: (a) changes nothing important, by design; (b) is operated by the machine, by
default; (c) when hand-set, gets a suggestion chip nudging you back ("results came in — Observe?",
§5.5). The document then confesses the whole case against itself (§5.4.3): *"a dial you deliberate
over stops being used"* — meaning it was designed to be safe to ignore, which is the definition of
removable. Even the blueprint lists "posture-dial prominence" among the open decisions (15 §7). The
moment it hurts: a user flicks it, three list items quietly reorder, they cannot tell what it did,
and they never touch it again — while it sits on every Desk of every world forever.

### 6. Lenses: a filter that demanded a name and was given a metaphysics

Constitution §10 defines a Lens as "filter + grouping + rendering." Every shipping product on earth
calls that a saved view, and none of them needed a noun with constitutional standing. Worse is what
the concept does to Home: 02 §10.2 has lens chips that "morph the Field in place" — tap "Clients"
and the living, attention-ranked Field *transforms into a pipeline board*, while the doc insists
"same place, different view." The user's spatial memory does not read specs; when the screen becomes
a different screen, they went somewhere. And "a Lens is a view with hands" that acts only "through
per-world gates" means a bulk nudge from a lens detonates into N per-world queue items — a view, a
place, and a batch tool at once. The moment it hurts: a user taps a chip out of curiosity, their
Home turns into a kanban board, and they don't know how to get "home" from Home.

### 7. Home rearranges itself every day — a place you can never learn

02 §10.2 ranks the Field purely by attention; 02 §12.2 forbids manual layout outright: *"Manual
arrangement would rot; attention ranking cannot."* Note the arrogance of that sentence — the user is
not permitted to put their most important client top-left, because the algorithm knows better. These
same documents worship "learned once" and muscle memory for the world grammar (03 §8), then deny
both at the front door: a Home whose contents reshuffle nightly by ranking function can never be
navigated by hand-memory, only re-read every morning. The moment it hurts: Tuesday, the user reaches
for the orb that was top-left on Monday, and it has been compressed into the quiet band because it
stopped "needing" them.

### 8. The Brief is a toll booth made of machine prose

The evidence-linking rule — "a sentence that cannot cite rows cannot be rendered" (02 §10.1) — is
genuinely great, and it deserves a better vehicle. Five stanzas of generated narrative ("while you
were away," "what changed," "needs you," "in flight," "worth a look") is *reading assigned by the
software*. Prose is the slowest possible scan format; the documents ban KPI tiles and static cards
with religious fervor (02 §10.4) and thereby ban the one thing a returning user often wants: a
number, instantly. The moment it hurts: a user opens the app to approve one email and must visually
chew through paragraphs to find the one sentence that matters — every single morning.

### 9. The Face is a cockpit wearing the word "header"

03 §2: up to four named vitals, each in one of five render states, plus a sixth whole-Face state
(asleep), plus a momentum mark that is doctrinally Not A Vital (rule 2.5.5 exists solely to forbid a
vital named "Momentum" — the spec is writing canon law against itself), plus a counterparty chip,
plus edges and grants, plus a presentation line. That is potentially a dozen live signals in the
header of every screen of every world. The moment it hurts: the user glances at Jane's Bakery to
answer "is everything okay?" and receives Service, Money, Owed-to-Jane, a trend mark, a grants
indicator, and an edge — six answers to a yes/no question. Apple would render one word or nothing.

### 10. Six named organs stand between the user and one paragraph of text

Constitution §6: Bench, Palette, Counsel, Moves, Ledger, Commit rail — the six-part anatomy of every
Workshop, with nine bench archetypes and a mandate: *"Divergence before convergence is the default
shape of a session, not an option."* The moment it hurts: the user needs to write a two-sentence
follow-up they already know by heart, and the environment offers them variant sets, a criteria pack,
a critique loop, and a commit rail — the craft-school pedagogy imposed on a Tuesday chore. The
workshop grammar is a genuinely strong idea *for craft*; making it the only door means the product
cannot tell a masterpiece from an errand.

### 11. The Queue is being colonized by meta-work

The Queue's core contract is the best single decision in the corpus — full decision context inline,
"if an item can't carry its decision inline, the item is malformed, not the rule" (02 §4.2). Which
is exactly why it must not become a bulletin board. Yet the same section grows "earned-autonomy
offer cards" on class headers, and Journey 1 (10 §1.6) scales this to offers per *(capability ×
world × class)*: the operator "walks the offers `j/k` and accepts four; the two younger streaks keep
proposing." Ten clients times a handful of classes is a permanent garden of streak-counters, each
independently negotiating for autonomy like a union rep. The moment it hurts: the user opens the
Queue to clear six approvals and finds four cards about *the Queue itself*, each requiring a policy
decision. Pick sane defaults per class; offer the dial once, in one place; stop selling upgrades
inside the approval line.

### 12. Mastery is a second product smuggled inside the first

The north star (constitution §1) is *"mastery, not merely organization"* — the system should make
the operator *better*. Noble. Nobody asked. It manifests as: critique scores on postcards ("Postcard
v2 scored 8.4 against your criteria — approve the print run," 03 §7.2), "judgment reps" staged as
Desk moves — "score the overnight variants blind," "close this prediction — the data's in" (03
§3.2.5) — hit-rates in the morning Brief (02 §10.1), and the claim that "every approval is also a
rep of judgment" (02 §4.2). The moment it hurts: Mom wants the postcards *printed*; the product
wants her to engage with a rubric and close a prediction. This is the founders' ideology delivered
as staged moves — homework from software. The mastery loops should be there for the user who reaches
for them and invisible to everyone else; these documents wire them into the Desk, the Brief, and the
Queue as first-class citizens.

### 13. Bank-grade ceremony, pointed at your own brother

The ceremony ladder's rung 0 is perfect — a curiosity costs one Enter, nothing else (09 §6) — proof
the authors know what zero feels like. Then watch the top of the ladder: rung 3 requires "two
deliberate marks" on one screen (09 §6); and the wrong-kind repair (09 §12.1) — triggered by the
sentence *"stop invoicing my brother — we run this together"* — opens a re-genome proposal with an
isolation-dissolution review in which every formerly counterparty-scoped item is "deliberately re-
scoped to the world, item by item, never silently," plus a fresh acknowledgment mark. The moment it
hurts: fixing the machine's own wrong guess about the user's *family* requires the user to perform a
data-custody audit. The isolation guarantees are right; pricing a two-person mural business like a
HIPAA migration is the system's anxiety billed to the user.

### 14. Two vocabularies means the ontology is too big — and renaming is the confession

Constitution §2 maintains a binding translation table between spec words and display words, and
genomes carry a "terminology skin" — per-template dictionaries ("Automation" vs "Routine," "Studio"
vs "Workshop"). A product that needs a translation layer *about itself* has too many concepts; you
cannot rename your way out of ontology, you can only make support conversations bilingual. The
sharpest tell: "Thread" names two different objects and requires a binding paragraph (constitution
§8) so that *the designers themselves* don't conflate them. When the spec needs guardrails against
its own authors' confusion, imagine the user.

### 15. "Two places only" is philosophy, not experience

02 §1's ontology — place, view, surface, overlay — is elegant to the router and irrelevant to the
human. What the user actually traverses: Home, the lens-morphed Field, a world, its Desk, an area-
as-view, an area-as-workshop, a session filling the screen with bench/palette/counsel/ledger, an
artifact frame, a builder opened from the frame, the Queue overlay, the switcher overlay, search
results. Telling a user standing inside a full-screen apparel bench that they have not "gone"
anywhere because a bench is "a surface, not a place" is a category theory joke. The two-place model
earns its keep in the routing layer; as a claim of experienced simplicity it is false advertising
the documents repeat like a rosary (15 §3.1).

### 16. The eight-way yes wearing a unification costume

Operating model §0 diagnoses the disease precisely — "seven apps sharing a sidebar," the "eight
competing stories": app builder, chief of staff, marketing team, agency-in-a-box, real-estate tool,
genesis, second brain. And then Decision 1 resolves it not by choosing, but by declaring them all
"genome families, not products." That is the single largest *yes* in the entire architecture,
dressed as an act of discipline. The genome abstraction is beautiful machinery whose actual function
is to let the company avoid deciding who its customer is. Every attack above is downstream of this
one: the vocabulary, the ceremony ladder, the dressing contract, the 59-item open-decisions register
(15 §7), the twelve adversarial review passes the blueprint brags about surviving (15, preamble) —
all of it is the cost of refusing to say "this product is for X, and only X, first."

---

## Part III — The mandated verdicts

**Is this actually simple, or a beautiful system only power users understand?**
It is a beautiful system, and the documents keep mistaking *consistency* for *simplicity*. The
grammar genuinely is learnable-once — for a person willing to learn a grammar. The evidence is in
the corpus's own vital signs: seventeen documents, a constitution, a binding dressing contract with
twelve may's and twelve must-not's (03 §6), fifty-nine registered open decisions, and twelve
adversarial review passes needed to make it hold together (15, preamble). Users do not get the
twelve passes. The keyboard culture (`j/k/a/e/d/h`, Tab-cycled readings, `Cmd+.` — 02 §3.7) tells
you who this was designed by and for, while the personas are Mom and a muralist. Verdict: **a
cathedral for power users, narrated in the language of simplicity.**

**What would Apple remove entirely?**
The posture dial. Lenses as a named concept (keep two built-in views; call them nothing). The
interpretation chip (replace with confident routing + prominent undo). The Brief's prose stanzas
(replace with three lines and one number). The earned-autonomy offer cards (replace with one
setting, suggested once). The terminology skin. The momentum mark. Public names for
Bench/Palette/Counsel/Moves/Ledger — the parts can exist; the taxonomy should be private. Half the
Proposal's regions at n=0.

**Where is the product still saying yes when it should say no?**
Attack 16 is the master instance: yes to all eight product stories via the genome abstraction. Below
it: yes to a fourth input register whenever parity demands it (02 §3.4's command catalog "worn two
ways"); yes to mastery instrumentation in every surface (Desk, Brief, Queue — attack 12); yes to
per-(class × world) autonomy negotiation (attack 11); yes to nine bench archetypes before one has
been proven in the market (constitution §6); yes to a "learned workshop" pipeline for crafts the
platform hasn't shipped once.

**The first five minutes for a blank account?**
Walked in Part I. A blinking cursor, a promise about "worlds," a nine-region Proposal whose charm
requires history the user doesn't have, and a Desk staging intake asks. Verdict: **the first session
is an admissions interview, and no document owns it.**

**Is the Brief/Field/Desk/Queue/Bar/Studio/Mission vocabulary five words too many?**
Credit first: 03 §0's reading rule already keeps Face, Desk, Bar, Field unnamed on screen — the
right instinct, half-applied. What still reaches the user: Mission, Automation/Routine, Queue,
Playbook, Memory, Activity, Studio, Exploration, Setup, Grant, Lens chips, beacons, Proposal,
Charter, Drops, vital names. That is a fifteen-noun burden where a shipping product carries five.
Verdict: **yes — about five too many on screen, and about twenty too many in the spec.** Keep: Home,
Queue (or just "Approvals"), Studio, Automation. Everything else earns its name only after users
spontaneously start saying it.

**Does the posture dial deserve to exist?**
No. Attack 5. A control that changes only emphasis, is operated by the AI by default, is designed to
be ignorable, and whose prominence the authors themselves list as an open decision, is a decoration.
Let the router's inferred facing re-stage the Desk silently; delete the dial; nothing in 03 §3.5's
tables requires the user-facing knob to achieve its effect.

**Do Lenses deserve to exist as a user-visible concept?**
No. Attack 6. Two or three built-in views per genome family, presented as unnamed tabs, deliver the
entire user value of constitution §10. "Saved cross-world views with hands" as a *concept the user
must hold* is the platform's internal machinery leaking through the paint.

**Where does ceremony still exist that shouldn't?**
Rung-3's "two deliberate marks" (09 §6) — one confirm can carry an inline isolation summary. The
item-by-item dissolution review for family-scale corrections (09 §12.1). Hold-to-confirm batch
approval (02 §4.2) — theater by the anti-theater document's own definition. The nine-region Proposal
at rungs 1–2, where five regions would do (name, what it'll run with costs, what it needs access to,
what it starts with, first move). And the liturgical register itself — Proposal, Charter,
chartering, grant sentences, acknowledgment marks — ceremony as *language*, which trains users to
brace before creating things.

---

## Part IV — The three things I'd kill

1. **The posture dial.** Replaced by: nothing. The router already infers facing (03 §5.2) and the
   Desk already re-stages; do it silently, keep classes 1–3 pinned as today, and delete the four
   dots from every Desk in the product. One less thing on every screen, zero capability lost.

2. **Lenses as a user-facing concept, including the morphing Field.** Replaced by: two fixed,
   unnamed tabs on Home per shipped genome family (e.g., "Clients," "Running"), rendered as plain
   screens you visit and leave. The cross-world query machinery survives underneath; the noun, the
   chips, the in-place metamorphosis of Home, and the "view with hands" doctrine all go.

3. **The interpretation chip as a persistent pre-commit surface.** Replaced by: something smaller —
   route on Enter, always; show the 6-second undo transient (already specced in 02 §3.6) with the
   destination named; reserve any pre-commit UI for exactly two cases, money/outbound cost and
   scope-crossing, where 02 §3.6 already demands disclosure. The router earns trust by being right
   and cheap to correct, not by narrating.

*(Honorary fourth, named so nobody pretends it wasn't seen: the mastery instrumentation woven into
Desk, Brief, and Queue. Demote it to a layer that appears for users who ask "why" twice. The
Playbook stays; the homework goes.)*

## Part V — The one thing I'd protect at all costs

**The Queue's inline-decision contract** (02 §4.2): one global list, every item carrying its entire
decision — draft, diff, compare, evidence — with "if an item can't carry its decision inline, the
item is malformed, not the rule" as the enforcement clause, backed by the no-theater rule that every
count and claim must survive "which rows are those?" This is the product's spine and its taste in
one mechanism: it respects the user's time, it makes trust auditable instead of asserted, and it is
the reason the whole propose→approve model can work at all. Strip everything else in this critique
and the product still stands on this. Lose this, and nothing else matters. (Its sibling, rung-0
silent creation — one Enter, zero screens, 09 §6 — is under the same protection order: it is the
only moment in the current design where the product feels effortless, and it should be treated as
the target feeling for everything else.)

## Verdict

This does not yet delight; it is magnificently organized. The documents are the best-argued
experience architecture I have seen at this stage — internally honest, adversarially reviewed,
allergic to theater — and that is precisely the problem: every unit of design energy went into
making a vast system *coherent* rather than making a small product *irresistible*, and coherence is
what the org chart feels, not what the user feels. The user feels the first five minutes (one
sentence of spec), the nine-region birth certificate, the dial that does nothing, the prose toll
booth, the header cockpit, and a vocabulary that needs its own translation table — while the
genuinely magical moments (silent rung-0 creation, the inline Queue, resume-exactly-where-you-left)
are buried inside the cathedral like relics. The path to delight is not more architecture; it is
choosing one customer from the eight stories, shipping the Queue, the Bar-with-undo, rung-0, and one
world dressing, and letting every other noun in these seventeen documents fight its way back in by
being missed. Remove until it breaks. Right now, almost nothing has been removed — only perfectly
arranged.
