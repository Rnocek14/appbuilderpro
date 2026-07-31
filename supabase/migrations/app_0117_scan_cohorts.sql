-- app_0117_scan_cohorts.sql
-- THE COHORT — a named, reproducible set of businesses, so a scan can become a STUDY.
--
-- app_0116 made findings countable. It did not make them countable ABOUT ANYTHING: every audit sat
-- in one undifferentiated pool per owner, so there was no way to say "these 618 businesses, measured
-- this way, on these dates" — and without that sentence there is no denominator, and without a
-- denominator there is no percentage anyone should publish.
--
-- The gap this closes is one sentence in an email:
--
--     "Your site was one of 618 plumber websites in Walworth County we looked at."
--
-- That line is the difference between a stranger selling something and a report about something that
-- already happened, and it cannot be written honestly without a cohort. It is also the line a local
-- editor needs before they will run the story.
--
-- WHY A COHORT IS NOT JUST A FILTER over prospect_audits. Three things have to be pinned at the
-- moment of measurement or the number is not reproducible later:
--   * THE FRAME — what we set out to measure, in words, before we knew the answer. "Every business
--     returned by Places for these queries in this area, that had a website." A frame written after
--     seeing the results is not a frame, it is a selection.
--   * THE VERSION — which detection logic took the readings. v1.2.0 and v1.4.0 detect different
--     things deliberately; a percentage mixing them is comparing unlike measurements. cohortStats
--     refuses to publish a mixed cohort, and this column is how it knows.
--   * THE DATES — a site changes. "41% had no booking path" is only true as of when we looked.
--
-- MEMBERSHIP IS A JOIN TABLE, not a cohort_id column on prospect_audits, because one business can
-- legitimately belong to several studies — the Q1 county index and the Q3 re-run and a trade-
-- specific cut — and a single foreign key would force the second run to either overwrite the first
-- or duplicate the audit. The audit is the business's current reading; the membership is the fact
-- that it was in a study. Keeping them separate is what makes a year-on-year trend possible at all.
--
-- Additive + idempotent. Nothing existing changes behaviour; the deep scan and the per-business
-- pitch both work exactly as before without a cohort ever being created.

-- ---------- 1. scan_cohorts ----------
create table if not exists public.scan_cohorts (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  world_id      uuid references public.knowledge_worlds(id) on delete set null,

  -- Identity, in the words a reader would use.
  name          text not null,                  -- 'Walworth County plumbers, Q3 2026'
  area          text not null,                  -- 'Walworth County, WI' — appears verbatim in the email
  frame         text not null,                  -- what we set out to measure, WRITTEN BEFORE the results
  -- The trade this cohort is about, when it is about one. Null for a mixed/all-business index; the
  -- per-trade breakdown then comes from the members' own niches rather than from the cohort.
  trade         text,
  -- Singular noun used in owner-facing copy: "one of 618 <noun> websites". Kept as data because
  -- "plumber" / "roofer" / "restaurant" cannot be derived from `trade` reliably enough to guess.
  frame_noun    text not null default 'business',

  -- Reproducibility. scan_version is stamped when the run completes; a cohort whose members carry
  -- more than one version is not publishable (cohortStats enforces it) and this records the intent.
  scan_version  text,
  status        text not null default 'open'
                  check (status in ('open', 'scanning', 'complete', 'abandoned')),

  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),

  unique (owner_id, name)
);

alter table public.scan_cohorts enable row level security;
drop policy if exists "scan_cohorts owner all" on public.scan_cohorts;
create policy "scan_cohorts owner all" on public.scan_cohorts
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create index if not exists idx_scan_cohorts_owner_status on public.scan_cohorts(owner_id, status, started_at desc);
create index if not exists idx_scan_cohorts_world on public.scan_cohorts(world_id) where world_id is not null;

-- ---------- 2. cohort_members ----------
-- One business's participation in one study. Deliberately a join rather than a column on the audit:
-- a business measured in Q1 and again in Q3 is TWO memberships of ONE audit, which is exactly what a
-- year-on-year trend needs and what a single cohort_id column would make impossible.
create table if not exists public.cohort_members (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  cohort_id     uuid not null references public.scan_cohorts(id) on delete cascade,
  audit_id      uuid not null references public.prospect_audits(id) on delete cascade,

  -- Frozen AT MEASUREMENT TIME, not read back from the audit later. The audit row is the business's
  -- CURRENT state and will be overwritten by the next scan; a study has to remember what was true
  -- when it looked, or every past percentage silently rewrites itself. Same discipline as
  -- outreach_finding_refs.finding_code in app_0116.
  reachable     boolean not null,
  scan_version  text,
  trade         text,                            -- the niche this business was discovered under

  created_at    timestamptz not null default now(),

  unique (cohort_id, audit_id)                   -- a business is in a given study once
);

alter table public.cohort_members enable row level security;
drop policy if exists "cohort_members owner all" on public.cohort_members;
create policy "cohort_members owner all" on public.cohort_members
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Both FK columns indexed explicitly: Postgres does not do it for you and both parents cascade.
create index if not exists idx_cohort_members_cohort on public.cohort_members(cohort_id);
create index if not exists idx_cohort_members_audit on public.cohort_members(audit_id);
create index if not exists idx_cohort_members_owner_trade on public.cohort_members(owner_id, trade);

-- ---------- 3. the cohort a pitch cited ----------
-- Which study an outreach message claimed membership of. Recorded for the same reason
-- outreach_finding_refs exists: the assertion we made has to survive the data changing underneath
-- it. If someone later asks "you told me I was one of 618 — one of 618 what?", this is the answer,
-- and it stays answerable after the cohort has been re-run.
alter table public.outreach_messages add column if not exists cohort_id uuid
  references public.scan_cohorts(id) on delete set null;
create index if not exists idx_outreach_messages_cohort
  on public.outreach_messages(cohort_id) where cohort_id is not null;
