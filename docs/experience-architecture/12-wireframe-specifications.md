# 12 — Wireframe Specifications: The Highest-Value Screens, Drawn

*Phase 3, document 12. Textual wireframes — ASCII layout blocks, annotated element lists, and
state/interaction notes — for the ten screens and states a prototyper should build first. Every
layout here is a rendering of decisions already made: the shell (02), the world grammar (03),
Explore (04), work (06), the portfolio (08), creation (09), the IA and its addresses (11), and
the workshop system (16). Nothing in this document invents behavior; where a pixel-level call had
to be made (panel widths, which region docks where, what a label literally says), this document
makes it and says so. Grounded in the constitution throughout; no anti-goal in §15 is violated by
any frame below.*

**Reading rule.** Spec words — Face, Desk, Bench, Palette, Counsel, Moves, Ledger, plan spine,
heartbeat trace, flight recorder, Lens, genome, the Line — appear in annotations only. The
screens themselves show display language per the constitution's terminology table, plus the
label decisions fixed in §0.2 below. No architectural word is ever a UI label.

---

## 0. Conventions

### 0.1 Canvas and notation

- **Desktop reference canvas:** 1440×900, drawn here at ~92 characters wide. All layouts are
  fluid; the ASCII proportions are the binding ratio, not the pixel count.
- **Mobile reference canvas:** 390×844, drawn at ~46 characters. Every wireframe ends with its
  mobile treatment or an explicit **desktop-first** designation plus the mobile
  review/approve state (constitution §14).
- Notation used in every block:

| Mark | Means |
|---|---|
| `[Label ▾]` | a chip or control; `▾` = opens a picker/overlay on tap |
| `( Action )` | a button / action-rail entry |
| `▸` | tap-through — opens the named thing (rows, trace, story, item) |
| `◉ / ◎ / ◌` | world presence: full / compressed / dim (curiosity-warm) |
| `●○○○` | the posture dial (four dots; lit dot = current facing) |
| `⟲` | heartbeat chip — opens the automation's run history (06 §3.2) |
| `✎` | provenance chip — opens the source (session History, grant, run) |
| `⚠ ✓ ✦ ▪` | state glyphs: warn · steady/done · glowing · blocked |
| `~ ~ ~` | dimmed/inert content beneath an overlay |
| `«…»` | generated narrative text (always evidence-linked; every clause is a `▸`) |

### 0.2 Label decisions (binding for prototypes)

The workshop and work anatomies have spec names with no mandated display strings. This document
fixes them:

| Spec name | On-screen label |
|---|---|
| the Bar | none — it is the input field; only its scope chip is labeled |
| the Face / the Desk | none — regions of the world screen, unlabeled (03 §0) |
| Bench / Palette / Counsel / Moves | none — the Palette shows only its group headers ("This world", "Knowledge", "Granted", "This session"); the Moves rail shows the verbs themselves; the Counsel pane has no title bar, only its scope chip; "counsel" in transcripts below is a placeholder speaker mark, not a label |
| the Ledger | **"History"**; its resume narrative renders under **"Where you left off"** |
| commit rail | **"Commit"** with its four exits spelled out |
| plan spine | **"Plan"** |
| flight recorder | **"Activity"** (constitution §2) |
| heartbeat trace | **"Run history"** |
| Standing Order | **"Automation"** (or "Routine" per world skin) |
| genome / setup stack | **"setup"**, only in creation surfaces |
| criteria pack | **"criteria"** — always shown with its version ("your criteria v3") |

### 0.3 The chrome, on every frame

Every desktop frame below carries the three fixed chrome elements (02 §1) in the same
positions; they are drawn once here and abbreviated afterward:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ {context header — empty at Home;                                  Pulse  [2·0·1·✓]     │
│  Face chip › area › session inside a world}                        ▲ four real counts:  │
│                                                                    waiting · blocked ·  │
│                        …the current place owns everything else…    needs-you · clock    │
│                                                                                        │
│                 ┌────────────────────────────────────────────────┐                     │
│                 │ [scope ▾]  say anything…                        │  ← the input (Bar)  │
│                 └────────────────────────────────────────────────┘                     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

The Pulse renders only confirmed counts; while a count is being recomputed it shows its last
verified value with a small clock-skew mark, never a spinner pretending to be a number. A stale
heartbeat turns the fourth segment amber and rings the Pulse (02 §4.1) — the one lie the shell
is forbidden to tell is a dead clock faking normalcy.

### 0.4 Honesty-state doctrine (applies to every frame)

- **Empty says the words.** No decorative zero states, no celebration. "Nothing needs you" is a
  legitimate, honest screen.
- **Loading never invents.** Arrival is prefetched (hover/focus pre-dresses — 02 §8); on a cold
  load, regions render dim structural placeholders with **no counts, no numbers, no sentences**
  until rows arrive. A number on screen is always a real number.
- **Error refuses theater.** A region that cannot verify its rows renders an honest stub —
  *"can't read live state (since 8:41) — showing nothing rather than guessing"* — with a retry.
  Stale data may render only when stamped with its age. A claim that cannot cite rows does not
  render at all (02 §10.1).

---

## 1. W1 — Home: the Brief, the Field, Continue, the Bar

