# Lead Engine — master build plan

The complete, codebase-grounded blueprint for building the Lead Engine inside Garvis.
Strategy lives in `lead-engine-plan.md` (pilot), `lead-engine-deep-dive.md` (economics),
and `lead-engine-ai-native.md` (AI-native positioning). This doc is the engineering plan:
every integration point below names a real file, table, or registry in this repo, and the
whole design is **additive** — nothing existing is modified beyond the sanctioned
extension points the codebase itself defines.

---

## 0. Prime directive: don't ruin the current system

The Lead Engine is a new venture *flavor* riding the existing rails. The contract:

**Never touch** (fragile, load-bearing — confirmed by full system audit):
- `garvis_arm_heartbeat` / `garvis_disarm_heartbeat` — we add **no pg_cron jobs**, so we
  never redefine them (two shipped regressions came from partial redefinitions).
- `send-email` / `send-sms` gate chains — the only sanctioned outbound exits; we enqueue
  into them, never around them.
- `mind_events` (append-only), `execution_runs` (server-written), `approvals.payload_hash`.
- `AppShell.tsx`, `execution.ts`'s `approveAndExecute` CAS, `workweb.ts` `ARCHETYPES`
  (we add a **Flavor**, never an archetype), `WorkWeb.tsx` beyond one panel block,
  `_apply_garvis_all.sql` by hand, `navConfig.ts` Core section (5-item cap).

**Every addition uses a designed extension point:**
- New tables → new migration `app_0129_lead_engine.sql`, additive + idempotent, owner
  RLS, then `node scripts/generate-apply-all.mjs` (CI verifies byte-identical).
- Scheduling → a new `standing_orders` kind (the codebase-preferred path; copy the
  9-line `app_0126_episode_draft_order.sql` pattern) — **not** a new cron job.
- Outbound → `enqueueApproval()` with existing kinds; executed by existing executors.
- AI calls → `_shared/ai.ts` `complete()` + `checkCredits`/`spendCredits` with new
  `CreditKind` entries.
- HTTP fetches → `_shared/safeFetch.ts` only.
- UI → new Flavor `lead_engine` through the 12-point flavor checklist (below), shipped
  **dark** (route registered, nav entry withheld until pilot-ready).
- Pure logic → the house triad: `leadEngine.ts` (pure) + `leadEngine.verify.ts`
  (CI-discovered) + `leadEngineRun.ts` (impure).

CI stays green by construction: no existing verify suite's inputs change; new code
brings its own `verify:leadengine`; new routes are added to `PROTECTED_ROUTES` in
`e2e/routes.spec.ts`; new edge functions join exactly one deploy list in `package.json`.

---

## 1. What we reuse (already built, zero new risk)

| Existing asset | Role in Lead Engine |
|---|---|
| `approvals` + `execution.ts` + `Queue.tsx` | Every outbound digest/outreach lands here as `kind='send_email'`. No new approval kind needed in Phase 1. |
| `send-email` (Resend) | The only email exit — inherits suppression, caps, warmup, CAN-SPAM address, placeholder gate, atomic send claim. |
| `outreach_messages`, `contacts`, `suppression`, `outreach_settings` | Outreach substrate — the digest and later per-lead outreach are ordinary outreach messages. |
| `invoices` + chase ladder (`money.ts`, `invoice-chase`) | Commission tracking: a commission **is** an invoice (`source='commission'`), inheriting chase stages, approval-gated sends, paid/void lifecycle, and scorecard revenue. |
| `client_subscriptions` + `closeCampaignWon()` | Phase 3 subscription customers — copy the won-deal → subscription → auto-drafted invoice flow. |
| `standing_orders` + `standing-worker` + 15-min tick | Scheduling. New kind `lead_engine` (see §4). |
| `knowledge_worlds` / venture system | Each metro+trade market = one venture world created from a `LEAD_ENGINE_TEMPLATE`. |
| `safeFetch.ts` | All portal fetching (SSRF-hardened, canary-tested nightly). |
| `_shared/ai.ts` + `credits.ts` + `spend_guard` | LLM parsing/scoring with per-call metering and owner spend caps already enforced. |
| `discovered_businesses` / `opportunities` patterns | Design precedents for dedupe keys, verbatim-only fields, self-exhausting query queues. |
| `garvis-pulse`, `automationCards.ts` | Morning-brief surface and the mandatory "standing card" explaining the automation. |
| Twilio (`send-sms`, `voice-inbound`) | Phase 2 verification calls — account plumbing and secrets already exist. |

