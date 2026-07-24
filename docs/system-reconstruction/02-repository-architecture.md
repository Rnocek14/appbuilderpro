# 02 — Repository Architecture: Frontend

> System-reconstruction document. Scope: repository layout, routing, every page, navigation,
> components, hooks, context, types/data, and the frontend placeholder/flag inventory.
> Snapshot date: 2026-07-24, HEAD `e7fdc54` ("Reply on the prospect: read their answer + a Replied filter (#88)").
> All file references are relative to the repo root `/home/user/appbuilderpro` unless absolute.

The product is **two halves of one system** (README.md:1-12): **FableForge**, a Lovable-style AI
app builder (projects → workspace → editor → deploy), and **Garvis**, an "AI chief of staff" /
business-operating-system living under `/garvis/*`. The unified brand shown in the shell is
**Garvis** — the sidebar logo, mobile header, and landing page all say "Garvis"
(`src/components/layout/AppShell.tsx:115`, `src/pages/Landing.tsx:632`), and the comment at
`AppShell.tsx:15-18` states the doctrine explicitly: *"This is a Garvis deployment: the business OS
LEADS … the app builder is a real, still-reachable capability ('edit apps') demoted below it under
'Apps', not removed."*

---

## 1. Repo Layout

| Path | Purpose |
|---|---|
| `src/` | The entire React 18 + TypeScript frontend (Vite). Subdirs below. |
| `src/pages/` | 48 top-level page components + `admin/` (1), `dev/` (10), `spike/` (4) = **63 page files**. |
| `src/components/` | 105 files: 11 root shared components + subdirs `chat/`, `clients/`, `editor/`, `garvis/` (72 files incl. `canvas/` with 17), `layout/`, `preview/`, `prospects/`, `ui/`. |
| `src/hooks/` | 21 data/behavior hooks (all Supabase- or model-backed except `useUnsavedGuard`). |
| `src/context/` | 2 providers: `AuthContext`, `ToastContext`. |
| `src/data/` | 4 static seed/sample files (`capabilitySeed`, `clusterSamples`, `portfolioSeed`, `templates`). |
| `src/types/` | `index.ts` — ~60 exported interfaces/types shared across both halves. |
| `src/lib/` | ~370 files of non-React logic: `aiClient`/`aiConfig` (provider abstraction), `agent/` (agentic edit loop), `preview/` (Business Website Preview Engine), `flagship/`, and the huge `garvis/` domain layer (~320 files; roughly half are `*.verify.ts` node-run self-tests wired to `npm run verify:*` scripts). |
| `supabase/` | Backend: `schema.sql` + `schema_v2_autopilot.sql` + `schema_repair.sql`, **125 migrations**, `seed.sql`, and **67 edge functions** (+ `_shared`) under `functions/` (generate-app, chat-edit, garvis-worker, send-email, booking, voice-inbound, stripe-webhook, …). |
| `docs/` | ~35 design/architecture markdown docs (RUNBOOK.md, garvis-* blueprints, go-live-checklist, holy-grail.md…), `mockups/` (2 HTML UI concepts), and `system-reconstruction/` (this doc set). |
| `e2e/` | Playwright suites: `smoke.spec.ts`, `routes.spec.ts` (full backendless route sweep — public routes must render, protected must redirect to `/auth`), `authed-mock.spec.ts`, `flows.authed.spec.ts`. |
| `scripts/` | Operational/dev scripts: `go-live.sh`, `migrations.verify.ts`, seeders (`seed-einstein.ts`), probes (`idea-board-probe.mjs`), `design-e2e.ts`, `make-schema-repair.py`, etc. |
| `public/` | `anvil.svg` favicon and `flagship/` — real media (jpg/mp4) for the FlagshipArtist bespoke page. |
| `.github/workflows/` | `ci.yml`, `deploy-supabase.yml`. |
| `.claude/` | `settings.local.json` (Claude Code project settings). |
| Config files | `vite.config.ts` (COEP `credentialless` + COOP headers required for the in-browser WebContainer runtime; `sourcemap: 'hidden'`), `tailwind.config.js` (forge-* token palette), `tsconfig.json`, `postcss.config.js`, `playwright.config.ts`, `.env.example` (heavily annotated — every server secret documented per pillar), `index.html`, `package.json` (scripts: `dev`, `build`, `typecheck`, `db:push`, two large `functions:deploy` lists, ~40 `verify:*` scripts). |
| `ref2.png`, `ref3.png` | 25-byte stub files at repo root (leftover reference-image placeholders). |

Entry chain: `index.html` → `src/main.tsx` (StrictMode + createRoot, nothing else) → `src/App.tsx`
(all providers + the entire route table).

---

## 2. Route Map

All routes are defined in **one file**: `src/App.tsx` (lines 102–178). Auth gating is a local
`Protected` wrapper (App.tsx:73-83; `adminOnly` checks `profile.role === 'admin'`). Everything
except the eager public entry pages (Landing, Auth, OAuthCallback) is `lazy()` code-split
(App.tsx:13-71). The catch-all `NotFoundRedirect` (App.tsx:88-92) sends signed-in users to
`/garvis/command` and signed-out users to `/`.

**66 route entries: 60 rendering routes + 5 legacy redirects + 1 wildcard** (and one component,
`PreviewSite`, mounted on two paths). Nav-linked = appears in `src/lib/navConfig.ts` (sidebar + ⌘K)
or in AppShell's hardcoded admin entries. "⌘K alias only" = reachable through the command palette's
curated alias list (`src/components/CommandPalette.tsx:73-92`) but **not** in the sidebar.

### Public (no auth)

