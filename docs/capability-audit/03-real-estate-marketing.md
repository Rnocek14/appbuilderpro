# 03 — Real-Estate Agent Marketing: The "Mom" World, Audited for Real Performance

*Phase 5.5 capability audit. Domain: a working residential real-estate agent's marketing
operation — territory farming, listing marketing, agent brand, transaction paperwork, and
lead/CRM operations. This is the audit's canonical deep case: the system was consciously built
around this operator ("Mom Real Estate Marketing" is `MOM_REAL_ESTATE_TEMPLATE` — "the first
territory" — in `src/lib/garvis/workweb.ts:195`), so nowhere else is the gap between "organizes
the work beautifully" and "performs the work" more measurable. Rubric, formats, and evidence
protocol: `_charter.md`. Evidence: [R03] §5–6/§8 · [R05] §9.3–9.6, §9.11, §9.14, §9.24, §9.26
· [R06] §5–6, §15 · [R07] §2.7–2.13 · [R13] §8.9–8.10, §9.5–9.9 · [R14] (garvis-level-10,
garvis-studios-blueprint, garvis-glory-sprint) · direct greps of `src/` cited inline.*

---

## 0. What this domain already is (the honest headline)

This is the system's **most deliberately built vertical**. It is not a hypothetical: there is a
one-click front door (`QuickStartRealEstate.tsx` — instantiates the whole territory with zero AI
keys), a born-with expert playbook layer (`expertise.ts` + `verticals.ts` real_estate overlay:
CMA methodology, Fair Housing/HUD digital-ad compliance verified mid-2026 [R05 §9.14]), a real
MLS data rail (`mls-sync`, real RESO OData [R13 §9.7]), a genuinely excellent pure direct-mail
core (`farm.ts` / `mailer.ts` — CASS-aware honesty, USPS geometry, fail-closed suppression
[R05 §9.11]), and the first campaign play (`plays.ts` `lakefront-seller`).

And yet the central charter test — *can it PERFORM the work?* — splits cleanly down one line:
**everything up to the moment something must touch the physical world or a third-party data
estate is real; everything past that moment is the operator's hands or a plan.** No map. No
homeowner data source. No print vendor. No address validation. No delivery status. No call
tracking. The postcard is print-it-yourself **by design** ([R03 §6]: "Direct mail (postcards)
via print vendor | PLANNED"), and the full Lob fulfillment spec exists only as level-10 wave 5
[R14] — "the largest block of specced-but-unbuilt work in the corpus."

---

## 1. Chain 1 — TERRITORY DIRECT-MAIL FARMING (the user's 16-step chain)

The operator's own end-to-end sequence, verbatim, one row per step. This is the charter's
template chain.

| Step | Status | Evidence | Build/Buy | Owner object | Approval posture | Portfolio surface | Breaks at |
|---|---|---|---|---|---|---|---|
| 1. Territory selection on a map | **MISSING + EXT-REQUIRED** | grep `mapbox\|maplibre\|leaflet\|openlayers` over `src/` → zero map components (only two incidental "google maps URL" string matches); `farm_territories` is a named row where "zips are notes, not magic" (app_0063) | Buy: MapLibre GL (OSS) or Mapbox GL for the canvas; parcel/boundary + demographic data from Regrid (parcels), ATTOM, or free Census TIGER/ACS | Workshop (Territory/Map — §7) | none (internal) | Lens: territories across all agent clients on one map | T-ME — the step does not exist; today "territory" = a CSV she bought |
| 2. Prospect discovery (owner list) | **PARTIAL + EXT-REQUIRED** | CSV import only: `farmRun.ts` "imports can only ADD" [R05 §9.11]; no data-acquisition integration anywhere ([R07] has no property-data provider) | Buy: county assessor/recorder exports, ATTOM, First American DataTree, CoreLogic, PropertyRadar, or a title-company farm package | Capability (list acquisition) feeding the Workshop | approve (data purchases cost money) | Control-plane check: per-client data-source freshness | T-ME for automation; the manual buy-a-CSV path works at T-ME only |
| 3. Data source + permission check | **PARTIAL** | `do_not_mail` suppression is "sacred… select-first-insert so a re-add never resets the original," fail-closed, fully paginated [R05 §9.11]; but no data-license/provenance tracking, no DNC scrub for phone follow-up (TCPA gating exists only at SMS send: `sms.ts` [R05 §9.24]); privacy/source-terms review is nowhere | Build: source-provenance + license terms on every imported list; Buy: DNC scrub API if phone touches are added | substrate (list provenance columns) + Standing Order (re-scrub) | approve (a bad list is a liability) | Exception rule: any list without recorded provenance blocks merge | T-10 — one operator can remember where a list came from; ten clients' lists cannot be un-tracked |
| 4. Enrichment (absentee/equity/tenure) | **PARTIAL + EXT-REQUIRED** | `isAbsentee` computed honestly from source columns; "a source with no mailing-address columns means absentee ownership is UNKNOWABLE (never '0 absentee')" (`farm.ts`); no enrichment API exists | Buy: ATTOM / Estated / DataTree property+deed enrichment | Capability | slate (enrichment spends per row) | Lens: enrichment coverage % per territory | T-ME — equity/tenure targeting is table stakes for farm segmentation and is absent |
| 5. Dedup | **WORKING** | `householdKey` normalized-address dedupe + `duplicatesInFile` + cross-import select-first-insert (`farm.ts`, verified `farm.verify.ts`) | Build (done) | Capability | none | — | Holds to T-1K (pure function; keyed per owner) |
| 6. Segmentation | **PARTIAL** | `farmMath` turnover screen (≥8% strong / ≥6% viable / ≥5% thin / else "don't farm"), EDDM 200-piece minimum, break-even-in-listings (`farm.ts:266–302`); absentee split exists; but no behavioral/equity/tenure segments — level-10 behavioral segments are email-side and unbuilt [R14 #4] | Build on top of step-4 enrichment | Workshop bench | none | Cohort rollout: one segmentation recipe applied across clients | T-10 — hand-picked segments per client don't version or roll out |
| 7. Campaign ideation | **WORKING** | AI campaign generator (3-stage, research-grounded, verifier) + campaign composer [R03 §6]; `plays.ts` `lakefront-seller` (research→angle→creative→sequence→landing→social→video); postcardBoard concepts [R05 §9.4, §9.6] | Build (done) | Workshop | none (drafts) | Lens: campaign calendar across clients | Holds to T-100 (playbooks-as-data); T-100 wants play versioning — MISSING |
| 8. Postcard design | **WORKING** | `mailer.ts` compileMailer: print-ready 6×9, USPS sizing/bleed/address-zone encoded, real vault photos, `[EDIT-ME]` holes visible [R05 §9.24]; `enforceListingHonesty` strips AI images off listing claims [R05 §9.4]; server render exists for brand cards (`render-design`, satori→PNG [R13 §8.9]) but `DESIGN_SIZES` are social sizes — print-DPI postcard PNG is level-10 #1, specced only [R14] | Build: extend render-design to print DPI (specced) | Workshop bench → Artifact | approve (the design is the money) | — | T-10 — per-client brand kits exist; print-DPI parity render missing means every design ends in a browser print dialog |
| 9. Variable-data personalization | **PARTIAL → MISSING at scale** | Address-block merge is real and fail-closed (`partitionMailable`: "Nothing prints on a guess," `farm.ts:231–242`; "Current Resident" convention; `farmCsv` export); but per-piece variable CONTENT (name/equity/tenure-specific copy, per-household QR tokens) exists only in the level-10 Lob spec [R14 #5] | Build: variable-data merge into the print render; per-household token table | Capability | none (internal merge) | — | T-ME for anything beyond the address block |
| 10. Address validation (CASS) | **MISSING + EXT-REQUIRED** | `farm.ts:38`: normalization "without pretending to be a CASS engine" — the code names its own gap; level-10 specs "CASS verification fail-closed exactly like email suppression" [R14 #5] | Buy: Lob Address Verification, Smarty, or Melissa (USPS CASS-certified) | Capability (a validation gate before merge) | none (fail-closed gate) | Control-plane: undeliverable-rate per client | T-ME — every drop currently risks postage on unvalidated addresses |
| 11. Approval | **WORKING (manual model) / MISSING (fulfillment kind)** | The spine is the house invariant [R03 §2]; direct-mail-send launch area is "queued for approval before anything mails" (`workweb.ts:209`); but no `send_mail` approval kind or executor exists — the operator printing IS the approval today; `logMailBatch` records the act [R05 §9.4] | Build: `send_mail` approval kind + cost-ceiling executor (fully specced: "the approved estimate as a hard ceiling the executor enforces" [R14 #5]) | Mission step on the spine | approve (money leaves) | Slate: all clients' pending drops on one daily card | T-10 — ten clients hand-printing is not a business |
| 12. Print/mail provider handoff | **MISSING + EXT-REQUIRED** | "Garvis never mails — the operator prints and logs the batch" [R05 §9.4]; [R03 §6] direct-mail-via-vendor = PLANNED; [R14] studios-blueprint: "MVP = download print-ready PDF + CSV for a print vendor; later = Lob API" — the MVP is what shipped | Buy: **Lob** (specced, webhooks + status ranks designed) or PostGrid / Click2Mail | Capability behind the `send_mail` executor | approve → earned (after clean record) | Control-plane: spend anomaly per client | T-ME — this is the single highest-leverage missing integration in the domain |
| 13. Delivery status | **MISSING + EXT-REQUIRED** | Nothing receives mail events; Lob webhooks "with monotonic status ranks" are designed on paper only [R14 #5] | Buy: Lob webhooks (or USPS Informed Visibility) | substrate (mail_events table) + Standing Order (reconcile) | none | Exception rule: surface only failed/returned pieces | T-ME (no data at any scale) |
| 14. Response attribution | **PARTIAL 🔌 + EXT-REQUIRED (calls)** | QR `?src=postcard` attribution is real: `mailer.ts:182,200` + site-events pixel (app_0103) + Results-by-channel "every number a count of rows" [R14 glory-sprint, R05 §9.26]; call tracking: Twilio voice-inbound exists but only as missed-call text-back [R07 §2.7] — no per-campaign tracking numbers | Build: per-territory QR tokens; Buy: Twilio per-campaign numbers (or CallRail) for call attribution | Capability + ledger | none | Lens: response rate per territory per client | QR path holds to T-100; call attribution MISSING at T-ME |
| 15. Follow-up | **PARTIAL 🔌** | Responders who scan → site-events lead → speed-to-lead instant first touch (pre-authorized) + outreach-followups cron, all approval-gated [R03 §5]; direct-mail-follow-up loop area seeded (`workweb.ts:210`); **but SMS rail is latent-dead** (`approval_kind` enum never gains `'send_sms'` — every SMS approval insert fails at the DB [R06 §15 #0]) and phone-call tasks are manual CRM notes | Build: one-line enum migration (SMS); call-task cadences | Mission + Standing Order | approve → earned | Slate: today's due follow-ups across clients | T-10 — follow-up cadences exist per contact, not per campaign cohort |
| 16. Outcome learning | **PARTIAL** | `logMailBatch` "so the ledger counts real outreach" [R05 §9.4]; resultsRun honest per-channel counts [R05 §9.26]; but `farmMath` inputs stay manual, returned-mail learning is specced-only ("evidence-based fail-closed learning… NOT do_not_mail" [R14 #5]), and no drop-over-drop response model exists | Build: mail-cohort outcomes feeding farmMath + the mind's decision ledger (which itself closes outcomes only manually [R06 §8]) | ledger + Standing Order | none | Cohort compare: which creative/territory wins across clients | T-10 — learning that lives in one operator's head doesn't transfer to client #2 |

**Chain verdict.** Steps 5–8 are the real, verified core — arguably best-in-corpus honesty
engineering. Steps 1–4 and 10–13 are where the chain leaves the codebase: the front (map +
data) and the back (validation + fulfillment + delivery) are both EXT-REQUIRED and both fully
*designed* in level-10 without a line of code. The shipped product is precisely: **"import the
list you bought, and we will produce a mailable, suppressed, deduped, USPS-correct PDF+CSV for
the print shop, then honestly record what you did."** That is a T-ME tool. The chain becomes a
business at the moment steps 11–13 close through Lob (or PostGrid) behind a `send_mail`
approval with the specced cost ceiling.

---

## 2. Chain 2 — LISTING MARKETING (one listing → the whole set → leads)

| Step | Status | Evidence | Build/Buy | Owner object | Approval posture | Portfolio surface | Breaks at |
|---|---|---|---|---|---|---|---|
| MLS sync | **WORKING-manual 🔌** | `mls-sync` real RESO Web API OData client: probe-before-save, incremental `$filter` paging, sealed per-user creds; **manual button, no cron; one feed per operator** [R13 §9.7, R03 §8] | Build: put it on the heartbeat; multi-feed per owner for T-10 | Capability + Standing Order (sync) | none (read) | Control-plane: feed staleness per client | T-10 — "one feed per operator" is a hard schema/design limit when clients span MLSs |
| Market stats | **WORKING** | `mlsStats.ts` — "every number computed from synced rows; the model narrates, never computes"; thin data → null with a reason | Build (done) | Capability | none | Lens: market snapshot per client territory | Holds while the feed syncs |
| Listing content set | **WORKING** | `campaignCore.ts` — "one listing → the WHOLE marketing set in one pure function": postcard + per-platform posts + email; every number a string the operator typed; missing facts → `[EDIT]` + warnings [R05 §9.6]; `canGenerateImage()` false for listing types — "a listing card must show the real home" [R05 §9.5] | Build (done); auto-fill from `mls_listings` rows is the missing seam (composer inputs are typed, not pulled from the synced feed) | Workshop | approve (public claims) | — | T-10 — retyping listing facts the DB already holds |
| Social publish | **WORKING 🔌** | approval → `social-publish` (Ayrshare, 9 platforms, per-brand keys fail-closed) → `social-sync` metrics [R13 §9.8–9.9, R03 §6] | done | Mission | approve → earned | Slate: pending posts across clients | Holds to T-100 (per-brand key resolution exists) |
| Listing video | **PARTIAL-manual 🔌** | storyboard → Shotstack render real but "grade C: real but hands-on" [R03 §7]; "a beat with no photo renders a visible SHOOT direction, never a fake frame" [R05 §9.5]; reels engine = dead schema [R06 §15 #2]; TTS/captions/music specced only [R14 #6] | Build: level-10 wave 6 | Workshop bench | approve | — | T-ME for anything unattended |
| Landing page | **WORKING** | preview/bespoke site engine + publish-preview + re-hosted photos [R03 §4]; buildBrief "lead form stores (never sends)" [R05 §9.27] | done | Capability | approve (publish) | Lens: live pages per client | Holds to T-100 |
| Open house | **PARTIAL** | `timelines.ts` listing template carries "First open house" + "Follow up with every showing" as dated steps that can mint reminders; `booking` rail exists for appointments 🔌 [R03 §8]; but no open-house sign-in capture surface | Build: sign-in page variant of the booking/lead-capture rail (small) | Mission | none | — | T-ME — sign-in sheets are paper today |
| Lead capture | **WORKING 🔌** | site-events pixel + claim-submit + OpsInbox one stream [R06 §12] | done | Capability | none (inbound) | Slate: new leads across clients | Holds |
| Follow-up | **PARTIAL 🔌** | speed-to-lead instant first touch (the one zero-touch email, all gates) [R03 §5]; followups/reactivation crons approval-gated; SMS latent-dead (enum bug); no whole-inbox awareness [R06 §12] | Build: enum fix; Buy: none | Standing Order | earned (speed-to-lead is pre-authorized) | Exception rule: lead waiting >N min | T-10 fine; T-100 needs the policy engine |

**Chain verdict.** This is the domain's strongest chain — WORKING end-to-end for one operator
with keys set, with two seams: the MLS feed never turns itself (manual button, no cron), and
the synced `mls_listings` rows never flow into `campaignCore` (the operator retypes price/beds/
baths that the database already knows — a DISCONNECTED seam in charter terms: both halves
built, unwired).

---

## 3. Chain 3 — AGENT BRAND & CONTENT (the always-on presence)

| Step | Status | Evidence | Build/Buy | Owner object | Approval posture | Portfolio surface | Breaks at |
|---|---|---|---|---|---|---|---|
| Brand vault | **WORKING** | Brand area born with the world (`workweb.ts:201` — "@properties identity"); brand kits on artifacts [R05 §9.27] | done | substrate | none | — | Holds |
| Logo/visual identity | **WORKING (honest-partial)** | brandBoard AI logo concepts, "a starting point, not final or trademarked art" [R05 §9.4]; render-design brand cards carry no AI disclosure by ruling [R13 §8.9] | done | Workshop bench | none | — | Holds |
| Voice + compliance | **WORKING (as data)** | socialBoard voice loaded from world's most recent *posted* row — "so one business's voice doesn't bleed into another's" [R05 §9.4]; verticals.ts real_estate overlay: Fair Housing/HUD ad-distribution rules, verified mid-2026 [R05 §9.14]; level-10 learned style card = specced only [R14 #7] | Build: voice-exemplar retrieval (wave 7) | Capability | none | Cohort: one compliance pack updated once, inherited by all RE clients | T-100 — compliance notes are static strings; no update mechanism when law changes |
| Content weeks | **WORKING 🔌** | producer → ONE approval card → drain → auto_mode after 3 clean human approvals, revocable; tamper-evident pieces_hash [R05 §9.6, R03 §6] — **the system's one earned-autonomy loop, and it lives in this domain** | done | Standing Order | earned | Slate: this week's content across clients | T-100 — per-client streaks don't aggregate into cohort trust |
| Newsletter | **PARTIAL 🔌** | email-newsletter loop area seeded; segment `send_batch` approval → clock-drained sends real [R05 §9.24]; but no branded HTML shell, no behavioral segments, no drip flows (level-10 #4 unbuilt) [R14] | Build: wave 4 | Standing Order | approve | Slate | T-10 |
| Social profiles/metrics | **WORKING 🔌** | Ayrshare 9 networks per-brand; social-sync every 6h, metrics nullable-honest [R13 §9.9] | done | Capability | none (read) | Lens: engagement per client | Holds to T-100 |

---

## 4. Chain 4 — PAPERWORK (listing agreements, disclosures, transaction timelines)

| Step | Status | Evidence | Build/Buy | Owner object | Approval posture | Portfolio surface | Breaks at |
|---|---|---|---|---|---|---|---|
| Template from sample | **WORKING** | sample → `{{token}}` template, fields persisted (app_0093) [R03 §8] | done | Capability | none | — | Holds |
| Merge + honesty gate | **WORKING** | merge with visible [YOU FILL] holes → refuse-unsendable [R06 §6] | done | Capability | none | — | Holds |
| E-sign send + tracking | **WORKING 🔌 (sandbox default)** | docusign-send (owner-JWT only — "a human approves every envelope"), HMAC fail-closed webhook, monotonic status ranks, signed-PDF filed to the world (app_0099) [R13 §9.5–9.6, R07 §2.8]; **sandbox default: "signatures there are NOT legally binding"** — production needs DocuSign go-live review | done (flip env after review) | Mission | approve (always, by design) | Control-plane: envelope status per client | T-10 — per-client e-sign connector is `built:false` SCAFFOLDED [R03 §8] |
| Auto-populate from records | **MISSING (the back half)** | "upload → auto-template → auto-populate from client records → trigger-send" middle declared missing; filing exists, middle doesn't [R03 §8, R06 §6 ⛔] | Build | Capability | approve | — | T-ME — every envelope is hand-filled today |
| Transaction timeline | **WORKING (conventions)** | `timelines.ts` listing/purchase anchor+offset checklists, "offsets are conventions, not law," dated steps mint reminders [R05 §9.26] | done | Mission | none | Slate: deadlines across transactions | T-100 — no per-state/per-brokerage template variants |

---

## 5. Chain 5 — LEADS / CRM (the relationship spine)

| Step | Status | Evidence | Build/Buy | Owner object | Approval posture | Portfolio surface | Breaks at |
|---|---|---|---|---|---|---|---|
| Contacts CRM | **WORKING (debt-laden)** | stages, notes, activity timeline [R03 §5]; but "six unreconciled people tables" is the named debt | Build: reconcile the people model | substrate | none | Lens: pipeline per client | **T-10 ARCH-CHANGE** — six people tables cannot carry ten clients' books |
| Portal leads (Zillow/Realtor) | **DOCUMENTED-ONLY + EXT-REQUIRED** | level-10 #5: portal-lead email parsing, "a low-confidence parse stays plain mail, never an invented contact" [R14]; nothing in code; whole-inbox IMAP also missing [R06 §12] | Build parser on forward-in alias (exists) or Buy: Follow Up Boss API | Capability | none (inbound) | Slate: new portal leads | T-ME — portal leads are most agents' #1 source |
| Instant first touch | **WORKING 🔌** | speed-to-lead: deterministic template, all gates, pre-authorized opt-in [R03 §5] | done | Standing Order | earned | Exception: untouched lead | Holds |
| Call/SMS rail | **PARTIAL 🔌 (SMS latent-dead)** | missed-call text-back real (signature-validated) [R03 §5]; SMS approvals fail at the DB (enum bug, one-line fix) [R06 §15 #0]; no AI receptionist (PLANNED) | Build: enum migration; A2P 10DLC ceremony documented (`twilio-setup.md`) | Capability | approve | — | T-ME until the enum lands |
| Nurture cadences | **PARTIAL 🔌** | trigger engine (window guard, once-only, consent+suppression, channel-aware) is real [R03 §8]; drip FLOWS (multi-step composable) are level-10 #4, unbuilt | Build: wave 4 | Standing Order | approve → earned | Cohort rollout of cadence packs | T-10 |
| Close → money | **WORKING** | closeWonRun: campaign→won CAS-guarded, contact→customer, subscription + Stripe link + invoice [R05 §9.26] | done | Mission | approve | Lens: MRR per client | Holds |

---

## 6. Proposed Workshop: REAL-ESTATE MARKETING WORKSHOP (charter 14-field spec)

*The striking fact: this Workshop ~80% exists as data already — `MOM_REAL_ESTATE_TEMPLATE` +
`expertise.ts` seed packs + `verticals.ts` real_estate overlay + `plays.ts` ARE this spec's
skeleton. What follows is the spec that closes it.*

- **Job**: run one agent's complete marketing operation — farm drops, listing launches, weekly
  content, newsletter, nurture — from one chartered world, at a professional's bar.
- **Knowledge required**: farm economics (turnover screens, EDDM rules — encoded in `farmMath`),
  CMA framing, Fair Housing/HUD ad rules (encoded in verticals.ts), listing-photo honesty rules
  (encoded in imagegen gates), local market conventions (from MLS rows + operator intake).
- **Source data required**: MLS feed (`mls_listings` via mls-sync), the owner list (imported;
  future: property-data API), brand vault, contacts + consent state, do_not_mail, site-events +
  send/open/reply signals, mail-batch log.
- **Direct-manipulation surface**: the existing nine-bench Work-Web grammar — postcard board,
  social board, email board, campaign composer, FarmPanel, MarketDataPanel, timelines. The
  postcard needs the print-DPI parity render (level-10 #1) so what's manipulated is what prints.
- **AI's role**: campaign strategy + copy drafting (3-stage generator, board-copy judge ≥8),
  market narration over computed stats (never computes), reply drafting; never numbers, never
  listing images, never sends.
- **Tools**: compileMailer, campaignCore, farmMath/partitionMailable, mlsStats, storyboard,
  queueSocialPost, outreachBatch, triggers, timelines, logMailBatch.
- **External integrations**: MLS RESO (live 🔌), Ayrshare (live 🔌), Resend (live 🔌), Twilio
  (partial 🔌), DocuSign (live 🔌 sandbox), **Lob/PostGrid (missing)**, **CASS validation
  (missing)**, **property-data enrichment (missing)**, per-campaign tracking numbers (missing).
- **Evaluation/critique criteria**: board-copy judge score ≥8 fail-closed; enforceListingHonesty;
  disclosureGate on AI media; compliance overlay flags; farmMath verdict as a go/no-go gate;
  cost-ceiling check on any fulfillment approval.
- **Output Artifacts**: print-ready postcard PDF/PNG + mail CSV, listing content set, posts,
  emails/newsletter, landing page, storyboard/video, market snapshot, transaction timeline.
- **Missions it creates**: "Launch listing X," "Q3 farm drop," "Win the expireds of ZIP Y" —
  each an approval-gated arc on the spine.
- **Standing Orders it establishes**: content_week (exists), mls-sync-on-the-clock (missing
  cron), newsletter monthly, farm drop cadence per territory, nurture cadences, social-sync.
- **Outcome signals it learns from**: QR/site-events attribution, send/open/reply events,
  social_post_metrics, mail batch → response → appointment → closing ledger, returned mail
  (future), kept-vs-rewritten draft verdicts.
- **Expert controls**: do_not_mail management, consent/suppression views, farm go/no-go
  override, compliance-flag review, autonomy dial (content weeks), cost ceilings per drop.
- **Fast-path (AI-assisted)**: "new listing at 123 Shore Dr" → pull the MLS row → campaignCore
  full set pre-filled → one review pass → one approval slate (posts + email + postcard + page).
- **Verdict**: **REUSABLE-FRAMEWORK.** The nine-bench grammar demonstrably carries this — the
  mom template already expresses the whole operation as archetypes/flavors. What's missing is
  not a surface; it's three integrations (Lob, CASS, property data), two wiring seams
  (MLS→composer, MLS cron), and one enum migration.

## 7. Proposed Workshop: TERRITORY / MAP WORKSHOP

- **Job**: choose, size, and manage geographic farm territories visually — draw the boundary,
  see the parcels, run the economics, claim the territory, watch it respond over years.
- **Knowledge required**: parcel/boundary semantics, farm economics (farmMath), absentee/equity
  overlays, EDDM carrier-route mechanics, competitor-presence awareness.
- **Source data required**: base map tiles; parcel polygons (Regrid or county GIS); Census
  TIGER/ACS demographics (free); property attributes (ATTOM/DataTree); her own `mail_recipients`
  + response history rendered as map layers.
- **Direct-manipulation surface**: **a real map canvas** — polygon/carrier-route draw,
  parcel-level choropleth (turnover, absentee, tenure), territory compare, drop-history playback.
- **AI's role**: territory scoring narration over computed layers ("this ZIP's turnover is 8.2%
  from 214 MLS closes"), suggesting candidate boundaries; never inventing a parcel or a number.
- **Tools**: draw/edit/split territory, run farmMath per polygon, export list from polygon (once
  data exists), assign creative cadence per territory.
- **External integrations**: MapLibre GL (OSS, no key) or Mapbox GL; Regrid parcels; Census
  TIGER/ACS; ATTOM/DataTree; geocoding (Mapbox/Nominatim/Smarty).
- **Evaluation/critique criteria**: farmMath verdict; overlap detection between territories;
  data-freshness honesty (a stale layer says so — house rule).
- **Output Artifacts**: territory definition (polygon + roster), farm P&L projection, the
  mailing list itself.
- **Missions it creates**: "Establish the Lake Geneva lakefront farm" (list buy → validate →
  first drop).
- **Standing Orders it establishes**: quarterly turnover re-score per territory; list refresh.
- **Outcome signals it learns from**: response/appointment/closing rates per territory per drop,
  fed back into the score.
- **Expert controls**: manual boundary override, exclude-parcel, per-territory budget caps.
- **Fast-path**: "farm the streets around my last three sales" → auto-drawn candidate polygon +
  economics → operator adjusts and confirms.
- **Verdict**: **DEEP-ENVIRONMENT.** The nine-bench grammar has no spatial canvas and cannot
  supply one — polygon drawing, tiled geodata rendering, and choropleth interaction are a
  specialized surface (the charter's explicit "do NOT force mapping… into one canvas" case).
  Everything BEHIND the map (farmMath, rosters, suppression) reuses the existing substrate
  unchanged. Needed-at: honestly T-ME for the operator's stated workflow, but buildable last —
  the CSV-import path bypasses it while Lob/CASS/data are the revenue-blocking gaps.

---

## 8. The fifteen questions

| # | Question | Answer for this domain |
|---|---|---|
| 1 | Exists-working | Farm pure core (dedup/suppression/economics/CSV), 6×9 mailer + QR attribution, campaignCore listing set, MLS sync (manual 🔌) + mlsStats, social rail 🔌, content weeks w/ earned autonomy 🔌, e-sign front half 🔌, speed-to-lead 🔌, timelines, close-won |
| 2 | Partial/scaffold | Segmentation (no enrichment), variable-data (address block only), attribution (QR yes, calls no), follow-up (SMS latent-dead), DocuSign back half, newsletter (no shell/flows), CRM (six people tables), MLS→composer wiring, video (manual) |
| 3 | Docs/prompts/prototypes only | The ENTIRE fulfillment spine: Lob + CASS + cost ceilings + mail webhooks + returned-mail learning + per-household QR tokens + portal-lead parsing + CRM-vs-Follow-Up-Boss + drip flows (level-10 waves 3–6 [R14]) |
| 4 | Missing | Map/territory UI (grep-confirmed zero), property-data acquisition, address validation, print handoff, delivery status, call tracking, open-house capture, list provenance/licensing |
| 5 | Build internal | send_mail approval kind + executor, SMS enum migration (one line), MLS cron + MLS→campaignCore seam, variable-data merge, print-DPI render, portal-lead parser, people-table reconciliation |
| 6 | External API | Lob or PostGrid (fulfillment + verify), Smarty/Melissa (CASS), ATTOM/DataTree/Regrid/Census (property + parcel + demographic), MapLibre/Mapbox (map), Twilio numbers (call tracking); already live: RESO MLS, Ayrshare, Resend, Twilio, DocuSign, Stripe |
| 7 | Reusable Capability | Dedup/suppression gate, address validation gate (once built), QR attribution, mail fulfillment executor, enrichment — all channel-agnostic beyond real estate |
| 8 | Domain Workshop | Real-Estate Marketing Workshop (REUSABLE-FRAMEWORK, §6) + Territory/Map Workshop (DEEP-ENVIRONMENT, §7) |
| 9 | Mission | Listing launches, farm drops, expired campaigns, transaction timelines — all fit the arc/approval spine today |
| 10 | Standing Order | content_week (exists), MLS sync, newsletter, drop cadence, nurture, quarterly territory re-score |
| 11 | Requires approval | Every send/mail/envelope/publish (house invariant); data purchases; any fulfillment spend (specced hard cost ceiling) |
| 12 | Safe autonomous | Content weeks after earned streak (exists, revocable); speed-to-lead (pre-authorized); MLS/social/metrics syncs (read-only); dedup/validation gates (fail-closed internal) |
| 13 | Portfolio-level | Territory lens across agent clients, drop slate, feed-staleness + undeliverable-rate + spend-anomaly checks, cohort creative comparison, one compliance pack inherited by all RE clients |
| 14 | Breaks at 10/100/1k | T-ME: fulfillment/validation/data/map absent. T-10: hand-printing, six people tables (ARCH-CHANGE), one-MLS-feed-per-operator, per-client license tracking. T-100: play/cadence versioning, static compliance packs, per-client trust not aggregating. T-1K: nothing here survives without control plane (doc 10) |
| 15 | Mastery needs | Farm economics (encoded), Fair Housing (encoded, needs update loop), CASS/EDDM mechanics (partially encoded), parcel-data literacy (absent), response-rate feedback loops (ledger exists, learning loop doesn't close) |

---

## Matrix rows

| Capability | Class | Evidence | Needed-at | Owner object | Note |
|---|---|---|---|---|---|
| Territory map UI | MISSING + EXT-REQUIRED | grep src/: no map lib; farm_territories = named rows only (app_0063) | T-ME | Workshop (deep) | MapLibre/Mapbox + Regrid/Census; charter's canonical deep-environment case |
| Homeowner/property data acquisition | MISSING + EXT-REQUIRED | no provider in [R07]; CSV import only [R05 §9.11] | T-ME | Capability | ATTOM / DataTree / county records / PropertyRadar |
| List provenance + permission tracking | MISSING | no license/source columns anywhere | T-10 | substrate | a bad list is a liability at client scale |
| Property enrichment (absentee/equity/tenure) | PARTIAL + EXT-REQUIRED | isAbsentee from source cols only (farm.ts) | T-ME | Capability | ATTOM/Estated |
| Household dedup + do-not-mail gate | WORKING | farm.ts householdKey + partitionMailable, verified | T-ME | Capability | best-in-corpus fail-closed honesty |
| Farm economics screen | WORKING | farmMath turnover/EDDM/break-even (farm.ts:266) | T-ME | Capability | pure, verified |
| Postcard design (print-it-yourself) | WORKING | compileMailer USPS geometry + enforceListingHonesty [R05 §9.24/9.4] | T-ME | Workshop bench | print-DPI server render specced only (level-10 #1) |
| Variable-data merge (per-piece content) | MISSING | address block only; per-household tokens specced [R14 #5] | T-10 | Capability | |
| Address validation (CASS) | MISSING + EXT-REQUIRED | farm.ts:38 self-declares; specced fail-closed [R14 #5] | T-ME | Capability | Lob verify / Smarty / Melissa |
| Mail fulfillment (send_mail executor) | DOCUMENTED-ONLY + EXT-REQUIRED | print-it-yourself shipped [R03 §6]; full Lob spec unbuilt [R14 #5] | T-ME | Mission executor | the domain's #1 revenue-blocking gap |
| Mail delivery status + returned-mail learning | DOCUMENTED-ONLY + EXT-REQUIRED | Lob webhooks specced only [R14 #5] | T-10 | Standing Order | |
| Postcard QR/site-events attribution | WORKING 🔌 | mailer.ts ?src=postcard + app_0103 pixel | T-ME | ledger | |
| Call tracking / per-campaign numbers | MISSING + EXT-REQUIRED | only missed-call text-back exists [R07 §2.7] | T-10 | Capability | Twilio numbers or CallRail |
| MLS sync on the clock + multi-feed | PARTIAL 🔌 | manual button, no cron, one feed/operator [R13 §9.7, R03 §8] | T-10 | Standing Order | cron is trivial; multi-feed is design work |
| MLS rows → campaign composer seam | DISCONNECTED | campaignCore inputs typed by hand while mls_listings holds the facts [R05 §9.6] | T-ME | Capability | classic built-but-not-wired |
| Listing content set (one listing → all channels) | WORKING | campaignCore pure + honesty gates | T-ME | Workshop | |
| Content weeks earned autonomy | WORKING 🔌 | contentWeekRun 3-clean-streak auto_mode [R05 §9.6] | T-ME | Standing Order | the system's one real autonomy loop |
| SMS follow-up rail | PARTIAL — latent-dead | approval_kind enum missing 'send_sms' [R06 §15 #0] | T-ME | Capability | one-line migration |
| Portal-lead parsing (Zillow/Realtor) | DOCUMENTED-ONLY | level-10 #5; forward-in alias exists as substrate | T-ME | Capability | most agents' top lead source |
| DocuSign back half (auto-populate/trigger-send) | PARTIAL | front half + filing real; middle missing [R03 §8] | T-10 | Capability | |
| Transaction timelines | WORKING | timelines.ts conventions + reminders | T-ME | Mission | per-state variants at T-100 |
| Unified people model | PARTIAL + ARCH-CHANGE | "six unreconciled people tables" [R03 §5] | T-10 | substrate | prerequisite for any multi-client CRM |
| RE compliance-as-data (Fair Housing/TCPA) | WORKING | verticals.ts verified mid-2026 [R05 §9.14] | T-ME | Capability | needs an update loop by T-100 |
| Open-house capture | MISSING | no sign-in surface; booking rail adjacent | T-10 | Capability | small build on existing rails |
