-- FableForge PLATFORM migration (not a generated-app migration).
-- Garvis SENSES layer — app_liveness: the first automatic OUTCOME signal Garvis gets.
--   * app_liveness — an append-only time series of "is this deployed app actually reachable?"
--
-- Why this exists:
--  * Until now Garvis reasoned over STATE (repos, profiles) but was blind to OUTCOMES. app_metrics
--    (visitors/signups/revenue) is only ever populated by hand, so in practice it's empty. Liveness is
--    the cheapest real signal we can gather automatically: ping each app's deploy_url from the browser.
--  * Deliberately SEPARATE from app_metrics: liveness is operational status, not a business metric.
--    (Same "don't overload" discipline that kept profiles out of garvis_knowledge.)
--  * Append-only (one row per check) so the brain can see a trend ("went down 3 days ago"), not just now.
--  * Browser pings are CORS-blind (no-cors), so `reachable` means "the host responded with something",
--    NOT "returned HTTP 200". Honest coarse signal. Reuses app_0003's RLS + is_admin().
--    Additive + idempotent. Run AFTER app_0003.

create table if not exists public.app_liveness (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  app_id      uuid not null references public.apps(id) on delete cascade,
  checked_at  timestamptz not null default now(),
  reachable   boolean not null,
  status      text,              -- 'reachable' | 'unreachable' | 'timeout'
  latency_ms  integer,           -- round-trip ms when reachable, else null
  source      text not null default 'browser'
);
create index if not exists idx_liveness_app on public.app_liveness(app_id, checked_at desc);
create index if not exists idx_liveness_owner on public.app_liveness(owner_id, checked_at desc);

-- ============================================================
-- ROW LEVEL SECURITY (mirrors app_0003's owner-scoped model)
-- ============================================================
alter table public.app_liveness enable row level security;

drop policy if exists "app_liveness owner all" on public.app_liveness;
create policy "app_liveness owner all" on public.app_liveness
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "app_liveness admin read" on public.app_liveness;
create policy "app_liveness admin read" on public.app_liveness for select using (public.is_admin());

-- ---------- realtime ----------
do $$ begin
  alter publication supabase_realtime add table public.app_liveness;
exception when duplicate_object then null; end $$;
