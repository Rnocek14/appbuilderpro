# Prototype Design Contract — binding for all five

One product, five moments. Every prototype must feel like the same product. This contract is
derived from the design constitution (`docs/experience-architecture/_constitution.md`) and the
Phase-4 amendments (`docs/reality-check/13-verdict-and-prototype-brief.md` §4). Single-theme
dark is a deliberate commitment (the Field is dark by doctrine), not an omission.

## Tokens (verbatim — use CSS custom properties)

```css
:root {
  --ground: #0B0E14;      /* deep cool blue-black — the field */
  --surface: #131822;     /* raised panels */
  --surface-2: #1B2230;   /* higher elevation, sparing */
  --line: #232B3B;        /* hairline borders */
  --ink: #E8E4DA;         /* warm off-white text — ember-lit warmth on cool ground */
  --dim: #8A8FA3;         /* secondary text, cool */
  --faint: #565C6E;       /* tertiary, timestamps */
  --ember: #E8833A;       /* THE accent. Interactive intent, glow, the Bar's focus */
  --ember-soft: rgba(232,131,58,.14);
  --ok: #6FBF8B; --warn: #D9A441; --blocked: #C25E5E;  /* semantic ≠ accent */
  --judgment: #9B8CC9;    /* the one color reserved for marked AI judgment/volunteered items */
}
```

## Type

- **Voice (Brief prose, Counsel speech, narrative moments):** `Charter, Georgia, "Times New
  Roman", serif` — 17–19px, line-height 1.55, max-width 62ch.
- **Chrome (labels, buttons, chips, nav):** `-apple-system, "Segoe UI", system-ui, sans-serif`
  — 13–14px; micro-labels 11px UPPERCASE with `letter-spacing:.08em; color:var(--dim)`.
- **Truth (numbers, evidence rows, logs, code):** `ui-monospace, "SF Mono", Menlo, monospace`
  — 12–13px, `font-variant-numeric: tabular-nums`.
- Headlines in the serif, `text-wrap: balance`, weight 400–500 (never bold-heavy).

## Geometry (the constitution's fixed chrome — identical in every prototype)

- **The Bar**: fixed bottom-center, ~640px max width, pill, `--surface` with hairline,
  ember focus ring; placeholder in serif italic. Scope chip inside-left when scoped.
- **The Pulse**: top-right, small; real counts only; opens nothing fake.
- **Context header**: top-left; at Home nothing; inside a world the Face chip (name · kind ·
  state), 13px chrome.
- **Prototype HUD**: bottom-left, tiny, `--faint`: "P# · <name> — staged data, real timing" +
  a restart ⟲ and a "?" that opens the what-to-feel-for card (the prototype's instrument
  questions). Never intrudes.

## Motion

- Easing: `cubic-bezier(0.22, 1, 0.36, 1)` ("forge"). Micro-interactions 150–200ms.
- **One orchestrated move per prototype** (500–800ms): the moment the prototype exists to
  prove. Everything else stays calm.
- Streaming text: 12–22ms/char with punctuation pauses; skippable (click advances).
- `prefers-reduced-motion`: all movement becomes opacity-only, streaming becomes instant.

## Rules of the world (from the amendments — the prototypes DEMONSTRATE these)

1. **No-Theater**: every number on screen must trace to staged data defined once in a JS
   object at the top of the file (single source of truth). No decorative counts. Consistency
   across the file is mandatory.
2. **Evidence on tap, not tattooed** (D8): claims carry a dotted underline; hover/tap reveals
   the evidence row (mono, timestamped). No visible carets at rest. ≤12 discrete marks on any
   resting screen.
3. **Initiative inward. Permission outward.** (D2): anything volunteered is visually distinct
   (`--judgment` tint, "unasked · 1 of 1 today" tag), inert, dismissible. Nothing outbound
   happens without an explicit yes; everything outbound shows the undo window after.
4. **Act with undo** (D4): reversible acts happen immediately with a 10s undo toast; only
   scope-crossing/outbound acts confirm first.
5. **Append-only bench physics**: AI contributions arrive appended, ghosted-in, never
   replacing or moving the user's material.
6. **Honest waiting**: progress is named steps completing ("compile gate: tsc ✓"), never
   percentages or spinners without words.

## Build constraints

- One self-contained HTML file per prototype in `/home/user/appbuilderpro/prototypes/`.
  Inline all CSS/JS. No external requests of any kind (strict CSP). No libraries.
- Imagery is drawn: SVG shapes + tiny Canvas generative art (e.g., the brother's angular
  line-art style = random-walk polylines with fixed seed). No data-URI photos.
- Keyboard: every primary interaction has a key; visible focus states; the keys are shown
  in-context as faint hints (e.g., "K keep · X kill · Z undo").
- Target <200KB, 60fps; no layout thrash (transform/opacity animations only).
- Every file starts with an HTML comment: prototype name, the wounds it settles (W#/D#), and
  its "inevitable when" bar from the brief.