| Path | Page file | Nav-linked? | Purpose | Status |
|---|---|---|---|---|
| `/` | `pages/Landing.tsx` | root URL | Marketing landing for Garvis (features, CTA to /auth or /garvis/command) | Wired |
| `/auth` | `pages/Auth.tsx` | from Landing | Sign in / sign up / magic link; signed-in users bounce to `/garvis/command` (Auth.tsx:23) | Wired |
| `/oauth/callback` | `pages/OAuthCallback.tsx` | programmatic only | OAuth code/state exchange via `oauth` edge fn, returns to origin page | Wired |
| `/pricing` | `pages/Pricing.tsx` | Landing header; AppShell upgrade button | Free/Pro plan cards | Wired (static plans) |
| `/book/:slug` | `pages/BookingPage.tsx` | external link only (sent to a business's customers) | Public booking page; all data via `booking` edge fn, never touches DB directly (BookingPage.tsx:2-4) | Wired |
| `/preview-site/:slug` | `pages/PreviewSite.tsx` | external link only (outreach emails) | Public generated preview website for a prospect; sandboxed iframe for bespoke HTML | Wired |
| `/preview-site/:slug/email-shot` | `pages/PreviewSite.tsx` (`shot` prop) | screenshot pipeline only | Stripped animation-free variant for email screenshots | Wired |
| `/preview-site/:slug/report` | `pages/PreviewReport.tsx` | linked from preview site | Public website-audit report ("what your site costs you"), noindex | Wired |

### Garvis (Protected)

| Path | Page file | Nav-linked? | Purpose | Status |
|---|---|---|---|---|
| `/garvis/command` | `pages/Command.tsx` | **Core → "Home"** | Conversational front door: waking moment, chips, persistent Commander chat | Wired, primary home |
| `/garvis/leads` | `pages/Leads.tsx` | **Core → "Prospects"** | Prospect pipeline board (New→Built→Pitched→Won) + one-click Build & send + detail drawer | Wired; **was orphaned until commit 0cfc8fd** |
| `/garvis/queue` | `pages/Queue.tsx` | **Core → "Queue"** (badge) | THE approval/inbox room — decisions, build questions, messages merged into lanes | Wired, central |
| `/garvis/client-book` | `pages/ClientBook.tsx` | **Core → "Clients"** | Client engagements book (who you operate for, intake checklist, linked world) | Wired |
| `/garvis/clients` | `pages/WinClients.tsx` | Prospecting → "Win clients" | Hunt front door: niche+town → find businesses → audit sites → build preview + pitch → Queue | Wired |
| `/garvis/opportunity-feed` | `pages/OpportunityFeed.tsx` | Prospecting → "Opportunities" | Triage feed of hunt catches (jobs/RFPs/grants); direct supabase reads | Wired (Application Composer noted as "next engine", OpportunityFeed.tsx:5-6) |
| `/business-preview-engine` | `pages/PreviewEngine.tsx` | Prospecting → "Preview Engine" (badge) | Fleet manager for preview sites: ingest profile JSON, regenerate, publish, domains, ingest tokens, claims | Wired |
| `/garvis/workshops` | `pages/Workshops.tsx` | Build → "Workshops" | Gallery of outcome-shaped studio rooms across all businesses | Wired |
| `/garvis/orchestrate` | `pages/Orchestrate.tsx` | Build → "Orchestrate" | Whole-intent compiler: one sentence → reviewable multi-step plan → approved execution | Wired |
| `/garvis/home/:businessId?/:areaSlug?` | `pages/ProfileHome.tsx` | Build → "Canvas" | The canvas spine: you → business → area → artifact, one route, URL-as-state (App.tsx:107-108) | Wired |
| `/garvis/webs` | `pages/WorkWebs.tsx` | Build → "Businesses" | Work Webs index/gallery; genesis drafts from intent or repo | Wired |
| `/garvis/webs/:worldId` | `pages/WorkWeb.tsx` | in-app (from WorkWebs, Workshops, canvases) | A single Work Web: territory graph + chartered workspace, all studios mount here (1,687 lines) | Wired, biggest Garvis surface |
| `/garvis/scenes` | `pages/SceneStudio.tsx` | Automation? No — Build → "Scenes" | Curated Veo 3.1 video-clip library with human approval, via `generate-video` edge fn | Wired; **surfaced orphan** (0cfc8fd) |
| `/garvis/client-billing` | `pages/ClientBilling.tsx` | Money → "Client revenue" | Operator's book of business: tiers, Stripe Payment Links, MRR. "Nothing here charges a card directly" (ClientBilling.tsx:5) | Wired, v1 manual-links fulfilment |
| `/garvis/money` | `pages/Money.tsx` | Money → "Money" | Invoices: create, queue send through Approvals, chaser, mark paid | Wired |
| `/garvis/automations` | `pages/Automations.tsx` | Automation & status | Recurring per-customer automations (recall/seasonal/review) → Queue for approval | Wired |
| `/garvis/booking` | `pages/BookingSetup.tsx` | Automation & status → "Online booking" | Operator setup for the public `/book/:slug` page (hours, services, tz) | Wired |
| `/garvis/missed-call` | `pages/MissedCall.tsx` | Automation & status | Twilio missed-call text-back config per client; webhook = `voice-inbound` edge fn | Wired (inert until Twilio secrets set — by design, MissedCall.tsx:5-6) |
| `/garvis/email-domains` | `pages/EmailDomains.tsx` | Automation & status → "Sending domains" | Resend domain verification (DNS records, verify, per-brand from-address) | Wired |
| `/garvis/working` | `pages/Working.tsx` | Automation & status → "Working for you" | Read-only "what is the machine doing while I'm away" board, heartbeat-led | Wired, deliberately read-only |
| `/garvis/setup` | `pages/ClientReadiness.tsx` | Automation & status → "Setup" | Operator console: readiness checklist with links to each fix | Wired |
| `/garvis/health` | `pages/Health.tsx` | Automation & status → "Health" | Integrations health board: edge-fn OPTIONS probes, Master Switch, heartbeat | Wired; **surfaced orphan** (0cfc8fd) |
| `/garvis/memory` | `pages/Memory.tsx` | Knowledge → "Memory" | ONE MEMORY: tabs mounting `BrainContent` (library) + `MindContent` (Memory.tsx:2-7) | Wired, merge-door |
| `/garvis/universe` | `pages/Universe3D.tsx` | Knowledge → "Galaxy" | 3D WebGL galaxy of worlds (three/R3F + bloom); `?mode=flat` falls back to the SVG `Universe.tsx` | Wired |
| `/garvis/contacts` | `pages/Contacts.tsx` | Knowledge → "Contacts" | CRM: stages, notes, timeline, suppression, batch send | Wired |
| `/garvis/system/:worldId` | `pages/SystemAltitude.tsx` | in-app (Universe, WorkWeb) | One world as a solar system (SVG), "No-Theater" motion rules | Wired |
| `/garvis/mind` | `pages/Mind.tsx` | **No** — ⌘K alias → `/garvis/memory?tab=mind` | Identity / events / beliefs / decisions panels ("view over the record") | Wired but demoted; kept routable by "merge and relocate, never amputate" doctrine (Memory.tsx:5-7) |
| `/garvis/brain` | `pages/Brain.tsx` | **No** — ⌘K alias → `/garvis/memory?tab=library` | Document intake + insights + Ask Garvis | Wired but demoted (same doctrine) |
| `/garvis` | `pages/Garvis.tsx` | **No** — ⌘K alias "Portfolio overview (legacy)" | Original portfolio dashboard: apps, goals, capabilities, triage, follow-up, content panels (687 lines) | Wired but **legacy**, ⌘K-only |
| `/garvis/control` | `pages/MissionControl.tsx` | **No** — ⌘K alias "Mission Control — activity (legacy)" | Observability rollup: doing/found/spent | Wired but legacy, ⌘K-only |
| `/garvis/missions` | `pages/Missions.tsx` | **No** — ⌘K alias "(legacy)" | Plan/run/cancel missions (planner + workers) | Wired but legacy, ⌘K-only |
| `/garvis/marketing` | `pages/Marketing.tsx` | **No** — ⌘K alias "(legacy)" | Campaign generator (strategy→calendar→posts→email→landing) with review/approve | Wired but legacy, ⌘K-only |
| `/garvis/opportunities` | `pages/Opportunities.tsx` | **No** — ⌘K alias "(legacy)" | Portfolio-level opportunity scan → convert to mission | Wired but legacy, ⌘K-only |
| `/garvis/explore` | `pages/spike/ClusterSpike.tsx` | **admin-only** "Labs → Cluster spike (Explore)" (AppShell.tsx:24-28) + ⌘K alias | Knowledge Universe rabbit-hole explorer (see Spike section) | Experimental, admin-gated in nav |

### Garvis redirects (legacy doors kept alive)

| Path | Redirects to | Reason (source comment) |
|---|---|---|
| `/garvis/inbox` | `/garvis/queue` | "ONE QUEUE… Old doors redirect — every deep link, toast, and waking move keeps working" (App.tsx:119-120) |
| `/inbox` | `/garvis/queue` | same |
| `/garvis/approvals` | `/garvis/queue` | same |
| `/garvis/studios` | `/garvis/workshops` | rename |
| `/garvis/universe/flat` | `/garvis/universe?mode=flat` | "ONE SKY: the flat map is the same page's fallback + toggle now, not a second door" (App.tsx:146) |
| `*` | `/garvis/command` (signed in) or `/` | NotFoundRedirect (App.tsx:85-92) |

Also removed entirely: `/spike/clusters` — "same component as /garvis/explore (audit: one page, two
doors)" (App.tsx:158).

### FableForge app builder (Protected)

