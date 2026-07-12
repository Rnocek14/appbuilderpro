-- app_0051_invoice_number_unique.sql — invoice numbers get REAL uniqueness (additive).
--
-- The system scan found INV-year-NNN minted from a client-side row count with no constraint:
-- two tabs (or one same-tick double-click) could both read count=4 and both mint INV-2026-005,
-- silently. The unique index makes the second insert FAIL LOUDLY (23505), and the client now
-- re-mints and retries on that conflict. Numbers stay readable and monotonic-enough; they just
-- can't collide anymore.

create unique index if not exists invoices_owner_number_key
  on public.invoices (owner_id, number);
