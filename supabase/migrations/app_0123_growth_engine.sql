-- app_0123_growth_engine.sql — THE GROWTH ENGINE, slice 1: structured AI-media provenance + the
-- channel roster. Three things land here:
--
-- 1. ai_provenance (jsonb) on social_posts + cluster_files — the structured, ACCRETE-ONLY twin of
--    mediaProvenanceCore.ts's AiProvenance. A BEFORE UPDATE trigger makes the stamp immutable in SQL
--    (provenance can be added, never changed or stripped) — the social-publish executor holds a
--    fail-closed disclosure gate on it, so "AI media never posts unlabeled" is enforced at the DB +
--    executor layer, not by client goodwill. Existing AI images (label 'ai-generated'/'ai-social')
--    are backfilled.
--
-- 2. growth_channels — the first-class CHANNEL: one distinctly-branded niche account persona
--    (a finance-facts brand, a maker channel), NOT an account farm. The 2026 platform reality this
--    encodes: a handful of branded channels posting original 60-90s videos beats 50 clones, which
--    trip spam clustering + inauthentic-content policy. Persona/niche/platforms/cadence/voice live
--    here so every produced episode inherits the channel's identity.
--
-- 3. channel_episodes — one produced video: the cited fact script (with its hook variants and
--    sources), the render, and the queued/posted social row it became. The pipeline's durable record.
--
-- Additive + idempotent. Owner RLS everywhere; world pinned when set (the reel_jobs pattern).

alter table public.social_posts  add column if not exists ai_provenance jsonb;
alter table public.cluster_files add column if not exists ai_provenance jsonb;

-- Backfill: images generate-image already labeled as AI get the structured stamp (createdAt 0 = "before stamping existed").
update public.cluster_files
   set ai_provenance = jsonb_build_object('aiGenerated', true, 'kind', 'image', 'tool', 'gpt-image-1', 'createdAt', 0)
 where ai_provenance is null and label in ('ai-generated', 'ai-social');

-- Accrete-only: once stamped, provenance never changes and never comes off (SQL twin of stampProvenance).
create or replace function public.ai_provenance_accrete_only()
returns trigger language plpgsql as $$
begin
  if old.ai_provenance is not null and new.ai_provenance is distinct from old.ai_provenance then
    raise exception 'ai_provenance is accrete-only: an AI-media stamp can never be changed or removed';
  end if;
  return new;
end $$;

drop trigger if exists trg_social_posts_ai_prov on public.social_posts;
create trigger trg_social_posts_ai_prov before update on public.social_posts
  for each row execute function public.ai_provenance_accrete_only();
drop trigger if exists trg_cluster_files_ai_prov on public.cluster_files;
create trigger trg_cluster_files_ai_prov before update on public.cluster_files
  for each row execute function public.ai_provenance_accrete_only();

-- THE CHANNEL ROSTER ---------------------------------------------------------------------------
create table if not exists public.growth_channels (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references public.profiles(id) on delete cascade,
  world_id          uuid references public.knowledge_worlds(id) on delete set null,
  cluster_id        uuid references public.knowledge_clusters(id) on delete set null,  -- its content_growth studio area
  name              text not null default '',
  handle            text not null default '',       -- the public @handle, for the operator's eyes
  niche             text not null default '',       -- 'finance facts', 'space facts', 'handmade jewelry'
  persona           text not null default '',       -- the channel's voice/character in one paragraph
  platforms         text[] not null default '{}',   -- socialCore platform ids: tiktok/youtube/instagram/...
  cadence_per_week  int not null default 7 check (cadence_per_week between 0 and 21),
  monetization_mode text not null default 'rpm_first'
                      check (monetization_mode in ('app_first', 'affiliate_first', 'shop_first', 'rpm_first')),
  voice             text not null default 'nova',   -- tts-voiceover voice id
  music_mood        text not null default 'minimal'
                      check (music_mood in ('warm', 'upbeat', 'cinematic', 'minimal')),
  visual_style      text not null default '',       -- the channel's image style clause — its distinct look
  status            text not null default 'active' check (status in ('active', 'paused')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table public.growth_channels enable row level security;
drop policy if exists "growth_channels owner all" on public.growth_channels;
create policy "growth_channels owner all" on public.growth_channels
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (world_id is null or exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid()))
  );
create index if not exists idx_growth_channels_owner on public.growth_channels(owner_id, created_at desc);

-- ONE PRODUCED EPISODE -------------------------------------------------------------------------
create table if not exists public.channel_episodes (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  channel_id   uuid not null references public.growth_channels(id) on delete cascade,
  cluster_id   uuid references public.knowledge_clusters(id) on delete set null,
  title        text not null default '',
  topic        text not null default '',
  script       jsonb not null default '{}'::jsonb,  -- FactScript: {title, hooks[], scenes[], sources[], caption, cta}
  hook_index   int not null default 0,              -- which hook variant this cut uses
  status       text not null default 'draft'
                 check (status in ('draft', 'rendered', 'queued', 'posted', 'failed')),
  render_id    text,
  video_url    text,                                -- the DURABLE mp4 (storage copy, never the provider's 24h url)
  srt_url      text,
  caption      text not null default '',            -- the post caption (carries the AI disclosure)
  post_id      uuid references public.social_posts(id) on delete set null,
  error        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.channel_episodes enable row level security;
drop policy if exists "channel_episodes owner all" on public.channel_episodes;
create policy "channel_episodes owner all" on public.channel_episodes
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.growth_channels c where c.id = channel_id and c.owner_id = auth.uid())
  );
create index if not exists idx_channel_episodes_channel on public.channel_episodes(channel_id, created_at desc);
create index if not exists idx_channel_episodes_owner on public.channel_episodes(owner_id, created_at desc);
