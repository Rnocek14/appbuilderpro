-- app_0041_wave_a_security.sql — Wave A: the trust floor. Fixes found by the full-system audit.
--
-- 1) preview_sites lockdown (CRITICAL): the old "public read" policy was `using (true)`, which let
--    ANYONE with the public anon key SELECT the whole table — every tenant's prospect pipeline
--    (business names, generated specs, pitches, owner ids). The point of a preview is a no-login
--    link to ONE site behind an unguessable slug. So: public table read is gone; owners read their
--    own rows; the public path is a SECURITY DEFINER function that returns exactly one row for a
--    supplied slug (or id), minus the owner id. Slugs carry a nonce (ingest-profile), so they are
--    unguessable — the function makes that the *only* anonymous door.
-- 2) projects.netlify_site_id: the authoritative Netlify site binding, written server-side by
--    deploy-site on first deploy. Closes the audit's H3 (client-supplied siteId could point the
--    shared operator token at another tenant's site).
--
-- Additive + idempotent.

-- ── 1) preview_sites: kill the table-wide public read ─────────────────────────────────────────
drop policy if exists "preview sites public read" on public.preview_sites;

drop policy if exists "preview sites select own" on public.preview_sites;
create policy "preview sites select own" on public.preview_sites
  for select using (user_id = auth.uid());

-- The one anonymous door: one row, by exact slug (or id), owner id stripped.
create or replace function public.get_preview_by_slug(p_slug text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select to_jsonb(p) - 'user_id'
  from public.preview_sites p
  where p.slug = p_slug or p.id::text = p_slug
  limit 1
$$;

revoke all on function public.get_preview_by_slug(text) from public;
grant execute on function public.get_preview_by_slug(text) to anon, authenticated;

-- ── 2) projects: authoritative hosting binding ────────────────────────────────────────────────
alter table public.projects add column if not exists netlify_site_id text;
