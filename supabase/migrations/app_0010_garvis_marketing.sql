-- FableForge PLATFORM migration (not a generated-app migration).
-- Garvis DO-LAYER — the first WORKER that produces real deliverables: the Marketing Worker.
--   * marketing_campaigns — a marketing mission: a brief + subject (a portfolio app OR an external
--     thing like "my mom's real-estate business"), with a status lifecycle.
--   * marketing_assets    — the produced deliverables (strategy / calendar / social_post / email /
--     landing_page), each with its OWN draft → approved → scheduled → published lifecycle, a target
--     channel, and the Verifier's acceptance result. This table is also the approve-to-publish QUEUE.
--
-- Design notes:
--  * app_id is nullable — Garvis can market something that isn't in the portfolio (the "mom's
--    business" case). `subject` carries the human description either way.
--  * content is jsonb (kind-specific shape) so one table holds every asset kind.
--  * The autonomy ladder lives in `status` + `channel`: assets are generated as drafts (writes_data,
--    reviewable); publishing (external_action) only happens on explicit approval. Reuses app_0003 RLS.
--    Additive + idempotent. Run AFTER app_0003.

do $$ begin create type marketing_asset_kind as enum ('strategy','calendar','social_post','email','landing_page');
exception when duplicate_object then null; end $$;
do $$ begin create type marketing_asset_status as enum ('draft','approved','scheduled','published','rejected');
exception when duplicate_object then null; end $$;
do $$ begin create type marketing_campaign_status as enum ('generating','review','active','done','failed');
exception when duplicate_object then null; end $$;

create table if not exists public.marketing_campaigns (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  app_id      uuid references public.apps(id) on delete set null,  -- null = external subject
  subject     text not null,            -- what we're marketing (app name or "mom's real-estate business")
  brief       text,                     -- the founder's brief / goal for this campaign
  status      marketing_campaign_status not null default 'generating',
  summary     text,                     -- the strategy one-liner once generated
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_campaigns_owner on public.marketing_campaigns(owner_id, created_at desc);

create table if not exists public.marketing_assets (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  campaign_id   uuid not null references public.marketing_campaigns(id) on delete cascade,
  kind          marketing_asset_kind not null,
  title         text,
  content       jsonb not null default '{}'::jsonb,  -- kind-specific shape
  channel       text,                                -- 'manual' | 'email' | 'x' | 'linkedin' | null
  status        marketing_asset_status not null default 'draft',
  scheduled_for timestamptz,
  published_at  timestamptz,
  verify        jsonb,                               -- the Verifier's acceptance result {ok, issues, warnings}
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_assets_campaign on public.marketing_assets(campaign_id, kind);

-- ---------- keep updated_at fresh (reuses touch_updated_at from app_0003) ----------
drop trigger if exists trg_campaigns_touch on public.marketing_campaigns;
create trigger trg_campaigns_touch before update on public.marketing_campaigns
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_assets_touch on public.marketing_assets;
create trigger trg_assets_touch before update on public.marketing_assets
  for each row execute function public.touch_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (mirrors app_0003's owner-scoped model)
-- ============================================================
alter table public.marketing_campaigns enable row level security;
alter table public.marketing_assets    enable row level security;

drop policy if exists "marketing_campaigns owner all" on public.marketing_campaigns;
create policy "marketing_campaigns owner all" on public.marketing_campaigns
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "marketing_campaigns admin read" on public.marketing_campaigns;
create policy "marketing_campaigns admin read" on public.marketing_campaigns for select using (public.is_admin());

drop policy if exists "marketing_assets owner all" on public.marketing_assets;
create policy "marketing_assets owner all" on public.marketing_assets
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "marketing_assets admin read" on public.marketing_assets;
create policy "marketing_assets admin read" on public.marketing_assets for select using (public.is_admin());

-- ---------- realtime ----------
do $$ begin alter publication supabase_realtime add table public.marketing_campaigns; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.marketing_assets; exception when duplicate_object then null; end $$;
