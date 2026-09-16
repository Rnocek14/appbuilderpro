-- app_0141_re_campaigns_outcomes.sql — THE LAST TWO LEGS: an inquiry that names what caused it, and
-- an outcome that names what it became.
-- docs/real-estate-marketing-implementation.md §2.8/§2.11: only two tables in the entire schema
-- reference social_posts (metrics and channel_episodes), leads carries a free-text `source` and no
-- campaign or post reference, and there is no record of a realtor business outcome anywhere. The
-- pattern to copy is app_0086_invoice_provenance ("REVENUE KNOWS WHERE IT CAME FROM"), which already
-- links an invoice to its lead and campaign — this is the same idea, one step earlier in the funnel.
--
-- No new campaign table: marketing_campaigns (app_0010) already documents "mom's real-estate
-- business" as its own example subject, and there are three parallel campaign namespaces already.
-- Additive + idempotent.

-- ---------- campaigns gain scope ----------
alter table public.marketing_campaigns add column if not exists world_id     uuid references public.knowledge_worlds(id) on delete set null;
alter table public.marketing_campaigns add column if not exists community_id uuid references public.re_communities(id) on delete set null;
alter table public.marketing_campaigns add column if not exists offer        text;   -- the ONE thing this campaign asks for
alter table public.marketing_campaigns add column if not exists owner_name   text;   -- the named human who answers it
alter table public.marketing_campaigns add column if not exists starts_on    date;
alter table public.marketing_campaigns add column if not exists ends_on      date;
create index if not exists idx_marketing_campaigns_world on public.marketing_campaigns(world_id, created_at desc);

-- ---------- leads: a phone call is an inquiry ----------
-- leads.email is not null and captureLead refuses anything failing its EMAIL_RE, so the highest-intent
-- real-estate inquiry — someone calling — cannot be recorded at all. Loosening a not-null on this
-- table has precedent: app_0138 did exactly that for world_id.
alter table public.leads alter column email drop not null;
do $$ begin
  alter table public.leads add constraint leads_email_or_phone
    check (email is not null or phone is not null) not valid;  -- not valid: every existing row has an email
exception when duplicate_object then null; end $$;

-- ---------- leads: attribution that is a foreign key, not a string ----------
alter table public.leads add column if not exists campaign_id      uuid references public.marketing_campaigns(id) on delete set null;
alter table public.leads add column if not exists post_id          uuid references public.social_posts(id) on delete set null;
alter table public.leads add column if not exists community_id     uuid references public.re_communities(id) on delete set null;
alter table public.leads add column if not exists first_source     text;
alter table public.leads add column if not exists last_source      text;
alter table public.leads add column if not exists stated_influence text;  -- what the prospect SAID, verbatim
create index if not exists idx_leads_campaign on public.leads(campaign_id, created_at desc) where campaign_id is not null;
create index if not exists idx_leads_post on public.leads(post_id) where post_id is not null;

-- ---------- a booked meeting can become an outcome ----------
-- appointments (app_0109) stores customer_name/email/phone with no CRM link, so a booking never joins
-- the person it belongs to.
alter table public.appointments add column if not exists lead_id    uuid references public.leads(id) on delete set null;
alter table public.appointments add column if not exists contact_id uuid references public.contacts(id) on delete set null;
create index if not exists idx_appointments_lead on public.appointments(lead_id) where lead_id is not null;

-- ---------- outcomes ----------
-- attribution 'unknown' is a FIRST-CLASS value. The operating plan is explicit that attribution must
-- be allowed to stay unknown; a system that forces a guess gets lied to. 'stated' means the prospect
-- said so; 'inferred' means a src tag or a timing match; 'unknown' means nobody knows.
create table if not exists public.re_outcomes (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  world_id       uuid references public.knowledge_worlds(id) on delete set null,
  lead_id        uuid references public.leads(id) on delete set null,
  campaign_id    uuid references public.marketing_campaigns(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  kind           text not null
                   check (kind in ('qualified_conversation', 'appointment_set', 'appointment_held',
                                   'listing_signed', 'closed', 'lost')),
  occurred_on    date not null,
  note           text,
  value_usd      numeric,
  attribution    text not null default 'unknown'
                   check (attribution in ('stated', 'inferred', 'unknown')),
  created_at     timestamptz not null default now()
);
alter table public.re_outcomes enable row level security;
drop policy if exists "re_outcomes owner all" on public.re_outcomes;
create policy "re_outcomes owner all" on public.re_outcomes
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (world_id is null or exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid()))
  );
create index if not exists idx_re_outcomes_world on public.re_outcomes(world_id, occurred_on desc);
create index if not exists idx_re_outcomes_campaign on public.re_outcomes(campaign_id, kind) where campaign_id is not null;
