# 04 — Website Agency & Client Operations: The A-Grade Funnel and Its Unbuilt Second Half

*Phase 5.5 capability audit. Domain: the website-agency vertical end to end — finding local
businesses with bad/missing websites, reconstructing them as hosted demos, converting owners into
paying clients, onboarding them, and then operating the relationship for years. This is the
system's flagship revenue engine ("Core loop up front", PR #74) and its most complete long
workflow — the author's own A− pillar. The audit therefore inverts the usual posture: Chain 1 is
audited for its *remaining* weak steps; Chain 3 (long-term management) is audited exhaustively,
because it is the under-built half that decides whether "$500/mo care plan" is a product or a
promise. Rubric, formats, evidence protocol: `_charter.md`. Evidence: [R03] §4/§8 · [R06] §5–6,
§12, §15 · [R13] §5, §7.11–7.15, §9.1–9.3 · [R07] §2.5, §2.10, §3.3 · direct greps of `src/` and
`supabase/functions/` cited inline. 🔌 = dark until the heartbeat is armed / secret set [R06 §0].*

---

## 0. What this domain already is (the honest headline)

Prospect → client is **the strongest chain in the system**: an armed instance discovers real
businesses on a national grid, scrapes them through a hardened fetch, fingerprints their stack,
builds a critiqued demo site, hosts it with re-hosted photos and a tracking pixel, pitches it
through the one gated send path, watches opens/visits/replies live on the board, and — the
corpus's one fully zero-browser money loop — **publishes the sold site automatically when the
Stripe payment lands**, with a churn no-resurrection guard already in place
([R06 §5] · [R13 §9.1] · [R07 §2.5]).

Then the chain stops. Everything after "the client paid" narrows fast: onboarding is real but has
three `built:false` connectors and a deliberately-manual billing reconciliation; and long-term
management — the thing a $500/mo care plan actually sells — is close to absent. Grep-verified in
§3 below: there is **no client-facing change-request loop** (the operator-side refine → republish
mechanics exist and are good), **no per-client monthly report** (the "monthly automation report"
is one owner-wide sentence rendered on page visit), **no uptime watch on sold sites** (the
`watch_url` standing order could do it and is wired to nothing), **no site-content refresh
order**, **no offboarding/takedown on churn**, and **no ongoing upsell detection** after the
point of sale. The agency can *win* a client while the operator sleeps; it cannot yet *keep* one
without the operator remembering everything.

---

## 1. Chain 1 — PROSPECT → CLIENT (the A-grade funnel, audited for its weak steps)

