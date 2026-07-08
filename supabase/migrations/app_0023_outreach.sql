-- FableForge PLATFORM migration (not a generated-app migration).
-- OUTREACH / CRM v0 — the send + track half of the "scrape a business → send them a better website"
-- loop (see docs/garvis-system-architecture.md §6 Workflow B). The GENERATE half already exists here
-- (business_profiles → preview_sites → pitch, via ingest-profile). This adds the schema ported from
-- swift-prep-pros — the repo that had the full sending stack (sequences, suppression, warmup, kill
-- switch) but no website generator. Joining the two is the money loop.
--
-- Tables:
--   * outreach_settings  — per-owner sender identity + the SAFETY GATES (kill switch, daily cap,
--                          warmup ramp, CAN-SPAM physical address, unsubscribe template). One row/owner.
--   * contacts           — people at a business (email + evidence: status/confidence/source_url).
--   * outreach_campaigns — a sequence per (business, contact): pending_approval → sent → replied/…
--   * outreach_messages  — individual emails (step 0 initial / 1 bump / 2 breakup), linked to a
--                          preview_site so the pitch carries the generated website; status +
--                          approval_id tie it to the app_0022 approval queue.
--   * replies            — inbound, AI-classified positive/negative/neutral.
--   * suppression        — do-not-contact (bounce | complaint | unsub | manual); checked at send time.
--
-- Owner-scoped RLS throughout (so this is multi-tenant-safe from day one, unlike the single-tenant
-- original). Sending happens ONLY through the send-email edge function (service role + approval).
-- Additive + idempotent. Apply AFTER app_0021/app_0022 and the preview_engine migrations.

-- ---------- enums ----------
do $$ begin
  create type contact_email_status as enum ('unknown', 'valid', 'bounced', 'unsubscribed', 'invalid', 'complained');
exception when duplicate_object then null; end $$;
do $$ begin
  create type campaign_state as enum ('pending_approval', 'sent', 'replied', 'unsubscribed', 'bounced', 'stopped', 'won', 'lost');
exception when duplicate_object then null; end $$;
do $$ begin
  create type outreach_message_status as enum ('draft', 'approved', 'scheduled', 'sent', 'bounced', 'replied', 'failed', 'blocked');
exception when duplicate_object then null; end $$;
do $$ begin
  create type reply_classification as enum ('positive', 'negative', 'neutral', 'auto', 'unclassified');
exception when duplicate_object then null; end $$;
do $$ begin
  create type suppression_reason as enum ('bounce', 'complaint', 'unsubscribe', 'manual');
exception when duplicate_object then null; end $$;

