-- FableForge PLATFORM migration (not a generated-app migration).
-- Garvis APP-INTELLIGENCE layer — a durable, regenerable PROFILE per portfolio app:
--   * garvis_app_profiles — what each product IS (purpose/audience/business model),
--     where it stands (current state), what's blocking it, and the single next milestone.
--
-- Why this exists:
--  * Garvis apps are EXTERNAL GitHub repos, not FableForge `projects`, so they have no
--    project_files for the Brain/Map/Next/Check generators to read. The brain was reasoning
--    mostly off commit messages + "No description yet". This gives it product-level context.
--  * A profile is a GENERATED FACT (derived from the repo), not a durable judgment — so, unlike
--    garvis_knowledge, it is NOT approval-gated. It is regenerable and carries generated_at so
--    staleness is visible. One row per app (unique app_id), upserted on regeneration.
--  * Reuses app_0003's security model (owner_id + auth.uid() RLS, is_admin() read, touch_updated_at).
--    Additive + idempotent. Run AFTER app_0003.

-- ---------- garvis_app_profiles (one per app) ----------
create table if not exists public.garvis_app_profiles (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  app_id        uuid not null references public.apps(id) on delete cascade,
  purpose          text,  -- what the product does
  audience         text,  -- who it serves
  business_model   text,  -- how it could make money (or "none / learning project")
  current_state    text,  -- honest read of where it actually stands
  blocker          text,  -- the top thing blocking progress
  next_milestone   text,  -- the single most useful next milestone
  stage_assessment text,  -- Garvis's read of the real stage, vs the app row's stored stage
  confidence    numeric(3,2),       -- 0..1, the model's honest read of profile reliability
  source        text,               -- what evidence it was built from (e.g. 'readme+commits+issues')
  model         text,               -- which model generated it
  generated_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (app_id)
);
create index if not exists idx_app_profiles_owner on public.garvis_app_profiles(owner_id);

-- ---------- keep updated_at fresh (reuses touch_updated_at from app_0003) ----------
drop trigger if exists trg_app_profiles_touch on public.garvis_app_profiles;
create trigger trg_app_profiles_touch before update on public.garvis_app_profiles
  for each row execute function public.touch_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (mirrors app_0003's owner-scoped model)
-- ============================================================
alter table public.garvis_app_profiles enable row level security;

drop policy if exists "garvis_app_profiles owner all" on public.garvis_app_profiles;
create policy "garvis_app_profiles owner all" on public.garvis_app_profiles
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "garvis_app_profiles admin read" on public.garvis_app_profiles;
create policy "garvis_app_profiles admin read" on public.garvis_app_profiles for select using (public.is_admin());

-- ---------- realtime ----------
do $$ begin
  alter publication supabase_realtime add table public.garvis_app_profiles;
exception when duplicate_object then null; end $$;
