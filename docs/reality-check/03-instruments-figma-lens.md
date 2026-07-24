# Reality Check 03 — Instruments or Interfaces? The Figma Lens

*Interpretive lens exercise: this critique channels the publicly-known product philosophy of
Dylan Field and Figma — direct manipulation, immediacy, tools that feel like extensions of the
hand, craft software where the canvas IS the interface. It is deliberately adversarial and
reads the Phase-3 documents against that single standard, not against their own.*

Sources attacked: `_constitution.md` §6; `16-workshop-system.md` (fully);
`12-wireframe-specifications.md` (W6 especially, plus W8); `07-artifacts-and-builders.md`.

---

## The one-sentence indictment

The Workshop system is a magnificent specification of **who did what, why, and with whose
permission** — and an almost empty specification of **what the hand feels**. Doc 16 has a
complete grammar for provenance, critique, delegation, and governance, and no concept of a
cursor. The word "latency" does not appear in it. Neither does "undo." That is not an
oversight of detail; it is a confession of center of gravity.

---

## I. The room, measured: is the canvas the interface?

### Attack 1 — The flagship bench gets less than half the screen

W6A (`12` §6A) draws the Collection Studio, the product's showcase craft room. Measure the
frame: the Palette rail takes ~15% of the width, the Counsel column ~30%, and the Bench —
"the working canvas at center — the material being worked" (constitution §6) — gets roughly
48%, further shaved top and bottom by the constraints ribbon, a two-line context header, the
Moves rail, the Commit rail, and the Bar. In Figma the canvas is effectively the whole window;
panels are thin, collapsible, and subordinate. Here the "canvas" is the middle column of a
three-column layout. Doc 16 §1 insists a Workshop is "not a chat panel that answers" — but
the wireframe hands a permanent third of the room to a pane whose content is paragraphs.
When the working surface is a minority shareholder in its own room, the canvas is not the
interface; the chrome is.

### Attack 2 — The room greets you with prose, and resume hides the canvas behind a report

Doc 16 §6: "**Resuming.** Resume lands on **the Ledger's story**, not the raw bench... One
gesture drops from the story onto the bench as you left it." Read that as a Figma user: the
tool deliberately interposes a *reading step* between you and your work. Every return —
including tomorrow morning's — lands on generated narrative, with the actual material one
gesture behind it. Same at open: "Every opening lands **grounded** — gather pre-run, Palette
staged, Counsel situating" (16 §6), and W6A's Counsel column opens with a situating paragraph
("Spring's heritage pieces outperformed. Marco granted three new works..."). Figma's first
frame is your canvas, exactly where you left it, manipulable in under two seconds; the story
of what happened is available, never mandatory. A tool that leads with narration has decided
the operator is a reader first and a maker second.

---

## II. Where direct manipulation is real — and where sentences replaced the hand

### Attack 3 — The entire direct-manipulation inventory is three drags

Doc 16 §4.1, the whole of it: "Direct manipulation always works: drag to arrange, drag from
Palette to ground a move in a reference, drag between variant sets to regroup." That is the
complete list. Arrange, cite, regroup. Nothing in doc 16, W6, or 07 lets the hand *change the
material*: no nudge, no scale handle, no crop, no mask, no scrub, no paint, no transform, no
color you can drag a slider through and watch update live. Every act that alters a visual
artifact routes through a Move — a capability invocation — or a sentence. The hand curates;
the model makes. "Direct manipulation always works" is true only because the sentence quietly
restricts direct manipulation to the *arrangement of outputs*, never the work itself.

### Attack 4 — Moves are forms wearing tool costumes

Doc 16 §4.4 defines a Move's anatomy: "**Input** — the current selection... **Parameters** —
the move's own dials, always few, always in craft language ('how many?', 'vs which
reference?', 'which criteria?')... **Output — appends to the bench.**" And W6A renders the
rail: "vary · recolor · constrain · combine · place-on-product · tournament · score — each:
( do it | ask | overnight… )". This is request/response, not tool use. A "dial" you cannot
scrub while watching the result move is not a dial; it is a dropdown in a submit form.
Figma's equivalents are physics: duplicate is alt-drag, recolor is a picker with live
feedback, placement is handles with snapping. Here every verb terminates in a button labeled
"( do it )" — the interaction design of a print dialog, applied to a craft room.

### Attack 5 — The exemplar session contains zero acts of making

