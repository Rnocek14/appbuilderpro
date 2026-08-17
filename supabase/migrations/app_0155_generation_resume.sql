-- app_0155_generation_resume.sql — server-side generation resume (SW10.5): the job-worker
-- learns a second job kind. `kind` separates the autopilot brief-builder from the generation
-- resumer; `payload` carries the resume's bookkeeping (the project_generations id it continues),
-- so a resume survives worker restarts statelessly — the missing-page list is re-derived from
-- the saved App.tsx on every step, never checkpointed. Additive + idempotent.

alter table public.jobs add column if not exists kind text not null default 'autopilot';
alter table public.jobs add column if not exists payload jsonb not null default '{}'::jsonb;
do $$ begin
  alter table public.jobs add constraint jobs_kind_chk check (kind in ('autopilot', 'generation_resume'));
exception when duplicate_object then null; end $$;
