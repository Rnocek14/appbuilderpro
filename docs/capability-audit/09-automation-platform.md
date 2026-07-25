# 09 — The Automation Platform: Creation, Testing, Deployment, Monitoring, Repair, Versioning

*Phase 5.5 capability audit. Domain: the automation platform as a whole — how an automation is
born (detected, designed), proven (tested), sold and configured per client, armed, executed,
watched, repaired, versioned, and templated — plus the app/site BUILDER audited as it feeds
automations and client work. Rubric, formats, and evidence protocol: `_charter.md`. Evidence:
[R03] §2/§8 · [R04] §3.7 + migration ledger (app_0058/0076/0078/0106–0110) · [R05] §6–7, §9.23
· [R06] §0/§6 · [R10] #10 · [R13] §2, §5.3, §6.3, §7.11–7.14, §13.8/13.10 ·
`docs/automation-triggers-seed.sql` · direct greps of `src/lib/garvis/automation/`,
`supabase/functions/standing-worker/index.ts`, `supabase/functions/deploy-backend/index.ts`,
and `supabase/functions/_shared/prompts.ts` cited inline. Sibling inventory:
`01-capability-inventory.md` §19.*

---

## 0. The honest headline — one lifecycle, THREE automation substrates

This system does not have "an" automation engine. It has three, born in different eras, with
different physics:

1. **The operator spine** — standing orders (6 kinds + 8 drain/sweep subsystems inside the
   2,375-line `standing-worker`, "the de-facto second application" [R13 §13.10]), the client
   **trigger engine** (`automation_triggers` → `trigger_fires` → approval-gated sends
   [R03 §8, R04 §3.7]), and config-as-automation rails (missed-call text-back, booking
   reminders — where a config row IS the pre-authorization [R13 §7.11–7.12]). Everything here
   rides the approval spine and the 15-minute heartbeat 🔌.
2. **The generated-app substrate** — every FableForge-built app that needs recurring work gets
   its own `automations` / `automation_runs` / `automation_run_steps` tables and ONE
   `automation-runner` edge function in the *client's own* Supabase project, driven by an
   every-minute pg_cron tick that `deploy-backend` wires automatically at deploy
   (`supabase/functions/deploy-backend/index.ts:173–228`; architecture dictated by
   `AUTOMATION_GUIDE` in `_shared/prompts.ts:404–509`) [R13 §5.3, §13.8]. A genuinely separate
   substrate with **better retry machinery than the parent's own** (backoff, dead-letter, step
   memoization) and none of the parent's compliance gates.
3. **The builder itself** — the factory that manufactures substrate #2, and increasingly the
   platform's answer to "automate something the registry can't": build an app that does it.

