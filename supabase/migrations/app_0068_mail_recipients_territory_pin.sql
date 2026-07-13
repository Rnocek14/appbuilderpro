-- app_0068_mail_recipients_territory_pin.sql — close the double-check finding: mail_recipients'
-- with-check pinned world ownership but NOT territory ownership. Because FKs bypass RLS, a user
-- could insert recipients referencing a territory they don't own (or one in a different world than
-- the row's world_id), and another owner's deleteTerritory cascade would then remove those rows.
-- Adds the territory-ownership pin so every recipient's territory_id must belong to the caller.
-- Additive + idempotent.

drop policy if exists "mail_recipients owner all" on public.mail_recipients;
create policy "mail_recipients owner all" on public.mail_recipients
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid())
    and exists (select 1 from public.farm_territories t where t.id = territory_id and t.owner_id = auth.uid())
  );