| Path | Page file | Nav-linked? | Purpose | Status |
|---|---|---|---|---|
| `/dashboard` | `pages/Dashboard.tsx` | Apps → "Projects" | Project grid: search, archive, duplicate, delete | Wired |
| `/new` | `pages/NewProject.tsx` | Apps → "New app" | Describe an app → plan (PlanCard) → design directions (DirectionPicker) → generation; accepts Garvis world→build handoffs (`buildBridge`) | Wired |
| `/import` | `pages/ImportProject.tsx` | Apps → "Import" | Import from GitHub URL or zip (e.g. a Lovable export) | Wired |
| `/autopilot` | `pages/Autopilot.tsx` | Apps → "Autopilot" | Queue product briefs; background job queue (`useJobs`/`job-worker` edge fn) with milestones | Wired |
| `/project/:id` | `pages/ProjectWorkspace.tsx` | from Dashboard cards | The 1,803-line workspace: FileTree + Monaco + Sandpack preview + WebContainer + chat + branches + data console + QA + deploy | Wired (deploy trigger stubbed — see inventory) |
| `/settings` | `pages/Settings.tsx` | Account → "Settings" | AI provider/model/key (DIRECT mode), ConnectionsHub, sender identities, notifications, spend meter | Wired |
| `/billing` | `pages/Billing.tsx` | Account → "Subscription" | The app's own subscription: usage events, Stripe checkout/portal via edge fns ("stub mode until Stripe is connected", Billing.tsx:72) | Wired w/ stub fallback |
| `/admin` | `pages/admin/AdminDashboard.tsx` | admin-only entry appended to Account section (AppShell.tsx:188-198) | Admin panel: users, usage charts (Recharts), failed generations, error/audit logs, model settings | Wired, admin-gated route (`adminOnly`) |

### Dev routes (hidden)

All defined at App.tsx:160-171 under the comment *"DEV-ONLY — unauthed preview of in-progress
surfaces, for screenshot-driven building. Gated to dev builds so it never ships to production."*
Every one is wrapped in `{import.meta.env.DEV && …}` — **except one** (see below).

| Path | Page file | Gated? | Purpose |
|---|---|---|---|
| `/dev/marketing-canvas` | `pages/dev/CanvasPreview.tsx` | DEV only | Real `MarketingCanvas` with no auth; data calls fail gracefully |
| `/dev/profile-home` | `pages/dev/ProfileHomePreview.tsx` | DEV only | `BranchCanvas` spine on a static 3-level sample tree + canned chat reply (`stubSend`, line 1870) |
| `/dev/web` | `pages/dev/WebPreview.tsx` | DEV only | `ConstellationWeb` with sample prospect nodes |
| `/dev/prospect-web` | `pages/dev/ProspectWebPreview.tsx` | DEV only | `ProspectCanvas` with a sample `SiteAudit` |
| `/dev/rebuild-preview` | `pages/dev/RebuildPreview.tsx` | DEV only | Renders an injected `SiteSpec` (`window.__REBUILD_SPEC__` or localStorage `dev:rebuild-spec`) through the production `PreviewSiteRenderer` |
| `/dev/flagship-artist` | `pages/dev/FlagshipArtist.tsx` | **NOT gated — ships to production, unauthenticated** (App.tsx:167 has no `import.meta.env.DEV` guard) | Bespoke hand-choreographed scroll site for an artist's portfolio; data via `window.__FLAGSHIP__` manifest, media in `public/flagship/`; can save itself as a project (`saveFlagshipAsProject`) |
| `/dev/win-hub` | `pages/dev/WinHubPreview.tsx` | DEV only | `CanvasScene` Win-clients pipeline hub, sample counts |
| `/dev/studios` | `pages/dev/StudiosPreview.tsx` | DEV only | Email/Ads/Copy/Social `IdeaStudio` + `ReelStudio` with mock `StudioCtx` |
| `/dev/board` | `pages/dev/BoardPreview.tsx` | DEV only | All five creative boards (postcard/social/email/brand/idea) with mock materials |
| `/dev/workshops` | `pages/dev/WorkshopsPreview.tsx` | DEV only | The real `Workshops` page fed `previewInstances` mocks |

### Page files with no route of their own (not orphans — embedded)

| File | Mounted by | Evidence |
|---|---|---|
| `pages/Universe.tsx` (flat SVG universe) | `Universe3D.tsx` as the `?mode=flat` fallback/toggle | `import UniverseFlat from './Universe'` (Universe3D.tsx:1542) |
| `pages/spike/GalaxyView.tsx` | `ClusterSpike.tsx` | ClusterSpike.tsx:2091 |
| `pages/spike/IdeaRoom.tsx` | `ClusterSpike.tsx` | ClusterSpike.tsx:2092 |
| `pages/spike/SceneStage.tsx` | `GalaxyView.tsx` | GalaxyView.tsx:2139 |
| `pages/Brain.tsx` / `pages/Mind.tsx` (content exports) | `Memory.tsx` mounts `BrainContent` + `MindContent` as tabs (Memory.tsx:734-735) while their own routes stay live | Brain.tsx:248-249 |
| `pages/spike/ClusterSpike.tsx` | Also **embedded inside Command.tsx** (`import ClusterSpike from './spike/ClusterSpike'`, Command.tsx:380) in addition to its `/garvis/explore` route | — |

---

## 3. Navigation Structure

### The one source of truth: `src/lib/navConfig.ts`

Header comment (navConfig.ts:1-5): *"ONE source of truth for the app's primary destinations. The
sidebar (AppShell) renders these, and the ⌘K command palette generates its 'go to' commands from
the SAME list — so the two can never drift."*

### Commit `0cfc8fd` — "Simplify the app: Core loop up front, everything else under 'More'" (#74, 2026-07-22)

Before: ~18 items in one "Operate" list. After (current state):

- **Section 0 "Core"** is the only section shown by default in the expanded sidebar: **Home**
  (`/garvis/command`) · **Prospects** (`/garvis/leads`) · **Queue** (`/garvis/queue`) ·
  **Clients** (`/garvis/client-book`). The commit message notes `/garvis/leads` *"was previously
  orphaned (no nav entry at all)"* and that **Scenes** and **Health** were two more surfaced orphans.
- Everything else sits behind a **"More" disclosure** (`AppShell.tsx:147-216`): expanded sidebar
  renders `section[0]` always and the rest only when `moreOpen`; the icon-collapsed rail shows
  *everything* ("there's no room for a disclosure there", AppShell.tsx:35-36).
- Doctrine: *"regroup, don't delete. Nothing lost a route"* (navConfig.ts:21).

Current sections (navConfig.ts:22-101):

