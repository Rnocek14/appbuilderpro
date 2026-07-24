# 10 — Key User Journeys: The Seven Scenarios, End to End

*Phase 3, document 10. Every prior document specified a mechanism; this one runs the film. Each
journey below walks one of the seven required scenarios from first utterance (or first event) to
day 30, through at least one Workshop session and at least one mastery loop, through a realistic
failure, and through its lifecycle transitions. Everything here is an application of the
constitution — the shell (doc 02), the world grammar (doc 03), Explore (doc 04), capabilities
and drive modes (doc 05), Missions and Automations (doc 06), artifacts and the Builder (doc 07),
and Lenses (doc 08). Where a journey needed a call the earlier documents did not make, the call
is made here, decisively, inside the constitution's bounds.*

**Reading rule.** Spec words (genome, capability, Standing Order, the Line, the Spine, the
Situation) appear in prose only. Every quoted piece of interface text uses display language from
the constitution's terminology table: worlds present as what they are ("Client," "Business,"
"Exploration," "Build"); Standing Orders present as "Automations"; the Situation renders as Home;
the approval surface is "the Queue"; the flight recorder is "Activity." Interpretation-chip
quotes use the Bar's chip syntax from doc 02 (`→ scope · reading`).

**The cast, held constant across all seven journeys** (one operator, one portfolio — the
journeys interleave in real life and the document keeps them interleavable). Every world in the
cast instantiates the worked dressings of doc 03 §7 verbatim — areas, benches, vitals, stances —
and **Appendix A** holds the whole cast in one table, the canonical reference for prototypes,
demo data, and wireframes:

| # | Journey | Worlds involved | Named exception exercised | Mastery loop exercised |
|---|---|---|---|---|
| 1 | The agency at ten clients | the Agency; Rosa's Taqueria + 9 sibling client worlds | **bounced sends** | outcome-annotated outreach → Playbook; critique on pitches |
| 2 | Real-estate agents at n=2, 10, 50 | Mom's Real Estate; Dave Kowalski; 48 more | **isolation near-miss** | criteria-in-critique (fair housing); pattern promotion with provenance |
| 3 | The mural business | Marco's Murals | **wrong-genome guess** | outcome-annotated proposals → Playbook; criteria edited to the artist |
| 4 | The clothing brand | Thread & Stone; grant from Marco's Murals | **isolation near-miss** (grant boundary) | scored critique with rubric transfer; post-launch outcome annotation |
| 5 | The inbox automations — outbound (5a) + "automate this inbox" (5b) | Podcast Outreach; Support Inbox | automation silence (**silence is loud**) | variant outcomes → Playbook; predicted-vs-actual reply rate; recipe repair through the gate |
| 6 | Rabbit hole → "make this real" | Coffee-cart curiosity → Cart Kit | **blocked mission** (intake) | calibration: predictions closed, hit-rate shown |
| 7 | The builder | Cart Kit's Build Studio | **blocked mission** (grant + failing check) | product criteria in critique; conversion prediction closed |

All four exceptions named by the phase brief — bounced sends, a blocked mission, a wrong-genome
guess, an isolation near-miss — are exercised above, each in the journey where it would really
happen.

---

## Journey 1 — The Website + Automation Agency, Ten Clients Deep

*Scenario: an agency operator with 10+ active clients. Required beats: the full prospect→client
conversion, and the pipeline / attention / approval views that make ten clients feel like one
practice, not ten jobs.*

### 1.1 The standing situation

The Agency is a Business-kind world and the portfolio's gravity well. Its areas: **Prospects**
(view: records — the funnel), **Outreach** (a Workshop: Outreach Studio — document bench with a
table/dataset flank, 16 §13.2), **Clients** (view: the roster of `serves` edges — each row a
neighbor world's honest state), **Money** (view: ledger lines that drill to rows). Its Automations, each with a
heartbeat trace one tap away: the nightly prospect hunt (scrape → audit → demo site staged),
follow-up sequences, invoice chasing. Its Face reads service health and money: "Agency · 10
clients · $4,850/mo · 2 need you."

At Home, three lens chips do the portfolio's work: **Prospects** (the built-in funnel over the
Agency's prospect records, exactly as 08 §3.2 defines it: Found · Audited · Demo built ·
Pitched · Followed-up · Replied · Booked · Closed-won — a table whose grouping renders as stage
bands, every stage computed from evidence, never hand-dragged), **Clients** (the built-in
board: Onboarding → Build → Review → Live → Renewal, per 08 §3.1 — plus the operator's own
saved variant, made with "Save this view," rendering the same rows as a table: health, money,
last delivered, approvals waiting; the built-in stays untouched), and **Running** (every
Automation everywhere, heartbeat column first). The Field itself stays a
handful of orbs: seven healthy clients compress to a quiet band; the two that need attention
render full; the pipeline is a chip, not a place.

### 1.2 The conversion beat — prospect to client, end to end

**Day −9.** The nightly hunt stages 14 new prospects. The Brief's morning line: "The hunt found
14 candidates in the 78704 strip; 11 have no mobile site. Demo drafts are staged for the best 6."
Tap → the rows.

**Day −8.** The operator opens the Outreach Studio from the Agency's Outreach area. The table
flank loads the prospect rows, provenance per row; the Palette holds the pitch templates (recipe-flagged artifacts), the
Playbook ("Tuesday 10am sends replied best — 9-client evidence"), and the audit docs. A
divergence pass produces two pitch variants for the restaurant segment; critique scores them
against the outreach criteria (specific, honest, no manufactured urgency; a placeholder token is
a hard fail, not a deduction). Commit → 6 pitches staged as approvals.

**Day −8, the Queue.** The Pulse shows 6. The Queue batches by class — "6 prospect pitches" —
and walks them per item, full draft inline, audit evidence attached. Approve, approve, edit one
subject line, approve. Sends go out through the one gate everything outbound uses.

**Day −6.** The Pulse: a reply. Rosa of Rosa's Taqueria — "how much, and can it text people back
when we miss calls?" The thread lives in the Agency world; the booking Automation offers her a
slot; the call happens off-platform.

**Day −5, the event.** The operator, at the Bar: *"Rosa said yes — $500 a month, website plus
missed-call textback."* The chip, before Enter:

> `→ the Agency · close-won: Rosa's Taqueria — spawn a Client world?`

Close-won is an event that proposes a world (constitution §11). Enter opens the Proposal.

```mermaid
flowchart LR
    subgraph AGENCY["The Agency world"]
        HUNT["Nightly hunt<br/>(Automation, heartbeat)"] --> FUNNEL["Prospects lens<br/>Found→…→Closed-won"]
        FUNNEL --> STUDIO["Outreach Studio<br/>pitch variants · critique · commit"]
        STUDIO --> Q1["Queue: pitch batch<br/>per-item approvals"]
        Q1 --> REPLY["Reply → thread → booked call"]
    end
    REPLY -->|"'Rosa said yes'"| PROP["THE PROPOSAL<br/>pre-populated from the funnel:<br/>audit · demo site · thread history"]
    PROP -->|"charter + grants +<br/>isolation review"| ROSA["Rosa's Taqueria<br/>Client world · serves ← Agency"]
    ROSA --> LENS["Clients lens: +1 row<br/>(never +1 nav item)"]
```

### 1.3 The Proposal

One screen, everything editable inline:

- **Name & presentation:** "Rosa's Taqueria — Client · Website + Missed-call textback ·
  $500/mo · since July."
- **Setup:** "your proven client setup ×9" — base client shape + the learned layer earned across
  nine charters. (The word "genome" appears nowhere.)
- **Areas it will mount:** Site · Automations · Content · Money · Reports.
- **Automations it wants to run**, each with cadence and cost: missed-call textback (on event;
  per-message cost shown), review request (weekly), monthly report (monthly), invoice (1st).
