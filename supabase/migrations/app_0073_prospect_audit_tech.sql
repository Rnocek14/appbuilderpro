-- app_0073_prospect_audit_tech.sql — keep the tech fingerprint alongside the honest audit.
--
-- fetch-url now reads the tech a business runs from their own raw HTML (site builder, booking widget,
-- analytics/ad pixels, live-chat, storefront) — the single best qualifier for both a rebuild and an
-- automation pitch. This adds one column to hold it, so detection can ground platform:* / stack:*
-- signals in a real observed tag instead of a text guess.
--
-- Same honesty rule as the rest of the table: the fingerprint claims only signatures really present in
-- the markup; an absent one is null/empty, never a guess. Old rows default to '{}' (unknown, not
-- computed) and detection treats an empty object as "no tech signal", never as "nothing installed".
--
-- Additive + idempotent.

alter table public.prospect_audits
  add column if not exists tech jsonb not null default '{}'::jsonb;
