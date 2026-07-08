# Garvis From First Principles — The Product Architecture

*Not a feature audit. The answer to: "Forget every page we built. Organize the entire product
around human intention. What should disappear?" Companion demo:
`docs/mockups/garvis-inevitable.html` (the Field → Mission transition, live).*

---

## 1. The reduction

Start from Tony, not Jarvis. Tony never opens File Management. He states intentions and the room
reorganizes. Push that to its logical end and Garvis has **two nouns, one constant, four postures,
one subconscious, one spine**:

```
NOUNS        Missions. Nothing else. A mission = any intention with stakes:
             grow mom's business · sell websites · build Stoke · a rabbit hole
             (a mission whose objective is curiosity). Users manage intentions,
             never features, pages, studios, or files.

CONSTANT     The Line — the conversation bar. The ONLY element that never moves,
             never disappears, works everywhere. Every transition is the world
             re-dressing around this fixed anchor. Tony's constant is Jarvis's
             voice; ours is the Line.

POSTURES     Think · Create · Execute · Observe — VERBS, not places. A mission is
             *in* a posture; the screen dresses accordingly. Garvis sets posture
             from intention; the user can nudge; nobody navigates to a posture.

SUBCONSCIOUS The graph. Behind everything, faint, alive. Zoom out from anywhere
             to wander it. It is never a menu. (The user's own correction of the
             five-mode proposal: Brain is a place, not an activity — so it is not
             mode five; it is the ground the four verbs stand on.)

SPINE        Approvals + the execution ledger. The one interruption Garvis is
             allowed. A whisper everywhere; a real page behind the whisper.
```

**Why the five-mode proposal is *almost* right:** Think/Create/Execute/Observe are activities;
"Brain" is a location. Four verbs + one place is the honest count — and once postures aren't
navigation, the count of *destinations* drops to two: the Field (home) and a Mission.

**Why "Understand → Generate → Refine → Execute" repeats everywhere:** Explorer, Builder,
Marketing, Real Estate, Outreach all run that loop because it IS the posture cycle
(Think → Create → Create → Execute, with Observe closing the loop back into Think). One surface
engine, parameterized by context. We proved this at the studio level — *a studio is data, not
code* — first principles scales it up: **the product is data.** Missions differ only in their
context packs and tool packs.

---

## 2. What disappears

- **The sidebar.** Entirely. No Build/Garvis/Account sections, no 19 destinations.
- **Every studio as a destination.** "Direct Mail Studio" is what a mission looks like in Create
  posture with a direct-mail flavor. The name survives as a room label, not a nav item.
- **Work Webs as a term in the UI.** The web is simply what a mission looks like when you look at
  it. (The engine keeps the name; users never see it.)
- **Explorer / Builder / Marketing / Opportunities / Mind / Brain as pages.** Explorer = Think
  posture of a curiosity mission. Builder = Create posture of an app mission. Marketing = Create
  posture with campaign flavors. Opportunities = Observe's voice. Mind/Brain = the subconscious +
  its inspection view.
- **Feature names from the user's vocabulary.** The user says "make the postcard better," never
  "open gen-postcard."

**What survives, deliberately (settled by the last adversarial round — first principles does not
overrule safety):** approvals keep a real page behind the whisper (trust anchor); everything is
clickable (the Line is an accelerator, never the only path); nothing the user ever made becomes
unreachable (ghosts + zoom-out); evidence-counted claims only, never invented confidence.

---

## 3. The two screens

### The Field (home)
Dark, calm. The Line center. Your missions float as **living orbs** — each glowing its state
(ember = working, warn = needs you, green = good news, dim = quiet). Behind them, faint: the
subconscious — every node you've ever made, barely visible, breathing. Top corner: the approvals
whisper (count only). Nothing else. A new user sees three things and understands all of them.

### A Mission (the only other place)
Say "mom's real estate" — or touch her orb — and **one camera move** happens: the other orbs
recede, her orb grows into the mission core, the production areas materialize around it *already
dressed in their live state*, the next move card lands on the right, and the Line has not moved
one pixel. You are somewhere new and nothing was lost.

The mission screen is one surface in four costumes:

```
THINK    the web + research: market intel, connections from the subconscious,
         "what do we know?" — reading INTO the mission's world
CREATE   the focused studio: chat, tools, the active draft with version pills
EXECUTE  what's queued, what's waiting for approval, what just went out
OBSERVE  results, replies, the rollup, and the next move
```

