-- app_0082_contacts_world.sql — CONTACTS BELONG TO A BUSINESS.
-- The multi-business audit's P0: contacts had owner_id but no world_id, so a batch launched from
-- one business's email board snapshotted the OWNER-GLOBAL list — a WealthCharts newsletter would
-- hit the real-estate farm (a consent problem, not just a UX one). A contact now belongs to the
-- business that acquired them; batch snapshots and segment counts filter on it.
--
-- Backfill assumption (stated, not hidden): every pre-existing contact was acquired in the
-- single-business era, so they are assigned to the owner's FIRST world. New uploads and
-- site-lead captures stamp world_id explicitly. Suppression stays owner-global on purpose —
-- an opt-out means the PERSON opted out, not one brand's copy of them.

alter table public.contacts add column if not exists world_id uuid references public.knowledge_worlds(id) on delete set null;
create index if not exists idx_contacts_owner_world on public.contacts(owner_id, world_id);

update public.contacts c
set world_id = w.first_world
from (
  select owner_id, (array_agg(id order by created_at asc))[1] as first_world
  from public.knowledge_worlds
  group by owner_id
) w
where c.owner_id = w.owner_id and c.world_id is null;
