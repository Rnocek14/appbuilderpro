-- SUBJECT VARIANT — which subject-line angle a cold pitch used (pitchCraft's deck: control /
-- built / ready / question). The cold path sent ONE hardcoded subject since app_0023 while opens
-- and clicks were already tracked per message (app_0081) — so the learning loop had data on one
-- side and nothing to group it by on the other. This column closes that: opens-per-angle becomes
-- a plain GROUP BY. Nullable text, no check constraint — the variant deck is application code and
-- may grow angles without a migration; rows from before this migration simply have null (they
-- were all the control subject). Additive + idempotent.

alter table public.outreach_messages add column if not exists subject_variant text;