Walk 16 §13.1 beat by beat and list what the operator's hands actually do: speak ("Give me
three directions off the spring winners"), drag one reference onto a set, kill a set with a
reason, type a constraint string, disagree with one score, click tournament winners, confirm
commits. Every generative and every transformative act in the flagship session — vary,
recolor, place-on-product, the overnight ten — is performed by the model. The document's own
words: "The vary move (*ask*) lands three variant sets of four." The operator of this product
is a creative director reviewing a vendor's deliveries. That may be an honest and even
valuable product — but it is not what doc 16 §1 claims ("the place where the operator... 
*makes things well*"), and a designer will smell the gap in the first session.

### Attack 6 — The Bar's placeholder text confesses the real input model

W6A's Bar, inside the workshop: `[Thread & Stone ▾] more like #3, but…`. W6B's:
`tighten the ask…`. The product's own teaching copy models sentence-driving as the primary
way to work the bench. Doc 16 §3 swears a workshop is "never a *chat skin* (conversation
routes and advises; the bench is where work lives — P8)" — but the exemplars drive every beat
by utterance, the Counsel performs the moves, and the bench displays the results. When the
canonical gesture is a sentence and the canvas is where answers *land*, the honest name for
the architecture is chat-with-a-gallery-attachment. The constitution's refusal and the
wireframes' behavior contradict each other, and shipping products resolve that contradiction
in favor of whatever the wireframes drew.

### Attack 7 — Selection exists to resolve pronouns, not to receive tools

Doc 16 §4.1: "Focus one item... pin several... Moves act on the selection; **the Counsel's
'this' resolves to it**." Selection — the single most load-bearing mechanic in any
direct-manipulation tool, the thing Figma spent years making feel telepathic (marquee,
deep-select, select-same) — gets three sentences, and the punchline reveals its purpose:
disambiguating references in conversation. Selection-as-antecedent is a chat feature. There
is no marquee spec, no shift-click semantics, no select-similar, no keyboard traversal of the
bench. The spec's most precise interaction grammar (W2's `j/k · a · e · d · h · u`) was spent
on the *approval queue*, not the canvas — the product knows exactly how the hand approves and
has no idea how it makes.

---

## III. Anatomy: tool or committee?

### Attack 8 — Six parts, none of which is the hand

The fixed grammar (16 §4): Bench, Palette, Counsel, Moves, Ledger, Commit rail — "they never
add a seventh part or remove one." Look at what the six parts *are*: a surface, a shelf of
references, an advisor, a menu, a court reporter, and an exit with a gate. This is an
org-chart, not a tool: who speaks (Counsel), who records (Ledger), who approves (the rail's
gates). Figma's anatomy — toolbar, canvas, inspector — is body-shaped: hand, surface,
properties. Nowhere in the corpus does a concept of tool-state, pointer mode, or cursor
exist; there is nothing to *hold*. The anatomy is a beautifully governed committee convened
around a table on which work occasionally appears, "visibly marked" with who sent it. The
mandated question answers itself: a room whose six organs include a transcript-keeper and an
approvals door, but no instrument, is a committee.

---

## IV. Latency truth: what the hand feels while waiting

### Attack 9 — Nearly every Move is a model call, and the spec never once prices the wait

Count the gallery bench's native moves (16 §5.1): vary, restyle/recolor, combine,
place-on-product, upscale/finalize, score — six of eight are model invocations measured in
seconds-to-minutes. Document bench (16 §5.2): rewrite-in-voice, tighten/expand, restructure,
red-line, score-against-rubric — same. Now search doc 16 for what the hand experiences
between "( do it )" and the result landing: nothing. §7.6 comes closest — "Volume moves show
their cost before running" — and the cost shown is *dollars* ("Spent $4.10 of $6"). Time is
never a design material anywhere in the workshop spec. Doc 12 §0.4 mandates honest loading
states for every shell surface ("Loading never invents"), and W6A specs the *failure* state
("recolor failed — Activity ▸ ( Retry )") — but the pending state, the single most-felt state
in a room where the primary verbs take eight seconds, is unspecified. No ghost placement, no
progressive render, no streaming partials onto the bench, no cancel gesture. "Any move at
*ask* is the Counsel performing it while you watch it land on the bench" (16 §4.3) — "watch
it land" is the entire physics spec of waiting. Figma's core religion is that the tool never
makes the hand wait perceptibly; this spec doesn't even acknowledge the wait exists.

### Attack 10 — Only the Builder was given a latency instrument; the visual crafts got none

