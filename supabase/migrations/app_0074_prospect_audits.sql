-- app_0074_prospect_audits.sql — PHASE 0: stop discarding the honest audit.
--
-- Today the "Win clients" hunt (WinClients.tsx) fetches each prospect's site, audits it honestly
-- (siteAudit.ts — signals traced to observed facts, no faked Lighthouse), shows the verdict, and then
-- THROWS THE WHOLE RESULT AWAY when the React state unmounts. Every audit is paid for (Serper +
-- fetch-url) and then lost. This table keeps it.
--
-- WHY IT MATTERS: this is the foundation stone. Nothing downstream — opportunity detection
-- (manual_process:* signals), the sector-pack proposal layer, or the cross-business intelligence DB
-- (the moat) — can exist until audits persist. It is cheap and additive; it changes no existing
-- behaviour, it only records what was already computed.
--
-- HONESTY RULES (same ethos as siteAudit.ts / marketIntel.ts):
--   * Every column is something REALLY OBSERVED on the fetched page. An unreachable site is an honest
--     'unknown' verdict with a null score — never a guess. Missing data stays null.
--   * `vertical` is a DETERMINISTIC read (detectVertical) of the text actually scraped — no model call,
--     no invented classification.
--   * Read/record only. Nothing here contacts anyone; outreach still goes through the approval spine.
--
-- Additive + idempotent.

create table if not exists public.prospect_audits (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references public.profiles(id) on delete cascade,

  -- Identity (what we looked at)
  url               text not null,                 -- the exact URL audited
  host              text,                          -- registrable-ish host, for grouping
  business_name     text,                          -- name from discovery, when known
  niche             text,                          -- the niche searched (e.g. "roofers"), when known
  area              text,                          -- the town/area searched, when known
  source            text not null default 'scan'   -- how it entered the funnel
                      check (source in ('find', 'scan', 'sweep', 'manual')),

  -- The honest audit (mirrors the SiteAudit shape; every field traces to observed facts)
  reachable         boolean not null default false,
  score             integer,                       -- 10-100, DERIVED; null when unreachable ('unknown')
  verdict           text not null default 'unknown'
                      check (verdict in ('weak', 'dated', 'solid', 'unknown')),
  headline          text,                          -- the owner-facing one-liner
  signals           jsonb not null default '[]'::jsonb,   -- AuditSignal[] worst-first (what's wrong)
  strengths         jsonb not null default '[]'::jsonb,   -- honest positives already present

  -- The scrape substrate future detection layers need (fetched today, discarded today)
  vertical          text,                          -- detectVertical() over the scraped text; null when no text
  checks            jsonb not null default '{}'::jsonb,   -- raw { viewport, form, email, https }
  meta_title        text,
  meta_description  text,
  text_snippet      text,                          -- capped readable page text (for manual_process:* detection)

  created_at        timestamptz not null default now(),
  last_audited_at   timestamptz not null default now()
);

alter table public.prospect_audits enable row level security;
drop policy if exists "prospect_audits owner all" on public.prospect_audits;
create policy "prospect_audits owner all" on public.prospect_audits
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- One row per (owner, url): re-auditing refreshes the same prospect instead of duplicating it
-- (the client does SELECT-first, but the constraint makes the invariant real).
create unique index if not exists uq_prospect_audits_owner_url on public.prospect_audits(owner_id, url);
create index if not exists idx_prospect_audits_owner_verdict on public.prospect_audits(owner_id, verdict);
create index if not exists idx_prospect_audits_owner_vertical on public.prospect_audits(owner_id, vertical);
create index if not exists idx_prospect_audits_owner_recent on public.prospect_audits(owner_id, last_audited_at desc);
