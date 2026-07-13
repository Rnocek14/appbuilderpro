-- app_0055_search_active_beliefs.sql — deep scan fix: retired beliefs leaked into ⌘K.
-- The belief branch of garvis_search had no status filter, so a belief the owner had corrected and
-- retired (the sanctioned way to un-say something) reappeared in the palette looking exactly like a
-- held belief. This recreates the function with `b.status = 'active'` on that branch. Additive and
-- idempotent (CREATE OR REPLACE) — every other branch is byte-for-byte app_0053.

create or replace function public.garvis_search(q text, cap int default 6)
returns table (
  kind    text,
  id      uuid,
  title   text,
  snippet text,
  world_id uuid,
  extra   jsonb,
  at      timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with needle as (select '%' || trim(q) || '%' as pat)

  (select 'artifact'::text, a.id, a.title,
          coalesce(left(regexp_replace(coalesce(a.detail, ''), '\s+', ' ', 'g'), 140), ''),
          c.world_id, jsonb_build_object('area', c.slug), a.created_at
     from knowledge_artifacts a
     join knowledge_clusters c on c.id = a.cluster_id, needle
    where a.owner_id = auth.uid()
      and (a.title ilike needle.pat or a.detail ilike needle.pat)
    order by a.created_at desc limit cap)

  union all
  (select 'area'::text, c.id, c.title, coalesce(left(c.summary, 140), ''),
          c.world_id, jsonb_build_object('area', c.slug), c.created_at
     from knowledge_clusters c, needle
    where c.owner_id = auth.uid()
      and (c.title ilike needle.pat or c.summary ilike needle.pat)
    order by c.updated_at desc limit cap)

  union all
  (select 'world'::text, w.id, w.title, coalesce(left(w.description, 140), ''),
          w.id, '{}'::jsonb, w.created_at
     from knowledge_worlds w, needle
    where w.owner_id = auth.uid()
      and (w.title ilike needle.pat or w.description ilike needle.pat)
    order by w.updated_at desc limit cap)

  union all
  (select 'contact'::text, ct.id, coalesce(nullif(ct.full_name, ''), ct.email), ct.email,
          null::uuid, '{}'::jsonb, ct.created_at
     from contacts ct, needle
    where ct.owner_id = auth.uid()
      and (ct.full_name ilike needle.pat or ct.email ilike needle.pat)
    order by ct.created_at desc limit cap)

  union all
  (select 'invoice'::text, i.id, i.number || ' — ' || i.title,
          i.status || ' · $' || i.amount_usd::text,
          i.world_id, jsonb_build_object('number', i.number), i.created_at
     from invoices i, needle
    where i.owner_id = auth.uid()
      and (i.title ilike needle.pat or i.number ilike needle.pat)
    order by i.created_at desc limit cap)

  union all
  (select 'document'::text, d.id, d.title, coalesce(left(d.summary, 140), ''),
          d.world_id, '{}'::jsonb, d.created_at
     from documents d, needle
    where d.owner_id = auth.uid()
      and (d.title ilike needle.pat or d.summary ilike needle.pat or d.extracted_text ilike needle.pat)
    order by d.created_at desc limit cap)

  union all
  -- BELIEFS: active only. A retired belief was corrected on purpose; it must not resurface in search.
  (select 'belief'::text, b.id, b.statement, 'belief · ' || b.scope,
          null::uuid, '{}'::jsonb, b.created_at
     from mind_beliefs b, needle
    where b.owner_id = auth.uid()
      and b.status = 'active'
      and b.statement ilike needle.pat
    order by b.updated_at desc limit cap)

  union all
  (select 'mission'::text, m.id, m.objective, coalesce(m.subject, '') || ' · ' || m.status::text,
          null::uuid, '{}'::jsonb, m.created_at
     from garvis_missions m, needle
    where m.owner_id = auth.uid()
      and (m.objective ilike needle.pat or m.subject ilike needle.pat)
    order by m.updated_at desc limit cap)
$$;

revoke execute on function public.garvis_search(text, int) from anon;
grant execute on function public.garvis_search(text, int) to authenticated;