- **Seed artifacts:** the audit doc, the demo site — mounted as *draft v1 of her real site*, not
  a copy — and the entire outreach thread history. Nothing the funnel produced is re-created.
- **Intake asks:** hours and menu, photo access, phone-forwarding confirmation, domain choice.
- **Connections it needs — explicit, scoped grants:** her business profile, her phone number,
  payment collection. Each scoped to this world only, listed on the Face, revocable. Never
  silently inherited from the Agency.
- **Inherited from siblings, with provenance:** "pricing playbook (last 4 clients)," "Tuesday
  10am send timing (×9)," "review-request wording (earned: Jane's Bakery)."
- **Isolation review** — the ceremony ladder's heaviest rung, because the engagement runs under
  Rosa's own identity: her number, her sender name on the missed-call textback. (Money alone
  would have priced rung 2 — proposal + grants; counterparty identity is what adds the review,
  09 §6.) Its lines: her sender identity, her data scoped to her world, what the Agency may see
  of her (roll-up health only).

### 1.4 Decisions and charter

The operator removes the Reports area ("fold it into the monthly email"), drops review requests
to biweekly, approves two grants now and defers payment collection until the first invoice.
One confirmation. Rosa's world is born already containing its own history; its Desk stages the
intake asks as the first next moves — never a form wizard. The Clients lens gains a row. The
shell gains nothing.

### 1.5 The workshop beat — launching her site

Two days later, photos in, the operator opens Rosa's **Site Studio**. Gather: her photos, the
audit's findings, and the local-business site criteria from the domain pack (menu above the
fold; tap-to-call; honest hours; no stock-photo food) sit in the Palette. Diverge: two homepage
directions on the bench, side by side as running previews. Critique scores both, with why
("Direction A buries the phone number below the menu — fails tap-to-call priority"). Converge on
B; commit → publish. The publish is an outbound exit: it stages in the Queue with the compare
(draft vs live) inline, and goes live on approval. The Ledger keeps the whole session — including
the criterion that decided it.

### 1.6 Ongoing use

**Day 2.** The Brief: "Rosa's textback answered 3 missed calls last night; 2 booked. Her site
draft waits on the menu photos — asked again this morning." Every sentence taps through to rows.
The heartbeat trace on the textback Automation shows last ran / what it sent, one tap from the
Desk.