## 2. Architecture overview

```
                 ┌─ SOURCES (per metro) ────────────────────────────┐
                 │ permit portals (Socrata/ArcGIS/Accela)           │
                 │ liquor licenses · health permits · SoS filings   │
                 │ (later: cityminutes.ai license, NOAA storms)     │
                 └───────────────┬──────────────────────────────────┘
   standing_orders               │  lead-ingest edge fn (safeFetch → normalize)
   kind='lead_engine'  ──tick──▶ │
   (15-min clock, free)          ▼
                 ┌─ le_events ──────────────────────────────────────┐
                 │ one normalized row per real-world signal          │
                 │ dedupe_key · verbatim source fields · source URL  │
                 └───────────────┬──────────────────────────────────┘
                                 │  pure core: trade mapping + scoring
                                 ▼
                 ┌─ le_leads ───────────────────────────────────────┐
                 │ event × trade → scored lead · contact from record │
                 │ status: new → delivered → quoted → won/lost       │
                 └──────┬──────────────────┬────────────────────────┘
                        │                  │
              digest / alerts       (Phase 2) verify-call
              → approvals queue     → le_verifications
              → send-email          │
                        ▼           ▼
                 ┌─ le_outcomes ────────────────────────────────────┐
                 │ customer-reported result · contract value         │
                 │ won → auto-draft commission invoice (Money loop)  │
                 └──────────────────────────────────────────────────┘
```

Everything left of the approvals queue only READS and RECORDS (the standing-order rule);
everything outbound goes through the one queue. That invariant is what keeps this
module incapable of damaging the existing system.

## 3. Data model — `supabase/migrations/app_0129_lead_engine.sql`

All tables: `owner_id uuid not null references public.profiles(id) on delete cascade`,
RLS enabled with the standard `"<t> owner all"` policy; tables carrying `world_id` add
the world-ownership `with check` (copy `app_0059_standing_orders.sql:43-50`). All DDL
idempotent (`create table if not exists`, `drop policy if exists` + `create policy`).

**`le_sources`** — one row per data source per metro.
`id, owner_id, world_id, name, kind ('socrata'|'arcgis'|'accela'|'liquor'|'health'|'sos'|'rss'), base_url, query_config jsonb, region, active boolean, last_fetch_at, last_status, consecutive_failures int, cursor jsonb`
— `consecutive_failures >= 5 → active=false` + loud `mind_events` row (copy the
`app_0113` automation-reliability pattern).

**`le_events`** — one normalized row per real-world signal.
`id, owner_id, world_id, source_id fk, event_type ('permit_issued'|'permit_applied'|'liquor_license'|'health_permit'|'business_registered'|'news'), occurred_at, address, region, valuation_usd, title, description, named_parties jsonb, raw jsonb, source_url, dedupe_key text, unique(owner_id, dedupe_key)`
— verbatim-only fields per the `opportunities` house rule: nothing invented, every row
traceable to `source_url`.

**`le_leads`** — an event scored for a trade.
`id, owner_id, world_id, event_id fk, trade text, score int, score_reasons jsonb, contact_name, contact_company, contact_email, contact_phone, why_now text, status ('new'|'delivered'|'contacted'|'quoted'|'won'|'lost'|'skipped'), delivered_at, verified_at, verification_id fk null, unique(owner_id, event_id, trade)`
— status ladder mirrors `prospects/stage.ts` semantics.

