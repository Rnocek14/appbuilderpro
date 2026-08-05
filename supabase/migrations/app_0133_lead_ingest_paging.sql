-- app_0133_lead_ingest_paging.sql — THE PAGING TRUTH IN THE RUN LOG.
-- The cursor skip (docs/lead-engine-capture-spec.md §6.6.2): the fetch sent `$limit=100` ordered
-- by the date field ASC with NO `$offset`, and the cursor then advanced to the max date seen. Any
-- single day with more than 100 qualifying records — routine for NYC and Chicago — moved the
-- watermark past that day and the remainder was NEVER fetched again. Silent, permanent loss in
-- exactly the highest-volume cities.
--
-- The fix pages within a tick ($offset / resultOffset) and, when a tick runs out of pages with the
-- window only part-read, keeps `le_sources.cursor.last_date` UNCHANGED and stores a
-- `cursor.page_offset` so the next tick resumes mid-window instead of stepping over the rest.
-- `cursor` is already free-form jsonb (app_0129), so the resume point needs no DDL.
--
-- What DOES need DDL is the honesty half: le_ingest_runs must be able to say how much of a window
-- a run actually read. Without these two columns a capped run and a drained run look identical in
-- the log, and "did we ever finish that day?" is unanswerable after the fact — the same class of
-- blindness §3.8 added the run log to end.
--
--   pages_fetched — pages actually read this run (1 for a normal tick, up to MAX_PAGES_PER_TICK).
--   capped        — true when the run stopped at the page cap with a full page still in hand, i.e.
--                   the window is provably NOT drained and cursor_after carries a page_offset.
--
-- Additive + idempotent: two `add column if not exists` with defaults; existing rows read as
-- "1 page, not capped", which is exactly what a pre-paging run was.

alter table public.le_ingest_runs add column if not exists pages_fetched int not null default 0;
alter table public.le_ingest_runs add column if not exists capped boolean not null default false;

-- "Which sources are still behind?" — the question the paging fix makes answerable, asked per
-- source over the recent runs.
create index if not exists idx_le_runs_capped on public.le_ingest_runs(source_id, started_at desc)
  where capped;
