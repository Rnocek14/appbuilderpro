-- app_0141_approval_expiry.sql — THE DECISION CLOCK, PART 1 (stamp + countdown). approvals
-- already carries expires_at (app_0022, never populated); mint sites now stamp per-kind TTLs
-- from _shared/approvalTtl.ts and the Queue renders the countdown. This migration adds only
-- reminded_at — the dedupe stamp the half-life nudge (best-in-class plan SW5.1) will consult
-- so an aged approval nags the operator exactly once per channel. The SWEEP that flips overdue
-- rows to 'expired' also waits for SW5.1: expiring work while the operator has no off-app
-- nudge channel would silently lapse decisions for exactly the away case this exists to serve.
--
-- Additive + idempotent.

alter table public.approvals
  add column if not exists reminded_at timestamptz;

comment on column public.approvals.reminded_at is
  'When the owner was nudged about this still-pending approval (half-life reminder, SW5.1); null = never nudged.';