**`le_outcomes`** — the moat table; append-mostly.
`id, owner_id, world_id, lead_id fk, reported_by ('customer'|'owner'), result ('quoted'|'won'|'lost'|'no_contact'), contract_value_usd, commission_invoice_id fk invoices(id) null, notes, reported_at`
— a `won` outcome with a value auto-drafts an invoice via `createInvoice()` with a new
`source='commission'` value (additive migration mirroring `app_0086_invoice_provenance.sql`).

**`le_verifications`** (Phase 2) —
`id, owner_id, lead_id fk, method ('manual'|'ai_call'), called_number, business_line boolean, disclosed_ai boolean, transcript text, result ('confirmed'|'changed'|'dead'|'no_answer'), cost_usd, created_at`
— compliance fields are schema-level on purpose: a verification row *cannot exist*
without recording that the AI disclosed itself and the line was a business line.

Metering: no new table — every AI call writes `usage_events` via `spendCredits`, and
per-lead cost rolls up from `usage_events` + `le_verifications.cost_usd`.

## 4. Scheduling — a new standing-order kind, not a cron job

New `OrderKind` **`lead_engine`** — the codebase-preferred path (3 files + 1 migration,
precedent `app_0126_episode_draft_order.sql`):
1. Migration: drop + re-add `standing_orders_kind_check` with the **full union** of all
   8 existing kinds + `lead_engine` (the `app_0089` regression rule).
2. `supabase/functions/_shared/standingCore.ts:28` — extend `OrderKind`.
3. `standing-worker` dispatch — a **thin** branch that invokes the new `lead-ingest`
   edge function with the order's config; no ingestion logic inside standing-worker.
