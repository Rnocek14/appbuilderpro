-- app_0092_execution_truth.sql — exact run identity + resumable Garvis questions.
--
-- Interactive callers used to INSERT a run and then claim "the next" run. With an older queued
-- row (or the unattended worker racing the browser), the command could execute a different run.
-- claim_agent_run() is an owner-scoped compare-and-swap for the exact row the caller created.
--
-- Agent runs could also enter waiting_approval with a question but had no state transition back to
-- queued. resume_agent_run() appends the human answer to the checkpoint history atomically and
-- requeues that exact run. This is a clarification seam, distinct from consequence approvals.

create or replace function public.create_and_claim_agent_run(
  p_kind text,
  p_title text,
  p_phase text,
  p_budget_usd numeric,
  p_input text,
  p_app_id uuid default null
)
returns setof public.agent_runs
language plpgsql security definer set search_path = public as $$
declare r public.agent_runs;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if p_kind not in ('research', 'content', 'build', 'analyze', 'recommend') then
    raise exception 'Invalid run kind.';
  end if;
  if p_phase not in ('observe', 'plan', 'act') then raise exception 'Invalid run phase.'; end if;
  -- SECURITY DEFINER bypasses RLS inside this function. Re-assert ownership for every
  -- caller-supplied foreign key so a run can never be attached to another owner's app.
  if p_app_id is not null and not exists (
    select 1 from public.apps where id = p_app_id and owner_id = auth.uid()
  ) then
    raise exception 'App not found.';
  end if;

  insert into public.agent_runs (
    owner_id, app_id, kind, title, status, phase, budget_usd, input, lease_until, started_at
  ) values (
    auth.uid(), p_app_id, p_kind, p_title, 'running', p_phase,
    greatest(coalesce(p_budget_usd, 0), 0), p_input,
    now() + interval '10 minutes', now()
  ) returning * into r;

  return next r;
end $$;

revoke execute on function public.create_and_claim_agent_run(text, text, text, numeric, text, uuid) from public;
revoke execute on function public.create_and_claim_agent_run(text, text, text, numeric, text, uuid) from anon;
grant execute on function public.create_and_claim_agent_run(text, text, text, numeric, text, uuid) to authenticated;

create or replace function public.claim_agent_run(p_run_id uuid)
returns setof public.agent_runs
language plpgsql security definer set search_path = public as $$
declare r public.agent_runs;
begin
  select * into r from public.agent_runs
  where id = p_run_id
    and owner_id = auth.uid()
    and (
      status = 'queued'
      or (status = 'running' and (lease_until is null or lease_until < now()))
    )
    and (next_attempt_at is null or next_attempt_at <= now())
  for update skip locked;

  if not found then return; end if;

  update public.agent_runs set
    status = 'running',
    lease_until = now() + interval '10 minutes',
    started_at = coalesce(started_at, now())
  where id = r.id
  returning * into r;

  return next r;
end $$;

revoke execute on function public.claim_agent_run(uuid) from public;
revoke execute on function public.claim_agent_run(uuid) from anon;
grant execute on function public.claim_agent_run(uuid) to authenticated;

create or replace function public.resume_agent_run(p_run_id uuid, p_answer text)
returns setof public.agent_runs
language plpgsql security definer set search_path = public as $$
declare
  r public.agent_runs;
  cp jsonb;
  hist jsonb;
  question text;
begin
  if length(trim(coalesce(p_answer, ''))) = 0 then
    raise exception 'An answer is required.';
  end if;

  select * into r from public.agent_runs
  where id = p_run_id
    and owner_id = auth.uid()
    and status = 'waiting_approval'
  for update;

  if not found then return; end if;

  cp := coalesce(r.checkpoint, jsonb_build_object('step', 0, 'history', '[]'::jsonb));
  hist := case when jsonb_typeof(cp->'history') = 'array' then cp->'history' else '[]'::jsonb end;
  question := nullif(trim(cp #>> '{pendingQuestion,question}'), '');

  -- New checkpoints already include the question as an assistant turn. Older waiting rows do
  -- not, so repair them during resume. In both cases the model receives the actual Q/A pair.
  if question is not null and not (
    jsonb_array_length(hist) > 0
    and hist->(jsonb_array_length(hist) - 1)->>'role' = 'assistant'
    and hist->(jsonb_array_length(hist) - 1)->>'content' = question
  ) then
    hist := hist || jsonb_build_array(jsonb_build_object('role', 'assistant', 'content', question));
  end if;
  hist := hist || jsonb_build_array(jsonb_build_object('role', 'user', 'content', trim(p_answer)));
  cp := jsonb_set(cp, '{history}', hist, true) - 'pendingQuestion';

  update public.agent_runs set
    status = 'queued',
    checkpoint = cp,
    output = null,
    error = null,
    lease_until = null,
    next_attempt_at = null
  where id = r.id
  returning * into r;

  return next r;
end $$;

revoke execute on function public.resume_agent_run(uuid, text) from public;
revoke execute on function public.resume_agent_run(uuid, text) from anon;
grant execute on function public.resume_agent_run(uuid, text) to authenticated;

-- Mission outcomes need to distinguish a mixed result from a clean review, and a user stop from a
-- failure. PostgreSQL enum additions are additive and keep every existing value untouched.
alter type public.mission_status add value if not exists 'partial';
alter type public.mission_status add value if not exists 'cancelled';

-- One generated project represents at most one portfolio product for an owner. This turns the
-- existing optional apps.project_id bridge into a dependable lifecycle identity.
create unique index if not exists uq_apps_owner_project
  on public.apps(owner_id, project_id)
  where project_id is not null;
