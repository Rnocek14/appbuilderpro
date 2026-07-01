# Cloud Panel — Lovable-Cloud-style in-app backend (spec)

Goal: bring the *feel* of Lovable Cloud (see your data, manage secrets, watch your backend) into FableForge,
built on the connection infra we already have (C1–C3): the user's Supabase OAuth token in
`provider_connections` + the app's `projects.supabase_project_ref`. No managed-hosting pivot required for
these — they're UI over the Supabase Management API we already call.

## Phases
- **CP1 — Database viewer (this build).** `db-console` edge fn (auth + project-owner; runs SQL against the
  app's provisioned project via Management API `/database/query` using the user's OAuth token). Actions:
  `tables` (list public tables), `rows` (paged select of a table), `query` (run arbitrary SQL — it's the
  user's own DB). Client `DataPanel`: table list → row grid (paged) + a SQL runner. Opened from a header
  "Data" button. View-only rows + SQL runner in v1 (row editing = CP2).
- **CP2 — Row editing** (inline edit/insert/delete with per-column typed, escaped UPDATEs).
- **CP3 — Secrets manager UI** — extend the Connections/secret store into a full add/rotate/view-status
  manager for backend keys (Stripe/Resend/OpenAI).
- **CP4 — Monitoring** — function logs + recent errors + request activity (Management API logs endpoints).
- **CP5 — Backups** — list/restore daily backups (Management API; paid Supabase tiers).

## The one thing that stays a business decision
**Fully-managed provisioning** (FableForge operates the backend under its own account, so users need no
Supabase account — the true "Lovable Cloud") = data custody + cost + compliance. The features above make
it *feel* managed without that pivot; the pivot is a separate, deliberate product/infra choice.

## Security
`db-console` runs with the user's OWN Supabase token against their OWN project (owner-checked). Table names
sanitized for the `rows` action; arbitrary SQL is only ever run against the caller's own database.

## Verify
`deno check db-console`; app tsc + build; live: open Data → see the app's tables → view rows → run a SQL
query. Requires the app to have a provisioned DB (Set up database) first.