4. `automationCards.ts` — the mandatory `ORDER_CARDS.lead_engine` standing card
   (exhaustive record; compile error until added — that's the checklist working).

One `lead_engine` order per venture world, cadence `hourly` (ingest + score every tick;
digest assembly only when the configured digest day arrives). The 15-minute pg_cron
tick, liveness stamping, drift-free `nextRunAfter`, failure pausing — all inherited.

## 5. Ingestion — `lead-ingest` edge function (new)

`supabase/functions/lead-ingest/index.ts`, gated by `cronGate.ts` (worker secret) +
owner re-verification. Per invocation: load the world's active `le_sources` due by
cursor/interval → fetch via **`safeFetch`** → adapter per `kind` normalizes to
candidate events → upsert `le_events` on `dedupe_key` → run pure scoring → upsert
`le_leads` → stamp cursors and heartbeat.

Adapters (pure functions in `_shared/leadAdapters.ts`, each with fixtures in the verify
suite): `socrata` (JSON API — no HTML parsing), `arcgis` (REST query), `accela`
(citizen-portal JSON where available), `liquor`/`health`/`sos` (per-state, start with
the pilot state only), `rss`. LLM-assisted extraction (for messy sources) goes through
`_shared/ai.ts` with a new `CreditKind: 'lead_parse'` — metered, spend-capped, and
plan-tiered like every other call. Structured APIs first, LLM only where structure
fails: most Phase-1 sources need **zero** model calls.

Deploy: add `lead-ingest` to the `functions:deploy` list in `package.json` (JWT path;
the worker calls it with the shared secret like `standing-worker` does its peers).

## 6. Pure core — `src/lib/garvis/leadEngine/`

House triad:
- **`leadEngine.ts`** (pure, no IO, caller-supplied `now`): `TRADES` registry (which
  event types feed which trades, with base weights — acoustics, security, janitorial,
  fire_safety, signage first); `scoreLead(event, trade, now)` → `{score, reasons}` from
  valuation band × event-type weight × recency × trade match; `dedupeKey(event)`
  (normalized address + type + date-bucket); `digestFor(leads, config)` → ranked digest
  copy with `[n]`-style source references; `commissionFor(outcome)` (10% default, per-
  world override); `leadStatusLine()`.
- **`leadEngine.verify.ts`** + `"verify:leadengine"` script in `package.json` —
  scoring monotonicity, dedupe stability, digest never invents fields, commission math,
  adapter fixtures.
- **`leadEngineRun.ts`** (impure): CRUD on `le_*`, `deliverDigest(worldId)` →
  `enqueueApproval({kind:'send_email', …})` with an `outreach_messages` row,
  `recordOutcome(leadId, …)` → auto-draft commission invoice on `won`,
  `markDelivered/Quoted/Won/Lost` with optimistic-rollback semantics.

## 7. UI — Flavor `lead_engine`, shipped dark

The 12-point flavor checklist (all sanctioned extension points):
`workweb.ts` — `Flavor` union + `FLAVORS` + `STUDIO_BY_FLAVOR.lead_engine` + new tool id
`'open-lead-engine'` in `TOOL_IDS` + `LEAD_ENGINE_TEMPLATE` in `WEB_TEMPLATES` (3 nodes:
studio + vault + ledger, modeled on `CONTENT_CHANNEL_TEMPLATE`); `workshops.ts` —
`FLAVOR_WORKSHOPS.lead_engine` (compile-enforced); `workwebRun.ts` — one `runTool`
branch; `expertise.ts` — `STUDIO_PACKS.lead_engine` seed pack; `StudioHero.tsx` — HERO
entry; `WorkWeb.tsx` — one lazy-imported panel block; `genesis.ts` — one shape
paragraph (optional, Phase 3).

Components:
- **`LeadEnginePanel.tsx`** (`{worldId, clusterId, onToast}`, wrapped in
  `PanelBoundary`, modeled on `AnsweringDesk.tsx`): sources health, latest scored leads
  with why-now + source links, one-click "queue digest" (→ approvals), outcome
  recording (quoted/won/lost + value), pilot scoreboard (delivered → quoted → won,
  close rate, commission owed/paid via the linked invoices).
- **`src/pages/LeadEngine.tsx`** (directory page, modeled on `Channels.tsx` with real
  `<button><Card interactive>` rows): all lead-engine worlds, pulse line each
  (events this week, leads delivered, last digest), one "start a market" button →
  `instantiateWeb('lead-engine')`.
- Route `/garvis/lead-engine` in `App.tsx` (lazy + `<Protected>`), added to
  `PROTECTED_ROUTES` in `e2e/routes.spec.ts`. **No `navConfig.ts` entry yet** — the
  ship-dark mechanism this codebase actually supports. When pilot-ready, one `NavItem`
  in the *Prospecting* section (never Core) un-darks it, and ⌘K picks it up free.

Design rules: `forge-*` tokens only, skeletons over spinners, `LoadError` never
empty-state on failure, optimistic writes with rollback, undo not confirm.

## 8. Verification & outreach (Phase 2+) — same spine, no new exits

- **Verification**: new `verify-call` edge function using existing Twilio plumbing (or
  Retell/Bland if quality demands; secrets pattern already established). Informational
  calls to business lines only, AI disclosure first sentence, no selling — enforced by
  the `le_verifications` schema fields and a pure `verifyScript()` builder in the core.
  Results stamp `le_leads.verified_at`. New `CreditKind: 'lead_verify'`.
- **Per-lead outreach** (done-for-you tier): drafts land as ordinary
  `outreach_messages` + `send_email` approvals — inheriting suppression, caps, warmup,
  placeholder gate, unsubscribe. Cold SMS: never (already off by default and consent-
  gated in `outreach_settings`; we don't change that).
- **Real-time alerts**: the hourly order tick plus the existing notification webhook
  path (`garvis-pulse` precedent) — minutes-level latency without any new cron.

## 9. Phases, gates, and the order of work

**Phase 0 — Foundation (≈1 week of build).** Migration `app_0129` + regenerate apply-all
· pure core + verify suite · `lead-ingest` with `socrata` + `arcgis` adapters for the
pilot metro · standing-order kind + card · panel + page shipped dark · commission
`source` value. *Gate: CI fully green; a manual tick ingests real permits for the pilot
metro into `le_events`/`le_leads` on a live project.*

**Phase 1 — Buddy pilot (weeks 2–13).** Liquor/health/SoS adapters for the pilot state ·
weekly digest through the approvals queue · outcome recording UI + commission invoices ·
(manual verification checklist in the panel — no AI calls yet). *Gate (day 90): ≥30% of
delivered leads quoted, ≥2 attributable closed jobs, close-rate data clean enough to
price subscriptions. Fail → fix lead quality or switch wedge trade; do not scale.*

**Phase 2 — Verified + fast (months 4–6).** `verify-call` AI verification · hourly
alerting via notification webhook · nav entry lands (un-dark) · second trade
(security) on the same metro's event stream. *Gate: verified leads quote ≥1.5× unverified;
verification cost < $1.50/lead.*

**Phase 3 — Subscriptions (months 6–12).** Customer-facing delivery (customers are
`contacts`/`client_subscriptions`; digests per customer through the same queue) ·
Stripe via existing `create-checkout`/`stripe-webhook` rails · janitorial + fire/life-
safety trades · second metro (adapter reuse test). *Gate: 10 paying subscribers,
churn <5%/mo, per-customer gross margin >85%.*

**Phase 4 — Done-for-you + enterprise (year 2).** Per-lead outreach tier · booked-
appointment tracking · manufacturer feed (read-only API or scheduled export — design
then) · storm/NOAA event stream · cityminutes.ai license decision. *Gate: cost per
booked appointment < $150; first manufacturer LOI.*

Sequencing rule: each phase is independently shippable and independently abandonable —
at no point does a later phase's absence break an earlier phase's value.

## 10. Cost & unit economics (per pilot metro)

Data: open portals $0 · Socrata/ArcGIS API calls free-tier · optional Shovels
($599/mo) and cityminutes.ai deferred to Phase 4 decisions. Compute: existing Supabase
project; the hourly tick is one edge invocation. AI: near-zero in Phase 1 (structured
adapters), `lead_parse` cents/doc where used, `lead_verify` ≈ $0.50–1.50/lead in Phase
2 (metered in `usage_events`, capped by `spend_guard`). All-in target: **< $3 per
verified lead** against tiers of $250–3,000/mo → 90%+ gross margin. The existing
`usage_events` cost rollup makes this measurable from day one, not estimated.

## 11. Risk register

| Risk | Mitigation |
|---|---|
| Portal breakage / format drift | Adapter isolation + `consecutive_failures` auto-pause + loud `mind_events`; fixtures in verify suite catch parse regressions in CI. |
| Breaking existing system | The §0 contract; no cron changes; no new send paths; ship dark; every touched registry is compile- or CI-enforced (that's why those registries exist). |
| TCPA / mini-TCPA | Email-first; SMS stays consent-gated off; verification calls to business lines with schema-enforced disclosure fields. |
| Lead quality insufficient (pilot fails) | Day-90 gate is a hard stop; wedge trade is swappable (security next) without any architectural change. |
| Model cost creep | Every AI seam metered (`CreditKind`) + `spend_guard` caps; structured adapters preferred over LLM parsing. |
| Incumbent/copycat response | Speed (hourly tick → alert), curation, and the `le_outcomes` dataset — the only asset here that can't be scraped. |
| Solo-founder bandwidth | Phases sized to ship independently; Phase 1 runs on one metro, one trade, one customer. |

## 12. Build-start checklist (the first PR)

1. `supabase/migrations/app_0129_lead_engine.sql` (tables §3 + `standing_orders` kind
   union + `invoices.source` value + `approval` untouched) — idempotent, RLS'd.
2. `node scripts/generate-apply-all.mjs` → commit `_apply_garvis_all.sql`.
3. `src/lib/garvis/leadEngine/` triad + `"verify:leadengine"` in `package.json`.
4. `supabase/functions/_shared/leadAdapters.ts` + `supabase/functions/lead-ingest/` +
   deploy-list entry + `deno check` clean.
5. `standingCore.ts` kind + thin `standing-worker` branch + `ORDER_CARDS` entry.
6. Flavor checklist edits (§7) + `LeadEnginePanel.tsx` + `LeadEngine.tsx` + route +
   `PROTECTED_ROUTES` entry. No nav entry.
7. `npx tsc --noEmit` + full `verify:*` sweep + `npm run build` + e2e — all green
   before push.
