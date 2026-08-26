-- app_0139_media_cast.sql — THE CAST: persistent visual identity for AI-generated video.
-- The one genuinely-new primitive the media-studio review (Aug 2026) found missing from BOTH repos:
-- traction-engine held identity in PROSE (identity_lock_tokens — and drifted); nothing anywhere pins
-- a recurring character to APPROVED REFERENCE IMAGES. These tables do exactly that, and nothing more:
--
--   media_characters  — a recurring AI person (a spokesperson, a series lead). Identity is the row;
--                       the LOOK is the approved reference assets that point at it.
--   media_locations   — a recurring set (an apartment, a small-town main street).
--   media_ref_assets  — the canonical references themselves (face front / 3/4 / full body / outfit /
--                       location wide / detail), one table for both subjects so the reference
--                       resolver reads one shape. Only APPROVED assets are ever sent to a renderer.
--
-- reel_clips (app_0071) is the shot table this feeds — it gains cast wiring, per-shot continuity
-- state (what shot N hands shot N+1: wardrobe, positions, lighting, the accepted clip as a
-- reference video), QA results, and a WIDENED provider set: the 2026 renderers (seedance/veo/kling)
-- join the legacy constraint (sora/runway/luma stay valid so old rows never break the check).
--
-- NO new UI surface comes with this: the Cast list is a lane inside the existing content_growth
-- studio (simplicity doctrine). Additive + idempotent; owner RLS everywhere.

-- THE CAST -------------------------------------------------------------------------------------
create table if not exists public.media_characters (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  world_id     uuid references public.knowledge_worlds(id) on delete set null,
  name         text not null default '',
  description  text not null default '',   -- appearance in prose: age range, build, hair, features
  wardrobe     jsonb not null default '{}'::jsonb,  -- named outfits: {"casual_1": "black sweater, jeans", ...}
  voice        text not null default '',   -- tts voice id (the character's persistent voice)
  persona      text not null default '',   -- how they carry themselves — feeds delivery direction
  status       text not null default 'active' check (status in ('active', 'retired')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.media_characters enable row level security;
drop policy if exists "media_characters owner all" on public.media_characters;
create policy "media_characters owner all" on public.media_characters
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_media_characters_owner on public.media_characters(owner_id, created_at desc);

create table if not exists public.media_locations (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  world_id     uuid references public.knowledge_worlds(id) on delete set null,
  name         text not null default '',
  description  text not null default '',   -- spatial truth in prose: what's behind what, windows, light
  lighting     jsonb not null default '{}'::jsonb,  -- named conditions: {"night": "warm interior, low", ...}
  status       text not null default 'active' check (status in ('active', 'retired')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.media_locations enable row level security;
drop policy if exists "media_locations owner all" on public.media_locations;
create policy "media_locations owner all" on public.media_locations
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_media_locations_owner on public.media_locations(owner_id, created_at desc);

-- THE CANONICAL REFERENCES ---------------------------------------------------------------------
-- One table for character and location references: the resolver reads one shape, RLS needs no join
-- (owner_id denormalized). approved=false rows are candidates the operator hasn't blessed — the
-- resolver NEVER sends them to a renderer.
create table if not exists public.media_ref_assets (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  subject_kind  text not null check (subject_kind in ('character', 'location')),
  subject_id    uuid not null,             -- media_characters.id or media_locations.id per kind
  kind          text not null check (kind in (
                  'face_front', 'face_34', 'face_profile', 'full_body', 'expression', 'outfit',
                  'loc_wide', 'loc_detail', 'loc_lighting', 'voice_sample')),
  label         text not null default '',  -- which outfit / which expression / which room
  file_url      text not null,             -- storage url (project-assets)
  approved      boolean not null default false,
  ai_provenance jsonb,                     -- stamped when the reference itself was AI-generated
  created_at    timestamptz not null default now()
);
alter table public.media_ref_assets enable row level security;
drop policy if exists "media_ref_assets owner all" on public.media_ref_assets;
create policy "media_ref_assets owner all" on public.media_ref_assets
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_media_ref_assets_subject on public.media_ref_assets(subject_id, kind);
create index if not exists idx_media_ref_assets_owner on public.media_ref_assets(owner_id, created_at desc);

-- SHOT WIRING ON reel_clips --------------------------------------------------------------------
-- character_ids/location_id: who is in the shot and where it happens (drives the resolver).
-- continuity_in:  the state this shot MUST honor (from the previous accepted shot).
-- continuity_out: the state this shot hands forward once accepted (wardrobe, positions, lighting,
--                 held objects, and the accepted clip's url — the next shot's @Video reference;
--                 Seedance's video-input rate is 40% cheaper, so chaining is subsidized).
-- qa:             the video QA verdict for the ACCEPTED candidate (full per-candidate QA lives on
--                 reel_clip_candidates).
alter table public.reel_clips add column if not exists character_ids  uuid[] not null default '{}';
alter table public.reel_clips add column if not exists location_id    uuid references public.media_locations(id) on delete set null;
alter table public.reel_clips add column if not exists continuity_in  jsonb;
alter table public.reel_clips add column if not exists continuity_out jsonb;
alter table public.reel_clips add column if not exists qa             jsonb;
alter table public.reel_clips add column if not exists cost_usd       numeric;

-- Widen the provider set: current renderers join, legacy values stay valid for existing rows.
alter table public.reel_clips drop constraint if exists reel_clips_provider_check;
alter table public.reel_clips add constraint reel_clips_provider_check
  check (provider in ('seedance', 'seedance-fast', 'veo', 'veo-fast', 'kling', 'sora', 'runway', 'luma'));

-- CANDIDATES -----------------------------------------------------------------------------------
-- Never assume generation #1 is the shot. Each generation attempt is a candidate row; QA scores
-- them; accepting one writes it back onto the clip. owner_id denormalized (the reel_clips pattern).
create table if not exists public.reel_clip_candidates (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  clip_id      uuid not null references public.reel_clips(id) on delete cascade,
  provider     text not null check (provider in ('seedance', 'seedance-fast', 'veo', 'veo-fast', 'kling')),
  request_id   text,                       -- the provider's job handle (fal request id / Veo op name)
  status       text not null default 'queued'
                 check (status in ('queued', 'running', 'ready', 'accepted', 'rejected', 'failed')),
  video_url    text,                       -- DURABLE storage copy (never the provider's expiring url)
  seed         bigint,
  qa           jsonb,                      -- VideoQaVerdict: dimensions, defects, identity, decision
  cost_usd     numeric,
  error        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.reel_clip_candidates enable row level security;
drop policy if exists "reel_clip_candidates owner all" on public.reel_clip_candidates;
create policy "reel_clip_candidates owner all" on public.reel_clip_candidates
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.reel_clips c where c.id = clip_id and c.owner_id = auth.uid())
  );
create index if not exists idx_reel_clip_candidates_clip on public.reel_clip_candidates(clip_id, created_at desc);
create index if not exists idx_reel_clip_candidates_status on public.reel_clip_candidates(status) where status in ('queued', 'running');
