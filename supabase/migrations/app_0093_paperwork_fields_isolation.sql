-- PAPERWORK FIELD PERSISTENCE + WORLD ISOLATION (July 2026 scan, defects B7 + B8).
--
-- B7: template extraction produced field labels + grounded hints and the save path THREW THEM
-- AWAY — paperwork_templates had no column for them, so the fill form showed bare token names.
-- fields: [{ token, label, hint }] — persisted verbatim from the reviewed extraction.
--
-- B8 (part): the Money page can now split by business — invoices had world_id since app_0047
-- but no read ever filtered on it; the new composite index makes the per-world list cheap.
-- Additive + idempotent.

alter table public.paperwork_templates add column if not exists fields jsonb not null default '[]'::jsonb;

create index if not exists idx_invoices_owner_world on public.invoices(owner_id, world_id, created_at desc);
