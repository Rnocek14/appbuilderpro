# Legendary Roadmap — closing the last gaps to be clearly better than Lovable

The build engine is now at/ahead of Lovable (verification, knowledge, backend integrations + deploy).
The remaining gaps are the **productized surface** + **autonomy**. This roadmap covers all four, in
phases, each independently shippable and verifiable (app `tsc`+`vite build`, `deno check`, verify suites).

Existing scaffolding to build on: a `deployments` table + `Deployment` type (`src/types`), a stub
`recordDeployment(target)` (`ProjectWorkspace.tsx:641`), the WebContainer runner (`src/lib/webcontainer.ts`)
which can `npm run build`, and the server-side Management-API proxy pattern
(`apply-migration` / `deploy-backend`) for holding tokens out of the browser.

---

## Phase 7 — One-click hosting (the #1 gap: ship a live URL)
**Goal:** a "Publish" button that builds the app and deploys it to a real host, returning a live URL —
what Lovable does and FableForge currently stubs.

**Architecture (Netlify first, provider-pluggable):**
- BUILD happens in the WebContainer (only place with real Node): add `runBuild(projectId)` to
  `webcontainer.ts` — `wc.spawn('npm', ['run','build'])`, then read the `dist/` tree from the container
  FS (`wc.fs.readdir`/`readFile`) into `{ path, bytes }[]`. Surface a build status on RunnerState.
- DEPLOY server-side: new edge function `deploy-site/index.ts` (mirrors `deploy-backend` auth: requires
  the authenticated owner of `projectId`). Holds a Netlify token (`NETLIFY_AUTH_TOKEN` edge secret, or a
  per-project token row). Uses Netlify's **file-digest deploy**: `POST /api/v1/sites` (create once, store
  `site_id` on the project) → `POST /sites/{id}/deploys` with `{ files: { '/path': sha1 } }` → upload each
  required file (`PUT /deploys/{id}/files/{path}`) → poll until `state==='ready'` → return `ssl_url`.
- CLIENT: `publishSite(projectId)` in `ProjectWorkspace` → `runBuild` (WebContainer) → send the dist
  files to `deploy-site` → record a `deployments` row (status live/url) → show the live link. Replaces the
  `recordDeployment` stub.
- CONNECT UX: a "Connect hosting" panel (mirrors the Supabase connect modal) to set the Netlify token
  (stored as the edge secret via the existing Management-API path, or a `host_tokens` row).
- Vercel as a second provider behind the same `deploy-site` interface (provider field on the request).
**Files:** `src/lib/webcontainer.ts` (runBuild + dist read), `supabase/functions/deploy-site/index.ts`
(new), `src/pages/ProjectWorkspace.tsx` (publish flow + deploy modal), `migrations` (add `site_id`/host
fields to projects or a `host_connections` table).
**Verify:** app build green; `deno check deploy-site`; runtime (live, needs a Netlify token): Publish →
build runs → returns an https URL that loads the app.

## Phase 8 — Security hardening
**Goal:** production-grade secret handling + close the latent authz gap.
- **8a Secrets at rest (Supabase Vault):** stop holding raw keys in localStorage. Store provided secrets
  encrypted via Supabase Vault (`vault.create_secret`) keyed per project, OR a `project_secrets` table
  with `pgsodium`/Vault. `deploy-backend` reads them server-side at deploy time. The client only ever
  holds a key transiently in the input until "Save" posts it to a `set-secret` edge function (auth+owner
  guarded). Update `useProjectSecrets` to reflect set/deployed state from the server, not localStorage.
- **8b apply-migration authz:** ✅ DONE — `apply-migration/index.ts` now carries the same
  `auth.getUser()` + `projects.owner_id === user.id` ownership check `deploy-backend` has (see the AUTHZ
  block at the top of the handler). The confused-deputy gap on the full-scope Management token is closed.
- **8c Verify the Management-API deploy** (`/functions/deploy` multipart shape, `/secrets`) against a live
  project; adjust field names if the API differs. Add a `config.toml` setting verify_jwt per function.
**Files:** `supabase/functions/{apply-migration,deploy-backend,set-secret}/index.ts`, a Vault migration,
`src/hooks/useProjectSecrets.ts`, `supabase/config.toml`.
**Verify:** `deno check`; app build; runtime: a key saved → encrypted row/Vault entry, never in the bundle.

## Phase 9 — GitHub export + cross-file search
- **9a GitHub export:** a "Export to GitHub" action. New edge function `github-export/index.ts` (auth+owner)
  using a user-provided GitHub token (OAuth or PAT): create/locate a repo, commit the project's files via
  the Git Data API (create blobs → tree → commit → update ref). Record the repo URL on the project. Connect
  UX mirrors the hosting/Supabase connect panels.
- **9b Cross-file search:** a project-wide code search (client-only, no backend) — a command-palette / panel
  that greps the loaded `files` (path + content), shows ranked matches with line context, click → open the
  file at the line in the editor. Pure React over the existing `useProjectFiles` data; debounced.
**Files:** `supabase/functions/github-export/index.ts` (new), `src/pages/ProjectWorkspace.tsx` +
a `src/components/editor/SearchPanel.tsx` (new), connect UX.
**Verify:** app build; `deno check github-export`; cross-file search is fully verifiable in-app.

## Phase 10 — Autonomy (the original Phase 5)
**Goal:** the autopilot stops being greedy/ephemeral and the autonomous layer can actually build.
- **10a Durable plan/DAG:** persist a task list (reuse `garvis_tasks` or a `project_plan` table) instead of
  re-deriving one step at a time in `decideNextStep`. Track per-task status; the loop walks the plan.
- **10b "done" = verified:** a step is complete only when QA (incl. the cross-file export check) is clean
  AND (Full-build) `tsc` is green — not a prompt vibe-check. Stop marking done while errors remain
  (`autopilot.ts`).
- **10c Garvis→build bridge:** let a Garvis mission's builder worker enqueue real autopilot build steps
  against a project (today workers only emit markdown). A small adapter from mission task → `sendEdit`/the
  autopilot loop.
- **10d (stretch) Edge-mirror the DIRECT-only intelligence** (roadmap/ideation/autopilot) so autonomy runs
  in production, not just DIRECT mode.
**Files:** `src/lib/autopilot.ts`, `src/lib/garvis/{workers,mission,runtime}.ts`, `src/lib/aiClient.ts`
(decideNextStep), a plan-table migration.
**Verify:** app build; verify suites; runtime (DIRECT): autopilot follows a persisted plan and never marks
a step done with type/QA errors.

---

## Sequencing (front-load verifiable wins, then provider-dependent)
1. **8b** apply-migration authz (tiny, `deno check`able) — close the security gap now.
2. **9b** cross-file search (self-contained, fully verifiable in-app).
3. **7** one-click hosting (biggest gap; provider-dependent runtime — build the full path, smoke-test live).
4. **8a/8c** Vault secrets + verify deploy.
5. **9a** GitHub export.
6. **10** autonomy.
Each phase ends green on `tsc`/`vite build`/`deno check` + its verify; provider-dependent runtime steps are
flagged for a live smoke-test (no tokens available in this environment).
