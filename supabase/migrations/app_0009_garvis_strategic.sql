-- FableForge PLATFORM migration (not a generated-app migration).
-- Garvis STRATEGIC layer — the second triage lens: the founder's JUDGMENT of what matters.
--   * apps.strategic_importance — core | supporting | experimental (null = unclassified)
--   * apps.strategic_role        — one line on WHY it matters / its platform role / relationship to others
--
-- Why on `apps` (a durable judgment) and NOT in garvis_app_profiles (a generated fact):
--  * Strategic importance is NOT derivable from a repo. An LLM reading code can't know that a quiet,
--    undeployed project is "core" because it becomes the intelligence layer later — that's the founder's
--    vision. Putting it in the regenerable profile would have the model GUESS strategy from operational
--    signals, the exact failure that nearly archived FableForge in the triage dry-run.
--  * So it lives with the other durable per-product judgments (stage, goals) on the apps row. Garvis may
--    PROPOSE an importance for unclassified apps, but the authoritative value is owner-set.
--  * 'archived' is a lifecycle/stage, NOT an importance — kept orthogonal. Additive + idempotent.

do $$ begin create type strategic_importance as enum ('core','supporting','experimental');
exception when duplicate_object then null; end $$;

alter table public.apps add column if not exists strategic_importance strategic_importance;
alter table public.apps add column if not exists strategic_role text;
