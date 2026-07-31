-- app_0116_findings.sql
-- FINDINGS BECOME ROWS — the deep scan's output stops being a blob and starts compounding.
--
-- app_0074 stopped us discarding the audit, but it kept everything a scan noticed inside
-- `prospect_audits.signals`, a JSONB array. That was the right call for one card on one screen and
-- the wrong call for the only question that compounds across a funnel:
--
--     "Which finding, named in which pitch, actually produced a reply — and then a sale?"
--
-- You cannot GROUP BY a JSON blob. Before this migration the operator could see that a prospect's
-- site had fourteen images with no alt text, and could see that a pitch went out, and had NO WAY
-- WHATSOEVER to connect the two — not per prospect, not per trade, not in aggregate. Every scan we
-- paid for taught us nothing about what to lead with next time. The deep scan (scanTypes.ts) made
-- the observations honest and checkable; this migration makes them countable.
--
-- Two tables, and the second is the whole point:
--   * findings — one row per checkable thing observed about a prospect's site, mirroring the
--     `Finding` interface field-for-field (code / category / severity / confidence / title / detail /
--     count / evidence / wcag). `code` is the stable machine identifier — NEVER renumbered, because
--     outcomes join on it. UNIQUE (audit_id, code) so a re-scan REFRESHES an audit's findings
--     instead of accumulating duplicates: a count is always "as of the last scan", the same
--     invariant app_0074 gave prospects with uq_prospect_audits_owner_url.
--   * outreach_finding_refs — WHICH findings a given outreach message actually led with. This is
--     the join, and the whole reason findings became rows. `emphasized` separates the headline
--     finding from the supporting ones, because "we mentioned it" and "we opened with it" are
--     different claims about different outcomes. Detection and assertion are recorded separately on
--     purpose: a re-scan may delete a finding that no longer reproduces, but the historical record
--     of what we SAID must survive it — that record lives here.
--
-- HONESTY RULES CARRIED FORWARD (same ethos as scanTypes.ts / siteAudit.ts):
--   * Every row traces to a signature really observed in fetched markup. `confidence` ships on every
--     finding so a pitch can never overstate it; 'needs_review' means a human looks before we speak.
--   * `count` is NULLABLE by design — null means counting that finding is not meaningful, which is
--     an honest statement and is NOT the same as zero.
--   * `evidence` is the capped proof snippet (EVIDENCE_MAX), so a claim can always be shown.
--   * `scan_version` is stamped on every row so a trend line never compares unlike readings. When
--     detection logic changes the version bumps, and old rows stay legible as what they were.
--
-- `world_id` follows the app_0114 spine (nullable, on delete set null): a prospect audited outside
-- any world is honestly world-less rather than forced into one.
--
-- Additive + idempotent. Changes no existing behaviour; the writer (findingsStore.ts) already
-- degrades to a no-op when this migration has not been applied.

-- ---------- 1. findings ----------
create table if not exists public.findings (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  audit_id      uuid not null references public.prospect_audits(id) on delete cascade,
  world_id      uuid references public.knowledge_worlds(id) on delete set null,

  -- Identity of the observation (mirrors the Finding interface in _shared/scanTypes.ts)
  code          text not null,                 -- stable machine code, e.g. 'a11y.img_missing_alt'
  category      text not null
                  check (category in ('accessibility', 'tracking', 'mobile', 'conversion', 'presence')),
  severity      text not null check (severity in ('high', 'med', 'low')),
  confidence    text not null check (confidence in ('detected', 'likely', 'needs_review')),

  -- What the operator says, and what backs it
  title         text not null,                 -- short owner-facing label, no jargon, no legal claim
  detail        text not null default '',      -- one honest sentence: what was observed, what it costs
  count         integer,                       -- null = counting this finding is not meaningful
  evidence      text,                          -- capped verbatim snippet — the proof
  wcag          text,                          -- WCAG 2.2 criterion, e.g. '1.1.1'; reference only

  scan_version  text not null,                 -- so a trend never compares unlike readings
  detected_at   timestamptz not null default now(),

  -- Re-scanning an audit UPDATES its findings rather than duplicating them.
  unique (audit_id, code)
);

