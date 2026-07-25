-- app_0115_service_packages.sql
-- THE SERVICE-PACKAGE NOUN (capability-audit 04 §4, 10 §rollout; fix directive item 7).
-- Before this, "what a client buys" lived as two hardcoded offers in clientTiers.ts — no versioning,
-- no record of WHICH definition a client is on, and no honest answer to "roll an improvement out to
-- a cohort." The audits ruled this the one true ARCH-CHANGE that must land before any care-plan
-- feature, and the same definition/instance/pin shape doubles as automation versioning later.
--
-- Two tables, deliberately minimal:
--   * service_packages — a VERSIONED package definition. Built-ins ship owner_id-null (the
--     VerticalSpec convention); the operator's own packages carry their owner_id. `definition`
--     holds what the package ESTABLISHES on a client (watch, proposed automations, reporting
--     cadence) — data, not code, so a new offer is a row.
--   * package_pins — which package VERSION each client runs (one pin per client; upgrade =
--     re-pin), with a cohort tag so a future rollout can bake on a small group first. The pin is
--     the fleet-level answer to "which version is this client on?" — unanswerable before this.
--
-- Cohort ROLLOUT machinery (bake/promote/rollback) is deliberately NOT here — the roadmap's
-- do-not-build-yet list forbids cohort machinery before the noun. The noun carries the cohort tag;
-- the machinery comes when T-100 needs it.

create table if not exists public.service_packages (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references public.profiles(id) on delete cascade,  -- null = built-in
  key         text not null,                     -- 'website' | 'website_automation' | future offers
  version     integer not null,
  name        text not null,
  blurb       text not null default '',
  cadence     text not null check (cadence in ('one_time', 'monthly')),
  price_hint  text not null default '',
  definition  jsonb not null default '{}',       -- { includes: [], establishes: { watch_site, propose_automations[], reporting } }
  status      text not null default 'current' check (status in ('draft', 'current', 'retired')),
  created_at  timestamptz not null default now(),
  -- nulls-not-distinct: built-ins are owner_id-null; a plain unique treats NULLs as distinct and
  -- would let a re-run of this migration double-seed. PG15 syntax; Supabase runs PG15+.
  unique nulls not distinct (owner_id, key, version)
);
create index if not exists idx_service_packages_key on public.service_packages(key, status);

create table if not exists public.package_pins (
  id                      uuid primary key default gen_random_uuid(),
  owner_id                uuid not null references public.profiles(id) on delete cascade,
  client_subscription_id  uuid not null references public.client_subscriptions(id) on delete cascade,
  package_id              uuid not null references public.service_packages(id) on delete restrict,
  cohort                  text not null default 'general',
  established_at          timestamptz,           -- when packageEstablishes() materialized the objects
  created_at              timestamptz not null default now(),
  unique (client_subscription_id)                -- one pin per client; an upgrade re-pins
);
create index if not exists idx_package_pins_owner on public.package_pins(owner_id, created_at desc);
create index if not exists idx_package_pins_package on public.package_pins(package_id);

-- RLS: house owner-all pattern; packages additionally readable when built-in (owner_id null).
alter table public.service_packages enable row level security;
alter table public.package_pins enable row level security;

drop policy if exists service_packages_read on public.service_packages;
create policy service_packages_read on public.service_packages
  for select using (owner_id is null or owner_id = auth.uid());
drop policy if exists service_packages_write on public.service_packages;
create policy service_packages_write on public.service_packages
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists package_pins_all on public.package_pins;
create policy package_pins_all on public.package_pins
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Seed v1 of the two shipped offers from clientTiers.ts, verbatim — the code becomes data. The
-- `establishes` block is honest about what is MECHANICAL (watching the live site) vs what needs
-- the operator/client (automations are PROPOSED, never silently configured — per-client config,
-- consent, and customer lists are deliberate acts).
insert into public.service_packages (owner_id, key, version, name, blurb, cadence, price_hint, definition, status)
values
  (null, 'website', 1, 'New Website',
   'A rebuilt, modern, mobile-ready site — live and hosted.',
   'one_time', 'from $1,500 one-time',
   '{"includes": ["Full rebuild from your real content + photos", "Mobile-ready, secure (HTTPS)", "Contact form + search-ready basics", "Hosting included"],
     "establishes": {"watch_site": true, "propose_automations": [], "reporting": null}}'::jsonb,
   'current'),
  (null, 'website_automation', 1, 'Website + Automation',
   'The new site, plus recurring automations that bring customers back — on autopilot.',
   'monthly', 'from $500/mo',
   '{"includes": ["Everything in New Website", "Recall / seasonal reminders to your customers", "Review requests after each job", "Lead follow-up + win-back of past customers", "Every message approval-gated — nothing sends without your OK"],
     "establishes": {"watch_site": true, "propose_automations": ["lead_followup", "review_request", "recall_reminder"], "reporting": "monthly"}}'::jsonb,
   'current')
on conflict (owner_id, key, version) do nothing;
