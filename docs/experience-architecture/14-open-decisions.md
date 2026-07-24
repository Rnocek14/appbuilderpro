# 14 — Open Decisions: The Dispute Ledger

*Phase 3, Experience Architecture. This is the file the constitution's preamble and §16, and
13 §0, route every inter-document disagreement and threshold revision to. The rule it enforces:
when a document author believes a binding decision fails a scenario, or two documents specify
the same thing differently, the conflict is logged here and adjudicated here — never resolved
by quiet local deviation. An entry stays open until its resolution is written back into the
owning documents; closing an entry without those edits is itself a defect.*

**Entry format.** Each decision carries: status (open / resolved / editorial), the anchors
(document + section on each side), the question stated neutrally, and — once resolved — the
ruling and the documents edited to reflect it.

---

## 1. Open decisions

### OD-01 · Thread ownership follow-through (from constitution §8)

**Status:** open (obligations assigned, work not yet landed).
**Anchors:** constitution §2 (Thread row), §6 (distinctions), §8 ("Threads and conversations
(binding)"), §16 (plan); 02 §8–§9; 03 §7.1; 07 §5; 11 route table (`/w/:world/t/:thread`);
12 (no conversation wireframe).
**Question:** The constitution now distinguishes the two thread kinds (counterparty
conversation vs Counsel transcript) and specifies the conversation surface's binding shape.
Document 03 owes the full anatomy section — message artifacts on the thread trace, staged
reply draft, unified channel model with per-message channel stamps, heartbeat chips on
automated sends, counterparty/world stamp, resume/since-then behavior — including the phase
brief's "Threads and conversation" question list answered directly. Document 12 owes a
conversation-view wireframe (or an explicit W3 sub-state).
**Closes when:** 03 lands the owning section and 12 lands the frame, both consistent with
constitution §8.

### OD-02 · Artist-world spec fork (mural scenario)

**Status:** open.
**Anchors:** 03 §7.3 (the brother's world) vs 10 Journey 3 (Marco's Murals).
**Question:** The two documents specify the artist/mural world differently — including whether
and how a cross-world autonomy offer appears in that scenario. Which specification is
canonical, and does the autonomy offer belong in the mural journey at all given autonomy is
earned per class through the Queue (constitution §8)?

### OD-03 · Scenario numbering vs journey numbering

**Status:** open.
**Anchors:** 01 (scenario table S1–S7) vs 10 (journey table J1–J7); e.g. 04's closing
cross-reference "10 (S6 and S7 as full journeys)".
**Question:** The phase-brief scenario numbers (01: S1 clothing brand … S7 the return) and the
journey numbers (10: J1 agency … J7 builder) do not map 1:1 — S1=J4, S3=J1, S4=J2; J3 (mural)
has no S-number; S2 and S7 have no dedicated journey. Cross-references by number are therefore
ambiguous or wrong. Decide the canonical mapping (publish it as a table in 10), then correct
every by-number cite.

### OD-04 · The re-genome gap

**Status:** open.
**Anchors:** constitution §7 (promotion = identity-preserving re-genome); 04 (promotion
lifecycle); 09 (Proposal/Charter ceremony ladder).
**Question:** Promotion is specified as "the world growing around the map" — never an export or
copy — but no document owns the re-genome operation itself: what happens to the existing
dressing, areas, memory, and running watch when the genome stack changes under a live world,
and which document's rules govern conflicts between the old and new dressing.

### OD-05 · S5 inbound/outbound identity split

**Status:** open.
**Anchors:** 01 (S5: "automate this inbox" — a background capability on a trigger) vs 10
Journey 5 (Podcast Outreach — outbound cold outreach maturing into a Standing Order).
**Question:** S5 and J5 are treated as the same scenario but specify different objects — an
inbound inbox-handling automation vs an outbound outreach automation. Which identity does the
S5 world have, or are these two scenarios that both need coverage?

### OD-06 · Consent-gate scope for cold email

**Status:** open.
**Anchors:** 05 §9.1 (send classes; recorded-consent classes fail closed) vs 10 J1/J5 (cold
first-touch outreach to prospects and podcast hosts).
**Question:** Does 05 §9.1's sanctioned-without-prior-recorded-consent class permit cold
first-touch email as exercised in the journeys, and under exactly which conditions (suppression,
politeness rules, caps, first-touch always gated)? State the boundary so the journeys and the
gate set agree.

### OD-07 · J5 world-birth vs 09's creation pipeline

**Status:** open.
**Anchors:** 10 §5.1 (Tab-resolved chip births "Podcast Outreach" as a light world, no
Proposal) vs 09 (utterance → resolve → Proposal → Charter) and the constitution §11 ceremony
ladder.
**Question:** Which rung of the ceremony ladder does a light Automation-kind-to-be world occupy,
and is a chip-Tab birth with no Proposal consistent with 09's pipeline — or does 09 need a
named light-world rung between "curiosity: silent, free" and "venture: one confirm"?

### OD-08 · Dormancy and decay defaults

**Status:** open.
**Anchors:** 04 §9.2 (cooling at two weeks, dormant at six; "the defaults are the contract";
tunable per world) vs 08 §3 (dormancy on genome-defined decay; client worlds dormant only by
explicit retirement; uncompressible rules).
**Question:** Which document owns the default decay clock, and how do 04's fixed-default
contract and 08's genome-defined decay compose without contradiction across world kinds?

### OD-09 · Cold-return landing default

**Status:** open.
**Anchors:** 04 (waking a dormant exploration reads as *continue* first — lands on the map/
Ledger story exactly as left) vs 02/11 (world landing defaults to the Desk; resume rails and
route defaults).
**Question:** Where does a cold return land by default — the Desk with the Brief's since-then,
or the exact surface left (map, Ledger story)? State one rule, or the per-kind exception,
in 02, and make 04 and 11 cite it.

### OD-10 · The watch/dormancy deadlock

**Status:** open.
**Anchors:** 04 §9.4/§12 (a curiosity world may mount an inbound-only watch; the world can
still drift dormant, the watch carries over) vs 08 §3 (a world running clock work cannot go
dormant — pause or retire first, or the uncompressible rule holds it visible; the watch remains
a Running-lens row with heartbeat mechanics).
**Question:** Can a dormant world host a live inbound-only watch? As written, 04 says yes and
08's rules either forbid dormancy or hold the world visible — a deadlock. Decide the rule
(e.g., watch survives dormancy as the one named exception, visible only in the Running lens)
and write it into both documents.

### OD-11 · Cross-world adjacency surfacing

**Status:** open.
**Anchors:** 04 (another world's discovery lands adjacent, warming a beacon; "your pricing work
in the agency world landed two lessons adjacent to 'swarm pricing'"), 03 §8-area examples
("a memory-surfaced adjacency") vs 17 (owns pattern promotion and the *patterns travel, data
doesn't* invariant; specifies no adjacency mechanism).
**Question:** What mechanism surfaces one world's lessons adjacent to another world's map,
which document owns it, and how is it squared with the isolation invariant (constitution §12.5,
§13) — patterns travel with provenance, counterparty data never?

### OD-12 · Document 15 pending — bindings held open

**Status:** open (held, not disputed).
**Anchors:** constitution §16 (plan and status note); 13 AT-01 ("Binds: … 15 (blueprint)") and
13's global bindings.
**Question:** none — this entry holds 13's bindings on `15-master-blueprint.md` open until 15
is written (deliberately last, after 01–13 stabilize). When 15 lands, this entry closes and the
bindings run against it at the wireframe-review checkpoint.

---

## 2. Resolved editorially

Small, mechanical corrections applied directly, logged here for the record:

- **09 §4.4 cite** — "(06 §14)" corrected to "(06 §4, mechanism 14)": doc 06 has no §14; the
  charter-time naming rule is mechanism 14 in 06 §4's enumeration.

---

*A threshold in 13 is binding until this file revises it with evidence (13 §0). A dispute that
is argued anywhere else — a commit message, a local footnote, a quiet divergence — does not
count as raised.*
