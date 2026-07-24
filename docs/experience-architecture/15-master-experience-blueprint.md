# 15 — Master Experience Blueprint

*The synthesis of Phase 3. Everything in `docs/experience-architecture/` reduced to one coherent
statement: what the product feels like, how its surfaces fit together, what is binding, what to
prototype first, and where the genuine open questions live. Grounding: the operating model
(`docs/operating-model/operating-model.md`), the design constitution (`_constitution.md`), and
sixteen elaborating documents — authored against the constitution, then adversarially reviewed by
twelve independent passes (seven scenario walks + five cross-cutting sweeps) and repaired.*

---

## 1. The experience in one page

You open the product and you are **Home**: a short, generated **Brief** tells you what happened
while you were away — every sentence tappable to the rows that prove it; a quiet night says so.
Below it, the **Field**: your undertakings — clients, businesses, explorations, automations —
rendered as living entities ranked by *attention, not inventory*; at five worlds it is a handful
of orbs, at a hundred it is the same size. A **Continue** rail resumes exactly where you left
off, mid-session. At the bottom, always, **the Bar** — one input that takes plain language,
shows you its interpretation before acting, and wears a **scope chip** that never lies about
which world it is addressing. Top-right, **the Pulse**: real counts of what waits for you; it
opens **the Queue**, the one place everything outbound pauses for your yes — each item carrying
its full decision context inline, and, over time, offering you earned-autonomy dials backed by
your own approval record.

Say what you're trying to accomplish — "I signed a landscaping company", "why do bee hives
work?" — and the system resolves it to an existing world or **proposes a new one**: a one-screen
Proposal showing the environment it will assemble (areas, automations with their cadences and
costs, seed artifacts, intake questions, connection grants — explicit, scoped, never inherited
silently), based on your proven setups with provenance shown. One confirm charters it. Ceremony
is proportional to weight: a curiosity costs *nothing* and materializes silently; a client with
money flows asks once, properly.

Inside a world, the same five organs always: the **Face** (identity + at most four honest,
evidence-bound vitals), the **Desk** (the world's *now* — staged next moves under a strict
precedence where broken trust and owed judgment always outrank forward motion), 3–7 **Areas**,
the scoped Bar, and a light **posture dial** (Think · Create · Execute · Observe) that re-lights
the room without ever gating anything. Genomes *dress* this skeleton — a website client, a
real-estate agent, an artist business, a clothing brand, an inbox automation, and a rabbit hole
read completely differently — but the grammar never rearranges, so the product is learned once.

