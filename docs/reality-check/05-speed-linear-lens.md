# 05 — Reality Check: The Speed Lens

*Interpretive lens exercise: this document channels the publicly-known product philosophy of
Linear's founders (Karri Saarinen / Tuomas Artman — speed as THE feature, opinionated defaults,
keyboard-first, quality over configurability, software as precise instrument, hatred of process
bloat) as an adversarial critique. It is a deliberate persona, not a neutral review.*

---

The experience architecture reads like it was written by people who despise bureaucracy — and
then, clause by clause, builds the most lovingly machined bureaucracy I have ever seen specced.
The shell is an instrument. The spine is a permissions department. This document counts.

---

## 1. The arithmetic of the approval spine (mandated question 1)

**Attack 1 — the docs never total their own Queue.** Count it at the scenario the docs
themselves stage: 10 clients with active outreach + automations (08 §7's worked example, scaled
to its own premise).

- 06 §3.7 names the standard per-client load: *"runs on Jane's behalf: follow-ups · review
  requests · missed-call text-back"* — plus the invoice chase of §3.1. Call it 3–4 automations
  per client, and 06 §3.6 is binding: *"always propose-only at birth."* ~35 automations, every
  output a Queue item. At one gated output per automation every other day: **~15–25 drafts/day**.
- Active outreach: 08 §7's Brief reports *"the hunt added 14 prospects"* in one night. Pitches,
  follow-ups, and nudges across a 30-prospect funnel are all gated sends: **~10–15/day**.
- Missions: the mission brief itself advertises its toll — *"will queue 2 emails and 1 publish
  for approval"* (06 §2.2). Two or three missions in flight: **~4–6 gated steps/day**.
- The meta-traffic the spine generates about itself: went-quiet items, cap-hit decisions,
  adopt-proposals, autonomy offers (each *"itself an approval,"* 02 §4.2), long-pause questions,
  lesson gates, grant-expiry warnings, mission verdicts: **~5–8/day**.

**Total: 40–60 Queue decisions per day.** The Queue's own contract makes each one expensive:
*"each item carrying full decision context inline (the draft, the diff, the compare, the
evidence)"* (constitution §8). Full context is not free — it is a mandate to read. An honest
read of a draft plus *"the prior thread's last exchange"* (02 §4.2) is 30–60 seconds. That is
**25–50 minutes per day of pure approval labor**, every day, forever, at only ten clients. The
worked example itself shows the Pulse reading 6 at 8:40 a.m. — before the day has generated
anything. The approval spine becomes the bureaucracy Linear was founded to kill at roughly the
moment the second client signs; by the tenth, the operator is middle management for their own
robots, and the product's core daily activity is processing a permissions inbox.

