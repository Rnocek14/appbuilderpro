-- app_0124_channel_money.sql — THE MONEY ROUTE on a growth channel. Attention is only worth what
-- it's routed into: every channel gets ONE destination (the app it promotes, the Etsy shop, the
-- affiliate landing page, the newsletter) whose link rides every episode caption, stamped with a
-- src tag (src=gc_<channel>) — so when the destination is one of the operator's own deployed
-- sites, the existing site_events → leads attribution chain answers "which channel sold this"
-- with real numbers, and any external destination still gets a countable UTM. Additive + idempotent.

alter table public.growth_channels add column if not exists cta_url   text not null default '';
alter table public.growth_channels add column if not exists cta_label text not null default '';
