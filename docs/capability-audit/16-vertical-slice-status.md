# 16 — Website-Client Vertical Slice: What Is Genuinely Executable

*Closing report for item 8 of the implementation directive. Written to the same honesty standard
the code enforces: executable means a real row moves through real code; simulated means a fixture
proves the logic but no live rail was exercised; blocked means it needs a provider credential or
a production deployment this environment cannot supply.*

**Branch state:** all work committed and pushed. New migrations `app_0112`–`app_0119`. New verify
suites: 9, totalling **197 checks**, all wired into CI (which auto-runs every `verify:*` script).

---

## 1. The scope invariant, confirmed

The directive required proving that every execution and cost-bearing operation resolves to either
a specific `world_id` or an explicit platform scope with a documented reason. This is now
**structural, not aspirational**:

- `src/lib/garvis/scopeContract.ts` is the registry: **8 world-stamped writers** (each pinned to
  the source line that stamps) and **7 registered platform scopes**, each carrying a written
  reason — hunts are pre-client cost-of-sale, heartbeat jobs operate *on the machine*, builder
  usage keys on `project_id` as declared debt, the operator's own outbound is legitimately theirs.
- `scopeContract.verify.ts` fails CI if a stamp regresses or a reason is missing/too thin.
- The load-bearing mechanism is `app_0114`'s BEFORE-INSERT trigger: `execution_runs` inherits
  `world_id` from its authorizing approval, so **every executor became client-attributable
  without touching a single call site**.

Per the directive's checklist — scheduled Standing Orders ✅ (world-stamped at pin and payment
time), inbound webhooks ✅ (contact-resolved, honest null otherwise, registered as debt), retries
and repair ✅ (inherit their trigger's client), manual runs ✅, ingestion ✅ (server-resolved per
subject), publishing ✅, AI calls ✅ (`usage_events.world_id`), generated-app child runtime ⚠️
(registered as a *known debt* — the child runtime bills to the tenant's own project, and its
`automation_runs` rollup is named in §4 as the open fleet seam).

## 2. What is genuinely executable today

Real code paths, exercised by real rows, no fixtures involved:

| Capability | Where | Evidence it is real |
|---|---|---|
| Client world birth at close-won | `closeWonRun.ts` | Creates `knowledge_worlds`, links `client_subscriptions.world_id`, stamps the contact |
| Package pin + establishment | `servicePackagesRun.ts` | Pins current version, arms the site watch, surfaces automations as asks |
| Watch-at-sale | `stripe-webhook` | Idempotent daily `watch_url` order on the paid, live URL, world-stamped |
| Change-request intake from client email | `resend-inbound` | Forward-in mail from an active-package client's contact inserts a `change_requests` row |
| Change-request lifecycle | `changeRequestsRun.ts` | 11 states, loud on illegal transitions, append-only history, time/cost attribution |
| Automation circuit breaker | `standing-worker` + `app_0113` | Records error + streak; 5 failures self-pause with a loud event |
| Report generation | `clientReportRun.ts` | Gathers one world's month from 6 real tables, compiles, versions, supersedes |
| Report delivery | `clientReportRun.ts` | Refuses unapproved; mints a world-stamped `send_email` approval on the one spine |
| Package upgrade/downgrade/pause/resume | `packageLifecycleRun.ts` | Re-pins, preserves overrides, pauses real watches and triggers |
| Consent recording | `packageLifecycleRun.ts` | Throws on empty evidence; upserts `package_consents` |
| Termination + offboarding inventory | `packageLifecycleRun.ts` | Computes from live rows, pauses (never deletes), writes the inventory jsonb |
| Fleet control plane | `useFleetView.ts` + `/garvis/fleet` | Six live queries → verified core → exception-only page |
| Cost attribution per client | `app_0114` + Batch E | `usage_events.world_id` summed per world in the fleet's 30-day view |

## 3. What is proven but simulated

The logic is proven by fixtures; the live rails were not exercised in this environment:

- **The three-client proof scenario** (`fleetView.verify.ts`, 28 checks) — healthy client raises
  **zero** exceptions and never appears by name; the incident client shows site-down (act) plus a
  *retrying* automation (watch); the broken client shows breaker-paused, an aging request, and a
  cost outlier — each with row-derived evidence, real numbers in every summary.
- **The end-to-end lifecycle** (`lifecycleProof.verify.ts`, 22 checks) — the request road, the
  fleet going quiet on close, the report telling the truth about the resolved incident,
  termination stopping exactly its own work, and cross-client isolation in both directions.
- **Report honesty** (`clientReport.verify.ts`, 25 checks) — null sources become explicit
  unknowns contributing nothing numeric; an empty array is a measured zero; fewer than 7
  observations refuses a percentage; extra fields on input rows cannot change output.

What "simulated" specifically means here: no live Supabase instance was written to, no email was
sent, no Stripe event was received. The queries are written against the real schema and
typecheck, but **first execution against a live database is still their first execution.**

## 4. What is blocked on a provider or production credential

| Blocked on | What it gates |
|---|---|
| `WORKER_SECRET` + `garvis_arm_heartbeat()` | Every recurring operation. Nothing in this slice runs unattended until the clock is armed — the machine still ships switched off. |
| Resend (verified sending domain) | Report delivery and every outbound client email actually leaving |
| Stripe (live keys + webhook secret) | Pay→auto-publish, watch-at-sale, subscription lifecycle |
| Inbound mail routing (`INBOUND_SECRET` + forward-in alias) | Client-email change-request intake |
| Twilio + A2P 10DLC | The SMS rail (the enum is fixed; the registration is external and takes 1–3 days) |
| A live Supabase project | Applying `app_0112`–`app_0119`; the migration guard passes 4/4 but has never been run against a live DB |

## 5. Known gaps I did not paper over

1. **Uptime is not a real series.** `standing_orders` keeps only the *last* watch result, so a
   month of uptime cannot be reconstructed. The report therefore refuses to state a percentage
   and says why. A `watch_runs` history table is the honest fix — deliberately not built here
   rather than faking a number.
2. **Leads and breaker events are `null` in the report** unless a world-scoped source exists.
   Listed as unknowns rather than substituted with owner-wide counts.
3. **The generated-app child runtime has no fleet seam** — its `automation_runs` are not rolled
   into the control plane (registered as known debt in the scope contract).
4. **No client portal.** Intake is operator entry + client email; the portal source value exists
   in the schema and nothing implements it.
5. **Cohort rollout is not built.** Single-client upgrade and rollback is enough for this slice,
   exactly as the directive allowed; the pin carries the cohort tag for when T-100 needs it.
6. **Offboarding inventories, never executes destructively.** Hosting is flagged "transfer or
   takedown required," Stripe "cancel at Stripe" — the system will not silently delete a client's
   live site or cancel their payment. That is a deliberate refusal, not an omission.

## 6. The honest answer to "could ten website clients be operated without entering every World?"

**The machinery now exists and is verified; the proof at ten live clients has not been run.**

What genuinely supports the claim: exceptions surface centrally with evidence and repair state; a
healthy client consumes zero attention by construction; failures record, retry, and self-pause
loudly instead of silently starving the fleet; every cost, execution, and request attributes to
one client; reports derive from that client's own ledgers or admit what they cannot measure; and
a relationship can end without anything continuing to run on the operator's credentials.

What would falsify it: the first live month. Ten real clients will produce query-shape surprises
(the fleet's six gathers have never met production row counts), watch-history gaps the uptime
refusal will make visible, and intake edge cases the change-request state machine has not seen.

**The recommended next step is not more building — it is arming the clock on one real client**
and letting the fleet view be wrong in public for a week.