**Attack 2 — the spine's answer to volume is more spine.** 08 §6.2: *"Select twelve stalled
prospects, choose 'nudge' → twelve world-stamped Queue items... confirmed per item."* AT-16 /
08 §6.2 celebrate letting the operator *"walk 49 per-world adoption approvals in one sitting."*
A forty-nine-approval sitting is presented as a feature. Linear's founding observation was that
tools which generate work about work get abandoned; this design enumerates work-about-work as
acceptance criteria (13 AT-16's pass condition literally requires the 49-item walk to exist).

## 2. Keystrokes per approval (mandated question 2)

**Attack 3 — keystroke-fast, decision-slow: a beautiful slow ritual.** Credit the mechanics:
`Cmd+.` opens the Queue, then `j`/`a` per item (02 §3.7) — ~2 keystrokes per approval. That is
genuinely Linear-grade *input*. But keystrokes were never the cost. The cost is that the design
*forbids cheap approvals by principle*: G-4 mandates every item be *"decidable inline — the
draft, the diff, the compare, the evidence"* (13 §3), and 02 §4.2 makes every creative approval
*"also a rep of judgment"* with visible rubrics. Every item demands a whole decision; whole
decisions take 30–60 seconds; the keystroke economy is a rounding error on the reading economy.
Meanwhile the one true bulk affordance breaks the keyboard religion outright: *"'Approve all
remaining' exists but stages per-item approvals confirmed with a single hold-to-confirm
gesture"* (02 §4.2) — hold-to-confirm is a pointer ritual with no keybinding in the §3.7 table.
The fastest interaction is the one that doesn't exist; this design's answer is a faster hand on
an interaction that shouldn't exist 40 times a day.

**Attack 4 — the operator approves their own explicit commands.** 02 §3.6 is proud of it:
*"the Bar never needs to interrogate you; the approval is where the decision context lives."*
Translated: the confirmation was relocated, not removed. "Tell Jane the site is live" — a fully
specified imperative from the accountable human — becomes: chip, Enter, draft minted, Queue
item, *later* reopen the Queue, re-read your own instruction, `a`. Three ceremonies for one
email the operator already decided to send. Where the utterance IS the decision, the utterance
should be the approval. The design has no concept of operator-specified work being
pre-approved by its own specification — every outbound act is treated as if the machine
initiated it.

## 3. The interpretation chip (mandated question 3)

**Attack 5 — precision at the Bar, tax at the margins.** The chip itself is defensible as
designed: *"The chip is not a confirmation dialog. High-confidence readings route on Enter with
no extra step"* (02 §3.2). Preview-not-gate is the right call, and the one-line disambiguation
rule (§3.6) is genuinely good. Two failures anyway. First, the chip previews theater: its
anatomy includes a *"posture dot"* for the facing the router inferred — a preview of a dial
that, per G-1, is guaranteed to gate nothing (see Attack 9). Previewing a no-op is decoration
with a spec. Second, the chip never earns its retirement: the design lavishes machinery on
earned autonomy for *approvals* but none on earned confidence for *routing*. The 500th
"follow up with jane" renders the same 150ms chip as the first. Where should the system just
ACT: repeated identical routings (same scope, same verb, streak of zero corrections) should
route chipless — the 6-second undo transient (§3.6) already covers the failure case. And
§3.6's own which-reading example — *"draft it, or just remind you?"* — is a question the
router should never ask: drafts are free precisely because the gates exist; default to draft,
always. A system that asks questions its own architecture has made costless has no opinions.

## 4. The earned-autonomy dial: do the math (mandated question 4)

**Attack 6 — the trust ladder climbs too slowly to matter, by the docs' own numbers.** The
thresholds quoted across the corpus: *"5 clean approvals of client follow-ups"* (constitution
§8), *"9 clean approvals... for Jane's Bakery"* (08 §7), *"12 clean approvals of invoice
reminders for Mom's Real Estate"* (02 §4.2). Call it ~10. The scope rule is binding: *"Earned
autonomy applies per class × world, never per lens... 'Auto-approve everything in this lens'
does not exist and cannot be built from the parts"* (08 §6.5).

Now multiply. 10 clients × 4 approval classes = **40 (class × world) cells**. Each needs ~10
clean reps before an *offer* appears: **~400 manual approvals**, plus 40 more because
*"Accepting is itself an approval"* (02 §4.2). At a realistic per-cell cadence of 2–4 outputs a
week, one cell takes **3–5 weeks** to earn its offer — so the operator runs a fully manual
approval desk for over a month while doing the 40–60/day arithmetic of Attack 1. Decline once
and it gets worse: *"Declining silences the offer until the streak doubles"* (02 §4.2) —
hesitation at 12 is punished with a march to 24. And the cells don't share: autonomy earned on
"client follow-ups" at Jane's Bakery transfers nothing to the *byte-identical genome class* at
Rossi Plumbing, even though 08 §8.9–10 boasts that world #100 inherits the *"×99-refined
genome."* The genome carries the pattern, the playbook, the criteria — everything except the
trust. Worst of all, the volume corrupts the signal: a "clean streak" is approvals-without-edit,
and an operator processing 50 items a day stops reading by week two. The streaks then measure
compliance fatigue, not earned trust — the ladder poisons its own evidence. This dial is not
aggressive; it is homeopathic.

## 5. Where opinionated defaults are missing (mandated question 5)

**Attack 7 — the design asks where it should decide.** An inventory of abdications:

- *"always propose-only at birth"* (06 §3.6) — even for read-only acknowledgments and
  zero-risk classes. A missed-call text-back saying "we'll call you right back" does not need
  ten supervised reps; the genome shipped it, the genome should ship its autonomy posture.
  Propose-only should be the exception for money and counterparty-first-touch, not the
  universal birthright.
- *"Decline (asks one-line why)"* (02 §4.2) — a mandatory form field on the reject path of a
  40-item daily queue. Linear ships one-keystroke rejection; the why is optional or inferred
  from the edit.
- Lost prospects: aging out is *"offered as a staged sweep, never a silent purge"* (08 §3.2).
  Asking permission to archive 60-day-dead leads is process. Archive them, say so in the
  Brief, one-tap restore. (P12 already guarantees nothing is deleted — so the ask protects
  nothing.)
- Genome improvements arrive as adopt/adapt/decline proposals to every derived world (09 §10
  via 08 §6.2) — 49 approvals for one improvement. The opinionated default: auto-adopt where no
  local override conflicts, notify, one-tap revert; ask only at genuine conflicts (the diff
  machinery in 02 §4.2 already exists for exactly those).
- The mission verdict *"stays staged until answered but never blocks"* (06 §2.7) — meaning it
  accumulates forever as ambient guilt. Auto-adopt the drafted verdict after N days; record the
  override if the operator ever cares.
- Hold *"with a wake condition"* (02 §4.2) asks the operator to author scheduling logic per
  item. Default the wake (next morning, or the counterparty's reply); offer the editor to the
  three people who want it.

The pattern: every time the design faces a choice between deciding and asking, it builds a
beautiful surface for asking. That is configurability with better typography.

## 6. The keyboard model: complete or decorative? (mandated question 6)

**Attack 8 — one keyboard-complete loop, and it's the bureaucracy's.** 02 §3.7 fully covers
exactly three surfaces: the Bar, the switcher, the Queue. The *entire drive layer* — where the
constitution says mastery happens — has zero specified bindings: no keys for the drop from a
lens row (08 §2.5), lens chips, Desk staged moves, workshop Moves, the commit rail, pause, plan
spine actions, or "Review as batch." Worse, the design has spent its keyboard budget
structurally: *"any printable key focuses the Bar"* (02 §3.7) forecloses single-key vocabularies
on every non-overlay surface forever — `j/k` can exist in the Queue only because overlays steal
focus. The one place you get Linear-grade keys is the approvals inbox; the craft benches get a
pointer. And 13 confirms the priorities: no acceptance test anywhere counts keystrokes or times
approval throughput — the most frequent daily action has no speed test at all, while AT-09's
proud speed bar for returning to work is *"under two minutes."* Two minutes is Linear's p99 for
a bad month. The keyboard model is decorative everywhere the user actually works.

## 7. Postures and plan-spines (mandated question 7)

**Attack 9 — would Linear ship "postures"? No, and this design half-knows it.** The dial:
*"Think · Create · Execute · Observe as facing, not navigation... Postures never gate features;
they light the same room differently"* (constitution §5). It is set *by the AI from your
words*, and its guarantee of inertness is enforced by a guard check — G-1's pass condition is
that *"every feature [is] reachable in each posture"* (13 §3). Read that again: the suite
contains a blocking test to verify a control does nothing binding. If you must test that a
feature is inert, you have specced mood lighting. Four dots of chrome, a chip glyph, a
re-staged Desk — surface area, docs, and QA burden purchased for "emphasis." Kill it and
nothing in AT-01 through AT-18 changes except G-1, which exists only because it exists.

**Attack 10 — plan spines: crisp skeleton, ritual flesh.** The spine itself is the most
Linear artifact in the corpus — *"steps, never percentages"* and *"No progress bar exists that
is not literally the step count"* (06 §2.3) is a sentence Karri could have written. But the
design cannot let work simply finish: *"A mission that merely stops is a defect; ending is a
Learn beat"* (06 §2.7) — every mission exits through a five-part ceremony (drafted verdict,
your call with met/partly/missed *plus why*, predictions closing, outcome annotation, Playbook
proposals). That is a mandatory retro on every finite unit of work — the exact process artifact
("sprint ceremonies") Linear's whole existence is a refusal of. The 20-second claim is honest
per item and dishonest in aggregate: it is one more staged ask on every Desk, forever. Errands
auto-judge (§2.7) — proof the designers know auto-judgment works — and then the default for
everything else is still the ritual.

## 8. Seventeen mechanisms and a counting error

**Attack 11 — an invariant enforced by a compliance department.** 06 §4 enumerates
**seventeen** simultaneous mechanisms for "recurring work must never become invisible," and is
proud of it: *"The mechanisms are redundant by design."* Removing one is *"a constitutional
violation, not a simplification."* Seventeen chips, traces, digests, ledgers, bands, and
foresight rules is not a trust invariant — it is seventeen surfaces to build, polish, test, and
keep coherent, each a standing tax on the quality bar the constitution claims to hold. Linear
ships one mechanism, perfectly. And the corpus can't even keep count of its own bureaucracy:
08 §3.4 cites *"mechanism 9 of the sixteen that keep recurring work visible (06 §4)"* and 06's
own cross-references say *"the sixteen visibility mechanisms"* — while 06 §4 lists seventeen.
The mechanism list grew past its own citations. That is what process bloat looks like from the
inside: the paperwork about the paperwork is already stale.

## 9. p95 from intent to done, five most common daily actions (mandated question 8)

**Attack 12 — the product's core verb is queue-latency-bound.** As designed, honestly clocked:

| Daily action | Path as designed | p95 intent→done |
|---|---|---|
| Approve one queued draft | `Cmd+.` → `j` → read full draft + prior exchange (02 §4.2) → `a` | **30–60s** — reading-bound, ×40–60/day |
| Send an operator-specified message | Bar → chip → Enter → draft mints → *waits in Queue* → next Queue visit → re-read → `a` | **1–4 hours** (queue-visit cadence) for ~10s of intent |
| Morning triage ("what broke?") | The Brief, evidence-linked (02 §10.1) | **20–40s** — genuinely fast; credit |
| Pause an automation | one gesture, anywhere output appears, no confirm (06 §3.5) | **2–5s** — genuinely Linear; credit |
| Close a finished mission | drafted verdict + "your call... plus why," staged, *"stays staged until answered"* (06 §2.7) | claimed 20s; **days**, with deferral |

The pattern is exact: everything read-only or reversible is fast (the shell's designers are
good); everything outbound carries a mandatory second act in another surface at another time.
For the product's central verb — sending things on the operator's behalf — "done" is measured
in Queue-visit cadence, not seconds. Speed was supposed to be the feature; here it is a
property of the safe half of the product only.

## 10. The design governs itself the way it designs

**Attack 13 — the meta-tell.** 13 §0: *"A test failure is a blocking defect, not a backlog
item"*; every dispute routes through `14-open-decisions.md`; a coverage matrix binds ten
documents; bindings on an unwritten document 15 are *"held open... not waived"* (constitution
§16). Eighteen acceptance tests, five guards, a constitutional amendment channel — for a
design. A team whose design process needs a judiciary will ship a product that needs one, and
it did: the Queue is `14-open-decisions.md` with better keybindings. The bureaucracy is not an
accident of the spine; it is the house style.

---

## Three kills

1. **Kill the per-(class × world) trust ladder.** Replace with genome-level autonomy postures:
   classes ship with opinionated defaults (auto-run for reversible/capped/read-only, propose-only
   reserved for money and counterparty-first-touch), and earned trust transfers across worlds of
   the same genome — the ×99-refined genome (08 §8) carries trust like it carries everything
   else. The Auto-ran ledger and one-tap revoke (02 §4.2) already make this safe; ~440 warm-up
   approvals bought nothing the ledger doesn't.
2. **Kill the posture dial.** Four dots, a chip glyph, a guard test proving it does nothing
   binding (G-1). Let the Desk re-stage from the utterance — which the AI already does — and
   delete the control, its glyphs, and its documentation.
3. **Kill the double gate on operator-specified acts.** An explicit imperative at the Bar
   ("send Jane the invoice reminder," "tell her the site's live") is its own approval: chip,
   Enter, sent, 6-second undo, ledger row. The Queue gates what the *machine* initiates, not
   what the human just said in words.

## One protection

**Protect No-Theater and the shell it is welded to.** *"A sentence that cannot cite rows cannot
be rendered"* (02 §10.1), the Pulse's real counts, *"steps, never percentages"* (06 §2.3), two
places and three chrome elements (02 §1), Esc discipline (G-3), the constant Field budget, the
quiet night that sends nothing. This is the most Linear thinking in the corpus — honesty by
construction, opinionated, unconfigurable — and every kill above must land without loosening
one bolt of it. The gates are the problem; the glass is not.

## Verdict

**Bureaucracy** — a bureaucracy designed by people who hate bureaucracy, which is the most
durable kind, because every form is beautiful, every queue is honest, and every ritual can cite
its rows. The shell is a precise instrument; the spine wearing it processes 40–60 permissions a
day at ten clients and calls the workload trust. Ship the shell. Fire the permissions
department it currently frames.