create index if not exists idx_findings_owner_code on public.findings(owner_id, code);
create index if not exists idx_findings_audit on public.findings(audit_id);
create index if not exists idx_findings_owner_triage on public.findings(owner_id, category, severity);
-- Partial: most findings carry no world (an on-demand scan from Win Clients has none), so the index
-- only covers the rows a per-world index run would actually ask for.
create index if not exists idx_findings_world on public.findings(world_id) where world_id is not null;

-- ---------- 2. outreach_finding_refs ----------
create table if not exists public.outreach_finding_refs (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  message_id    uuid not null references public.outreach_messages(id) on delete cascade,

  -- THE DURABLE IDENTITY IS THE CODE, NOT THE ROW.
  -- This was originally `finding_id ... on delete cascade`, which was quietly fatal: findingsStore
  -- deletes an audit's findings and re-inserts them on every re-scan, so a monthly monitoring scan
  -- would cascade away the entire record of what we had pitched. The one table whose whole purpose
  -- is to outlive a re-scan was being erased by it. Caught by applying this migration to a real
  -- Postgres and deleting an audit.
  --
  -- So the assertion is stored by CODE — the stable machine identifier that is never renumbered
  -- precisely because outcomes join on it — and finding_id is now a nullable convenience pointer at
  -- the observation as it stood when we spoke, released (not cascaded) when that row is replaced.
  -- What we SAID is immutable history; what is TRUE about the site is a current reading. Those are
  -- different facts with different lifetimes and they no longer share one.
  finding_code  text not null,
  finding_id    uuid references public.findings(id) on delete set null,

  emphasized    boolean not null default false,  -- true = this was the headline finding in the pitch
  created_at    timestamptz not null default now(),
  unique (message_id, finding_code)              -- a message names a given finding once
);

-- The performance question groups by CODE, so this is the index that answers "which finding, when
-- we led with it, produced a reply?" without touching the findings table at all.
create index if not exists idx_outreach_finding_refs_owner_code
  on public.outreach_finding_refs(owner_id, finding_code);
-- Postgres does NOT index a foreign key column for you, and both parents act on delete (message
-- cascades, finding sets null), so without these each removal scans this whole table to find its
-- children — and this is the table that grows fastest, one row per finding per pitch.
create index if not exists idx_outreach_finding_refs_message
  on public.outreach_finding_refs(message_id);
create index if not exists idx_outreach_finding_refs_finding
  on public.outreach_finding_refs(finding_id) where finding_id is not null;

-- ---------- 3. prospect_audits roll-ups ----------
-- The headline numbers from a deep scan, denormalised onto the audit so the index/report layer can
-- sort and group a prospect list without re-reading every finding row. Nullable throughout: a
-- prospect audited before the deep scan existed, or one whose site was unreachable, honestly has no
-- reading here rather than a zero that reads like a clean bill of health.
alter table public.prospect_audits add column if not exists scan_version     text;
alter table public.prospect_audits add column if not exists a11y_instances   integer;
alter table public.prospect_audits add column if not exists tracker_count    integer;
alter table public.prospect_audits add column if not exists session_replay   boolean;
alter table public.prospect_audits add column if not exists consent_platform text;
alter table public.prospect_audits add column if not exists booking_platform text;
alter table public.prospect_audits add column if not exists deep_scanned_at  timestamptz;

-- "Which prospects have we deep-scanned, and when" — the working queue for an index run, and the
-- query behind "is this reading stale enough to re-scan?". Partial for the same reason the column is
-- nullable: an audit taken before the deep scan existed is honestly absent from this queue rather
-- than sorting in as an ancient zero. Declared here, AFTER the column exists.
create index if not exists idx_prospect_audits_owner_deep
  on public.prospect_audits(owner_id, deep_scanned_at desc) where deep_scanned_at is not null;

-- ---------- 4. RLS ----------
-- House owner-all pattern, identical to prospect_audits in app_0074: one policy covering
-- select/insert/update/delete, owner-scoped both ways.
alter table public.findings enable row level security;
drop policy if exists "findings owner all" on public.findings;
create policy "findings owner all" on public.findings
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table public.outreach_finding_refs enable row level security;
drop policy if exists "outreach_finding_refs owner all" on public.outreach_finding_refs;
create policy "outreach_finding_refs owner all" on public.outreach_finding_refs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
