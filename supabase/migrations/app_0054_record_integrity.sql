-- app_0054_record_integrity.sql — REAL EDGES + LEDGERED GRANTS (design review P2; additive, idempotent).
--
-- Three integrity holes the review flagged in the data layer:
--   1. embeddings.(subject_type, subject_id) has no FK ("the writer is responsible for deleting
--      stale rows" — the cron/webhook writers never do). Deleting a document/artifact/cluster/
--      business orphaned its vectors forever, silently degrading retrieval. Cleanup triggers
--      close it at the database, where the invariant belongs.
--   2. command_messages.mission_id was a loose uuid ("missions table owns lifecycle" by hope).
--      A real FK (NOT VALID — tolerant of any existing orphans) makes the edge enforced for all
--      new rows without failing the migration on old ones.
--   3. profiles.credits_balance is the money guardrail, but only SPENDS were ledgered — monthly
--      grants mutated the balance invisibly, so the balance could never be audited or rebuilt.
--      refresh_credits now writes a usage_events row ('credit_grant', cost 0) whenever it rolls
--      the window. Zero-cost rows don't move any spend sum; counters filter by event_type.

-- ---- 1. embeddings orphan cleanup --------------------------------------------------------------

create or replace function public.garvis_embeddings_cleanup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.embeddings where subject_type = tg_argv[0] and subject_id = old.id;
  return old;
end;
$$;

do $$ begin
  create trigger trg_embeddings_cleanup_document
    after delete on public.documents
    for each row execute function public.garvis_embeddings_cleanup('document');
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_embeddings_cleanup_artifact
    after delete on public.knowledge_artifacts
    for each row execute function public.garvis_embeddings_cleanup('artifact');
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_embeddings_cleanup_cluster
    after delete on public.knowledge_clusters
    for each row execute function public.garvis_embeddings_cleanup('cluster');
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_embeddings_cleanup_business
    after delete on public.business_profiles
    for each row execute function public.garvis_embeddings_cleanup('business');
exception when duplicate_object then null; end $$;

-- One-time sweep: vectors whose subject rows are already gone (the debt this migration retires).
delete from public.embeddings e
 where (e.subject_type = 'document' and not exists (select 1 from public.documents d where d.id = e.subject_id))
    or (e.subject_type = 'artifact' and not exists (select 1 from public.knowledge_artifacts a where a.id = e.subject_id))
    or (e.subject_type = 'cluster'  and not exists (select 1 from public.knowledge_clusters c where c.id = e.subject_id))
    or (e.subject_type = 'business' and not exists (select 1 from public.business_profiles b where b.id = e.subject_id));

-- ---- 2. command_messages.mission_id becomes a real edge ---------------------------------------

do $$ begin
  alter table public.command_messages
    add constraint command_messages_mission_fk
    foreign key (mission_id) references public.garvis_missions(id) on delete set null
    not valid;
exception when duplicate_object then null; end $$;

-- ---- 3. credit grants join the ledger ----------------------------------------------------------

create or replace function public.refresh_credits(p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_plan plan_tier; v_balance int; v_start timestamptz; v_grant int;
begin
  select plan, credits_balance, credits_period_start into v_plan, v_balance, v_start
    from public.profiles where id = p_user for update;
  if not found then return 0; end if;
  if v_start is null or now() >= v_start + interval '1 month' then
    v_grant := public.plan_monthly_credits(v_plan);
    v_balance := v_grant;
    update public.profiles set credits_balance = v_balance, credits_period_start = now() where id = p_user;
    -- The grant is now ON the ledger: balance = Σ grants − Σ spends becomes checkable arithmetic.
    insert into public.usage_events (user_id, event_type, cost_usd, credits)
      values (p_user, 'credit_grant', 0, v_grant);
  end if;
  return v_balance;
end;
$$;
