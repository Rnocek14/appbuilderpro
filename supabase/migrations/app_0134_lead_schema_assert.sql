-- app_0134_lead_schema_assert.sql — PROVE THE LEAD ENGINE SCHEMA IS REALLY THERE, AND MAKE
-- POSTGREST SEE IT. Two failure modes produced the same symptom in the app ("Could not find the
-- table 'public.le_leads' in the schema cache"): the migration genuinely not applied to THIS
-- project, or applied but PostgREST still serving a stale schema cache. This migration
-- distinguishes them — it raises a loud, named error when a table is missing, and reloads the
-- cache when everything is present.
--
-- Idempotent and side-effect-free when the schema is correct.

do $$
declare missing text[] := '{}';
begin
  if to_regclass('public.le_sources')        is null then missing := missing || 'le_sources'; end if;
  if to_regclass('public.le_events')         is null then missing := missing || 'le_events'; end if;
  if to_regclass('public.le_leads')          is null then missing := missing || 'le_leads'; end if;
  if to_regclass('public.le_outcomes')       is null then missing := missing || 'le_outcomes'; end if;
  if to_regclass('public.le_customers')      is null then missing := missing || 'le_customers'; end if;
  if to_regclass('public.le_event_parties')  is null then missing := missing || 'le_event_parties'; end if;
  if to_regclass('public.le_event_versions') is null then missing := missing || 'le_event_versions'; end if;
  if to_regclass('public.le_ingest_runs')    is null then missing := missing || 'le_ingest_runs'; end if;
  if array_length(missing, 1) is not null then
    raise exception 'LEAD ENGINE SCHEMA MISSING on this project: %. Apply app_0129..app_0133 here.', array_to_string(missing, ', ');
  end if;
  raise notice 'lead engine schema present: 8/8 tables';
end $$;

-- Make PostgREST pick the tables up immediately rather than on its next reload.
notify pgrst, 'reload schema';
