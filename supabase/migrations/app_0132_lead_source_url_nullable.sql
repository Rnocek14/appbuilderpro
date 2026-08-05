-- app_0132_lead_source_url_nullable.sql — "NO DIRECT LINK" MUST BE SAYABLE.
-- app_0129 declared le_events.source_url NOT NULL, and the adapter satisfied it by silently
-- falling back to the source's base_url whenever no permalink was mapped — which was every
-- preset. So every digest line linked the DATASET ENDPOINT while the product's core promise is
-- "every lead links its public record" (docs/lead-engine-capture-spec.md §6.6, §10.4). A link to
-- the whole feed presented as the record is worse than no link: it is the trust device pointing
-- at the wrong thing.
--
-- The fix is in the adapter (a real permalink column, else a per-record URL template, else NULL),
-- and it needs the column to accept NULL so the honest answer is representable. The UI and the
-- digest then say "no direct link" instead of linking the endpoint.
--
-- Additive + idempotent: dropping a NOT NULL is a no-op when already dropped, and no existing row
-- changes (they keep whatever URL they were stored with).

alter table public.le_events alter column source_url drop not null;

-- The record-identity read path: the dedupe fix keys on (jurisdiction, source_record_id), and the
-- ingest reads back by dedupe_key to detect a portal-side edit before writing.
create index if not exists idx_le_events_hash on public.le_events(owner_id, dedupe_key, content_hash);
