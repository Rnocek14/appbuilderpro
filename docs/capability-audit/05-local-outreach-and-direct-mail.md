# 05 — Local Outreach as a Managed Service, Email Campaigns, Inbox Extraction, Direct-Mail Fulfillment

*Phase 5.5 capability audit. Domain: selling outreach itself — running a CLIENT's local
outreach (email, SMS, direct mail, replies) as a recurring managed service, plus the three
engines underneath it: the email-campaign chain, inbox ingestion/extraction, and physical-mail
fulfillment. Rubric, formats, and evidence protocol: `_charter.md`. Evidence: [R03] §5–6 ·
[R06] §5/§9/§12/§15 · [R13] §7 (send-email family), §6.3 (drains), §10.11 (batchCore) ·
[R07] §2.6–2.7 · [R10] #10 (send_sms enum bug, CONFIRMED) · [R14] (garvis-level-10 specs #4–#5,
garvis-glory-sprint, garvis-studios-blueprint) · siblings [01] (inventory) and [03]
(real-estate, which audited the direct-mail chain front-to-back — §4 below audits only the
FULFILLMENT half and stays consistent with it) · direct greps of `src/` and
`supabase/functions/` cited inline.*

---

## 0. What this domain already is (the honest headline)

Outreach is the system's **A-grade pillar** ([R03 §12]) — *for the agency's own pitch funnel*.
`send-email` is "the strongest single piece in the system" [R03 §5]: one send path, approval
hash, kill switch, fail-closed suppression, CAN-SPAM, warmup, caps, placeholder 422 [R13 §7.1].
The whole scrape → demo → pitch → reply → close loop is verified end-to-end [R06 §5].

The managed-service question is different, and it splits on one code comment. In
`send-email/index.ts:147–148` the design is stated outright: **"identity is per-brand, safety
is per-human"** — sender name, from-address, and CAN-SPAM physical address resolve per client
world (`world_sender_identities`, verified per-brand domains), but the kill switch, daily cap,
warmup ramp, and timezone are one `outreach_settings` row per OPERATOR [R04 app_0023]. That is
exactly right for one human running several brands and exactly wrong for a service: ten
clients share one send budget, one warmup clock, one off switch. Add the three severed limbs —
the SMS rail dead at the DB enum [R10 #10], reporting that never reaches the client (verified
below), and no inbox beyond replies-to-own-sends [R06 §12] — and the honest verdict is: **a
superb single-tenant outreach machine, not yet a multi-tenant outreach service.** Direct mail
is further behind still: everything up to a print-ready PDF is real; everything after it is a
level-10 spec [R14 #5].

**Scope split with siblings.** [01] carries the neutral inventory rows for every capability
named here; [03] owns the direct-mail FRONT half (territory, data acquisition, enrichment,
dedup, economics, design) and its chain-1 verdict is treated as settled — §4 below picks up at
the finished design and audits only fulfillment; the agency's own website-pitch funnel belongs
to doc 04; the social rail to doc 06. Where a capability appears in two audits (SMS rail,
people model, CASS, Lob), the classifications are kept identical and the matrix rows share
names so the doc-13 aggregator dedupes cleanly.

---

## 1. Chain 1 — OUTREACH-AS-A-SERVICE for a client

### 1.0 The control: what the agency's own outreach proves, stage by stage

The revenue engine [R06 §5] is the measuring stick — each of its stages already closes for the
agency's OWN pitching. The service question is whether the same stage exists when the sender is
a CLIENT's brand and the beneficiary is the client's business:

| Agency-own stage [R06 §5] | Own status | Client-side counterpart | Client-side status |
|---|---|---|---|
| (a) DISCOVER — Places grid, national sweep, self-capped | WORKING 🔌 | Cold-audience building in the CLIENT's vertical | PARTIAL — engine generalized, output drains only into the agency's demo/pitch funnel (step 6 below) |
| (b) SCRAPE — fetch-url audit, tech fingerprint | WORKING | Enriching a client's prospect list | WORKING as machinery — reusable unchanged, unrouted |
| (c)–(d) BUILD/PUBLISH — demo sites | WORKING 🔌 | Campaign assets under the client's brand (boards, composer, brand kits) | WORKING — the marketing production rail is already per-world [R03 §6] |
| (e) PITCH — placeholder gate, review-before-send, one send path | WORKING 🔌 | Client batch/segment sends | WORKING 🔌 — but personalization drops from per-prospect AI drafting to token merge (step 8) |
| (f) SIGNALS — webhooks + live board | WORKING 🔌 | Per-client engagement + deliverability surface | PARTIAL — events recorded per brand; no per-client analytics view (chain 2 step 10) |
| (g) FOLLOW-UP — crons, drafts mint approvals | WORKING 🔌 | Same crons over client campaigns | WORKING 🔌 — but caps are per-OWNER, not per-client (step 10) |
| (h) REPLY — inbound, classify, draft, read in-app | WORKING 🔌 | Reply handling in the client's context | PARTIAL — world-scoped, operator-only; the client never sees it (step 11) |
| (i) CLAIM — inbound conversion event, never silent | WORKING 🔌 | Lead capture on client sites (site-events, speed-to-lead) | WORKING 🔌 — this piece is already genuinely multi-client |
| (j) CLOSE — close-won → subscription + invoice | WORKING | Attributing the CLIENT's closed business back to outreach | PARTIAL — ledger rows exist [R03 §8]; no report ever composes them for the client (step 13) |

The pattern the table exposes: **the machinery generalizes; the routing, scoping, and reporting
don't.** Nothing in the client column needs a new engine — every gap is a seam (routing
discovery output, scoping caps, surfacing replies, composing reports) on rails already proven
by the agency's own funnel.

### 1.1 The chain

*One row per step of running outreach FOR a client, end to end.*

