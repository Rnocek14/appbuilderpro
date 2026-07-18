# The Operating Brain — Audit & Plan

A full-codebase audit (July 2026), read through the correct lens: **this is a personal operating
system for one operator** — create ideas, build them into products (FableForge), ship them, and
market/run them (Garvis). It is not a SaaS competing for strangers. The bar is not "would a
stranger pay?" — it is **"does this multiply me, and does it keep running when I'm not looking?"**

Three deep audit passes were made: generation + preview pipeline, ship/monetize/trust layers, and
product surface. This doc is the synthesis, re-prioritized for the operating-brain reality.

---

## What the audit actually found (through this lens)

**The machine is far more real than its own docs claim.**
- Build: shell-contracts-then-parallel-pages generation, compiler-verified agentic edits with
  relentless repair, branch-per-feature with readiness-gated merges (nothing lands broken).
- Ship: real one-click Netlify deploys, real Supabase provisioning + backend/edge-function/cron
  deploys, GitHub export.
- Market/monetize: preview-site prospecting funnel with claim/lead capture, outreach machinery,
  and a per-app AI gateway that meters **client apps** against credits at a 1.25× margin — that's
  not a paywall for FableForge, it's *revenue infrastructure for apps you ship to clients*.
- Trust: RLS is genuinely careful, with documented audit fixes and privilege pins.

**The real weaknesses for an operating brain are different from a SaaS's:**
1. **Unattended reliability is the whole game, and it's the least protected.** The brain runs
   heartbeats, workers, outreach, billing chases. You vibe-code your own brain — and nothing gates
   a regression: the only CI workflow *deploys*; the builder core has zero e2e; 6 of 86 verify
   suites cover the builder. A silent break in a loop you trust is the worst failure this system
   can have, because there's no second operator to notice.
2. **Brain-critical intelligence requires an open browser tab.** Autopilot, roadmap, ideation,
   backend-gen, doc analysis are DIRECT-mode-only (browser key in localStorage, `aiClient.ts`
   "edge mirror coming" cluster). An operating brain must think **while you sleep** — anything
   that dies when the tab closes isn't a brain, it's a dashboard.
3. **Generation orchestration lives in the tab too.** Refresh mid-build kills the headline action;
   `resumeGeneration` exists but is manual and conditional.
4. **"Verified" silently degrades.** The compile gate needs WebContainer isolation; absent that,
   "clean" means "passed regex checks" and the UI doesn't tell you which you got. You are the one
   consuming this signal — it must be honest with you.
5. **The edge generation path is a rotting fork** (single 32k stream, static-QA healing only,
   header falsely claims parity with the good client pipeline).
6. **Operator UX debt inside Garvis**: three memory rooms (Memory/Mind/Brain), three money rooms
   (Money/ClientBilling/Billing), an orphan `/garvis` route, stale README/RUNBOOK that describe
   deploy as stubbed. For a single operator, every duplicate room is daily friction.

**What dissolves under this lens** (was in the SaaS framing, now deprioritized): stranger
onboarding, social login, pricing-page coherence, FableForge-as-product billing UX, teams /
multiplayer, brand "identity decision." Keep the credits engine — it meters *client* apps — but
the $19-vs-$49 pricing page contradiction only matters if FableForge is ever sold as SaaS.

---

## The plan

### P0 — The brain must not lie to you, and must not die when the tab closes

1. **CI as your second operator.** One workflow on every push: `tsc --noEmit` + all `verify:*`
   suites + 3 Playwright specs (generate→preview renders; edit→diff card; branch→merge green).
   You are protecting *future you* from *tonight's you*.
2. **Move brain-critical intelligence server-side.** Finish the "edge mirror" cluster through the
   existing `agent-turn`/`cloudComplete` relay so autopilot, roadmap, ideation, backend-gen, and
   doc analysis run headless — then wire the ones that matter into the existing `job-worker` /
   pg_cron spine so they can run scheduled, unattended. This is the single biggest step from
   "dashboard" to "brain."
3. **Durable generation.** Auto-resume interrupted builds on workspace load (detect + continue,
   no button). Later: move orchestration into `job-worker` entirely.
4. **Honest verification badges.** `✓ compiled` vs `✓ static checks` vs `⚠ unverified` on every
   build and edit. You need to know which promise you're holding.
5. **Kill the fork.** Delete or thin-out `generate-app/index.ts` so every build goes through the
   good pipeline regardless of environment.

### P1 — Sharpen the agent (multiplies everything downstream)

1. **`edit_file` (string-replace patches)** — whole-file rewrites are the top cost/latency/
   truncation source. A scalpel makes every edit 3-5× cheaper and faster.
2. **`see_preview` (vision)** — screenshot machinery already exists (`captureScreenshot`,
   snapshots). Let the agent look at what it built and self-critique against the DESIGN_GUIDE it
   was prompted with. Directly attacks design-slop with a feedback loop instead of rules.
3. **`grep` tool** — makes the agent competent on imported/larger codebases.
4. **Prompt-cache the agent loop** (system + stable message prefix) — hottest path in the system.
5. **Realtime churn**: `useProjectFiles` refetches everything on any row change; branch writes
   double the churn (work + base rows). Debounce/scope it.

### P2 — Branches as the idea-exploration engine

You built branches to explore ideas without risk. Complete that story for yourself:
1. **Compare view** — two Fast previews side by side (no single-instance limit), Main vs branch.
   Decide between directions by *looking*, not remembering.
2. **Branch share links** — publish a branch preview to a URL for a client/friend: "which one?"
3. **Canvas** — the spatial branch/feature map over the branch data model, chats attached,
   compare as the killer interaction. This is also the natural home for idea → branch → merge →
   shipped lineage: the visible shape of the operating brain.

### P3 — Close the operator loops

1. **One room per job.** Merge Memory/Mind/Brain into one knowledge room; Money/ClientBilling
   into one revenue room (account `/billing` stays separate — it's plumbing). Retire the orphan
   `/garvis` route and dev-only spikes that graduated or died.
2. **Ship → market seam.** When an app deploys, the brain should *offer the next move* (preview
   site, outreach campaign, social post) — the modules exist; make deploy emit the trigger.
3. **Preflight panel.** The ship path depends on ~12 secrets and ~10 functions; one green/red
   health surface instead of failure-by-toast. (You are your own ops team.)
4. **Custom domains for client sites** — this one survives the lens change: apps you ship *for
   clients* on `*.netlify.app` undercut the agency story. Netlify's DNS/alias API, days of work.
5. **Truth in docs**: README/RUNBOOK still describe deploy as stubbed; the `recordDeployment`
   stub buttons still sit next to the real Publish button. Delete both lies.

---

## North-star metrics (for an operating brain)

- **Idea → live URL time** (prompt to deployed product, no intervention).
- **First-forge success rate** — % of generations that compile *and* render clean on the first try.
- **Unattended hours** — how long the brain runs (workers, autopilot, outreach) without you
  touching it or it breaking. This is the metric that makes it a *brain*.
- **Merge integrity** — % of branch merges landing green (100% by construction; watch it hold).

---

*One-line summary: the craftsmanship is already there — make the brain honest with you, make it
run while you sleep, give the agent eyes and a scalpel, and let branches be how you think.*
