-- app_0073_cluster_working_state.sql — a small per-cluster scratch store so a studio/canvas REMEMBERS
-- what you were working on across reloads, instead of resetting to a blank "set it up" prompt every
-- visit. The marketing canvas uses it to persist the current campaign details, so reopening a
-- business shows your real work — the #1 "it feels empty" complaint. jsonb, and the existing
-- knowledge_clusters RLS (owner-scoped) already governs reads/writes. Additive + idempotent.
--
-- HONESTY: this holds WORKING state only (what you're in the middle of). Finished, made artifacts
-- stay in knowledge_artifacts — this column is never a source of truth for "work that happened".
alter table public.knowledge_clusters add column if not exists working_state jsonb;