| Section | Items (label → path) |
|---|---|
| **Core** | Home → `/garvis/command` · Prospects → `/garvis/leads` · Queue → `/garvis/queue` · Clients → `/garvis/client-book` |
| Prospecting | Win clients → `/garvis/clients` · Opportunities → `/garvis/opportunity-feed` · Preview Engine → `/business-preview-engine` |
| Build | Workshops → `/garvis/workshops` · Orchestrate → `/garvis/orchestrate` · Canvas → `/garvis/home` · Businesses → `/garvis/webs` · Scenes → `/garvis/scenes` |
| Money | Client revenue → `/garvis/client-billing` · Money → `/garvis/money` (note comment: three money doors deliberately renamed apart — agency MRR vs personal invoices vs the app's own bill, navConfig.ts:59-60) |
| Automation & status | Automations · Online booking · Missed-call text-back · Sending domains · Working for you · Setup · Health |
| Knowledge | Memory → `/garvis/memory` · Galaxy → `/garvis/universe` · Contacts → `/garvis/contacts` |
| Apps (the demoted FableForge half) | Projects → `/dashboard` · New app → `/new` · Import → `/import` · Autopilot → `/autopilot` |
| Account | Subscription → `/billing` · Settings → `/settings` |

### AppShell extras (not in navConfig)

- **Admin** NavLink appended after Account for `profile.role === 'admin'` (AppShell.tsx:188-198).
- **Labs** section (admin-only): "Cluster spike (Explore)" → `/garvis/explore` (AppShell.tsx:23-28;
  *"a 900-line spike should not be one click from Billing for everyone"*).
- **Badges**: Queue shows `opsCount + pendingCount` (new leads + pending approvals + unanswered
  positive replies, counted from real rows on mount/focus, AppShell.tsx:40-62 + 168-176);
  Preview Engine shows `claimCount` from `usePreviewClaims` (realtime, AppShell.tsx:177-185).
- Footer: generations meter (`usageThisMonth/limit`), **credits balance** ("the metering that gates
  every server AI action; previously enforced server-side but invisible… Now honest",
  AppShell.tsx:233-242), plan, theme toggle, sign out.
- Sidebar collapse persisted under localStorage `ff:sidebar-collapsed`; toasts on
  `ff:storage-full` events (storage-quota honesty, AppShell.tsx:76-86).

### Command palette (`src/components/CommandPalette.tsx`)

- Generated nav commands from `NAV_SECTIONS` (line 70-72) + a curated alias list (lines 73-92)
  that is the **only** navigation path to the legacy rooms: `Approvals → Queue`, `Library → Memory`,
  `Mind → Memory`, `Galaxy (2D map)`, `Explore (rabbitholes)`, `Studios → Workshops`,
  `Mission Control — activity (legacy)`, `Portfolio overview (legacy)` (→ `/garvis`),
  `Missions/Marketing/Opportunities (legacy)`.
- From 3 characters it also runs **universal search** over the record (artifacts, areas, worlds,
  contacts, invoices, documents, beliefs, missions) via `universalSearch` RPC, degrading to
  commands-only if the RPC is unavailable (lines 46-63).
- Global ⌘K/Ctrl+K; opened via the `ff:open-palette` custom event.

### How a user moves between the two halves

- Sign-in lands on **Garvis** (`/garvis/command`, Auth.tsx:23); FableForge is reached through the
  sidebar's **Apps** section (under "More") or ⌘K ("Projects", "New project", or any project name).
- Garvis → builder handoff is also programmatic: `NewProject.tsx` reads a **world build handoff**
  (`readWorldHandoff`/`readDurableBuildBrief` from `lib/garvis/buildBridge`, NewProject.tsx:945)
  so "Build the site" actions inside a Work Web seed the app builder's first generation, and
  `bindProjectToWorld` ties the resulting project back to the world. `IdeaBoard`'s "Send to app
  builder" does the same (IdeaBoard.tsx header). Built apps mount back **inside** Garvis via
  `RoomsPanel` (sandboxed iframe of the deployed app, RoomsPanel.tsx:2-5).
- Both halves share the shell, auth, toasts, palette, usage metering, and the Supabase client.

---

## 4. Pages In Depth

### 4a. FableForge core (the app builder)

- **`pages/Landing.tsx`** (77L) — public landing. Garvis-branded ("Your own AI marketing team — on
  your Supabase, with your keys"); features grid emphasizes approval-gated sending. Links: /pricing,
  /auth, /garvis/command.
- **`pages/Auth.tsx`** (102L) — signin/signup/magic-link via `useAuth`; validates password ≥8;
  redirects signed-in sessions to `/garvis/command`.
- **`pages/OAuthCallback.tsx`** (52L) — exchanges `?code&state` server-side through
  `useConnections().finishOAuth` (the `oauth` edge fn); provider + return path stashed in
  sessionStorage `ff:oauth`.
- **`pages/Pricing.tsx`** (80L) — static Free ($0, 10 gens/mo) vs Pro ($19, 500 gens/mo) cards.
- **`pages/Dashboard.tsx`** (130L) — project grid over `useProjects`; search, archived toggle,
  per-card menu (duplicate/archive/delete); links to `/project/:id` and `/new`.
- **`pages/NewProject.tsx`** (342L) — the generation front door: prompt or template
  (`data/templates.ts`, 8 templates) → `draftGenerationPlan` (PlanCard approval) →
  `generateDesignDirections` (DirectionPicker: 3 live sandboxed HTML previews) → `startGeneration`
  (`lib/aiClient`). Saves a project brain (`saveBrain`), honors ModelPicker, consumes Garvis world
  handoffs (buildBridge).
- **`pages/ImportProject.tsx`** (200L) — GitHub (URL + optional token, `fetchGitHubFiles`) or zip
  (`analyzeZip`) → `persistImport` → workspace.
- **`pages/Autopilot.tsx`** (251L) — "Queue product briefs and let FableForge build in the
  background" (line 2). `useJobs`/`useMilestones` (jobs + milestones tables, `job-worker` edge fn
  nudged by `tickWorker`); statuses queued/running/waiting_approval/paused/completed/failed/cancelled.
- **`pages/ProjectWorkspace.tsx`** (1,803L — the largest page) — the whole IDE: `FileTree`,
  `CodeEditorPane` (Monaco + DiffEditor + version history), `PreviewPane` (Sandpack, device modes,
  element-select-to-edit), `WebContainerPane` + `WebContainerTerminal` (real `npm install`/typecheck/
  build in-browser; requires the COEP headers from vite.config.ts), `SearchPanel`, `DataPanel`
  ("FableForge Cloud Console" — data/SQL/secrets/auth/storage/functions/backups via the `db-console`
  edge fn), `ChatPanel` (conversational edits: `sendEdit` streaming `EditEvent`s, pending-edit
  diff approval via `DiffModal`, agentic verify-and-fix via `lib/agent`), `BranchBar` (feature
  branches + readiness-gated merges), project brain/map/roadmap/ideation docs, QA (`runQA`),
  screenshots, theme/assets modals, secrets manifest (`useProjectSecrets`), GitHub export, backend
  generation, deploys. **Deploy trigger is explicitly a stub**: *"INTEGRATION: swap this stub for a
  real Vercel/Netlify deploy hook call. The record + status UI below is production-ready; only the
  trigger is stubbed."* (ProjectWorkspace.tsx:913-914).
- **`pages/Settings.tsx`** (550L) — runtime AI provider/model/key editor (drives the local DIRECT
  path; `lib/aiConfig`), local spend meter (`lib/usage`), `ConnectionsHub` (Supabase/GitHub/Netlify
  tokens stored server-side via `connections` edge fn), `WorldSenderIdentities` (per-business email
  identity), notification prefs.
- **`pages/Billing.tsx`** (95L) — subscription + usage events from supabase; Stripe Checkout /
  customer portal through `create-checkout` / `customer-portal` edge fns; honest stub-mode notice
  when Stripe isn't connected (line 72).

### 4b. Garvis (business OS)

- **`pages/Command.tsx`** (243L) — the home. `WakingMoment` (greeting + at most three evidence-backed
  next moves), `RemindersCard`, first-run suggestion chips designed for zero-data accounts
  (Command.tsx:385-397), `QuickStartRealEstate`, `GenerationReadiness`, `MissionTasks`, and the
  persistent Commander chat via `useCommander` (transcript in `command_messages`; reflexive
  retrieval over the owner's artifacts). Throttled proactive scan (12h). Can go full-screen into the
  embedded `ClusterSpike` explorer.
- **`pages/Queue.tsx`** (579L) — the merged decisions/questions/messages room (design-review P0,
  Queue.tsx:2-7). Lanes typed as `Row` union; approvals execute through
  `lib/garvis/execution.approveAndExecute` (the one spine); inbox items from `lib/garvis/inboxRun`;
  build questions from `useInbox` + `useAgentRunQuestions`; reply drafting via `rawComplete`;
  `AutonomyPanel` (earned auto-approval streaks); `UndoBar` for reversible actions only ("approve…
  can never be unsent, so they get no false undo"); `MarkWonInline` on positive replies.
- **`pages/Leads.tsx`** (252L) — prospect pipeline over `prospectsRun.loadProspects`; stage is
  *derived* in pure code (`prospects/stage.ts`) from status+demo+sale; filters (no-site, replied);
  per-row Build & send with honest send states; Claude scrape trigger; `ProspectDrawer` detail.
- **`pages/WinClients.tsx`** (514L) — the hunt: `findBusinesses` (Google results), `scrapeAndAudit`
  (honest site verdicts), `sweepNation`, standing hunt orders (`standingRun`), pitch building
  (`profileFromScrape` → preview engine → `queuePitch` → Queue), `ConstellationWeb`/`ProspectCanvas`
  visualizations, `SavedAudits`, `HuntReadiness` gates.
- **`pages/ClientBook.tsx`** (165L) — engagements CRUD via `clientEngagementRun` (onboard, statuses,
  intake checklist, link a world).
- **`pages/ClientBilling.tsx`** (351L) — tiers (`clientTiers`), settings + subs
  (`clientBilling`), per-client console (`clientConsoleRun`), Twilio number assignment,
  `ClientConnections` checklist. Explicitly distinct from `/billing` (ClientBilling.tsx:6).
- **`pages/Money.tsx`** (238L) — invoices via `moneyRun` (list/create/queue-send/mark-paid/void, all
  arithmetic in pure `money.ts`); sends only through Approvals; `ClockStatus` for the chaser.
- **`pages/Automations.tsx`** (309L) — customer lists + CSV import + trigger CRUD
  (`automation/triggersStore`), month report (`automation/report`), "Run due now"
  (`triggersRun.runTriggersForOwner`) → approval-gated sends. Only capabilities with a
  `triggerDefault` and `status !== 'not_built'` are offered (line 63-64).
- **`pages/BookingSetup.tsx`** (262L) / **`pages/BookingPage.tsx`** (185L) — operator config
  (direct `booking_pages`/`booking_services` writes under owner RLS) and the public page (all
  through the `booking` edge fn; renders in the business's fixed UTC offset by design).
- **`pages/MissedCall.tsx`** (240L) / **`pages/EmailDomains.tsx`** (228L) — per-client Twilio
  text-back configs (webhook `voice-inbound`) and Resend sender-domain verification
  (`email/senderDomainsRun`).
- **`pages/Working.tsx`** (207L) — read-only observatory over standing orders, outreach batches,
  build jobs, Places discovery, automations, reels; every section distinguishes empty vs MISSING
  (migration not applied) vs FAILED (Working.tsx:9-10).
- **`pages/ClientReadiness.tsx`** (131L) — readiness checklist; state from `readinessRun` +
  pure `computeReadiness` ("nothing is shown green it can't prove").
- **`pages/Health.tsx`** (135L) — edge-fn deployment probes (`healthRun.loadHealth`), `ClockStatus`,
  `MasterSwitch` (heartbeat arm + secrets presence), `HuntReadiness`.
- **`pages/Orchestrate.tsx`** (291L) — `compileIntent` → `CompiledPlan` review card (why/risk/
  produces per step; amber holes for missing capabilities; questions never invented) → `runArc`;
  arcs listed/abandoned; steps resolved through `actionRegistry`.
- **`pages/Workshops.tsx`** (217L) — instances derived from all webs' clusters
  (`workshops.workshopFor`); groups create/grow/understand/organize; search; accepts
  `previewInstances` for the dev preview.
- **`pages/WorkWebs.tsx`** (423L) — web gallery + genesis: `instantiateWeb` from templates
  (`mom-real-estate` flagship, `app-launch`), `generateDraft` from a sentence,
  `generateDraftFromRepo(s)` from GitHub URLs, draft approve/discard; `StandingOrdersPanel`.
- **`pages/WorkWeb.tsx`** (1,687L) — one world: territory graph left, chartered workspace right.
  Mounts nearly every garvis studio component (lazily, behind `PanelBoundary`), brand kit, files,
  knowledge upload, world intelligence (`worldIntelRun`), market intel prospect scans, results/leads,
  adaptive ad reads, connections, build-bridge ("Build the site" → app builder).
- **`pages/ProfileHome.tsx`** (249L) — the Canvas spine over `BranchCanvas`;
  levels resolved from real loaders (`loadUniverseScene` → `loadSystemScene` →
  `listClusterArtifacts`); docked `CanvasChat` (askGarvis / runStudioTurn), `ArtifactSheet`
  workbench, `StudioDock`.
- **`pages/Universe3D.tsx`** (742L) — R3F/three galaxy with bloom; orb emissive = momentum tier;
  fly-in reveals a world's planets; `?mode=flat` renders `Universe.tsx`. "No-Theater in 3D:…
  nothing revolves idly" (Universe3D.tsx:8-11).
- **`pages/Universe.tsx`** (304L) — flat SVG sky: bands = structural commitment, size = counted
  mass, TIME scrubber replaying `mind_events`; not routed directly (embedded).
- **`pages/SystemAltitude.tsx`** (262L) — one world as a solar system (SVG polar layout).
- **`pages/Memory.tsx`** (50L) — the tabs door mounting `BrainContent` + `MindContent`.
- **`pages/Mind.tsx`** (314L) — identity slots (goals/values/priorities/voice), event stream,
  evidence-counted beliefs, decision journal via `useMind`.
- **`pages/Brain.tsx`** (348L) — upload → `uploadAndIngest` (`ingest-document` edge fn path),
  insights accept/reject, filing into worlds/clusters, `AskGarvis`, `DocBriefPanel`.
- **`pages/Contacts.tsx`** (221L) — CRM over `workwebRun.listContacts` + `contactsRun`
  (detail/notes/timeline/suppress); `BatchSendCard` bulk sends through one approval.
- **`pages/OpportunityFeed.tsx`** (141L) — direct supabase reads of hunt-extracted opportunities;
  triage tabs new/saved/applied/dismissed; "null means 'the page didn't say', never a guess"
  (lines 3-4).
- **`pages/SceneStudio.tsx`** (155L) — Veo 3.1 clips via `generate-video` edge fn; poll →
  ready → human approve; approved clips feed the site generator's trade demos.
- Legacy portfolio suite (⌘K-only): **`Garvis.tsx`** (687L; portfolio stats, goals, capabilities,
  triage, follow-up, content, app profiles, liveness), **`MissionControl.tsx`** (99L;
  `useObservability` rollup), **`Missions.tsx`** (136L; `useMissions` plan/run),
  **`Marketing.tsx`** (263L; `useMarketing` campaign generator with per-asset approve/reject),
  **`Opportunities.tsx`** (94L; `useOpportunities` scan/save/dismiss/convert).

### 4c. Admin

- **`pages/admin/AdminDashboard.tsx`** (290L) — tabs users/usage/failures/logs/models; reads
  `profiles`, `usage_events` (30d), failed `project_generations`, `error_logs`, `audit_logs`, and a
  model-settings row; Recharts area chart of spend. Route is `adminOnly`-protected; non-admins are
  bounced to `/dashboard` (App.tsx:81).

### 4d. Dev / Spike / Hidden (experimental surfaces)

**`src/pages/dev/`** — ten unauthenticated preview harnesses for "screenshot-driven building"
(headers on each file say "Not linked anywhere in the app"). All are mock/sample-data mounts of
*real* production components (details in the Route Map table above). Two deserve emphasis:

- **`RebuildPreview.tsx`** is a Playwright seam: it renders whatever `SiteSpec` the test harness
  injects through `window.__REBUILD_SPEC__`, using the exact production `PreviewSiteRenderer` —
  "what you see here is exactly what a prospect sees at their preview link" (lines 4-6).
- **`FlagshipArtist.tsx`** (291L) is not a preview harness at all but a real deliverable lane: a
  bespoke, hand-choreographed scroll experience (gallery tunnel → deep zoom → 2.5D drift → works
  grid → inquire) for one client, data-driven via `window.__FLAGSHIP__` with real media in
  `public/flagship/`. It is the only `/dev/*` route **not** gated to dev builds (App.tsx:167), and
  it self-labels *"placeholder copy to be replaced with the artist's own words and inbox"*
  (FlagshipArtist.tsx:43).

**`src/pages/spike/`** — the Knowledge Universe experiment ("Explore"):

- **`ClusterSpike.tsx`** (424L) — the shell: "What are you curious about today?" → a persistent,
  growing multi-world universe. Local-first (localStorage) with best-effort Supabase sync
  (lines 4-6). Old clustering test tools live in a collapsible Dev panel. Routed at
  `/garvis/explore` (admin-only nav "Labs"), and embedded in Command.
- **`GalaxyView.tsx`** (939L) — the flowmap: radial tree of everything explored, detail panel,
  currents, media gathering (`serper`, wiki, videos), bridges, mind updates, build-brief compilation
  (`compileBuildBrief` — an exploration can become an app build).
- **`IdeaRoom.tsx`** (713L) — immersive drift mode: compose answer+media on entry, predictively
  prefetch next currents, epistemic node kinds (claim/theory/evidence/experiment…), `LabBench` +
  `MechanismCanvas` visual simulations. "Needs an API key" (line 8).
- **`SceneStage.tsx`** (363L) — cinematic full-bleed stage per idea with guess→reveal recipes.

Status: experimental by declaration (folder name, Labs gating, "spike" comments), but substantial
and actively integrated (Command embeds it; `buildBrief` bridges it to the builder).

---

## 5. Components

### Root (`src/components/`) — mostly builder-side

| File | Purpose | Used by |
|---|---|---|
| `AssetsModal.tsx` (166L) | Project asset library UI — upload photos or harvest a website's images into the asset manifest | ProjectWorkspace |
| `BranchBar.tsx` (110L) | Feature-branch strip + readiness-gated merge modal (`lib/mergeBranch`) | ProjectWorkspace |
| `CommandPalette.tsx` (174L) | ⌘K palette: nav commands from navConfig + legacy aliases + universal record search | AppShell (global) |
| `ConnectionsHub.tsx` (85L) | Connect-once-per-account provider tokens (Supabase/GitHub/Netlify), stored server-side | Settings |
| `DirectionPicker.tsx` (123L) | 3 live design-direction previews (sandboxed srcdoc iframes) pre-build | NewProject |
| `ErrorBoundary.tsx` (56L) | Route-level recoverable crash card; logs to supabase; `resetKey=pathname` in App | App |
| `Markdown.tsx` (100L) | marked + DOMPurify renderer with internal-link navigation | Command, ChatPanel, MissionTasks… |
| `ModelPicker.tsx` (153L) | Provider/model selector bound to `aiConfig` | NewProject |
| `PlanCard.tsx` (63L) | Approve-the-plan card for `EditPlan` | NewProject |
| `RememberModal.tsx` (125L) | Project memory viewer/editor | ChatPanel |
| `ThemeModal.tsx` (107L) | Theme preset picker for generated apps | ProjectWorkspace |

### `chat/` — the builder's conversational edit panel

`ChatPanel.tsx` (798L; streaming edits, link-context fetching, screenshots, image attachments,
plan/diff flow, undo, thread switching), `ThreadSwitcher.tsx` (130L), `Embers.tsx` (95L — the
signature canvas particle "forging" effect, reduced-motion aware). Consumer: ProjectWorkspace.

### `clients/`

`ClientConnections.tsx` (119L) — per-client connections checklist (seed rows, status refresh,
deep-link to fix, "not needed" marks). Consumer: ClientBilling.

### `editor/` — the IDE panes (all consumed by ProjectWorkspace)

`CodeEditorPane` (Monaco + diff + history), `FileTree`, `PreviewPane` (924L Sandpack preview,
device modes, element selection), `WebContainerPane` (305L) + `WebContainerTerminal` (xterm),
`SearchPanel` (client-side grep), `DataPanel` (308L cloud console over `db-console` edge fn),
`DiffModal` (review-before-write for PendingEdit).

### `layout/`

`AppShell.tsx` (301L) — the single chrome: sidebar (navConfig-driven, Core/More disclosure,
badges, admin/Labs entries), mobile drawer, usage/credits footer, theme toggle, CommandPalette
mount. Used by every authenticated page.

### `preview/` — the Business Website Preview Engine's render layer

`PreviewSiteRenderer.tsx` (draws a full site from a `SiteSpec`; theme tokens as scoped CSS vars),
`sections.tsx` (806L hand-built section library — "the AI supplies props… never markup"),
`motion.tsx` (234L award-site motion kit, reduced-motion + static-export safe), `scenes.tsx`
(485L scroll-scrubbed SVG trade vignettes), `ClaimBar.tsx` (public claim CTA), `AutomationIntake.tsx`
(public "describe your operations" → server-side detection). Consumers: PreviewSite (public),
RebuildPreview, FlagshipArtist (scenes' ScrollScene).

### `prospects/`

`ProspectDrawer.tsx` (274L) — the review-before-send drawer: build demo, read the actual pitch
email (subject + rendered HTML with before/after), send, mark won, skip. Consumer: Leads.

### `ui/` — the primitive kit

`index.tsx`: Button, Input, Card, Skeleton, SkeletonCard, Badge, EmptyState, **LoadError** (the
"couldn't load ≠ empty" primitive), Spinner, Ember, Modal, StatCard. `Overlay.tsx` (98L) — "THE ONE
OVERLAY": scrim, Escape (top-most only), focus trap, refcounted scroll-lock, focus return; every
modal/palette sits on it.

### `garvis/` — 72 files (55 + 17 in `canvas/`); the Garvis feature panels

Grouped by job (consumers noted where confirmed by imports):

- **Command surface**: `WakingMoment` (greeting + ≤3 evidence-backed moves), `RemindersCard`,
  `QuickStartRealEstate` (one-click flagship venture instantiation), `GenerationReadiness`
  (honest "why is nothing generating" gates), `MissionTasks` (shared with Missions).
- **Queue/approvals**: `AutonomyPanel` (trust dial: auto-approval earned after 5-clean streaks,
  capped, instantly revocable), `UndoBar` (6-second undo layer), `MarkWonInline`,
  `approvalMeta.ts` (one vocabulary for approval kinds), `BatchSendCard` (Contacts).
- **Health/clock**: `ClockStatus` (heartbeat honesty banner), `MasterSwitch` (arm heartbeat +
  ~16 server secrets visibility), `HuntReadiness` (Health, WinClients).
- **Portfolio (legacy Garvis page)**: `GoalsPanel`, `CapabilitiesPanel`, `ContentPanel`,
  `TriagePanel`, `FollowUpPanel`.
- **Studios** (mostly mounted in WorkWeb, lazily behind `PanelBoundary`): `IdeaStudio` (the ONE
  studio scaffold; `EmailStudio` is a 15-line named plug of EMAIL_SPEC), `ReelStudio` (3-stage
  short-video pipeline), `VideoStudio` (Ken-Burns storyboard + real render), `MailerDesigner`
  (6×9 print-ready postcard), `Postcard` (the render), `DeliverableStudio` (docs → md/PDF/.docx),
  `DataWorkspace` (CSV stats/charts computed in pure code, no AI), `AnsweringDesk` (grounded reply
  drafting with refusal), `PaperworkStudio` (template merge; unfilled field = refusal to send),
  `TrackerRegistry`, `FarmPanel` (412L neighborhood farming math), `MarketDataPanel` (RESO/MLS
  sync), `TimelinePanel`, `SocialPublisher` (Ayrshare via approval), `AddKnowledge`, `DocBriefPanel`,
  `AskGarvis`, `StudioChat`, `StudioHero`, `StudioPreviewFrame`, `WorkshopCard`/`WorkshopHeader`,
  `ArtifactCard` (versioned artifacts + restore), `VerdictPrompt`/`VerdictReadout` (kept-vs-rewritten
  ledger), `SavedAudits`, `StandingOrdersPanel`, `WorldGoalPanel`, `RoomsPanel` (built apps embedded
  in their business), `WorldSenderIdentities` + `AyrshareDestinations` (Settings-side identity maps),
  `FirstRunGuide`, `PanelBoundary` (per-panel error isolation), `SimVisual`, `MechanismCanvas`,
  `LabBench` (spike lab), `ClusterSpike`-side visuals.
- **`garvis/canvas/`** (17 files) — the spatial-canvas system: `StarfieldStage` (shared night
  backdrop), `CanvasScene` (center + orbiting nodes, purely presentational), `ConstellationWeb`
  (population web; any collection becomes explorable), `BranchCanvas` (the expanding spine;
  URL-driven), `CanvasChat` (docked Garvis), `ArtifactSheet` (leaf workbench), `StudioDock`,
  `MarketingCanvas` (755L wired canvas), `CreativeBoard` (607L generic spatial board shell) with
  adapters `PostcardBoard`, `SocialBoard`, `EmailBoard`, `BrandBoard`, `IdeaBoard`, plus
  `ProspectCanvas`, `SocialMock` (platform-accurate post chrome), `ContentWeekToggle` (weekly
  producer → one Queue approval). Consumers: ProfileHome, WinClients, WorkWeb, dev previews.

---

## 6. Hooks (`src/hooks/`, 21 files)

| Hook | What it does | Backend it talks to |
|---|---|---|
| `useAgentRunQuestions` | Pending build questions from agent runs; answer mutation | supabase (`lib/garvis/agentRunQuestions`) |
| `useAppProfiles` | Load/generate per-app intelligence profiles by reading the repo | supabase `garvis_app_profiles` + GitHub API + `rawComplete` (DIRECT model call, "needs no edge deploy", header) |
| `useAssets` | Project asset library; `assetsContext()` manifest injected into every build/edit | supabase storage bucket `project-assets` + manifest rows |
| `useAutopilot` | `useJobs`/`useMilestones`/`useInbox` for the background build queue + approval inbox; `tickWorker()` nudges the worker | supabase jobs tables + `job-worker` edge fn |
| `useCommander` | The Command chat brain: persistent transcript, reflexive retrieval, situation assembly, command parsing/act dispatch | supabase `command_messages` + `rawComplete` + `retrieveForPrompt`/`assembleSituation`/`runGarvisAct` |
| `useConnections` | Provider connections; `fnError` unwraps edge-fn error bodies; OAuth finish | `connections` edge fn (tokens live server-side in `provider_connections`; "this hook only ever sees sanitized status — never a token") |
| `useFollowup` | Open loops derived from active goals + repo commits + liveness; no new table | supabase + GitHub reads (`countCommitsSince`) |
| `useGarvisKnowledge` | Decisions/outcomes/lessons + approval actions | supabase `garvis_knowledge` (realtime) |
| `useGarvisObjective` | Goals, constraints (single row), capability registry + seeding | supabase + `data/capabilitySeed` |
| `useLiveness` | Pings each app's `deploy_url` (no-cors, coarse) and appends an `app_liveness` time series | browser fetch + supabase |
| `useMarketing` | The Marketing Worker: chained model calls → verified draft assets; approve-to-publish | `rawComplete` (DIRECT) + supabase campaigns/assets + `queueSocialPost` |
| `useMind` | Identity/events/beliefs/decisions + `mindContext()` digest for the Commander | supabase mind tables (realtime) |
| `useMissions` | `planMission` (planner model call) → worker-typed tasks; `runMission` dispatches Workers sequentially, human reviews plan first | `rawComplete` + supabase `garvis_missions`/`garvis_tasks` |
| `useObservability` | Mission Control rollup (doing/found/spent/changed) — read-only over existing rows | supabase (agent_runs, missions, opportunities…) |
| `useOpportunities` | One-model-call portfolio scan → deduped persisted opportunities; convert→mission | `rawComplete` + supabase `garvis_opportunities` |
| `usePortfolio` | Portfolio apps + one-time seed + GitHub sync/discover | supabase `apps` + GitHub API + `data/portfolioSeed` |
| `usePreviewClaims` | Realtime count of new "Claim this website" requests (sidebar badge) | supabase `publish_requests` (head count + realtime) |
| `useProjectData` | `useProjects`/`useProjectFiles`/`useGenerations`/`useChatMessages` — the builder's data layer, all realtime | supabase projects/files/generations/messages |
| `useProjectSecrets` | Reads the generation's secret manifest (`/supabase/.fableforge/secrets.json`); tracks provided keys. **Interim storage: localStorage per project** — "The real home is Supabase Function Secrets — the deploy step (Phase 6c) pushes them there" (header, lines 6-9) | localStorage (interim) |
| `useTriage` | One structured model call → keep/reconsider/archive verdict per app; logs an `analyze` agent_run | `rawComplete` + supabase |
| `useUnsavedGuard` | beforeunload guard while a studio holds unsaved edits | browser only |

Model-call plumbing shared by the hooks: `lib/aiClient.rawComplete` routes either **DIRECT**
(browser → provider, dev-only, keyed via Settings/`VITE_AI_*`) or through the `ai-gateway`/agent
edge functions; `lib/aiConfig` resolves provider/model/key with `VITE_AI_DIRECT` as the flag.

---

## 7. Context (`src/context/`)

- **`AuthContext.tsx`** (97L) — wraps supabase auth. Exposes `session`, `profile` (from
  `profiles` table; includes `role`, `plan`, `monthly_generation_limit`, and optionally
  `credits_balance`), `loading`, `usageThisMonth`, `configured` (env-vars present flag from
  `lib/supabase.supabaseConfigured`), and `signIn`/`signUp`/`sendMagicLink`/`signOut`/`refreshProfile`.
  Consumed by `Protected`, AppShell, and virtually every data hook.
- **`ToastContext.tsx`** (55L) — minimal toast stack (`toast(kind, message)`,
  success/error/info), rendered globally. No third-party toast lib.

Provider nesting (App.tsx:185-196): `ErrorBoundary → BrowserRouter → AuthProvider → ToastProvider →
AppRoutes` (with an inner per-route ErrorBoundary keyed on pathname).

---

## 8. Types & Data

### `src/types/index.ts` (~60 exports) — clearly split into the two halves

- **FableForge**: `Plan`, `Role`, `Profile`, `Project`, `ProjectFile`, `FileVersion`,
  `GenerationStatus`/`StageEntry`/`Generation` (the 11-stage pipeline record), `AIMessage`,
  `EditPlan`, `Subscription`, `UsageEvent`, `Deployment`, `Template`, and the Autopilot job set
  (`JobStatus`, `Job`, `JobMilestone`, `AgentQuestion`).
- **Garvis**: `AppStage`, `StrategicImportance`, `PortfolioApp`, `AppMetric`,
  `AgentRunStatus`/`AgentRun`, `GarvisCheckpoint`, knowledge (`KnowledgeKind`/`Status`,
  `GarvisKnowledge`), objectives (`GoalStatus`, `RiskLevel`, `GarvisGoal`, `GarvisConstraints`),
  capabilities (`CapabilitySafety`, `CapabilityMaturity` = `'stub' | 'draft' | 'working' |
  'production'`, `GarvisCapability`), opportunities (`OpportunityType`/`Status`,
  `GarvisOpportunity`), missions (`WorkerKind`, `MissionStatus`, `TaskStatus`, `GarvisMission`,
  `GarvisTask`, `TaskArtifact`/`TaskResultData`), marketing (`MarketingAssetKind`/`Status`,
  `MarketingCampaign`, `MarketingAsset`), `AppLiveness`, `GarvisAppProfile`, and the Mind set
  (`MindEvent`, `BeliefStatus`, `MindBelief`, `MindDecision`, `IdentitySlot`, `MindIdentityDoc`).

Domain-specific types beyond this live next to their logic in `src/lib/garvis/*` (e.g.
`ProspectStage` in `prospects/stage.ts`, `SiteSpec` in `preview/spec.ts`).

### `src/data/`

- `templates.ts` — 8 NewProject starter templates (SaaS dashboard, CRM, …), each a full generation prompt.
- `portfolioSeed.ts` — the real repos under `github.com/Rnocek14` seeded into the portfolio on
  first run; *"Stages/revenue are first-guess placeholders — edit them in the dashboard once real
  numbers land"* (line 3).
- `capabilitySeed.ts` — curated capability registry baseline; *"Maturity is HONEST: most are
  stub/draft because the apps aren't fully built"* (lines 3-5).
- `clusterSamples.ts` — three canned transcripts (clean physics rabbit hole / messy work session /
  jumpy session) that are the clustering spike's acceptance fixture.

---

## 9. Frontend TODO / flag / placeholder inventory

**Headline: there are zero `TODO`, `FIXME`, `HACK`, or `XXX` markers anywhere in `src/`**
(`grep -rnE 'TODO|FIXME|HACK|XXX' src` over .ts/.tsx returns nothing). The codebase instead
carries intent in long doctrine comments; the honest gaps are flagged with words like "stub",
"interim", "placeholder", "v1", "legacy". Complete inventory of those:

### Real stubs / interim implementations

| Location | What | Evidence |
|---|---|---|
| `src/pages/ProjectWorkspace.tsx:913-914` | Deploy trigger is a stub | "INTEGRATION: swap this stub for a real Vercel/Netlify deploy hook call. The record + status UI below is production-ready; only the trigger is stubbed." |
| `src/pages/Billing.tsx:72` | Billing stub mode without Stripe | "No payment method on file — this instance runs in stub mode until Stripe is connected." (also `.env.example`: "billing runs in stub mode without these") |
| `src/hooks/useProjectSecrets.ts:6-9` | Secret values held in localStorage as an interim measure | "The real home is Supabase Function Secrets — the deploy step (Phase 6c) pushes them there and they should be cleared locally afterward." |
| `src/pages/dev/FlagshipArtist.tsx:43` | Placeholder copy pending the client's real words | "placeholder copy to be replaced with the artist's own words and inbox." |
| `src/data/portfolioSeed.ts:3` | Seeded stages/revenue are first-guess placeholders | quoted above |
| `src/data/capabilitySeed.ts:3-5` | Most seeded capabilities are `stub`/`draft` maturity by design | quoted above; `CapabilityMaturity` literally includes `'stub'` (types/index.ts:269) |
| `src/pages/ClientBilling.tsx:4-5` | v1 fulfils with operator-created Stripe Payment Links; "the automated Checkout path layers on later" | header comment |
| `src/pages/BookingSetup.tsx:193` | Timezone handling is fixed-offset v1 | "DST-era values — v1 is fixed-offset by design." |
| `src/pages/OpportunityFeed.tsx:5-6` | Application Composer not built yet | "The Application Composer (next engine) will attach 'draft the application' right here." |
| `src/components/ConnectionsHub.tsx:4` | Token paste today, OAuth later | "today you paste a token; later a 'Connect' button does OAuth." |

### Feature flags / build-time switches

| Flag | Where | Effect |
|---|---|---|
| `import.meta.env.DEV` | `App.tsx:162-171` | Gates 9 of the 10 `/dev/*` routes out of production builds; **`/dev/flagship-artist` is deliberately (or accidentally) ungated** (App.tsx:167). |
| `VITE_AI_DIRECT` (+ `VITE_AI_PROVIDER/MODEL/API_KEY`, `VITE_LOCAL_AI_BASE_URL`) | `lib/aiConfig.ts:127-130`, `.env.example` | Browser-direct model calls for local dev; ".env.example: NEVER ship a build with these set." |
| `supabaseConfigured` | `lib/supabase.ts:9-20` | Missing env → console warning + `configured:false` surfaced through AuthContext (Auth page shows setup notice). |
| `profile.role === 'admin'` | `App.tsx:81`, `AppShell.tsx:148,188` | Gates `/admin` route + Admin nav + Labs section (`/garvis/explore`). |
| `agentAvailable` | `lib/agent/loop` via ProjectWorkspace | Agentic verify-and-fix only when a capable provider is configured. |
| localStorage keys | `ff:sidebar-collapsed` (AppShell:66), `ff:oauth` (OAuthCallback), `dev:rebuild-spec` (RebuildPreview) | Persistence/injection seams. |

### Mock / sample data (all confined to dev pages + deliberate UI mimicry)

- `pages/dev/*` — every file mounts real components on sample data and says so in its header
  ("mock materials", "illustrative, not real data", "Not linked anywhere"): BoardPreview mock
  materials (lines 1784-1793), WorkshopsPreview `MOCKS` (line 2065ff), StudiosPreview mock
  `StudioCtx`, WebPreview sample `NODES`, WinHubPreview sample counts, ProfileHomePreview
  `stubSend` canned chat (line 1870) + sample tree, ProspectWebPreview sample `SiteAudit`,
  RebuildPreview injected spec.
- `components/garvis/canvas/PostcardBoard.tsx:41` — `materialsOverride` prop exists solely so
  "dev preview injects mock materials".
- `components/garvis/canvas/SocialMock.tsx` — named "Mock" but is a production component: renders a
  post in each platform's real chrome (not placeholder data).

### Legacy-but-alive surfaces (intent-explaining comments)

- `/garvis`, `/garvis/control`, `/garvis/missions`, `/garvis/marketing`, `/garvis/opportunities`,
  `/garvis/mind`, `/garvis/brain` — routable, sidebar-invisible, reachable only via ⌘K aliases
  explicitly labeled "(legacy)" (CommandPalette.tsx:84-91). Doctrine: "merge and relocate, never
  amputate" (Memory.tsx:5-7); "Old doors redirect" (App.tsx:119-120).
- AppShell.tsx:26 records a fixed bug: "the /spike/clusters route was folded into /garvis/explore —
  the old link bounced to Landing."

### Recurring intent-comment idioms worth knowing when reading this codebase

- **"No-Theater"** — UI motion/claims must map to real recorded state (Universe/System/SimVisual headers).
- **"honest / honestly"** — pervasive: failed loads must not render as empty (`LoadError`,
  Contacts.tsx:429-431, Health.tsx:566-567, Working.tsx:9-10); unknown values say unknown; nothing
  green it can't prove (ClientReadiness.tsx:3-4).
- **"design review P0/P1/P2" / "app_00NN"** — comments cite the internal review items and numbered
  app-capability IDs that motivated each change (e.g. ONE QUEUE P0, ONE MEMORY P2, universal search
  app_0053, trust dial app_0097).
- **`*.verify.ts`** — pure-logic self-tests run by `npm run verify:*`; they are the "tests" of the
  lib layer (frontend components/pages have the Playwright e2e sweep instead).

---

## Appendix: quick counts

- Route entries in App.tsx: **66** (60 rendering + 5 redirects + 1 wildcard; `PreviewSite` mounted twice).
- Page files: **63** (48 top-level, 1 admin, 10 dev, 4 spike); 5 of them have no route of their own (embedded).
- Nav destinations: 30 in navConfig (Core 4 · Prospecting 3 · Build 5 · Money 2 · Automation & status 7 · Knowledge 3 · Apps 4 · Account 2) + 2 admin-only (Admin, Labs) + 16 ⌘K aliases.
- Components: 11 root + chat 3 + clients 1 + editor 8 + garvis 72 (incl. canvas 17) + layout 1 + preview 6 + prospects 1 + ui 2 = **105 files**.
- Hooks: **21**. Contexts: **2**. Data seeds: **4**. Shared types: ~60 exports.
- Supabase edge functions: **67** (+ `_shared`). Migrations: **125**. E2E suites: **4**.
- TODO/FIXME/HACK/XXX markers in `src/`: **0**.
