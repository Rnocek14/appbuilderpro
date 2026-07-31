-- app_0122_area_study_order.sql
-- THE COUNTY STUDY MOVES TO THE SERVER — a standing-order kind for unattended area sweeps.
--
-- The interactive sweep (areaSweep.ts) runs in the operator's browser tab: close the laptop and a
-- 100-query county run dies mid-flight. Everything it persists survives (that was designed in), but
-- "leave it running overnight" — the way a study of any real size actually gets collected — needs
-- the heartbeat, not a tab. This adds the 'area_study' kind; the runner lives in standing-worker.
--
-- HOW IT RUNS, and why the config carries a CURSOR: a county plan is towns × synonyms ≈ 100+
-- paginated Places queries plus an audit per find. One 15-minute heartbeat tick should not attempt
-- all of it — a long tick risks the function's time budget and a mid-run crash loses nothing but
-- looks like everything. So each tick processes a SLICE of the plan and advances config.cursor;
-- while unfinished, next_run_at is set to now (the next tick continues immediately); when the
-- cursor reaches the end, the cohort is completed and the order pauses itself — done, visibly,
-- with the study attached. A stopped or crashed tick resumes exactly where the cursor points,
-- because every audit and membership row was persisted the moment it happened.
--
-- Same pattern as 0079/0080/0092: the kind check is dropped and re-added with the full union —
-- the constraint's history IS the list of things the clock has learned to run.

alter table public.standing_orders drop constraint if exists standing_orders_kind_check;
alter table public.standing_orders
  add constraint standing_orders_kind_check
  check (kind in ('watch_url', 'cadence_digest', 'client_hunt', 'idea_stream', 'content_week', 'opportunity_hunt', 'area_study'));
