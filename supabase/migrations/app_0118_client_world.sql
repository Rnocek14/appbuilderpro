-- app_0118_client_world.sql
-- CLIENT ⇄ WORLD LINKAGE (operating model D6/counterparty; capability-audit 04/10). The two client
-- nouns were parallel and unconnected: client_subscriptions (the money) had no world_id, and
-- close-won never created a world — so "the client's world" that every scoped ledger, report, and
-- fleet rollup needs did not exist as a link. One column closes it; closeCampaignWon now creates
-- the client's world at the moment of the yes and links both nouns to it.
alter table public.client_subscriptions
  add column if not exists world_id uuid references public.knowledge_worlds(id) on delete set null;
create index if not exists idx_client_subscriptions_world on public.client_subscriptions(world_id);

comment on column public.client_subscriptions.world_id is
  'The client''s world — created at close-won. Every ledger row, watch, report, and fleet rollup for this client scopes through it.';
