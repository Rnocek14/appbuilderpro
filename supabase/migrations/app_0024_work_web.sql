-- FableForge PLATFORM migration (not a generated-app migration).
-- WORK WEB v0 — missions stop being checklists and become living work webs.
--
-- The idea (docs/garvis-system-architecture.md §10b): the unit of Garvis work is a TERRITORY (a
-- knowledge world). The territory decomposes into PRODUCTION AREAS (clusters). Each production area
-- is three things at once: a thought (it lives in the knowledge graph), a workspace (it has tools),
-- and a ledger (its outputs and results accumulate on it). What turns a thought into a production
-- area is a CHARTER — pure data, not code:
--
--   knowledge_clusters.charter = {
--     "archetype": "intel|audience|studio|launch|loop|ledger|vault",
--     "flavor":    "generic|direct_mail|email|social|video|landing|market|brand|crm|lists",
--     "status":    "dormant|active|waiting|done",
--     "refs":      [{"type":"campaign|document|preview_site|app", "id":"...", "label":"..."}]
--   }
--
-- The tool registry that maps (archetype, flavor) → tools is client code (src/lib/garvis/workweb.ts,
-- single source of truth, verified) — the DB only stores the charter. NULL charter = a plain thought.
-- This is deliberately ONE jsonb column on the existing clusters table, not a parallel table: the
-- whole point is that an idea cluster CAN become an execution cluster without moving anywhere.
--
-- Bindings added:
--   * garvis_missions.world_id    — a mission is a campaign THROUGH a territory; the territory
--                                   persists across missions (campaign #2 starts warmer than #1).
--                                   NOT app_id repurposed — app_id keeps meaning "portfolio app".
--   * outreach_campaigns.world_id — outreach born in a web rolls up to that web's ledger clusters.
--
-- Additive + idempotent. Apply AFTER app_0013/app_0018 (universe) and app_0022/app_0023.

-- ---------- the charter ----------
alter table public.knowledge_clusters add column if not exists charter jsonb;
comment on column public.knowledge_clusters.charter is
  'Work Web charter: {archetype, flavor, status, refs[]}. NULL = plain thought (not a production area). Registry: src/lib/garvis/workweb.ts';

-- Fast "which worlds are work webs" lookups (a web = a world with >=1 chartered cluster).
create index if not exists idx_ku_clusters_chartered on public.knowledge_clusters(world_id)
  where charter is not null;

-- ---------- mission ↔ territory ----------
alter table public.garvis_missions add column if not exists world_id uuid
  references public.knowledge_worlds(id) on delete set null;
create index if not exists idx_missions_world on public.garvis_missions(world_id);

-- ---------- outreach ↔ territory (per-web results rollups) ----------
alter table public.outreach_campaigns add column if not exists world_id uuid
  references public.knowledge_worlds(id) on delete set null;
create index if not exists idx_ocampaigns_world on public.outreach_campaigns(world_id);
