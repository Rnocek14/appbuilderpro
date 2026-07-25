-- app_0112_send_sms_enum.sql
-- FIX (capability-audit fix-first ledger #1): the SMS rail shipped in app_0106 with
-- send-sms/index.ts requiring approval.kind = 'send_sms', and execution.ts typing it client-side —
-- but no migration ever added the value to the approval_kind enum (created app_0022; later alters
-- added only send_batch/send_for_signature/content_week/send_mail-class values). Every approval
-- insert with kind='send_sms' therefore failed at the DB, and the trigger-engine's SMS fires
-- silently burned each tick's fire budget while starving email automations queued behind them
-- (audit 09 §blast-radius). One line makes the rail real.
alter type public.approval_kind add value if not exists 'send_sms';
