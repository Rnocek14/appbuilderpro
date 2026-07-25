# 10 — The Multi-Client Control Plane: What Operating 100–1,000 Clients Requires

*Phase 5.5 capability audit, per `_charter.md`. Assignment: [R13] (system-control, garvis-canary,
garvis-scorecard, ads-watch) and [R04] (execution_runs, autonomy_grants, system_heartbeat,
standing_orders) as substrate; nearly all fleet-level expected MISSING/ARCH-CHANGE — this
document verifies that expectation row by row and then defines the minimal system that closes
it. The scale arithmetic of `docs/reality-check/10-scale-and-time-attack.md` is treated as
INPUT: its decision-throughput numbers are the load the control plane must carry.
`docs/experience-architecture/08-multi-world-management.md` (lenses, the drop, batch-adopt) is
cited as DOCUMENTED-ONLY design intent, never as existing capability. Sibling evidence backbone:
`01-capability-inventory.md`.*

---

## 0. The honest headline

The system already has a control plane — **for one operator's own machinery, not for a fleet of
client operations.** What exists is an operator cockpit, and it is genuinely good:

| Existing surface | What it answers | Evidence |
|---|---|---|
| `system-control` + Master Switch | "Is the brain on?" — secret presence booleans, `garvis_cron_status()`, latest heartbeat stamps; arm/disarm | [R13 §6.9] [R03 §2] |
| Health board (`/garvis/health`) | probes every function, secret presence, cron schedule, heartbeat stamps | [R03 §2] |
| `garvis-canary` (nightly) | live wiring self-test incl. the negative test that the send gate REFUSES a fabricated approval; heartbeat staleness >26h | [R13 §6.7] |
| `garvis-scorecard` (weekly) | week-vs-week leading indicators, arrows on real arithmetic only; per-business breakdown when ≥2 worlds had activity | [R13 §6.5] |
| `ads-watch` (daily) | yesterday vs 7-day baseline anomaly judgment, MIN-sample gated, dedupe within 3 days, ≤5 alerts, detection-only | [R13 §9.11] |
| `garvis-pulse` (morning) | "a quiet night sends NOTHING" — leads/replies/approvals/reminders/stalled arcs | [R13 §6.4] |
| `execution_runs` | THE one immutable connector ledger (send/skip/fail, sanitized request/response) | [R04 §3.10] |
| `system_heartbeat` | job → last_tick_at liveness ("has the clock ever ticked") | [R04 §3.7] |
| `trigger_fires` | once-per-(trigger, customer, due-date) idempotency ledger | [R04 §3.7] |
| `autonomy_grants` | per action-class trust dial, daily-capped, fail-closed | [R04 app_0097] |

Three structural facts make this an operator cockpit and not a fleet control plane:

1. **The substrate is single-operator throughout** [R03 §2: "single-operator platform: any
   authed user is the operator" in system-control's trigger; 01 §21]. Every observability row is
   keyed `owner_id`; the "fleet" dimension — the client world — is attributed only where a
   later migration bolted it on.
2. **Liveness is per-JOB, not per-world.** `system_heartbeat(job, last_tick_at)` holds ~12 rows,
   one per pg_cron job globally [R04 app_0060, R13 §2]. It proves the clock ticks; it cannot say
   "client #37's automations ran clean last night."
3. **The ledger has no world column.** `execution_runs` carries `owner_id, connector, action,
   status` but no `world_id` (verified: `supabase/migrations/app_0022_execution.sql:57–69`);
   `approvals.world_id` was added only in app_0083, nullable, "old rows honestly null" [R04].
   Per-client health/cost rollups over the ledger require a schema change, not a query.

And the load it must carry, from the arithmetic attack [reality-check 10, treated as input]:
~30–35 gated decisions/day at 10 clients; ~85/day pre-autonomy at 50; a **floor of 90–120
decisions/day at 500 worlds with autonomy already maximal**, plus 15–25 true-but-minor
maintenance items/day; the approval ladder's capacity crosses failure at **N ≈ 150–250**
without structural change [A1, A10]. Conclusion the whole document serves: at T-100 and beyond
the control plane is not a dashboard — it is the machinery that makes **not looking** safe.
Every subsystem below exists to move an operation from "seen" to "invisible-but-audited."

---

## 1. The eleven fleet questions

Each row: what exists today at per-world/operator level (cited), the FLEET-level class per the
charter rubric, and where §2 defines the minimal design.

| # | Fleet question | What exists today (per-world / operator level) | Fleet-level class | Minimal design |
|---|---|---|---|---|
| 1 | **Which automations failed overnight?** | `execution_runs.status='failed'` per owner [R04 §3.10]; standing-worker writes per-order `last_result` [R13 §6.3]; Health board probes functions [R03 §2]; canary proves wiring nightly [R13 §6.7] | **MISSING + ARCH-CHANGE** — no world_id on the ledger, heartbeat is job-scoped; "which CLIENT is broken" is unanswerable in one query | §2.1 fleet health model |
| 2 | **Which credentials expire this week?** | `provider_connections.expires_at` stored (app_0014:18) but zero-policy vault, read by nothing on a schedule; `connections` fn has a manual `test` action [R13 §3]; `client_connections.status/'error'/last_checked_at` refresh-derived on operator visit [R04 app_0110]; `sender_domains.verification` status [R04 app_0111]; system-control secret presence (operator-level only) [R13 §6.9] | **MISSING** (registry substrate exists; monitoring absent — expiry is discovered as an execution failure) | §2.2 credential registry + probes |
| 3 | **Which clients show cost anomalies?** | Credits meter every AI surface per OWNER [R13 §10.2]; ai-gateway meters per generated-app key [R13 §9.12]; admin per-user cost charts [R03 §10]; ads-watch is the proven anomaly TEMPLATE (baseline, MIN-sample, dedupe) [R13 §9.11] | **PARTIAL + ARCH-CHANGE** — `usage_events` has `user_id`/`project_id`, no world/client column (schema.sql:168–179); attribution precedes detection | §2.3 per-client cost attribution |
| 4 | **Which campaigns perform unusually?** | Engagement rows exist per send/post/site (`outreach_events`, `social_post_metrics`, `site_events`) [R04 §3.4]; scorecard compares week-vs-week per owner, splits per business when ≥2 worlds active [R13 §6.5]; ads-watch judges ad spend only | **PARTIAL** — the rows exist world-attributed; no per-client baseline or deviation judgment outside ads | §2.1/§2.3 (shared baseline core) |
| 5 | **Which outputs fell outside policy?** | Hard-coded gates re-checked at send time: kill switch, caps, warmup, suppression fail-closed, TCPA, CAN-SPAM, placeholder 422, payload hash, per-brand identity fail-closed [R13 §7.1–7.2]; listing honesty, AI-media provenance, `checkDraft`, `bespokeHonest` [R05 §9.4–9.5]; refusals land as `execution_runs` skips [R04 app_0031] | **MISSING** (gates are owner-global constants in code; no declarative per-client/cohort policy, no violation rollup) | §2.4 policy engine |
| 6 | **Which worlds lack required capabilities?** | `client_connections` — typed per-client connector checklist, `'needed'`→`'connected'`, one row per (client, connector) [R04 app_0110]; automation registry with honest maturity — `not_built` "never proposed, surfaces as a gap" [R05 §9.23]; go-live secret tiers [R03 §10] | **PARTIAL** — per-client rows exist; the *required set* is not derived from anything (no package/tier definition), refresh is manual-on-visit | §2.2 + §2.5 (required-set from package pins) |
| 7 | **Which automation version does each client run?** | Nothing. `automation_triggers` are copied config rows per client list (capability_id, anchor, offsets, templates — no version column; verified app_0076); packs are code registries [R05 §9.23] | **MISSING + ARCH-CHANGE** (confirmed charter expectation; 01 §19) | §2.5 package/version registry |
| 8 | **Can I roll a change out to a cohort safely?** | Nothing in code. Batch-adopt / adopt-proposals with per-world gates are fully designed in the experience corpus [exp-arch 08 §6.2, 09 §10.2] | **DOCUMENTED-ONLY + ARCH-CHANGE** | §2.5 pin → cohort → bake → promote → rollback |
| 9 | **Can I test on a small group before wide deploy?** | The *patterns* exist: garvis-canary (nightly negative-test), content weeks (judge fail-closed → 3 clean human approvals → auto_mode, revocable) [R13 §6.3, R03 §6]; CI verify harness gates deploys [R03 §10] | **MISSING** at fleet level (no canary COHORT of clients for an automation version) | §2.5 bake stage |
| 10 | **Which clients need my judgment today?** | The Queue (one world-stamped list) + Pulse + NextMove per owner [R03 §2, R05 §9.12]; the **slate** (approve-the-day batch decision + outlier surfacing) exists only in `prototypes/morning-brief.html` and reality-check 13 D3 | **PROTOTYPE-ONLY** | §2.6 exception-based attention |
| 11 | **Which normal operations stay invisible — safely?** | The ethos is shipped: pulse/canary/scorecard are silent when green [R13 §6.4–6.7]; `execution_runs` records everything for later audit | **MISSING** (the machinery of safe invisibility — severity classes, maintenance batching, rotation floor, sampled audits — exists nowhere; reality-check A5/A10/A14 show why ethos alone inverts at scale) | §2.6 |

**Census of the eleven:** 0 WORKING at fleet level · 3 PARTIAL · 1 PROTOTYPE-ONLY ·
1 DOCUMENTED-ONLY · 6 MISSING (of which 3 +ARCH-CHANGE). The charter's expectation is
confirmed, with one nuance: almost every fleet subsystem has a *proven per-world template* to
generalize (ads-watch for anomalies, canary for probes, content-week bake for cohort trust,
scorecard's per-business split for rollups). The control plane is mostly a **promotion of
existing patterns from owner-scope to fleet-scope over a world-attributed substrate** — plus
two genuinely new objects (the version registry, the policy table).

---

## 2. The minimal control plane — six subsystems

Design constraints inherited from the substrate, binding on every subsystem: detection-only
separated from action (ads-watch precedent); everything outward through the existing approval
spine; quiet-when-green; every rollup drills to rows [exp-arch 08 §2.2, DOCUMENTED-ONLY but
adopted here as the design bar]; fail-closed on missing data (a missing report is never zero
[R13 §9.11]).

### 2.0 The complete object inventory — everything the control plane adds

For the aggregator and the roadmap: the minimal control plane is **2 column additions, 5 new
tables, 6 new standing jobs, 1 new approval kind, and 0 new external services.** Everything
else is generalization of shipped code.

| New object | Kind | Subsystem | Precedent it generalizes |
|---|---|---|---|
| `execution_runs.world_id` + `client_subscription_id`; same on `usage_events` | columns | §2.1/§2.3 | `approvals.world_id` (app_0083, nullable, old rows honestly null) |
| `world_health` (world × day rollup, derived state incl. `dark`) | table | §2.1 | scorecard's per-business split [R13 §6.5] |
| `policies` (scope × gate-seam × predicate × enforce/monitor) | table | §2.4 | `outreach_settings` gates + `autonomy_grants` caps, made declarative |
| `automation_packages` (capability × semver × templates × status) | table | §2.5 | automation registry [R05 §9.23] + vertical-as-data intent [R03 §9] |
| `package_pins` (client × package × version × overrides) | table | §2.5 | `automation_triggers.client_subscription_id` (app_0108) |
| `exceptions` (severity × world × source × state) | table | §2.6 | `mind_events` capture + Queue badges, tiered |
| fleet-tick · credential-watch · cost-sweep · performance-sweep · policy-monitor · audit-sampler/rotation | pg_cron jobs | §2.1–2.6 | the 12-job heartbeat + `garvis_arm_heartbeat()` [R13 §2] |
| `approval_kind` + `'approve_slate'` (hash-bound member manifest) | enum value + executor path | §2.6 | `content_week` one-approval-many-pieces (app_0088_content_week) — and the enum-extension bug class is known: the SMS rail died on exactly a missing enum value [01 §DISCONNECTED #1], so the kind ships WITH its executor in one migration |

Everything in this inventory is additive and idempotent per the house migration rule
[R04 §1]; nothing amputates the operator cockpit — it becomes the fleet plane's single-world
drill-down.

### 2.1 Fleet health model — rollups over execution_runs / trigger_fires / heartbeat, per world

**Exists:** the three ledgers (`execution_runs`, `trigger_fires`, `system_heartbeat`) plus
`standing_orders.last_run/next_run` and per-order `last_result` [R04 §3.7, R13 §6.3]. The
scorecard already computes per-business splits from world-attributed rows [R13 §6.5] — proof
the rollup pattern works where attribution exists.

**Gap (ARCH-CHANGE):** `execution_runs` and `usage_events` lack `world_id` /
`client_subscription_id`; `system_heartbeat` is job-grained. "Fleet health" today would be a
join through nullable `approvals.world_id` covering only approval-gated runs.

**Minimal design:**
- **Attribution first** (one migration, additive per house rule): `world_id uuid` +
  `client_subscription_id uuid` on `execution_runs` and `usage_events`, stamped by executors
  that already know their world (send-email resolves `world_sender_identities`; social-publish
  resolves `world_social_profiles`; the trigger runner knows `client_subscription_id` via
  app_0108). Old rows stay null — the app_0083 honesty precedent.
- **`world_health` rollup** — one row per world per day, computed by a fleet-tick cron (a new
  standing job on the existing heartbeat): runs by status (from execution_runs), fires due vs
  fired vs skipped (from trigger_fires + automation_triggers windows), last outbound success
  per channel, credential state (§2.2), spend (§2.3), and a derived
  `state ∈ {green, quiet-ok, degraded, broken, dark}` — `dark` meaning "this world's
  automations produced zero rows in a period where its config says rows were due," the exact
  silent-death case job-level heartbeat cannot see.
- **Deviation judgment** reuses `adsWatchCore`'s verified shape (yesterday vs 7-day baseline,
  MIN-sample gate, never judge today, anomaly dedupe) [R13 §9.11 §10.20] generalized to
  per-world send/reply/lead/fire rates — answering fleet question 4 with the same core as 3.
- Failures do not notify per-item; they file **exceptions** into §2.6 with severity.

### 2.2 Credential registry with expiry probes

**Exists:** three disjoint credential systems, all operator-scoped [R07 §3, 01 §22]:
`provider_connections` (OAuth tokens, `expires_at` present, zero-policy vault), edge-secret
presence (system-control's authoritative map [R13 §12]), and `client_connections` (typed
per-client checklist with `status/'error'/last_checked_at`, derived by refresh **when the
operator opens the screen** [R04 app_0110]). Monitoring: **MISSING** — nothing sweeps
`expires_at`; a dead token is discovered when an execution fails, or never.

**Minimal design:** one `credential-watch` standing job (the connections `test` action already
implements per-provider probes — this is scheduling existing code, not writing probes):
- sweep `provider_connections.expires_at` with T-14/T-3 foresight → exceptions, not emails;
- probe-refresh every `client_connections` row on a rotating schedule (bounded per tick, the
  batch-drain pattern [R13 §10.11]), stamping `last_checked_at` honestly;
- verify `sender_domains` DNS status on the same rotation (deliverability is a credential);
- the registry view answers question 2 as a lens row-kind: connector × client × state × expiry.
Class today: **MISSING** (substrate PARTIAL). No new architecture — this is the DISCONNECTED
disease's inverse: everything built, nothing scheduled.

### 2.3 Per-client cost attribution

**Exists:** the credits spine meters every AI action per owner (`spend_credits` →
`usage_events`) [R04 app_0017, R13 §10.2]; ai-gateway meters per generated-app key at 1.25×
[R13 §9.12]; `ad_spends` (manual) and `ad_metrics` (synced) carry real ad cost [R04 §3.4];
revenue per client exists (`client_subscriptions.price_cents`, `invoices` with provenance)
[R04 §3.6]. **PARTIAL:** the cost side cannot be grouped by client — `usage_events` has no
world/client column (verified schema.sql:168–179), so "what does serving client #37 cost me"
is unanswerable while "what does client #37 pay me" is one query.

**Minimal design:** the §2.1 attribution columns close the seam (every metered call site
already receives a world-scoped context; the trigger runner and standing-worker know their
client). Then:
- **per-client margin line** = subscriptions + invoices − (AI usage + ad spend + per-client
  connector costs), a Money-lens roll-up that drills to `usage_events`/`execution_runs` rows;
- **cost anomaly watch** = adsWatchCore over daily per-client cost series (same gates:
  baseline, MIN-sample, dedupe, cap on alerts/day) — a runaway automation loop burning credits
  against one client surfaces as an exception the same morning, not on the monthly bill;
- fleet caps: `autonomy_grants.daily_cap` exists per action-class [R04 app_0097]; add a
  per-client daily spend ceiling checked by the same fail-closed `autonomyGate` seam.

### 2.4 Policy engine — what is enforceable from existing gates

**Exists (and this is the load-bearing asset):** every outbound path funnels through six
executors that **re-check every gate server-side at execution time** [R13 §3 conventions,
§7.1] — kill switch, daily caps, warmup, suppression (fail-closed on lookup error), TCPA,
CAN-SPAM footer, placeholder 422, payload-hash tamper check, per-brand identity fail-closed,
plus content gates (`checkDraft`, `bespokeHonest`, listing honesty, provenance stamps)
[R05 §9.4–9.5]. Refusals already leave ledger rows. So the *enforcement points* exist and are
structurally unbypassable ("sending outside an approval is impossible" [R13 §7.1]).

**Gap:** every gate is either an owner-global constant (`outreach_settings` is one row per
owner [R04 §3.4]) or hard-coded. There is no per-client, per-cohort, or fleet-wide
*declarative* policy: "healthcare clients never get AI imagery," "no client exceeds 50
sends/day," "quiet hours 9pm–8am client-local," "this cohort's SMS stays off." Class:
**MISSING** — but **not** ARCH-CHANGE for the platform's own rails, because the gate seams
already centralize; it IS +ARCH-CHANGE for generated-app children (each client's deployed app
runs its own `automation-runner` on its own project [R13 §5.3], outside every platform gate —
fleet policy must either proxy those sends through the platform rails or accept a documented
enforcement boundary).

**Minimal design:** a `policies` table — scope (`fleet` | cohort tag | world), gate seam it
binds to (send_email / send_sms / publish_post / spend / imagery / autonomy), predicate as
constrained jsonb (thresholds and enums, never free code — the lens field-catalog discipline
[exp-arch 08 §2.3]), and mode (`enforce` | `monitor`). Evaluated inside the existing gate
re-check, most-specific-scope wins, absence = current behavior. Violations in `enforce` refuse
exactly like today's gates (422 + skip row); in `monitor` they file exceptions — which is how a
new policy is baked before it can break a fleet. Question 5's answer becomes a query over skip
rows tagged with the policy id.

### 2.5 Package/version registry + cohort rollout with canary

**Exists:** the automation capability registry with honest maturity [R05 §9.23]; per-client
trigger config + attribution (app_0108); the content-week bake loop (judged fail-closed → 3
clean approvals → auto_mode, revocable — the one earned-autonomy proof in production)
[R03 §6]; nightly canary as the probe pattern. Versioning: **nothing** — no version column in
`automation_triggers` (verified app_0076), templates are copied at install and drift silently
thereafter; adopt-proposals are DOCUMENTED-ONLY [exp-arch 08 §6.2, 09 §10.2]. Class:
**MISSING + ARCH-CHANGE** (a new spine object, and existing config rows must become instances
of it).

**Minimal design** — two tables and one lifecycle:
- `automation_packages` (owner, capability_id, semver, template payloads + trigger params,
  changelog line, status draft|canary|stable|retired) — the sector pack becomes data with a
  version, extending "a studio is data, not code" / vertical-as-data [R03 §9].
- `package_pins` (client_subscription_id, package_id, version, mode auto-track|pinned,
  local_overrides jsonb) — question 7 becomes `select version group by client`. Installed
  trigger rows carry `package_version` so `trigger_fires` and `execution_runs` inherit it —
  every fire is attributable to the exact version that produced it.
- **The lifecycle: pin → cohort → bake → promote → rollback.**
  1. **Pin.** Publishing v(n+1) changes nothing; every client stays pinned to v(n). No silent
     mutation — the constitution's gate rule, kept.
  2. **Cohort.** Select a canary cohort (3–5 clients: low-risk, operator-chosen, mixed
     verticals). Staging to the cohort is a batch of per-client adoption approvals — the
     DOCUMENTED-ONLY batch-adopt mechanic [exp-arch 08 §6.2] becomes this concrete surface.
  3. **Bake.** The version runs for the cohort N days / M fires. Bake verdicts are computed
     from rows the fleet model already collects: fire success rate vs the version-(n) baseline,
     policy violations, engagement deltas, cost per fire — the content-week judge generalized.
     A bake with insufficient sample says so and extends (never "passed by silence").
  4. **Promote.** One standing answer per rollout ("adopt everywhere without a conflicting
     local override; stage only conflicts") — reality-check fix #4 adopted as the default, so
     promotion costs conflicts-only attention. Remaining pins advance through per-client
     approvals only where `local_overrides` collide.
  5. **Rollback.** Re-point pins to v(n) — config-only by construction (trigger idempotency
     keys are (trigger, customer, due-date) [R04 app_0076], so a rollback never re-fires what
     v(n+1) already sent). A version with a failed bake is marked and cannot be promoted.
- The registry's variance line ("38 identical · 9 variants · 3 clients ≥2 versions behind")
  gives fragmentation a number [reality-check fix #4] — answering question 8's aggregate half.

### 2.6 Exception-based attention — the slate, and its data requirements

**Exists:** PROTOTYPE-ONLY. The slate — "today's 23 follow-ups — approve slate / open
outliers," trust pooling at the class level, streaks counting slates not items — is designed in
reality-check 13 D3 and rendered in `prototypes/morning-brief.html` (the slate is that
prototype's central interaction). In code: the Queue is one world-stamped list [R03 §2], the
Pulse is quiet-when-green [R13 §6.4], and `content_week` proves "one approval covering many
pieces, hash-bound" is already expressible in the spine [R04 app_0088_content_week].

**Data requirements (what the prototype needs underneath it, none of which exists):**
1. **Severity classes on exceptions** — counterparty-facing failure › money leaving › broken
   routine › maintenance › informational. The uncompressible rule [exp-arch 06 §4.7,
   DOCUMENTED-ONLY] becomes: the top two tiers always render individually; maintenance tiers
   collapse into one daily batch item [reality-check fix #2].
2. **A slate approval kind** — one `approvals` row whose payload is a hash-bound manifest of
   member items (the content-week precedent generalized), member-level opt-out at review,
   per-member execution through the unchanged send paths.
3. **Outlier detection** — a slate is only safe if outliers are pulled out before approval;
   that requires the per-(class × world) baselines of §2.1. **The slate depends on the fleet
   health model; shipping it first would batch blindly.**
4. **Dwell-weighted streaks + sampled audits** — approvals faster than a class-calibrated read
   time count fractionally; ~1-in-30 auto-ran items resurface as expanded spot-reviews feeding
   the dial [reality-check fix #3]. This is what makes question 11's "invisible" auditable
   rather than merely unread — the difference between earned trust and fatigue.
5. **A rotation floor** — every non-dormant world earns one brief sentence at least every M
   days ("clean, unvisited 60 days — 214 auto-ran actions unreviewed") [reality-check fix #5],
   closing A5's silent-rot blindness.
Question 10's daily answer = exceptions tiered ≥ broken, plus judgment items the rollout and
policy subsystems stage (bake verdicts, policy conflicts, renewal missions).

---

## 3. Staging: what each tier makes mandatory

Per the charter's scale gates. Each tier lists what becomes MANDATORY there (building earlier
is optional; later is too late — the arithmetic [A1] dates the deadlines).

**T-10 — ten active clients.** The operator can still hold the fleet in their head; the control
plane's job is to stop depending on that.
- World/client attribution columns on `execution_runs` + `usage_events` (§2.1) — cheapest now,
  archaeology later; every later subsystem reads them.
- Fleet health board v0: a page grouping the three ledgers by client — the Health-board pattern
  [R03 §2] pointed at clients instead of functions. Even a table answers questions 1 and 4 at
  n=10.
- Credential-watch cron (§2.2) — at 10 clients × ~9 connectors, "discovered at send failure" is
  already a client-facing incident per month.
- Slate v1 (manifest approval kind + severity tiers, manual outlier review) — ~30–35
  decisions/day [A1] is where walking items stops scaling.
- Per-client margin line (§2.3 rollup over the new columns).
- Package rows WITHOUT rollout machinery: install-from-package with a recorded version, so
  T-100's registry inherits history instead of reconstructing it ("which version" starts being
  answerable now, cheaply).

**T-100 — one hundred clients.** The charter names this tier's contract: cohort rollouts,
versioning, policy engine, exception-only attention.
- Full §2.5 lifecycle (pin → cohort → bake → promote → rollback) — at ~600–900 adoption
  decisions/year [A8], unversioned per-client edits are unadministrable.
- Policy engine in enforce mode for the platform rails; monitor mode as the bake path (§2.4).
- Exception-only attention complete: automated outlier detection over §2.1 baselines,
  maintenance batching, dwell-weighting + sampled audits (§2.6) — the ladder fails at
  N ≈ 150–250 [A1]; this tier crosses it mid-growth.
- Cohort-evidence provisional autonomy: a new client on a package whose classes ran clean
  ×2,300 across siblings receives autonomy *offers* citing that evidence — accepted per world,
  revocable per row [reality-check fix #1] — dissolving the ~50–70-approval apprenticeship tax
  per new client [A2]. Requires `autonomy_grants` to gain world/package scope (today it is
  per-owner per-class only — verified app_0097).
- Payment reconciliation stops being deliberate-manual [R06 §15 via 01 §6]: 100 clients' MRR
  cannot be hand-reconciled.

**T-1K — one thousand.** Nothing normal is ever seen; everything normal is auditable.
- Rotation floor + quarterly staged hygiene per world family (§2.6 #5) — at 500+ worlds, ~450
  never surface on event-ranking alone [A5].
- Anomaly watches on every per-client series (cost, fires, engagement, deliverability) with
  alert budgets — a number that is always large carries no information [A10], so the budget is
  itself policy.
- Automated rollback triggers: a stable version breaching its bake baselines fleet-wide
  re-pins its cohort without waiting for the morning slate (detection may act inward;
  outbound stays gated).
- Policy coverage of generated-app children (§2.4's ARCH-CHANGE half): proxy their outbound
  through platform rails, or a per-child policy sidecar — the enforcement boundary must be
  closed, not documented.
- Per-world liveness SLOs replacing job liveness as the canary's subject: the nightly canary
  learns to assert "every operating world produced its due rows," not just "the clock ticked."
- Multi-operator delegation exceeds this document's scope but is the honest T-1K question the
  single-operator substrate [01 §21] cannot ask yet.

---

## 4. Toolchain — the DAILY FLEET OPERATION sequence

The charter-mandated chain: one table, one row per step, for the day the control plane exists
to produce. Statuses grade the step **as a fleet operation today**.

| Step | Status | Evidence | Build/Buy | Owner object | Approval posture | Portfolio surface | Breaks at |
|---|---|---|---|---|---|---|---|
| 1. Overnight: all client automations run on the clock | **WORKING 🔌** | 12 pg_cron jobs; standing-worker 15-min tick; trigger engine window-guarded, claim-first, once-only [R13 §2, §6.3; R04 app_0076] | Build (done); never self-arms [R06 §0] | Standing Order / substrate | earned/auto per existing grants; else drafts | Running lens (DOCUMENTED-ONLY) | T-100 — per-owner fan-out and per-tick drain budgets sized for one operator's volume; no per-client fairness or backpressure |
| 2. Fleet health rollup compiles per client world | **MISSING + ARCH-CHANGE** | no world_id on execution_runs (app_0022); heartbeat job-scoped [R04] | Build: §2.1 columns + fleet-tick + adsWatchCore reuse | substrate | none (internal) | the health board's fleet successor | T-10 — at ten clients "which client broke" is already a manual ledger walk |
| 3. Credential/connector expiry sweep | **MISSING** (substrate PARTIAL) | expires_at stored unread (app_0014:18); client_connections refresh manual [app_0110]; probes exist in `connections` fn [R13 §3] | Build: schedule existing probes (§2.2) | Standing Order | none; renewals file as exceptions | credential lens: connector × client × expiry | T-10 — expiry-by-outage becomes client-facing |
| 4. Cost attribution + anomaly sweep per client | **PARTIAL + ARCH-CHANGE** | metering WORKING per owner [R13 §10.2]; no client dimension (schema.sql:168) | Build: §2.3 on §2.1 columns; adsWatchCore reuse | substrate + Standing Order | none (detection-only) | Money lens margin line, drills to rows | T-10 for attribution; T-100 for detection |
| 5. Campaign performance deviation sweep | **PARTIAL** | world-attributed engagement rows exist [R04 §3.4]; scorecard per-business split weekly [R13 §6.5]; ads only daily [R13 §9.11] | Build: generalize baseline core to send/reply/lead series | Standing Order | none (detection-only) | exception rule: deviation ≥ threshold only | T-100 — weekly-per-owner granularity hides a dying client for weeks |
| 6. Policy sweep (monitor-mode evaluation + violation rollup) | **MISSING** | gates exist hard-coded and refuse honestly [R13 §7.1]; no declarative layer | Build: §2.4 policies table into existing gate seams | substrate | none (enforce refuses at gates; monitor files) | violations-by-policy roll-up | T-100 per charter; earlier if regulated verticals onboard |
| 7. Exception compiler: severity tiers, maintenance batched | **MISSING** | ethos shipped (quiet-when-green [R13 §6.4]); sum unbudgeted [A10] | Build: §2.6 #1 | substrate | none | THE exception list — the control plane's one output | T-10 — 15–25 items/day habituate past the real fire [A10] |
| 8. Morning slate renders (batch + outliers + judgment items) | **PROTOTYPE-ONLY** | morning-brief.html slate; reality-check 13 D3; pulse is per-owner digest [R13 §6.4] | Build: slate approval kind (content_week precedent, app_0088) | Mission (daily) | **slate** — the posture itself | the Brief's needs-you stanza | T-10 — 30–35 items/day [A1] |
| 9. Operator walks slate; outliers individually; members execute through unchanged rails | **PARTIAL** | Queue + batch-by-class WORKING [R03 §2]; slate kind + dwell-weighting MISSING | Build: §2.6 #2/#4 | Mission | approve (outliers) / slate (routine) | Queue, unchanged — one list at any n | T-100 — rubber-stamp ratchet without dwell/sampling [A14] |
| 10. Drop into judgment-needed clients, pre-focused | **DOCUMENTED-ONLY** | lens/drop contract [exp-arch 08 §2.5]; today: per-page navigation, client console rollups WORKING [R05 §9.22] | Build: exception row → world deep-link | Workshop/Desk (per world) | per-world gates as ever | the drop | T-100 — navigation cost × exceptions/day |
| 11. Rollout state advances (bake verdicts, promotes, rollbacks) | **MISSING + ARCH-CHANGE** | §2.5; adopt-proposals DOCUMENTED-ONLY [exp-arch 09 §10.2] | Build: registry + lifecycle | substrate + Mission per rollout | approve (cohort/promote); auto (rollback to last-good) | rollout board: version × cohort × bake state | T-100 per charter |
| 12. Invisible-normal ledger + sampled audit (nothing normal seen; everything auditable) | **PARTIAL** | execution_runs complete + immutable [R04 §3.10]; sampling/rotation MISSING [A5, A14] | Build: §2.6 #4/#5 | substrate + Standing Order | auto (inward-only) — justification: reads rows, touches nothing outbound | rotation-floor sentences; audit verdicts feed dials | T-1K — "complete, honest, and unread" [A14] |

**Chain verdict.** Step 1 is real and load-bearing — the fleet's *muscles* exist and are
gated. Steps 2–12 are the fleet's *senses and reflexes*: two are PARTIAL, one lives in a
prototype, the rest are MISSING, and the two ARCH-CHANGE items (attribution columns; the
version registry) sit at the head of every dependency chain. The buildable order is exactly:
attribution → health rollups → credential/cost/performance sweeps → exceptions/slate →
policy → registry/rollout. Nothing in the chain requires a new external service; the only
Buy-shaped decision is whether T-1K observability outgrows Postgres rollups.

---

## 4b. Toolchain — COHORT ROLLOUT of an automation version (the T-100 defining chain)

The second operational sequence: what happens when the operator improves an automation that
90 clients run. This chain is where fleet questions 7–9 either close or stay open.

| Step | Status | Evidence | Build/Buy | Owner object | Approval posture | Portfolio surface | Breaks at |
|---|---|---|---|---|---|---|---|
| 1. Author v(n+1) of a package (templates, trigger params, changelog) | **MISSING + ARCH-CHANGE** | packs are code registries + copied config today [R05 §9.23; app_0076] | Build: `automation_packages` (§2.5) | substrate | none (a draft row) | registry entry with variance line | T-10 — without a package noun, an "improvement" is 10 hand-edits |
| 2. Verify the version against the harness before any client sees it | **PARTIAL** | 116 verify suites gate deploys [R03 §10] — but they test the PLATFORM's code, not a package's templates/params; trigger QA covers dedupe/indexes only (app_0078) | Build: per-package dry-run (compile templates against a synthetic customer list; placeholder/policy gates replayed) | Capability | none (internal) | bake report, pre-cohort section | T-100 — unvalidated templates × 90 clients |
| 3. Select the canary cohort (3–5 clients, low-risk, mixed verticals) | **MISSING** | no cohort noun anywhere; closest is `customer_lists` (client-side, wrong axis) [R04 §3.7] | Build: cohort = a saved selection over `package_pins` | Mission (the rollout) | **approve** — cohort choice is judgment | rollout board: version × cohort | T-100 |
| 4. Stage per-client adoption to the cohort | **DOCUMENTED-ONLY** | batch-adopt walked per world [exp-arch 08 §6.2, 09 §10.2] | Build: pin updates through per-client approvals | Mission step | approve (per client, batchable) | Queue, class-batched | T-100 |
| 5. Bake: run N days / M fires; measure vs v(n) baseline | **MISSING** | measurement substrate half-exists: `trigger_fires` + `execution_runs` (needs §2.1 attribution + `package_version` stamp) | Build: bake verdict job (content-week judge generalized [R03 §6]) | Standing Order | none (detection) | bake report: success/violations/engagement/cost deltas, insufficient-sample honest | T-100 |
| 6. Promote: advance remaining pins, conflicts-only attention | **MISSING** | standing-answer-per-improvement is reality-check fix #4 (design input, no code) | Build: §2.5 step 4 | Mission step | **slate** (no-conflict pins) + approve (conflicts) | variance line updates live | T-100 — 294 diff-reads/year per setup family otherwise [A8] |
| 7. Watch the promoted fleet at higher sensitivity for K days | **MISSING** | ads-watch dedupe/threshold machinery is the template [R13 §9.11] | Build: temporary threshold override in the §2.1 sweep | Standing Order | none | exceptions, severity-boosted for this version | T-100 |
| 8. Rollback on breach: re-pin to last-good | **MISSING** | idempotency keys make re-pin safe — (trigger, customer, due-date) never re-fires [R04 app_0076] | Build: §2.5 step 5 | Capability | **auto** (config-only, inward, provably no re-send) — justified by the fire-key invariant | rollout board flips version to `failed-bake` | T-100 |
| 9. Record the rollout as history (who runs what, since when, why) | **MISSING** | `package_pins` + approvals + execution ledger compose this for free once they exist | Build (falls out of §2.5) | substrate | none | question 7's answer, forever | T-100 |

**Chain verdict.** Zero steps exist in code; one is DOCUMENTED-ONLY; yet six of nine reuse a
shipped invariant (verify harness, approval spine, fire idempotency, anomaly core, content-week
bake). The chain's genuinely new inventions are only steps 1 and 3 — the package noun and the
cohort noun. This is the charter's pattern at its clearest: the fleet capability is MISSING,
but the distance to it is short because the per-world engineering underneath is real.

---

## 4c. Acceptance checks for the control plane (when is it real?)

1. **The one-query test:** "which clients had a failed or missing automation run yesterday"
   is one query over `world_health`, and every row drills to `execution_runs`/`trigger_fires`.
2. **The dark-world test:** a client whose due automations produced zero rows surfaces as
   `dark` the next morning — job-level heartbeat green is not accepted as world-level health.
3. **The expiry test:** no credential expiry is ever first observed as an execution failure;
   every one was an exception at T-14.
4. **The attribution test:** every metered AI call, connector run, and fire made on behalf of
   a client carries that client's id; the margin line sums only real ledger rows.
5. **The version test:** "what is client #37 running, since when, approved by whom" is
   answerable for every automation, forever — including after a rollback.
6. **The rollback test:** re-pinning a cohort to last-good re-sends nothing (fire-key
   invariant holds) and requires no template archaeology.
7. **The slate test:** no sequence of slate gestures can make anything outbound happen with
   fewer per-item gates than individual approval (the exp-arch 08 bypass test, inherited);
   outliers are excluded from the slate before it renders, not after.
8. **The invisibility test:** an operation the operator never saw can still be reconstructed
   end-to-end from ledgers — and has a nonzero probability of having been sampled for audit.

---

## 5. The fifteen questions

| # | Question | Answer |
|---|---|---|
| 1 | Exists & works | The operator-level cockpit: system-control, Health board, canary, scorecard, ads-watch, pulse, the three ledgers, autonomy grants — all WORKING (🔌) [§0]. Zero of the eleven fleet questions answerable at fleet grain today [§1]. |
| 2 | Partial/scaffold | Cost attribution (metered per owner, not per client); campaign deviation (rows exist, judgment doesn't); required-capability checklists (per-client rows, no required-set, manual refresh); invisible-normal (ledger complete, audit machinery absent) [§1 rows 3/4/6/11]. |
| 3 | Docs/prototypes only | The slate/exception morning (morning-brief.html + reality-check 13 D3); lenses, the drop, batch-adopt, uncompressible rule (experience-architecture 08, DOCUMENTED-ONLY throughout) [§2.6, §1 row 8]. |
| 4 | Missing entirely | Fleet health rollups, credential monitoring, per-client cost anomaly detection, policy engine, version registry, cohort rollout, canary cohorts, severity/exception machinery [§1]. |
| 5 | Build internally | All six subsystems — each generalizes a proven in-house pattern (adsWatchCore, canary, content-week bake, scorecard splits, batch drains); no third party owns this shape [§2]. |
| 6 | External API | None required at T-10/T-100. Optional at T-1K: dedicated observability/metrics store if Postgres rollups strain; PagerDuty-class escalation for top-severity exceptions. |
| 7 | Reusable Capability | Baseline/deviation core (adsWatchCore generalized); probe scheduler; slate manifest builder — each a Capability consumed by many Standing Orders [§2.1–2.3]. |
| 8 | Domain Workshop | None. The control plane is deliberately NOT a Workshop — it is substrate plus one daily Mission surface; forcing it into the nine-bench grammar would rebuild a dashboard. (No 14-field spec, per charter: no Workshop is proposed.) |
| 9 | Mission | The daily fleet operation (§4) as a recurring Mission; each cohort rollout as a Mission with bake/promote steps [§2.5]. |
| 10 | Standing Order | fleet-tick (health), credential-watch, cost/performance sweeps, policy monitor, rotation floor, audit sampler — six new standing jobs on the existing heartbeat [§2]. |
| 11 | Requires approval | Cohort selection, promote, policy activation in enforce mode, slate approval itself, any autonomy widening — all through the existing spine [§2.4–2.6]. |
| 12 | Safely autonomous | All detection/rollup/probe work (inward, touches nothing outbound); rollback-to-last-good (config repoint, idempotency-protected); maintenance batching. Justified: none of it can send, spend, or publish [§2.1–2.2, §2.5]. |
| 13 | Portfolio-level | This entire document — the control plane IS the portfolio level; its one output is the tiered exception list + slate [§2.6, §4 step 7]. |
| 14 | Breaks at 10/100/1k | 10: no per-client health/credential/cost visibility; slate needed. 100: no versioning/cohort/policy/exception machinery — the approval ladder fails at N ≈ 150–250 [A1]. 1k: attention itself fails without rotation floor, sampled audits, alert budgets, per-world SLOs [§3]. |
| 15 | Mastery needs | Domain knowledge: SRE practice (SLOs, error budgets, canary analysis) translated to business operations; per-vertical "normal" baselines. Tools: the six subsystems. Feedback loops: bake verdicts → registry; audit samples → autonomy dials; exception outcomes → severity calibration; margin lines → packaging/pricing [§2.5–2.6]. |

---

*Cross-references: `01-capability-inventory.md` §21–22 and its DISCONNECTED register (the
heartbeat-never-self-arms posture applies to every Standing Order proposed here);
`03-real-estate-marketing.md` (whose chains' "Portfolio surface" columns are consumers of this
control plane); the 13-gap-matrix aggregator consumes the rows below.*

## Matrix rows

| Capability | Class | Evidence | Needed-at | Owner object | Note |
|---|---|---|---|---|---|
| Operator cockpit (system-control/health/canary/scorecard/ads-watch/pulse) | WORKING | [R13 §6.4–6.9, §9.11] | T-ME | substrate | 🔌 single-operator scope |
| World/client attribution on execution_runs + usage_events | MISSING + ARCH-CHANGE | app_0022:57; schema.sql:168 | T-10 | substrate | head of every dependency chain |
| Fleet health rollup per world (state incl. `dark`) | MISSING + ARCH-CHANGE | [R04 §3.7] [R13 §2] | T-10 | Standing Order | heartbeat is job-scoped today |
| Per-world deviation watch (generalized adsWatchCore) | MISSING | [R13 §9.11 §10.20] | T-100 | Capability | proven core, wrong scope |
| Credential registry + expiry/probe sweep | MISSING | app_0014:18; app_0110 | T-10 | Standing Order | probes exist unscheduled [R13 §3] |
| Per-client cost attribution + margin line | PARTIAL + ARCH-CHANGE | [R13 §10.2 §9.12] | T-10 | substrate | revenue side already per client |
| Per-client cost anomaly watch | MISSING + ARCH-CHANGE | [R13 §9.11] | T-100 | Standing Order | ads-watch is the template |
| Declarative policy engine over existing gates | MISSING | [R13 §7.1–7.2] | T-100 | substrate | gate seams centralize already |
| Policy coverage of generated-app children | MISSING + ARCH-CHANGE | [R13 §5.3 §13.8] | T-1K | substrate | enforcement boundary open |
| Automation package/version registry + pins | MISSING + ARCH-CHANGE | app_0076 (no version col) [R05 §9.23] | T-100 | substrate | record versions from T-10 |
| Cohort rollout (pin→cohort→bake→promote→rollback) | DOCUMENTED-ONLY + ARCH-CHANGE | [exp-arch 08 §6.2, 09 §10.2] | T-100 | Mission | batch-adopt made concrete |
| Bake/canary cohort verdicts from fire ledgers | MISSING | [R03 §6] [R04 app_0076] | T-100 | Standing Order | content-week judge generalized |
| Exception compiler (severity tiers, maintenance batch) | MISSING | [A10; R13 §6.4] | T-10 | substrate | the control plane's one output |
| Slate approval kind (manifest, hash-bound, outliers out) | PROTOTYPE-ONLY | morning-brief.html; RC-13 D3; app_0088 | T-10 | Mission | content_week is the spine precedent |
| Dwell-weighted streaks + sampled audits | MISSING | [A14] | T-100 | Standing Order | trust vs fatigue distinguishable |
| Rotation floor + staged hygiene | MISSING | [A5, A12] | T-1K | Standing Order | silent rot is T-1K steady state |
| Cohort-evidence provisional autonomy | MISSING + ARCH-CHANGE | app_0097 (per-owner per-class only) | T-100 | substrate | kills the O(N) apprenticeship [A2] |
| Multi-operator delegation | MISSING + ARCH-CHANGE | [01 §21] | T-1K | substrate | out of scope; named honestly |

---

*Cross-references: `01-capability-inventory.md` §21–22 and its DISCONNECTED register (the
heartbeat-never-self-arms posture applies to every Standing Order proposed here);
`03-real-estate-marketing.md` (whose chains' "Portfolio surface" columns are consumers of this
control plane); the 13-gap-matrix aggregator consumes the rows above.*
