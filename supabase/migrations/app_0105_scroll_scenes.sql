-- SCROLL-SCENE LIBRARY: photoreal, scroll-scrubbed clips generated ONCE with Google Veo 3.1 and
-- reused across every demo in a trade (water rushing down a copper pipe → the joint bursts → a clamp
-- seals it). Per-site video generation would be slow + costly; a curated per-trade library is the
-- affordable way to give generated sites that "insane scroll website" moment. Each row is one clip:
-- generated → operator previews → approved, then the site generator pulls the trade's approved clip.
-- Additive + idempotent.

create table if not exists public.scroll_scenes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  scene_kind text not null check (scene_kind in ('pipe', 'circuit', 'rain', 'hvac', 'auto', 'generic')),
  prompt text not null,                       -- the exact prompt sent to Veo (editable per attempt)
  provider text not null default 'veo',
  status text not null default 'generating' check (status in ('generating', 'ready', 'approved', 'failed')),
  operation_id text,                          -- Veo long-running operation name we poll on
  video_url text,                             -- public storage URL once the clip is downloaded
  poster_url text,                            -- optional still (first frame) for previews
  cost_usd numeric not null default 0,
  error text,                                 -- surfaced Veo/API error when status = failed
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz
);

create index if not exists idx_scroll_scenes_owner_kind on public.scroll_scenes(owner_id, scene_kind, status);
-- The one approved clip per trade the site generator reaches for (most-recently approved wins).
create index if not exists idx_scroll_scenes_approved on public.scroll_scenes(owner_id, scene_kind, approved_at desc)
  where status = 'approved';

alter table public.scroll_scenes enable row level security;
drop policy if exists "scroll_scenes owner all" on public.scroll_scenes;
create policy "scroll_scenes owner all" on public.scroll_scenes
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
