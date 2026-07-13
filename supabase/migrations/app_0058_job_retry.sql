-- app_0058_job_retry.sql — deep scan (deferred item, now done): the job-worker marked a job 'failed'
-- on ANY thrown error, so a transient AI/network 5xx killed the whole build. This adds a bounded
-- transient-retry counter; the worker requeues with a backoff lease (claim_next_job already gates on
-- lease_until) instead of failing, and resets the counter on real progress. Additive + idempotent.

alter table public.jobs add column if not exists retry_count int not null default 0;