**Day 30.** Ten clients produce one Queue, not ten inboxes. Batch-by-class handles the weekly
review requests across six clients in ninety seconds — staged per-item, no gate bypassed. Then
the Queue itself offers the dial — and the dial is per (capability × world × class), never one
switch spanning six client worlds (05 §8.1): the review-request class header grows one offer
per world, each citing its own streak plus the cross-world evidence that shortened it ("Harbor
Dental: 4 clean approvals here — 9 clean across your client setups — auto-approve review
requests for Harbor Dental? Instantly revocable"). The operator walks the offers `j/k` and
accepts four; the two younger streaks keep proposing until they have earned their own offers.
Auto-approved sends keep appearing in the ledger view; the Brief digests them ("review requests
went to 6 clients; 2 new reviews"). Attention now spends itself only where the Field says it should: Jane's invoice is 12
days overdue — her orb warns; Rosa glows quietly green.

### 1.7 Transitions

Prospect→client is the spawn this journey exists to prove: the world was born *from the funnel's
own rows*, pre-populated, linked `serves ← Agency`, with the Agency's roster and roll-ups
updating because an edge exists — not because anyone filed anything. The tenth client repeated
none of the first client's setup; the eleventh will repeat none of the tenth's. When a client
churns, the ending is walked, never assumed: client worlds leave the Field only by explicit
retirement, and a world with live clock work cannot go dormant (08 §4.3). Offboarding is a
retirement proposal through the Queue: the client's Automations are retired one by one —
identity-bearing ones first (the textback under her number), every trace kept; the final
invoice stages; each connection grant is revoked with its effect shown (her number, her sending
domain, payment collection); and the live site's fate is its own gated exit — transfer to the
client, freeze, or take down. Only then does the world go dormant: retired, never deleted; the
lens row moves to the lifecycle section of the "everything" view; the Playbook keeps what was
learned.

### 1.8 When it goes wrong — bounced sends

Tuesday's follow-up batch to 25 aging prospects bounces 9. The sending Automation's own
threshold trips: the run **halts its class** (it does not keep spraying), stamps its heartbeat
trace "sent 16 · bounced 9 — halted above threshold," and surfaces one Queue item carrying the
evidence rows inline. The Pulse ticks up by exactly one — a real row, no theater. The Brief next
morning says it plainly: "Tuesday's prospect follow-ups halted — 36% bounced (list older than 60
days)." The Counsel in the Outreach Studio proposes the repair as a move: verify addresses on
the bench's table (an asked-for move, watched, not a silent scrub), drop the dead rows, resume
the class. The operator runs it, resumes, and approves the Playbook lesson the session distilled:
"verify prospect emails older than 60 days before sequencing" — human-gated, evidence attached,
consulted by every future hunt.

### 1.9 The mastery loop

Every sent pitch is an artifact whose outcomes annotate it: "this subject line: 3 replies."
Annotations roll into the Agency's Playbook, and the next Outreach Studio session opens with
that evidence in the Palette — the Counsel recommends *from it*, cited, not from vibes. The
critique rubric is visible and editable; over ten clients the operator has stopped writing
pitches that fail the specificity criterion, because the rubric taught the judgment, not just
fixed the drafts. That is the difference between an automated agency and a better operator.

---

## Journey 2 — Real-Estate Agents: The Second, the Tenth, the Fiftieth

*Scenario: serving real-estate agents. Required beats: adding agent n without repeating agent
n−1's setup, and inherited-improvement adoption.*

### 2.1 The second agent

Mom's Real Estate has run for four months — the family's own **Business**, dressed exactly as
03 §7.2 mounts it: **Listings** (view · table+board, fed by her feed) · **Leads** (view · board
ranked by response-owed) · **Farm** (workshop · timeline/planner bench with a gallery flank — the
mailing craft: postcards, drops, segments) · **Showings** · **Brand** (workshop · gallery) ·
**Paperwork**; "Routine" is the family's word for recurring work. At a barbecue, Dave Kowalski
asks for the same.

At the Bar: *"set Dave Kowalski up like Mom."* The chip:

> `→ new Client · based on: Mom's setup`

Dave's world is not another Mom's: it is the **derived agent world** — Client-kind, because the
operator now serves a counterparty — wearing the learned real-estate layer over the base client
shape (Appendix A holds its full dressing). The Proposal arrives **pre-answered by that
layer**: presentation ("Dave Kowalski — Client · Real-estate agent · $300/mo"); areas Listings ·
Leads · Farm · Money; Routines (new-listing announcement on his feed's events, open-house
follow-up, monthly market update — each with cadence and cost); seed artifacts — the postcard
recipes and the market-update template, each carrying its provenance chip ("earned: Mom's Real
Estate"). The intake asks are only what is genuinely Dave's: his listing-feed (MLS) credentials
as a grant scoped to his world, his sender identity, his farm-area zips — and the print-vendor
connection his Farm drops will exit through, granted to his world, never reached through Mom's.

**The binding line this journey proves: patterns travel, data doesn't.** Mom's contacts, her
sellers' sold prices, her thread history — none of it appears in the Proposal, because none of
it may cross. What crosses is the distilled shape of what worked, stamped with where it was earned.

Ninety seconds of review, grants approved, charter. Dave's Desk stages his three intake asks.
Nothing was assembled by hand — the no-second-assembly test, passed at n=2.

### 2.2 The workshop beat — the postcard session

In Mom's **Farm** workshop — the timeline bench holds the drop's schedule; a gallery flank
holds the cards, the composed primary+flank pair the mailing craft needs (16 §5) — the spring
farm drop: gather (her recent solds, the neighborhood's palette, and the real-estate domain
pack — whose criteria include fair-housing language rules); diverge into eight variants on the
gallery flank; critique scores each with why. Variant 5 comes back 4/10: "implies neighborhood exclusivity — fails the fair-housing
criterion." The operator opens the rubric, reads the criterion and its citation, and understands
*why* — a mastery event the score alone would not have produced. Converge on two; commit →
Mission: "print and mail the spring farm drop" — the print-vendor exit stages in the Queue with
the final artwork and the recipient count inline.

### 2.3 The tenth and the fiftieth

The tenth agent's Proposal takes under a minute: everything is pre-answered except the grants
and the isolation review, which can never be skipped — counterparty rungs of the ceremony ladder
do not compress below one explicit review, at any n. The fiftieth agent begins as an event that
may not create: the referral form on the operator's site submits, and an inbound request from
someone with no world **seeds, never spawns** (09 §8.3 — events obey the same four tests
utterances do). A prospect record lands in the operator's own business world's funnel,
source-stamped "referral: Dave." When the call happens and terms are agreed, the operator says
so at the Bar ("Priya said yes — $300 a month"); close-won stages the spawn proposal (09 §8.1),
and the fiftieth agent world waits in the Queue, pre-populated from the record.

Fifty agents produce **zero new navigation**. They produce one **Agents lens**: table rendering,
grouped by farm area — health, listings live, sends this week, money — every signal cell a drop
into that agent's Desk pre-focused on the row's reason. The Field still renders a handful of
orbs: the two agents who need the operator, the quiet band, and the count. The Brief speaks at
portfolio grain: "48 agents quiet. Dave's open-house follow-ups doubled replies again. Priya's
feed connection expires Friday."

### 2.4 Inherited-improvement adoption

Six weeks in, the operator improves the open-house follow-up *inside Dave's world*: a session
on the follow-up Routine's own recipe bench (every routine's recipe opens its workshop — 05
§5.2) turns the single next-day email into a same-evening text + next-morning email pair. Outcomes prove it (2.1× replies across six weeks); the Playbook lesson passes the
gate; then the system proposes promotion: "This pattern outperformed the shared version — offer
it to your other agent setups?" On approval, the pattern enters the shared learned layer — and
**every derived world receives a proposal, never a mutation**: "Your agent setup improved: adopt
the two-step open-house follow-up? (earned: Dave Kowalski, 6-week evidence)." The Queue stages
them batch-by-class; the operator adopts for 41, skips 7 whose counterparties dislike texting —
each skip recorded as a local diff that future proposals respect. Mom's world adopts it too:
improvement flows *back up* the lineage as easily as down.

### 2.5 Ongoing use

**Day 2 (Dave).** His first new-listing announcement waits in the Queue, full draft inline,
listing row attached. **Day 30.** Follow-up classes have earned autonomy in the worlds with
clean streaks — per world, per class, each dial revocable in one gesture from the row it
governs. The monthly market updates digest into one Brief line with 48 taps of evidence behind
it.

### 2.6 When it goes wrong — the isolation near-miss

Composing Dave's market update, the operator says: *"use the sold-price case study from Mom's
spring mailing."* The chip renders the crossing treatment — this reading reaches into another
world — and the Counsel answers before anything moves: "That case study is built on sold-price
data belonging to Mom's sellers — counterparty data, and it stays in her world. Patterns
travel, data doesn't. The *format* is another matter: it scrubs clean. Want me to propose it —
emptied — to the shared playbook, and fill it with Dave's own solds?" The operator says yes.
The promotion walks the gate with its scrub preview ("removed: every seller row, every price;
kept: structure, framing, the three-chart layout"); the emptied format lands in the shared
layer with provenance ("earned: Mom's Real Estate"); Dave's numbers fill it. This is 17 §7.2's
refused-promotion path exercised in situ: the case study itself is refused — its value *is* the
counterparty's data — and only the format promotes, empty. The near-miss dies at the reference:
nothing crossed, the refusal is logged in the session Ledger, and both Faces continue to show
zero grants between the two worlds — which is the honest state of the relationship.

### 2.7 The mastery loop

Postcard outcomes annotate their variants ("this one: 3 calls, 1 listing appointment") and roll
into each world's Playbook; promotion with provenance moves only the pattern. The fair-housing
criterion in every critique is the domain pack teaching where it matters — in use, on real
drafts, never as courseware. By the fiftieth agent the operator is measurably better at this
business — and so is the setup itself, which is the point of running fifty on one grammar.

---

## Journey 3 — The Artist / Mural Business

*Scenario: an artist (Marco, the operator's brother) whose mural-and-prints business gets a
tailored feel — without becoming a separate app.*

### 3.1 Entry and the wrong guess

At the Bar: *"help me run my brother's mural business — commissions, plus he sells prints."*
The chip:

> `→ new Client · mural business · counterparty: Marco`

The router hears "brother's business you serve" and guesses the client shape — a counterparty,
an isolation contract, invoicing. The Proposal says so plainly ("Client · serving Marco ·
isolation review"). The operator, moving fast, accepts. The guess is wrong, and the system will
pay for it honestly in §3.5 — the cost of a wrong guess is deliberately low, which is why the
charter didn't interrogate.

### 3.2 What exists now — the tailored feel

Marco's Murals opens feeling like a mural-business app, and is not one. The mural dressing — 03
§7.3's, verbatim — does all of it; only the *kind* is wrong (Money dresses
invoice-the-counterparty, and an isolation contract exists — the mistake §3.5 corrects back to
03 §7.3's Business reading). The dressing: areas **Commissions** (view · board by stage: inquiry →
concept → deposit → wall → final) · **Concepts** (workshop · gallery/variants bench — where
wall mock-ups diverge, get critiqued against the client's space, converge) · **Portfolio**
(view · gallery) · **Outreach** (workshop · table+map bench — the opportunity-discovery
pattern, 16 §14: the watch's catch as scored rows, walls and RFPs clustered by neighborhood) ·
**Inquiries** (view · each with site photos and space notes attached) ·
**Money**, with **Prints & products** and **Site** unformed at the edge ("could grow here");
the Face's health read from the world's own vitals — commissions by stage, unanswered inquiries
and their age, deposits owed vs. received, portfolio momentum ("2 proposals out · deposit owed
on the brewery wall"); the Counsel's stance is gallerist-producer (protects studio time, prices
from evidence, describes only what is visible in an artwork); the Desk stages what a mural
business needs staged ("two commission inquiries need proposals — site photos attached"); the
terminology skin says "Commission," never "Deal," and "Studio" for every workshop. Underneath, the skeleton is untouched:
the same Bar, the same Queue, the same posture dial, the same artifact frames. Tailored feel is
the dressing being *total* while the grammar changes nothing — that is how it stays learnable
alongside the Agency and never becomes a disconnected mini-product (anti-goal, §15).

### 3.3 The workshop beat — the commission proposal

The Riverside Cafe wants a wall. The **Concepts** studio opens on its gallery/variants bench:
gather (the cafe's site photos, wall dimensions, Marco's style references, the mural domain
pack — criteria: sightlines from the street, palette against the building, weather durability,
honest scope-and-price); diverge (three concept boards over the wall photo); critique with why
("Concept 2's detail band sits below sightline from the crosswalk — invisible to foot
traffic"); converge; commit → the proposal document, the surviving boards riding as its pages,
versioned, provenance to the session. Two exits stage in the Queue. First a **Share**: Marco is
not an operator, and operator surfaces never travel (11 §8.2) — his look at the concepts is a
gated review link (07 §2.5), a `/shared` page carrying exactly the boards it names, shell-less
and revocable (11 §8.3). Marco opens it on his phone, picks concept #2, and the pick lands as
an annotation row on the artifact — counterparty sight is rows, never a seat. Then the send to
Riverside, full document inline, which the operator approves.

### 3.4 Ongoing use

**Day 2.** The Brief: "Riverside opened the proposal twice; no reply yet. Two new inquiries
acknowledged — drafts only, per the routine named at charter." The world's clock work is still
exactly what its Proposal listed: inquiry acknowledgment, deposit reminders, and the opt-in
opportunity watch (03 §7.3 — sources, cadence, and cost named at charter), which fills the
Outreach bench with scored wall leads and stages pitches propose-only, never sends. **Week 2 — the
earned reveal.** Print sales keep arriving by DM, and the evidence trips the reveal:
**Prints & products** mounts from unformed through its one-line proposal. The drop cadence is
born the only way recurring work is born (06 §3.6): a Concepts-bench session's commit rail —
"→ Automation: Tuesday print drop" — with cadence, per-run cost, and the one grant it needs
(posting to the shop's social account, scoped to this world) named on the proposal. Heartbeat
traces on the drop Automation are one tap away wherever its posts appear. **Day 30.** Three
clean gated drops in, the Queue offers the posting-class dial and the operator turns it;
commission proposals will never be offered away, by the operator's own dial — some classes
should stay gated forever, and the dial belongs to the operator, not the streak.

### 3.5 When it goes wrong — the wrong-genome guess, corrected

Week 3: the Desk stages "invoice Marco for March — $180." The operator, at the Bar: *"stop
invoicing my brother — we run this together."* The chip:

> `→ Marco's Murals · change setup: Client → family business`

The re-genome proposal shows exactly what changes and what cannot: Money re-dresses from
invoice-the-counterparty to shared income and costs; the isolation contract is dissolved **by
explicit review** — each formerly counterparty-scoped item (his contact list, the commission
records) is shown and re-scoped to the world deliberately, not silently; the areas, artifacts,
Ledger, Playbook, and thread history do not move, because nothing ever moves. One confirmation.
Same world, same identity, same memory — different kind. The wrong guess cost one staged move
and a sentence, which is the designed price (evolution is identity-preserving; correction is
cheap by construction). One thing the correction does not create is a second operator: the
architecture has exactly one (08 §0). "We run this together" changes the money's dressing, not
the doors — Marco's window stays what it has always been, shared pages minted through the Queue
and the conversation thread.

### 3.6 Transitions

Prints & products, mounted from unformed in week two, is quietly outgrowing its home — its own
audience, its own money rhythm. When it
passes the lifecycle test, the system will propose a split into a linked world with lineage.
Not yet; the proposal will wait until the evidence is real, because pushing a split early is
theater.

### 3.7 The mastery loop

Proposal outcomes annotate the artifacts: proposals with site photos and a street-view sightline
mock win 2× — a Playbook lesson Marco's Counsel now cites in every gather phase. The critique
criteria were edited to Marco's own convictions early on (his rule, entered by the operator
from their studio conversations: "never paint over brick detail without saying so in the
proposal") — the rubric is his taste made explicit, which is
what makes the critique feel like *his* studio and not a generic scorer. The operator, who is
not an artist, has learned to read a wall — the domain pack in use.

---

## Journey 4 — The Clothing Brand from the Brother's Artwork

*Scenario: a clothing brand (Thread & Stone) built on Marco's art. Required beats: the
authorization grant from the artist world, the apparel workshop session beat-by-beat, and the
coexistence of creative and operational work.*

### 4.1 Entry, and the grant

At the Bar: *"I want to start a clothing brand around Marco's artwork — call it Thread &
Stone."* The chip:

> `→ new Business · clothing brand · needs: artwork from Marco's Murals`

Venture rung of the ceremony ladder: a light Proposal, one confirmation. The dressing is 03
§7.4's: **Collection** (workshop · gallery/variants bench — the **Collection Studio**) ·
**Brand** (workshop · document+gallery) · **Launch** (workshop · timeline/planner bench) ·
**Store** (view → the site as deep artifact — *unformed* until the brand actually sells; the
money rung will mount it) · **Content** (workshop · board bench), with Suppliers and Money in
More. No clock work yet. The one heavy element is the connections block: **"Authorization:
Marco's artwork — the print-licensed set (12 pieces) — from Marco's Murals."**

The grant is executed from the *artist world's side*: a Queue item scoped to Marco's Murals —
"Thread & Stone requests use of the print-licensed collection (12 pieces) — grant?" — with the
pieces listed. Both worlds are the operator's, so the approving actor is the operator too —
standing in the granting world's Queue as that world's steward, its records and its gallerist
stance in the room; that is what "from the artist world's side" means. A counterparty never
acts inside an operator's Queue; where Marco's own yes matters, it lives in the conversation
and on shared pages. Approved, the grant appears on **both Faces** ("grants → Thread & Stone:
12 pieces" / "granted ← Marco's Murals"), revocable from either, and every use of every piece
anywhere in Thread & Stone carries its provenance chip. Cross-world material moves through
grants or it does not move.

### 4.2 The apparel session, beat by beat

The first Collection Studio session, on the gallery bench — the six-part grammar doing exactly
what it exists for (16 §13.1 narrates this studio's later "fall drop direction" session in the
same grammar):

1. **Gather.** The Palette arrives loaded: the 12 granted pieces (each chip: "Marco's Murals ·
   granted May 12"), the brand-values note from the charter, the apparel domain pack (criteria:
   print integrity at garment scale, colorway safety, placement conventions, read-at-distance),
   and the Playbook — empty on day one, the pack standing in until lessons are earned. The
   Counsel opens already knowing Marco's linework from the granted set; a generic first
   suggestion here would be a defect, not a shrug (anti-generic invariant).
2. **Diverge.** "Twelve tee graphics from these three pieces." A variant set fills the bench.
   Constraint move: *"more negative space — keep the ink texture."* The set re-diverges under
   the constraint; the Ledger records the constraint and its wording.
3. **Develop.** Place-on-product: the survivors render on tee, hoodie, long-sleeve mockups; the
   colorway move crosses four graphics with three garment colors. All of it is variants on the
   bench — nothing is precious yet, which is what makes divergence honest.
4. **Critique.** Scored against the criteria, every score with its why: "#7 — 6/10: linework
   density falls below print resolution at chest scale; enlarge or simplify." The operator opens
   the rubric, adds a criterion of their own — "must read at 10 feet" — and rescores. The rubric
   is now partly theirs; judgment is transferring, not just output improving.
5. **Converge.** Tournament: twelve to four, side-by-side eliminations, each elimination
   reasoned in the Ledger.
6. **Commit.** Three exits off the rail: → the **drop board** artifact ("Drop 01 — 4
   designs × 3 colorways," versioned, provenance to this session); → a delegation — *"ten more
   explorations of #3's direction overnight, per the ledger"*; and, held until the designs
   settle, → the Mission "produce Drop 01" (§4.3 walks it).

Next morning, the worker's ten variants sit in the *same session*, Ledger-stamped "worker ·
overnight · guided by: converge decision + edited criteria." Three score above the bar. The
drive slider moved from hand to handed-off and back without the room ever changing — that is
drive-mode continuity, felt.

### 4.3 Producing Drop 01 — the mission walked, then coexistence

The held exit fires: **Mission "produce Drop 01."** Its plan spine (06 §2.3), honest states
throughout:

1. **Sampling.** The vendor produces one of each; what comes back lands as annotation rows on
   the four design artifacts themselves ("#3: linework held at chest scale" · "#9's collar seam
   fought the print") — the production-outcome rows criteria pack v4 will cite when "production
   feasibility" earns its place (16 §13.1).
2. **Vendor run — the gate.** The production run is an outbound exit: the Queue item names the
   print vendor as a **connection** (an explicit scoped grant, listed on the Face) and carries
   the run inline — pieces, quantities, colorways, unit and total cost cited to the vendor's
   quote (07 §5).
3. **Production.** Running; "waiting on the vendor" is an honest step state, not a spinner.
4. **Lookbook.** A **Launch**-area session on the timeline/planner bench, where the runway
   vital does its arithmetic on the bench: "the lookbook is the long pole — 9 days of slack
   left," the long-pole math shown (03 §7.4). The shots commit as artifacts the store publish
   will use.
5. **Store publish.** The site deep artifact's deploy — staged in the Queue like every publish
   (07 §4).
6. **Announcement.** The drop post: one gated send.

Each gate wakes the spine when approved ("resumes when you approve the vendor run"); the
mission ends judged against its brief (06 §2.7), the sampling lessons already sitting on the
artifacts they were earned by.

**Coexistence — creative and operational in one world.** When Drop 01 goes on sale, the
operating layer mounts through its own proposal (money rung): **Store** mounts from unformed as
the view over the site deep artifact, and with it the storefront and payment connections,
explicitly granted, scoped to Thread & Stone. The storefront connection's rows land as a
dataset artifact — **"Orders"** (07 §5: per-row provenance, native verb *feed a routine*) —
listed under Store; the **Sell-through** vital reads those rows and mounts as Launch runway
retires (03 §7.4), so every figure survives "which row is that?" (03 §2.2). The **restock
Automation** is born on the same proposal in 06 §3's grammar — trigger: a colorway's inventory
row in the Orders dataset under threshold; recipe: draft the vendor reorder from the rate card;
exit: the purchase order, gated through the Queue like every spend. A fulfillment exception is
a row too: an order the storefront reports failed or stalled files as a Queue item with the
order row inline. Now the same world holds both kinds of work, and the posture dial is how they
share the room: **Create** stages the Collection Studio's open session and the next drop's
critique queue; **Execute** stages orders, fulfillment exceptions, and the restock Automation's
heartbeat; **Observe** stages sell-through by design. Same Desk, differently lit. The operator
flips between making and running without leaving the world, and neither mode buries the other —
the Face reads both: "Drop 01: 38 orders · Drop 02: 4 designs in critique."

### 4.4 Ongoing use

**Day 2.** Brief: "Drop 01 mockups approved; the print vendor exit waits in the Queue (cost
inline)." **Day 30.** The restock Automation runs quietly with its trace one tap away; Drop
02's session resumes from the Continue rail exactly where the tournament left off; three new
pieces arrive granted ← Marco's Murals — the extension approved by the operator standing in the
artist world's Queue, Marco's yes on record in the conversation thread — landing in Thread &
Stone's Palette with fresh provenance chips and a staged Desk move: "three new granted pieces —
place-on-product?"

### 4.5 When it goes wrong — the isolation near-miss at the Palette

Mid-session, the operator searches the Palette for "the courthouse mural study" — a Marco piece
that is **not** in the grant, because it was commissioned work owned by the client who paid for
the wall. The Palette shows it as a reference listing only: greyed, unplaceable, chip reading
"not granted — commissioned work (Riverside Cafe)." It cannot land on the bench at all — the
boundary is mechanical, not advisory. And the advisory layer speaks too: the Counsel, which
knows the provenance from Marco's world's records it is *allowed* to know (grant metadata, not
content), adds: "that one isn't Marco's to license — recommend not requesting it." The
near-miss is over before it began; the Ledger records the refusal; the grant on both Faces
remains exactly 15 pieces. If the operator disagrees, the path is explicit: an extension request
into Marco's Murals' Queue — where the operator, standing as that world's steward, would
decline it for the stated reason.

### 4.6 The mastery loop

By session three the operator predicts scores before the critique lands — the rubric has done
its real job. After launch, outcomes annotate the designs themselves: "#3 black: 21 of 38
orders." The gated Playbook lesson — "hand-inked texture outsells flattened fills 3:1" — is
cited by the Counsel in Drop 02's gather phase, with the sales rows behind the claim. Marco's
art is the brand's soul; the Playbook is becoming its commercial judgment; the operator now
owns both.

---

## Journey 5a — The Outbound Outreach Automation (Podcast Outreach)

*Scenario 5's outbound thread: a recurring outreach chore that matures from hand-work into a
Standing Order — with no workflow-builder ever forced on the operator. (The scenario's inbound
thread — "automate this inbox" — is Journey 5b.)*

### 5.1 The chore, done by hand — weeks one and two

The operator pitches themselves for podcast guest spots. Week one, at the Bar: *"draft intro
emails to these eight podcast hosts"* (a list pasted in). The routing is genuinely ambiguous,
so the Bar asks its one disambiguating line (02 §3.6) — never a picker, never a modal:

> Where should this live? · **new world: Podcast Outreach** · **the Agency** · **a one-off
> batch** · neither — let me rephrase

The one-off is a weight choice, not a location choice: every session lives in some world's
workshop-area (16 §6), so "a one-off batch" births the same light world and simply promises
nothing recurring. The operator taps the first option. And because outreach is operating
weight — a curiosity can never send (09 §2; 04 §9.3) — the world charters at **rung 1 with one
grant**, a light Proposal on one screen: name ("Podcast Outreach"); an Automation-kind-to-be
that starts as barely more than a container; zero routines; and the single connection sentence
that is the ceremony's whole weight: **"Send email as you@… — scope: this world only"**
(09 §4.7: nothing is inherited silently, not even the operator's own accounts). One confirm.
The **Outreach Studio** opens (document + table benches composed): hosts on the table flank,
message variants on the document side. Critique runs the outreach criteria — specific to the
show, honest, and the hard gate: a placeholder token can never pass to a send. Eight drafts
commit → eight approvals in the Queue → sent. A finite batch; a small mission; done.

Week two: *"same thing — new rows."* Same session resumed from Continue, same beats, faster.

### 5.2 The proposal — week three, and no workflow-builder

On the third Monday, the system proposes — as a staged Desk move, not a popup: "Third Monday
running. Make this a weekly Automation? Recipe: your last three sessions' ledger." The proposal
shows the recipe **as prose plus the Ledger**, because the Ledger already *is* the workflow:

- **Trigger:** "Mondays 9am, from new rows in **'Podcast hosts'**" — and the proposal commits
  the list, until now bench material, as a **dataset artifact** of that name, because bench
  material is unversioned and killable and never feeds a routine (16 §4.1); a dataset's native
  verb is *feed a routine* (07 §5). The recipe reads: "reads: dataset 'Podcast hosts'." New
  hosts enter by paste at the Bar — chip: `→ Podcast Outreach · add 5 rows to 'Podcast
  hosts'` — each row stamped with its entry provenance.
- **Steps, in plain language:** draft per host from the winning variant family · skip anyone
  previously emailed · queue for approval · one follow-up after 5 days if no reply.
- **Connections:** it already sends as the operator (granted at charter); one new grant row:
  **"Reads replies in your inbox — needed by: the 5-day follow-up rule and reply tracking.
  Scope: this world only."**
- **Gates:** first-touch always walks the Queue; follow-ups start gated too — and if reply
  visibility is ever lost, follow-up rungs pause and file a Queue item; a follow-up never
  fires blind.
- **Budget:** max 12 sends/week, cost shown.
- **The promise:** a heartbeat trace, always one tap away; silence will be loud.

One confirmation. A Standing Order exists; the interface calls it "Automation: Monday podcast
outreach." **At no point did a node-graph editor appear.** The recipe was earned from the
ledger and edited by talking (*"skip hosts I've emailed before"* was a sentence, and became a
step). The flow bench exists — opening the Automation's own workshop shows the recipe on it,
inspectable and hand-editable — but it is the third layer (inspect), reached only by those who
want it, never a prerequisite for automating. Maturation is a slider, not a builder.

### 5.3 Ongoing use

**Day 2 of automation.** Monday 9:04, the Pulse: "6 outreach drafts waiting." Approvals inline,
ninety seconds. **Day 30.** The follow-up class has five clean weeks; the Queue offers the
dial; the operator auto-approves follow-ups. First-touch never appears in an offer at all:
first contact with a never-before-contacted recipient is structurally ineligible for autonomy
(05 §8.3), podcast hosts included — the dial only ever chooses among classes the system may
offer. The operator would have kept it gated anyway; their name is on these emails. Every
auto-approved follow-up remains in the ledger view; the Brief digests Mondays in one line.

### 5.4 When it goes wrong — silence is loud

Week seven, the email connection expires — a re-auth the provider demanded. Monday 9:00 passes;
nothing fires. The Clock notices the missed heartbeat within the hour: the Pulse ticks, the
Queue carries "Monday outreach didn't run — email connection expired," and the Brief says it in
words the next morning. The same lapse took reply visibility with it, so the follow-up rungs
due that week paused and filed into the same Queue item rather than firing blind — the
fail-closed rule from the proposal, exercised. The failure mode recurring work must never
have — quietly not happening — is structurally impossible: the Automation's absence is itself
an event. Reconnect is inline from the Queue item; the run fires late, reports what it did, and
the heartbeat trace shows the gap honestly rather than papering over it.

### 5.5 Transitions and the mastery loop

The world stays small on purpose — not everything grows. If guest spots start driving real
business, the promotion offer will come (intent language and artifact creation are the
signals); until then, an Automation-kind world with one routine and one studio is a complete,
respectable citizen. The mastery loop runs regardless: reply outcomes annotate the variants
("mentioning a specific episode: 3× replies" — gated into the Playbook and cited by the Counsel
in week nine's drafts), and the studio shows predicted vs. actual reply rate each month — a
small calibration honesty that keeps the operator's instincts, not just the templates,
improving.

---

## Journey 5b — "Automate This Inbox" (Support Inbox)

*Scenario 5's inbound thread — 01's S5 definition verbatim: "automate this inbox"; a background
capability on a trigger. The world this journey births wears 03 §7.5's dressing, and its
Recipes bench is 16 §13.5's exemplar; this journey supplies the end-to-end walk those documents
cite.*

### 5.6 Entry and charter — proposal + mailbox grant

At the Bar: *"automate this inbox — support@…"* The chip:

> `→ new Automation · Support inbox`

A background capability, but real weight — reading a mailbox and drafting under the operator's
name — so the ceremony is exactly 03 §7.5's: **proposal + connection grant (the mailbox)**. One
screen: presentation ("Automation · Support inbox"); areas **Activity** (view · the ledger of
every draft and send, each with its heartbeat chip and flight recorder) · **Recipes**
(workshop · flow bench with a table/dataset flank — this *is* the background capability's
workshop, drive mode automated, same six-part anatomy) · **Conversations** (view); vitals
Heartbeat · Intervention rate · Latency; the routine named with cadence and cost ("watches the
mailbox · classifies · drafts · nothing sends unapproved"); and the grant sentence: **"Read and
draft in support@… — scope: this world only."** One confirm. Born at Observe — the honest
posture for a world you mostly watch — and propose-only, like everything at birth (05 §8.1).

### 5.7 The first recipes — extraction and classification, gated

Day one runs are watched, not trusted. The routine classifies inbound (order status · shipping ·
refund · else), extracts what a reply needs (order number, address, the question actually
asked), and drafts per class; every draft queues, every row's flight recorder shows which rule
fired and what was read. The operator's red-pen edits are the teacher: three edits to shipping
replies in week one become recipe v2 through the arming proposal — a recipe is a workflow
artifact, and its publish is a gated arming, never a silent mutation (07 §5). The flow bench in
Recipes shows the rules plainly for whoever wants the third layer (inspect); nobody is ever
required to visit it to have an inbox automation, which is Journey 5a's no-workflow-builder
promise holding on the inbound side too.

### 5.8 Maturation — the dial, per class

Five clean weeks of shipping answers earn the offer, staged from the Queue and mirrored on the
Desk: "Five clean approvals of shipping questions — auto-approve this class? Instantly
revocable" (03 §7.5's own Desk line). The operator turns that class and no other: refund
requests outside policy remain decide-me forever, and the Intervention-rate vital argues the
dial honestly in both directions — a rising rate is the world's own case for turning it back
(05 §8.4).

### 5.9 When it goes wrong — recipe repair through the gate

Month two: "routine flagged: 3 supplier invoices filed as newsletters this month." The Queue
item opens a Recipes session — 16 §13.5 narrates it beat by beat: the misses on the table
flank, two candidate rules as marked branches on the flow, test-on-one by hand, dry-run over
the 30-day history with no exits fired, the comparison scored against precision · recall ·
attention cost. Recipe v4 arms through its proposal — and because the edit is material, the
affected class drops a notch on the autonomy ladder and the heartbeat trace says so: "recipe
changed Tuesday — proposing again until 5 clean" (05 §8.3). Repair widens nothing silently.

### 5.10 Day 30 and the mastery loop

The Desk's quiet line is the product working: "41 handled this week; nothing else needed you."
When the mailbox connection fails at 3 a.m., the Queue holds the failure by morning and the
Brief leads with it — silence is loud here exactly as in 5a. The mastery loop reads from the
vitals: intervention rate falling month over month is the system graduating; latency honest to
the minute; each gated recipe version carrying its dry-run evidence forward. The operator has
used it for months and never once navigated *to* it — there is nowhere to go; its heartbeat is
one tap from every draft it produces (01 S5).

---

## Journey 6 — The Rabbit Hole That Becomes Real

*Scenario: free exploration promoted to a venture. Required beat: "make this real," felt
beat-by-beat.*

### 6.1 The free fall

Tuesday night, at the Bar: *"why do all the good coffee carts around here vanish within a
year?"* The chip:

> `→ new curiosity · "why do coffee carts vanish?"`

Enter. No form, no name, no dialog — the ceremony ladder's free rung. An Exploration exists
because the first exchange does. The surface is conversation-forward with the live map growing
in the margin: nodes for permit churn, commissary costs, the winter revenue cliff, the used-cart
resale market. *"Hold that thought — who ends up owning the carts when they fold?"* parks a
beacon: a named gap with the held guess, listed, aging, revisitable. Two hypotheses become
first-class map objects — H1: permits churn them out; H2: winter cash gap kills them — claims
with evidence edges, comparable side by side.

### 6.2 The workshop beat — the theory bench

*"Take this into a workshop."* The theory workshop opens on the map/graph bench, the
exploration's map riding along in the Palette. Hypotheses become rows with assumptions,
evidence, and **predictions** — "if H2, failures cluster January–March" is captured as a
calibration row with a date it can be judged on. The critique here is epistemic, and it teaches:
one node comes back flagged "this is a guess wearing a citation — the source says permits
*renewed*, not *lapsed*." The operator fixes the edge and doesn't make that mistake again.

### 6.3 Decay, return, and the signals

Weeks pass. The exploration compresses, then goes dormant — a rendering decision, not a storage
event. A return visit three weeks later wakes it exactly as left. A second return builds a cost
model (table bench; committed as an artifact). A third produces the sentence: *"someone should
sell a permit-ready cart package. Honestly — I could."* Return visits, artifact creation, intent
language: all three promotion signals have fired. The system offers quietly — a staged move on
the exploration's Desk, not a popup: "This has the shape of a venture. Make it real? Nothing
about the map would move."

### 6.4 "Make this real" — beat by beat

The operator says it at the Bar. What follows is the promotion doctrine, *felt*:

1. **The Proposal renders around the live map** — the map stays fully visible, because the
   point is that it isn't going anywhere. Over it: the name ("Cart Kit"), what mounts (Offer ·
   Customers · Money — Money *unformed* until money actually moves, 03 §4.4), what it asks (one
   intake: which city first), what it costs (one
   Automation: a weekly permit-listing watch, cost in cents shown), and what carries — the map
   as the world's knowledge core, the two open beacons becoming the first mission's questions,
   the calibration rows continuing to run toward their judgment dates.
2. **One confirmation.** Venture rung. No connection grants yet because nothing outbound exists
   yet.
3. **The world grows around the map.** No cut, no export, no new empty thing: the same map is
   now the world's knowledge graph; the Face appears above it ("Cart Kit — Business · exploring
   → validating"); the Desk stages mission one ("validate demand: ten conversations with cart
   operators — two are named in your map already"). The Continue rail still resumes the original
   exploration session — which is now simply this world's exploration, unbroken.
4. **Nothing is re-asked.** The intake asks exactly one thing the map doesn't already answer.
   Re-asking an answered question after promotion is a defect, testably.

### 6.5 Ongoing use

**Day 2.** Brief: "Cart Kit: 2 of 10 conversations booked. The permit watch found 3 new
listings — on the map." The conversations themselves happen off-platform — the operator texting
cart operators from their own phone, two of them already named in the map — and the outcomes
are logged at the Bar as rows; the world still sends nothing, which is why it still holds no
sending grant (09 §4.7; the day outreach should leave the system, the grant ask will stage
first, as §6.6's portal grant does). Discoveries keep landing as map nodes; operating work and
exploration share the world, because the posture dial — not a wall — separates them. **Day 30.** The Offer
area holds a one-pager in critique; the winter-cliff hypothesis is two months from its judgment
date; the world's health reads in venture terms now (open questions closing + conversations
converting), because the dressing changed when the kind did.

### 6.6 When it goes wrong — the blocked mission

Mission "validate demand," step 3: pull the permit-holder list. The step blocks — the city
portal requires an account the operator never connected. The plan spine says it with complete
honesty: "blocked on: city permit portal — resumes when connected." The Queue carries the block;
the operator snoozes it a week; the mission stalls loudly but politely — one Brief line, no
escalating theater, because manufactured urgency is banned even for the system's own blocked
work. When the operator finally connects the portal (an explicit, scoped grant), wake-on-approval
resumes the plan mid-step. Nothing was lost by the wait, and nothing pretended to be fine.

### 6.7 The mastery loop

March closes the calibration row: "your Jan–Mar failure-cluster prediction: hit — 7 of 9 tracked
carts went dark in the window." The hit-rate is shown honestly, including the misses (the permit
hypothesis scored 1 for 4). The operator's next venture will be built on hypotheses they know
how to weigh — the theory workshop's criteria did for their reasoning what the apparel rubric
did for their eye.

---

## Journey 7 — The Builder: A Deep Build Session Inside Its World

*Scenario: the deepest workshop — a real build, connected to its parent world, never a parallel
universe.*

### 7.1 Entry — the brief the operator doesn't write

Inside Cart Kit, at the Bar: *"build the booking app — vendors book the cart by the week."* The
chip:

> `→ Cart Kit · Build Studio: vendor booking app — mounts the App area (one confirm)`

Cart Kit chartered with Offer · Customers · Money; no area owns a build yet, and deep-artifact
sessions are addressable only under the area that owns them (11 §6.2). So the utterance carries
a composed-workshop proposal (16 §12: one card, one confirm — this creates an area): bench
archetype `code+preview` with the reason stated, the verbs it mounts, starter criteria, palette
wiring. One confirm and the **App** workshop-area exists; the Builder opens as a workshop *of
this world* — code+preview bench, uncompromised depth, same six-part grammar. The Palette arrives loaded from the world's memory: the exploration's pricing
nodes, the cost-model artifact, the Playbook, the brand-tone note. The Counsel compiles a
five-line brief *from what the world already knows* and asks for confirmation, not composition.
The operator edits one line. A builder that opened blank here — with a map, a cost model, and
ten interviews sitting in memory — would be the anti-generic invariant's canonical defect.

### 7.2 The session — the craft loop at full depth

**Gather** (done — the brief). **Plan:** the architecture renders on the bench as an
inspectable thing (07 §8.4) — screens (browse · book · confirm), the booking flow, data shapes
(vendors · bookings · availability), integrations needed (payments) — editable before
generation. The operator amends one line (weekly blocks, not daily); the amendment lands in the
Ledger; generation will follow the plan and name its deviations ("availability derived from
bookings, not a separate table — simpler"). **Diverge:** three structural directions for the
booking flow, built as *running previews side by side* — variants are real and comparable, not
sketches.
**Develop**, with the drive slider doing its work in one room: the operator hand-edits the
pricing copy (hand), asks for the availability calendar (ask — it lands as a change they watch),
and hands off the responsive pass (handed off — the worker continues the same session, guided by
the Ledger). **Critique**, against the product criteria pack: honest empty states, one-thumb
mobile booking, no dark patterns, every price the true price — scored, each score with its why.
**Converge** on direction B. **Commit:** → the deep artifact "Booking app v0.3" (version rail,
provenance to this session, opens back into this bench from its frame); → Mission "ship v1"
(steps: content pass · payments connect · deploy — deploys are outbound exits and stage in the
Queue like any other crossing).

Overnight: *"worker — finish the empty states and the confirmation emails, per the ledger."*
Morning Ledger: "worker · overnight · 9 changes · guided by: critique items 3, 5, 6" — a report
card on the bench, nothing committed, nothing sent (05 §6.3). Two changes score below the bar;
the operator kills them on the bench — kill-with-why, kept in the Ledger — and does those two
by hand before accepting the rest; the accepted result commits as **one** version on the
artifact's rail, because rails gain rows only at commits, never per keystroke or per worker
change (07 §2.2). Who did what is never in doubt.

### 7.3 Connected to the parent world — every seam

The build is not a parallel universe, and the connections are concrete: the mission renders on
Cart Kit's Desk as running work; the Brief digests overnight worker progress ("Booking app: 9
changes reported, 2 killed on the bench"); every AI step carries its Activity trail (what it read, did,
decided — inspectable always); the deploy exit is stamped with the world's scope in the Queue.
And after launch, the loop closes *into the world*: the first five bookings annotate v1
("weekly-rate framing converted; daily-rate didn't"), the lesson gates into Cart Kit's
Playbook, and the app **mounts back** — a "Bookings" area appears in Cart Kit, a view over the
app's real rows. The thing the world built became part of the world's own surface: creation
extends the creator.

### 7.4 Ongoing use

**Day 2.** Continue resumes the bench mid-critique. **Day 30.** v1 is live; the "ship v1.1"
mission runs on the app's own outcome annotations; the Build Studio — the App area mounted in
§7.1 — is just another area, the deepest one, sitting beside Offer and Customers in the same
3–7 row.

### 7.5 When it goes wrong — the blocked build

The "ship v1" mission parks at payments connect: the operator's payment account exists but is
scoped to Thread & Stone, and **connections are scoped even when both worlds are yours**. The plan
spine: "blocked on: payment connection for Cart Kit — your account exists but isn't granted
here. Grant it?" One explicit, scoped grant from the Queue; the mission wakes. Then the deploy
step itself blocks: the pre-flight check fails — the booking form loses its state on
back-navigation. The Queue item carries the failing check with the Activity trail's reproduction
inline; the operator drops from the Queue item straight into the session at the failing state,
fixes it on the bench, and the deploy re-stages. Two blocks, two honest states, zero mystery —
the flight recorder means "why is this stuck?" is never a research project.

### 7.6 The mastery loop

The product criteria pack taught the operator to design empty states before happy paths — by
scoring their absence, with reasons, on their own work. The conversion prediction made at
converge ("25% of visitors book") closes against reality (19%), and the gap itself is annotated
and kept. If the booking app someday deserves to be its own product — its own audience, its own
lifecycle — the four tests will say so, and it will *spawn* as a linked world with lineage,
never be cut out of this one.

---

## 8. What the journeys prove together

Read as one portfolio, the eight walks of the seven scenarios close the loops the constitution
demands:

1. **One grammar, eight feels.** Rosa's client world, Dave's agent world, Marco's studio,
   Thread & Stone, a podcast routine, a support inbox, a coffee-cart venture, and a build
   session share one skeleton and never once feel interchangeable — consistency via the
   grammar, variation via dressing, exactly as bound (§5, §15).
2. **Workshops are load-bearing everywhere.** Every journey passed through a bench: outreach
   (document+table), site (preview), the farm mailing (timeline+gallery), concepts
   (gallery/variants), apparel (gallery at full depth), recipes (flow), theory (map/graph), and
   the Builder (code+preview). No journey completed on forms and lists alone — because the
   crafts are where the value is made.
3. **Every journey taught the operator something with evidence attached.** Criteria in critique,
   outcomes on artifacts, gated Playbooks, calibration closed honestly, patterns promoted with
   provenance. Mastery was never a separate feature in any journey; it was the texture of use.
4. **The four failure classes are handled where they live:** bounced sends halt their class and
   surface with evidence (J1); a blocked mission states its blocker and wakes itself (J6, J7); a
   wrong-genome guess is corrected by one sentence, identity preserved (J3); an isolation
   near-miss dies at the reference or the Palette, mechanically, with the refusal on the record
   (J2, J4).
5. **Scale never added chrome.** Ten clients, fifty agents, a hundred worlds: rows in lenses,
   orbs in an attention-ranked Field, one Queue, one Brief. The hundredth-world test holds in
   every journey that grows.
6. **Nothing was assembled twice, and nothing was lost by growing.** Rosa's world was born from
   the funnel's own rows; Dave's from Mom's learned layer; Cart Kit grew around its map. The
   no-second-assembly and promotion-without-loss tests are not aspirations in these journeys —
   they are the plot.

*Cross-references: 02 (shell mechanics every journey stands on) · 03 (the world grammar all
seven dress) · 04 (journey 6's mechanisms in full) · 05 (drive modes, journeys 4, 5, 7) · 06
(mission/automation behavior, journeys 1, 5, 6, 7) · 07 (artifact frames and the Builder,
journey 7) · 08 (the lenses of journeys 1 and 2) · 13 (acceptance tests these journeys should be
replayed against) · 16 §13 (the exemplar sessions journeys 1, 4, and 5b instantiate).*

---

## Appendix A — The canonical cast, one table

The single reference for prototypes, demo data, and wireframes. Every row instantiates doc 03
§7's worked dressings (and 16 §13's exemplar studios) — nothing here innovates; where a journey
grows a world past its charter, the row records the settled, day-30 state.

| World | Kind · presentation | Areas (body · bench) | Vitals | Counsel stance | Key artifacts | Grants / connections |
|---|---|---|---|---|---|---|
| **The Agency** (J1) | Business · "Agency · 10 clients · $4,850/mo" | Prospects (view · funnel records) · Outreach (workshop · document + table/dataset flank, 16 §13.2) · Clients (view · roster of `serves` edges) · Money (view) | service health · money · needs-you count | direct-response strategist, honesty-forward | pitch templates (recipe-flagged) · audits · demo sites | scrape/search sources · operator's send-as domain |
| **Rosa's Taqueria** (J1) | Client · "Website + Missed-call textback · $500/mo · since July" · Rosa · serves ← Agency | Site (view → deep artifact) · Automations (view · heartbeat rows) · Content · Money (Reports removed at charter) | service · money · owed · momentum (03 §2.4) | service-minded | audit doc · site (draft v1 from the demo) · monthly reports | her business profile · her phone number (rung 3: textback under her identity) · payment collection (deferred) |
| **Mom's Real Estate** (J2) | Business · "Real estate · since 2019 · 2 agents" · edges "setup adopted ×5" (03 §7.2 verbatim) | Listings (view · table+board) · Leads (view · board) · Farm (workshop · timeline/planner + gallery flank — the mailing craft) · Showings (view) · Brand (workshop · gallery) · Paperwork (view); More: Market Notes | Pipeline · Speed-to-lead · Mailings · Money | broker-mentor | postcard recipes · market-update template | listing feed · print vendor. "Routine" is the family's word |
| **Dave Kowalski** (J2 — the derived agent world, the shape "adopted ×5") | Client · "Real-estate agent · $300/mo" · Dave | Listings (view) · Leads (view + follow-up Routines) · Farm (workshop · timeline/planner + gallery flank) · Money (view) | pipeline · speed-to-lead · mailings · money (inherited spec) | broker-mentor, service-inflected | postcard recipes + market-update template (provenance: "earned: Mom's Real Estate") | his MLS feed · his sender identity · his print vendor — each scoped to his world |
| **Marco's Murals** (J3, J4) | Business · "Murals & commissions" · edge "artwork → Thread & Stone · granted, revocable" (03 §7.3 verbatim; chartered wrong as Client in §3.1, corrected §3.5) | Commissions (view · board by stage) · Concepts (workshop · gallery/variants) · Portfolio (view · gallery) · Outreach (workshop · table+map, 16 §14) · Inquiries (view) · Money (view); Prints & products mounts from unformed in week 2; Site unformed | Commissions · Inquiries · Deposits · Portfolio momentum | gallerist-producer | concept boards · commission proposals · the granted-piece set | social posting for the print drop (week 2) · the inquiry mailbox · the opportunity watch's sources (RFP feeds · permit scans, opt-in at charter) |
| **Thread & Stone** (J4) | Brand · "Apparel · first collection" (03 §7.4 verbatim) | Collection (workshop · gallery/variants — the Collection Studio, 16 §13.1) · Brand (workshop · document+gallery) · Launch (workshop · timeline/planner) · Store (view → site deep artifact; unformed until the money rung mounts it) · Content (workshop · board); More: Suppliers, Money | Collection · Craft bar · Launch runway (→ Sell-through at launch) · Money | creative director | Drop 01 board · lookbook · "Orders" dataset | artwork ← Marco's Murals (12 → 15 pieces) · print vendor · storefront + payments (money rung) |
| **Podcast Outreach** (J5a) | Automation · light ("barely more than a container") | Outreach (workshop · document + table); the routine's recipe opens its own flow bench | heartbeat · replies (predicted vs. actual) | outreach-honest, terse | "Podcast hosts" dataset · message variant family | send-as email (charter) · inbox reply reads (promotion) |
| **Support Inbox** (J5b) | Automation · "Support inbox · running since May" (03 §7.5 verbatim) | Activity (view) · Recipes (workshop · flow + table/dataset flank, 16 §13.5) · Conversations (view); More: Reports | Heartbeat · Intervention rate · Latency | dispatcher | recipe versions (workflow artifacts) | the mailbox (read + draft) |
| **Cart Kit** (J6, J7) | Business (promoted curiosity) · "exploring → validating" | the Map (knowledge core) · Offer · Customers · Money · App (workshop · code+preview, mounted §7.1) · Bookings (view, mounts post-launch §7.3) | open questions closing · conversations converting | venture stance, socratic in Think (03 §6.3 layering) | cost model · research map · Booking app | permit-listing watch · city permit portal (§6.6) · payments (§7.5) |

Two footnotes bind: (1) **Harbor Dental** (docs 05/09/12's worked client) and **Jane's Bakery**
(03 §7.1) are Agency clients of this same portfolio — Journey 1 names both — but their full
dressings live in their owning documents; **Rossi Plumbing** (doc 13) is an independent
exemplar, not a cast member. (2) Any document that names these worlds differently is out of
date with this table, not the reverse.
