-- app_0103_preview_hosting.sql — turn a demo into a LIVE hosted site.
-- The preview engine could render a demo and export a self-contained index.html, but there was no
-- record of a demo actually being HOSTED anywhere. These columns bind a preview_site to its live
-- host (Netlify), so "Go Live" is one click and a paid sale can auto-publish:
--   * netlify_site_id — the authoritative Netlify site binding, written server-side on first publish
--     (mirrors projects.netlify_site_id). Re-publishing the same demo reuses it instead of making a
--     new site. Stripped from the public RPC below (operational, not for anon eyes).
--   * live_url — the public https URL the site is served at (also the operator's proof it's live).
--   * custom_domain — the client's own domain once pointed at us (null = on the default host).
--   * published_at — when it first went live (null = never published).
-- The finished index.html itself is NOT stored on the row (it can be 100s of KB and the row is read
-- by the public get_preview_by_slug on every demo view) — it lives in the project-assets bucket at
-- <owner_id>/published/<preview_site_id>.html so the payment webhook can re-publish without a browser.
-- Additive + idempotent.

alter table public.preview_sites add column if not exists netlify_site_id text;
alter table public.preview_sites add column if not exists live_url text;
alter table public.preview_sites add column if not exists custom_domain text;
alter table public.preview_sites add column if not exists published_at timestamptz;

-- The public read must not leak the operational Netlify site id. Re-create the RPC with it stripped
-- (same shape as app_0091; adds '- netlify_site_id'). live_url/custom_domain/published_at stay — a
-- live URL is public by nature, and the operator's demo page can show "published" state.
create or replace function public.get_preview_by_slug(p_slug text)
returns jsonb language sql security definer set search_path = public stable
as $$
  select to_jsonb(p) - 'user_id' - 'pitch' - 'strategy' - 'critique' - 'build_log' - 'netlify_site_id'
  from public.preview_sites p
  where p.slug = p_slug or p.id::text = p_slug
  limit 1
$$;
revoke all on function public.get_preview_by_slug(text) from public;
grant execute on function public.get_preview_by_slug(text) to anon, authenticated;
