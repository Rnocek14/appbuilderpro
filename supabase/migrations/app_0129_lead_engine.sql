-- app_0129_lead_engine.sql — THE LEAD ENGINE: public commercial signals become scored, tracked
-- leads for the trades. Permit portals, liquor boards, and registries are scraped on the standing
-- clock, normalized into verbatim events, scored per trade by the pure core, and delivered as
-- digests THROUGH THE APPROVALS QUEUE — this module reads and records only; nothing outbound
-- happens here. Outcomes the customer reports back are the moat: close-rate-by-event-type data,
-- and a 'won' outcome mints an ordinary commission invoice (source='commission') so the Money
-- loop's chase ladder and scorecard revenue work unchanged.
--
-- Additive + idempotent. Strategy docs: docs/lead-engine-master-plan.md.

-- 1) standing_orders learns the 'lead_engine' kind (the app_0126 pattern — FULL union, always) --
alter table public.standing_orders drop constraint if exists standing_orders_kind_check;
alter table public.standing_orders
  add constraint standing_orders_kind_check
  check (kind in ('watch_url', 'cadence_digest', 'client_hunt', 'idea_stream', 'content_week', 'opportunity_hunt', 'area_study', 'episode_draft', 'lead_engine'));

-- 2) le_sources — one row per data source per market world -------------------------------------
create table if not exists public.le_sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  world_id uuid not null references public.knowledge_worlds(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('socrata', 'arcgis', 'accela', 'liquor', 'health', 'sos', 'rss')),
  base_url text not null,
  query_config jsonb not null default '{}'::jsonb,  -- adapter params: dataset id, where-clause, field map
  region text not null default '',                  -- human label: "Denver, CO"
  active boolean not null default true,
  last_fetch_at timestamptz,
  last_status text,                                 -- honest one-liner of the last fetch
  consecutive_failures int not null default 0,      -- 5 → active=false + loud mind_event (app_0113 pattern)
  cursor jsonb not null default '{}'::jsonb,        -- incremental position (e.g. last seen issue date)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.le_sources enable row level security;
drop policy if exists "le_sources owner all" on public.le_sources;
-- with-check pins world_id to a world THIS owner owns (the app_0059 IDOR defense); the worker
-- re-verifies ownership at run time too.
create policy "le_sources owner all" on public.le_sources
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid())
  );

create index if not exists idx_le_sources_world on public.le_sources(world_id, active);

-- 3) le_events — one normalized row per real-world signal. Verbatim-only (the opportunities rule):
--    nothing invented, every row traceable to source_url; null means the record didn't say. -----
create table if not exists public.le_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  world_id uuid not null references public.knowledge_worlds(id) on delete cascade,
  source_id uuid references public.le_sources(id) on delete set null,  -- provenance
  event_type text not null check (event_type in ('permit_issued', 'permit_applied', 'liquor_license', 'health_permit', 'business_registered', 'news')),
  occurred_at timestamptz,                          -- the record's own date, else null (never guessed)
  address text,
  region text not null default '',
  valuation_usd numeric,                            -- verbatim from the record, else null
  title text not null,
  description text,
  named_parties jsonb not null default '[]'::jsonb, -- [{role, name, company?}] straight from the record
  raw jsonb not null default '{}'::jsonb,           -- the source row as fetched (audit trail)
  source_url text not null,
  dedupe_key text not null,                         -- leadEngine.dedupeKey: type :: normalized address :: date bucket
  found_at timestamptz not null default now(),
  unique (owner_id, dedupe_key)
);

alter table public.le_events enable row level security;
drop policy if exists "le_events owner all" on public.le_events;
create policy "le_events owner all" on public.le_events
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid())
  );

create index if not exists idx_le_events_world_found on public.le_events(world_id, found_at desc);
create index if not exists idx_le_events_owner_type on public.le_events(owner_id, event_type, found_at desc);

-- 4) le_leads — an event scored for a trade. Status ladder mirrors prospects/stage.ts. ----------
create table if not exists public.le_leads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  world_id uuid not null references public.knowledge_worlds(id) on delete cascade,
  event_id uuid not null references public.le_events(id) on delete cascade,
  trade text not null,                              -- leadEngine.TRADES key: 'acoustics', 'security', …
  score int not null default 0,
  score_reasons jsonb not null default '[]'::jsonb, -- the pure core's honest why-this-score lines
  contact_name text,                                -- from named_parties, else null — never invented
  contact_company text,
  contact_email text,
  contact_phone text,
  why_now text not null default '',                 -- one sourced sentence, composed from record fields only
  status text not null default 'new' check (status in ('new', 'delivered', 'contacted', 'quoted', 'won', 'lost', 'skipped')),
  delivered_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, event_id, trade)
);

alter table public.le_leads enable row level security;
drop policy if exists "le_leads owner all" on public.le_leads;
create policy "le_leads owner all" on public.le_leads
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid())
  );

create index if not exists idx_le_leads_world_status on public.le_leads(world_id, status, score desc);
create index if not exists idx_le_leads_owner_created on public.le_leads(owner_id, created_at desc);

-- 5) le_outcomes — the moat table: what actually happened to a delivered lead. Append-mostly;
--    a 'won' with a value mints a commission invoice (source='commission') via the Money loop. ---
create table if not exists public.le_outcomes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  world_id uuid not null references public.knowledge_worlds(id) on delete cascade,
  lead_id uuid not null references public.le_leads(id) on delete cascade,
  reported_by text not null default 'owner' check (reported_by in ('customer', 'owner')),
  result text not null check (result in ('quoted', 'won', 'lost', 'no_contact')),
  contract_value_usd numeric,                       -- null = not disclosed (never guessed)
  commission_invoice_id uuid references public.invoices(id) on delete set null,
  notes text,
  reported_at timestamptz not null default now()
);

alter table public.le_outcomes enable row level security;
drop policy if exists "le_outcomes owner all" on public.le_outcomes;
create policy "le_outcomes owner all" on public.le_outcomes
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid())
  );

create index if not exists idx_le_outcomes_lead on public.le_outcomes(lead_id, reported_at desc);

-- 6) le_verifications — Phase 2 ready: a verification row CANNOT exist without recording that the
--    line was a business line and the AI disclosed itself (compliance at the schema level). ------
create table if not exists public.le_verifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  lead_id uuid not null references public.le_leads(id) on delete cascade,
  method text not null check (method in ('manual', 'ai_call')),
  called_number text,
  business_line boolean not null,
  disclosed_ai boolean not null,
  transcript text,
  result text not null check (result in ('confirmed', 'changed', 'dead', 'no_answer')),
  cost_usd numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table public.le_verifications enable row level security;
drop policy if exists "le_verifications owner all" on public.le_verifications;
create policy "le_verifications owner all" on public.le_verifications
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create index if not exists idx_le_verifications_lead on public.le_verifications(lead_id, created_at desc);