A posture dial (four dots) shows where you are; Garvis moves it from your words. "Show me the
numbers" → the studio recedes, results dress in — same room, new light.

---

## 4. The smoothness mechanics (the user's exact ask)

"I start working on mom's real estate → smooth transition → a web of great info I can instantly
work on with extreme ease." Decomposed into four buildable mechanics:

1. **One persistent anchor.** The Line never moves through any transition. Continuity of one
   element is what makes a morph feel like a camera move instead of a page load.
2. **State arrives pre-dressed.** No screen ever appears empty and then loads. The anticipation
   engine's real UI job is *preparation*: by the time the mission finishes materializing, the next
   move is already on it, the areas already glow their true state. (Engineering: prefetch the
   web + rollup + next-moves when an orb is focused/hovered; the data is small.)
3. **Zero decisions to start.** Arriving at a mission never asks "what do you want to do?" — the
   next move is staged, the last active area is focused, the Line is ready. Ease = the absence of
   choices that aren't yours to make.
4. **One camera, no routes.** Transitions are morphs in one SPA scene (routes remain for
   deep-links, but a route change never *looks* like one). ~500ms, the forge easing curve,
   reduced-motion honored.

---

## 5. The Intention Router — the one new engineering artifact

Everything above hangs on a single capability:

```
utterance → { mission, posture, area?, action? }
```

- "let's work on mom's stuff"            → {mission: mom-re, posture: last-active}
- "make the postcard more luxury"        → {mission: mom-re, posture: create, area: dm-creative, action: revise}
- "how's the campaign doing?"            → {mission: mom-re, posture: observe}
- "why do bee hives work?"               → {mission: NEW curiosity thread, posture: think}
- "approve the email"                    → {spine: approvals}

This is not speculative: it is `commander.ts` grown up. It already routes reply-vs-mission; extend
it with (a) mission resolution by embedding similarity over mission objectives + world titles
(the `embeddings` table we built), (b) posture classification (four labels — small, fast prompt),
(c) area resolution against cluster titles/charters. Confidence rule: route silently when sure;
when unsure, ask ONE disambiguating line in the conversation — never a picker UI. Every routing
decision logs to `mind_events`, so misroutes become training evidence.

---

## 6. Nothing built is wasted — the mapping

This is a presentation revolution over the existing engine. The organs stay; the body reorganizes:

| First-principles layer | Existing engine |
|---|---|
| Mission | `garvis_missions` + `world_id` + objective (strategies land per the anticipation doc) |
| Posture: Think | explorer-turn / research / brain retrieval reading into the world |
| Posture: Create | the Cluster Studio shell (chat, tools, artifacts, versions) — unchanged |
| Posture: Execute | approvals + send-email/deploy paths + `execution_runs` — unchanged |
| Posture: Observe | rollups + replies + insights + the Next Move engine |
| The Line | commander + cluster-chat, unified behind the Intention Router |
| Subconscious | knowledge universe across ALL worlds + `embeddings` connections |
| Spine | app_0022, exactly as built |

Build order (presentation track, parallel to the anticipation sprints):
- **P1**: the Field + the mission morph (one scene, two states) + the Line unified as the global
  input. Old routes alias into it.
- **P2**: the Intention Router v1 (mission + posture; area optional) + posture dressing of the
  mission screen (Think/Create/Observe first; Execute = the existing approvals surface docked in).
- **P3**: the subconscious render (all-worlds graph, ambient + zoom-out) + prepared-arrival
  prefetching + the posture dial.

---

## 7. The five-minute inevitability test

A new user must be able to say, after five minutes, "of course it works this way":

1. Open Garvis → a dark field, a line, your missions as glowing orbs. *(Nothing to learn.)*
2. Say what you want → you are inside it, already dressed, next move staged. *(Nothing to find.)*
3. Talk to make things; versions keep themselves. *(Nothing to manage.)*
4. Nothing leaves without your approval — one whisper, one page. *(Nothing to fear.)*
5. Zoom out → you see your whole mind glowing. *(Something to love.)*

The question that governs every future feature: **not "where does it go?" but "which posture does
it dress, and does it earn its light?"** If a capability can't be expressed as a posture of a
mission or a whisper of the spine, it doesn't get pixels.
