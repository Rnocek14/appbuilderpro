-- app_0083_approvals_world.sql — APPROVALS SAY WHICH BUSINESS THEY BELONG TO.
-- The multi-business audit: with several brands, the Queue read "Post to Instagram" / "Send X to
-- 41 contacts" with no brand attribution — approving meant guessing the business from the copy.
-- Additive column, stamped by enqueueApproval when the caller knows its world; old rows stay null
-- and render without a badge (honest: we don't invent attribution for history).

alter table public.approvals add column if not exists world_id uuid references public.knowledge_worlds(id) on delete set null;
create index if not exists idx_approvals_world on public.approvals(world_id) where world_id is not null;
