-- Per-message file changes: [{path, before, after, additions, deletions}] captured at the agent's
-- write layer for each chat turn. Powers the chat's per-message diff cards (the "show me exactly
-- what changed" trust feature) and message-level restore. Full contents, not patches — files are
-- small and it makes revert/re-render trivial.
alter table public.ai_messages add column if not exists changes jsonb;
