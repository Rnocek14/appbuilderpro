# Generated-app fixtures — the proof that the harness works

Two versions of the same small React app, so the generated-app harness can be tested against
something whose answer is known. Run both:

```
npm run probe:generated          # tsx scripts/generated-app-probe.mjs --fixtures
```

Expected, and asserted in CI:

| fixture | static errors | warnings | browser problems |
|---|---|---|---|
| `clean/` | 0 | 0 | 0 |
| `broken/` | 2 | 2 | 4 |

## Why fixtures at all

the generator plans, writes files, validates and self-heals — and never runs what it made.
`validateProject` reads source and infers. The harness adds the half that runs it: build with Vite,
serve the output, drive it in a real browser with the same prober used on the prototypes.

That harness needs testing itself, and it cannot be tested against real generator output here (no
AI keys in this environment). So: a known-good app and a known-bad one. **A tester whose own
correctness is untested is not evidence** — this repo has now had four separate cases where the
first version of a check was wrong more often than it was right, and every one was caught by
running it against something already known to be good.

## The four planted defects in `broken/`

Each is a class a code generator really produces, and each is invisible to a compiler:

| # | Defect | Caught by | How it fails a person |
|---|---|---|---|
| 1 | `<button>Export</button>` with no handler | static lint | Renders, does nothing when clicked |
| 2 | `onClick={handleShare}` — never defined | static lint **and** browser | Throws a ReferenceError; React renders nothing at all |
| 3 | `<div onClick=…>` with no `role`/`tabIndex` | static lint (warning) | Works with a mouse, unreachable by keyboard |
| 4 | `<form>` with no `onSubmit` | static lint (warning) | Enter reloads the page and discards what was typed |

Defect 2 is the interesting one: it is the only one the *browser* half catches independently, and
it catches it far more loudly than the lint does — the page renders zero controls, so `A`, `H`, `C`
and `F` all fail. That is the shape of the argument for having both layers.

## Two bugs these fixtures found in the harness itself, on their first run

- **Comments were being scanned as code.** `clean/`'s comment contains the literal `<button>` and
  was reported as a dead button; `broken/`'s comment mentions `onClick={handleShare}`, which made
  the undefined-handler check (it counts occurrences) believe the name was defined. `stripComments()`
  in `_shared/qa.ts` exists because of this, with four regression checks in `qaCheck.verify.ts`.
- **The prober judged too early and too harshly.** It checked for load errors right after
  `domcontentloaded` — before React had rendered — so a page that threw during render and displayed
  nothing was reported as loading cleanly. And it called an "Add" button beside an *empty* field
  dead, when refusing to act on empty input is the app being correct. Both fixed in
  `scripts/lib/probe-core.mjs`; the second is `fillEmptyFields()`, a second chance before any
  control is condemned.

## What a green run still does not mean

The app compiles, boots, responds to every control, survives reduced motion and does not overflow a
phone. **It is not therefore a good app.** Whether it does the right thing — whether the flow makes
sense, whether the copy is honest, whether anyone would want to use it — is not measured here and
cannot be measured this way.
