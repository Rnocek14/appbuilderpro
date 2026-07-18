# The Path to Best-in-Class

A full-codebase audit (July 2026) and the plan that follows from it. Three deep passes were made:
generation + preview pipeline, ship/monetize/trust layers, and product surface/focus. This doc is
the synthesis. File references are current as of the audit.

---

## The verdict in three sentences

The engineering underneath this product is genuinely high-taste — shell-contracts-then-parallel-pages
generation, a compiler-verified agentic edit loop, real one-click Netlify + Supabase-provisioning
deploys, a production-grade credits/Stripe engine, and now branch-per-feature with readiness-gated
merges. But the product is unfocused (the builder is ~15-20% of 78k LOC, buried 14th in a
Garvis-branded nav), and its best guarantee — "verified" — is *conditional* in ways users can't see.
Being the best isn't about adding features: it's one identity decision, making the trust guarantee
unconditional, and sharpening the agent until the loop is flawless for a stranger.

## The wedge: trust

Every competitor (Lovable, Bolt, v0, Replit) generates plausible code fast. None of them make this
promise: **"Nothing lands broken. Ever."** The pieces already exist here and nowhere else together:

- Edits verified by the real TypeScript compiler with relentless self-repair (`agent/edit.ts`)
- Feature branches with copy-on-write isolation and merges that must pass QA + tsc *before* Main is
  touched — no reverts, structurally (`branchCore.ts`, `mergeBranch.ts`)
- Per-message diff cards + atomic change-set revert (`message_changes` migration)
- A design-direction system that commits real token bundles, not vibes (`generateDesignDirections`)

That's the brand: **the app builder that never ships you a broken app.** Everything below serves it.

## The identity decision (make it once, this week)

Two products fight in one app: FableForge (builder) and Garvis (business OS). The nav, landing, 404
target, and RUNBOOK all say Garvis; the repo name, README, and the differentiated engineering say
FableForge. Recommendation — don't kill either; **sequence them into one story:**

> **Build it. Ship it. Run it.** FableForge builds and ships the app; Garvis runs the business
> around it (outreach, billing, automations) after it ships.

Concretely:
1. Landing + signup lead with the builder. Post-auth lands on `/dashboard` (or `/new` with a prompt
   box focused), not `/garvis/command`.
2. Nav: builder first (Projects, New app, Import, Autopilot), "Operate (Garvis)" as a collapsed
   section or a mode switch. Garvis is the *post-ship* upsell, which is a moat no competitor has —
   Lovable stops at deploy.
3. Sever the one hard coupling: `ProjectWorkspace` imports `deployRun` from garvis (deploy through
   the approval spine). Keep the spine, but move the interface into a neutral module so the builder
   ships standalone.

---

## P0 — Make the guarantee true (the next 2-3 weeks)

**1. One generation pipeline.** `generate-app/index.ts` is a rotting single-shot fork (one 32k
stream, static-QA-only healing, no compile gate) whose header falsely claims parity with the far
better client `chunkedGenerate`. Delete it or reduce it to a thin trigger for the real pipeline.
"Which pipeline built my app" must never silently determine quality.

**2. Durable generation.** Orchestration runs in a browser tab today — refresh mid-build kills the
product's headline action. Either move orchestration to an edge/job worker (there's already a
`job-worker` function), or make `resumeGeneration` automatic on workspace load (detect an
interrupted build, resume without being asked). Automatic resume is days, not weeks, and buys 80%.

**3. Honest verification badges.** `generationCompileGate` silently degrades to "passed regex
checks" when WebContainer/cross-origin isolation is unavailable, and the agentic verify is
Anthropic-only. Surface the truth as a per-build/per-edit badge: `✓ compiled` vs `✓ static checks`
vs `⚠ unverified`. Trust brands die on one discovered lie; this one is currently discoverable.

**4. Close the DIRECT-mode fork.** The "edge mirror coming" cluster (`generateRoadmap`,
`generateIdeation`, `decideNextStep`/autopilot, `analyzeDocument`, `generateBackendFromProject`,
map gen) hard-requires browser keys — so production users get broken features, and DIRECT users get
unmetered spend with keys in localStorage (which the landing page falsely says never happens).
Route them all through the `agent-turn`/`cloudComplete` relay that already exists, meter them with
the credits chokepoint, and make DIRECT a dev-only flag.

