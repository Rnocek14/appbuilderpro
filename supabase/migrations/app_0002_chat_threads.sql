-- FableForge PLATFORM migration (not a generated-app migration).
-- Adds conversation threads: each chat message can belong to a named thread so users can keep
-- separate flows (e.g. "dark mode" vs "billing") without tangling one idea into another.
--
-- Design notes:
--  * Single, additive, idempotent column. Existing rows keep thread_id = NULL, which the app
--    treats as the default "Main" thread — so nothing breaks and no backfill is required.
--  * Thread metadata (id, title, order) is stored client-side in the project's
--    /.fableforge/threads.json meta file, so no new table / RLS change is needed here.
--  * thread_id is a free-form text id minted by the client ('main' for the default thread).
--
-- Apply once against FableForge's own Supabase project (the one in .env), e.g. in the
-- Supabase SQL editor. Safe to re-run.

alter table public.ai_messages add column if not exists thread_id text;

-- Speeds up per-thread history lookups.
create index if not exists ai_messages_project_thread_idx
  on public.ai_messages (project_id, thread_id, created_at);
