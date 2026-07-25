# 12 — Scale, Security, Cost, and Isolation: 10 / 100 / 1,000 Clients

*Phase 5.5 capability audit, per `_charter.md`. This document audits whether the substrate can
carry many clients without overspending invisibly (COST), leaking or losing the keys
(CREDENTIALS), bleeding one counterparty's reality into another's (ISOLATION), or dying silently
under load (RELIABILITY). Evidence: [R04] database, [R07 §7] security patterns + secrets
inventory, [R03 §10] platform/ops inventory, [R06 §0] the master gate, [R13] edge functions,
[R14] planning-document record (the B1–B18 defect ledger), [RC10] `docs/reality-check/10`
(scale arithmetic, taken as input, not re-derived), and direct grep of code/migrations where
Phase 1 is silent. Sibling: `01-capability-inventory.md` §22 (billing/credentials/cost/logs
rows), `11-integrations-build-vs-buy.md` §3 (the T-100 integration bill).*

**Verdict in one paragraph.** The single-operator trust floor is genuinely strong and verified:
RLS on every table, zero-policy token vaults, an approval spine with payload hashing that six
outward executors cannot bypass, SSRF-hardened fetching, webhook auth that is never optional
[R07 §7] [R03 §10]. But every one of those guarantees is built on the **owner axis**
(`owner_id = auth.uid()`), and multi-client operation lives on the **world axis** — where the
record shows six closed read-leaks [R14], a "~70% true" self-grade [R03 §8], WITH CHECK pins on
only ~16 of ~124 tables [R04 §4.4], and — verified by grep below — **no world stamp on the two
ledgers that count money** (`usage_events`, `execution_runs`), **no world filter on semantic
retrieval** (`match_embeddings`), and a situation digest that deliberately mixes every client
into one AI context. Cost is recorded per action and per operator, never per client; credentials
are sealed at rest and unmanaged over time; isolation is a discipline, not a contract;
reliability has leases and retries where builds run and nothing where client automations fail.

---

## 1. COST — recorded per action, invisible per client

### 1.1 What exists and works (per-action recording)

| Piece | State | Evidence |
|---|---|---|
| Provider pricing table (`PRICING` per-1M-token $ in `_shared/ai.ts`) feeding `estimateCost`; 300s timeout + retry on every provider call | WORKING | [R07 §2.3]; grep `ai.ts:29` |
| `_shared/credits.ts` — the ONE chokepoint: `checkCredits` (pre-call estimate, 402 fail) + `spendCredits` (real cost, atomic deduct, `usage_events` row) | WORKING | [R13 §10.2]; grep: 21 functions call it |
| 18 `CreditKind`s with conservative pre-call estimates (generation 60 … design_render 1); 1 credit = $0.01 (`credit_usd()`) | WORKING — two kinds (`video_clip`, `voiceover`) price providers that don't exist [R13 §13.6] | grep `credits.ts:20–51`; [R04 §2c app_0017] |
| Credit RPCs caller-pinned after the B10 cross-user-drain fix; `grant_credits` service-role-only; grants ledgered as `credit_grant` events | WORKING — the hardening arc is real (app_0017 → 0056 → 0094) | [R04 §4.4] [R14] |
| `ai-gateway`: generated apps' AI metered against the app owner's balance at `FF_AI_GATEWAY_MARGIN` 1.25× | WORKING 🔌 | [R13 §9.12] [R07 §2.3] |
| Admin per-user cost/usage charts, failed generations, logs | WORKING | [R03 §1] |

### 1.2 The chokepoint has six holes, not two (verified by grep)

