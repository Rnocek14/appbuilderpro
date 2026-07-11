# The Deploy Executor — approved deploys actually ship

*The last gap between "Garvis proposes" and "Garvis does it end to end" for the build pillar. Before
this, an approved `deploy_site` in the queue recorded a `skipped` ledger row — the approval spine
had a real executor only for `send_email`. Now a deploy through the queue genuinely publishes and the
live URL flows back everywhere. Done honestly, around the one real constraint: the site build runs in
the browser (WebContainer), so there is no server-side build.*

## The architecture (capture at authorization, execute on approval)

Because the built `dist/` only exists in the browser at build time, the honest way to route a deploy
through the approval spine is to **capture the built bundle when it exists** and execute it when
approved:

1. **`requestSiteDeploy`** (deployRun.ts) — after a client build, the real built files are stored in
   `deploy_bundles` (app_0040, owner RLS, real bytes) and a `deploy_site` approval is enqueued
   referencing the bundle. Nothing has shipped yet.
2. **`approveAndExecute` → `executeSiteDeploy`** (execution.ts) — on approval, loads the bundle, calls
   the `deploy-site` edge function (Netlify token stays server-side), captures the live https URL, and:
   - records a `deployments` row (live),
   - stamps the approval `result` with `{executed: true, url, site_id}`,
   - updates the world's `website-app` artifact to the live URL,
   - writes the `execution_runs` ledger row (`ok`, with the URL) and a `mind_event`,
   - deletes the one-shot bundle.
   The result carries the URL so the UI can open it.

## The two entry points, one honest path

- **Workspace "Publish"** (ProjectWorkspace) now routes through `publishThroughSpine`: build → capture
  → record the approval → execute it immediately (your click *is* the approval). Same instant-publish
  feel as before, but now every deploy is a real, ledgered pass through the one spine — not a
  side-channel.
- **A queued `deploy_site` approval** (e.g. one Garvis proposed from a studio) — approving it runs the
  same executor. If it carries a captured bundle, it deploys for real and opens the live URL. If it has
  **no** bundle (Garvis proposed a deploy but no build was captured), the executor is honest: it records
  a `skipped` row with an actionable reason and the Approvals page routes you to the project to Publish
  (where the build runs). No fake deploy, ever.

## Honesty invariants held

- The ledger reflects reality: `ok` + URL on a real deploy, `failed` + the provider error on failure,
  `skipped` + "open the project and Publish" when there's no build to ship. Never a success that didn't
  happen.
- Owner-scoped throughout (bundle RLS, deploy-site verifies project ownership, the token is the user's
  own or a server secret — never another user's).
- `deploy_backend` and `publish_post` still record honestly (they'd need the same bundle-capture, which
  is the natural next extension of this pattern).

## Deploy

- `supabase db push` (app_0040).
- `supabase functions deploy deploy-site` (already in `functions:deploy`) + `NETLIFY_AUTH_TOKEN`
  (or the user pastes their own Netlify token in the Publish dialog).
