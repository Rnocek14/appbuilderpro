-- app_0071_reel_jobs.sql — THE REEL FACTORY data model. A content_growth studio turns a niche idea
-- into a multi-scene vertical reel: one reel_job holds the storyboard; one reel_clip per scene is the
-- async generation job the clip engine (Sora/Runway/Luma) fills. Nothing here posts — a finished reel
-- rides the existing social_posts + approval spine, and every post carries the platform made-with-AI
-- label. Owner RLS on both tables; world/cluster pinned when set. Additive + idempotent.
--
-- HONESTY: reel_jobs.ai_generated is set true at creation and is the IMMUTABLE provenance the label
-- derives from — the whole content_growth carve-out (AI footage is honest here) rests on it being
-- true and on the label being applied, so it is not a settable publish-time flag.

create table if not exists public.reel_jobs (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  world_id       uuid references public.knowledge_worlds(id) on delete set null,
  cluster_id     uuid references public.knowledge_clusters(id) on delete set null,  -- the content_growth studio area
  account_id     uuid,                            -- which faceless account this reel is for (roster lands in a later slice)
  title          text not null default '',
  hook           text not null default '',
  storyboard     jsonb not null default '{}'::jsonb,   -- the full ReelStoryboard {hook, scenes:[{prompt,caption,vo}]}
  ai_generated   boolean not null default true,        -- immutable provenance — the made-with-AI label derives from this
  status         text not null default 'draft'
                   check (status in ('draft', 'generating', 'assembling', 'ready', 'failed')),
  assembled_url  text,                            -- the final vertical mp4 once assembled (render seam)
  error          text,
  created_at     timestamptz not null default now()
);
alter table public.reel_jobs enable row level security;
drop policy if exists "reel_jobs owner all" on public.reel_jobs;
create policy "reel_jobs owner all" on public.reel_jobs
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (world_id is null or exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid()))
  );
create index if not exists idx_reel_jobs_owner on public.reel_jobs(owner_id, created_at desc);
create index if not exists idx_reel_jobs_world on public.reel_jobs(world_id, created_at desc);

-- One generation job per scene. owner_id is denormalized so RLS never needs a join to reel_jobs.
create table if not exists public.reel_clips (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  reel_id      uuid not null references public.reel_jobs(id) on delete cascade,
  scene_index  int not null default 0,
  prompt       text not null default '',        -- the text-to-video generation prompt for this scene
  caption      text not null default '',        -- on-screen caption for this scene
  vo           text not null default '',        -- voiceover line for this scene ('' = none)
  provider     text not null default 'sora'
                 check (provider in ('sora', 'runway', 'luma')),
  status       text not null default 'queued'
                 check (status in ('queued', 'running', 'done', 'failed')),
  output_url   text,                            -- the generated clip once downloaded to storage
  seed         bigint,
  error        text,
  created_at   timestamptz not null default now()
);
alter table public.reel_clips enable row level security;
drop policy if exists "reel_clips owner all" on public.reel_clips;
create policy "reel_clips owner all" on public.reel_clips
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.reel_jobs r where r.id = reel_id and r.owner_id = auth.uid())
  );
create unique index if not exists idx_reel_clips_scene on public.reel_clips(reel_id, scene_index);
create index if not exists idx_reel_clips_status on public.reel_clips(status) where status in ('queued', 'running');
