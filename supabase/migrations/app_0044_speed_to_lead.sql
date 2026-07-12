-- app_0044_speed_to_lead.sql — SPEED-TO-LEAD: the instant first touch.
--
-- The evidence (MIT lead-response study; Velocify's 3.5M-lead analysis): answering a lead within
-- minutes makes contact ~100x more likely and lifts conversion ~4x — and almost nobody does it,
-- because humans sleep. This is Garvis's first STANDING RULE (tiered autonomy): the owner
-- pre-authorizes ONE narrow action class — a template acknowledgment to a brand-new inbound
-- lead — and everything else stays per-send approval.
--
-- HONESTY + SAFETY BY CONSTRUCTION:
--   - Off by default. Turning it on requires outbound_enabled + from_email + physical_address
--     (the same CAN-SPAM floor as every send).
--   - The send still flows through the ONE send path (send-email) with every gate re-verified
--     server-side: fail-closed suppression, kill switch, daily cap + warmup, double-send CAS.
--   - The template is the owner's own words with {{first_name}}/{{business}} fills — no AI
--     invention at 11pm, no fabricated claims.
--   - Every instant touch is a normal approvals row (requested_by 'garvis-auto', decided_via
--     'standing_rule') + execution_runs ledger entry — same audit trail as a human-clicked send.
--   - leads.first_touch_at records exactly when (and whether) the lead was answered instantly.
-- Additive + idempotent.

alter table public.outreach_settings add column if not exists auto_first_touch boolean not null default false;
alter table public.outreach_settings add column if not exists first_touch_subject text;
alter table public.outreach_settings add column if not exists first_touch_body text;

alter table public.leads add column if not exists first_touch_at timestamptz;