| Step | Status | Evidence | Build/Buy | Owner object | Approval posture | Portfolio surface | Breaks at |
|---|---|---|---|---|---|---|---|
| 1. Discovery (daily hunt) | **WORKING 🔌** | `clientHuntSchedule` standing order: city roll + ~200-metro national sweep, self-caps, market-exhaustion tracking; `discover-run` dual engine (Claude web_search scout with citation-grounding, or Places firehose) [R06 §5a] [R13 §8.1] | done | Standing Order | none (internal pool) | Lens: pool freshness per metro/niche | Holds to T-100; T-1K needs per-niche query self-tuning (DOCUMENTED-ONLY [R03 §11]) |
| 2. Scrape | **WORKING** | `fetch-url` (SSRF-hardened safeFetch, Chrome fingerprint for WAFs, hidden-email decode, real-photo finding, PR #75) → `scrapeProfile` [R06 §5b] [R13 §8.4] | Build: rendered-DOM fetch for JS-portal sites is DOCUMENTED-ONLY [R03 §11]; no proxies by choice | Capability | none | Exception rule: scrape-failure rate per niche | ⚠ WEAK: JS-heavy sites scrape thin → demo built from a thin profile; the failure degrades honestly (fallback spec) but silently costs demo quality; T-10 wants a scrape-failure lens |
| 3. Audit + fingerprint | **WORKING** | `techFingerprint.ts` (null-never-guess) + `automation/detect.ts` (deterministic registry matcher, `matchedSignal` evidence) [R03 §4] [R13 §10.16] | done | Capability | none | — | Holds (pure, verified) |
| 4. Demo build | **WORKING** | strategist → art director → generator → simulated-owner critique → auditor; contrast gate; de-generic fallback (PR #71); bespoke vision-grounded sites + Veo scroll motion (PR #61/#73); deterministic zero-AI fallback floor (12 industry recipes, WCAG net) [R06 §5c] [R13 §10.17] | Build: see weak note | Capability | none (drafts) | Lens: demo quality/spec_source mix across the pool | ⚠ WEAK — the acknowledged variance: critique/refine runs only when `spec_source === 'ai'` (`engine.ts:266` — fallback sites skip the simulated owner), and **no outcome loop exists**: visit/claim/reply signals are collected but never fed back into the generator (grep `engine.ts`: no outcome/conversion reference). Quality is gated per-site, never learned across sites. T-10 |
| 5. Publish demo | **WORKING 🔌** | `publish-preview`: Netlify host, scraped-photo re-host (SHA-1 dedup, SSRF-safe), **HTML stashed for browserless re-publish**, site-events pixel + public audit report (`PreviewReport.tsx` — "a gift instead of a pitch") [R13 §5.1] [R13 §7.13] | done | Capability | none (demo, not outreach) | Lens: live demos per metro | Holds; browser renders the HTML (operator-tab-bound first publish) |
| 6. Pitch | **WORKING** | one-click Build & send (PR #72); placeholder send-gate (PR #79); review-before-send compare (PR #85); signal-grounded upsell paragraph ("No observed signals → no upsell lines, ever", `WinClients.tsx:117`); → send-email, the one gated path [R06 §5e] | Build: the enum migration for the SMS substitute | Mission | **approve — cold pitches manual forever by design** [R05 §6] | Slate: pending pitches across the pool | ⚔ WEAK: **no-email businesses dead-end here** [R06 §5 ⚠]. The SMS substitute is DISCONNECTED (`approval_kind` never gains `'send_sms'` [R06 §15 #0]); phone rails only receive. T-ME |
| 7. Signals | **WORKING 🔌** | resend-webhook (delivery/opens/clicks/bounce→suppression) + site-events demo visits → live prospect board (PR #86) [R06 §5f] | done | Capability | Slate: today's warm signals | Holds to T-100 |
| 8. Follow-up | **WORKING 🔌** | outreach-followups cron + opened-3×-silent + reactivation; drafts mint approvals, never send alone [R06 §5g] | done | Standing Order | approve → earned (followup class "eligible" [R05 §6]) | Exception: silent-after-open prospects | Holds; sequence depth beyond 2 bumps MISSING [R13 §7.8] |
| 9. Reply | **WORKING 🔌** | resend-inbound (classified 3-tier fallback) → Replied filter, read-in-place (PR #88); inbox-draft overnight + `draft_verdicts` kept-vs-rewritten learning [R06 §5h] | done | Capability | Slate: replies awaiting answer | Holds |
| 10. Claim / intent | **WORKING 🔌** | claim-submit ("a raised hand must never land silently" — webhook + fallback insert, `engine.ts:289–301`); automation-intake (deliverable-only proposals); client-checkout ("Make it mine" → pending sale + operator's Payment Link, honest 503 when unconfigured) [R13 §7.14–7.15, §9.3] | done | Capability | Slate: claims + hot intakes | Holds |
| 11. Pay → auto-publish | **WORKING 🔌** | stripe-webhook `handleClientSale`: uuid `client_reference_id` → sale active, demo `purchased`, **stashed HTML auto-publishes server-side** (`saleActionOnPaid` decision table); 💰 SOLD mind-event + webhook push [R13 §9.1] [R07 §2.5] | done | Capability | Control-plane: failed-payment alerts | Holds — the zero-browser proof. Fails only if the operator never stashed HTML (422, honest) |
| 12. Close-won → client world | **WORKING** | close-won → `client_engagements` (row created first — "a failed draft never loses the client record") → genesis ceremony → Client Book [R03 §8] [R05 §9.22] | done | Mission | approve (world draft) | Lens: Client Book | Holds; see Chain 2 for the seams |

**Chain verdict.** Steps 1–12 all close in code — this is genuinely the system's best chain, and
the only one where money moves with no browser open. The three honest weak steps, confirmed:
**(a) no-email businesses dead-end** at step 6 and the substitute rail is severed by a one-line
enum; **(b) scrape failures degrade to thin profiles** whose demos silently skip the critique
pass; **(c) demo quality has gates but no learning** — nothing correlates spec_source/strategy
with visits/claims, so the funnel cannot get better at its own craft. All three are T-ME-relevant
but none is chain-severing.

---

## 2. Chain 2 — ONBOARDING (close-won → operating FOR the client)

| Step | Status | Evidence | Build/Buy | Owner object | Approval posture | Portfolio surface | Breaks at |
|---|---|---|---|---|---|---|---|
| 1. Record the sale | **WORKING** | ClientBilling record-a-sale form; Win-clients deep-links with business+email prefilled ("never re-types what she already scraped", `ClientBilling.tsx:57`); or automatic via webhook (Chain 1 step 11) | done | Capability | none | Lens: MRR roster | Holds |
| 2. Engagement + intake | **WORKING** | `clientEngagementRun.ts`: engagement row first, then world genesis; intake checklist **deterministic from scope keywords**, not a model call [R05 §9.22] | done | Mission | approve (world draft) | Slate: intake items owed per client | ⚠ engagement-email→contact gap noted in scan [R03 §8] — the client's email doesn't become a CRM contact automatically |
| 3. Connections checklist | **WORKING** (3 connectors SCAFFOLDED) | `clients/connections.ts` (pure, verified): 9 connectors; `seedForTier` marks needed-vs-not by purchased tier; **status derived from evidence in each connector's own table**, never a copy; human `not_needed` never auto-overwritten [R07 §3.3] | Build: **google_business, calendar, esign are `built:false`** — honestly "Coming soon", never nag | Capability | none | Control-plane: unconnected-needed count per client | T-10: three of nine connectors are catalog entries, not rails; care-plan clients will need Google Business first |
| 4. Domain | **WORKING 🔌** | connect-domain: client's existing domain → Netlify, exact registrar records returned, live `resolveDns` + SSL verification, **never MX** [R13 §5.9] [R07 §2.10] | Buy (optional): registrar API for hands-off DNS — none exists; changes are manual-by-client with honest verification | Capability | Exception: domains stuck unverified >N days | Holds at T-10; T-100 wants the exception rule |
| 5. Email sender identity | **WORKING 🔌 / DISCONNECTED deploy** | per-brand sender identities + `sender-domain` (SPF/DKIM/DMARC records + verification) [R03 §5] — but the function is **in no deploy list** [R13 §13.4] | Build: add to deploy list (one line) | Capability | Control-plane: sender-domain verification status | T-ME: a fresh environment silently lacks the function |
| 6. Booking / voice / SMS rails | **PARTIAL 🔌** | booking (DB-exclusion double-book guard, confirmations + reminders) real but **also in no deploy list** [R13 §7.12, §13.4]; missed-call text-back real [R13 §7.11]; SMS approvals latent-dead (enum [R06 §15 #0]); per-client Twilio numbers on `client_subscriptions.twilio_number` [R07 §2.7] | Build: deploy-list lines + enum migration; A2P 10DLC ceremony is documented external work | Capability | Checklist feeds the connections surface (step 3) | T-ME until the two deploy-list lines + enum land |
| 7. Automations config | **WORKING 🔌** | per-client automation config, attribution to paying clients, ROI stats at point of sale (app_0108, PRs #64/#67); `automationReady` gate: an automation switches on only when every required connector is `connected`, missing ones named exactly [R03 §8] [R07 §3.3] | done | Capability | Slate: automations awaiting a connector | Holds at T-10; cohort rollout MISSING + ARCH-CHANGE (§4) |
| 8. Billing start | **WORKING 🔌** | sale activation via webhook; invoices + 4-rung chase ladder cron (approval-gated) [R13 §7.10]; client-payment **reconciliation deliberately manual** ("decide, don't drift") [R06 §6 ⚠] [R03 §11] | Build later: reconciliation loop (deliberate deferral) | Standing Order (chase) | Lens: MRR + failed payments | T-100: manual reconciliation across a hundred subscriptions is a full-time job |
| 9. Readiness proof | **WORKING** | `ClientReadiness.tsx` operator console — "nothing is shown green it can't prove"; Health board + go-live checklist for the platform side [R03 §10] | done | Capability | This IS the per-client control-plane seed | Holds |

**Chain verdict.** Onboarding is real and honest — the connections checklist's
evidence-derived status is the best per-client control-plane pattern in the corpus, and
`automationReady` is exactly the right gate. The gaps are enumerable: two functions missing from
deploy lists, one enum line, three unbuilt connectors, one email→contact seam, and reconciliation
by hand. Nothing here is architecturally hard; all of it is T-ME/T-10 punch-list work — *except*
that the checklist has no notion of a service package behind it (§4).

---

## 3. Chain 3 — LONG-TERM MANAGEMENT (the under-built half, audited exhaustively)

The question this chain answers: the client paid $1,500, pays $500/mo, and eighteen months from
now still thinks it was a good idea. Every step below was grep-verified, not assumed.

| Step | Status | Evidence | Build/Buy | Owner object | Approval posture | Portfolio surface | Breaks at |
|---|---|---|---|---|---|---|---|
| 1. Client requests a change | **MISSING** | Grep across `src/` + `supabase/functions/`: no client portal (the only "portal" hits are Stripe customer-portal and a hero visual variant), no change-request object/table, no "request a change" form on sold sites (the hosted site's forms are claim-submit lead capture + automation-intake only, `engine.ts:328–340`, [R13 §7.14–7.15]); resend-inbound classifies replies positive/negative/neutral — no edit-request kind [R13 §7.6] | Build: a `site_change_requests` object fed by (a) a form slice on sold sites riding the existing claim-submit pattern and (b) an inbound-reply classifier branch; both land in OpsInbox | Capability | none (inbound) | Slate: open change requests per client | **T-ME** — today a client emails/texts the operator's personal inbox and the system never sees it |
| 2. Operator edits the site | **WORKING** (the good half) | `regeneratePreviewSite(id, directive)` — "the *edit this demo* path — targeted, not a blind reroll": the Refine-box directive rides into both draft and refine passes; a directive alone forces a refine even when the simulated owner is content (`engine.ts:251–279`); re-publish **overwrites in place** and a `purchased` site is never downgraded (`publishCore.ts:32`, verified `publishCore.verify.ts:38`) | done; Build later: section-level edit (today a directive regenerates the whole spec — coarse for "change our Tuesday hours") | Capability | approve (publishing to a paying client's live URL should be an approval — today it is a bare confirm dialog, `PreviewEngine.tsx:113`) | — | T-10: whole-spec regeneration per small edit burns model spend and risks unrelated drift; browser-bound render (exportStatic runs client-side) |
| 3. Close the loop with the client | **MISSING** | Nothing notifies the client a change is live; no before/after proof sent (shot-worker exists and is used for *pitches* only [R13 §8.5]) | Build: "done" email via the existing send-email spine + shot-worker screenshot | Mission step | approve | — | T-ME |
| 4. Monthly report to the client | **MISSING** (client-facing) | The "monthly automation report" is **one sentence, owner-wide, rendered on page visit**: `loadAutomationMonth()` counts the signed-in owner's trigger_fires/approvals/sends for the current month (`automation/report.ts:12–43`), `automationMonthLine()` renders it, `Automations.tsx` displays it. It is not per-client, not scheduled, not sent, not an artifact. Per-client rollups exist operator-facing only (`clientConsole.ts` honest Unassigned bucket [R05 §9.22]). Raw substrate is rich: site_events visits/leads, social_post_metrics, ad_metrics, automation ledger — nobody composes it | Build: per-client monthly report producer (deliverable.ts DOC_TYPES already includes `report` — the document studio could render it) + standing order + send via spine | Standing Order → Mission | approve → earned (a clean report record is the natural second autonomy class after content weeks) | Control-plane: report sent/skipped per client per month | **T-ME** — the $500/mo client's single recurring proof of value does not exist; at T-10 its absence is churn |
| 5. Uptime / regression watch on sold sites | **DISCONNECTED** | The machinery exists: `watch_url` standing order fetches through safeFetch and the verified core treats **a failed fetch as UNREACHABLE (never "no change")** with mind_event + webhook on change (`standing-worker/index.ts:5–9`); but **nothing creates a watch for a sold site** — standing-worker touches `preview_sites` only to *create demos* in the hunt (`index.ts:1903`); no SSL/domain-expiry re-check after the one-time connect-domain verification; no Netlify state re-poll after publish; grep `uptime|downtime|site.?monitor` → zero hits | Build: auto-create a `watch_url` order per site at sale time (pure wiring); add domain/SSL expiry to the watch; Buy alternative: UptimeRobot-class API — unnecessary, the substrate is built | Standing Order | none (read) → alert is Initiative-inward | Exception rule: only DOWN/cert-expiring sites surface | T-ME — a client's dead site discovered by the client is the worst churn event there is; the fix is wiring, not building |
| 6. Content refresh (site) | **MISSING** | No standing order touches a published site's content; seasonal copy/hours/offers rot until a human notices. The regeneration path (step 2) exists to be driven, but no order drives it | Build: `site_refresh` standing-order kind → regenerate with a dated directive → approval → republish | Standing Order | approve (always — it changes a client's public claims) | Slate: due refreshes | T-10 |
| 7. Content refresh (marketing) | **PARTIAL 🔌** | content_week is **per-world** (`contentWeekRun.ts:30` takes worldId), so a client's world can run one against the client's own Ayrshare profile-key (per-brand keys fail-closed [R13 §9.8]) — social care-plan content is real and even earns autonomy after 3 clean weeks [R03 §6]; but nothing *establishes* it as part of a package (operator must remember per client), and the email leg is a deliberate manual handoff [R06 §9] | Build: package-establishes-order wiring (§4) | Standing Order | earned (exists!) | Slate: this week's content across clients | Holds mechanically at T-10; the *establishment* gap is the package gap |
| 8. Renewal / churn | **PARTIAL** | Churn is booked honestly: `handleClientSubscriptionChange` marks the sale canceled, **NO RESURRECTION** guard against out-of-order Stripe events (`stripe-webhook/index.ts:109–111`), operator notified ("Client churned — X canceled their plan", `:119`), MRR down, `invoice.payment_failed` → chase note [R13 §9.1] [R07 §2.5]. And that is *all*: no offboarding (grep `takedown|unpublish` → the sold site stays live forever on the operator's Netlify token after the client stops paying), no win-back sequence (outreach-reactivate targets silent *prospects*, not churned clients [R13 §7.9]), no renewal-risk signal (payment failure is the first and only warning) | Build: churn mission template (takedown-or-transfer decision + win-back sequence + exit report); renewal-risk from engagement signals (site visits falling, reports unopened) | Mission + Standing Order | approve (taking a site down is consequential) | Control-plane: churn events + at-risk list | T-10 — ten zombie sites on the operator's Netlify account and no goodbye process |
| 9. Upsell after the sale | **PARTIAL** | Upsell is real at exactly two frozen moments: pitch time (`automationUpsellParagraph`, grounded only in observed audit signals, `WinClients.tsx:117–126`) and point of sale (ClientBilling "upsell ladder rung 3" custom-automation menu, honest inventory only, `ClientBilling.tsx:42,293`). **Nothing re-audits an active client**: `detect.ts` runs on prospect scrape signals; no order re-fingerprints a client's operation or watches their intake/booking/lead volumes for the next automation to propose. The registry's "bespoke → graduation learning loop" learns which capability to *build*, not which client to *offer* it to [R05 §9.23] | Build: quarterly client re-audit standing order over the same detect.ts registry + client ledger volumes | Standing Order | slate (upsell proposals are batched decisions, not auto-sends) | Lens: proposed-vs-active automations per client | T-10 — expansion revenue is the agency model's margin; today it depends on operator memory |
| 10. The client's own signals keep flowing | **WORKING 🔌** | site-events pixel keeps reporting visits/leads on sold sites (write-only channel token, revocable) [R13 §7.13]; speed-to-lead instant first touch keeps working for the client's inbound leads; booking + missed-call keep running per config | done | substrate | earned (speed-to-lead pre-authorized) | Lens: per-client lead flow | Holds — this is the substrate steps 4/5/9 should be built ON |

**Chain verdict.** One step of ten is fully WORKING and it is the *operator-side* edit mechanics.
The pattern is exact and repeated: **the substrate for long-term care exists (watch_url,
site-events, content weeks, detect.ts, the document studio, the send spine) and the client-shaped
objects on top of it do not** (change request, monthly report, per-site watch, refresh order,
churn mission, re-audit order). Every gap but one is wiring-plus-one-object, not architecture.
The chain's grade as a whole: the funnel is A−; long-term management is honestly a **D+** — and
it is where the recurring revenue lives.

---

## 4. SERVICE PACKAGES as inherited genome layers

What "$1,500 build + $500/mo care plan" must become to survive T-10/T-100: a **versioned package
object** a client subscribes to, which *establishes* things (standing orders, connector
requirements, report cadence, autonomy defaults) rather than merely labeling a price.

| Aspect | Status | Evidence |
|---|---|---|
| Price tiers as data | **WORKING** (two hardcoded offers) | `clientTiers.ts`: New Website "from $1,500" one-time; Website + Automation "from $500/mo"; pure MRR math; default cents in `clientSale.ts` (150000/50000) [R05 §9.22] [R07 §2.5] |
| Tier → connector needs | **WORKING** | `seedForTier` derives needed-vs-not from the purchased tier [R07 §3.3] — the one place a package already *implies* obligations |
| Tier → automations menu | **WORKING** | ClientBilling rung-3 menu, honest inventory [R05 §9.23] |
| Package as a versioned object (contents, SLA, cadence, price history) | **MISSING + ARCH-CHANGE** | No `service_packages` table anywhere (grep `care_plan|retainer|service package` → zero domain hits); `client_subscriptions` records a tier string and a price, not a package version |
| Package establishes standing orders (content week, report, watch, re-audit) at sale | **MISSING** | Nothing wires sale → order creation; every order is operator-created per client (§3 steps 4–7) |
| Cohort rollout / migration (package v2 rolls out to 40 clients, canary-first) | **MISSING + ARCH-CHANGE** | Per-client config only [R03 §8]; no cohort noun in the schema; the charter's T-100 definition names exactly this |
| The "genome layer" concept (verticals inherit package templates) | **DOCUMENTED-ONLY** | Vertical-as-Data / `vertical_specs` is PLANNED [R03 §9, §11]; the phase-brief's inheritance language has no code |

**Verdict: DOCUMENTED-ONLY + ARCH-CHANGE** as a whole. The honest sequencing: a `service_packages`
table + `package_version` on `client_subscriptions` + a `packageEstablishes()` seeding function
(mirroring `seedForTier`, which proves the pattern) is buildable now and unblocks §3 steps 4–7
mechanically; cohort rollout/migration is genuine T-100 architecture and should wait for the
control plane (doc 10). The trap to avoid: building §3's six missing objects as one-off
per-client features *without* the package object, which would make T-10 → T-100 a rewrite.

---

## 5. Proposed Workshop: WEBSITE STRATEGY + CREATION (charter 14-field spec)

*Most of this workshop exists as `PreviewEngine.tsx` + the `src/lib/preview/` intelligence chain;
the spec names what formalizing it adds.*

- **Job**: take one real business (prospect or paying client) from scraped evidence to a
  published, honest, motion-capable website — and keep that site current for years.
- **Knowledge required**: industry recipes (12 encoded in the fallback spec), design-quality
  criteria (contrast gate, de-generic rules), claim-honesty rules (`bespokeHonest` rejects
  ungrounded claims), conversion craft (audit-report framing), domain/DNS mechanics.
- **Source data required**: scraped BusinessProfile (photos default `can_publish:false`),
  tech fingerprint + audit signals, Veo scroll-scene library, brand kit once a client, site-events
  history for a live site, the stored spec + strategy + critique on the `preview_sites` row.
- **Direct-manipulation surface**: the live rendered site itself — section-level select/edit,
  Refine directive box (exists), variant swap, before/after compare against the scraped original
  (shot-worker), publish/domain panel. The nine-bench grammar has no live-DOM canvas.
- **AI's role**: strategist/art-director/generator/simulated-owner/auditor personas (exist);
  targeted regeneration honoring the operator directive (exists); never invents business facts —
  the deterministic fallback is the floor.
- **Tools**: scrapeProfile, deriveStrategy, generateSiteSpec, critiqueSpec, regeneratePreviewSite,
  buildStaticSiteHtml, publish-preview, connect-domain, sender-domain, site-events channel mint.
- **External integrations**: Netlify (live 🔌), Resend sender domains (live 🔌), ScreenshotOne
  (live 🔌), Veo (live 🔌), Anthropic vision (live 🔌); registrar API (absent, optional).
- **Evaluation/critique criteria**: simulated-owner critique + auditor score (exist), contrast/
  WCAG gate (exists), `bespokeHonest` claim gate (exists), spec_source honesty; ADD: cross-demo
  outcome scoring (visits/claims per strategy) — the missing learning loop (Chain 1 step 4).
- **Output Artifacts**: the published site + stashed HTML, public audit report, pitch email,
  before/after screenshots, domain record sheet.
- **Missions it creates**: "Rebuild X's site", "Migrate X's domain", "Ship X's seasonal refresh".
- **Standing Orders it establishes**: per-site `watch_url` uptime/regression watch (wiring gap),
  `site_refresh` cadence (missing kind), site-events instant-first-touch (exists).
- **Outcome signals it learns from**: site_events visits/leads/claims per site, pitch
  opens/replies, sale conversions, change-request frequency — none currently fed back.
- **Expert controls**: publish approval to a paying client's URL, photo `can_publish` overrides,
  claim-gate exceptions, domain/DNS panel, channel-token revocation.
- **Fast-path (AI-assisted)**: "their number changed to 555-0100, ship it" → targeted section
  edit → diff preview → one approval → republish in place (today: whole-spec regeneration +
  confirm dialog).
- **Verdict**: **DEEP-ENVIRONMENT.** A live rendered website with section-level direct
  manipulation, motion preview, and before/after comparison is a specialized canvas the
  nine-bench grammar cannot supply (same ruling as FableForge's workspace, which is this
  surface's sibling for generated apps). Everything behind it — spine, orders, send path —
  reuses the substrate unchanged.

## 6. Proposed surface: CLIENT-OPS (the per-client operations bench)

- **Job**: run one client's whole service relationship — obligations, connections, automations,
  reports, money, requests — from one place; and be the row-level unit the portfolio lens sums.
- **Knowledge required**: the client's package (what they're owed), connector states, automation
  registry maturity, engagement history, billing state, service-cadence conventions.
- **Source data required**: `client_engagements`, `client_subscriptions`, `client_connections`
  (evidence-derived), per-client automation config + `trigger_fires` ledger, site_events +
  social/ads metrics scoped to the client's world, invoices, change requests (once they exist).
- **Direct-manipulation surface**: the existing benches nearly suffice — ClientBook +
  ClientBilling + connections checklist + clientConsole rollups ARE this surface's pieces, split
  across three pages today; unify as one client card with tabs.
- **AI's role**: compose the monthly report from ledger numbers (narrate, never compute — the
  house `DATA_SYSTEM` rule); draft change-request responses; propose next automation from
  re-audit signals. Never sends, never reconciles money.
- **Tools**: seedForTier/packageEstablishes, automationReady, clientConsole rollup, report
  producer (missing), change-request queue (missing), churn mission template (missing).
- **External integrations**: Stripe (live 🔌), Twilio/Resend/Ayrshare per-client rails (live 🔌,
  two deploy-list gaps), DocuSign (per-client connector `built:false`), Google Business (absent).
- **Evaluation/critique criteria**: report accuracy = ledger-row counts only; "nothing shown
  green it can't prove" (the readiness rule, already law); change-request SLA clocks.
- **Output Artifacts**: monthly client report (.docx/HTML via the document studio), exit report
  on churn, per-client readiness snapshot.
- **Missions it creates**: change-request fulfillment arcs, churn offboarding, package upgrades.
- **Standing Orders it establishes**: monthly report, quarterly re-audit/upsell scan, invoice
  chase (exists), content week (exists), site watch (wiring gap).
- **Outcome signals it learns from**: report opens, change-request volume/latency, automation
  ROI per client, churn events + reasons, upsell acceptance rate.
- **Expert controls**: pause/end engagement, autonomy dial per client, price/package overrides,
  suppression + consent views, takedown decision on churn.
- **Fast-path**: "how's Riverside Dental doing?" → one composed card: MRR, automations fired,
  leads captured, site status, open items — every number a row count.
- **Verdict**: **REUSABLE-FRAMEWORK.** No specialized canvas needed — this is tables, checklists,
  ledgers, and cards, all patterns the existing grammar already renders (the connections
  checklist proves the hard part: evidence-derived status). What's missing is objects and wiring
  (§3, §4), not a surface the grammar can't express.

---

## 7. The fifteen questions

| # | Question | Answer for this domain |
|---|---|---|
| 1 | Exists-working | The full prospect→client chain 🔌 (discover, scrape, fingerprint, demo w/ critique gates, publish + pixel, gated pitch, live signals, reply loop, claim, **pay→auto-publish**, close-won→client world); onboarding core (engagement+intake, evidence-derived connections checklist, connect-domain, per-client automations w/ automationReady, invoice chase); operator-side site refine→republish (purchased never downgraded); per-world content weeks w/ earned autonomy; site-events on sold sites; honest churn booking w/ no-resurrection |
| 2 | Partial/scaffold | Upsell (two frozen moments, no ongoing re-audit); renewal/churn (booking only — no offboarding/win-back); marketing refresh (mechanics exist, nothing establishes per client); 3 connectors `built:false`; sender-domain + booking absent from deploy lists; engagement-email→contact seam; billing reconciliation deliberately manual |
| 3 | Docs/prompts/prototypes only | Service packages as versioned/inheritable objects (genome layers — phase-brief language only); Vertical-as-Data; registrar-API domain automation |
| 4 | Missing | Client change-request intake + loop-closing notify; per-client monthly report (composed, scheduled, sent); per-site uptime/SSL watch (substrate DISCONNECTED, not absent); site content-refresh order; churn offboarding + win-back; ongoing upsell detection; client portal |
| 5 | Build internal | Nearly everything in §3: change-request object + form slice + classifier branch; report producer over existing ledgers + document studio; auto-created watch_url per sale; `site_refresh` order kind; churn mission; quarterly re-audit order; `service_packages` + `packageEstablishes()`; the enum + two deploy-list lines |
| 6 | External API | Already live: Netlify, Stripe, Resend, Twilio, Ayrshare, ScreenshotOne, Veo, Places/Serper. Genuinely new: Google Business Profile API (the `built:false` connector clients ask for first); registrar API (optional); uptime SaaS unnecessary (watch_url suffices) |
| 7 | Reusable Capability | Change-request queue, ledger-composed reporting, evidence-derived checklists, watch-on-asset, package-establishes-orders — all generalize to every service vertical (real estate, automation-only clients) |
| 8 | Domain Workshop | WEBSITE STRATEGY+CREATION (DEEP-ENVIRONMENT, §5); CLIENT-OPS bench (REUSABLE-FRAMEWORK, §6) |
| 9 | Mission | Site rebuilds, domain migrations, change-request arcs, churn offboarding, package upgrades — all fit the arc/approval spine today |
| 10 | Standing Order | client_hunt (exists), content_week (exists), invoice-chase (exists), instant first touch (exists); to establish: per-site watch, monthly report, site refresh, quarterly re-audit |
| 11 | Requires approval | Every pitch (manual forever), every publish to a paying client's live URL (today a confirm dialog — should be spine), site takedown, report send (until earned), package/price changes |
| 12 | Safe autonomous | Pay→auto-publish (proven, exact-bytes republish); site watches + metrics syncs (read-only); speed-to-lead (pre-authorized); content weeks after streak; report *composition* (send stays gated until earned) |
| 13 | Portfolio-level | The client card grid summing to: MRR + at-risk, unconnected-needed connectors, open change requests + SLA, sites DOWN/cert-expiring, reports sent/skipped, automations proposed-vs-active, churn events — all exception-only above T-10 |
| 14 | Breaks at 10/100/1k | T-ME: no-email dead-end, enum, deploy-list gaps, no report/watch/change-loop (survivable by operator heroics). T-10: heroics fail — no packages, no established orders, zombie sites on churn, upsell by memory. T-100: cohort rollout/versioning + reconciliation + policy engine (ARCH-CHANGE). T-1K: full control plane (doc 10); nothing normal ever seen |
| 15 | Mastery needs | Conversion craft across the funnel (encoded in prompts/gates; needs the outcome loop to compound); care-plan economics (report cadence, SLA norms — nowhere encoded); churn playbooks; per-client trust calibration (autonomy dial exists, per-client defaults don't); Google Business + local-SEO domain knowledge (absent) |

---

## Matrix rows

| Capability | Class | Evidence | Needed-at | Owner object | Note |
|---|---|---|---|---|---|
| Prospect→client funnel (end to end) | WORKING | [R06 §5] | T-ME | Standing Order + Mission | 🔌 the A− chain; three weak steps below |
| No-email prospect handling | PARTIAL | [R06 §5 ⚠] [R06 §15 #0] | T-ME | Capability | SMS substitute severed by enum |
| Rendered-DOM scrape (JS portals) | DOCUMENTED-ONLY | [R03 §11] | T-10 | Capability | thin profiles degrade demo quality |
| Demo outcome learning loop | MISSING | grep engine.ts: no outcome ref | T-10 | Standing Order | signals collected, never fed back |
| Fallback-spec critique pass | PARTIAL | engine.ts:266 — ai-source only | T-10 | Capability | fallback sites skip simulated owner |
| Pay → auto-publish | WORKING | [R13 §9.1] [R07 §2.5] | T-ME | Capability | 🔌 the zero-browser proof |
| Client-checkout + payment links | WORKING | [R13 §9.3] | T-ME | Capability | honest 503 when unconfigured |
| Close-won → engagement → client world | WORKING | [R05 §9.22] | T-ME | Mission | engagement-email→contact seam open [R03 §8] |
| Connections checklist (evidence-derived) | WORKING | [R07 §3.3] | T-ME | Capability | the per-client control-plane pattern |
| Google Business / calendar / esign connectors | PARTIAL | [R07 §3.3] built:false | T-10 | Capability | GBP is the first care-plan ask |
| connect-domain (DNS-verified, never MX) | WORKING | [R13 §5.9] | T-ME | Capability | 🔌 no registrar API (manual-by-client) |
| sender-domain + booking deploy-list absence | DISCONNECTED | [R13 §13.4] | T-ME | substrate | two one-line fixes |
| Per-client automations + automationReady gate | WORKING | [R03 §8] [R07 §3.3] | T-ME | Capability | 🔌 |
| Client billing reconciliation | MISSING | [R06 §6 ⚠] | T-100 | substrate | deliberate today |
| Client change-request intake + loop | MISSING | grep: no object/form/classifier branch | T-ME | Capability | the care plan's front door |
| Operator site refine → republish in place | WORKING | engine.ts:251–279; publishCore.verify | T-ME | Capability | coarse (whole-spec) + browser-bound |
| Section-level site edit | MISSING | engine.ts — directive regenerates all | T-10 | Workshop (deep) | needed for cheap small edits |
| Publish-to-paying-client behind the spine | PARTIAL | PreviewEngine.tsx:113 confirm dialog | T-10 | Mission | should be an approval kind |
| Per-client monthly report (composed + sent) | MISSING | report.ts is one owner-wide line | T-ME | Standing Order | the recurring proof of value |
| Uptime/SSL watch on sold sites | DISCONNECTED | watch_url exists; nothing creates per-site watches; grep uptime → 0 | T-ME | Standing Order | wiring, not building |
| Site content-refresh order | MISSING | no order touches published sites | T-10 | Standing Order | needs `site_refresh` kind |
| Client-world content weeks | WORKING | contentWeekRun per-world [R03 §6] | T-ME | Standing Order | 🔌 nothing establishes per client |
| Churn booking (no-resurrection) | WORKING | stripe-webhook:109–119 | T-ME | Capability | 🔌 honest MRR down |
| Churn offboarding (takedown/transfer/win-back) | MISSING | grep takedown/unpublish → 0; reactivate targets prospects | T-10 | Mission | zombie sites accumulate |
| Renewal-risk detection | MISSING | payment-fail is the only signal | T-10 | Standing Order | |
| Ongoing upsell re-audit of active clients | MISSING | detect.ts runs on prospect signals only | T-10 | Standing Order | expansion revenue by memory today |
| Upsell at pitch + point of sale | WORKING | WinClients.tsx:117; ClientBilling rung 3 | T-ME | Capability | signal-grounded, honest inventory |
| Service package as versioned object | MISSING + ARCH-CHANGE | grep: no package/care-plan noun | T-10 | substrate | seedForTier proves the seeding pattern |
| Package establishes orders at sale | MISSING | no sale→order wiring | T-10 | substrate | unblocks report/watch/refresh at once |
| Cohort package rollout/migration | MISSING + ARCH-CHANGE | [R03 §8] per-client only | T-100 | substrate | wait for control plane (doc 10) |
| Client portal | MISSING | grep portal → Stripe + hero variant only | T-100 | Workshop | not needed before T-100; email/forms suffice |
| Client-ops unified bench | PARTIAL | ClientBook + ClientBilling + Readiness split | T-10 | Workshop | REUSABLE-FRAMEWORK (§6) |
| Website creation deep surface | WORKING (as PreviewEngine) | src/pages/PreviewEngine.tsx + src/lib/preview | T-ME | Workshop | DEEP-ENVIRONMENT ruling (§5) |
