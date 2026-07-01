-- app_0016_managed_cloud.sql
-- Tiered provisioning: an app's database is either in the USER's own Supabase org (they connected via
-- OAuth) or managed under FABLEFORGE's org ("FableForge Cloud" — no user Supabase account). This flag
-- records which, so the deploy/console functions pick the right Management token (user OAuth vs platform).
alter table public.projects add column if not exists supabase_managed boolean not null default false;