The house claim is structural ("everything that spends our API money spends the user's credits…
enforced structurally" — `credits.ts` header). Grep of every `supabase/functions/*/index.ts` for
real model-call sites (`complete(`/`completeVision(`/`completeStream(`/`completeWithWebSearch(`/
`embedTexts`/direct OpenAI/Lovable fetches) against `checkCredits|spendCredits` finds **six
functions that call models and never meter**:

| Unmetered function | What it spends | Blast radius at scale |
|---|---|---|
| `discover-run` | `completeWithWebSearch` — the Claude-scout discovery engine (web_search is a priced tool call) | HIGH — this is the client-hunt firehose; at T-100 it runs as a standing order nightly |
| `embed-worker` | `embedTexts` — every embedding write | MEDIUM — grows with every document/artifact; already flagged "unmetered" in `docs/garvis-genesis-blueprint.md:92` |
| `inbox-draft` | `complete` per positive reply, daily cron | MEDIUM — scales with reply volume × clients |
| `garvis-consolidate` | `complete`, weekly cron | LOW — weekly, bounded |
| `outreach-followups` | direct `api.openai.com` / Lovable-gateway classification | LOW-MEDIUM — daily cron over open threads |
| `resend-inbound` | direct `api.openai.com` / Lovable-gateway reply classification | LOW-MEDIUM — per inbound reply, webhook-driven |

Classification: **per-action cost recording = PARTIAL** (not WORKING as expected): the
chokepoint is real for 21 interactive surfaces, but the unattended rails — exactly the ones that
multiply with client count — include the six above running on the operator's provider key with
no ledger row. At T-ME this is noise; at T-100 the unmetered fraction of spend is dominated by
the cron/webhook rails, i.e. **the ledger under-reports precisely the spend that grows**.

### 1.3 Per-client attribution — the world stamp is missing exactly where money is counted

Verified against the actual schema (grep, `supabase/schema.sql` + migrations):

| Ledger | World/client stamp? | Consequence |
|---|---|---|
| `usage_events` (the AI metering ledger) | **NO** — columns are `user_id, project_id, event_type, provider, model, tokens, cost_usd, credits` (`schema.sql:168–180`, app_0017). No `world_id`, no `client_subscription_id` | "What did serving client X cost me in AI this month?" is **unanswerable from data** |
| `execution_runs` (the one connector ledger) | **NO** — `owner_id, approval_id, connector, action, request, response, status` (app_0022:57–69). No `world_id` | Send/deploy/post actions attributable to a client only via `approval_id → approvals.world_id` join — and only when an approval exists (column nullable "null = no approval needed") |
| `approvals` | YES since app_0083 — `world_id` nullable, "old rows honestly null" | [R04 §2c] — partial back-attribution possible for gated actions |
| `invoices` | YES since app_0047; per-world money split indexed in app_0093 (the "B8 (part)" fix) | Revenue side IS world-attributable [R04 §2c] |
| `mail_batches`, `ad_spends` | Operator-logged spend, no world stamp on ad_spends; mail via territory | PARTIAL |

So the system can attribute **revenue** per client but not **cost** per client: margin per client
— the number a 100-client agency runs on — cannot be computed. Classification: **per-client cost
attribution = PARTIAL + ARCH-CHANGE-lite** (two additive `world_id` columns + stamping at the
chokepoint; "lite" because the migration is cheap, but every caller of `spendCredits` must learn
its world, and the six unmetered functions must first be metered at all).

### 1.4 Budgets and anomaly alerts

- **Per-run/per-tick loop caps exist and are real**: `agent_runs.budget_usd/spent_usd`,
  job-worker's hard budget cap (default $0.50/step-chain) [R13 §4.5], standing-worker ≤20
  orders/tick with per-path time budgets [R13 §6.3], batch drain ~10 recipients/15 min
  [R03 §5], daily send/social/SMS caps in `outreach_settings` [R04 §3.4].
- **Per-world budgets: MISSING.** Nothing lets the operator say "client X gets ≤$20/mo of AI."
  `garvis_constraints` (one row/owner) exists but is thinly consumed (2 references — "declared
  aspiration" end of the spectrum [R04 §8]) and is owner-global anyway.
- **Cost anomaly alerts: MISSING.** The pattern exists in the codebase — `ads-watch` judges
  yesterday against a 7-day baseline, min-sample-gated, ≤5 alerts, 3-day dedupe [R13 §9.11] —
  but nothing points that pattern at the system's **own** `usage_events`. A runaway agent loop
  or a prompt-injected expensive tool storm is discovered at the monthly bill, or when the
  operator's single credit balance hits 402 and **every client's AI features fail at once**
  (one balance is also one blast radius — app_0017's "one balance, every AI action deducts").
- **Client-facing pricing: WORKING-manual.** Fixed tiers ($1,500 site / $500-mo
  site+automation, `clientTiers.ts`) via Stripe Payment Links; sale → subscription → MRR real
  [R07 §2.5] [R13 §9.1]. No usage-based pass-through, no per-client cost-to-serve visibility
  (see 1.3) — tier pricing is priced on faith, not margin data.

### 1.5 Toolchain — one AI action's cost, end to end

| Step | Status | Evidence | Build/Buy | Owner object | Approval posture | Portfolio surface | Breaks at |
|---|---|---|---|---|---|---|---|
| Price the call (PRICING table, estimateCost) | WORKING | [R07 §2.3] | build | substrate | none | — | 1k: manual price-table upkeep across providers |
| Pre-check balance (`checkCredits` 402) | WORKING | [R13 §10.2] | build | substrate | none | — | 100: one shared balance = shared blast radius on exhaustion |
| Record real cost (`spendCredits` → usage_events) | PARTIAL | grep §1.2 — 6 unmetered fns | build | substrate | none | — | 10: cron-rail spend under-reported as clients multiply |
| Stamp the client/world on the row | MISSING | grep §1.3 — no world_id on usage_events/execution_runs | build | substrate | none | per-client cost lens | 10: margin per client unanswerable |
| Budget per world/automation | MISSING | [R04 §8] (constraints thin) | build | Standing Order | auto (caps), approve (raises) | budget board | 100: no per-client ceiling; one loop eats the month |
| Watch for cost anomalies | MISSING | template: [R13 §9.11] | build (ads-watch pattern) | Standing Order | none (detect-only) | anomaly feed → control plane (doc 10) | 100: runaway spend found at the bill |
| Bill the client (tiers, Payment Links, MRR) | WORKING 🔌 | [R07 §2.5] | build+Stripe | Capability | approve (close-won manual) | MRR rollup exists | 100: manual reconciliation; margin-blind pricing |

---

## 2. CREDENTIALS — sealed at rest, unmanaged over time

### 2.1 Storage (the four homes, three of them right)

| Store | What lives there | Posture | Evidence |
|---|---|---|---|
| `provider_connections` | Per-(user, provider) OAuth/pasted tokens (Supabase, GitHub, DocuSign, Ayrshare, Netlify, MLS feeds) | **WORKING** — RLS enabled, ZERO policies; service-role only; tokens never reach the browser; pastes probe-validated; PKCE + 15-min state TTL via `oauth_states` | [R07 §3.1] [R04 §3.10] |
| Supabase **Vault** | `ff_heartbeat_base` / `ff_heartbeat_secret` for the 12 pg_cron jobs | **WORKING** — arm function writes Vault; `garvis_cron_status()` deliberately hides command bodies because they embed decrypted secrets | [R04 §4.3] [R13 §2] |
| Edge Function secrets | ~21+ operator API keys (full inventory [R07 §4.2]); Health board shows presence booleans only | **WORKING** — fail-closed degradation per key; go-live tiers | [R03 §10] [R07 §6] |
| **localStorage** (browser) | Generated-app secrets awaiting deploy (`useProjectSecrets.ts`) | **PARTIAL** — self-described "interim"; "real home is Supabase Function Secrets" (Phase 8a Vault specced, unbuilt); XSS in the builder = harvest of every project's keys | [R10 #19]; grep `useProjectSecrets.ts:6–9` |

### 2.2 Expiry / health monitoring — lazy, presence-only, never scheduled

Verified: `freshProviderToken()` refreshes **on use, within 60s of expiry** (`oauth.ts:101–116`)
— a token that expires while unused is discovered at the next failed call. The `connections`
function's `test` action probes on demand; nothing probes on the clock. The Health board reports
**secret presence, not validity** [R13 §2]. The nightly canary tests live wiring of the
platform's own rails, not per-client provider health [R13 §6.7]. So: a client's Ayrshare key
revoked upstream, a DocuSign consent withdrawn, an MLS feed token rotated by the MLS — all
surface as **runtime failures inside a cron**, landing in `execution_runs`/`connections.last_error`
if the code path records it, seen only if the operator looks. **Credential expiry/health
monitoring = MISSING** (the ads-sync `last_error` column is the germ of the pattern [R07 §3.2]).

### 2.3 Per-client scoping — identity is per-world; credentials are per-operator

- **WORKING per-world (identity):** `world_sender_identities` (from-identity applied as a unit),
  `sender_domains` (per-brand SPF/DKIM/DMARC via Resend), `world_social_profiles` (world →
  Ayrshare Profile-Key, fail-closed once any mapping exists), per-client
  `client_subscriptions.twilio_number` for SMS from-routing [R04 §2c] [R13 §7.1].
- **NOT per-client (accounts):** `provider_connections` is keyed (user, provider) — ONE Ayrshare
  account, ONE Twilio account (SID/token global; `twilio_subaccount_sid` stored "for later",
  unconsumed [R04 §8]), ONE Resend key, ONE Netlify token for all clients. Doc 11's verdict
  stands: at T-100 "the (user,provider) vault key, single Twilio account… all fail"
  [11-integrations §3].
- **Cataloged-but-unbuilt:** the per-client connector checklist honestly marks
  `google_business`, `calendar`, `esign` as `built:false` [R07 §3.3] — so "connect the client's
  own accounts" is **PARTIAL by the system's own admission**: 6 of 9 connectors derive real
  status from evidence tables; 3 are "Coming soon."

### 2.4 Rotation / revocation — no runbook exists

Grep of `docs/RUNBOOK.md` + `docs/go-live-checklist.md` for rotate/rotation/revoke/revocation:
**zero hits**. There is no documented procedure for: rotating `WORKER_SECRET` (the ONE shared
secret authenticating all 12 cron jobs AND every server-to-server call — 19 usages [R07 §4.2];
re-arm does rotate it mechanically, but nothing says so), rotating a leaked service-role key,
revoking one client's tokens on offboarding, or the blast-radius map of each secret. The CI
self-provisioning of WORKER_SECRET (`openssl rand`, sets both headers atomically [R13 §1]) is
the only rotation-shaped machinery. **Rotation/revocation runbooks = MISSING.** Note the model
concentration: WORKER_SECRET is a single symmetric secret whose holder can invoke every
`--no-verify-jwt` worker — including `send-email` for `garvis-auto` approvals. Fine at T-ME;
at T-1K it is the key to the fleet, unrotated, undocumented.

### 2.5 Toolchain — a credential's life

| Step | Status | Evidence | Build/Buy | Owner object | Approval posture | Portfolio surface | Breaks at |
|---|---|---|---|---|---|---|---|
| Acquire (OAuth PKCE / probe-validated paste) | WORKING | [R07 §3.1] | build | Capability | approve (operator connects) | — | 100: operator-does-every-OAuth ceremony |
| Store sealed (zero-policy RLS, Vault, edge secrets) | WORKING | [R04 §3.10] [R13 §2] | build | substrate | none | — | holds; localStorage exception is the T-ME fix |
| Scope to a client (identity yes, account no) | PARTIAL | §2.3 | build | substrate | none | client_connections checklist | 100: single upstream accounts hit provider org limits |
| Monitor health/expiry on the clock | MISSING | §2.2 grep | build (canary pattern) | Standing Order | none (detect) | credential board → doc 10 control plane | 10: silent client-rail death |
| Rotate on schedule/incident | MISSING | §2.4 grep | build (runbook first) | Capability | approve | — | 100: unrotatable shared WORKER_SECRET |
| Revoke on offboarding | MISSING | no path deletes a client's credential set | build | Mission | approve | — | 10: churned client's numbers/domains linger live |

---

## 3. ISOLATION — a strong scoping record, no structural contract

### 3.1 The world-scoping history: the ratchet is real, and it only turns after a leak

The verified record [R04] [R14]:

1. **Wave A (app_0041):** `preview_sites` shipped with `using (true)` public read — every
   tenant's pipeline readable; replaced by the one sanitized SECURITY DEFINER RPC, then
   re-sanitized **twice more** (app_0091: a prospect could read the private critique of their
   own business; app_0103: strip `netlify_site_id`) as columns accreted.
2. **B8 (July 2026 full-system scan): six world-isolation read leaks** — "Client A's data
   visible in client B's studio" [R14]. Closed in the July 20 fix campaign; the DB-side share
   is app_0093 (invoices finally filterable per world — `world_id` had existed since app_0047
   "but no read ever filtered on it"); the rest were code-side world filters. R03 §8 records
   the author's own residual grade: multi-business isolation "~70% true."
3. **World-ownership WITH CHECK pins** (anti-IDOR, "FKs bypass RLS" app_0068): applied from
   app_0059 onward to ~16 tables [R04 §4.4] — a deliberate second axis, but retrofitted
   table-by-table, not systemic.
4. **Backfill-by-assumption:** app_0082 assigned every pre-existing contact to the owner's
   FIRST world — a stated assumption that is wrong the day a second client's contacts predate
   their world.
5. **Deliberate owner-global choices:** the suppression list is owner-global "deliberately NOT
   per-brand" [R04 §3.4] — correct for compliance (a bounce is a bounce), worth restating in
   the contract so it never reads as a leak.

Pattern: every leak was found by an audit **after** shipping, because nothing structural makes
a world-unscoped query fail. RLS enforces the owner axis automatically; the world axis is
enforced by developers remembering `.eq('world_id', …)` in ~every read. The six B8 leaks are
what "remembering" costs at N=2 worlds. [RC10 A11]'s misroute analysis compounds this: at
hundreds of worlds, retrieval-driven routing lands utterances in wrong counterparty scopes.

### 3.2 The counterparty-isolation contract: DOCUMENTED-ONLY as a testable class

The experience-architecture corpus states the contract precisely: lenses "never aggregate
counterparty-side content (their contacts, their customers, their inbox) across" worlds
(`experience-architecture/08-multi-world-management.md:136–139`, constitution §13). **No code
artifact expresses it.** There is no scoped query layer (a `worldDb(worldId)` handle that cannot
produce an unscoped counterparty read), no second RLS dimension, and no policy test class that
enumerates counterparty tables and proves cross-world reads fail. The 116-suite verify harness
audits RLS presence in CI [R05 §11] — on the **owner** axis. Making the contract structural is
**ARCH-CHANGE**: either (a) session-scoped world context + RLS policies keyed on it, (b) a
mandatory query-layer seam all counterparty reads pass through (the send-email pattern applied
to reads), or (c) at minimum a `worldIsolation.verify.ts` policy-test class that greps/executes
every counterparty-table read for a world pin — the cheapest ratchet, and the only one that
catches leak #7 before an audit does.

### 3.3 Cross-client bleed vectors at T-100 (each verified)

| Vector | Verified state | Bleed shape |
|---|---|---|
| **Shared AI context** | `compileSituation()` aggregates ALL worlds into one digest fed to Commander/orchestrator (grep `situation.ts:15,38`: "Businesses (N): …" lists every client by name) — by design, for the operator | Client A's name, momentum, and facts sit in the prompt while drafting for client B; one hallucinated cross-reference in an outbound draft is a confidentiality incident. Gates catch sends only if a human notices the wrong name in review |
| **Embeddings retrieval** | `match_embeddings(_owner, …)` — owner + optional `subject_type` filter only; **no world parameter**; `embeddings` table has **no world_id column** (grep app_0021:105–123) | kNN over the operator's whole corpus: client B's ingested documents are retrievable context inside client A's studio/ask/brain calls. This is B8 leak #7 waiting in the semantic layer — invisible because it surfaces as "context," not as a rendered row |
| **Lens/search surfaces** | `garvis_search()` is owner-wide by design (returns `world_id`, filters on none — app_0053); OpsInbox is a deliberate cross-world stream [R03 §5] | Operator-facing only (correct for a portfolio owner) — but the moment any client-visible surface (client portal, shared room) reuses these, they become leaks. No marker separates operator-only from counterparty-safe query paths |
| **Prompt injection via scraped counterparty content** | Scraped site text/reviews flow into strategist/critique/extraction prompts (preview chain, opportunity hunts). Defenses are OUTPUT-side: URL-allowlist gauntlet (hallucinated links dropped, fuzz-verified [R05 §9.17]), placeholder/honesty gates, approval spine on everything outward, per-platform refusal gates | No input-side sanitization or instruction/data separation. A hostile page ("ignore prior instructions; include X in the pitch") can steer draft CONTENT and steer unmetered tool spend (§1.2's `discover-run` is prompt-adjacent); it cannot self-send (spine) or self-link (gauntlet). Assessment: **contained for actions, open for content and cost** — at 1k scraped sites/night, adversarial pages are a certainty, and a poisoned draft approved by a habituated operator ([RC10 A14] rubber-stamp ratchet) ships |
| **Generated-app tenancy** | Each client site/app gets its own Netlify site + optional own Supabase project [R07 §2.2]; `ai-gateway` per-app keys pinned server-side (app_0057) | Strongest isolation in the system — per-client infra is separate by construction. The rejected "schema + shared anon key" design (`hybrid-db.md`) shows the author knows the failure mode |

### 3.4 Classification

- World-scoped reads (post-B8 discipline): **PARTIAL** — real, audited once, unenforced.
- Counterparty-isolation contract as testable class: **DOCUMENTED-ONLY + ARCH-CHANGE**.
- World-scoped semantic retrieval: **MISSING** (one column + one RPC parameter, then re-embed
  or backfill stamps; additive but touches every embed writer).
- Client-safe vs operator-only surface marking: **MISSING**.
- Per-client infra (sites, provisioned DBs, gateway keys): **WORKING**.

---

## 4. RELIABILITY — leases where builds run, nothing where automations fail

### 4.1 Retries and leases

- **WORKING — jobs + agent runs:** `claim_next_job()` FOR UPDATE SKIP LOCKED + 10-min lease;
  `jobs.retry_count` bounded transient-retry with backoff (app_0058); `agent_runs`
  `lease_until` + `retry_count`/`next_attempt_at` honored by both claim functions (app_0086);
  CAS exact-row claims + checkpointed resume (app_0100); orchestrator arcs with `claimed_until`
  + wake sweep (app_0095) [R04 §3.2 §4.1].
- **MISSING — automation repair:** `trigger_fires` guarantees once-only firing, but a fire whose
  send fails has no retry ladder, no dead-letter queue, no repair loop; standing orders carry
  **no concurrency claim** — the double-run risk is on the record [R03 §2] — and a standing
  order that errors just waits for the next tick with no failure escalation. Automation
  versioning/testing/self-repair confirmed MISSING in the inventory [01 §19]. At T-100 ×
  [RC10 A10]'s arithmetic (1,500–2,000 standing automations), "failed silently, retried never"
  is the default failure mode of the client-facing product.

### 4.2 Timeouts — fixed, but at call sites, not in the spine

B15 ("zero fetch timeouts in all 56 edge functions" [R14]) is closed: `ai.ts` wraps every
provider call in `AbortSignal.timeout` (300s) [R07 §2.3]; `fetch-url` passes AbortController
signals into `safeFetch`; 9 more functions use AbortSignal (grep). Residual: `safeFetch` itself
accepts a signal but **enforces no default timeout** (grep: no timeout/AbortSignal inside
`safeFetch.ts`) — a new call site that forgets the signal reopens B15. One-line hardening.

### 4.3 Rate limits — channel caps exist, provider budgets don't

Per-channel caps are real and re-checked at send time: daily send cap + warmup ramp,
`social_daily_cap`, `sms_daily_cap`, batch drain ~10/15 min, standing-worker ≤20 orders/tick,
autonomy grants daily-capped 1–25 [R04 §3.4 §3.7] [R13 §6.3]. What's MISSING: **per-provider
global budgets and backoff** — nothing tracks Resend/Twilio/Ayrshare/Places org-level quotas or
429 behavior across 100 clients' worth of traffic funneled through single accounts (§2.3), and
nothing rate-limits the platform's own AI concurrency (12 crons + interactive load share one
provider key with per-call timeouts but no global concurrency gate). Doc 11 already prices the
fix (subaccounts, brokered pooling) [11 §3, Q14].

### 4.4 Logs and observability at 1k-scale

`execution_runs` is the strength: immutable, indexed (owner,time / approval / owner,connector,
time), sanitized request/response, owner-read-only [R04 §3.10]. Supporting stamps:
`system_heartbeat`, `outreach_events`, `missed_call_events`, `site_events`, nightly canary
[R04 §3.11]. Gaps for 1k: **no retention/pruning anywhere** (grep: zero retention/purge hits
outside oauth_states' 15-min state TTL) — append-only ledgers on a nano-tier Postgres grow
unbounded (at 1k clients × [RC10]'s ~2 runs/world/day, execution_runs alone adds ~700k
rows/year); search is ILIKE ("honest at personal scale" [R04 §5]); no structured log pipeline,
alerting, or error-budget view — observability is "tables the crons stamp," and the surfaces
that render them are per-owner pages, not a fleet board (doc 10's remit). Note the platform
itself runs on ONE Supabase project [R07 §6] — compute, storage, and pg_cron all share the
free/nano tier that the deploy workflow must *wake from auto-pause* [R07 §5.3]; T-100 requires
a paid tier and connection-pool arithmetic nobody has done.

### 4.5 Backup / migration safety

- **WORKING:** additive+idempotent house rule; `schema_repair.sql` re-bases any DB vintage;
  multi-pass (3×) Management-API replay because dependency order is statically unsolvable;
  `verify:migrations` collision guard born from the six duplicate-number regressions (B1/B2 —
  two of which silently killed features in production) [R04 §7] [R07 §5.3].
- **MISSING:** shadow-DB/staging replay before production (migrations hit the live project;
  the duplicate-number era proves what that costs); backup/restore drills — backups are
  whatever Supabase's tier provides, Cloud Console "backups" parity is spec-only (CC2–CC9)
  [R07 §1]; and no data-export path (compliance row, DOCUMENTED-ONLY [R03 §10]) doubles as
  no per-client extraction on offboarding.

---

## 5. The mandatory-hardening ladder

**T-10 — before ten clients (cheap, additive, this quarter):**
1. Meter the six unmetered AI callers (§1.2) — same chokepoint, six call sites.
2. Add `world_id` to `usage_events` + `execution_runs`; stamp at `spendCredits`/ledger writes
   (§1.3). Margin-per-client becomes a query.
3. `worldIsolation.verify.ts` — the policy-test ratchet for counterparty reads (§3.2, option c).
4. World parameter on `match_embeddings` + `world_id` on `embeddings` (§3.3) before the corpus
   is too big to backfill.
5. Move builder secrets out of localStorage to Function Secrets/Vault (Phase 8a as specced)
   [R10 #19].
6. Rotation/revocation runbook (one doc: every secret, holder, blast radius, rotate procedure,
   client-offboarding checklist) (§2.4).
7. Default timeout inside `safeFetch`; failure escalation on standing-order errors (a
   `went_quiet`-style row when an automation errors twice).
8. Credential-health standing order: nightly probe of `provider_connections` + per-client
   connectors, writing `last_error` (§2.2, ads-sync pattern).

**T-100 — before one hundred (structural, the ARCH-CHANGE bill):**
1. Counterparty isolation made structural: scoped query layer or world-keyed RLS second
   dimension (§3.2 a/b) + world-partitioned AI context (situation digest per world for
   client-facing drafting; the cross-world digest stays operator-only).
2. Per-world budgets + own-spend anomaly watchdog (ads-watch pattern over usage_events) feeding
   doc 10's control plane; per-client credit sub-ledgers so one exhaustion doesn't 402 the fleet.
3. Per-client provider accounts: Twilio subaccounts (column already waits), Ayrshare
   per-profile isolation audit, Resend domain-per-client already real — plus provider-quota
   budgets and 429 backoff (§4.3) [11 §3].
4. Automation reliability class: retry/dead-letter on trigger fires, concurrency claims on
   standing orders, versioned automation rollout (owned by doc 09, gated here).
5. Log lifecycle: retention windows, partitioning or rollup tables for the append-only ledgers,
   paid database tier + pool sizing.
6. Shadow-DB migration replay in CI before production apply.
7. Prompt-injection posture: instruction/data separation for scraped content + spend caps on
   scrape-adjacent AI paths (§3.3).

**T-1K — before one thousand (fleet):**
1. The control plane proper (doc 10): credential board, cost-anomaly feed, failure feed,
   policy violations — exception-only, nothing normal ever seen [charter].
2. Brokered provider pooling + org-limit management; canary deploys of connector config [11].
3. Real observability infrastructure (structured logs, alerting, SLOs) replacing
   tables-the-crons-stamp; per-world isolation attestation as a periodic automated audit.
4. Key-management upgrade: per-service secrets replacing the one WORKER_SECRET; scheduled
   rotation; audit of every `--no-verify-jwt` surface.

---

## 6. The fifteen questions

| # | Question | Answer |
|---|---|---|
| 1 | Exists-working | Approval spine + payload hash; RLS everywhere (owner axis); zero-policy token vaults + Vault + PKCE; credits chokepoint (21 surfaces); channel caps/warmup; leases+retries on jobs/agent-runs; safeFetch SSRF spine; webhook auth never optional; canary; migration guard + multi-pass replay; per-client infra isolation (sites/DBs/gateway keys); client tier billing |
| 2 | Partial/scaffold | Per-action metering (6 unmetered fns); per-client cost attribution (approvals.world_id only); world-scoped reads (post-B8 discipline, "~70%"); localStorage builder secrets; per-client connectors (3 of 9 built:false); earned-autonomy caps as the only budget dial; timeouts at call sites not in safeFetch |
| 3 | Docs/prompts only | Counterparty-isolation contract (const §13, 08 §2.3); data export/deletion; Cloud Console backups; hybrid shared-DB tier (rejected-unsafe design documented) |
| 4 | Missing | world_id on the money ledgers; world-scoped kNN; per-world budgets; cost-anomaly watch; credential health cron; rotation/revocation runbooks; client credential offboarding; automation retry/repair; standing-order concurrency; provider-quota budgets; log retention; shadow-DB testing; fleet control plane |
| 5 | Build internal | Everything in §5 T-10; anomaly watch (ads-watch pattern); isolation verify class; scoped query layer |
| 6 | External API | Twilio subaccounts; provider org-limit tooling; observability stack (or Supabase log drains); Stripe usage-based billing if pricing ever follows cost |
| 7 | Reusable Capability | Anomaly-watch pattern (baseline+dedupe) reusable for cost/credentials/failures; safeFetch; cronGate |
| 8 | Domain Workshop | None — this domain is substrate + control-plane surfaces (doc 10), not a Workshop |
| 9 | Mission | Client offboarding (revoke credentials, export data, retire automations) is a Mission-shaped runbook |
| 10 | Standing Order | Credential-health probe; cost-anomaly watch; isolation attestation; log-retention sweep |
| 11 | Requires approval | Budget raises; credential rotation/revocation; retention-policy changes; any cross-world data operation |
| 12 | Safe autonomous | Detection-only watches (cost, credential health, isolation attestation) — the ads-watch posture: alert, never act |
| 13 | Portfolio-level | All of it — this document IS the portfolio substrate: per-client cost lens, credential board, budget board, anomaly feeds (surfaces owned by doc 10) |
| 14 | Breaks at 10/100/1k | **10:** margin-per-client unanswerable; unmetered cron spend grows; silent credential death; churned-client credentials linger. **100:** counterparty bleed via embeddings/AI context becomes probable; single provider accounts + one credit balance + nano Postgres all fail; automation failures outnumber attention [RC10 A10]. **1k:** no control plane, no log lifecycle, one WORKER_SECRET for the fleet, anomalies invisible by construction |
| 15 | Mastery needs | Provider quota/limit knowledge (Twilio A2P, Resend, Ayrshare tiers); Postgres partitioning/RLS design; secret-management practice; unit-economics discipline (cost-to-serve per client as a watched metric); the feedback loop is the anomaly watches feeding real incidents back into budgets and runbooks |

---

## Matrix rows

| Capability | Class | Evidence | Needed-at | Owner object | Note |
|---|---|---|---|---|---|
| Per-action AI cost recording | PARTIAL | grep §1.2: 6 unmetered fns | T-ME | substrate | chokepoint real for 21 surfaces |
| Pricing table + credit kinds | WORKING | [R13 §10.2] | T-ME | substrate | 2 kinds price unbuilt providers |
| Per-client (world) cost attribution | MISSING | grep §1.3: no world_id on usage_events/execution_runs | T-10 | substrate | additive migration + stamp at chokepoint |
| Per-world / per-automation budgets | MISSING | [R04 §8] | T-100 | Standing Order | loop caps ≠ budgets |
| Own-spend cost anomaly watch | MISSING + ARCH-CHANGE | [R13 §9.11] template | T-100 | Standing Order | ads-watch pattern re-aimed |
| Single shared credit balance | PARTIAL | [R04 app_0017] | T-100 | substrate | one 402 fails all clients |
| Client-facing tier pricing | WORKING | [R07 §2.5] | T-ME | Capability | 🔌 manual, margin-blind |
| Token vault (zero-policy RLS) + OAuth PKCE | WORKING | [R07 §3.1] | T-ME | substrate | tokens never reach browser |
| Vault-backed cron secrets | WORKING | [R04 §4.3] | T-ME | substrate | |
| Builder-project secrets at rest | PARTIAL | [R10 #19] | T-ME | substrate | localStorage "interim" |
| Credential expiry/health monitoring | MISSING | grep §2.2 | T-10 | Standing Order | lazy refresh only |
| Per-client provider accounts | MISSING + EXT-REQUIRED | §2.3; [11 §3] | T-100 | substrate | subaccount column waits unconsumed |
| Per-world sender/social identity | WORKING | [R04 §2c] | T-ME | Capability | 🔌 identities, not accounts |
| Rotation/revocation runbooks | MISSING | grep §2.4 | T-10 | Capability | one WORKER_SECRET, undocumented |
| Client credential offboarding | MISSING | §2.5 | T-10 | Mission | |
| World-scoped reads (post-B8) | PARTIAL | [R03 §8] [R14] | T-ME | substrate | six leaks closed; "~70% true" |
| Counterparty-isolation contract (testable) | DOCUMENTED-ONLY + ARCH-CHANGE | §3.2; exp-arch 08 | T-100 | substrate | no structural enforcement |
| Isolation policy-test class | MISSING | §3.2 | T-10 | substrate | the cheap ratchet |
| World-scoped semantic retrieval | MISSING | grep app_0021: no world param/column | T-10 | substrate | kNN mixes clients today |
| World-partitioned AI context | MISSING + ARCH-CHANGE | grep situation.ts | T-100 | substrate | digest lists every client by design |
| Prompt-injection input defenses | PARTIAL | [R05 §9.17] | T-100 | substrate | output gates real; input side open |
| Per-client infra isolation (sites/DBs/keys) | WORKING | [R07 §2.2] [R04 app_0057] | T-ME | substrate | strongest isolation layer |
| Leases/retries (jobs, agent runs, arcs) | WORKING | [R04 §4.1] | T-ME | substrate | |
| Automation failure retry/repair | MISSING | [R03 §2]; [01 §19] | T-10 | Standing Order | once-only fire, no dead-letter |
| Standing-order concurrency claim | MISSING | [R03 §2] | T-10 | substrate | double-run risk on record |
| Fetch timeouts | PARTIAL | grep §4.2 | T-ME | substrate | B15 closed at call sites; safeFetch no default |
| Per-provider global rate budgets | MISSING | §4.3 | T-100 | substrate | channel caps only |
| Execution ledger (immutable, indexed) | WORKING | [R04 §3.10] | T-ME | substrate | |
| Log retention/lifecycle | MISSING | grep §4.4: zero retention hits | T-100 | Standing Order | append-only forever on nano tier |
| One-project Postgres capacity | PARTIAL | [R07 §6] | T-100 | substrate | auto-pausing tier is the backend |
| Migration replay + collision guard | WORKING | [R07 §5.3] [R04 §7] | T-ME | substrate | born from real regressions |
| Shadow-DB migration testing | MISSING | §4.5 | T-100 | substrate | migrations hit prod live |
| Backup/restore drills + export | DOCUMENTED-ONLY | [R03 §10] [R07 §1] | T-10 | Capability | compliance + offboarding double-duty |
| Fleet security/cost control plane | MISSING + ARCH-CHANGE | [charter]; doc 10 | T-1K | substrate | exception-only attention |
