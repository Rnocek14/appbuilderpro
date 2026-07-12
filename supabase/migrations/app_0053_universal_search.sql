-- app_0053_universal_search.sql — UNIVERSAL SEARCH (design review P1): one query over everything
-- the record holds, surfaced in ⌘K (additive, idempotent).
--
-- The review's completeness audit: "the one keystroke a personal OS must answer — 'where is that
-- thing I know I have' — doesn't exist." This function is that answer's substrate: a single
-- owner-scoped sweep over artifacts, areas, worlds, contacts, invoices, documents, beliefs, and
-- missions. SECURITY INVOKER on purpose — RLS on every underlying table scopes rows to the
-- caller; the function adds reach, never privilege. ILIKE is honest at personal scale (one
-- owner's rows, all indexed by owner); trigram/tsvector can layer on later without changing the
-- contract.

create or replace function public.garvis_search(q text, cap int default 6)
returns table (
  kind    text,        -- artifact | area | world | contact | invoice | document | belief | mission
  id      uuid,
  title   text,
  snippet text,
  world_id uuid,       -- for routes that land inside a venture (null elsewhere)
  extra   jsonb,       -- kind-specific routing hints (area slug, invoice number, …)
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
    where a.title ilike needle.pat or a.detail ilike needle.pat
    order by a.created_at desc limit cap)

  union all
  (select 'area'::text, c.id, c.title, coalesce(left(c.summary, 140), ''),
          c.world_id, jsonb_build_object('area', c.slug), c.created_at
     from knowledge_clusters c, needle
    where c.title ilike needle.pat or c.summary ilike needle.pat
    order by c.updated_at desc limit cap)

  union all
  (select 'world'::text, w.id, w.title, coalesce(left(w.description, 140), ''),
          w.id, '{}'::jsonb, w.created_at
     from knowledge_worlds w, needle
    where w.title ilike needle.pat or w.description ilike needle.pat
    order by w.updated_at desc limit cap)

  union all
  (select 'contact'::text, ct.id, coalesce(nullif(ct.full_name, ''), ct.email), ct.email,
          null::uuid, '{}'::jsonb, ct.created_at
     from contacts ct, needle
    where ct.full_name ilike needle.pat or ct.email ilike needle.pat
    order by ct.created_at desc limit cap)

  union all
  (select 'invoice'::text, i.id, i.number || ' — ' || i.title,
          i.status || ' · $' || i.amount_usd::text,
          i.world_id, jsonb_build_object('number', i.number), i.created_at
     from invoices i, needle
    where i.title ilike needle.pat or i.number ilike needle.pat
    order by i.created_at desc limit cap)

  union all
  (select 'document'::text, d.id, d.title, coalesce(left(d.summary, 140), ''),
          d.world_id, '{}'::jsonb, d.created_at
     from documents d, needle
    where d.title ilike needle.pat or d.summary ilike needle.pat or d.extracted_text ilike needle.pat
    order by d.created_at desc limit cap)

  union all
  (select 'belief'::text, b.id, b.statement, 'belief · ' || b.scope,
          null::uuid, '{}'::jsonb, b.created_at
     from mind_beliefs b, needle
    where b.statement ilike needle.pat
    order by b.updated_at desc limit cap)

  union all
  (select 'mission'::text, m.id, m.objective, coalesce(m.subject, '') || ' · ' || m.status::text,
          null::uuid, '{}'::jsonb, m.created_at
     from garvis_missions m, needle
    where m.objective ilike needle.pat or m.subject ilike needle.pat
    order by m.updated_at desc limit cap)
$$;

comment on function public.garvis_search(text, int) is
  'Universal search for ⌘K: owner-scoped (RLS, SECURITY INVOKER) sweep over the record. cap = max hits per kind.';

-- The callers are signed-in owners; anon gets nothing anyway (RLS), but be explicit.
revoke execute on function public.garvis_search(text, int) from anon;
grant execute on function public.garvis_search(text, int) to authenticated;
