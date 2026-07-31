-- app_0125_retention_hooklab.sql — GROWTH ENGINE slice 3: retention signals, the hook lab, and the
-- sellable service. Three things land here:
--
-- 1. RETENTION COLUMNS on social_post_metrics. The research is unambiguous: retention — not raw
--    views — is what the algorithms rank on (70%+ completion = viral-grade push; <40% = the hook
--    failed). The provider already returns TikTok averageTimeWatched / fullVideoWatchedRate and
--    YouTube averageViewPercentage; social-sync stored them only inside `raw`. Promoted to real
--    columns so the learning loop can read them. Nullable — absent stays NULL, never a fake 0.
--
-- 2. THE HOOK LAB on channel_episodes: `assets` persists a produced episode's scene-image URLs so
--    a B-CUT (same episode, different hook variant) reuses the art and re-renders for pennies
--    (~$0.30: new VO + render, zero new images); `variant_of` ties the cut to its parent so the
--    loop compares hooks on otherwise-identical videos — a real A/B, in-house, cross-platform.
--
-- 3. THE 'social_content' SERVICE PACKAGE — the researched #1 revenue avenue ($1,000-2,000/mo
--    local-business retainers) as a versioned package row, so the offer exists as a sellable,
--    pinnable noun in the client machinery (app_0115 pattern).
--
-- Additive + idempotent.

alter table public.social_post_metrics add column if not exists avg_watch_seconds numeric;
alter table public.social_post_metrics add column if not exists full_watch_rate   numeric;  -- 0..1
alter table public.social_post_metrics add column if not exists avg_view_pct      numeric;  -- 0..100

alter table public.channel_episodes add column if not exists assets jsonb not null default '{}'::jsonb;
alter table public.channel_episodes add column if not exists variant_of uuid references public.channel_episodes(id) on delete set null;
create index if not exists idx_channel_episodes_variant on public.channel_episodes(variant_of) where variant_of is not null;

insert into public.service_packages (owner_id, key, version, name, blurb, cadence, price_hint, definition, status)
values
  (null, 'social_content', 1, 'Social Content Engine',
   'A month of short-form video for your business — planned, produced, approved by you, posted, and reported.',
   'monthly', 'from $1,000/mo',
   '{"includes": ["12 short-form videos/mo (TikTok, Reels, Shorts) from your real photos and footage", "Scripts, captions, and posting handled — you approve a weekly slate, nothing posts without your OK", "Your own branded channel identity (look, voice, cadence)", "A destination link on every post with real click attribution", "Monthly performance report: views, engagement, clicks, and what we are doubling down on"],
     "establishes": {"watch_site": false, "propose_automations": [], "reporting": "monthly", "growth_channel": true}}'::jsonb,
   'current')
on conflict (owner_id, key, version) do nothing;
