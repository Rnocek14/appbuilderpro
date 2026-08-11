-- app_0138_demo_lead_rail.sql — THE DEMO SITES JOIN THE LEAD RAIL. The cold pitch's boldest
-- sentence ("every enquiry is captured, instantly acknowledged, and chased when it goes quiet")
-- described a rail only world-bound sites were wired to: generated demo/published client sites
-- post their forms to claim-submit, which until now dropped a publish_request and stopped —
-- no lead row, no acknowledgment, no chase. claim-submit now runs the same capture rail as
-- site-events (shared _shared/leadIntake.ts), which needs two things of the leads table:
--
--   * world_id nullable — a hunted prospect's demo site belongs to no knowledge world
--     (client_hunt standing orders are world-less by design). The world remains the join for
--     world-bound sites; a null world means "came in through a demo/published client site".
--   * preview_site_id — the attribution the demo path DOES have. Which generated site produced
--     this lead is the operator's routing fact (which client, which business).
--
-- Additive + idempotent; no rows change meaning (every existing lead keeps its world).

alter table public.leads alter column world_id drop not null;

alter table public.leads add column if not exists preview_site_id uuid references public.preview_sites(id) on delete set null;

create index if not exists idx_leads_preview_site on public.leads(preview_site_id, created_at desc);
