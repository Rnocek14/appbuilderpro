-- app_0150_approval_risk.sql — SW8.3: the approval risk annotation. The worker scores pending
-- approvals from deterministic features (approvalRisk.ts) and stores the verdict here; the
-- Queue renders the chip with its named reasons; autonomyGate treats a high (or absent) score
-- as "manual". The classifier can only ADD review — these columns never grant anything.
-- Additive + idempotent. Written by the service role; the owner's existing row policies make
-- them owner-readable (an owner rewriting their own risk chip only lies to themself — the
-- GATE recomputes from raw facts and never trusts these columns).

alter table public.approvals add column if not exists risk_score int;
alter table public.approvals add column if not exists risk_reasons jsonb;