Doc 07 §8.2 is the one place in the corpus that treats speed as a design problem: "**fast
preview** always-on (instant, approximate, labeled as such); **full runtime** on demand." The
two-truths split is a genuinely good latency instrument — instant-but-approximate against
slow-but-true, honestly labeled. And it exists *only* for code. The apparel designer gets no
fast-approximate vary, no draft-quality recolor to scrub before committing compute, no
progressive upscale. The craft that most needs sub-second visual feedback — the one Figma
was built for — is the one bench where every iteration is a full-price, full-latency model
round-trip. The engineers designed the honest-speed machinery for themselves.

---

## V. Comparison: manipulable surface or rendered report?

### Attack 11 — The tournament is a form wizard for taste, and the bracket is filed, not felt

16 §4.1 says the right words — "Comparison is a bench *state*, not a separate screen; you
work while comparing" — and then §5.1 cashes them out as: "side-by-side lightbox (2–4 up,
synchronized zoom) and **tournament brackets** — head-to-head rounds with per-round criteria
scoring, **the bracket itself a Ledger object**." A lightbox with synced zoom is a viewer.
W6A's tournament UI is "6 entries · round 2 of 3 ▸ ( pick winner )" — a button-paced wizard.
The comparison mode designers actually use — A/B flicker at speed, overlay with difference
blending, drag-one-over-the-other — appears exactly once in the corpus: doc 07 §3's
comparator table lists "side-by-side · overlay/onion-skin · zoom-locked pan" *for the
artifact frame* — the archive, after commit. The working room got the weaker comparator than
the filing cabinet. And note what the spec is proudest of: the bracket as "a Ledger object,"
"inspectable afterward" (16 §7.3). Comparison here is designed for the record it leaves, not
the perception it sharpens. That is a report that happens to be interactive, not a surface.

---

## VI. The apparel bench vs a real designer

### Attack 12 — No layers, no masks, no snapping, no type control: the answer to every adjustment is "generate again"

A working apparel designer's minimum expectations: move the print 2cm, scale it against the
placement guide, mask the artwork to the pocket seam, kern the wordmark, swap one Pantone.
The gallery bench's full verb set (16 §5.1) contains not one editing verb. The recourse for
"almost right" is `constrain` (type a sentence and regenerate), `vary` (roll again), or
`combine` ("merge two directions" — a model operation, not a boolean the hand performs).
Even `place-on-product`, the most spatial move in the product, is specced as a render
request: "The move renders selected material onto a template non-destructively — a new
mockup variant, template provenance attached" — placements are "named print placements,
dimensions, and colorway slots," i.e., parameters, not handles. If the print lands wrong,
you do not grab it; you re-order it. This collapses precisely where the prompt predicted:
every adjustment under the granularity of a sentence becomes "generate again," and
regeneration is a slot machine — it does not preserve the nine things that were right while
fixing the one that was wrong. The hand knows the difference even when the Ledger can't
record it.

### Attack 13 — "Fully operable by hand, forever" is unfalsifiable for the gallery bench, and there is no undo

16 §9: "the bench is fully operable by hand, forever, and hand-made material carries no
lesser provenance." 16 §15.11 makes it an acceptance test: "Every bench operation is
performable by hand." Perform `vary` by hand on the gallery bench. With what? The bench
mounts no drawing surface, no image editor, no import-from-external-tool flow. The document
bench has a real editor; the Builder has "real files and a real editor" (07 §8.5 row 1); the
gallery bench — the flagship visual craft — has arrangement only. The equal-citizen claim is
true for words and code and vacuously false for images, and the acceptance test cannot be
run. Meanwhile the reversibility story is P12 archaeology, not undo: "Killed variants,
losing tournament entries... remain reachable — compressed, dormant, never deleted" (16
§11). The only `u undo` in the entire wireframe corpus is in the *Queue* (W2). Ghosts are
not undo. Figma's fearlessness is Cmd+Z within 100ms of any mistake; this room's answer to a
mistake is a search through History. A canvas without an undo stack cannot be manipulated
fearlessly, so it will not be manipulated much at all.

---

## VII. The second player: is the AI present on the canvas?

### Attack 14 — The AI delivers to the bench but never appears on it

What Figma proved with multiplayer is not collaboration-as-feature but *presence-as-trust*:
you see the other cursor move, hesitate, select, act — and immediacy makes the other player
real. This spec's AI has no body. The Counsel lives in a text column and refers to work by
number ("#3 — 8.6: print integrity 9...") like an email thread about an attached PDF. Its
critiques are never specced to pin to regions of the canvas — when it says "line weights
survive at production scale," nothing highlights the line weights. The worker is a batch
process: "handed-off material lands on the bench visibly marked ✎worker" (W6A states);
"the bench shows material landing live, and taking the hand back is one gesture" (16 §6).
Landing live is delivery, not presence — you see the second player's parcels, never its
hands. The one grammar the spec had for this — spatial annotation ("annotation pins" exist
on the Design/image body, 07 §5) — was given to the artifact archive, not to the Counsel on
the bench. The AI is the most capable second player ever put in a creative tool, and this
design keeps it behind a service window.

