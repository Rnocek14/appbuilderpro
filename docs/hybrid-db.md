# Hybrid database model — shared free tier + dedicated pro (spec)

Goal: let users create MANY apps cheaply (free) while offering full isolation (pro). Chosen model:
- **Free tier → shared:** many apps in a small number of operator-owned Supabase projects, each app isolated.
- **Pro tier → dedicated:** an app gets its own Supabase project (managed under our org, or the user's via OAuth). **← already built** (`provision-supabase`, `supabase_managed`).

## The honest catch with "shared"
A single Supabase project hands out ONE public `anon` key. Postgres schemas alone do NOT isolate tenants
when everyone shares that anon key — any app could target another app's schema via `.schema()`. So
"schema-per-app + anon key" is **not safe** on Supabase's model without more. Two safe designs:

### Option S1 — Edge-mediated data API (recommended, safe)
Generated apps do NOT get the shared project's anon key. Instead their `db.ts` calls a FableForge
`data-api` edge function that: authenticates the app + end-user, then runs the query against the shared
DB with the service role, **scoping every operation to that app's schema + the user**. Isolation is
enforced server-side; the shared key never leaves the server. Cost: near-fixed (one project, N apps).
Downside: generated apps depend on FableForge's data API (a platform lock-in) and we own that hot path.

### Option S2 — Project pooling (simpler, coarser)
Don't share within a project; instead pool: keep a warm pool of operator projects and hand each app its
own project, but **reuse/recycle** projects (e.g., a project per N apps by schema OR recycle on delete)
to stay under limits. Simpler security (still project-per-app-ish) but doesn't truly break the per-project
cost/limit — only softens it. Not real "unlimited free."

**Recommendation: S1 (edge-mediated) for the free tier.** It's the only design that gives genuinely
unlimited cheap apps with real isolation. It's a substantial subsystem (a scoped data-api edge fn + a
generated `db.ts` that targets it + schema-scoped migrations), so it should be built + live-verified on
its own, not rushed.

## Tier routing
- `projects.tier` ('free' | 'pro') — free → shared (S1), pro → dedicated (existing `provision-supabase`).
- Provision branches on tier: free → create schema `app_<id>` in the shared project + register it with the
  data-api; pro → the existing dedicated flow.
- "Upgrade to dedicated" = provision a dedicated project + migrate the app's schema data into it, flip tier.

## Sequence (recommended)
1. **Fix OAuth scopes** (dashboard) → verify the **dedicated** path live (it works today). ← do this first.
2. Build **S1 shared tier** as a focused, verifiable phase: `data-api` edge fn (scoped CRUD/SQL against
   the shared project) + schema-per-app provisioning + a generated `db.ts` that routes through it +
   schema-scoped migration application.
3. **Upgrade/downgrade** flow between tiers.

## Verify
Dedicated: fix scopes → "Set up database" → project created → Data viewer shows tables. Shared (S1):
create a free app → schema provisioned → app reads/writes only its own data through data-api → a second
app cannot reach the first's rows.
