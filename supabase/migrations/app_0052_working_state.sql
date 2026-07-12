-- app_0052_working_state.sql — THE WORKING SET (design review P1): the durable "what I'm holding
-- right now" row, one per owner (additive, idempotent).
--
-- The review's flow audit found context bussed through localStorage at every seam: the summoned
-- canvas died on a device switch, next-move dismissals reappeared on the phone after being
-- dismissed on the laptop, and the world→builder brief evaporated with a cleared cache. This row
-- is the baton: Command, Explore, studios, and the builder read and write the SAME object, so
-- handoffs stop being handoffs. localStorage remains a same-device cache, never the truth.

create table if not exists public.working_state (
  owner_id    uuid primary key references public.profiles(id) on delete cascade,
  -- the summoned Command canvas (mailer | video | explore), restored on any device
  canvas      jsonb,
  -- the world/constellation → builder handoff: { brief: {prompt, brief}, world: WorldBuildHandoff }
  build_brief jsonb,
  -- next-move dismissals: { [moveKey]: dismissedAtIso } — travels with the owner, not the browser
  dismissals  jsonb not null default '{}'::jsonb,
  -- when the waking digest was last actually seen (away-lines window)
  last_seen_at timestamptz,
  updated_at  timestamptz not null default now()
);

comment on table public.working_state is
  'One row per owner: the traveling working set (canvas, build brief, dismissals, last-seen). The first graph node of the record-is-the-interface plan.';

alter table public.working_state enable row level security;

do $$ begin
  create policy "working_state owner all" on public.working_state
    for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
exception when duplicate_object then null; end $$;
