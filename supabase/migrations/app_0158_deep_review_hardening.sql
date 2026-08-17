-- app_0158_deep_review_hardening.sql — schema-level fixes from the SW10 deep review
-- (2026-08-17, five adversarial passes over SW9.7–SW10.12). Additive + idempotent.

-- ---------- 1. jobs: count CLAIMS of a still-'running' job as retry attempts ----------
-- A step killed by the wall clock never throws, so the worker's catch never counted it: the job
-- re-claimed every lease expiry forever, re-billing the model each time with no cap. Re-claiming
-- a job that is still 'running' means the previous invocation died mid-step — that IS a retry.
-- The worker resets retry_count to 0 after every completed step, so legitimate long jobs are
-- untouched; only claim-die loops accumulate, and the worker terminal-fails past the ceiling.
create or replace function public.claim_next_job() returns setof public.jobs
language plpgsql security definer set search_path = public as $$
declare j public.jobs;
begin
  select * into j from jobs
  where status in ('queued', 'running')
    and (lease_until is null or lease_until < now())
  order by priority desc, created_at
  limit 1
  for update skip locked;
  if not found then return; end if;
  update jobs set status = 'running',
    retry_count = case when j.status = 'running' then j.retry_count + 1 else j.retry_count end,
    lease_until = now() + interval '10 minutes',
    updated_at = now()
  where id = j.id
  returning * into j;
  return next j;
end; $$;
revoke execute on function public.claim_next_job() from anon, authenticated;

-- ---------- 2. jobs: ONE live generation-resume per project, enforced by the engine ----------
-- The watchdog and the client both check-then-insert; two concurrent ticks could both pass the
-- check. The partial unique index turns that race into an insert conflict.
create unique index if not exists idx_jobs_one_live_resume
  on public.jobs(project_id)
  where kind = 'generation_resume' and status in ('queued', 'running', 'paused', 'waiting_approval');

-- ---------- 3. mail_pieces: lob_id is unique and indexed ----------
-- Every webhook event looks a piece up by lob_id: without an index it seq-scans, and without
-- uniqueness a duplicate would turn maybeSingle() into a permanent 500/Lob-retry loop.
create unique index if not exists idx_mail_pieces_lob_id
  on public.mail_pieces(lob_id) where lob_id is not null;

-- ---------- 4. email_flow_members: clients READ drip state; only the clock writes it ----------
-- The "owner all" policy let a browser session forge steps_sent (collapsing every delay), clear
-- replied_at (resurrecting an ended drip), or enroll another owner's contact id (a cross-tenant
-- existence oracle). All legitimate writes are service-role (the standing-worker sweep, which
-- bypasses RLS); the client only ever reads stats — so the policy shrinks to select-only.
drop policy if exists "email_flow_members owner all" on public.email_flow_members;
drop policy if exists "email_flow_members owner read" on public.email_flow_members;
create policy "email_flow_members owner read" on public.email_flow_members
  for select using (owner_id = auth.uid());