---

## VIII. Would a Figma-native designer respect this?

### Attack 15 — The mobile spec confesses what the product thinks the human is for

12 §6.5: on a phone, a session "offers the session's judgment work as cards: variants to
score (blind-first), a tournament round to pick... **No drag-arranging, no constraint
gardening.**" Look at the shape of the cut: the *only* direct manipulation the bench had
(arranging) is what gets removed, all judging is kept — and the session still functions.
A tool that works fully without hands is a survey with pictures. Figma cut deep on mobile
too, but what remained was viewing a canvas; what remains here is grading deliveries, which
tells you which activity the architecture actually depends on.

### Attack 16 — The toolbelt shifts under the hand

16 §4.4: "The rail shows the working set, not everything... situational moves surface when
the situation calls (place-on-product appears when granted artwork enters the session)...
There is no 'all moves' browser." Tools that appear and disappear based on system inference
destroy the muscle memory that makes a tool feel like an extension of the hand — the
toolbar's fixedness is *why* the hand stops thinking about it. The Builder half-fixes this
("All twelve are always present; situational surfacing may reorder the rail... surfacing
changes order, never membership" — 12 §8.1) and thereby breaks spatial memory instead:
`repair` "leads while a check fails," so the same key position means different verbs on
different days. Membership instability on the visual benches, position instability on the
deepest one. A recommender system is not a toolbelt. A Figma-native designer would clock
this in an hour: the room keeps rearranging its own instruments, which is the behavior of
software that expects to be *asked*, not *used* — and they would file the whole product,
respectfully and fatally, as the best-governed chat wrapper they had ever seen.

---

## Kills, protection, verdict

### Three kills

1. **Kill the permanent Counsel column, and put the second player on the canvas.** The
   Counsel's paragraph-pane (a third of W6A) becomes presence: a visible cursor when it
   works, critique pinned to the exact region it judges (the line weights, the collar, the
   below-the-fold booking button), the transcript summonable, never resident. Doc 07 already
   invented the annotation-pin grammar; move it from the archive to the bench. The advisor
   survives; the panel dies.

2. **Kill resume-on-story and situate-first openings.** "Resume lands on the Ledger's story,
   not the raw bench" (16 §6) inverts the tool's loyalties. Land on the bench, exactly as
   left, in under two seconds; render the story as a dismissible overlay and the Counsel's
   situating as pinned margin notes. A tool's first frame is the work.

3. **Kill "( do it )" as the terminal gesture of visual Moves.** Every gallery-bench move
   must exist in a direct form before its form-and-button form: place-on-product is
   drag-onto-template with snapping handles and a live ghost; recolor is a scrubbable
   control with sub-second approximate preview (the fast-preview/full-runtime split of 07
   §8.2, ported from the Builder to every visual craft); vary spawns editable ghosts around
   the selection. And beneath all of it: a real undo stack on the bench, Cmd+Z, 100ms — the
   Ledger records; undo *reverses*. Without this kill, the apparel bench is a vending
   machine with a taste log.

### One protection

**Protect the append-only bench physics and persistent spatial state.** "Nothing on the
bench ever moves or vanishes because an automation ran; workers *append*... and *propose
kills*" plus "Arrangement is meaningful and persisted — the bench's spatial state is part of
the session" (16 §4.1) is the one genuinely Figma-grade decision in the corpus: the second
player can never clobber your canvas, and your arrangement is real state, not decoration.
This is the multiplayer-safety invariant every real manipulation layer would need underneath
it. Whatever gets rebuilt, rebuild on top of this.

### Verdict

**Interfaces — with two exceptions and one alibi.** The Builder is an instrument (real
editor, real runtime, honest speed); the document bench is half of one (a real editor inside
a critique apparatus). The gallery bench — the flagship, the apparel showcase, the thing the
north star describes — is an interface: a governance surface for reviewing model output,
with world-class provenance and no hand in it. The alibi is that "creative direction over a
tireless generator" is a legitimate product. It may even be the right one. But then the
documents should stop claiming the room is where the operator "makes things well" (16 §1)
and that "the bench is fully operable by hand, forever" (16 §9) — because as specced, the
hand can arrange, cite, kill, score, and approve, and cannot make anything at all. These are
instruments for judging and interfaces for making, and the spec has the two words reversed.
