-- FableForge PLATFORM migration (not a generated-app migration).
-- CONTACTS DEDUPE — one contact per (owner, email). Closes the duplicate-contact → duplicate-send
-- path the Work Web review surfaced: without this constraint, re-uploading a mailing list or
-- queueing the same recipient twice created duplicate contact rows, and every code path that
-- "select-then-insert"s a contact had a non-atomic race. With this index in place, all contact
-- writes become upserts on (owner_id, email) — atomic and idempotent.
--
-- Full (not partial) unique index so PostgREST's onConflict:'owner_id,email' can use it. email is
-- nullable and Postgres keeps NULLs distinct, so contacts with no email never conflict. Safe on a
-- fresh table (contacts is created empty in app_0023); creating the index before any rows exist
-- means no duplicate-collision risk. Idempotent.
--
-- Apply AFTER app_0023 (contacts). Must run before/with the Work Web contact upserts.

create unique index if not exists uq_contacts_owner_email
  on public.contacts(owner_id, email);