Craft happens in **Workshops** (shown as Studios): session-based environments built on one
six-part anatomy — **Bench** (the material, on one of nine archetypes from variant galleries to
code+preview), **Palette** (references, prior work, authorized cross-world assets with
provenance chips, Playbook cards), **Counsel** (an AI that arrives already grounded in the
world and critiques against visible, editable criteria), **Moves** (the craft's verbs),
**Ledger** (every variant, comparison, and decision, persisted), and the **Commit rail**
(outputs become Artifacts, Missions, Automations, or hand-offs to a worker who continues the
same session). Divergence before convergence is the default shape; critique transfers judgment
to you, not just polish to the output. The **Builder** is simply the deepest workshop — full
requirements→plan→generate→edit→preview→branch→deploy depth, wearing a world context strip and
deploying through the Queue.

**Explore** is a posture, not a place: open questions route to a conversation that grows a
**live map** in its margin — branches, beacons ("hold that thought"), sources, competing
hypotheses with evidence edges. Everything auto-persists; free curiosity silently gets a home
(a rabbit-hole world); and "make this real" re-genomes that same world — the map stays, areas
materialize around it, nothing is ever exported or lost.

Finite work runs as **Missions** (visible plan spines that park at your approvals and wake
themselves); recurring work runs as **Automations** with a heartbeat trace — last ran, next
run, what it did — one tap from anywhere their output appears, filing to the Queue when they
fail *or go silent*. Across many worlds, **Lenses** answer "across" (the client pipeline board,
running automations, money roll-up) while Desks answer "within" — and every outcome (replies,
conversions, selections) finds the artifact that produced it, feeds the world's **Playbook**,
and — as *patterns, never data* — makes the next world of its kind smarter.

## 2. The document map

| Doc | Role | Load-bearing content |
|---|---|---|
| `_constitution.md` | The binding spine | Every decision the set elaborates; terminology table |
| 01 Principles | The why | 14 principles + collision precedence (trust > attention; grammar > dressing) |
| 02 Global shell | The chrome | Bar/Pulse/Queue/context-header contracts; Home in full; notifications (3 push classes only) |
| 03 World experience | The grammar | Five organs; Desk staging precedence; dressing contract (12 may / 12 must-not); six worked dressings |
| 04 Explore | The Wonder beat | Conversation+map; beacons; decay+promotion; "make this real" beat-by-beat; fold-in |
| 05 Capabilities | The verb layer | Drive slider (hand→ask→hand-off→automate); one safety story; discovery without a catalog |
| 06 Missions & Automations | The Run beat | Both lifecycles; the trust invariant's enforcing mechanisms, enumerated |
| 07 Artifacts & builders | The Commit beat | One frame, enumerated bodies; universal compare; the Builder as deepest workshop |
| 08 Multi-world | Scale | Lenses; the Field at 5/50/100; ten-clients worked morning; hundredth-world proof |
| 09 Creation | Genesis UX | Utterance→Proposal→Charter; ceremony ladder; setup layering & adopt-proposals |
| 10 Journeys | The proof | All seven scenarios end-to-end with failures handled; canonical cast |
| 11 Information architecture | The map | Two places, four kinds; route grammar; surface inventory; mobile |
| 12 Wireframes | The screens | W1–W10 textual wireframes, desktop+mobile, honesty states |
| 13 Acceptance tests | The gate | Core suite + constitution-clauses-made-falsifiable + guard checks + coverage matrix |
| 14 Open decisions | The residue | 59-item register (OD-01–OD-59) with settling evidence per item |
| 16 Workshop system | The craft foundation | Anatomy; nine benches; sessions; critique; five exemplars end-to-end |
| 17 Mastery | The Learn beat | Domain packs; anti-generic enforcement; Playbook; pattern promotion; calibration |

**Reading orders.** Product designer: 01 → 02 → 03 → 16 → 12 → 10. Engineer scoping surfaces:
11 → 02 → 03 → 07 → 06 → 13. Operator/founder: 15 (this) → 10 → 14.

## 3. The binding invariants (the shortest checklist)

1. **Two places only** — Home and inside-a-World; everything else is a view, surface, or overlay.
2. **Three chrome elements** — Bar, Pulse, context header; fixed positions, never absent.
3. **The scope chip never lies** — it is the isolation instrument; cross-world references
   require explicit grants with visible provenance; patterns travel, data doesn't.
4. **Nothing outbound without the Queue** (or an earned, revocable, ledgered autonomy grant);
   decision context is inline; gates travel with the verb across all drive modes.
5. **Every claim wears its evidence** — Brief sentences, Face vitals, critique scores: all tap
   to rows; quiet is stated, never faked.
6. **One grammar, many dressings** — genomes may change the twelve dressing-listed things and
   none of the twelve forbidden ones.
7. **Recurring work stays visible** — heartbeat traces, silence-is-loud, one-gesture pause.
8. **Ceremony ladder** — curiosity is free and silent; weight buys ceremony, never the reverse.
9. **Identity permanent, kind layered** — promotion re-genomes in place; nothing is exported,
   copied, or lost; dormancy is invisibility with perfect recall.
10. **Workshops open grounded** — generic output despite available context is a defect; critique
    is against visible, editable criteria; the Ledger persists every decision.
11. **The second assembly is a defect** — repetition becomes a proposed setup through the gate.
12. **World #100 adds a row to a lens, never a nav item.**

## 4. The seven journeys, proven

Documented end-to-end in 10 (with failures handled), wireframed in 12:

1. **Agency, ten clients deep** — prospect pipeline lens → review-before-send → close-won
   *spawns* a client world pre-populated (scrape, audit, demo, thread history) → ongoing
   service on automations with a money roll-up.
2. **Real-estate agents, 2nd/10th/50th** — "add another agent based on Mom's setup" reuses the
   learned setup with provenance; improvements propagate as adopt-proposals, never silent
   mutation.
3. **Artist/mural business** — the same skeleton dressed to portfolio/outreach/proposals;
   tailored feel with zero new architecture.
4. **Clothing brand from the brother's artwork** — an authorization grant from the artist world;
   the apparel workshop session (variants → placement → critique → collection) beside
   operational launch missions.
5. **Inbox automation** — assembled from an utterance, matured hand→ask→hand-off→automate into
   a Standing Order with a heartbeat trace; never a forced workflow-builder.
6. **The rabbit hole that becomes real** — free wonder, beacons, hypotheses; promotion grows
   the world around the map with zero loss.
7. **The Builder in its world** — full specialized depth, context strip, Queue-gated deploys,
   research persisting to world memory.

## 5. What carries over from the existing system

The blueprint deliberately lands on the current platform's proven organs: the approval spine
becomes the Queue exactly as built; the heartbeat becomes the Automations layer with its
liveness made visible; `situation.ts` becomes Home's data source; `commander.ts` grows into the
Bar; charters/workshops.ts generalize into genome dressing; the preview/build engines become
benches; the knowledge gate becomes the Playbook's approval flow; mind_decisions becomes the
calibration loop. What the blueprint *retires* was already diagnosed by the author's own audits:
the 25-item sidebar, studios-as-destinations, the five competing front doors, the three memory
rooms, and the parallel container nouns.

## 6. What to prototype first

The dependency-ordered thin slice that proves the design (each step testable against 13):

1. **The shell** — Bar with interpretation+scope chips, Pulse, Queue with one inline approval
   kind (email), context header. *(Tests: context-clarity, evidence-linking.)*
2. **Home** — Brief over live rows + attention-ranked Field + Continue. *(Hundredth-world,
   return-after-thirty-days.)*
3. **One world, two dressings** — client + curiosity sharing one skeleton. *(Grammar/dressing.)*
4. **One workshop end-to-end** — outreach (document bench): grounded open, variants, critique
   with visible criteria, commit → Queue → send → outcome annotation. *(Anti-generic,
   manual-to-autonomous, critique-transfers-judgment.)*
5. **Explore + promotion** — conversation+map → "make this real" → Proposal → Charter in place.
   *(Exploration-preservation, one-minute creation, ceremony ladder.)*
6. **The client-pipeline lens** with drop-into-world. *(Across-vs-within.)*

## 7. Open decisions

Fifty-nine genuine unresolved questions are registered in 14 (OD-01–OD-59), each with competing
options and the evidence that would settle it — concentrated where prototypes will teach the
most: attention-ranking thresholds and Field presentation at scale, posture-dial prominence,
promotion-signal sensitivity, autonomy-offer pacing, and workshop-bench details per craft.
Nothing in the register blocks the §6 slice; the register is the agenda for prototype learning,
not a list of design debts.

---

*The standard this phase set for itself: entering a World should feel like entering an
intelligent environment purpose-built for that undertaking, and entering a Workshop should feel
like gaining the tools, context, feedback, and creative leverage of an expert team — at five
worlds or a hundred, for a clothing brand or a rabbit hole, with nothing sent without your yes
and nothing you made ever lost. The sixteen documents behind this page specify that experience
to prototype fidelity.*