### 1.1 Desktop at 5 worlds

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ (empty)                                                             Pulse [2·0·1·✓]    │
│                                                                                        │
│  «Tuesday, 8:40. A mostly quiet night.»                                                │
│  «While you were away — the client hunt added 14 prospects ▸; 3 follow-ups queued      │
│   for your approval ▸; Mom's invoice chase ⟲ sent rung 2 to two late payers ▸.»        │
│  «What changed — the Tuesday subject line drew 3 replies ▸. That closes your call:     │
│   you predicted Tuesday beats Thursday — right. Your hit-rate: 7 of 9 ▸.»              │
│  «Needs you — Kessler Plumbing's finished site is ready to review ▸; the speed-to-     │
│   lead draft for Mom ages out in 2 hours ▸.»                                           │
│  «In flight — Spring farm drop: step 3 of 6 · resumes when you approve the postcard ▸.»│
│  «Worth a look — the bee-hive exploration has returned 4 times — make it real? ▸»      │
│                                                                                        │
│ ───────────────────────────────────────────────────────────────────────────────────    │
│  [Clients] [Prospects] [Explorations] [Running] [Money] [Everything]                   │
│                                                                                        │
│    ◉ Kessler Plumbing            ◉ The Agency               ◉ Jane's Bakery            │
│      ✦ site ready for review       2 waiting on you           ⚠ care routine quiet     │
│                                                                  since Sun ⟲           │
│    ◉ Mom's Real Estate           ◌ why do bee hives work?                              │
│      ✓ steady · drop Thu           warm · 2 beacons held                               │
│                                                                                        │
│ ───────────────────────────────────────────────────────────────────────────────────    │
│  Continue                                                                              │
│   ▸ Collection Studio — "Fall drop direction" · Thread & Stone · 2h · at critique,     │
│     6 scored [bench thumbnail]                                                         │
│   ▸ "why do bee hives work?" — the map · 2 beacons held · yesterday                    │
│   ▸ Outreach Studio — "rung-2, quiet roofers" · The Agency · Mon · 12 drafts staged    │
│                                                                                        │
│                 ┌────────────────────────────────────────────────┐                     │
│                 │ [Home ▾]  say anything…                        │                     │
│                 └────────────────────────────────────────────────┘                     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Desktop at 100 worlds — the same screen, by construction

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ (empty)                                                             Pulse [6·1·3·✓]    │
│                                                                                        │
│  «Tuesday, 8:40.»                                                                      │
│  «While you were away — 11 routines ran clean across 9 worlds ▸; the hunt added 14     │
│   prospects ▸; 3 client follow-ups queued ▸; Delgado Tax and Ferris Upholstery         │
│   replied ▸ ▸.»                                                                        │
│  «Broken — Harbor Dental's review-request routine went quiet Sunday ⟲ ▸.»              │
│  «Needs you — Kessler's site ▸; two replies ▸; the postcard print run ▸.»              │
│  «In flight — 4 missions running; nearest wake: farm drop, on your approval ▸.»        │
│                                                                                        │
│ ───────────────────────────────────────────────────────────────────────────────────    │
│  [Clients] [Prospects] [Explorations] [Running] [Money] [Everything] [More ▾]          │
│                                                                                        │
│    ◉ Harbor Dental ⚠ went quiet   ◉ The Agency 2 waiting    ◉ Kessler Plumbing ✦      │
│    ◉ Ferris Upholstery ✦ replied  ◉ Delgado Tax ✦ replied   ◉ Mom's Real Estate ⚠     │
│    ◉ Jane's Bakery ⚠ overdue inv  ◉ Thread & Stone ✓ run.   ◉ Support Inbox 1 needs   │
│    ── running quietly ──────────────────────────────────────────────────────────       │
│    ◎ Brightwell Vet ✓  ◎ Marsh & Co ✓  ◎ Oak Realty ✓  ◎ Pinehill Dental ✓  +10 ▸     │
│    ─────────────────────────────────────────────────────────────────────────────       │
│    61 worlds quiet — all clean ▸        (dormant worlds don't render; find by meaning) │
│                                                                                        │
│ ───────────────────────────────────────────────────────────────────────────────────    │
│  Continue  ▸ Outreach Studio — "rung-2…" · Agency   ▸ Site Studio — "Kessler build     │
│  review" · 6:12   ▸ Theories Studio — "anesthesia & IIT" · Fri                         │
│                 ┌────────────────────────────────────────────────┐                     │
│                 │ [Home ▾]  say anything…                        │                     │
│                 └────────────────────────────────────────────────┘                     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Elements

- **The Brief** — generated stanzas in fixed order (away · changed · needs you · in flight ·
  worth a look), every clause a `▸` to its rows. Calibration is portfolio news: closed
  predictions render with the running hit-rate (mastery, constitution §12.4). At 100 worlds the
  Brief is *not* longer — it is attention-ranked, and quiet worlds contribute zero sentences.
- **Lens chips** — built-ins first, then saved views, tail under `More ▾`. Tapping morphs the
  Field in place (W7); scope chip stays `Home`.
- **The Field** — six attention classes, ≤9 worlds in full presence, running-quiet compressed
  to name-glyph rows, one expandable quiet band, dormant absent. Every glow survives "which
  row is that?" — the state line under each orb *is* the evidence door. The uncompressible
  rule: Harbor Dental's went-quiet routine holds it in full presence regardless of ranking.
- **Continue** — 3–5 resumable sessions: surface glyph · intent-name · world stamp · freshness
  · one line of left-state from the session History. Workshop sessions carry a small bench
  thumbnail. Rows resume the exact surface, pre-dressed (hover prefetches).
- **The Bar** — scope chip `[Home ▾]` (tapping it opens the switcher — 11 §7). While typing,
  the interpretation chip renders above: `→ Jane's Bakery · draft follow-up`.

### 1.4 States

- **Empty (new account):** the Bar plus one line — *"Say anything — a question, a business, a
  thing to build — and I'll make it a world."* No sample cards, no tour.
- **Quiet night:** the Brief is one line — *«Quiet night. Three routines ran clean; nothing
  needs you.»* — and cedes the screen to the Field. The Pulse is a dim dot.
- **Loading:** stanza and orb placeholders render dim with no text and no counts; the Pulse
  shows last-verified counts with a skew mark. Nothing numerical appears until rows do.
- **Error:** if live state can't compile — *«Can't read live state (since 8:41). Showing
  nothing rather than guessing.»* ( Retry ) — the Field renders nothing below it. If only the
  clock is stale, the Pulse ambers and the Brief leads with it.

### 1.5 Mobile

Full-fidelity operate mode: Brief stanzas → lens-chip row → the attention set as a list
(state line per row) → Continue → the Bar with a send affordance and voice. The quiet band is
one tappable row. Identical counts, identical evidence links.

### 1.6 Chips visible on this frame

Scope chip `[Home ▾]` · Pulse counts (4 segments) · `⟲` on every clause and orb that digests an
automation · `✦/⚠/✓` state glyphs on orbs · lens chips · world stamps on Continue rows. No
provenance chips at Home beyond `⟲` — Home aggregates nothing across counterparty scopes.

---

## 2. W2 — The Queue, with an email approval open inline

Opened from the Pulse, `Cmd+.`, `/queue`, or any waiting badge anywhere. A right-side overlay
(~440px) over the current place, which dims and never changes. Esc returns exactly.

```
┌── current place, dimmed, untouched ──────────────┬─────────────────────────────────────┐
│ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~    │ Queue        [world: All ▾] [class ▾]│
│ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~    │ Waiting (6) · Held (1) · Auto-ran(12)│
│ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~    ├─────────────────────────────────────┤
│ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~    │ CLIENT FOLLOW-UPS (3)  (Review as   │
│                                                  │  batch ▸)                           │
│                                                  │ ┌ ⚙ 9 clean approvals of this class │
│                                                  │ │ for Harbor Dental — auto-approve? │
│                                                  │ │ Instantly revocable; everything   │
│                                                  │ │ stays in this list, marked.       │
│                                                  │ │ ( Yes — approve this ) (Not now)  │
│                                                  │ └───────────────────────────────────│
│                                                  │ ▾ [Harbor Dental · Dr. Okafor] ·    │
│                                                  │   follow-up · 2h ·                  │
│                                                  │   Automation: review requests,      │
│                                                  │   rung 2 ⟲                          │
│                                                  │                                     │
│                                                  │   Send this follow-up to Dr. Okafor?│
│                                                  │   To: frontdesk@harbordental.com    │
│                                                  │   Subject: your new booking page    │
│                                                  │   ┌ the draft ─────────────────────┐│
│                                                  │   │ Hi Dr. Okafor — since the       ││
│                                                  │   │ booking page went live, 9        ││
│                                                  │   │ patients booked online ▸. Worth  ││
│                                                  │   │ adding the link to your          ││
│                                                  │   │ voicemail? I can draft the       ││
│                                                  │   │ script.                          ││
│                                                  │   └─────────────────────────────────┘│
│                                                  │   thread: their last reply, Apr 2 ▸ │
│                                                  │   [compare ▾: vs rung 1, sent Apr 2]│
│                                                  │   ┌ rung 1 ──────┬ this draft ─────┐│
│                                                  │   │ generic nudge │ cites the 9     ││
│                                                  │   │ no evidence   │ bookings ▸      ││
│                                                  │   └───────────────┴─────────────────┘│
│                                                  │   score 8.6 vs your outreach        │
│                                                  │   criteria v3 — why ▸ (specificity 9│
│                                                  │   · one ask 9 · honesty ✓ · brevity │
│                                                  │   8 — criteria are editable ▸)      │
│                                                  │  (Approve a)(Edit e)(Decline d)     │
│                                                  │  (Hold h ▾ "after they reply…")     │
│                                                  ├─────────────────────────────────────┤
│                                                  │ ▸ [Mom's Real Estate] · print run · │
│                                                  │   Mission: Spring farm drop, step   │
│                                                  │   3 of 6 — approving resumes it     │
│                                                  │ ▸ [Harbor Dental · Dr. Okafor] ·    │
│                                                  │   ▪ went quiet Sun · review-request │
│                                                  │   routine ⟲ (Retry)(Fix ▸)(Pause)   │
│                                                  │ j/k move · a approve · e edit ·     │
│                                                  │ d decline · h hold · Enter expand · │
│                                                  │ u undo                              │
└──────────────────────────────────────────────────┴─────────────────────────────────────┘
```

### 2.1 Elements and interactions

- **One global list**, grouped class → world, filterable by world/class/state. Tabs: Waiting ·
  Held · **Auto-ran** (the ledger view of earned autonomy — every autonomous action a visible
  row with per-row revoke).
- **Item anatomy** (binding, 02 §4.2): stamp row (world Face chip with counterparty stamp ·
  class · age · producer with `⟲`/`✎`) → the ask in one sentence → the whole decision inline →
  action rail. The email item preloads the full draft, recipient, the prior exchange, a
  **compare** (this draft vs the last thing actually sent), and the critique score *with the
  criteria that produced it* — every approval is a rep of judgment (mastery §12).
- **Edit-then-approve (`e`)** turns the draft editable in place; committing shows the diff of
  your edit for one beat and records it as a verdict — kept-vs-rewritten feeds the drafting
  loops.
- **Batch** — the class header's *Review as batch* stacks the three drafts as cards walked
  with `j/k`+`a`; *Approve all remaining* stages per-item approvals behind one hold-to-confirm.
  Mixed classes never batch.
- **Earned-autonomy offer** lives on the class header, cites its evidence count, and is itself
  an approval. Declining silences it until the streak doubles.
- **Failure citizenship** — the went-quiet item carries the Activity excerpt and remedies
  (Retry · Fix opens the exact surface · Pause). Never a toast.
- **Approving the mission-gated item** fires a 6-second transient («Spring farm drop resumed»)
  — wake visible from both ends (W9).

### 2.2 States

- **Empty:** *"Nothing needs you."* — dim, one line. The Pulse outside is a calm dot.
- **Loading:** items render their stamp rows first; an item whose decision context has not
  loaded shows the context region dim and **disables Approve** until it carries the whole
  decision — *"can't show the full decision yet — not approvable until it can"* ( Retry ). An
  item that can't carry its context is malformed, not approvable.
- **Error:** a failed action (send bounced after approve) files a new needs-you item; the
  original stays in Auto-ran/history with its true outcome. `u` (undo) works within the
  transient window.

### 2.3 Mobile

**Full.** Items are full-screen cards; `j/k` becomes swipe-walk; hold-to-confirm for batch;
compare renders two-up stacked. A decaying approval that pushed opens exactly this item from
the lock screen, whole decision inline.

### 2.4 Chips visible

World Face chip + counterparty stamp on every item · producer chip with `⟲` (automation) or
`✎` (session/mission provenance) · score chip naming criteria version, tap-through to the
rubric · scope chip of the place beneath, unchanged — the Queue never changes your scope.

---

## 3. W3 — A client world Desk: Jane's Bakery

Landing for every world-level entry (`/w/janes-bakery`). Client dressing per 03 §7.1.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [Jane's Bakery · Client · Website + Automations ·                    Pulse [2·0·1·✓]   │
│  since March · $500/mo · Jane Alvarez] · serves ← Agency · 1 grant ▸                   │
│  Service ✓ steady   Money ⚠ inv #12 · 3d overdue ▸   Owed to Jane ⚠ reply ▸   ↗ momentum│
│────────────────────────────────────────────────────────────────────────────────────────│
│  Site · Campaigns · Automations · Conversations · Money · More ▾          ●○○○ (Execute)│
│────────────────────────────────────────────────────────────────────────────────────────│
│  NEXT                                                                                  │
│  ① «Jane replied — positive. Your response is drafted; the follow-up automation        │
│     paused itself pending it.» ✎ thread          ( Open the reply — draft staged )     │
│  ② «Invoice #12 is 3 days overdue — the chase is drafted, waiting at the gate.» ⟲      │
│     ( Review the chase draft )                                                         │
│  ③ «Monthly report is assembled from real numbers — review before Friday's send.»      │
│     ✎ service calendar                            ( Open the report )                  │
│                                                                                        │
│  RUNNING                                                                               │
│   Mission · Site refresh — step 2 of 4 · running: "rebuilding the menu page" ▸         │
│   Automation · Follow-ups        ⟲ last Tue 07:00 · next: paused pending ① · drafts    │
│   Automation · Invoice chase     ⟲ last Tue 07:00 · next Thu · 6 of 40 cap · drafts (⏸)│
│   Automation · Review requests   ⟲ last Mon · next Mon · auto-runs: thank-yous ▸ (⏸)   │
│                                                                                        │
│  WAITING ON YOU (2)  — decide here                                                     │
│   ▸ chase rung 1 to Jane — draft inline (Approve)(Edit)(Decline)(Hold)                 │
│   ▸ publish menu page v3 — before/after ▸                                              │
│                                                                                        │
│  RECENT   [menu page v3 · draft ✎session] [March report · sent ✓] [postcard · ✦ 6 calls]│
│  OPEN ASKS  «What's the deposit policy?» — answer inline… (needed by: invoice terms)   │
│                 ┌────────────────────────────────────────────────┐                     │
│                 │ [Jane's Bakery · Jane ▾]  say anything…        │                     │
│                 └────────────────────────────────────────────────┘                     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Elements

- **The Face** — name · presentation line as facts (the only place the setup routinely shows)
  · counterparty stamp **Jane Alvarez** (tap: relationship, consent state, money standing, the
  isolation contract in plain words) · edge sentence `serves ← Agency` · grants indicator
  (`1 grant ▸` lists cross-world grants, revocable). Vitals: 2–4 named signals, each one of
  five states, each `▸` to its rows; no composite score, ever.
- **NEXT** — ≤3 staged moves, each with its visible reason (`✎`/`⟲` names the evidence), each
  opening the exact working surface pre-dressed in one gesture. The Desk offers; it never
  executes its own suggestions.
- **RUNNING** — one line per mission (plan state ▸ opens W9) and per automation (heartbeat
  chip `⟲` opens W10; `⏸` is the one-gesture pause, right on the row). A paused or quiet
  routine renders loud here and cannot compress.
- **WAITING ON YOU** — the world's slice of the one Queue, decidable inline without leaving.
- **RECENT** — artifact frames, compare-ready; outcome annotations ride them (`✦ 6 calls`).
- **OPEN ASKS** — intake as ordinary staged items, inline-answerable, each naming what it
  unlocks. Never a form.
- **The dial** `●○○○` — flipping to Observe re-leads with outcomes and the report; to Think,
  with open questions and the Playbook. Classes 1–3 (trust, judgment owed, the other side
  moved) hold position in every posture. No label; no gating.

### 3.2 States

- **Quiet Desk:** *«Nothing needs you; the mailing runs Thursday.»* — one line under NEXT.
  Padding slots with invented urgency is forbidden.
- **No signal:** a vital with nothing measured renders gray with the words *"no signal yet"* —
  never an optimistic default.
- **Loading:** Face renders from cache with an age stamp if fresh rows are pending
  (*"as of 8:12"*); NEXT renders nothing until staged from real rows.
- **Error:** a vital whose rows can't be read renders *"can't verify — last checked 8:12 ▸"*
  in gray; it cannot render ✓ while unverifiable. A blocked automation renders ▪ here and in
  the Pulse simultaneously.

### 3.3 Mobile

**Read-mostly.** Face + vitals, NEXT (each move opens its review state: the reply thread with
draft, the chase approval, the report), RUNNING rows with `⟲` and `⏸` fully working, WAITING
decides inline. Areas collapse behind one row. Craft entry points defer to desktop.

### 3.4 Chips visible

Face chip with counterparty stamp (header, always) · scope chip agreeing with it (Bar) · edge
sentence + grants indicator · `⟲` per automation row and Brief-fed lines · `✎` provenance on
staged-move reasons and artifact frames · outcome annotation chips on RECENT · `⏸` per row.

---

## 4. W4 — A curiosity world: the Explore surface, live map and beacons

`/w/bee-hives/x/main` — conversation-forward, map as the permanent margin (04 §3).

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [why do bee hives work? · Exploration]                              Pulse [2·0·1·✓]    │
│  momentum: 9 nodes this week · 2 beacons held           (this Face cannot warn)        │
│────────────────────────────────────────────────┬───────────────────────────────────────│
│  THE CONVERSATION                              │  THE MAP                    (Tab ⇄)   │
│                                                │                                       │
│  you: so is the queen actually in charge       │        [waggle dance]                 │
│      of anything?                              │        /            \                 │
│  counsel: what would "in charge" predict       │  [stigmergy]——[swarm consensus]       │
│      that decentralized control wouldn't?      │      |      sim      |                │
│      Two of your sources bear on this ▸ ▸      │  supports (in simulation) ▸           │
│                                                │      |               |                │
│  you: hold that thought — do hives vote,       │  ⚑[do hives vote, or converge?]       │
│      or converge?                              │      guess held: quorum sensing       │
│  counsel: parked. Your guess: quorum           │                                       │
│      sensing — held. ⚑                         │  THEORY · Stigmergy explains it       │
│                                                │  4 supporting · 1 contradicting ·     │
│  ┌ map delta ─────────────────────────────┐    │  2 untested assumptions ▸ ▸ ▸         │
│  │ +2 concepts · 1 source · new edge:     │    │  ( Compare with: central control ▸ )  │
│  │ stigmergy → markets  ▸ show on map     │    │  ( Critique this theory ▸ criteria )  │
│  └────────────────────────────────────────┘    │                                       │
│                                                │  BEACONS (2)                          │
│  ( branch here ) ( hold that thought )         │  ⚑ do hives vote…? · today            │
│  ( take this into a workshop ▾ )               │  ⚑ redundancy & stability · 6w ·      │
│                                                │     guess: yes ▸                      │
│────────────────────────────────────────────────┴───────────────────────────────────────│
│                 ┌────────────────────────────────────────────────┐                     │
│                 │ [Bee hives ▾]  ask, wonder, branch…            │                     │
│                 └────────────────────────────────────────────────┘                     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Elements and interactions

- **Split:** conversation left two-thirds, map right third. `Tab` (or "show me the map")
  swaps to map-forward — same session, same address. The map IS the record; reopening always
  lands map-forward on the **re-entry story**: *«You were three branches deep. You hold two
  beacons — the older for six weeks… Stigmergy is your strongest theory: 4 supporting, 1
  contradiction unresolved.»* — every clause a door.
- **Map delta chip** under the latest exchange — the extraction is continuous and quiet; the
  chip is how you audit it and how you undo a detected fork. Never a dialog.
- **Beacons** — "hold that thought" mints one: the gap as a question, the held guess, age,
  park point. The rail lists them oldest-faintest; resolving one records whether the guess was
  right and feeds the calibration record (mastery).
- **Theory cards** — claim + honest tally (counts open rows; no invented confidence numbers).
  *Compare* aligns evidence columns side by side and proposes the discriminating test, staged
  one tap from the Lab. *Critique* scores against the research criteria (evidence quality,
  assumption honesty, steelman, falsifiability) — visible, editable.
- **Sim honesty:** simulation-derived edges render distinctly and read *"supports (in
  simulation)"* everywhere they appear.
- **No save button exists.** Everything is already rows; closing mid-sentence costs nothing.
- **"Take this into a workshop"** opens the Theory Studio / Lab / any craft with the branch's
  map context riding in as Palette cards.

### 4.2 States

- **Empty (first exchange):** the map margin shows one dim line — *"the map grows as you
  talk"* — shown once, ever. The world was born silently on Enter; the URL changing was the
  whole ceremony.
- **Loading (return):** the re-entry story renders first (it is small and prefetched); the
  full map fills behind it.
- **Error:** if extraction stalls, the delta chip reads *"mapping paused — conversation
  unaffected"* ( Retry ); the thread never blocks on the map.
- **Dormant return:** *"dormant since May — everything is as you left it"* over the re-entry
  story; the visit itself is a return signal.

### 4.3 Mobile

Conversation-forward with the map as a tab. Beacon review, theory comparison, and "hold that
thought" (voice included) are full; map gardening is desktop work. A voice walk builds the map
silently and renders it on return: *«while you walked: 9 concepts, 2 theories, 1 beacon.»*

### 4.4 Chips visible

Face chip (question-as-name + "Exploration" tag; no money, no counterparty, no vitals) · scope
chip `[Bee hives ▾]` · `⚑` beacons with ages · *(in simulation)* stamps on sim evidence ·
source nodes carry `✎` to their rows; a cross-world adjacency card carries provenance
(*"pattern from: Agency pricing exploration"*) — patterns travel, data doesn't.

---

## 5. W5 — The Proposal / Charter: a client world with connection grants

One screen, reached when the interpretation chip read `→ new client world · Harbor Dental —
will propose setup + connection grants`. Rung 3 shown (counterparty identity involved).

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ (empty)                                                             Pulse [2·0·1·✓]    │
│  THE WORLD THIS WILL BE                                                                │
│  Harbor Dental                                          (name — edit in place)         │
│  «Client · Website + Automations · $500/mo»             (the Face it will wear)        │
│                                                                                        │
│  SETUP   «Client + Website + Automations — based on your proven client setup,          │
│  used ×9, refined 4 times ▸»                       (unfolds the layers, each ✎)        │
│                                                                                        │
│  AREAS IT WILL OPEN WITH                                                               │
│   Site — opens the rebuilt site from the pitch ✎funnel record            ( remove )    │
│   Campaigns — studio ✎setup    Automations — view ✎setup                 ( remove )    │
│   Conversations — seeded with the outreach thread history ✎funnel        ( remove )    │
│   Money — invoices + subscription, terms from the pitch ✎                ( remove )    │
│                                                                                        │
│  AUTOMATIONS IT WANTS TO RUN            (all born propose-only; each removable)        │
│   Invoice chase · monthly, 3 rungs · emails late payers only · cap 20/mo ·             │
│     proposes drafts, never auto-sends                                    ( remove )    │
│   Review requests · after completed appts · SMS, consented contacts only ·             │
│     cap 40/mo · proposes drafts                                          ( remove )    │
│   Missed-call text-back · on missed call · runs under THEIR name — see below           │
│                                                                                        │
│  STARTS WITH   [demo site ✎ built during the pitch] [site audit ✎] [proposal ✓ signed] │
│                                                                                        │
│  IT WILL ASK   now: «Retainer, or one-off build?»  (⦿ retainer ○ one-off — choosing    │
│  one-off removes the subscription line and the monthly report, live)                   │
│  later, on its Desk: deposit policy · brand assets · preferred send window             │
│  (nothing the pitch already answered appears here)                                     │
│                                                                                        │
│  CONNECTIONS IT NEEDS — nothing is inherited silently                                  │
│   «Send email as hello@harbordental.com — needs: their domain verified.                │
│    Scope: this world only.»                                    ( grant ) ( defer )     │
│   «Read their Google Business reviews — uses your Google connection.                   │
│    Scope: read-only, this world only.»                         ( grant ) ( defer )     │
│   «Text from their practice number — theirs, revocable.»       ( grant ) ( defer )     │
│                                                                                        │
│  IT INHERITS   [pricing playbook — from your last 4 clients ▸]  ( decline )            │
│                [Tuesday-send timing — earned in Jane's Bakery, 9 sends ▸] ( decline )  │
│                                                                                        │
│  THEIR SIDE OF THE LINE                                                                │
│  «Runs under Harbor Dental's name: reminders · missed-call text-back · review          │
│   requests. Their data stays here: patient contacts, messages, reviews never leave     │
│   this world — patterns travel, data doesn't. SMS: consented contacts only;            │
│   automations fail closed without it. Their connections: theirs, revocable,            │
│   listed on the Face.»                                                                 │
│   [ ✓ I understand what runs under their name ]                                        │
│                                                                                        │
│  FIRST MOVES   ① ask for brand assets  ② confirm scope  ③ mission: site live by        │
│  the 15th ✎compiled from the pitch — editable ▸                                        │
│                                                                                        │
│                       ( Create this world )                                            │
│                 ┌────────────────────────────────────────────────┐                     │
│                 │ [Harbor Dental (proposed) ▾]  also handle…     │                     │
│                 └────────────────────────────────────────────────┘                     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 5.1 Elements and interactions

- **One screen, no step 2.** Every region is a drafted decision, correctable inline — not a
  field to fill. The Bar at the bottom is scoped to the world-to-be: *"also handle her Google
  reviews"* adds the area, the automation row, and the grant row in one motion.
- **The rung recomputes live.** Remove everything that sends and the isolation section and
  grant rows visibly disappear; the ceremony lightens on screen.
- **Grants are sentences** — connection, direction (read/send/spend), scope, in words. `defer`
  converts a grant into a Desk ask; the dependent automation shows *waiting on it*. Charter
  never blocks on an unfulfillable grant.
- **Two deliberate marks at rung 3**: the isolation acknowledgment and the charter action —
  adjacent, same screen, distinct agreements. No "are you sure?" dialogs anywhere.
- **What charter does:** births the world inert — lineage recorded, grants scoped, automations
  armed propose-only. Nothing sent, nothing spent. Intake arrives later as Desk moves (W3).
- **Parkable:** the Proposal persists as a draft (`/new/harbor-dental`), resumable from
  Continue; abandoning creates nothing.

### 5.2 States

- **Loading:** the Proposal renders only when whole; until then the interpretation chip shows
  *"drafting the proposal…"* and the operator stays where they were. No half-screen.
- **Empty regions say so:** a venture proposal shows *"Automations: none — ventures start
  quiet"*; absence is stated, not hidden.
- **Error:** an uninferable assembly fact becomes an inline question (never an error state); a
  failed grant check renders on its row — *"their domain isn't verified yet — deferred to an
  ask"* — and the charter stays available.

### 5.3 Mobile

**Full.** One scrollable screen by design; signing a client from the road works, isolation
acknowledgment included. Grant actions render as full-width rows.

### 5.4 Chips visible

`✎` provenance on every drafted row (funnel record, setup layer, sibling world, playbook with
earn-lines) · scope chip `[Harbor Dental (proposed)]` · inheritance cards name where each
pattern was earned · no counterparty stamp yet — it mounts at charter.

---

## 6. W6 — A Workshop in session, twice

### 6A. The apparel gallery bench — Collection Studio, "Fall drop direction"

`/w/thread-and-stone/collection/s/fall-drop` — `gallery/variants` archetype (16 §5.1, §13.1).

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [Thread & Stone · Brand · first collection] › Collection ›           Pulse [2·0·1·✓]   │
│  session "Fall drop direction"                                                         │
│  constraints: [no all-over prints · Mar ✎] [more heritage, same palette] [keep ≥ 8 ·    │
│  your criteria v3 ▸]                                        History ▸ · Where you left │
│──────────────┬────────────────────────────────────────────┬────────────────────────────│
│ This world   │  SET A — heritage (8)      scored ✓        │ [Thread & Stone ▾] ← scope │
│  brand kit ▸ │  ┌────┐ ┌────┐ ┌────┐ ┌────┐               │                            │
│  spring drop │  │ #1 │ │ #3 │ │ #4 │ │ #9 │  + 4 more     │ «Spring's heritage pieces  │
│  artifacts   │  │7.9 │ │8.6✦│ │8.1 │ │6.9*│               │ outperformed. Marcus       │
│  (✦ hoodie:  │  └────┘ └────┘ └────┘ └────┘               │ granted three new works    │
│  61% of rev) │  * kept below bar — your reason recorded ▸ │ in June — unused.» ▸ ▸     │
│ Knowledge    │                                            │                            │
│  «earth tones│  SET C — utility (4)       unscored        │ CRITIQUE — #3 vs v3        │
│  outsold     │  ┌────┐ ┌────┐ ┌────┐ ┌────┐               │  print integrity 9 — line  │
│  brights 3:1»│  └────┘ └────┘ └────┘ └────┘               │   weights survive at scale │
│  ▸ evidence  │                                            │  brand fit 8 — collar      │
│  criteria v3▸│  SET B — athletic — killed by you:         │   reads heritage           │
│ Granted      │  "we tried athletic in spring; it died" ▸  │  distinctiveness 8         │
│  Marcus's    │                                            │  feasibility 8             │
│  artwork ×3  │  ┌ compare ─────────────┐  TOURNAMENT      │  = 8.6  (score first, then │
│  ✎ granted   │  │  #3   vs   #4        │  6 entries ·     │  see mine — blind toggle)  │
│  from        │  │  [    ] | [    ]     │  round 2 of 3 ▸  │                            │
│  Marcus's    │  │  zoom synced         │  ( pick winner ) │ ( what do you think? )     │
│  studio ·    │  └──────────────────────┘                  │ ( score what's left )      │
│  revocable   │                                            │                            │
│ This session │                                            │                            │
│  worker batch│                                            │                            │
│  10 ▸ 4 above│                                            │                            │
│  bar ✎worker │                                            │                            │
│──────────────┴────────────────────────────────────────────┴────────────────────────────│
│  vary · recolor · constrain · combine · place-on-product · tournament · score          │
│     each: ( do it | ask | overnight… )                                                 │
│  Commit ▸  → piece/collection  → Mission "produce the drop"  → Automation  → Hand off  │
│                 ┌────────────────────────────────────────────────┐                     │
│                 │ [Thread & Stone ▾]  more like #3, but…         │                     │
│                 └────────────────────────────────────────────────┘                     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

**Elements.** Left: the Palette's four groups, every card answering "why is this here?" in one
line; outcome annotations ride prior artifacts; the granted artwork wears its full provenance
chip, which travels onto the bench and into every artifact that uses it. Center: the Bench —
variant sets named by their differences, scores on scored sets, kill-with-why preserved in
place (Set B's reason is a History entry, readable forever), comparison as a bench *state*
(synced zoom, work continues while comparing), the tournament chip with its bracket
inspectable. Right: the Counsel — situates first (anti-generic invariant: it opens knowing the
spring outcomes and the unused grant), critiques with per-criterion whys, and supports blind
scoring (*score first, then see mine* — 17's judgment reps). Bottom: the Moves rail with the
drive choice on every verb (do it / ask / overnight = hand off), and the Commit rail's four
exits. The History link opens the stream + the story; every entry carries its driver stamp
(*you · counsel · worker (run) · routine*).

**States.** *Empty (first session in a new world):* the Palette states what it lacks —
*"no prior artifacts; criteria v1 is a starter pack — edit it early, it is the room's taste"*;
the Counsel says what it does not know rather than performing knowledge. *Loading (worker
live):* handed-off material lands on the bench visibly marked `✎worker`, appended, never
mutating your sets. *Error:* a failed move lands a failure card in place of its result —
*"recolor failed — Activity ▸ ( Retry )"* — never silence. *Resume:* thirty days later, the
story first: *«You converged on heritage; the worker produced 10 overnight, 4 above bar; one
blocked on the ungranted flat-lay ▸»* — one gesture drops to the bench exactly as left.

### 6B. The outreach document bench — Outreach Studio, "Rung-2 for the quiet roofers"

`document` primary + `table` flank (16 §5.2, §13.2).

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [The Agency · Business] › Outreach › session "rung-2, quiet roofers"  Pulse [2·0·1·✓]  │
│  constraints: [≤ 90 words] [subject ≤ 6 words ✎playbook] [keep ≥ 8 · outreach v3 ▸]    │
│──────────────┬──────────────────────────────────────────┬──────────────────────────────│
│ This world   │  forks:  A ✝4.2  B ✝6.1  [C ● 8.8]  D ✝5.9│  THE 14 (table flank)       │
│  rung-1 seq. │  ┌ fork C — value-first ────────────────┐│  ┌──────────────────────────┐│
│  ✎ 2 replies │  │ Subject: your site's booking gap     ││  │ Acme Roofing   ✎scrape · ││
│  of 40       │  │                                      ││  │  audit ▸ · rung1 no-reply││
│ Knowledge    │  │ Hi {first} — I audited {site} and    ││  │ Ridgeline Rf.  ✎ · ▸     ││
│  «Tuesday    │  │ found {audit.finding} ▸. Fixed, that ││  │ ~Summit Rfg~  suppressed ││
│  sends: 3    │  │ usually means {audit.impact} ▸.      ││  │ ~Topline Rf~  suppressed ││
│  replies» ▸  │  │ Want the 2-minute version?           ││  │ … 10 more rows ▸         ││
│  «specific   │  │                                      ││  └──────────────────────────┘│
│  flaw ×2     │  │ margin: 3 ways to say this ▸         ││  suppressed rows were never  │
│  reply rate»▸│  └──────────────────────────────────────┘│  drafted — fail-closed       │
│  suppression │  red-line pass (counsel) shown as marks ▸│                              │
│  list ▸      │  sample-check: 3 of 12 inspected — 1     │  RUBRIC — fork C vs v3       │
│ This session │  stale finding fixed ✎you                │  specificity 9 · one ask 9 · │
│  audits ×12 ▸│                                          │  honesty ✓ (every claim has  │
│              │                                          │  a row) · brevity 8          │
│              │                                          │  fork A: honesty 2 — "we     │
│              │                                          │  have no evidence about      │
│              │                                          │  competitors" — killed ▸     │
│──────────────┴──────────────────────────────────────────┴──────────────────────────────│
│  rewrite-in-voice · tighten · fork · red-line · score · merge-per-row · sample-check   │
│  Commit ▸  → 12 drafts to the Queue (send is the gate)  → Automation "make this a      │
│  routine" (3rd time this shape — proposed ✎evidence)    → Hand off                     │
│                 ┌────────────────────────────────────────────────┐                     │
│                 │ [The Agency ▾]  tighten the ask…               │                     │
│                 └────────────────────────────────────────────────┘                     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

**Elements.** The living document at center with fold-out inline alternatives and the
Counsel's red-line pass rendered as marked edits (labeled as its own, beside yours). Forks
carry their scores; killed forks stay visible, struck, with the killing criterion named — the
honesty criterion kills structurally, not stylistically. The table flank holds the 14 rows
with per-row provenance (scrape run, audit artifact, rung-1 send); the two suppressed rows are
struck and **were never drafted into sendable state** — fail-closed at composition, counted
honestly. *Sample-check* is the honesty move: hand-inspect a random n, fixes recorded. The
merge fills fork C per row from each business's real audit rows — merge fields render as
holes until filled with cited values. Commit stages **12 drafts at the Queue as a batch**
(walked in W2); the third materially-identical session surfaces the quiet promotion offer,
evidence-linked.

**States.** *Empty flank:* *"no rows staged — this session started from the document"*.
*Loading:* row provenance loads before row action; a row without its audit artifact shows the
merge hole unfilled and excludes itself from commit until resolved. *Error:* a stale merge
value found at sample-check marks the row and blocks only that row's draft.

### 6.5 Mobile (both benches)

**Desktop-first.** A session address on a phone lands on the story (*Where you left off*),
then offers the session's judgment work as cards: variants to score (blind-first), a
tournament round to pick, fork C vs fork D to call, a report card to accept, commits waiting
on the rail. No drag-arranging, no constraint gardening. Phone judgments land in the same
History with the same driver stamps; the desktop bench opens later exactly where they left it.

### 6.6 Chips visible

Context header three segments (Face › area › session) · scope chip = the world · constraints
ribbon chips each with `✎` when sourced (playbook, a March decision) · criteria version chip
(`v3 ▸`, editable) · `✎ granted from Marcus's studio · revocable` on every granted item and
every bench use of it · driver stamps on all History entries · outcome annotations on Palette
artifacts · suppression sourced to its standing list.

---

## 7. W7 — The client-pipeline Lens (board), with the drop

`/l/clients` — Home morphed in place. Scope chip stays `Home`; context header stays empty.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ (empty — you are still at Home)                                     Pulse [6·1·3·✓]    │
│  [Clients ●] [Prospects] [Explorations] [Running] [Money] [Everything]   filters:      │
│                                                    [replied] [has-waiting] [overdue]   │
│────────────────────────────────────────────────────────────────────────────────────────│
│ ONBOARDING(1)│ BUILD (2)     │ REVIEW (2)     │ LIVE (4)        │ RENEWAL (1)          │
│              │               │                │                 │                      │
│ ◉ Delgado Tax│ ◉ Ferris Uph. │ ◉ Kessler      │ ◉ Jane's Bakery │ ◉ Marsh & Co         │
│  3 asks open │  step 2 of 5 ▸│  Plumbing ✦    │  ⚠ care routine │  term ends in 12d ▸  │
│  ✎ spawned   │  [1 waiting]  │  build done    │  quiet Sun ⟲    │  renewal brief       │
│  from close- │               │  6:12 ▸ —      │  [at risk ✎you· │  staged ▸            │
│  won Mar 12  │ ◉ Brightwell  │  awaiting YOUR │   May 2]        │                      │
│              │  Vet          │  approval      │ ◉ Harbor Dental │                      │
│              │  step 4 of 5 ▸│  [1 waiting]   │  ▪ went quiet ⟲ │                      │
│              │               │ ◉ Harbor Dental│ ◉ Oak Realty ✓  │                      │
│              │               │  sign-off sent │  opened ▸ 2d    │                      │
│              │               │  3d ago — aging│ ◉ Pinehill ✓    │                      │
│              │               │  ▸ nudge staged│  replied ▸ 4h   │                      │
│────────────────────────────────────────────────────────────────────────────────────────│
│  stages are computed from rows ▸ · needs-you sorts first · ( Save this view )          │
│                 ┌────────────────────────────────────────────────┐                     │
│                 │ [Home ▾]  clients who haven't replied in a week│                     │
│                 └────────────────────────────────────────────────┘                     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 7.1 Elements and interactions

- **Evidence-computed stages** — a card is in Review because a build finished and an approval
  or sign-off exists; the column footer's `▸` answers "which rows put this card here?".
  Dragging is legal only for judgment stages (`at risk` — stamped *who judged, when*); a drag
  can never fake evidence or perform work: dragging toward "Pitched"-like stages *offers to
  stage* the move through that world's gate.
- **Card anatomy** — Face chip (counterparty-stamped) · honest one-line state · declared
  signal fields (post-send signals: delivered/opened/clicked/replied with age; money standing)
  · badges from real counts (`[1 waiting]`, `⟲` states). A row renders only its own world's
  data — fifty scopes side by side, never aggregated across the counterparty line.
- **The drop** — tap the card → that world's Desk, pre-focused on the card's reason (Kessler
  lands with "Review the finished site" staged and the compare open). Tap a **signal cell**
  (`replied ▸`) → the exact thread, scrolled to the reply. Tap a **waiting badge** → the Queue
  opens filtered, *no place change*. Tap an **automation state** (`⟲`) → the run history
  overlay, pause right there. Return restores the board exactly — scroll, filters, expansions.
- **Bulk** — select N cards → "nudge" stages N world-stamped Queue items, walked per item.
  A selection spanning different consent states renders the difference before staging.

### 7.2 States

- **Empty column:** header with `(0)` and nothing — no invented cards, no "get started" filler.
- **Loading:** columns render when computed from rows; until then the board area is dim with
  no counts.
- **Error / unverifiable:** a card whose stage evidence can't currently be read moves to a
  thin top strip — *"can't verify (1) ▸"* — it is never guessed into a column.

### 7.3 Mobile

Boards render as grouped lists (stage = section header); every cell still taps to rows; the
drop still lands pre-focused; bulk staging defers to the Queue's swipe-walk.

### 7.4 Chips visible

Scope chip `Home` throughout (a lens is a view, not a place) · per-card Face chips with
counterparty stamps · `⟲` per automation state · lineage chips (`✎ spawned from close-won`) ·
judgment badges stamped with judge + date · signal cells that are themselves evidence doors.

---

## 8. W8 — The Builder: code+preview bench with the world context strip

`/w/harbor-dental/site/s/build-family-practice` — the deepest workshop, same grammar. Entered
from the site artifact's frame ("open the studio"); there is no builder front door.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [Harbor Dental · Client · Dr. Okafor] › Site ›                     Pulse [2·0·1·✓]     │
│  session "build: family-practice one-pager"                                            │
│  ┌ WORLD CONTEXT ────────────────────────────────────────────────────────────────────┐ │
│  │ artifact: harbordental.com · v4 (draft) · publish: staged → Queue ▸ · versions ▸  │ │
│  │ [brief ✎ "Site strategy" session ▸] [audit ✎ "no online booking; 11 broken        │ │
│  │ links" ▸] [«booking above the fold — earned across 4 clients» ✎playbook ▸]        │ │
│  │ [constraint: no stock photos ✎ intake, Dr. Okafor] [criteria: site pack v2 ▸]     │ │
│  └───────────────────────────────────────────────────────────────────────────────────┘ │
│──────────────┬─────────────────────────────────┬───────────────────────────────────────│
│ FILES        │  EDITOR                         │  PREVIEW — branch: hero-B   [⇄ A|B]   │
│  index       │   …the working file…            │  ┌ desktop ┐ ┌ tablet ┐ ┌ phone ┐     │
│  styles      │                                 │  │ [ hero ]│ │        │ │ book  │     │
│  booking     │   counsel: «variant B puts      │  │ [ book ]│ │        │ │ below │     │
│  branches:   │   booking below the fold on     │  │         │ │        │ │ fold ⚠│     │
│   main       │   mobile — books-an-appointment │  └─────────┘ └────────┘ └───────┘     │
│   hero-B ●   │   scores 5 there. A keeps it    │  checks: responsive ✓ · links ✓ ·     │
│  diff vs     │   above on all widths.» ▸       │  a11y ⚠ 1 contrast ▸ · honest-claims ✓ │
│  main ▸      │                                 │                                       │
│──────────────┴─────────────────────────────────┴───────────────────────────────────────│
│  generate · edit · branch · diff · test-responsive · run-checks · deploy (→ Queue)     │
│     each: ( do it | ask | overnight… )                                                 │
│  Commit ▸  → version on the site's rail  → Mission step done  → Hand off               │
│                 ┌────────────────────────────────────────────────┐                     │
│                 │ [Harbor Dental · Dr. Okafor ▾]  make the hero… │                     │
│                 └────────────────────────────────────────────────┘                     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 8.1 Elements and interactions

- **The world context strip** is the Builder's Palette worn as a strip: the artifact identity
  + version rail + publish state, then the grounding cards — the strategy brief (provenance to
  its session), the audit, the Playbook lesson with its earn-line, the counterparty's own
  intake constraint, and the criteria pack. The strip is why a build session can never open
  generic: the anti-generic invariant made visible.
- **Same six parts, uncompromised depth**: files/branches left, editor center, live preview
  right with the device matrix; branch previews compare side by side (`⇄ A|B`); diffs for the
  internals. The Counsel critiques against the same site pack the strategy session used —
  execution does not lower the craft bar.
- **Checks are honest rows** — each check opens its findings; *honest-claims* is a first-class
  check (no invented testimonials, no fake numbers in copy).
- **Deploy is an exit, therefore a gate**: `deploy` stages at the Queue with the before/after
  compare and the live target named inline. No drive mode softens it.
- **Mission continuity**: when this session is a mission step, committing marks the step done
  on the plan (W9) — work breathes between spine and bench without copies.

### 8.2 States

- **Empty (first pass):** the editor region offers *generate* seeded from the brief — never a
  blank scaffold prompt; the brief is already in the strip.
- **Loading (preview building):** the preview pane names its real step (*"building
  preview…"*), never a fake progress bar.
- **Error:** a failed build renders the failing check inline with the excerpt and ( Retry ) ·
  ( Fix ▸ opens the file at the error ). A failed deploy files a Queue item with the Activity
  excerpt — never a toast.

### 8.3 Mobile

**Desktop-first.** On a phone: the preview at native device width (the one surface phones
render *better*), the checks list, and deploy approvals via the Queue. Code and file work is
desktop's.

### 8.4 Chips visible

Context header with counterparty stamp · scope chip agreeing · artifact version + publish
state chips · `✎` on brief/audit/playbook/constraint cards (session, artifact, playbook
earn-line, intake answer) · criteria version chip · branch marker · check rows as evidence
doors.

---

## 9. W9 — A mission plan: waiting-on-approval, with Activity open

`/w/moms-real-estate/m/spring-farm-drop` — the plan (spine), with the flight recorder overlay
open on step 3.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [Mom's Real Estate · Business · Real estate] › Mission:             Pulse [2·0·1·✓]    │
│  Spring farm drop                                                                      │
│  «Mail the spring farm; book valuations.» · started Apr 2 · 2 of 6 done ·              │
│  waiting on your approval · next wake: when you approve the print run ·                │
│  spent $41 of $120 · ( ⏸ pause )                                                       │
│────────────────────────────────────────────────────────────────────────────────────────│
│  ✓ 1 Segment the farm list        → produced: list v2 (412) ✎ ▸                        │
│  ✓ 2 Postcard designed            → "postcard v2 · scored 8.4 ✎criteria ▸" ▸           │
│  ▶ 3 Print run approval           WAITING — resumes when you approve · waiting 2h      │
│      ▸ the Queue item, decidable here ────────┐                                        │
│  · 4 Mail the drop                queued · after step 3 · will queue 0 approvals       │
│  · 5 Follow-up calls staged       queued · will queue up to 12 drafts for approval     │
│  · 6 Outcomes → your Playbook     queued · closes your call: "postcard beats letter"   │
│  ─ 2b Letter variant              replaced in redirect, Tue ▸ plan v2 diff             │
│────────────────────────────────────────────┬───────────────────────────────────────────│
│                                            │ ACTIVITY — step 2 "Postcard designed"     │
│  ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~    │  read: farm Playbook (6 pts ▸) · March    │
│  ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~    │   drop outcomes ▸ · brand kit ▸           │
│                                            │  did: drafted 4 variants · scored vs      │
│                                            │   your criteria v2 · staged the best      │
│                                            │  decided: «led with the valuation offer — │
│                                            │   your Playbook: valuations beat open     │
│                                            │   houses here, 4 data points ▸»           │
│                                            │  spent: $2.10 of this step's $5           │
│                                            │  produced: postcard v2 ▸                  │
│                                            │  driver: worker (run 118) — full trace ▸  │
│────────────────────────────────────────────┴───────────────────────────────────────────│
│                 ┌────────────────────────────────────────────────┐                     │
│                 │ [Mom's Real Estate ▾]  skip the letter, add…   │                     │
│                 └────────────────────────────────────────────────┘                     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 9.1 Elements and interactions

- **Header** — objective in the operator's words · progress as **steps, never percentages** ·
  current state · **next wake named** · spend against budget · one-gesture pause. No progress
  bar exists that is not literally the step count.
- **Steps** — exactly one honest state each (done / running / waiting on approval / blocked on
  intake / queued / failed / replaced). The waiting step names its approval and embeds the
  Queue item *decidable right here*; approving lights the step the moment it wakes, and the
  Queue side says «approving resumes it» (wake visible from both ends). Queued steps state
  their gates in advance (*"will queue up to 12 drafts"*). Replaced steps stay visible, struck,
  linked to the plan-version diff.
- **Activity** — the flight recorder, one tap from any AI step, its Queue item, or its
  artifacts: read · did · decided-with-why · spent · produced, in plain words, each with
  provenance. Live-tailing while a step runs. Hand-done and delegated steps record here too,
  with the driver named — no gaps between drive modes.
- **Redirect by speech** — the Bar, scoped: "skip the letter, add an SMS" → the plan
  recompiles as a visible diff, one confirm; done steps stay done; history kept.
- **Ending** — when step 6 lands, the mission stages its drafted verdict on the Desk (measured
  outcome vs your prediction; your one-line call recorded as the verdict; lessons proposed to
  the Playbook through the gate). Never a modal.

### 9.2 States

- **Never silently asleep** — every non-running state names its condition and links its remedy
  (the approval, the ask, the failure's excerpt). *Blocked on intake* also stages the ask on
  the Desk.
- **Failed** — loud on the step, filed to the Queue with the Activity excerpt and
  Retry · Fix ▸ · Reroute · Pause.
- **Loading:** the spine renders instantly from its rows; Activity panes fill as read.
- **Paused:** header shows *paused by you · Tue*, everywhere the mission renders; a pause
  older than a week earns one quiet Brief mention.

### 9.3 Mobile

**Full for inspection**: states, wakes, pause, the embedded approval decides inline,
retry/fix decisions work. Redirect-by-diff review works; heavy plan editing prefers desktop.

### 9.4 Chips visible

Face chip in header (mission is *of* its world; scope chip agrees) · `✎` on produced
artifacts (to session/step) and on decided-whys (to Playbook evidence) · criteria chip on
scored outputs · driver stamp on Activity (`worker (run 118)`) · plan-version chips on
replaced steps · budget line as a real number pair.

---

## 10. W10 — An Automation's run history (heartbeat trace)

Opened from any `⟲` chip — the Desk row, a draft in the Queue, a sent message, an artifact's
provenance, a Brief clause, a lens cell. An overlay; Esc returns exactly.

```
┌── place beneath, dimmed ─────────────────────────┬─────────────────────────────────────┐
│ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~    │ Invoice chase — [Mom's Real Estate] │
│ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~    │ when an invoice passes 3 days       │
│                                                  │ overdue · ( ⏸ pause )               │
│                                                  │ last ran Tue 07:00 · next: Thu 07:00│
│                                                  │ posture: drafts for your approval — │
│                                                  │ never auto-sends · 12 clean         │
│                                                  │ approvals toward the next offer ▸   │
│                                                  │ this month: 6 sent of 40 cap ·      │
│                                                  │ $0.60 of $5                         │
│                                                  ├─────────────────────────────────────┤
│                                                  │ RUNS                                │
│                                                  │ ▾ Tue 07:00 — 2 drafts queued       │
│                                                  │    → rung 2 to Alvarez ▸ (approved  │
│                                                  │      by you, 9:12) · to Chen ▸      │
│                                                  │      (edited, then approved ▸ diff) │
│                                                  │    skipped 1: within terms ▸        │
│                                                  │    refusals: 1 — no consent on SMS  │
│                                                  │    fallback; emailed instead ▸      │
│                                                  │    Activity ▸ read · did · decided  │
│                                                  │    · spent · produced               │
│                                                  │ ▸ Sun 07:00 — ran clean · 0 due     │
│                                                  │ ▸ Thu 07:00 — 1 draft · approved    │
│                                                  │ full history ▸                      │
│                                                  ├─────────────────────────────────────┤
│                                                  │ ( How does this work? — open the    │
│                                                  │   recipe studio ▸ )                 │
│                                                  │ ( Revoke an auto-run class ▾ ) —    │
│                                                  │   none active                       │
│                                                  │ ( Retire — keeps everything )       │
└──────────────────────────────────────────────────┴─────────────────────────────────────┘
```

### 10.1 Elements and interactions

- **The honest pulse**: name · trigger in plain words · last ran / next run · autonomy posture
  *stated in words* with streak progress toward the next earned-autonomy offer · budget/cap
  lines (warm at 80%). In counterparty worlds the header carries the counterparty stamp and
  names what runs under their name.
- **Runs** — each expandable: what it did, what it queued/sent (each `▸` to the draft, the
  thread, the approval row — including your edit-diff, which taught it), **refusals counted
  honestly** (*skipped: no consent · suppressed: opted out*) — refusal rows are trust made
  visible. Full Activity per run: the same recorder missions use.
- **Pause** — one gesture, no confirmation dialog (safe, instant, reversible). Paused state
  then renders wherever output would have appeared: *paused · by you · since Tue*.
- **The recipe studio** — "how does this work?" opens its flow-bench workshop session (the
  background capability's workshop); a material recipe edit drops the affected class a notch
  on the autonomy ladder and this trace says so: *"recipe changed Tue — proposing again until
  5 clean."*
- **Retire** — explicit, one confirm, preserves the trace and every run's Activity forever.

### 10.2 States

- **Went quiet:** the header leads with it — *«▪ expected Sun 07:00 — did not run. Filed to
  the Queue ▸»* — with ( Retry ) ( Fix ▸ the connection ) ( ⏸ ). Absence of output is an
  event; this trace can never be compressed off any surface while dark.
- **Cap hit blocking promised work:** *«hit the monthly cap with 2 invoices outstanding —
  raise (an approval), wait, or chase by hand ▸»* — a cap may stop work, never stop telling.
- **Long pause:** after three weeks, one quiet question — *"still paused — resume, or retire
  it?"* Never auto-resumes, never nags twice.
- **Loading:** header renders from last verified state with its age stamp; runs fill below.
- **Empty (newborn):** *"hasn't run yet — first run: Thu 07:00. Born proposing; it will draft,
  you decide."*

### 10.3 Mobile

**Full.** The trace is inspect-and-control work: pause, retry, revoke, and per-run reading all
work one-handed. The `⟲` chip opens it from any output on any device.

### 10.4 Chips visible

`⟲` (the chip that summoned it, now the header) · world Face chip + counterparty stamp ·
autonomy-posture line in words · budget pair · consent/refusal counts with `▸` rows · `✎` from
every output back to the run that made it · edit-diff chip on edited-then-approved drafts.

---

## 11. Cross-cutting acceptance checks for these wireframes

1. **Chrome invariance.** Overlay the ten frames: the Bar (bottom-center, scope chip left),
   the Pulse (top-right), and the context header (top-left, empty at Home) are in identical
   positions on all of them. Nothing else is global.
2. **Scope agreement.** On every frame, the context header and the Bar's scope chip name the
   same scope; counterparty stamps appear on both or neither. The Queue and traces never
   change the scope beneath them.
3. **Evidence density.** Every number, glow, score, stage, and generated sentence drawn above
   carries a `▸` or `✎` — pick any at random and it must open rows. A claim without a door
   was drawn wrong.
4. **No architectural words.** Scan every quoted label: no Genome, Capability, Spine,
   Situation, or Line; History not Ledger; Activity not flight recorder; Run history not
   heartbeat trace; setup not genome.
5. **Honesty-state completeness.** Each wireframe specifies empty, loading, and error without
   theater: empties say words, loaders show no invented numbers, errors name what can't be
   verified and since when.
6. **Approval locality.** W2, W3, W7, and W9 all decide approvals inline where they render;
   no frame contains a path that navigates away to approve.
7. **Workshop foundation.** Criteria versions, score-with-why, driver stamps, kill-with-why,
   outcome annotations, and calibration appear on W1, W2, W6, W8, and W9 — mastery is drawn
   into the chrome of ordinary work, not into a separate surface.
8. **Recurring-work visibility.** The `⟲` chip appears on every frame where automated output
   renders (W1, W2, W3, W7, W10), and pause is drawn within one gesture of each.
9. **Scale invariance.** W1's two variants are the same screen; W7 absorbs the hundredth
   client as a row. No frame grows chrome with count.
10. **Mobile assignment.** Every wireframe carries either a full mobile treatment or an
    explicit desktop-first designation with its review/approve state — none is silent about
    the phone.

---

*Cross-references: 02 (shell, Queue, Home), 03 (Face/Desk/areas/postures), 04 (Explore), 06
(missions, automations, the sixteen visibility mechanisms), 07 (frames and the Builder's
door), 08 (lenses and the drop), 09 (Proposal/Charter), 11 (addresses these frames render
at), 16 (the workshop grammar W6 and W8 draw), 17 (the mastery loops threaded through W1, W2,
W6, W9), 13 (acceptance tests these checks feed).*
