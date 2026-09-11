-- app_0156_stalled_watchdog.sql — the stalled-build watchdog (SW10.6). A generation that dies
-- mid-pages (closed tab, crashed worker) currently sits 'running' forever. The standing-worker
-- tick now notices: `updated_at` (touched on every stage mark) goes stale for 10+ minutes →
-- enqueue ONE server resume job (SW10.5). `resume_attempts` caps the loop at 2 — after that the
-- row flips to a NAMED failed state instead of burning credits forever. Additive + idempotent.

alter table public.project_generations add column if not exists resume_attempts int not null default 0;
alter table public.project_generations add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_project_generations_touch on public.project_generations;
create trigger trg_project_generations_touch before update on public.project_generations
  for each row execute function public.touch_updated_at();

create index if not exists idx_generations_stalled on public.project_generations(status, updated_at);