**5. Pricing coherence.** Pricing page says $19/500 generations; the credits engine says $49/2500
credits; `plan_tier` lacks the `starter` the code references; `Billing.tsx` shows generation counts
and "stub mode" copy instead of the real credit balance. Pick the credits story (it's built and
sound), update Pricing/Billing to show credits, add the enum value.

**6. CI gate.** One workflow: `tsc --noEmit` + all `verify:*` suites + 3 Playwright specs
(generate→preview renders; edit→diff card appears; branch→merge lands). Today the only workflow
*deploys*; nothing stops a regression in the core loop. The builder currently has 6 of 86 verify
suites and zero e2e — invert that ratio where it counts.

## P1 — Sharpen the agent (the quality ceiling)

The edit agent has 5 tools: list, read, write-whole-file, delete, typecheck (+ web_search). Highest
leverage upgrades, in order:

**1. `edit_file` (string-replace patches).** Whole-file rewrites are slow, expensive, and the #1
truncation risk on big files. A str-replace tool with exact-match semantics cuts tokens/latency by
3-5× on surgical edits and eliminates the "half a file" failure class the truncation guard exists
for.

**2. `see_preview` (vision).** The screenshot machinery already exists (`captureScreenshot`,
html2canvas, preview snapshots). Give the agent a tool that returns a screenshot of the running
preview and let it self-critique against the DESIGN_GUIDE rubric it was prompted with. "The agent
looks at what it built and fixes what looks wrong" is a visible, demoable differentiator nobody
does well, and it directly attacks the AI-slop-design problem the prompts fight blind today.

**3. `grep` tool.** On imported/large projects the agent reads files by guess. A search tool makes
edits on real codebases dramatically better — and imported projects are the expansion market.

**4. Prompt-cache the loop.** `rawComplete` caches its system block; verify `callModel` in
`agent/loop.ts` does the same for system + the growing message prefix (cache_control on the last
stable block). Agent turns are the product's hottest path; this is a large cost/latency win.

**5. Post-merge/branch polish.** `useProjectFiles` refetches *everything* on any row change —
branch writes (work + base rows) double the churn. Debounce, or scope the realtime refresh.

## P2 — Make branches the headline

Branches + verified merge just landed and nobody in the category has it. Ship the story:

1. **Compare view**: two Fast-preview iframes side by side (Fast runtime has no single-instance
   limit), Main vs branch or branch vs branch, one click from the BranchBar. This is the demo.
2. **Branch share links**: publish a branch preview to a URL (the `PreviewSite` plumbing pattern
   exists) — "try both, tell me which" is a shareable growth loop.
3. **Then canvas**: the spatial branch/feature map (nodes = branches, chats attached) over the
   branch data model, with compare as its killer interaction. Spike it like `GalaxyView` was.

## P3 — Complete the ship story

1. **Custom domains** (explicitly not built; `prompts.ts:727`). Netlify's DNS/alias API makes this
   days of work, and it's table stakes for "ship real products."
2. **Share/handoff**: public read-only project links; GitHub export already exists — surface it.
3. **Delete the `recordDeployment` stub buttons** still sitting next to the real Publish button.
4. **Preflight/health panel** for operators: the ~12 secrets and ~10 functions the ship path needs,
   checked and green/red, instead of failure-by-toast-string.
5. Teams/multiplayer: later. Single-player polish beats half-multiplayer.

## North-star metrics (define now, chart weekly)

- **First-forge success rate**: % of new-user generations that compile *and* render without error,
  no intervention. (This is the whole product in one number.)
- **Verified-edit rate**: % of edit turns ending `✓ compiled`.
- **Time-to-first-preview** from prompt submit.
- **Merge integrity**: % of branch merges landing green (target: 100% by construction).

## Quick wins (do in one afternoon)

- Fix the landing-page claim about keys never touching the browser (false in DIRECT mode).
- `Garvis.tsx` raw emerald/red → forge tokens; retire the orphan `/garvis` route.
- README/RUNBOOK: document the real deploy path (docs still describe the stub as reality).
- Snapshot-trigger hygiene: exclude `/.fableforge/branches/` rows from `project_file_versions`
  growth if version-table bloat shows up.
- `pendingEdit` captured on one thread can be applied after switching threads — snapshot the
  thread/branch id into the pending edit.

---

*The one-line summary: pick the builder as the front door, make "verified" unconditional and
honest, give the agent eyes and a scalpel, and let branches carry the launch. The craftsmanship is
already best-in-class; the coherence isn't — yet.*