| Step | Status | Evidence | Build/Buy | Owner object | Approval posture | Portfolio surface | Breaks at |
|---|---|---|---|---|---|---|---|
| 1. Client onboarding (engagement → world → connections checklist) | **WORKING** | client_engagements scope-derived intake + world genesis handoff [R03 §8]; per-client connections checklist with evidence-derived status [R07 §3.3] | done | Mission | approve (close-won) | Lens: onboarding status per client | Holds to T-100; checklist connectors `built:false` (Google Business, calendar) are honest gaps |
| 2. Client sending identity | **WORKING 🔌** | `world_sender_identities` per-brand from/company/physical address, resolved at send time (`send-email/index.ts:158–170`) [R03 §5, R13 §7.1] | done | substrate | none | — | Holds |
| 3. Client sending domain (SPF/DKIM/DMARC) | **WORKING 🔌 (deploy-gap)** | `sender-domain` registers the client domain with Resend, returns exact records, verifies [R13 §7.3]; **absent from every deploy list** [R13 §13.4], [01 DISCONNECTED #8] | done + add to deploy list | Capability | none | Control-plane: domain verification status per client | T-ME on a fresh environment (the function silently isn't there) |
| 4. Per-client safety posture (caps, warmup, kill switch) | **MISSING (deliberate design)** | "identity is per-brand, safety is per-human" (`send-email/index.ts:147–148`); daily cap + warmup + `outbound_enabled` + timezone all owner-global (`outreach_settings` one row/owner [R04]) | Build: move caps/warmup/kill to per-world scope (or add a per-world layer under the owner ceiling) | substrate | none (gates) | Control-plane: per-client send budget + warmup age | **T-10** — one client's batch eats another's cap; a new client's fresh domain gets no independent warmup ramp; the only kill switch stops everyone |
| 5. Audience: client warm-list import | **WORKING** | `customer_lists`/`customers` with anchor dates + `consent_basis` [R04 app_0076]; contacts carry `world_id` brand ownership [R04 app_0082] | done | Capability | none | Lens: list size/consent coverage per client | Holds to T-100 |
| 6. Audience: cold-list building for the CLIENT's vertical | **PARTIAL** | the generalized (niche × metro) discovery grid exists [R13 §8.1] but drains only into the AGENCY funnel (discovered_businesses → demo → pitch [R06 §5]); nothing routes a discovery run into a client's campaign audience; opportunity `kind` enum "still mural-biased" [R03 §4] | Build: discovery-run → client-world contact import path (+ consent/legal review — cold B2B email for a client is its own liability) | Capability | approve (a cold list is a liability) | Cohort: audience freshness per client | T-ME for the service promise; the machinery exists, the routing doesn't |
| 7. Sequence design | **PARTIAL** | sequence_step 0/1/2 hardcoded, max 2 bumps, fixed cadence (3 business days) [R13 §7.8, R04 app_0023]; composable drip flows are level-10 #4, unbuilt [R14] | Build: wave-4 flows (every send re-checks every gate — the spec's rule) | Capability | none (design) | Cohort: sequence versions across clients | T-10 — every client gets the same two bumps; nothing versions |
| 8. Personalization at scale | **PARTIAL** | placeholder gate 422 on `[YOU FILL]`/`[EDIT]` — templated text cannot reach a prospect [R13 §7.1, R03 §4]; merge tokens refuse loudly at compose time (`unknownTokens`, batchCore [R13 §10.11]); but per-recipient AI personalization exists only on the agency's own pitches (hunt pitch chain [R05 §9.18]) — client batches get token merge only | Build: judged per-recipient drafting under the batch approval | Capability | none (gate is fail-closed) | — | T-10 — token-merge personalization reads as mail-merge at client quality bars |
| 9. Send + batch drain | **WORKING 🔌** | ONE approval → snapshotted list → claimed per-recipient clock drain, crash-safe `sending` claim, per-recipient gate re-checks [R13 §10.11, §6.3] | done | Capability | approve (one card per batch) | Slate: pending batches across clients | ~10 recipients/15 min drain rate [R03 §5] — arithmetic fails around T-10 with real volumes |
| 10. Follow-up / reactivation / inbox-draft crons | **WORKING 🔌** | outreach-followups (incl. opened-3×-silent), outreach-reactivate (deterministic, capped 10/owner/sweep), inbox-draft — all mint approvals, never send alone [R13 §7.7–7.9] | done | Standing Order | approve → earned (followup/reactivation/inbox_reply classes eligible after 5 clean [R05 §6]) | Slate: today's due follow-ups across clients | Reactivation cap is per-OWNER not per-client — T-10 starves clients |
| 11. Reply handling into the client's context | **PARTIAL 🔌** | resend-inbound correlates to own sends, classifies sentiment, stops sequences [R13 §7.6]; replies land world-scoped in the operator's OpsInbox [R05 §9.24]; but the CLIENT never sees a reply, and correlation is own-sends-only — a prospect who replies to the client's real mailbox is invisible [R06 §12] | Build: client digest/portal surface; whole-inbox is chain 3's gap | Capability | approve (reply drafts) | Exception rule: positive reply unanswered > N hours, any client | T-10 — the operator is the only reader of ten clients' conversations |
| 12. SMS leg (follow-ups, review requests, reactivation by text) | **DISCONNECTED** | the entire built rail — send-sms executor, TCPA fail-closed gates, per-client from-numbers (`client_subscriptions.twilio_number`) [R13 §7.2, R07 §2.7] — is severed by the `approval_kind` enum: `'send_sms'` was never added, every SMS approval INSERT fails at the DB [R10 #10, R06 §15 #0]; blast radius in §5 | Build: one-line enum migration + A2P 10DLC ceremony per client (1–3 business days, documented `twilio-setup.md` [R07 §2.7]) | Capability | approve | Control-plane: A2P registration status per client | T-ME — the sold automation catalog promises SMS it cannot deliver |
| 13. Reporting to the client | **MISSING** | verified: `automation/report.ts` loads owner-scoped month numbers for the Automations PAGE (`src/pages/Automations.tsx:173` — "THE ROI LINE"); client console rollups are operator-facing [R05 §9.22–9.23]; nothing composes or delivers a report TO a client | Build: monthly per-client report artifact → send via the existing spine (the ledger rows all exist) | Standing Order | slate (batched monthly review) | Lens: report sent/opened per client | **T-ME** — a managed service that never reports is indistinguishable from one that does nothing |
| 14. TCPA / CAN-SPAM per client | **PARTIAL** | CAN-SPAM footer + physical address per brand (falls back to owner) [R13 §7.1]; RFC-8058 unsubscribe per send [R13 §7.4]; TCPA consent per contact fails closed, STOP honored [R13 §7.2]; but SMS quiet hours are specced only [R14 #5], suppression is owner-wide (defensible, but unexamined as policy), and no per-client consent audit view exists | Build: quiet hours; per-client consent/compliance view | Capability | none (gates) | Control-plane: complaint/bounce rate per client brand | T-100 — regulators and ESPs judge per-domain; the system can't show per-client posture |

**Chain verdict.** Steps 1–3, 5, 9–10 are genuinely multi-brand today — identity, domains, warm
audiences, batch sends, and the cadence crons all resolve per client world. The service breaks
on four fronts: **safety is single-tenant** (step 4 — a deliberate design that must be
re-decided at T-10), **the SMS half of the catalog is latent-dead** (step 12, one-line fix plus
per-client carrier ceremony), **nothing ever reports to the paying client** (step 13 — the
cheapest high-leverage build in this whole document; every number already exists as ledger
rows), and **cold-audience building for a client's vertical** has all its machinery pointed at
the agency's own funnel (step 6). None of these are architecture except step 4.

---

## 2. Chain 2 — EMAIL CAMPAIGN chain (segments → batches → results)

| Step | Status | Evidence | Build/Buy | Owner object | Approval posture | Portfolio surface | Breaks at |
|---|---|---|---|---|---|---|---|
| 1. Static segment definition | **WORKING** | segment snapshot into `outreach_batches` (one approval = one snapshotted list) [R04 app_0064, R13 §10.11]; `composeBatchRecipients` pre-excludes blocked contacts with named reasons — "the owner approves the honest reachable count" | done | Capability | approve | Slate: pending batches | Holds |
| 2. Behavioral segments (opened-not-replied, never-opened…) | **MISSING** | the substrate EXISTS — `outreach_events` (app_0081 [R04]) written by resend-webhook [R13 §7.5]; level-10 #4 specced the segment engine (with the honesty rule that `never_opened` requires sentCount ≥ minSends) and it was never built [R14]; the doc even predates its own table ("does not exist yet" — it does now) | Build: segment engine over the existing event log | Capability | none (compute) | Cohort: one segment recipe across clients | T-10 — hand-picked lists don't scale past a few clients |
| 3. Template library | **PARTIAL** | templates exist as scattered one-offs: `auto_first_touch` template [R04 app_0044], `automation_triggers.templates` [R04 app_0076], deterministic reactivation templates [R13 §7.9]; email-board artifacts serve as de-facto templates [R05 §9.4]; no versioned, reusable library | Build: template registry (data, not code — house pattern) | Workshop bench | none | Cohort rollout of template packs | T-10 |
| 4. Branded HTML shell | **MISSING** | plain-text/plain-HTML default; branded shell is level-10 #4, unbuilt [R14]; `body_html` column exists for screenshot pitches [R04 app_0101] | Build: wave 4 | Capability | none | — | T-10 — client-brand emails that look like plaintext undercut the retainer |
| 5. Batch approval + clock drain | **WORKING 🔌** | ONE human approval, worker re-verifies server-side every tick, drains through THE one send path with per-recipient re-checks [R05 §6 drain kinds, R13 §6.3] | done | Capability | approve | Slate | Drain rate (~10/15 min) — see chain 1 step 9 |
| 6. Warmup + caps + suppression + unsubscribe | **WORKING 🔌** | warmup ramp + timezone-aware daily cap re-checked per recipient at send time [R13 §7.1]; Svix-verified webhooks feed bounces/complaints to suppression [R13 §7.5]; RFC-8058 one-click, capability-URL unsubscribe [R13 §7.4] | done | substrate | none (gates) | Control-plane: bounce/complaint anomaly | Owner-global warmup/caps — breaks per chain 1 step 4 at T-10 |
| 7. A/B testing | **MISSING** | grep `ab_test\|abTest\|variantA\|subject_b` over src/ + supabase/ → zero hits; specced in level-10 #4 with the small-list guard ("an A/B over 8 people is theater") [R14]; sibling [01 §8] concurs | Build: subject A/B inside the batch drain (assignment at claim time keeps gates live) | Capability | none | Cohort: winning variants across clients | T-10 — without tests, "what works" never leaves the operator's head |
| 8. Drip flows (multi-step, composable, event-driven) | **DOCUMENTED-ONLY** | level-10 #4: flows drained by the clock "with every send re-checking every gate"; deliberately NOT Resend scheduled sends ("would freeze the gates at queue time") [R14]; only the fixed 2-bump cadence exists [R13 §7.8] | Build: wave 4 on the existing drain pattern | Standing Order | approve → earned | Slate | T-10 |
| 9. Campaign email leg from the composer | **PARTIAL (deliberate)** | marketing Publish email/`manual` channels end at a prefilled composer — "email needs a human-chosen audience" [R06 §9]; honest label, but the campaign chain's email leg is an operator handoff [01 DISCONNECTED #10] | Deliberate; revisit with segments (step 2) | Capability | approve | — | T-10 |
| 10. Deliverability analytics (per-batch honest rates) | **PARTIAL** | raw events + engagement stamps recorded [R04 app_0081]; batch stats exist (`computeBatchStats`, `batchStatsLine` [R13 §10.11]); no per-domain/per-client deliverability surface; level-10's honest-rates rule ("no opens recorded — open tracking may be off", never a fake 0%) unbuilt [R14] | Build: per-brand deliverability panel over existing rows | Capability | none | Control-plane: per-domain health | T-10 |

### 2.1 The throughput arithmetic (verified against the shipped gates)

The numbers in the code define what "campaigns as a service" can physically mean today.
`send-email/index.ts:219–226` (verified): the daily cap defaults to **25 sends/day** per
OWNER (`daily_send_cap ?? 25`), the warmup ramp allows `(daysIn + 1) × warmup_daily_step`
(default step 5) — and both are measured against the operator's single timezone midnight,
shared across every client brand. The batch drain moves ~10 recipients per 15-minute tick
[R03 §5]. The consequences for a service:

- A single client's 500-contact newsletter is **20 days of the entire owner-wide budget** at
  the default cap — or a deliberate cap raise that then applies to every brand at once.
- Two clients' batches interleave on one drain and one budget; there is no fairness,
  priority, or reservation concept anywhere in `batchCore`/the drain [R13 §10.11, §6.3].
- These are cold-outreach-calibrated numbers — correct and conservative for the agency's own
  pitching, structurally wrong for warm client lists (a consented 500-person list is not a
  deliverability risk; the gate can't tell the difference because consent basis never feeds
  the cap).

None of this is a defect at T-ME; all of it is the T-10 wall, and it is the same wall as
chain 1 step 4: safety scoped to the human, not the brand.

**Chain verdict.** The spine (segments-as-snapshots → one approval → gate-checked drain →
event log → suppression) is complete, crash-safe, and honest — batch email WORKS today 🔌. What
is missing is precisely the layer a client pays a retainer for: behavioral segments, flows, A/B,
branded shell, and per-client deliverability truth. All five are specced to an unusually high
standard in level-10 #4 [R14] and all five have their substrate tables already in place. This
is the corpus's clearest case of "the plan is written, the floor is poured, the rooms are not
framed."

---

## 3. Chain 3 — INBOX SCRAPING & CONTACT EXTRACTION

| Step | Status | Evidence | Build/Buy | Owner object | Approval posture | Portfolio surface | Breaks at |
|---|---|---|---|---|---|---|---|
| 1. Inbox connection (operator's or client's real mailbox) | **MISSING + EXT-REQUIRED** | only replies-to-own-sends + the forward-in alias exist — "whole-inbox awareness" is the named "senses" gap [R06 §12, R03 §5]; Gmail OAuth **deferred with reasons** (restricted scopes, CASA security assessment) in level-10 #5 [R14]; grep `imap\|gmail api` → zero real hits (verified) | Buy: Gmail API (accept the CASA ceremony), IMAP, or a Nylas-class aggregator | Capability | approve (mailbox access is the deepest grant there is) | Control-plane: connection health per mailbox | T-ME — portal leads, vendor mail, and client correspondence are all invisible |
| 2. Forward-in alias capture | **WORKING 🔌** | mail to `in-xxxxxx@` lands in `inbound_mail` via Resend inbound MX; unknown alias honestly ignored (`resend-inbound/index.ts:106–117`) [R13 §7.6, R07 §2.6] | done | Capability | none (inbound) | — | Holds as a workaround; requires human forwarding discipline |
| 3. Reply capture + threading (own sends) | **WORKING 🔌** | correlation by in-reply-to/references/from; sequence stopped; campaign flipped [R13 §7.6] | done | Capability | none | Slate: replied threads | Holds |
| 4. Classification | **PARTIAL** | sentiment only (positive/negative/neutral), 3-tier fallback (OpenAI → Lovable gateway → regex) [R13 §7.6]; plus explicit unsubscribe-intent regex → suppression (`resend-inbound/index.ts:167–174`); no intent taxonomy (booking request, complaint, invoice query, portal lead) | Build: intent classes feeding routed actions | Capability | none (classify) | Exception rule: low-confidence classifications surface | T-10 — sentiment alone can't route ten clients' mail |
| 5. Extraction rules (structured fields from mail bodies) | **MISSING** | verified: the forward-in path is a raw insert into `inbound_mail` — no parsing, no field extraction, no rules engine anywhere | Build: deterministic-first extraction with confidence gates (the house pattern: a low-confidence parse produces nothing) | Capability | slate (new-record proposals) | Cohort: rule packs per vertical | T-ME for the "inbox automation" pitch |
| 6. Portal-lead parsing (Zillow/Realtor/etc.) | **DOCUMENTED-ONLY** | level-10 #5: "a low-confidence parse stays plain mail, never an invented contact" [R14]; nothing in code; sibling [03 §5] concurs | Build: parser on the forward-in alias (substrate exists) | Capability | none (inbound) | Slate: new portal leads across clients | T-ME — this is most local businesses' #1 lead source |
| 7. Contact/lead record creation from inbound | **PARTIAL** | site-events leads create-or-link contacts ("never modifies an existing one — suppression sacred") [R13 §7.13]; claim-submit creates publish_requests [R13 §7.15]; but `inbound_mail` rows create NOTHING — no contact, no lead, no task | Build: extraction (step 5) → contact/lead proposals behind a slate | Capability | slate | Slate | T-ME |
| 8. The people model underneath | **PARTIAL + ARCH-CHANGE** | "six unreconciled people tables" debt [R03 §5]; two deliberate customer substrates (`contacts` vs `customers`/`customer_lists`) [R04 §two-substrates]; extraction lands where? — unanswerable until this reconciles | Build: unify (sibling [03 §5] carries the same row) | substrate | none | Lens: one person, one timeline, all clients | **T-10 ARCH-CHANGE** |
| 9. Reply drafting + approval gates | **WORKING 🔌** | inbox-draft nightly: drafts from thread ONLY, unknowns become `[YOU FILL]` holes, staged as PENDING approvals; auto-send only under `inbox_reply` grant; `draft_verdicts` kept-vs-rewritten feedback injected as a track record [R13 §7.7] | done | Standing Order | approve → earned | Slate: overnight drafts | Holds — the corpus's best learning loop |
| 10. Scheduling / recurring | **WORKING 🔌** | inbox-draft daily 12:45, followups 13:00, reactivate monthly — all on the 12-job heartbeat [R13 §2, R10 #11] | done | Standing Order | — | Control-plane: cron health (exists: Health board) | Holds 🔌 |
| 11. Logs / audit | **WORKING** | every send in `execution_runs` + `mind_events`; engagement in `outreach_events`; reply records + classifications persisted [R13 §7.5–7.6] | done | substrate | none | — | Holds |
| 12. Inbound mail → knowledge ingest | **MISSING** | `ingest-document` exists [R13 §8.6] but nothing bridges `inbound_mail` (attachments, forwarded docs) to it [01 §9] | Build: one bridge call behind a slate | Capability | slate | — | T-10 — forwarded contracts/briefs die in a table |

**Chain verdict.** The system hears only its own echo: replies to its own sends are handled
excellently (capture → classify → stop → draft → learn), and everything else that arrives by
email is either raw-stored (forward-in) or never arrives (no mailbox connection). "Inbox
extraction" as a sellable service is therefore MISSING at the front door (EXT-REQUIRED:
Gmail/IMAP/Nylas — a deliberate, reasoned deferral [R14 #5]) and MISSING at the parsing layer
(no extraction rules), while the back half — drafting, approvals, scheduling, logging, learning
— is already built and would serve a connected inbox unchanged. The forward-in alias +
portal-lead parser is the honest T-ME wedge that needs no external ceremony.

---

## 4. Chain 4 — DIRECT-MAIL FULFILLMENT (the back half)

*Sibling [03 §1] audited the full 16-step farming chain (list acquisition → economics → design
→ print → attribution) and its verdict stands: "steps 5–8 are the real, verified core… the
chain becomes a business at the moment steps 11–13 close through Lob." This section audits only
the FULFILLMENT half — from finished design to delivered piece to attributed response — as a
client-agnostic capability, and defers list-side steps (acquisition, enrichment, dedup,
economics) entirely to [03].*

| Step | Status | Evidence | Build/Buy | Owner object | Approval posture | Portfolio surface | Breaks at |
|---|---|---|---|---|---|---|---|
| 1. Design-to-print artifact (dimension/bleed fidelity) | **PARTIAL** | compileMailer: print-ready 6×9, USPS sizing/bleed/address-zone encoded, real vault photos, visible `[EDIT-ME]` holes [R05 §9.24, R14 glory-sprint]; but the artifact is browser-rendered HTML — the print-DPI **server** render with preview===render parity is level-10 #1, specced only ("`[EDIT:]` holes must print visibly, never be dropped") [R14]; render-design exists but `DESIGN_SIZES` are social sizes [R13 §8.9, 03 §1 step 8] | Build: extend render-design (satori→resvg) to print DPI + bleed — fully specced | Workshop bench → Artifact | approve (the design is the money) | — | T-ME — every design currently ends in a browser print dialog; a vendor API needs a true PDF/PNG artifact |
| 2. Variable-data merge (per-piece content) | **MISSING** | address-block merge is real and fail-closed ("Nothing prints on a guess" [03 §1 step 9, R05 §9.11]); per-piece variable content + per-household QR tokens exist only in level-10 #5 [R14] | Build: token merge into the print render (reuse batchCore's `unknownTokens` refusal pattern [R13 §10.11]) | Capability | none (compose gate) | — | T-10 — same-piece-for-everyone caps response rates |
| 3. Address validation (CASS) | **MISSING + EXT-REQUIRED** | `farm.ts:38` names its own gap ("without pretending to be a CASS engine"); specced "fail-closed exactly like email suppression" [R14 #5, 03 §1 step 10] | Buy: Lob Address Verification / Smarty / Melissa | Capability | none (fail-closed gate) | Control-plane: undeliverable rate per client | T-ME — postage burns on unvalidated addresses |
| 4. Cost estimate + `send_mail` approval kind | **MISSING** | no `send_mail` in `approval_kind` (enum history: only +send_batch/+send_for_signature/+content_week [R04 §enum-growth, R10 #10]); the spec is unusually complete: cost shown BEFORE approval, "the approved estimate as a hard ceiling the executor enforces" [R14 #5] | Build: enum + executor with cost ceiling (the mail twin of send-email) | Mission executor | approve (money leaves) | Slate: pending drops across clients | T-ME |
| 5. Provider handoff (print + mail) | **DOCUMENTED-ONLY + EXT-REQUIRED** | shipped form is print-it-yourself BY DESIGN ("Garvis doesn't mail for you — you print or send to a vendor, then log what went out" [R14 glory-sprint]); "MVP = download print-ready PDF + CSV for a print vendor; later = Lob API" [R14 studios-blueprint]; the manual-vs-Lob tension is a live "decide, don't drift" item [R10 #6]; grep `lob\|postgrid` → zero code hits (verified) | Buy: **Lob** (specced; per-piece print+postage pricing, no volume floor at entry — validate current rates at build) or PostGrid/Click2Mail as fallback bids | Capability behind the send_mail executor | approve → earned (after clean record) | Control-plane: mail spend anomaly per client | T-ME — [03] calls this "the single highest-leverage missing integration in the domain"; hand-printing for ten clients is not a business |
| 6. Delivery webhooks (piece-level status) | **DOCUMENTED-ONLY + EXT-REQUIRED** | Lob webhooks "with monotonic status ranks" designed on paper only [R14 #5, 03 §1 step 13]; the house already has the exact receiving pattern to copy (Svix-verified resend-webhook + monotonic DocuSign status maps [R13 §7.5, R07 §2.8]) | Buy: Lob webhooks | substrate (mail_events) + Standing Order | none | Exception rule: only failed/returned pieces surface | T-10 |
| 7. Returned-mail learning | **DOCUMENTED-ONLY** | "evidence-based fail-closed learning… NOT do_not_mail, which stays a human opt-out list" [R14 #5] — the spec's sharpest distinction (machine evidence vs human opt-out) | Build after step 6 | Standing Order | none | Cohort: list-quality decay per source | T-10 |
| 8. Response attribution — QR/URL via site-events | **WORKING 🔌 (per-batch, not per-piece)** | QR `?src=postcard` + `mail_batches.batch_token` [R04 app_0063] → site-events pixel (write-only channel token) → Results-by-channel, "every number a count of rows" [R14 glory-sprint, R05 §9.26, 03 §1 step 14]; per-HOUSEHOLD tokens are level-10 #5 spec only | Build: per-piece tokens (table + QR variant) | ledger | none | Lens: response rate per drop per client | Batch-level holds to T-100; household-level MISSING at T-ME |
| 9. Call attribution (tracking numbers) | **MISSING + EXT-REQUIRED** | only missed-call text-back exists on the one shared/client number [R07 §2.7, R13 §7.11]; no per-campaign number provisioning; [03 §1 step 14] concurs | Buy: Twilio number pool or CallRail | Capability | approve (numbers cost monthly) | Lens: calls per campaign | T-10 — mail responses are mostly calls; unattributed calls make the report (step 13, chain 1) unwritable |
| 10. Responder follow-up (email/SMS after a scan or call) | **PARTIAL 🔌** | scan → lead → instant first touch (pre-authorized, deterministic) + followup crons, all gated [R13 §7.13, R03 §5]; the SMS leg is severed by the enum (§5); call-responders aren't captured at all (step 9) | Build: enum fix; call capture | Standing Order | earned (speed-to-lead is the pre-authorized proof) | Exception: responder untouched > N min | T-ME for SMS; email path holds |

**Chain verdict.** Fulfillment is the mirror image of chain 2: there the floor exists and the
rooms are missing; here the *furniture* exists (design, merge-refusal patterns, webhook
receivers, attribution pixel, approval spine — every needed pattern is already built and
verified somewhere else in the house) and the floor — a print-DPI artifact, a `send_mail`
approval kind, and one vendor API — was never poured. The level-10 #5 spec [R14] is effectively
an implementation plan: CASS fail-closed like suppression, cost ceiling in the approval hash,
monotonic webhook ranks like DocuSign. Nothing about it is research; all of it is EXT-REQUIRED
plumbing plus one enum value. Consistent with [03]: until then the shipped truth is
"print-ready PDF + CSV + an honest log of what YOU mailed."

### 4.1 The fulfillment cost model (why the approval design matters more than the vendor)

- **Today's cost model is invisible to the system.** The operator pays retail print + postage
  out-of-band and logs the batch after the fact (`logMailBatch` — "the ledger counts real
  outreach" [R05 §9.4]). No cost row, no estimate, no ceiling; mail spend cannot appear on any
  scorecard or anomaly check because it never enters the database as money.
- **The specced model inverts this**: cost computed and shown BEFORE approval, and "the
  approved estimate as a hard ceiling the executor enforces" [R14 #5] — hash-bound into the
  approval payload exactly like content-week judge scores [R14 #2], so a drop can never cost
  more than the human saw. This is the precondition for any `earned` posture on mail: autonomy
  over irreversible physical spend is only safe when the ceiling is structural.
- **Vendor economics** (from-knowledge; verify current rates at build): Lob and PostGrid both
  price per piece with print + postage bundled and volume tiers, no equipment or minimum-run
  capital — which is what makes T-ME viable (a 200-piece EDDM-floor drop [03 §1 step 6] is
  purchasable without a print shop relationship). The margin story for the managed service is
  the retainer over per-piece cost, so the per-client **spend-anomaly check** matters from the
  first drop — and the in-house template for it already exists (`ads-watch` daily anomaly
  watchdog [R13 §9.11]).
- **Choice note for doc 11**: Lob is the specced primary (webhooks + verification designed
  against its API shapes [R14 #5]); PostGrid/Click2Mail are the competitive bids; the CASS
  step can ride the same vendor (Lob verify) or a dedicated one (Smarty/Melissa) — [03 §8 Q6]
  lists the same candidates; keep the two audits' choices reconciled in doc 11.

---

## 5. The `send_sms` enum bug — blast radius (CONFIRMED [R10 #10])

The fact: `approval_kind` is created in `app_0022_execution.sql:17–21` and later gains only
`send_batch`, `send_for_signature`, `content_week` — never `'send_sms'`. Yet
`send-sms/index.ts:36` requires `approval.kind === 'send_sms'` and `execution.ts:13` types it.
**Every INSERT of an SMS approval fails at the DB**, so the entire approval-gated SMS rail is
latent-dead; the pure-core verify suites (#63–#66) never touch a live enum, which is how it
shipped [R10 #10, R06 §15 #0].

**Severed (everything that stages a `send_sms` approval):**
- The client trigger engine's SMS channel — standing-worker stages "PENDING send_email/send_sms
  approvals" at fire time [R13 §6.3]; every SMS-channel automation a client buys
  (`automation_triggers.channel` [R04 app_0106]) fails at the moment it first fires.
- SMS follow-up/reactivation for outreach and for direct-mail responders (chain 4 step 10).
- Per-client from-number routing (`resolveSmsFrom`, `client_subscriptions.twilio_number`
  [R05 §9.24, R07 §2.7]) — built, unreachable.
- Downstream: ROI stats shown at point of sale [R03 §8] can promise SMS automations that then
  silently never fire — a trust wound, not just a bug.

**Surviving (paths that deliberately bypass the approval-SMS executor):**
- Missed-call text-back — voice-inbound calls Twilio directly ("transactional; deliberately not
  via send-sms") [R13 §7.11].
- Booking confirmations/reminders — transactional `bookingNotify` [R13 §7.12].

**Fix:** the one-line enum migration os-blueprint Phase 0 already lists [R10 #10] — plus the
honest note that fixing the enum only makes SMS *possible*; per-client A2P 10DLC registration
(1–3 business days each [R07 §2.7]) remains the operational gate at every client onboarding.

---

## 5b. This domain's DISCONNECTED register (built-but-severed, confirmed and added)

Feeding [01]'s register — the charter's central disease, as it manifests here. Items 1–2
confirm [01]'s rows from this domain's angle; 3–6 are additions this audit surfaces:

| # | Built thing | Not connected to | One-line repair shape | Evidence |
|---|---|---|---|---|
| 1 | The entire SMS rail (executor, TCPA core, per-client from-numbers, trigger channel) | The `approval_kind` enum | One-line migration (§5) — confirms [01 #1] | [R10 #10] |
| 2 | `sender-domain` (and `booking`) edge functions | Every deploy list — fresh environments silently lack per-brand deliverability | Add to deploy lists — confirms [01 #7–8] | [R13 §13.4] |
| 3 | Generalized (niche × metro) discovery engine | Any CLIENT's campaign audience — output drains only into the agency's own demo/pitch funnel | Route a discovery run into a client world's contacts behind an approve gate | [R13 §8.1] [R06 §5] |
| 4 | `outreach_events` engagement log (written on every Resend event) | Any segment engine — the behavioral-segmentation substrate records and is never read for targeting | Build the specced segment engine over the existing rows | [R04 app_0081] [R14 #4] |
| 5 | The complete client-ROI ledger (trigger_fires, approvals, sends, opens, bookings, invoices) | The CLIENT — composed only as an operator-facing page line, never delivered | Monthly report artifact → existing send spine (chain 1 step 13) | report.ts / Automations.tsx:173 (verified) |
| 6 | Per-brand identity resolution (`world_sender_identities`, per-brand CAN-SPAM address) | Per-brand SAFETY — caps/warmup/kill remain one row per operator by declared design | Per-world gate layer under an owner ceiling (chain 1 step 4) | send-email/index.ts:147–148 [R04] |

---

## 5c. Tier readiness and closure order

What must close, in dependency order, for this domain to be true at each tier — every item
grounded in a chain row above; no new claims:

| Order | Gap to close | Tier it unblocks | Why this order |
|---|---|---|---|
| 1 | `send_sms` enum migration | T-ME | One line; un-severs the sold automation catalog's SMS half (§5) before any client conversation |
| 2 | Deploy-list fix (sender-domain, booking) | T-ME | Zero-cost; a fresh environment must actually contain the per-brand rail [R13 §13.4] |
| 3 | Client monthly report (compose from existing ledger rows → send via spine) | T-ME | The retainer's proof-of-life; all data exists (chain 1 step 13) |
| 4 | Print-DPI render → `send_mail` kind + cost-ceiling executor → Lob + CASS | T-ME (mail revenue) | Strict dependency chain: no vendor call without a true artifact, no spend without the ceiling (chain 4 steps 1→4→5, 3) |
| 5 | Per-world safety gates (caps/warmup/kill) + per-client cron budgets | T-10 | The single-tenant design decision that must be reversed before client #2's volume collides with client #1's (chain 1 steps 4, 10) |
| 6 | Wave-4 email engine: behavioral segments → flows → A/B → branded shell | T-10 | All four sit on tables already recording (chain 2 steps 2, 4, 7, 8); order within the wave is the spec's own [R14 #4] |
| 7 | Extraction rules + portal-lead parser on the forward-in alias | T-ME wedge / T-10 full | The no-external-ceremony inbox wedge (chain 3 steps 5–6); full inbox needs item 8 |
| 8 | Mailbox connection (Gmail/IMAP/Nylas) + people-model reconciliation | T-10 | The two structural moves: EXT-REQUIRED front door and the ARCH-CHANGE substrate extraction lands on (chain 3 steps 1, 8) |

---

## 6. Proposed Workshop: OUTREACH WORKSHOP (charter 14-field spec)

- **Job**: run a client's complete local outreach operation — warm-list campaigns, sequences,
  reactivation, SMS touches, direct-mail drops, reply handling — under the client's brand from
  the client's world, and put a monthly results report in the client's hands.
- **Knowledge required**: deliverability craft (warmup, caps, suppression — encoded in
  send-email [R13 §7.1]), CAN-SPAM/TCPA/A2P mechanics (encoded in gates + `twilio-setup.md`
  [R07 §2.7]; quiet hours specced only [R14 #5]), sequence/cadence craft (encoded in the cron
  prompts [R13 §7.8]), the client's vertical language (verticals.ts packs [R05 §9.14]).
- **Source data required**: client world + brand kit, `world_sender_identities` +
  `sender_domains`, contacts/`customer_lists` with consent state, `suppression`,
  `outreach_events` engagement, `replies` + `draft_verdicts`, `trigger_fires`, mail-batch log.
- **Direct-manipulation surface**: the nine-bench grammar carries it — email board, contacts,
  batch composer, Queue slate, results panel; the one NEW pane is a per-client outreach console
  (send budget, warmup age, domain health, consent coverage) over gates that are owner-global
  today (chain 1 step 4).
- **AI's role**: pitch/follow-up/reply drafting under the copy judge ≥8 and the placeholder
  gate; sentiment/intent classification; never audience selection, never consent decisions,
  never a send.
- **Tools**: queuePitch, outreachBatchRun/composeBatchRecipients, sequence crons, inbox-draft,
  sms.ts core, triggers engine, sender-domain, (new) segment engine + flow runner.
- **External integrations**: Resend (live 🔌), Twilio (built; enum-severed + per-client A2P),
  Ayrshare adjacent; MISSING: per-client cold-list source, Gmail/IMAP (chain 3), call tracking.
- **Evaluation/critique criteria**: placeholder 422 + suppression fail-closed (structural);
  judge ≥8 on drafts; per-brand bounce/complaint thresholds; draft kept-rate; A/B only above
  the small-list guard [R14 #4].
- **Output Artifacts**: sequences/flows (as data), sent-campaign records, per-client monthly
  report, domain-health record, consent ledger views.
- **Missions it creates**: "Stand up outreach for client X" (identity → domain → A2P → warm
  import → first sequence), "Q3 reactivation drop for client Y."
- **Standing Orders it establishes**: followups, reactivation, inbox-draft (all exist 🔌),
  drip-flow drain (new), monthly client-report cron (new).
- **Outcome signals it learns from**: opens/clicks/replies/bounces per brand
  (`outreach_events`), kept-vs-rewritten verdicts, trigger-fire → booking/invoice attribution
  rows, unsubscribe/complaint rates.
- **Expert controls**: per-client kill switch + caps (must be built), consent/suppression
  views, autonomy dial per class (followup/reactivation/inbox_reply — "cold pitches stay
  manual forever" [R05 §6]), sequence version pinning.
- **Fast-path (AI-assisted)**: "onboard Joe's HVAC for outreach" → identity + DNS records +
  A2P checklist + warm-list import + first-sequence draft, delivered as one review slate.
- **Verdict**: **REUSABLE-FRAMEWORK.** Nothing here needs a surface the grammar lacks — boards,
  queues, and lenses cover it. What it needs is substrate surgery (per-world safety gates), one
  enum value, and the wave-4 email engine that is already specced as data-shaped work [R14 #4].

## 7. Proposed Workshop: INBOX-AUTOMATION WORKSHOP (charter 14-field spec)

- **Job**: turn inboxes — own-send replies, forward-in mail, and eventually connected client
  mailboxes — into structured work: classified messages, extracted contacts/leads/tasks,
  drafted replies, filed documents, all behind approval gates.
- **Knowledge required**: intent taxonomies per vertical, portal-lead formats
  (Zillow/Realtor et al. [R14 #5]), consent/suppression law (STOP/unsubscribe semantics —
  encoded), extraction-confidence discipline (the house rule: a low-confidence parse produces
  nothing).
- **Source data required**: `replies`, `inbound_mail`, `outreach_messages` thread context,
  `contacts` + consent state, `draft_verdicts`; future: Gmail/IMAP/Nylas feed.
- **Direct-manipulation surface**: OpsInbox stream (exists [R05 §9.24]) plus a rules bench —
  define an extraction rule, test it against historical mail, watch precision before arming.
  The board/queue grammar carries both.
- **AI's role**: classify sentiment + intent; extract structured fields WITH confidence scores
  (below threshold → plain mail, never an invented contact [R14 #5]); draft replies from the
  thread only, unknowns as `[YOU FILL]` holes [R13 §7.7]. Never creates a record unilaterally.
- **Tools**: resend-inbound, inbox-draft, inboxRun, (new) extraction-rule engine, (new)
  inbound_mail → ingest-document bridge, suppression.
- **External integrations**: Resend inbound MX (live 🔌); MISSING + EXT-REQUIRED: Gmail API
  (restricted scopes + CASA assessment — the documented reason it was deferred [R14 #5]), IMAP,
  or a Nylas-class aggregator; per-client mailbox OAuth at T-10.
- **Evaluation/critique criteria**: classification accuracy vs operator corrections; draft
  kept-rate (`draft_verdicts` — already a live loop); extraction precision over recall (a wrong
  contact is worse than a missed one); zero unsolicited record creation.
- **Output Artifacts**: classified message records, proposed contact/lead/task rows, reply
  drafts, filed documents in the world's knowledge.
- **Missions it creates**: "Connect client X's inbox" (alias setup today; OAuth ceremony when
  built), "Build the portal-lead rule pack for real-estate clients."
- **Standing Orders it establishes**: nightly inbox-draft (exists 🔌), extraction sweep over
  new `inbound_mail` (new), ingest bridge for attachments (new).
- **Outcome signals it learns from**: kept-vs-rewritten verdicts, operator corrections to
  classifications/extractions, reply→booking/close attribution.
- **Expert controls**: rule editor with dry-run, per-sender mute, approval gate on every
  outbound and every new record (slate), retention policy per mailbox.
- **Fast-path (AI-assisted)**: forward one email → proposed classification + extracted fields +
  a suggested standing rule ("mail like this becomes a lead"), approved in one card.
- **Verdict**: **REUSABLE-FRAMEWORK.** The stream + rules + queue shape fits the existing
  grammar; the binding constraint is not a surface but the front door (mailbox access,
  EXT-REQUIRED) and the missing extraction layer — both Capability work over the OpsInbox that
  already exists.

---

## 8. The fifteen questions

| # | Question | Answer for this domain |
|---|---|---|
| 1 | Exists-working | THE one send path + per-brand identities/domains 🔌, batch segment sends with crash-safe drain 🔌, followup/opened-3×-silent/reactivation/inbox-draft crons 🔌, Svix webhooks → suppression + RFC-8058 unsubscribe 🔌, reply capture/classify/stop 🔌, forward-in alias 🔌, OpsInbox, missed-call text-back 🔌, QR/site-events batch attribution 🔌, client onboarding + warm lists + trigger engine (email) 🔌, print-ready postcard compiler + mail log |
| 2 | Partial/scaffold | Per-client safety posture (owner-global by design), cold-audience routing for clients, sequence depth (2 fixed bumps), personalization (token merge only), reply visibility for the client, template library, deliverability analytics, classification (sentiment only), inbound record creation, people model (ARCH-CHANGE), design-to-print (browser render, no print-DPI server artifact), responder follow-up (SMS severed) |
| 3 | Docs/prompts/prototypes only | Level-10 #4 email engine (behavioral segments, flows, A/B, branded shell), level-10 #5 mail fulfillment (Lob, CASS, cost ceilings, mail webhooks, returned-mail learning, per-household QR, portal-lead parsing), SMS quiet hours, drip flows [R14] |
| 4 | Missing | Client reporting (verified — operator-facing ROI line only), A/B testing (grep zero), behavioral segment engine (table exists, engine doesn't), extraction rules, inbox connection, `send_mail` approval kind, CASS, provider handoff, delivery webhooks, call tracking, inbound→knowledge bridge |
| 5 | Build internal | `'send_sms'` enum migration (one line), per-world safety gates, client report cron (all rows exist), segment engine + flows + A/B over existing tables, print-DPI render (specced), `send_mail` executor with cost ceiling, extraction rules + portal-lead parser on the forward-in alias, inbound_mail→ingest bridge, sender-domain/booking deploy-list fix |
| 6 | External API | Lob (or PostGrid) for fulfillment + verification, Smarty/Melissa as CASS alternates, Gmail API/IMAP/Nylas for inbox, Twilio number pool or CallRail for call attribution; already live: Resend, Twilio (core), Stripe |
| 7 | Reusable Capability | The send path + gates, batch drain pattern, webhook-receiver pattern (Svix/monotonic ranks — reusable for Lob), suppression/consent ledgers, draft-verdict learning loop, QR attribution — all channel- and vertical-agnostic |
| 8 | Domain Workshop | OUTREACH WORKSHOP (§6, REUSABLE-FRAMEWORK) + INBOX-AUTOMATION WORKSHOP (§7, REUSABLE-FRAMEWORK); direct mail's surface belongs to the real-estate/marketing workshops [03 §6] with the fulfillment executor as shared Capability |
| 9 | Mission | "Stand up outreach for client X," "Q3 farm drop," "Connect client X's inbox," each an approval-gated arc on the existing spine |
| 10 | Standing Order | Followups/reactivation/inbox-draft (exist 🔌), drip-flow drain, monthly client report, extraction sweep, mail-status reconcile — all fit the standing-order + drain pattern [R13 §6.3] |
| 11 | Requires approval | Every send/mail/SMS (house invariant, structurally enforced); cold lists for clients; mailbox access grants; any fulfillment spend (specced hard cost ceiling); new-record creation from extraction (slate) |
| 12 | Safe autonomous | Speed-to-lead first touch (pre-authorized, deterministic — the existing proof); followup/reactivation/inbox_reply after earned streaks (revocable, exists); suppression/validation gates (fail-closed internal); webhook ingestion, metrics reads, report *composition* (not delivery) |
| 13 | Portfolio-level | Per-client send budget/warmup/domain-health lens; batch + drop + draft slates across clients; complaint/bounce/undeliverable/spend anomaly checks; A2P + mailbox connection status; cohort sequence/template rollout with versioning |
| 14 | Breaks at 10/100/1k | T-ME: SMS enum, client reporting, inbox front door, mail fulfillment. T-10: owner-global caps/warmup/kill, drain throughput (~10/15 min), per-owner reactivation caps, six people tables (ARCH-CHANGE), hand-printed mail, un-versioned sequences. T-100: per-domain compliance posture, cohort rollouts, policy engine. T-1K: nothing without the fleet control plane (doc 10) |
| 15 | Mastery needs | Deliverability + carrier compliance craft (encoded in gates; needs per-client instrumentation), extraction-precision discipline (rule exists as doctrine, not code), mail-response economics (attribution ledger exists; drop-over-drop learning doesn't), and the feedback loops that already work here — draft_verdicts and earned autonomy — extended from the operator's outreach to every client's |

---

## Matrix rows

| Capability | Class | Evidence | Needed-at | Owner object | Note |
|---|---|---|---|---|---|
| Per-brand sender identity + domains | WORKING | [R13 §7.1, §7.3] | T-ME | substrate | 🔌; sender-domain in no deploy list [R13 §13.4] |
| Per-client safety gates (caps/warmup/kill per world) | MISSING | send-email/index.ts:147–148 "safety is per-human"; outreach_settings one row/owner [R04] | T-10 | substrate | deliberate single-tenant design; must be re-decided |
| Cold-audience routing for a client's vertical | PARTIAL | discovery grid exists [R13 §8.1]; drains only into the agency funnel [R06 §5] | T-ME | Capability | machinery built, routing absent |
| Sequence/flow designer (beyond 2 fixed bumps) | DOCUMENTED-ONLY | [R13 §7.8]; level-10 #4 flows [R14] | T-10 | Capability | gates-live-at-send rule already specced |
| Per-recipient personalization in batches | PARTIAL | token merge + unknownTokens refusal [R13 §10.11]; AI drafting only on agency pitches [R05 §9.18] | T-10 | Capability | |
| Batch drain throughput | PARTIAL | ~10 recipients/15 min [R03 §5] | T-10 | substrate | arithmetic fails at client volumes |
| Client-facing outreach/automation report | MISSING | report.ts owner-scoped; Automations.tsx ROI line operator-only (verified) | T-ME | Standing Order | all numbers exist as ledger rows; cheapest big win |
| Reply-to-client visibility (digest/portal) | MISSING | OpsInbox is operator-only [R05 §9.24] | T-10 | Capability | |
| SMS rail (approval-gated) | DISCONNECTED | approval_kind lacks 'send_sms' [R10 #10, R06 §15 #0] | T-ME | Capability | one-line migration; A2P per client remains the operational gate |
| SMS quiet hours | DOCUMENTED-ONLY | level-10 #5 [R14] | T-10 | Capability | TCPA exposure without it |
| Behavioral segment engine | MISSING | outreach_events exists [R04 app_0081]; engine specced only [R14 #4] | T-10 | Capability | substrate already recorded by resend-webhook |
| Email A/B testing | MISSING | grep zero hits (verified); small-list guard specced [R14 #4] | T-10 | Capability | |
| Branded HTML email shell | MISSING | level-10 #4 [R14]; plain default | T-10 | Capability | |
| Email template library (versioned) | PARTIAL | scattered templates: first-touch, triggers, reactivation [R04, R13 §7.9] | T-10 | Workshop bench | data-shaped work |
| Per-brand deliverability analytics | PARTIAL | events + batch stats exist [R13 §10.11]; no per-domain surface | T-10 | Capability | honest-rates rule specced [R14 #4] |
| Warmup/caps/suppression/unsubscribe gates | WORKING | [R13 §7.1, §7.4–7.5] | T-ME | substrate | 🔌; owner-global scope carried above |
| Inbox connection (Gmail/IMAP/Nylas) | MISSING + EXT-REQUIRED | [R06 §12]; Gmail deferred with reasons [R14 #5]; grep zero | T-ME | Capability | the "senses" gap; forward-in is the wedge |
| Forward-in alias capture | WORKING | resend-inbound alias path [R13 §7.6] | T-ME | Capability | 🔌 raw store only |
| Inbound extraction rules engine | MISSING | inbound_mail is a raw insert (verified, resend-inbound/index.ts:117) | T-ME | Capability | precision-over-recall doctrine already written |
| Intent classification (beyond sentiment) | PARTIAL | 3-tier sentiment + unsubscribe regex only [R13 §7.6] | T-10 | Capability | |
| Portal-lead parsing | DOCUMENTED-ONLY | level-10 #5 [R14]; also carried by [03 §5] | T-ME | Capability | dedupe with 03's row |
| Contact/lead creation from inbound mail | PARTIAL | site-events leads create contacts [R13 §7.13]; inbound_mail creates nothing | T-ME | Capability | slate-gated proposals |
| Inbound mail → knowledge ingest bridge | MISSING | no bridge to ingest-document [R13 §8.6], [01 §9] | T-10 | Capability | |
| Overnight reply drafts + verdict learning | WORKING | inbox-draft + draft_verdicts [R13 §7.7] | T-ME | Standing Order | 🔌 the corpus's best learning loop |
| Print-DPI parity render (bleed-true artifact) | DOCUMENTED-ONLY | level-10 #1 [R14]; render-design social sizes only [R13 §8.9] | T-ME | Workshop bench | prerequisite for any vendor API |
| Variable-data mail merge (per-piece) | MISSING | address block only [03 §1 step 9]; per-household tokens specced [R14 #5] | T-10 | Capability | consistent with [03] |
| send_mail approval kind + cost-ceiling executor | MISSING | no enum value [R04, R10 #10]; ceiling specced [R14 #5] | T-ME | Mission executor | the mail twin of send-email |
| Mail fulfillment provider handoff | DOCUMENTED-ONLY + EXT-REQUIRED | print-it-yourself shipped [R03 §6, R10 #6]; Lob spec [R14 #5]; grep zero | T-ME | Capability | Lob primary, PostGrid alternate — matches [03] |
| Mail delivery webhooks + returned-mail learning | DOCUMENTED-ONLY + EXT-REQUIRED | monotonic ranks specced [R14 #5]; receiver patterns exist to copy [R13 §7.5] | T-10 | Standing Order | matches [03] |
| CASS address validation | MISSING + EXT-REQUIRED | farm.ts:38 self-declared [03 §1 step 10] | T-ME | Capability | Smarty/Melissa/Lob verify — matches [03] |
| Per-piece QR/URL attribution | PARTIAL | batch-level ?src=postcard + batch_token WORKING 🔌 [R04 app_0063, R05 §9.26]; household-level specced only [R14 #5] | T-10 | ledger | |
| Call tracking numbers per campaign | MISSING + EXT-REQUIRED | missed-call text-back only [R13 §7.11, R07 §2.7] | T-10 | Capability | Twilio pool or CallRail — matches [03] |
| Speed-to-lead responder touch | WORKING | site-events instant first touch [R13 §7.13] | T-ME | Standing Order | 🔌 pre-authorized, deterministic |
| Per-owner cron caps → per-client caps (reactivation etc.) | MISSING | 10/owner/sweep [R13 §7.9] | T-10 | substrate | fairness across clients |
| Unified people model | PARTIAL + ARCH-CHANGE | six unreconciled people tables [R03 §5]; two customer substrates [R04] | T-10 | substrate | shared row with [01]/[03] |
