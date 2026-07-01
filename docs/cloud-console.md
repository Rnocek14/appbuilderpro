# FableForge Cloud Console — parity analysis + plan (manage the backend in-app)

Goal: manage everything about an app's backend **inside FableForge** (like Lovable's "Cloud" tab), not
by going to Supabase. All of it is UI over the Supabase **Management API** + SQL, using the per-project
token we already resolve (`projectSupabaseToken`, managed-or-own).

## Lovable Cloud's in-app surface (the parity target)
Lovable's Cloud tab: **Database** (view/edit/organize records, no SQL) · **Backups** (daily, ~14d, restore)
· **Auth** (users) · **Storage** (files) · **Edge Functions** · **Secrets** (view/rotate) · **Logs /
real-time monitoring** (errors, events) · **Usage** analytics.

## Parity map (FableForge today → target)
| Area | FableForge now | Target |
|---|---|---|
| Database — browse rows / SQL | ✅ DataPanel (read + SQL runner) | keep |
| Database — **edit/insert/delete rows** | ❌ | **CC1 (this build)** |
| Database — create/alter tables | ❌ (SQL runner only) | CC2 |
| **Secrets** manager (list/add/rotate) | ~ popup only | **CC3** (Management API `/secrets`) |
| **Auth** — view/manage users | ❌ | CC4 (SQL on `auth.users` / Auth admin API) |
| **Storage** — buckets/files | ❌ | CC5 |
| **Edge Functions** — list + **logs** | deploy only | CC6 (`/functions`, logs endpoint) |
| **Logs / monitoring** | ❌ | CC7 (Management analytics/logs endpoints) |
| **Backups** — list/restore | ❌ | CC8 (`/database/backups`) |
| **Usage** analytics | ~ AI spend only | CC9 |

## Architecture
Extend the existing `db-console` into a **`cloud-console`** edge function (auth + project-owner +
`projectSupabaseToken`) that proxies Management-API/SQL actions per tab. The `DataPanel` becomes a tabbed
**Cloud Console** (Database · Secrets · Auth · Storage · Functions · Logs · Backups). Each tab = a few
read/write actions on the shared edge fn. Managed and user-owned projects both work (token abstracts it).

Safety: all SQL identifiers validated (`^[A-Za-z0-9_]+$`) + values escaped via a literal formatter;
writes gated to tables with a primary key; everything runs against the caller's own project only.

## Phases
- **CC1 — Row editing (this build):** `update` / `insert` / `delete` actions in the console (safe SQL) +
  DataPanel inline cell edit, add-row, delete-row (tables with an `id`).
- **CC2** table create/alter · **CC3** Secrets manager · **CC4** Auth users · **CC5** Storage ·
  **CC6** Functions+logs · **CC7** Logs/monitoring · **CC8** Backups · **CC9** Usage.

## Separate backbone — shared free tier (S1, from docs/hybrid-db.md)
So free users don't cost per-app: a `data-api` edge fn serving many apps from ONE shared project, each
isolated by schema + server-side scoping. Built as its own verifiable phase (isolation test: app A can't
read app B). Pro apps keep the dedicated project (built).

## Verify (per phase)
`deno check` the edge fn + app tsc/build; live: edit a row in the Data tab and see it change; manage a
secret; view users/logs — all without opening the Supabase dashboard.
