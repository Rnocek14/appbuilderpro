-- app_0028_genesis.sql — PROJECT GENESIS: worlds born from intent, not hand-coded templates.
--
-- The pipeline is Intent → World DNA → generated Work Web (docs/garvis-genesis-blueprint.md).
-- Genesis generates DATA that existing validators accept — the same 7 archetypes, the same tool
-- registry, the same approval spine. This migration adds only the storage that pipeline needs:
--
--   * web_templates    — generated (and future builtin-mirrored) templates as rows: the World DNA
--                        (business synthesis: type, revenue model, customers, value prop, sales
--                        cycle, brand, assets, channels, loop, metrics, constraints), the template
--                        nodes, the data-driven play, the RATIONALE (why each cluster exists and
--                        what was deliberately omitted — trust requires the why), open questions,
--                        intake requests, and first moves. status: draft → instantiated. Nothing
--                        becomes a world without explicit approval.
--   * knowledge_worlds — gains dna + business_context so every generated world carries its own
--                        voice; generators read THE WORLD's context, never another world's.
--
-- Additive + idempotent. Apply after app_0024 (work web) and app_0027 (world intelligence).

create table if not exists public.web_templates (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles(id) on delete cascade,
  title            text not null,
  description      text not null default '',
  objective        text,
  dna              jsonb,                          -- WorldDNA (genesis.ts)
  business_context jsonb,                          -- merge tokens for generators
  template         jsonb not null,                 -- WebTemplate nodes (validated before save)
  play             jsonb,                          -- PlayData: data-driven steps + email sequence
  rationale        jsonb not null default '{}',    -- {clusters: {slug: why}, omissions: [{what, why}]}
  questions        jsonb not null default '[]',    -- what genesis could not know and refused to invent
  intake_requests  jsonb not null default '[]',    -- assets the user should upload
  first_moves      jsonb not null default '[]',
  source           text not null default 'generated' check (source in ('generated', 'builtin', 'edited')),
  status           text not null default 'draft'   check (status in ('draft', 'instantiated', 'archived')),
  world_id         uuid references public.knowledge_worlds(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.web_templates enable row level security;

drop policy if exists "web_templates owner all" on public.web_templates;
create policy "web_templates owner all" on public.web_templates
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "web_templates admin read" on public.web_templates;
create policy "web_templates admin read" on public.web_templates
  for select using (public.is_admin());

create index if not exists idx_web_templates_owner_status on public.web_templates(owner_id, status);
create index if not exists idx_web_templates_world on public.web_templates(world_id);

drop trigger if exists trg_web_templates_touch on public.web_templates;
create trigger trg_web_templates_touch before update on public.web_templates
  for each row execute function public.touch_updated_at();

-- The world carries its own DNA and voice after instantiation.
alter table public.knowledge_worlds add column if not exists dna jsonb;
alter table public.knowledge_worlds add column if not exists business_context jsonb;
