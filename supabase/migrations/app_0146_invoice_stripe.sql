-- app_0146: invoices learn HOW they were paid (SW7.1 — Stripe auto-reconciliation).
-- paid_via: 'stripe' when the webhook reconciled the payment from a Payment Link;
-- null/'manual' when the operator confirmed it by hand (the existing markInvoicePaid path).
-- Additive + idempotent, like every migration in this tree.

alter table public.invoices add column if not exists paid_via text;
