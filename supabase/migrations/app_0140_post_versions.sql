-- app_0140_post_versions.sql — THE APPROVAL BINDS TO THE CONTENT, NOT TO A ROW ID.
-- The real-estate audit's gap 1 (docs/real-estate-marketing-implementation.md §2.2). Today a
-- publish_post approval carries only { post_row_id }, and social-publish re-reads body, platforms,
-- media_urls and scheduled_for from the MUTABLE social_posts row at send time — so editing a post
-- after approval changes what publishes, and app_0069's payload hash cannot see it. social-publish
-- says so itself: "the payload hash alone can't protect body/media".
--
-- The house already solved this once, for content weeks: the approval carries a pieces_hash and the
-- drain re-hashes the current content before executing (standing-worker, "The content changed AFTER
-- the decision — the decision no longer covers it. Refuse."). This is that pattern for posts, with a
-- durable version row behind it.
--
-- WHY A TABLE AND NOT JUST A BIGGER PAYLOAD: the version is also what the operator re-reads later
-- ("what exactly did I approve?"), what the reconciler compares against, and what carries the fact
-- ids and media digests. artifact_versions (app_0026) is the nearest shape but is NOT immutable —
-- its policy is `for all`, so an owner can rewrite a snapshot. This one grants SELECT + INSERT only,
-- and a trigger refuses UPDATE/DELETE even for the service role (the app_0123 accrete-only precedent).
--
-- Additive + idempotent. Nothing here changes how an existing version-less approval behaves.

create table if not exists public.post_versions (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  post_id         uuid not null references public.social_posts(id) on delete cascade,
  version         int not null,                    -- assigned by trigger when null; 1, 2, 3 …
  body            text not null default '',
  platforms       text[] not null default '{}',
  media_urls      text[] not null default '{}',
  -- url -> sha256 of the bytes AT APPROVAL TIME. generate-video and render-video upload with
  -- upsert:true to a deterministic path, so a re-render silently replaces the bytes behind a live
  -- URL — binding the text without binding the bytes would be a half-binding.
  media_digests   jsonb not null default '{}'::jsonb,
  ai_provenance   jsonb,
  scheduled_for   timestamptz,                     -- the instant
  scheduled_local text,                            -- 'YYYY-MM-DDTHH:mm' exactly as the operator typed it
  schedule_tz     text not null default 'America/Chicago',
  fact_ids        uuid[] not null default '{}',    -- every re_fact this copy relies on
  compliance_line text,                            -- the brokerage line as it will publish
  content_hash    text not null,                   -- sha256 of the canonical version (payloadHash.ts)
  created_at      timestamptz not null default now(),
  unique (post_id, version)
);
alter table public.post_versions enable row level security;

-- SELECT + INSERT only. Deliberately NOT `for all` — a version is a record of a decision.
drop policy if exists "post_versions owner all" on public.post_versions;
drop policy if exists "post_versions owner read" on public.post_versions;
create policy "post_versions owner read" on public.post_versions
  for select using (owner_id = auth.uid());
drop policy if exists "post_versions owner insert" on public.post_versions;
create policy "post_versions owner insert" on public.post_versions
  for insert with check (
    owner_id = auth.uid()
    and exists (select 1 from public.social_posts p where p.id = post_id and p.owner_id = auth.uid())
  );

create index if not exists idx_post_versions_post on public.post_versions(post_id, version desc);

-- Version numbering, race-safe enough: the trigger fills the next number, the unique constraint
-- settles a tie (the loser retries with a fresh number).
create or replace function public.assign_post_version()
returns trigger language plpgsql as $$
begin
  if new.version is null or new.version <= 0 then
    select coalesce(max(version), 0) + 1 into new.version
      from public.post_versions where post_id = new.post_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_post_versions_number on public.post_versions;
create trigger trg_post_versions_number before insert on public.post_versions
  for each row execute function public.assign_post_version();

-- Immutability at rest. RLS already withholds UPDATE/DELETE from the owner; this also stops a
-- service-role writer (every edge function) from rewriting history by accident.
create or replace function public.post_versions_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'post_versions is immutable: approve a NEW version instead of changing an approved one';
end $$;
drop trigger if exists trg_post_versions_no_update on public.post_versions;
create trigger trg_post_versions_no_update before update or delete on public.post_versions
  for each row execute function public.post_versions_immutable();

-- ---------- social_posts becomes a header ----------
alter table public.social_posts add column if not exists current_version_id uuid references public.post_versions(id) on delete set null;
alter table public.social_posts add column if not exists campaign_id        uuid references public.marketing_campaigns(id) on delete set null;
-- The final platform URL — the thing that turns "we think it went out" into "here it is".
-- provider_post_id is the provider's envelope id, not a link anyone can open.
alter table public.social_posts add column if not exists post_urls          jsonb;   -- { instagram: 'https://…' }
alter table public.social_posts add column if not exists claimed_at         timestamptz;
alter table public.social_posts add column if not exists idempotency_key    text;    -- the reconcile key
create index if not exists idx_social_posts_campaign on public.social_posts(campaign_id) where campaign_id is not null;

-- 'in_flight': sent to the provider, answer unknown. Today there is no sending state at all, so a
-- timed-out row is indistinguishable from a fresh one — and a 30s abort can fire AFTER the provider
-- accepted the post, leaving it live on the platform while our row says 'queued'.
alter table public.social_posts drop constraint if exists social_posts_status_check;
alter table public.social_posts add constraint social_posts_status_check
  check (status in ('queued', 'in_flight', 'scheduled', 'posted', 'failed', 'canceled'));

alter table public.social_post_metrics add column if not exists post_url text;

-- ---------- cluster_files: rendered video has never been storable ----------
-- render-video inserts kind:'video' into a CHECK that allows only ('image','doc','csv','other') and
-- the insert's error is not checked — so no rendered video ever gets a row, and the disclosure gate
-- can only see provenance when the POST row carries it. Widen the constraint; the gate gains sight.
alter table public.cluster_files drop constraint if exists cluster_files_kind_check;
alter table public.cluster_files add constraint cluster_files_kind_check
  check (kind in ('image', 'video', 'audio', 'doc', 'csv', 'other'));

-- The disclosure gate looks media up BY URL (social-publish: .in('url', draft.mediaUrls)); there was
-- no index for that predicate.
create index if not exists idx_cluster_files_url on public.cluster_files(url);
