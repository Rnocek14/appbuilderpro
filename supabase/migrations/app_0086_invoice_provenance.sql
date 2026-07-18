-- app_0086_invoice_provenance.sql — REVENUE KNOWS WHERE IT CAME FROM.
-- The audit's money-path gap: invoices had no origin. "Collected $1,500" couldn't answer WHICH
-- campaign, lead, or won deal earned it — so the scorecard's revenue line never taught anything.
-- Additive provenance: source ('manual' for the form, 'garvis_tool' for the assistant, 'won_deal'
-- for the client-book path) plus optional links to the lead, the originating marketing campaign
-- (distinct from the kind='invoice' send-vehicle campaign minted at send time), and the
-- client_subscriptions row when the invoice bills a won client. Old rows read 'manual' — honest,
-- because the form was the only path when they were created.

alter table public.invoices add column if not exists source text not null default 'manual';
alter table public.invoices add column if not exists lead_id uuid references public.leads(id) on delete set null;
alter table public.invoices add column if not exists campaign_id uuid references public.outreach_campaigns(id) on delete set null;
alter table public.invoices add column if not exists client_subscription_id uuid references public.client_subscriptions(id) on delete set null;
create index if not exists idx_invoices_subscription on public.invoices(client_subscription_id) where client_subscription_id is not null;