-- ---------- outreach_settings (one row per owner; the safety gates) ----------
create table if not exists public.outreach_settings (
  owner_id                 uuid primary key references public.profiles(id) on delete cascade,
  from_name                text,
  from_email               text,
  reply_to                 text,
  company_name             text,
  physical_address         text,                         -- CAN-SPAM: required to send
  unsubscribe_url_template text,                          -- List-Unsubscribe target; falls back to mailto
  daily_send_cap           integer not null default 25,   -- 0 blocks all sends
  warmup_start_date        date,                          -- optional ramp anchor
  warmup_daily_step        integer not null default 5,    -- cap grows by this/day from warmup_start_date
  outbound_enabled         boolean not null default false,-- THE KILL SWITCH (off by default — opt in)
  timezone                 text not null default 'America/Chicago',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

drop trigger if exists trg_outreach_settings_touch on public.outreach_settings;
create trigger trg_outreach_settings_touch before update on public.outreach_settings
  for each row execute function public.touch_updated_at();

-- ---------- contacts ----------
create table if not exists public.contacts (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.profiles(id) on delete cascade,
  business_profile_id uuid references public.business_profiles(id) on delete set null,
  full_name           text,
  title               text,
  email               text,
  email_status        contact_email_status not null default 'unknown',
  confidence          integer not null default 0,       -- 0-100 evidence strength
  source_url          text,                              -- where the email was found (evidence)
  is_primary          boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_contacts_owner on public.contacts(owner_id, created_at desc);
create index if not exists idx_contacts_biz on public.contacts(business_profile_id);
create index if not exists idx_contacts_email on public.contacts(lower(email));

drop trigger if exists trg_contacts_touch on public.contacts;
create trigger trg_contacts_touch before update on public.contacts
  for each row execute function public.touch_updated_at();

-- ---------- outreach_campaigns ----------
create table if not exists public.outreach_campaigns (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.profiles(id) on delete cascade,
  business_profile_id uuid references public.business_profiles(id) on delete set null,
  contact_id          uuid references public.contacts(id) on delete set null,
  preview_site_id     uuid references public.preview_sites(id) on delete set null,
  kind                text not null default 'cold_site_pitch', -- cold_site_pitch | newsletter | re_nurture
  state               campaign_state not null default 'pending_approval',
  follow_up_count     integer not null default 0,
  sequence_stopped    boolean not null default false,
  next_followup_at    timestamptz,
  last_send_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_ocampaigns_owner_state on public.outreach_campaigns(owner_id, state, created_at desc);
create index if not exists idx_ocampaigns_followup on public.outreach_campaigns(next_followup_at)
  where state = 'sent' and sequence_stopped = false;

drop trigger if exists trg_ocampaigns_touch on public.outreach_campaigns;
create trigger trg_ocampaigns_touch before update on public.outreach_campaigns
  for each row execute function public.touch_updated_at();

-- ---------- outreach_messages ----------
create table if not exists public.outreach_messages (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.profiles(id) on delete cascade,
  campaign_id         uuid references public.outreach_campaigns(id) on delete cascade,
  contact_id          uuid references public.contacts(id) on delete set null,
  preview_site_id     uuid references public.preview_sites(id) on delete set null,
  approval_id         uuid references public.approvals(id) on delete set null,
  sequence_step       integer not null default 0,        -- 0 initial | 1 bump | 2 breakup
  subject             text not null default '',
  body_text           text not null default '',
  to_address          text,
  from_address        text,
  status              outreach_message_status not null default 'draft',
  provider_message_id text,                               -- Resend id, for webhook correlation
  model_version       text,
  scheduled_for       timestamptz,
  sent_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_omessages_owner on public.outreach_messages(owner_id, created_at desc);
create index if not exists idx_omessages_campaign on public.outreach_messages(campaign_id);
create index if not exists idx_omessages_provider on public.outreach_messages(provider_message_id);

drop trigger if exists trg_omessages_touch on public.outreach_messages;
create trigger trg_omessages_touch before update on public.outreach_messages
  for each row execute function public.touch_updated_at();

-- ---------- replies ----------
create table if not exists public.replies (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  message_id     uuid references public.outreach_messages(id) on delete set null,
  campaign_id    uuid references public.outreach_campaigns(id) on delete set null,
  from_address   text,
  subject        text,
  body_text      text,
  classification reply_classification not null default 'unclassified',
  received_at    timestamptz not null default now(),
  created_at     timestamptz not null default now()
);
create index if not exists idx_replies_owner on public.replies(owner_id, received_at desc);
create index if not exists idx_replies_campaign on public.replies(campaign_id);

-- ---------- suppression (owner-scoped do-not-contact) ----------
create table if not exists public.suppression (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  email      text,
  domain     text,
  reason     suppression_reason not null default 'manual',
  created_at timestamptz not null default now(),
  unique (owner_id, email)
);
create index if not exists idx_suppression_owner_email on public.suppression(owner_id, lower(email));
create index if not exists idx_suppression_owner_domain on public.suppression(owner_id, lower(domain));

-- ============================================================
-- ROW LEVEL SECURITY (owner-scoped throughout)
-- ============================================================
alter table public.outreach_settings  enable row level security;
alter table public.contacts           enable row level security;
alter table public.outreach_campaigns enable row level security;
alter table public.outreach_messages  enable row level security;
alter table public.replies            enable row level security;
alter table public.suppression        enable row level security;

drop policy if exists "outreach_settings owner all" on public.outreach_settings;
create policy "outreach_settings owner all" on public.outreach_settings
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "contacts owner all" on public.contacts;
create policy "contacts owner all" on public.contacts
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "ocampaigns owner all" on public.outreach_campaigns;
create policy "ocampaigns owner all" on public.outreach_campaigns
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "omessages owner all" on public.outreach_messages;
create policy "omessages owner all" on public.outreach_messages
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "replies owner all" on public.replies;
create policy "replies owner all" on public.replies
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "suppression owner all" on public.suppression;
create policy "suppression owner all" on public.suppression
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