The lifecycle audit below (§1) is where the charter's expectations land hardest: detection,
design, config, execution, and monitoring are real and verified; **testing, repair, and
versioning are MISSING essentially everywhere**, and the template library is code, not data.
One live defect — the `send_sms` approval-enum gap [R10 #10] — is audited in §1.1 at its full
blast radius, which is wider than "SMS doesn't send."

---

## 1. Chain 1 — THE AUTOMATION LIFECYCLE (client automations on the operator spine)

The end-to-end sequence an automation travels from "this business drops leads" to "recall
emails fire every month for client #37." One row per step.

| Step | Status | Evidence | Build/Buy | Owner object | Approval posture | Portfolio surface | Breaks at |
|---|---|---|---|---|---|---|---|
| 1. Opportunity detection | **WORKING** | `detect.ts` — pure, deterministic, **no model call**: `manual_process:*`/`platform:*`/`stack:*` signals from site-audit facts + scraped text + tech fingerprint, resolved against the registry; unmet needs surface as GAPS, never proposals [R05 §9.23]; proposals persisted at audit write time (`prospect_audits.proposals`, app_0082 [R04]); public free-text intake via `automation-intake` (deterministic `intakeAutomations`, hottest lead → `opportunities`) [R13 §7.14] | Build (done) | Capability | none (read-only inference) | Lens: detected-but-unsold automations across all prospects (the "graduation loop": recurring gaps tell you what to build next) | Holds to T-1K (pure function) — but the signal taxonomy is a static hand-list; at T-100 new verticals need signals someone must hand-code (see step 10) |
| 2. Design | **WORKING** (for the shipped class) / visual flow design **MISSING** — see verdict below | `registry.ts` — 8 capabilities with honest maturity (`ga`/`beta`/`not_built`), consent basis, compliance notes, price ranges; `triggerDefault` (anchor+offset+window+templates) makes design a one-click instantiation [R05 §9.23]; the ONLY authorable automation shape is single-step "fire once, N days after an anchor date" (`triggers.ts:1–14`) | Build: flow design only when multi-step arrives | Workshop (§5) | none (drafts) | Cohort view: which capability sold to which clients | T-ME holds — the sellable class is deliberately narrow. T-10: multi-step drip flows (level-10 #4, specced-only) can't be expressed at all; today's pressure valve is "build an app for it" (chain 2) |
| 3. **TESTING** | **MISSING** (beyond two partial floors) | The whole harness is `docs/automation-triggers-seed.sql` — 42 lines of manual SQL seeding 3 customers with relative dates ("run the engine, watch the Queue"); pure cores ARE verify-tested (`triggers.verify.ts`, `detect.verify.ts` [R05 §9.23]) and the clock is injectable end-to-end (`runTriggersForOwner(nowIso?)`, `dueFires(..., nowIso)` — the seams for a real harness already exist, `triggersRun.ts:47`) | Build — spec in §1.2 | Workshop bench (test instruments) | none (internal; sandbox sends to self) | Control-plane check: "was this automation ever dry-run against this client's real list before arming?" | T-ME survivable (operator eyeballs the Queue); **T-10 fails** — arming a mis-windowed trigger on a client's 4,000-person list produces 4,000 pending approvals; nothing simulates before arming |
| 4. Per-client config | **WORKING 🔌** | app_0108: nullable `client_subscription_id` on `automation_triggers`/`missed_call_configs`/`customer_lists`; per-client Twilio number + subaccount SID; ROI stats at point of sale (PR #64); attribution to paying clients (PR #67) [R03 §8, R04] | Build (done) | Capability | none | Client console rollups exist (honest "Unassigned" bucket) [R05 §9.22] | T-100 — config is per-trigger-row; no notion of a client cohort sharing a config with local overrides (that's the versioning gap, step 9) |
| 5. Deployment / arming | **WORKING 🔌** (three separate switches, none self-throwing) | (a) trigger row `status='active'`; (b) **the heartbeat must be armed** — never self-arms, ships OFF [R06 §0]; (c) channel prerequisites: verified sender domain, client Twilio number via connections checklist [R03 §8]; NOTE `booking` fn is in NO deploy list [R13 §13.4] | Build: self-arm (CI step exists, defaults off) | Standing Order | none — but arming an automation on a client list deserves at least `slate` (see step 3) | Master Switch + Health board show armed-vs-expected drift [R03 §2] | T-ME — the author's own worst finding: "an unarmed heartbeat kills every scheduled feature SILENTLY" [R13 §2]; at T-100 arming must be a per-cohort canary rollout, which nothing supports |
| 6. Execution | **WORKING 🔌 (email)** / **DISCONNECTED (SMS)** | TWO runners, ONE pure core: browser `runTriggersForOwner` + the standing-worker drain, both using `dueFires`/`renderTemplate` with claim-first `trigger_fires` idempotency, stranded-claim sweep (10 min), window guard (no retroactive blasts), once-only fire keys, consent parity (cold rows never ride warm triggers), channel-aware email/SMS with per-client SMS FROM routing (`standing-worker/index.ts:434–620`, `triggersRun.ts`) [R03 §8, R13 §6.3]; every fire → PENDING approval → THE one send path re-gates at send time | Build: **one-line enum migration** for SMS | Standing Order | approve (per-fire approvals; `warm_transactional` consent-gated) — earned autonomy classes exist but triggers aren't one of them [R05 §6] | Slate: due fires across all clients land in the ONE Queue | **T-ME for SMS** (enum, §1.1); T-100 for email — per-fire human approval of high-volume recurring sends can't scale without extending earned autonomy to trigger classes |
| 7. Monitoring | **WORKING** (success) / **PARTIAL** (failure) / trace UX **PROTOTYPE-ONLY** | `trigger_fires` ledger (fire → approval_id), `execution_runs` immutable send/skip/fail audit, `outreach_events` engagement, `system_heartbeat` liveness + Health board [R03 §2, R04 §3.7]; monthly automation report counts only ledger rows — "a quiet month says Quiet month so far" (`reportCore.ts` [R05 §9.23]); ROI stats real [R03 §8]. The richer "all 31 ticked, oldest 06:03" heartbeat-trace surface exists only in `prototypes/morning-brief.html:677` | Build: failure ledger (§1.3) | ledger + Workshop bench | none | Lens: per-client automation report; control-plane: heartbeat staleness | T-10 — **failures are invisible**: the drain's catch block releases the claim and records NOTHING (`standing-worker/index.ts:614–617`); a trigger failing every tick for a month produces zero mind_events, zero error rows |
| 8. Failure / REPAIR loop | **PARTIAL** (retry) / **MISSING** (repair) | Retry exists at every layer: claim-release-retry per fire, stale-claim sweeps, `jobs.retry_count` bounded backoff (app_0058 [R04]), agent_runs re-queue [R13 §6.2], child-substrate backoff+dead-letter (§2). REPAIR — noticing a *persistently* failing automation, diagnosing, pausing, proposing a fix — exists nowhere; grep confirms no consecutive-failure counter, no auto-pause, no dead-letter on `trigger_fires` | Build — spec in §1.3 | substrate + Standing Order (the watchdog is itself an automation) | none (pause is safe); repair PR = approve | Exception rule: only broken automations ever surface | **T-ME** — §1.1 is the live proof: a real defect has been failing invisibly on every armed SMS trigger since app_0106 shipped |
| 9. **VERSIONING** | **MISSING + ARCH-CHANGE** | No version anything: `automation_triggers` rows are mutable in place (templates edited live); no definition/instance split; no record of *which* template text a client was running last month (partial mitigation: `outreach_messages` snapshots each rendered send — the ledger remembers what went out, not what definition produced it); "which version is client #37 running" is unanswerable; no staged rollout, no rollback [R04 app_0076; grep: zero `version` columns in the automation schema] | Build — spec in §1.4 | substrate | approve (a version migration touching client sends is a decision) | Control plane: version histogram per capability across clients; canary cohort state | **T-100 by design, but the crack shows at T-10**: improving the recall template for one dentist vs. all dentists is already inexpressible |
| 10. Template library | **WORKING as code** / templates-as-data **MISSING + ARCH-CHANGE** | The registry IS the library — a TypeScript array (`registry.ts:46–164`); adding a capability or vertical = code deploy; `vertical_specs` ("new venture kind = a row") is PLANNED with zero code hits (grep: nothing in src/ or supabase/) [R03 §9]; **found this audit: the registry has no update loop and is now stale — see §1.5** | Build: capabilities/templates as rows, aligned with the VerticalSpec direction | substrate | approve (publishing a template to the library) | The library is the product at T-100: sector packs sold repeatedly | T-10 — every new client vertical needing a new automation is a platform deploy, not an operator act |

**Chain verdict.** The front of the lifecycle (detect → design → config → execute → monitor
successes) is real, verified, and unusually honest — the window guard, claim-first idempotency,
and consent parity are exactly the properties a recurring-revenue automation business must
never get wrong, and they are owned by a pure, injectable-clock core with verify coverage. The
back of the lifecycle does not exist: nothing is tested before it is armed, nothing reports
its own failure, nothing is versioned, and the library can only be changed by deploying the
platform. The shipped product is precisely: **"a small set of hand-vetted, single-step,
compliance-gated automations that an operator can configure per client in one click and that
fire reliably while the operator sleeps — provided the operator armed the clock, watches the
Queue, and never needs to know when one breaks."** That is a T-ME product with T-10 revenue
mechanics (per-client attribution + ROI at point of sale already work) standing on T-ME
operations. The three missing loops (test, repair, version) are all buildable on seams that
already exist — which is what separates them from the ARCH-CHANGE rows: testing and repair
are new code on the existing spine; versioning and templates-as-data are one shared schema
change (§1.4).

### 1.1 The `send_sms` enum bug — full blast radius (code-verified)

[R10 #10] verified the root cause: `approval_kind` never gains `'send_sms'`, yet
`send-sms/index.ts:36` requires it and `execution.ts:13` types it. This audit traced what that
does to the *automation platform* specifically (`standing-worker/index.ts:434–620`):

1. **Every SMS-channel trigger fire fails at approval insert** (`kind: 'send_sms'`, line 605)
   — the DB rejects the enum value, the `catch` deletes the `trigger_fires` claim (line 616),
   and the fire retries **every 15-minute tick** until its `windowDays` expires.
2. **The fire budget is burned before the failure.** `fireBudget` (40/tick, line 479) is
   decremented at claim time (line 550), *before* the doomed insert. A client list with dozens
   of due SMS fires eats the whole tick budget failing, and because triggers are scanned in
   stable id order (line 463–465), **email automations ordered behind them starve** until the
   window guard retires the SMS fires.
3. **Nothing reports it.** The catch is silent — no `execution_runs` row, no `mind_events`, no
   error ledger (step 7's finding). The monthly report shows "quiet," which is honest about
   sends and dishonest about health.
4. **The accidental circuit breaker is the window guard**: after `windowDays`, each due date
   stops being due, so the churn is bounded per due date — the one reason this is degradation
   rather than an unbounded loop.
5. Same failure in the browser runner (`triggersRun.ts` → `enqueueApproval`) — there it at
   least surfaces as `errors` in the run summary.

**Repair**: the one-line enum migration [R10 #10] — plus the §1.3 failure ledger, because the
platform should have *told* the operator months ago. This bug is the strongest single argument
in the corpus for the repair loop.

### 1.2 What a real test harness needs (the spec — step 3)

The seams already exist: the scheduling core is pure with injectable `now`, and the seed SQL
proves fixtures work. A real harness is five pieces, none architecturally hard:

- **Dry-run mode**: compute `dueFires` + render templates against a client's REAL list and
  show the would-send plan (recipients, dates, rendered bodies) with **zero claims, zero
  approvals**. This is ~30 lines on the existing pure core.
- **Time-travel simulation**: replay N days of ticks over a fixture or real list ("armed on
  the 1st, here are the 14 fires the next 90 days produce") — the window guard's behavior made
  visible *before* arming. Pure-core loop over advancing `nowIso`.
- **Fixture packs per capability**: the seed SQL generalized — each registry entry ships
  fixtures (due-now / due-recently / not-yet / no-address / cold-consent / suppressed) so
  every capability has a golden plan asserted in CI, not just the pure math.
- **Sandbox send target**: a "send the whole plan to ME" mode routing every fire to the
  operator's own address/number through the real send path (all gates live) — the only honest
  test of rendering + gates + deliverability.
- **Arming gate**: creating an `active` trigger on a list above a size threshold requires a
  stored dry-run result (an approval whose payload IS the plan hash) — turning testing from
  virtue into structure, the house style.

### 1.3 The repair loop (step 8 spec)

- **Per-fire failure ledger**: on enqueue failure, write an `automation_errors` row (trigger,
  customer, error text, tick) instead of a silent claim delete; keep the claim-release retry.
- **Consecutive-failure counter → auto-pause**: N straight failing ticks flips the trigger to
  `status='error'` (a new state, distinct from `paused`), drops a mind_event, and lands an
  exception card — pausing is always safe; that is what makes this `auto`-postured.
- **Classify before retry**: enum/schema errors (permanent — pause immediately, the §1.1
  class) vs. transient (retry with backoff). The child substrate already draws exactly this
  line (`automation_tick`'s dead-letter, §2) — copy it home.
- **Repair proposals**: for known classes, stage the fix as an approval (e.g. "trigger X fails
  because the client's Twilio number was disconnected — reconnect or switch channel to email").
  Diagnosis can be deterministic for the whole observed error taxonomy today.

### 1.4 Versioning (step 9 — the ARCH-CHANGE spec)

The minimum structure that answers "which version is each client running":

- **Definition/instance split**: `automation_definitions` (capability id, version, templates,
  window/offset defaults, compliance notes — immutable rows, new version = new row) vs.
  `automation_triggers` gaining `definition_id` + `definition_version` (the per-client pin).
  Today's registry entries become version-1 definition rows (this is also step 10's
  templates-as-data, one migration — the two ARCH-CHANGEs are the same schema).
- **Fires stamp the version**: `trigger_fires.definition_version`, so the ledger can answer
  "every send v3 ever made" — retroactively impossible today.
- **Migration path**: an operator action "move clients A,B,C from v2 → v3" staged as an
  approval per cohort; per-client pins mean laggards are a query, not a mystery.
- **Canary rollout** (T-100): version rollout to a cohort of 1 client-week before the fleet —
  the `garvis-canary` pattern applied to definitions.
- Aligned with `vertical_specs` [R03 §9]: a vertical's sector pack = a set of definition rows,
  making "new vertical = data" true for automations at the same time.

### 1.5 Registry-as-code drift (found by this audit)

`registry.ts:139–150` still lists `online_booking` as **`not_built`** ("NEVER proposed —
surfaces as a gap") — but the booking rail SHIPPED in app_0109 with DB-level double-book
exclusion, confirmations, and day-before reminders [R03 §8, R13 §7.12]. The honesty backbone
is now *dishonestly pessimistic*: detection meets a phone-only business and refuses to propose
the booking automation the platform actually delivers. Similarly `missed_call_text_back` sits
at `beta` while its rail is fully implemented and signature-validated [R13 §7.11]. This is the
cost of a library that only a code deploy can update — the smallest, most concrete evidence
for step 10's templates-as-data ruling. (One-line fixes today; a structural fix at T-10.)

---

## 2. Chain 2 — GENERATED AUTOMATIONS (the second substrate, in the client's own project)

| Step | Status | Evidence | Build/Buy | Owner object | Approval posture | Portfolio surface | Breaks at |
|---|---|---|---|---|---|---|---|
| Architecture dictated at generation | **WORKING** | `AUTOMATION_GUIDE` (`_shared/prompts.ts:404–509`): "a flagship capability… never a stub"; ONE dispatcher, automations-as-rows (`kind + config jsonb + schedule_interval`), runs ledger — "the proven Inngest/n8n shape on plain Supabase" | Build (done — it's a prompt contract) | Capability | none | — | Holds; but the contract lives in a prompt, enforced by generation quality, not by a validator |
| Schema + claim machinery | **WORKING** (generated per app) | `automations` / `automation_runs` (status machine, attempts, `dedupe_key`) / `automation_run_steps` (per-step memoization); `claim_due_runs` (FOR UPDATE SKIP LOCKED), `automation_tick` (heartbeat reaper: exponential backoff, **dead-letter** after max_attempts) [prompts.ts:422–476] | done | substrate (child) | none | — | Holds per app; N apps = N schemas with no common introspection |
| Runner + secrets deploy | **WORKING 🔌** | `deploy-backend`: the most privileged action — approval-spined (`deploy_backend` kind), confused-deputy-guarded, deploys functions + injects managed-AI secrets [R13 §5.3] | done | Capability | approve (always) | `execution_runs` ledger | Holds |
| Per-minute cron wiring in the CHILD | **WORKING 🔌** | `deploy-backend/index.ts:173–228`: detects a deployed `automation-runner`, reveals the child's service-role key, Vault-stores runner URL + bearer, `cron.schedule('fableforge-automation-tick','* * * * *')` — idempotent on re-deploy; runner rejects any caller without the service key | done | Capability | rides the same deploy approval | — | Holds mechanically; NOTE the child clock arms **automatically** — the child substrate self-arms while the parent's own heartbeat famously doesn't [R06 §0] |
| Execution (retries, resume, budget) | **WORKING** | Runner contract: 200-fast + `EdgeRuntime.waitUntil`, 30s heartbeats, step-memoized resume across the ~150s wall clock, backoff → dead; hardened scraping tree (conditional GET, Firecrawl escalation) [prompts.ts:478–509] | done | substrate (child) | none (tenant's own jobs) | — | Holds per app |
| Observability | **PARTIAL** | Runs UI is part of the generated contract; parent can reach child logs via `project-logs` [R13 §5.7]; but there is NO parent-side rollup — the platform cannot answer "which of my 40 clients' apps have dead-lettered runs" | Build: fleet read (child `automation_runs` → parent control plane) | substrate | none (read) | **The T-100 need**: exception-only fleet view of children | T-10 already — the operator would have to open 10 apps' dashboards |
| AI billing | **WORKING 🔌** | Child automations call back through `ai-gateway` with per-app keys, metered at 1.25× against owner credits [R13 §9.12, §13.8] | done | substrate | none | Credit spend per app exists | Holds to T-100 |
| Testing / versioning of generated automations | **MISSING** | Same lifecycle gaps as chain 1, worse: definitions are *code in the child*; changing one = a chat-edit + redeploy per app; nothing diffs a child's runner against the current AUTOMATION_GUIDE contract | Build (after chain-1 versions) | substrate | approve | Version drift across children | T-100 |

**Chain verdict.** This chain is the audit's biggest surprise: the platform's *newest*
automation substrate is its most operationally mature. A generated app's automations get a
status machine, bounded retries with exponential backoff, dead-lettering, crash detection via
heartbeat timeouts, per-step memoized resume, and a runs UI — none of which the parent's own
trigger engine has — and the child's clock arms itself at deploy while the parent's heartbeat
famously ships OFF. The gaps are the same lifecycle gaps as chain 1 (no testing, no
versioning) plus one unique to this substrate: the parent is blind to its children. The
operator who sells ten clients "an app that watches your suppliers' prices" has ten dashboards
and no fleet view.

### 2.0 Side-by-side: the two substrates, property by property

| Property | Operator spine (trigger engine + standing orders) | Generated-app substrate (automation-runner) |
|---|---|---|
| Where it runs | Platform's Supabase project, 15-min heartbeat 🔌 [R13 §2] | Client's own Supabase project, per-minute self-armed cron [R13 §5.3] |
| Definition lives in | Code registry + DB trigger rows (`automation_triggers`) | DB rows (`automations.kind + config jsonb`) — already data |
| Scheduling | Anchor+offset+window (date math, pure core) / drift-free anchored cadences | `schedule_interval` + `next_run_at`; event-driven runs supported |
| Idempotency | claim-first `trigger_fires` unique index; dedupe on (customer, due date) | `dedupe_key` per (automation, minute); FOR UPDATE SKIP LOCKED claims |
| Retry | claim-release → next tick; stale-claim sweep (10 min) | exponential backoff `30s·2^attempt`, bounded by `max_attempts` |
| Dead-letter | **none** — permanent failures churn until the window expires (§1.1) | `status='dead'` after max attempts, error text recorded |
| Crash recovery | stranded-claim sweep only | heartbeat reaper (3-min timeout) requeues lost workers |
| Long work | per-path time budgets; whole chains re-run on failure | step memoization (`automation_run_steps`) — resume skips finished steps |
| Failure visibility | silent (drain catch swallows; browser runner counts only) | `automation_runs` status machine + runs UI in the generated app |
| Compliance gates | the whole point: approvals, consent, suppression, caps, kill switches | none (tenant's own jobs; service-role auth only) |
| AI metering | credits RPCs on every AI surface | ai-gateway per-app keys at 1.25× margin [R13 §9.12] |
| Fleet view | ONE Queue + Health board across all clients' triggers | **none** — per-app dashboards only |
| Testing / versioning | MISSING (§1.2/§1.4) | MISSING (worse: definitions are generated code) |

The table is the argument for §2.1: each substrate is strong exactly where the other is weak,
and the strengths are pattern-portable without merging runtimes.

### 2.1 The rule: unify or keep two substrates?

**Keep both. Unify the *patterns* and the *monitoring*, never the runtimes.** The reasoning:

- They solve different problems under different trust models. Platform automations are
  **compliance-gated communications** on the operator's approval spine (consent, suppression,
  caps, CAN-SPAM/TCPA — the gates ARE the product). Child automations are **arbitrary tenant
  jobs in the tenant's own infrastructure** (scrapers, digests, syncs) where the client's
  service role is the right authority and the operator's approval queue would be wrong.
  Merging runtimes would either drag every client scraper through the operator's Queue or
  punch the operator's send gates out to code the platform didn't write. Both are worse.
- **But three imports flow from child → parent** (the child design is simply better ops
  engineering): (1) the run ledger with attempts/backoff/**dead-letter** — the exact machinery
  §1.3's repair loop needs; (2) step memoization for the standing-worker's long chains (demo
  builds re-run whole chains on failure today); (3) automations-as-rows with `config jsonb` —
  the child substrate is a working proof of §1.4's templates-as-data shape.
- **One import flows parent → child**: fleet observability. A tiny read-only contract in the
  generated runner (or a parent poll over the Management API) rolling child `automation_runs`
  health into the parent control plane. That single seam is what makes 100 clients' generated
  automations operable, and it's the only place the substrates should touch.

---

## 3. Chain 3 — THE BUILDER, as it feeds automations and client work (summary chain)

Fully inventoried in `01-capability-inventory.md` §18; audited here only as the automation
platform's factory.

| Step | Status | Evidence | Build/Buy | Owner object | Approval posture | Portfolio surface | Breaks at |
|---|---|---|---|---|---|---|---|
| Generation (11-stage client pipeline, tsc gate, agentic repair) | **WORKING [A−]** | [R03 §1, R05 §12.2]; server single-stream fork is legacy | done | Capability | none (drafts) | — | Browser-bound orchestration for the best path [R06 §1] |
| Conversational edit / branches / readiness-gated merge | **WORKING** | review-before-write, green-candidate-only merge [R06 §2–3] | done | Capability | none | — | Holds |
| Autopilot (`job-worker`: checkpointed phases, leases, bounded retries, budget caps) | **WORKING 🔌** | [R13 §4.5, R04 app_0058] — the builder's own repair-ish loop; note the contrast with chain 1 step 8 | done | Mission | none | — | Holds |
| Provision + deploy (site/backend/migrations/console/logs) | **WORKING 🔌** | real approval executors, `deploy_bundles` consumed [R06 §4, R13 §5]; automation tick wired here (§2) | done | Capability | approve (deploys) | `execution_runs` | Holds |
| Rooms (built apps mounted back into worlds) | **WORKING** | sandboxed iframes, app_0099 [R03 §1] | done | Capability | none | — | Holds |
| Builder-as-capability from missions | **PARTIAL** | the orchestrator's `build_app` action is a **handoff** to `/new?idea=…` — "safe" tier, opens the forge, does not build [R05 §4.2:218]; rabbit hole → build brief bridge is real [R06 §13b]; no mission can carry idea → generated → provisioned → deployed unattended | Build: route `build_app` into job-worker autopilot + deploy approvals | Mission | approve (deploy step) | Lens: client apps in flight | T-10 — "every client gets a portal app" cannot be a background arc; the operator hand-drives each build |
| Builder as automation escape hatch | **WORKING 🔌** | any automation the registry can't express becomes a generated app with its own runner (§2) — this is real and load-bearing, not theoretical: prompts.ts calls it "a flagship capability" | done | Capability | approve (deploy) | fleet rollup gap (§2) | T-100 without the fleet seam |

---

## 4. The operator-spine automation fabric beneath both chains (context table)

The substrate the §1 lifecycle stands on — inventoried in [01 §0/§19]; listed here because the
lifecycle gaps must be judged against what already exists to hang them on.

| Fabric element | Honest state | Evidence | What §1's gaps hook into it |
|---|---|---|---|
| Standing orders (6 kinds; drift-free anchored cadences; "a failed fetch is UNREACHABLE, never 'no change'"; orders read and record, never send) | WORKING 🔌 | [R05 §7.2] [R13 §6.3] | The failure watchdog and registry-drift check (§1.3/§1.5) are themselves standing orders — the fabric can watch itself |
| The 8 drain/sweep subsystems (reminders, booking reminders, arc wake, arc advance, bulk send, social, **client automation triggers**, content week) | WORKING 🔌 | [R13 §6.3] | The trigger drain is drain #7 of 8 — repair instrumentation belongs inside the same tick |
| Arc wake loop (structured blockers, atomic claims; a plan blocked on an approval resumes itself when it lands, app_0095) | WORKING | [R03 §2] | Cohort version-migration arcs (§1.4) inherit resumability for free |
| Approval spine (payload SHA-256, CAS claims, `execution_runs` ledger; canary nightly proves the send gate refuses) | WORKING | [R03 §2] [R13 §13.2] | The arming gate (§1.2) is just an approval whose payload is the dry-run plan hash — no new trust machinery |
| Earned autonomy (`autonomy_grants`: content weeks graduated after 3 clean human approvals; 4 recurring classes "eligible"-not-"granted"; cold pitches manual forever; streaks counted from human decisions only) | PARTIAL | [R05 §6] [R03 §2] | Trigger classes joining the streak machinery is the T-100 answer to per-fire approval volume — extension, not invention |
| Heartbeat (12 pg_cron jobs, Vault secrets, dual-header auth; liveness stamps; **never self-arms**) | WORKING 🔌 / PARTIAL (arming) | [R13 §2] [R06 §0] | Every lifecycle improvement is moot on an unarmed clock; the child substrate (§2) proves self-arming at deploy is achievable in this exact stack |
| Orchestrator + 21-action catalog + situation digest | WORKING | [R05 §4] | "Set up automations for client X" as a compiled, resumable plan — the intake mission's front door |

The pattern to hold onto: the lifecycle gaps of §1 are all *additive* to this fabric. Testing
hooks into a pure injectable-clock core that already exists; repair hooks into the Queue, the
one exception surface the operator already watches; versioning hooks into ledgers that already
snapshot every send. Nothing in §1's build list fights the architecture — the architecture was
visibly built waiting for these loops.

---

**Chain 3 verdict.** As a factory, the builder is WORKING and load-bearing for the automation
story: the generated-app path is the platform's only answer today for any automation the
registry can't express, and its deploy rail is genuinely approval-spined end to end. The one
PARTIAL that matters to automations is intent-level: a mission cannot yet *commission* a build
— `build_app` opens the forge for a human instead of driving `job-worker` + the deploy
approvals, so "every automation client also gets a status portal" is an operator-driven
ceremony rather than a background arc. The pieces (autopilot, deploy executors, arc wake) all
exist; the wiring between them is the gap — a chain-3 echo of the charter's
built-but-not-connected disease.

---

## 5. Proposed Workshop: THE AUTOMATION WORKSHOP (charter 14-field spec)

- **Job**: take an automation from detected opportunity to armed, monitored, versioned
  operation for one client — and the same automation across many clients — without the
  operator ever discovering its behavior in production.
- **Knowledge required**: the capability registry with honest maturity + compliance notes
  (consent bases, TCPA/CAN-SPAM/HIPAA-aware copy — encoded today, registry.ts); window/anchor
  scheduling semantics (encoded, triggers.ts); per-vertical anchor conventions (180-day
  recall, seasonal service); failure taxonomy (to be encoded, §1.3).
- **Source data required**: client customer lists + anchor dates + consent state
  (`customers`/`customer_lists`), `trigger_fires` + `execution_runs` + `outreach_events`
  ledgers, `client_subscriptions` (attribution, numbers), sender/DNS + Twilio connection
  state, `system_heartbeat`, prospect audit signals (for the detection bench).
- **Direct-manipulation surface**: three benches. (1) **Config bench** — registry picker +
  triggerDefault editor per client (exists as pages today); (2) **TEST BENCH — the missing
  instrument panel**: a simulated clock the operator can scrub ("advance 90 days"), fixture
  and real-list dry runs rendering the exact would-send plan, per-fire gate verdicts
  (consent/suppression/window shown as pass/fail lamps), sandbox-send-to-me; (3) **Fleet
  bench**: per-client version pins, error states, pause/rollback, the monthly report.
- **AI's role**: none in execution (deliberate — deterministic templates, "no AI invention at
  11pm" is the house rule for unattended sends); drafting template *variants* for the library
  and narrating ledger stats. AI never schedules, never gates, never sends.
- **Tools**: `detect`, registry CRUD (post templates-as-data), `dueFires` simulation,
  dry-run/plan-diff, arm/pause/error-state control, version pin + cohort migrate, `reportCore`.
- **External integrations**: Resend, Twilio (+ A2P 10DLC ceremony), the heartbeat — all
  existing. Nothing new: this workshop is instruments over existing rails.
- **Evaluation/critique criteria**: golden-plan assertions per capability fixture; dry-run
  required above list-size threshold (the §1.2 arming gate); placeholder gate ([EDIT] holes
  block arming, exists at send time already); compliance lamp per channel; failure-rate
  threshold auto-pause.
- **Output Artifacts**: the armed trigger (versioned definition + per-client pin), the dry-run
  plan (stored, hash-bound to the arming approval), the monthly automation report.
- **Missions it creates**: "Roll recall v3 to all dental clients" (cohort migration arc);
  "Diagnose client X's failing missed-call automation."
- **Standing Orders it establishes**: the trigger drain (exists 🔌); the failure watchdog
  (§1.3, itself a standing order); a weekly registry-drift check (§1.5's lesson: does every
  `not_built`/`beta` claim still match shipped reality).
- **Outcome signals it learns from**: fires → approvals → sends → opens/replies/bookings per
  version (the A/B substrate versioning creates); failure taxonomy frequencies; per-client ROI
  stats (exist) feeding pricing.
- **Expert controls**: kill switches per channel (exist), per-client caps (exist), version
  pin/rollback, error-state override, consent-basis inspector, fire-budget tuning.
- **Fast-path (AI-assisted)**: "set up recall reminders for Lakeside Dental" → registry match
  → list mapped → dry-run auto-executed → one approval card holding config + plan + first
  month's simulated fires.
- **Verdict**: **DEEP-ENVIRONMENT** — but narrowly. The nine-bench grammar carries config and
  fleet views fine; what it cannot supply is the **test-run instrument panel**: a scrubbing
  simulated clock, plan-diff surfaces, and gate-verdict lamps are a specialized bench the
  charter itself anticipates ("do NOT force… automation-flow… into one canvas"). Ruling on
  flow design: a visual flow *designer* is NOT part of this verdict today — the shipped
  automation class is single-step by design, and multi-step work routes to the builder
  (chain 2). Build the flow canvas only when drip flows (level-10 #4) are green-lit; build the
  test bench NOW — it is the workshop's reason to exist.

---

## 6. The fifteen questions

| # | Question | Answer for this domain |
|---|---|---|
| 1 | Exists-working | Detection (pure, deterministic) + intake; registry with honest maturity; trigger engine email path (dual runner, claim-first, window guard, consent parity) 🔌; per-client config + attribution + ROI 🔌; missed-call + booking config-as-automation 🔌; monitoring ledgers + quiet-honest monthly report; standing orders + drains + arc wake 🔌; the ENTIRE generated-app substrate (schema, runner contract, auto-wired per-minute child cron, backoff/dead-letter, ai-gateway billing) 🔌; builder gen/edit/branch/deploy rail 🔌 |
| 2 | Partial/scaffold | Failure handling (retries everywhere, repair nowhere); monitoring of failures (success ledgers only — drain catch is silent); earned autonomy (eligible-not-granted; triggers not a class); builder-from-missions (`build_app` = handoff, not a build); child observability (per-app UIs, no fleet rollup); heartbeat self-arm (CI step defaults off) |
| 3 | Docs/prompts/prototypes only | Heartbeat-trace UX (morning-brief prototype); drip flows / multi-step sequences (level-10 #4); `vertical_specs` templates-as-data (planned, zero code); cohort/canary rollout concepts (charter-era only) |
| 4 | Missing | TESTING (dry-run, simulation, fixtures, sandbox sends, arming gate — seed SQL is the whole harness); REPAIR loop (failure ledger, auto-pause, classification, repair proposals); VERSIONING (definition/instance split, per-client pins, migration path, fire version stamps); templates-as-data; fleet rollup of child automations; visual flow design (ruled: not yet needed) |
| 5 | Build internal | Everything in #4 — no external service is the answer to any of it; the enum migration; registry drift fixes (§1.5); `build_app` → autopilot wiring; failure ledger before all else |
| 6 | External API | Nothing new required for the platform itself (Resend/Twilio/Supabase Management already live); n8n/Inngest-class engines were implicitly evaluated and answered by building the child substrate in-house [prompts.ts:409] |
| 7 | Reusable Capability | Detection, dry-run/simulation engine (pure core exists), failure watchdog, version-pin machinery — all channel- and vertical-agnostic |
| 8 | Domain Workshop | THE AUTOMATION WORKSHOP (§5) — DEEP-ENVIRONMENT for the test bench; config/fleet benches fit the grammar |
| 9 | Mission | Cohort version migrations; automation diagnosis/repair arcs; client automation onboarding (list import → consent audit → dry-run → arm) |
| 10 | Standing Order | The trigger drain (exists 🔌); failure watchdog (build); registry-drift check (build); child-fleet health poll (build) |
| 11 | Requires approval | Every fire's send (today, per-fire); arming above list-size threshold (proposed, with dry-run hash); version migrations per cohort; every child deploy (exists) |
| 12 | Safe autonomous | Auto-PAUSE of failing automations (pausing is always safe); dry-runs and simulations (read-only); the drain itself once a trigger class earns autonomy (extend the existing streak machinery [R05 §6]); child crons in tenant infra (already auto) |
| 13 | Portfolio-level | Version histogram per capability across clients; exception-only failure surface; per-client automation report roll-up; child-app dead-letter lens; detected-unsold opportunity lens |
| 14 | Breaks at 10/100/1k | T-ME: SMS enum (live defect), silent failures, no dry-run before arming. T-10: no multi-step class, registry updates = code deploys, per-app child dashboards, one-client-at-a-time template edits. T-100: versioning/cohort rollout/canary (ARCH-CHANGE), per-fire approvals without trigger-class autonomy, fleet rollup. T-1K: all of it is control-plane (doc 10); nothing normal ever seen |
| 15 | Mastery needs | Scheduling semantics (encoded + verified); channel compliance (encoded as data, needs an update loop); failure taxonomy (not yet encoded — §1.3 is its birth); version/rollout discipline (absent); feedback: fires → outcomes per version, the loop that makes the library learn (absent — outcome ledgers exist, the version key to join them on does not) |

---

## Matrix rows

| Capability | Class | Evidence | Needed-at | Owner object | Note |
|---|---|---|---|---|---|
| Automation opportunity detection | WORKING | [R05 §9.23] [R13 §7.14] | T-ME | Capability | pure, no model call; gaps = roadmap signal |
| Automation registry (honest maturity) | WORKING | [R05 §9.23] | T-ME | substrate | drift found: online_booking `not_built` vs shipped app_0109 |
| Registry update loop (drift check) | MISSING | grep registry.ts:139 vs [R03 §8] | T-10 | Standing Order | §1.5; code-only library goes stale |
| Visual flow design | MISSING | [R05 §9.23; single-step class only] | T-10 | Workshop | ruled not-yet-needed; builder is the pressure valve |
| Automation test harness (dry-run/sim/fixtures/sandbox) | MISSING | docs/automation-triggers-seed.sql is the whole harness | T-10 | Workshop bench | pure injectable-clock core makes it cheap (§1.2) |
| Arming gate (dry-run-before-active) | MISSING | [no evidence anywhere] | T-10 | substrate | approval payload = plan hash |
| Trigger engine — email execution | WORKING 🔌 | [R03 §8] [R13 §6.3] | T-ME | Standing Order | dual runner, one pure core, claim-first |
| Trigger engine — SMS execution | DISCONNECTED | [R10 #10]; standing-worker/index.ts:604–616 | T-ME | Capability | enum; burns fire budget + starves email fires (§1.1) |
| Per-client automation config + attribution + ROI | WORKING 🔌 | [R03 §8, app_0108] | T-ME | Capability | |
| Trigger-class earned autonomy | MISSING | [R05 §6: triggers not a class] | T-100 | substrate | per-fire approvals can't scale |
| Automation failure ledger + auto-pause (repair loop) | MISSING | standing-worker catch is silent (:614–617) | T-ME | substrate + Standing Order | §1.1 is the live proof it's needed now |
| Automation versioning (definition/instance + pins) | MISSING + ARCH-CHANGE | [R04 app_0076: no version columns] | T-100 | substrate | crack already visible at T-10 (§1.4) |
| Cohort rollout / migration path | MISSING + ARCH-CHANGE | [R03 §8: per-client rows only] | T-100 | Mission | canary-per-cohort at T-100 |
| Templates-as-data library | MISSING + ARCH-CHANGE | grep: vertical_specs zero code hits [R03 §9] | T-100 | substrate | same schema as versioning; child substrate proves the shape |
| Automation monitoring (fires/runs/report) | WORKING | [R04 §3.7] [R05 §9.23] | T-ME | ledger | success-side only |
| Heartbeat trace UX | PROTOTYPE-ONLY | prototypes/morning-brief.html:677 | T-10 | Workshop bench | Health board is the WORKING floor |
| Generated-app automation substrate | WORKING 🔌 | [R13 §5.3, §13.8]; deploy-backend:173–228; prompts.ts:404 | T-ME | Capability | backoff/dead-letter/step-memo — better ops than parent |
| Child self-arming cron | WORKING 🔌 | deploy-backend:203 | T-ME | Capability | ironic: children self-arm, the parent doesn't [R06 §0] |
| Child fleet automation rollup | MISSING + ARCH-CHANGE | [no parent read over child runs] | T-100 | substrate | the ONE seam the substrates should share (§2.1) |
| Substrate unification | — ruled KEEP-BOTH | §2.1 | — | — | unify patterns + monitoring, never runtimes |
| Standing orders + drains + arc wake | WORKING 🔌 | [R13 §6.3] [R05 §7] | T-ME | substrate | |
| Step memoization for standing-worker chains | MISSING | child has it (prompts.ts:486); parent re-runs chains | T-100 | substrate | import from child pattern |
| Booking + missed-call config-as-automation | WORKING 🔌 | [R13 §7.11–7.12] | T-ME | Capability | booking absent from deploy lists [R13 §13.4] |
| Builder gen/edit/branch/deploy rail | WORKING 🔌 | [R03 §1] [R13 §5] | T-ME | Capability | the automation factory |
| Builder-as-capability from missions | PARTIAL | [R05 §4.2: build_app = handoff] | T-10 | Mission | wire into job-worker autopilot |
| Heartbeat self-arm | PARTIAL | [R06 §0: CI step defaults off] | T-ME | substrate | everything 🔌 above hangs on it |
