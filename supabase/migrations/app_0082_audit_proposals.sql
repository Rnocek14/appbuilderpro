-- app_0082_audit_proposals.sql — make "automation search" a QUERYABLE asset.
--
-- Detection results were recomputed client-side per render and thrown away — you could never ask
-- "which saved prospects need missed-call text-back?" across the audit pool. Store the proposed
-- capability ids on the audit row at write time. Additive + idempotent.

alter table public.prospect_audits add column if not exists proposals text[] not null default '{}';
create index if not exists idx_prospect_audits_proposals on public.prospect_audits using gin (proposals);
