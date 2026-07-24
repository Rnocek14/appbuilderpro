# 10 — Reality Check: Scale and Time

*Phase 4 adversarial review. Attacker lens: what becomes painful at 500 Worlds, and after 3
years of daily use. Method: no taste, only arithmetic and entropy — every attack quotes the
docs' own thresholds and cadences and runs them forward. Sources attacked:
`_constitution.md`, `02-global-shell.md`, `06-missions-and-standing-orders.md`,
`08-multi-world-management.md`, `17-mastery-and-learning-loops.md`,
`09-creation-and-genesis.md` §10 (plus adjacent sections those documents bind to).*

**Baseline load model, from the docs' own numbers.** The worked morning (08 §7): 10 client
worlds, ~30 prospects, hunt adds "14 prospects" overnight, "3 client follow-ups queued,"
Pulse reads 6. Per-client automation rows (09 §4.4, §6 rung 2): four automations typical —
invoice chase (monthly, "cap 20/mo"), review requests ("after each completed appointment …
cap 40/mo"), follow-ups, weekly content ("weekly content from this recipe," const. §6). All
born propose-only (06 §3.9). Streak lengths quoted by the docs themselves: 5 (const. §8),
9 (08 §7.3), 12 (02 §4.2). These are the only throughput numbers anywhere in the corpus.

---

## A1 — Approval arithmetic: the ladder absorbs steady state, never growth (mandated analysis 1)

At **10 clients**, run the docs' own cadences at 50% cap utilization: review requests
~20/mo/client, invoice chase ~5/mo (the 3-rung ladder, 06 §3.1), follow-ups ~8/mo, weekly
content ~4/mo → ~37 gated items/mo/client ≈ **17/workday** from client worlds. The agency
funnel adds more: 14 new prospects/night (08 §7); pitching a third of them plus the domain
pack's own "same-evening + next-morning follow-up" cadence (17 §2.1) ≈ **15/day**. Total
≈ **30–35 Queue decisions/day** — already 3–5× the curated Tuesday's Pulse of 6. Autonomy
converts the big classes after ~12 clean approvals each (02 §4.2's own figure): 4 classes ×
10 worlds × 12 ≈ **480 manual approvals** of apprenticeship before conversion. Absorbable.

At **50 clients**: steady-state ≈ 85/day pre-autonomy. Post-autonomy the *steady state*
converts, but every new client re-opens 4–6 (class × world) ladders × ~12 clean approvals =
**~50–70 irreducible manual approvals per new client**. At 2 new clients/week: 100–140/week
of apprenticeship that no earned autonomy can touch, because streaks accrue per world.

At **500 worlds**, best case (autonomy maximal everywhere): ~2 automation runs/world/day =
1,000 runs/day; even 5% still gated = 50 items/day; failures at 0.5%/run = 5/day; went-quiet
at 0.2% = 2/day; grant expiries (500 worlds × ~3 annually renewing grants, expiry-foresight
items filed "days ahead," 06 §3.4) ≈ 6/workday; renewal missions at T-30 (08 §3.1): 500/12
≈ 42/mo ≈ 2/day, each with multiple gates; adopt-proposals (A8) ≈ 12/workday; mission
verdicts, long-pause questions, cap-hits on top. Floor ≈ **90–120 decisions/day with
autonomy already maximal**. At the Queue's own inline-context standard (~30s/item honest
read), that is 45–60 minutes/day of pure approval-walking *before any growth*.

**Where the ladder fails:** capacity C ≈ 200 decisions/day (generous) minus steady-state
floor F(N) minus apprenticeship load (growth × ~60/world). With modest growth of 2–3
worlds/week, F(N) + apprenticeship crosses C at roughly **N ≈ 150–250 — well before 500**.
What the design says about this: nothing. 08 §8's hundredth-world test is answered purely
structurally ("no chrome grows … one Queue, still") — it proves the *screen* doesn't grow
and never budgets the *decision throughput* behind it. No document states a target Queue
depth, an items/day budget, or a load-shedding order.

## A2 — The per-(class × world) streak reset is an O(N) tax, and the docs contradict themselves about it

08 §6.5 is binding: "Earned autonomy applies per class × world, never per lens … clean
streaks accumulate where the work happens; the Queue's autonomy offers cite per-world
evidence. 'Auto-approve everything in this lens' does not exist and cannot be built from
the parts." So world #500 of a setup "adopted ×49, refined 6 times" (09 §10) — with the
strongest provenance the platform can express — still starts every class at zero, exactly
like world #2. Meanwhile 08 §8.4 claims "autonomy earned by the client genome's classes
already applies to #100's offers." Those two sentences cannot both be true as written:
either streak evidence pools at the genome (violating §6.5's per-world evidence rule) or
#100 apprentices from scratch (making §8.4's reassurance empty — the *offer classes* exist,
the autonomy doesn't). The unresolved reading is worth ~50–70 manual approvals per new
world, forever, at any n. This is the single largest scaling liability in the corpus and it
sits inside an internal contradiction that `14-open-decisions.md` does not carry.

## A3 — Meta-decisions accumulate their own queue

Every absorption mechanism generates decisions about itself: autonomy offers ("accepting is
itself an approval," 02 §4.2) at 4–6 classes/world × 500 worlds ≈ up to 2,000–3,000 dials,
each producing offers; declined offers return "until the streak doubles" (02 §4.2) — a
doubling backoff means year-3 mornings receive unpredictable resurfacings of offers declined
in year 1; long pauses ask "after three weeks: still paused — resume, or retire it?"
(06 §3.5) — at 500 worlds with even 5% of ~1,750 automations paused at any time, that is
~90 standing questions cycling on a 3-week clock ≈ 4/day; repetition-noticed proposals back
off "until the streak doubles" too (06 §3.6.2, 09 §11). Each item is individually justified
and quiet; the *sum* is a second shadow queue of governance decisions the design never
counts. No surface answers "how many standing questions am I carrying?"

## A4 — The Brief's stanza contract arithmetically breaks at 500 worlds (mandated analysis 2)

02 §10.1 binds two incompatible things: stanza 4 is "**In flight** — one line per running
mission," and the closing rule is "The Brief never pads, never repeats yesterday, never
scrolls infinitely." At 500 worlds with 10% running a mission, stanza 4 is **50 lines** —
the contract must break one way or the other, and the doc doesn't say which. Stanza 1
("while you were away … grouped by world") has the same problem: 200 worlds with overnight
activity is a grouped digest of 200 groups or a truncation with no documented truncation
rule. "What changed" degrades from a digest to an unspecified top-k sample of thousands of
row deltas — at that point "what changed" means "the k changes the ranker liked," and k
appears nowhere. Stanza 3 carries "the two or three Queue items that matter most" against a
Queue holding 90–120/day (A1): the Brief now surfaces **2–3% of the day's decisions**, and
the selection function for the other 97% is undocumented.

## A5 — Attention ranking has no floor: worlds that never surface, and rot that produces no rows (mandated analysis 2)

The Field renders "at most nine worlds in full presence" (02 §10.2); the Brief's needs-you
carries 2–3 items; dormant worlds are "absent." The ranking classes (needs-you › broken ›
news › glowing › running-quiet › dormant, 02 §10.2) mean a world surfaces only on an
*event*. Run it forward: if ~20 of 500 worlds/day produce ranked events and 9 full-presence
slots exist, a median world surfaces every few weeks; the bottom quartile by event rate
surfaces **approximately never**. Now combine with the honesty architecture: "A sentence
that cannot cite rows cannot be rendered" (02 §10.1). Slow decay — a client whose reply
rates sag 5%/quarter, a playbook whose lessons quietly stop matching the market — produces
**no row events**, therefore no Brief sentence, no news class, no glow, by construction.
The evidence-linked Brief is structurally blind to gradual degradation; the docs document a
starvation story for *nothing*: there is no rotation floor, no "you haven't seen this world
in N days while it acted under earned autonomy," no periodic census nudge (the Everything
view exists but is "the one deliberate census, never the default," 08 §4.4). Silent rot is
not an edge case at 500 worlds; it is the steady state of ~450 of them.

## A6 — Playbook entropy: the gate is a human bottleneck and forgetting is unconstitutional (mandated analysis 3)

Accumulation: 17 §6's loop mints lessons continuously; a healthy world plausibly gates
1–2/month → over 3 years, **40–70 lessons/world**, ×500 worlds ≈ **25,000–35,000 active
lessons**. The controls quoted against this: lessons age to "aging" on "a long horizon"
(unquantified, 17 §6.4); contradicted lessons flip to "challenged … and the Desk stages the
review" (17 §6.4) — but the Desk obeys a "3-slot discipline" (17 §4.5), so challenged-lesson
reviews compete with production work at a fixed 3-wide aperture; retirement is "one gesture"
*per lesson*, manual. The Brief carries "at most one Playbook proposal awaiting the gate"
(02 §10.1) — a gate throughput of ~1 surfaced proposal per arrival against a mint rate of
dozens/week portfolio-wide means candidates pool silently in the Queue class. And the
constitution forbids the cure: P12 "nothing is ever lost" plus "there is no delete"
(06 §3.5) means no expiry, no compaction, no bulk hygiene exists anywhere in the corpus.
The one hygiene sentence is passive voice: criteria that never move outcomes "are candidates
for the operator to question" (17 §5.4) — no mechanism stages that questioning. After 3
years: contradictory lessons across sibling worlds (each world's Playbook is sovereign,
17 §9.1), 14-month-old lessons that only announce their age "when cited" (17 §6.4) — and
citation requires a session open, so an unopened world's stale lessons never even confess.

## A7 — Outcome annotations on dead artifacts, and the as-of caveat litany

17 §3.2's own manifest: "4 months of memory · 61 artifacts." Linear over 3 years ≈ **550
artifacts/world**; ×500 worlds ≈ **275,000 artifacts**, every one carrying version-pinned
outcome ribbons forever (17 §5.1, P12). The Palette pre-load contract (17 §3.1) must rank
"the world's material relevant to that intent" over that corpus — the doc specifies what
must be present, never how relevance survives a 10× corpus, and an outcome ribbon on a
2019-era subject line ("3 replies within 14 days of send") is *evidence-true and
steering-false* three algorithm changes later. Meanwhile the honesty machinery compounds:
every stale source announces itself ("the pricing survey in memory is from March," 17
§2.2), grants announce expiries, lessons announce their age when cited — individually
correct, collectively a session-open litany of caveats that the operator learns to scroll
past. Honesty that is always caveating is the new theater: technically true, behaviorally
unread.

## A8 — Genome drift: adopt-proposal fatigue is arithmetic, and nobody reconciles (mandated analysis 4)

The docs' own n=50 figures (09 §10): "adopted ×49, refined 6 times" in a year. Each
refinement fans out per-world adopt/adapt/decline proposals — 08 §6.2 celebrates walking
"49 per-world adoption approvals in one sitting." Run it: 6 refinements × 49 worlds =
**294 adoption decisions/year from one setup family**. Add domain-pack updates (fair-housing
revisions etc., 17 §2.1 — same fan-out), built-in lens updates ("your client pipeline
gained a Review column — adopt?", 08 §3), and 2–3 setup families: **~600–900 adoption
decisions/year ≈ 3–4 per workday**, each contractually requiring a read of "the layer diff,
rendered against the receiving world's own resolved version" (02 §4.2). Nobody reads 294
diffs a year; the hold-to-confirm batch walk becomes a motor ritual — which is gate bypass
achieved socially instead of mechanically. Then divergence: declines are "remembered" as
local overlays, adapts are "local variants, visibly kept" (09 §10.2, 17 §2.1). After 3
years of scattered declines/adapts, the 50 worlds resolve 50 different effective setups —
*visibly kept* per world, **invisible in aggregate**: no lens, no catalog view, no report
answers "how fragmented is my client setup?" (the adoption-state field shows *pending*, not
historical variance — 08 §2.3). Worse, fragmentation defeats the compounding engine: upward
promotion triggers on "the same local override repeating across ≥3 sibling worlds"
(09 §11) — once worlds diverge, overrides differ subtly, the ≥3 match never fires, and the
learned layer stops learning. Who reconciles? No document names an owner, a surface, or a
ceremony for reconciliation. Drift is recorded everywhere and governed nowhere.

## A9 — Lens sprawl and saved-view rot (mandated analysis 5)

08 §2.4: saved views sort by "recency of use; the tail folds behind 'More' … a hundred
saved views cost one 'More' tap." That sentence prices the *chrome* of 100 views and
ignores their *semantics*. Views are queries over genome field catalogs ("picked from the
genome's field catalog, never free-typed," 08 §2.3) — but catalogs change through the very
adoption stream A8 describes: a refinement renames a stage, retires a field, adds a column.
What happens to a 2-year-old saved view filtering on a field that no longer exists? Nothing
is documented: no view versioning, no migration proposal, no "this view matched 0 rows
because its stage was renamed" honesty row — the one object family exempted from the
no-theater rule. Accumulation: ad-hoc Bar queries are savable in one gesture ("clients who
haven't replied in a week" → "Save this view," 08 §9); over 3 years that is dozens of
near-duplicate views differing by a forgotten filter, findable only by name, reachable by
Bar-name-collision ("show the client view" — which of five?). Recency sorting hides rot; it
never merges, audits, or retires it. P12 has no delete for these either.

## A10 — Automation sprawl: silence-is-loud inverts into loud-is-silence (mandated analysis 6)

500 worlds × 3–4 automations (09 §6 rung 2's four rows are the *default* client shape) =
**1,500–2,000 standing orders**. 06 §4's seventeen mechanisms guarantee every one is
*renderable* — chips, traces, went-quiet items, expiry foresight, cap-hit decisions,
long-pause questions. Now sum the honest noise floor from A1: ~5 failures + ~2 went-quiet
+ ~6 expiry warnings + cap-hits + pause questions ≈ **15–25 maintenance items every day,
forever** — every one true, every one individually justified. The trust invariant was
designed against *invisibility*; at this volume its failure mode flips: the Pulse (a "calm
dim dot" when empty, 02 §4.1) is never dim again — it reads 40+ every morning, and a number
that is always large carries no information. Habituation does the rest: the operator's eye
learns that "went quiet" items are usually a lapsed feed, and the day the client-facing
missed-call textback dies it is item 14 of 22. The uncompressible rule (06 §4.7) guarantees
the row *renders*; nothing in the corpus guarantees it is *noticed*, and no document budgets
the aggregate — the 17 mechanisms are enumerated per-automation, their sum unexamined.
06 §7's own scale test ("a hundred running missions and automations produce one Queue, one
Brief, one Lens") verifies surface count, not signal-to-noise.

## A11 — The switcher and semantic search are a single point of failure with no degraded mode (mandated analysis 7)

At 500 worlds the docs are explicit that retrieval is the only navigation: "At scale,
retrieval replaces browsing entirely" (08 §4.4); the Field shows ≤9 + a band; manual
organization is constitutionally forbidden ("Manual arrangement would rot; attention
ranking cannot," 02 §12.2 — no folders, no tags). Three consequences: (1) **Shared-fate
with creation.** Resolve-first creation (09 §3) rides the same semantic index — a false
negative births a duplicate world; a false positive lands an utterance *inside the wrong
counterparty's world*, where a `/note` to the wrong scope pollutes that world's memory and
grounding (17 §2.3) with only a 6-second transient standing between the misroute and
permanence (02 §3.6 — "a misroute costs one click" assumes it is *noticed* within 6
seconds). (2) **Collision density grows with n.** Fifty real-estate agents, a dozen
dentists: "the dental place" (09 §3's own example) has three referents at 500 worlds;
which-world disambiguation lines (02 §3.6) fire on a growing fraction of utterances — each
cheap, collectively a tax on the primary input. (3) **No fallback.** If the index degrades
— embedding-model migration, drift, outage — the only remaining navigation is the
Everything census: a linear walk of 500 rows. The corpus documents the clock's failure mode
lavishly (stale-clock push, 02 §9) and the retrieval system's failure mode not at all,
despite it being the load-bearing wall of the whole two-place model.

## A12 — Dormancy: what never wakes, what can't sleep, and edges that outlive their meaning (mandated analysis 8)

Numbers: "two quiet weeks to cooling, six to dormant" (08 §4.3, owning contract 04 §9.2);
client worlds "go dormant only by explicit retirement"; "a world with outbound, spending,
or counterparty-touching clock work cannot go dormant." Attacks: (1) **Never wakes.** A
dormant exploration holding a staked prediction whose judgment date passes: calibration
closure (17 §4.4) needs outcome capture and Desk staging, but a dormant world stages
nothing and renders nowhere — the prediction stays open forever, silently corrupting the
hit-rate's denominator. The inbound-only watch carve-out compounds it: arrivals "accumulate
silently for the return visit" (08 §4.3) — for a world nobody returns to, that is 3 years
of accumulation surfaced never (the watch files only on *failure*). (2) **Can't sleep.**
A ghosted client (stops paying, never formally churns) is the common churn shape; its
world cannot go dormant (outbound clock work) and retirement is a manual ceremony
("automations retired first," 08 §4.3). Until the operator performs it, the invoice chase
keeps proposing drafts to a dead relationship — needs-you noise on a corpse, times every
churned client per year, and no mechanism proposes retirement (the Brief's long-pause
question covers paused automations, not dead counterparties). (3) **Edge staleness.**
Grants carry expiry dates (06 §3.4); edges carry none. 08 §5's own example — "a pricing
exploration informs every client world" — puts one world on 50 Faces; when it goes dormant
in year 1, 50 Faces cite a sleeping source through year 3, and its Palette cards ("from:
pricing exploration · adopted May") ground sessions with 2-year-old thinking wearing a
provenance chip that reads as endorsement. No edge review, no edge aging, no "this informs
edge has been silent 18 months" exists anywhere.

## A13 — Session and Ledger accumulation in long-lived workshops (mandated analysis 9)

The Ledger keeps "every variant, comparison, critique, decision *and why* — persisted"
(const. §6); sessions are resumable forever; there is no delete (P12). A weekly-cadence
workshop over 3 years is **~150 sessions**; at dozens of variants per session, a
10,000-event Ledger per mature workshop. The resume contract — "return after thirty days
lands on the Ledger's story" (const. §6) — is specified for *a session*, not for an Area
holding 150 of them: no compaction, summarization, or archive contract exists; "sessions
named by intent" yields 150 intent-names as the only within-workshop index. The
grounded-open contract ("compiled at open," 17 §2.3) recompiles against a corpus that grows
without bound, and the context manifest that proudly reads "4 months of memory · 61
artifacts" (17 §3.2) reads "38 months · 540 artifacts · 9,400 decisions" in year 3 — a
number that has stopped meaning anything to the person it reassures. Search coverage
(02 §3.5) is real but is retrieval into an unpruned space — A11's single point of failure,
again, now load-bearing *inside* every world too.

## A14 — The 3-year trust curve: the ratchet only turns one way (mandated analysis 10)

The autonomy dial's feedback loop is explicitly bidirectional: "a rising intervention rate
argues it back down" (17 §4.6; 06 §3.9). But interventions require *attention*, and
attention is the depleting resource: as batch-walking becomes motor ritual (A8, A10), edits
and declines fall for reasons of fatigue, not quality — and the system cannot distinguish
"clean because good" from "clean because unread." Falling intervention reads as trust;
the dial ratchets up on evidence of exhaustion. Nothing in the corpus samples, audits, or
dwell-weights approvals to test whether streaks are earned or rubber-stamped. Parallel
decays: mission verdicts cost "twenty seconds" and "the ask stays staged until answered but
never blocks anything" (06 §2.7) — never-blocking means verdict debt accumulates freely,
and every unanswered verdict starves the Learn beat that 06 §1 calls half the work's value;
blind review is "offered, never forced" (17 §4.3) — the mastery reps are opt-in, and
year-3 opt-in under A10's load rounds to zero, quietly failing the north star ("mastery,
not merely organization," const. §1) with no metric watching. Socially: by year 3 the
Auto-ran ledger is complete, honest, and unread — the day a client references an email the
operator never saw, "everything it does stays in this list, marked" (02 §4.2) is true and
is no defense. Honesty that is never read converges, socially, with the theater the
constitution banned.

---

## The five mechanisms most likely to make year 3 miserable — ranked, with the smallest preventing change

*Each change is flagged as a **suggestion** — a minimal amendment, not a redesign.*

**1. The per-(class × world) autonomy apprenticeship (A1, A2).** O(N) manual approvals that
growth can never amortize, sitting on an internal contradiction (08 §6.5 vs 08 §8.4).
*Smallest change:* resolve the contradiction in favor of **sibling-evidence provisional
dials**: a world chartered on a setup "adopted ×49" receives, at charter, an autonomy
*offer* per class citing genome-level streak evidence ("this class ran clean 2,300× across
49 siblings") — still accepted per world, still revocable per row, so the gate survives but
the apprenticeship doesn't restart from zero. One new offer type; no new surface.

**2. The maintenance-item flood inverting silence-is-loud (A10, A3).** 15–25 true-but-minor
items/day habituate the operator past the one real fire. *Smallest change:* a **Queue load
budget with severity tiers**: non-counterparty-facing maintenance classes (expiry foresight,
long-pause questions, non-blocking went-quiets) collapse into one daily "maintenance batch"
item; counterparty-facing failures keep individual citizenship. Budget the sum, not just
justify each item — one grouping rule inside the existing Queue.

**3. The rubber-stamp ratchet (A14).** Fatigue reads as trust; the dial only rises.
*Smallest change:* **dwell-weighted streaks plus sampled audits**: approvals faster than a
class-calibrated read-time count fractionally toward streaks, and the Queue occasionally
(say 1-in-30) presents an auto-ran item as an expanded spot-review whose outcome feeds the
dial. Uses existing item anatomy; adds one counter and one sampling rule.

**4. Adopt-proposal fan-out and ungoverned genome fragmentation (A8).** ~300–900 diff-reads
a year, then silent divergence that disables upward promotion. *Smallest change:* a
**standing answer per improvement**, set once at the gate ("adopt everywhere without a
conflicting override; stage only the conflicts"), plus one **variance line** on the setup's
catalog entry ("resolved versions: 38 identical · 9 variants · 3 worlds ≥4 refinements
behind"). Conflicts still gate per world; the 40 no-op confirmations disappear, and
fragmentation finally has a number someone can see.

**5. Coverage starvation and silent rot (A5, A12).** ~450 of 500 worlds surface
approximately never; rot without row-events is invisible by construction; dead clients
can't sleep and open predictions never close. *Smallest change:* a **rotation floor under
the attention ranking**: every non-dormant world earns one Brief sentence at least every M
days (even "clean, unvisited 60 days — 214 auto-ran actions unreviewed"), and a quarterly
staged hygiene rep per world family batching aging lessons, silent watches, past-date
predictions, and retirement candidates. One ranking rule plus one staged-move class —
attention keeps ranking; it just stops being allowed to starve.

---

*End of Phase 4 attack. Nothing above disputes the architecture's shape at n=10; every
finding is the same shape run to n=500 × t=3yr using the documents' own constants.*
