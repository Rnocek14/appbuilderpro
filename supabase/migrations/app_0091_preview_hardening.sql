-- app_0091_preview_hardening.sql
-- Deep-audit fix wave (operation hardening):
--
-- 1) get_preview_by_slug leaked the ENTIRE preview_sites row (minus user_id) to anyone holding
--    a preview slug — including the internal sales pitch email, the marketing strategy, and the
--    simulated-owner critique ("would_buy: false, weakest_part: …"). The prospect the demo was
--    pitched TO could read our private notes about their business. The public payload is now
--    the render surface only: spec + audit + identity fields.
--
-- 2) preview_sites.build_log — per-build provenance (model, stage reached, imagery count,
--    failure reasons, cost) so "why is this demo a template?" is answerable without joining
--    usage-event timestamps. Server-written only; excluded from the public RPC.

alter table public.preview_sites add column if not exists build_log jsonb;

create or replace function public.get_preview_by_slug(p_slug text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select to_jsonb(p) - 'user_id' - 'pitch' - 'strategy' - 'critique' - 'build_log'
  from public.preview_sites p
  where p.slug = p_slug or p.id::text = p_slug
  limit 1
$$;

revoke all on function public.get_preview_by_slug(text) from public;
grant execute on function public.get_preview_by_slug(text) to anon, authenticated;
