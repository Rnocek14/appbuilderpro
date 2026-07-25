# 11 — Integrations: Build vs Buy

> Phase 5.5 capability audit. Charter: `_charter.md`. Base evidence: [R07] (the integration
> catalog — ~30 distinct external services, 25 live code paths), corroborated by [R13] (edge
> functions), [R03] (feature inventory), [R14] (planning documents, esp. garvis-level-10),
> [R10] (open questions), and greps of the live code where Phase 1 is silent.
>
> Question this document answers: **which external capabilities the operator's portfolio needs
> that the estate does not yet have, whether each is bought or built, and what the integration
> PLATFORM underneath them must become by T-100.**
>
> Cost classes used throughout: **free** · **cheap** (< ~$100/mo at T-10 scale) ·
> **meaningful** (usage-scaling, or $100s+/mo, or per-client fees that multiply).

---

## 1. The existing integration estate — and its multi-tenancy honesty check

The catalog below is [R07 §1] restated through one new lens: **can this integration serve 100
clients under ONE operator account** (the T-100 gate), or does it silently assume one business?
"MT-ready" = the per-client shape already exists in code; "MT-partial" = the provider supports
it but our code doesn't (or only half does); "MT-no" = single-tenant by construction today.

| Service | Role | State [R07] | Multi-tenancy readiness at 100 clients |
|---|---|---|---|
| Supabase (own project) | entire backend | LIVE | MT-partial — one project, `world_id`/owner scoping in tables; RLS is per-operator not per-client [R07 §2.1] |
| Supabase Management API | provision per-app DBs | LIVE | MT-ready — per-app projects by design; plan caps (`FF_*_MANAGED_LIMIT` 2/50) bind at T-100 [R07 §2.2] |
| FableForge Cloud (managed DBs) | Lovable-style managed projects | LIVE (degrades) | MT-ready in shape; 50-project Pro cap is the T-100 wall [R07 §2.2] |
| Anthropic / Claude | default AI + web_search | LIVE | MT-ready — one key, credit-metered per owner; per-client cost attribution missing [R07 §2.3] |
| OpenAI / OpenRouter / local | alt AI, embeddings, images | LIVE | Same shape as Anthropic |
| Lovable AI gateway | legacy fallback classifier | LIVE (legacy) | N/A — retire, don't scale [R07 §2.3] |
| Gemini / Veo 3.1 | video scene generation | LIVE (degrades) | MT-ready — per-render, no tenant state [R07 §2.4] |
| Shotstack | cloud video render | LIVE (degrades) | MT-ready — stateless renders; has a stage/v1 sandbox split [R07 §2.4] |
| Stripe — SaaS billing | operator pays FableForge | LIVE (stub-degrades) | N/A — platform-side only [R07 §2.5A] |
| Stripe — client billing | clients pay the operator | LIVE | **MT-no as built** — operator's static Payment Links; operator is merchant of record for everything; no Stripe Connect, no per-client products/prices; per-sale routing exists (`client_reference_id` uuid) [R07 §2.5B] |
| Resend — send | THE email send path | LIVE | **MT-ready-ish** — per-brand sender domains via `sender-domain` (SPF/DKIM/DMARC per client) and `world_sender_identities` under one Resend account [R07 §2.6, §3.3]; shared daily caps/warmup are account-global, not per-brand |
| Resend — webhooks/inbound | delivery events + replies | LIVE | MT-partial — one webhook, correlation routes to the right campaign/contact; suppression list is global (correct for compliance, but per-client visibility missing) [R07 §2.6] |
| Twilio — SMS | THE SMS send path | LIVE (enum-dead: [R10 #10]) | **MT-partial** — per-client from-number exists (`client_subscriptions.twilio_number` → `payload.from_number`) but **one account SID/token for all; no subaccounts** [R07 §2.7]; A2P 10DLC brand+campaign registration is per-brand — 100 clients = 100 registrations (days each, fees each) [R07 §2.7] |
| Twilio — Voice inbound | missed-call text-back | LIVE | MT-partial — per-client `missed_call_configs` exist; numbers provisioned manually, same single account [R07 §2.7] |
| DocuSign | e-signature | LIVE (sandbox default) | MT-no — operator's own OAuth identity signs everything; per-client e-sign connector is `built:false` [R07 §2.8, §3.3] |
| GitHub | source export | LIVE | MT-ready — per-user OAuth or per-request token [R07 §2.9] |
| Netlify | all site hosting | LIVE | MT-ready-ish — one token, N sites; per-client custom domains via `connect-domain`; no per-client Netlify ownership transfer path [R07 §2.10] |
| Google Ads / Meta Ads | read-only metrics + watchdog | LIVE (degrades) | **MT-no** — ONE global token set (System User / one refresh token); per-owner config rows exist but not per-client ad-account auth [R07 §2.11, §3.2] |
| Ayrshare | social publish + analytics, 9 networks | LIVE | **MT-plan-dependent** — code already resolves per-world/brand **Profile-Keys** fail-closed once multiple destinations exist [R13 §social-publish; R08]; multi-profile operation and analytics require Ayrshare's paid Premium/Business tiers [R07 §2.12] — per-client profile fees multiply at 100 |
| MLS (RESO Web API) | listing sync | LIVE | MT-ready — per-user sealed feed credentials in `provider_connections`, `world_id`-stamped listings keep two realtors' markets separate [R07 §2.13] |
| Google Places / Serper / Perplexity | discovery + research | LIVE (degrades) | MT-ready — operator-side acquisition tools, no tenant state [R07 §2.14] |
| ScreenshotOne | page screenshots | LIVE (degrades) | MT-ready — stateless [R07 §2.4] |
| Embeddings provider | semantic memory | LIVE (degrades to lexical) | MT-ready — vectors are row-scoped [R07 §2.3] |
| Discord/Slack webhooks | operator push | LIVE | Operator-side only; per-client notification routing missing [R07 §2.14] |
| ICS calendar feeds | read-only calendar | LIVE (no recurrence) | MT-no — one `profiles.calendar_ics_url` per operator [R07 §2.15] |
| Booking (in-house) | public booking pages | LIVE | MT-ready — per-client `booking_pages`, exclusion-constraint race safety [R07 §2.15] |
| fetch-url / safeFetch | hardened scraping | LIVE | MT-ready — stateless, SSRF-spined [R07 §2.14] |
| Vercel / Netlify OAuth / GB-calendar-esign client connectors / shared free-tier DB / Cloud Console CC2-9 | reserved names & specs | STUB/PLANNED | — [R07 §1] |

**The multi-tenancy pattern in one sentence:** the estate is genuinely multi-tenant wherever
identity was designed as data (Resend sender domains, Ayrshare Profile-Keys, MLS sealed feeds,
booking pages, per-client Twilio from-numbers) and single-tenant wherever identity is a global
secret (Twilio account, Google/Meta ad tokens, DocuSign OAuth, calendar ICS, Stripe Payment
Links). The dividing line is exactly the `provider_connections` / edge-secret split [R07 §3, §4.2]
— and that split is the platform work of §3 below.

---

## 2. Required-new integrations, by audit domain

Derived from the phase brief's domains. Every row: verdict + one-sentence reason + cost class +
secrets/tenancy model. "Class" uses the charter rubric; nearly everything here is
MISSING + EXT-REQUIRED or a BUILD on existing rails.

### 2.1 Real estate: map/GIS, property data, demographics

| Capability | Candidates | Verdict | Reason | Cost | Secrets / tenancy |
|---|---|---|---|---|---|
| Interactive farm map (draw polygon → parcels → list) | Mapbox GL vs **MapLibre GL + vector tiles (MapTiler/Protomaps) + OSM** | **HYBRID — buy tiles, build UI** | MapLibre is the free fork of the same renderer, so the only thing worth paying for is tile serving, while the farm-drawing UI is core product and must be owned. | cheap (tiles) | One operator tile key, edge-proxied like `discover-media` (never `VITE_`); no tenant state |
| Geocoding | Mapbox/Google vs Census geocoder vs Nominatim | **BUY (bundled with tile vendor), Census as free fallback** | Batch farm geocoding is a solved commodity and the Census geocoder is free for US addresses. | free→cheap | Same key as tiles; results cached in DB |
| Parcel/homeowner data (owner name, situs, assessed value, tenure, absentee flag) | **ATTOM** vs DataTree (First American) vs county-direct scraping | **BUY — ATTOM first** | One national API with per-record licensing beats 3,000 heterogeneous county portals, and DataTree's title-plant depth isn't needed until deals close; county-direct stays a T-SPEC cost optimization. | **meaningful** (per-record / monthly minimums) | Operator-level key; **license terms bind: display vs internal-use rights, no resale of raw records; cache TTLs contractual** |
| Phone/contact append for homeowners | ATTOM/DataTree add-ons, skip-trace vendors | **BUY, gated** | Appended phones are TCPA landmines, so every appended number must enter the existing consent-fail-closed SMS gate as `no consent` and cold-call lists must be **DNC-scrubbed** before any dial. | meaningful | Must NOT bypass `smsConsentOk` [R07 §2.7]; DNC scrub list is compliance data, stored server-side only |
| Demographics / income / turnover by tract | **Census ACS API** (+ HUD/FHFA files) | **BUY (it's free) + build the join** | The government publishes the data free; the leverage is our tract⇄farm join and caching, which is pure build. | **free** | Free API key, edge secret; results cached per-geo in DB |
| Comps / AVM | MLS feed already held vs ATTOM AVM | **BUILD on `mls_listings` first** | A real RESO feed is already syncing [R07 §2.13], and comps from the client's own MLS beat a bought AVM for credibility with sellers. | free (existing) | Existing per-user sealed MLS creds |

**Farm-list reality check:** `farm.verify.ts` already parses county-CSV parcel exports (PARCEL
ID / SITUS columns) — today's pipeline is manual-CSV-in. The buy above replaces the manual
export, not the list engine.

### 2.2 Outreach: address validation, direct mail, enrichment, inbox

| Capability | Candidates | Verdict | Reason | Cost | Secrets / tenancy |
|---|---|---|---|---|---|
| Address validation (CASS) | **Lob verify** vs USPS APIs vs Melissa | **BUY — Lob address verification** | Level-10 already specs CASS verification "fail-closed exactly like email suppression" [R14 §level-10], and buying it from the same vendor as print fulfillment gives one invoice, one webhook family, one SDK. | cheap (per-verify) | Operator key, edge secret; validation result stored on the household row |
| Direct-mail print/fulfillment | **Lob** vs PostGrid | **BUY — Lob** | The level-10 blueprint already designed the whole loop around Lob (cost ceiling enforced at approval, per-household QR tokens, monotonic webhook status ranks, returned-mail as fail-closed learning) [R14 §level-10], and its webhook model drops straight onto the existing HMAC-verified fan-in pattern [R07 §7]. | **meaningful** (per-piece, ~$0.50–1+/postcard) | Operator key; per-client attribution via campaign/world rows; **Lob webhook joins the never-optional-auth family**; test-env keys = free sandbox |
| Print-vendor fallback | PDF+CSV download (exists) | **KEEP as floor** | The glory-sprint "download print-ready PDF + CSV for a vendor" path [R14] is the deterministic floor when Lob is unkeyed — same honest-degradation house pattern. | free | none |
| Contact enrichment (B2B email finding) | Apollo / Hunter / Clearbit vs existing Places+Serper+scrape | **HYBRID** | The discovery stack already finds and fingerprints businesses well [R07 §2.14]; buy ONLY the email-finder/verifier step (Hunter-class, per-lookup) because guessed emails burn the warmed Resend domains that are the estate's most fragile asset. | cheap→meaningful (per-lookup) | Operator key, edge-proxied; found emails enter existing suppression/`email_status` discipline |
| Whole-inbox awareness | **Gmail API** vs IMAP vs Nylas | **BUY-side: Gmail API direct; skip Nylas** | Today only replies-to-own-sends + a forward-in alias exist ("senses" gap [R03 §inbox]); Gmail API gives push (watch/history), threading, and send-as, while Nylas charges per connected mailbox forever and IMAP has no push and worse auth. | free→cheap (Google verification effort is the real cost) | **Per-user OAuth in `provider_connections` (the DocuSign pattern [R07 §3.1]); scopes: start `gmail.readonly` + `gmail.send`; `gmail.modify` only if labeling is needed. Restricted-scope CASA security assessment is required for public verification — budget weeks, not dollars. Tokens never reach the browser (vault RLS: zero policies).** |
| Reply handling for client brands | Resend inbound (exists) | **KEEP/BUILD** | Per-brand inbound MX via Resend already works [R07 §2.6]; Gmail is for the operator's own mailbox, not client brands. | free (existing) | existing `INBOUND_SECRET` header model |

### 2.3 Apparel/creative + e-commerce

| Capability | Candidates | Verdict | Reason | Cost | Secrets / tenancy |
|---|---|---|---|---|---|
| Print-on-demand fulfillment | **Printful** vs Printify | **BUY — Printful first** | One in-house supplier gives consistent color/QC and a first-class mockup+order API for the artwork-grant flow, and Printify's multi-vendor marketplace (cheaper, variable QC) is a margin optimization to add later, not a foundation. | meaningful (per-item COGS, no platform fee) | Operator key per store; per-client stores = per-client Printful store IDs in the connector registry; order webhooks → fan-in |
| Product mockups | Printful mockup API vs build | **BUY (bundled)** | Comes free with the POD choice; building a garment renderer is pure waste. | free w/ Printful | same key |
| E-commerce storefront | **own builder + Stripe** vs Shopify | **DECIDE BY CASE — default BUILD on own rails** | The site builder + Stripe Checkout + site-events already produce sellable pages [R07 §2.5B, §2.10]; adopt Shopify only when a client needs real commerce ops (inventory, tax nexus, shipping rates) — then refer/manage, don't integrate deeply. | free→cheap (Stripe fees only) vs meaningful (Shopify/mo/client) | Own path: **requires Stripe Connect or client-owned Stripe keys** (see §2.5) so clients are merchant of record for their own goods |

### 2.4 Social, calls, analytics

| Capability | Candidates | Verdict | Reason | Cost | Secrets / tenancy |
|---|---|---|---|---|---|
| Social listening / brand monitoring | Brand24 / Mention / X API | **BUY LATER — T-SPEC** | No current Mission consumes mentions, and every listening vendor is a meaningful recurring fee; revisit when a reputation-management service package exists. | meaningful | defer |
| Call tracking (per-client numbers, attribution, recording) | **Twilio (existing)** vs CallRail | **BUILD on existing Twilio** | `voice-inbound` already validates signatures, rings through, and logs `missed_call_events` [R07 §2.7]; adding number provisioning (Twilio Numbers API), per-source numbers, and optional recording/transcription is incremental build on an owned rail — CallRail would duplicate the whole rail at $45+/client/mo. | cheap (~$1.15/number/mo + usage) | Existing account creds; **numbers must move to per-client subaccounts at T-100 (§3)**; recordings need consent-by-state gates before enabling |
| Client-facing analytics/reporting | **build on `site-events`** vs Plausible/GA4 | **BUILD on site-events** | The tenancy-correct pixel already exists — `site_channels` bearer-token per site, `site_events` visit/lead/click/QR with `?src` attribution, service-role-insert-only [R04 app_0036; R13 §7.13] — so client reports are a query+render problem, while Plausible would add per-site fees and a second source of truth. | free (existing) | Existing per-world capability tokens; add per-client report rollup views |
| Review/GBP management | Google Business Profile API | **BUY (API is free) — needs the `built:false` connector finished** | The client connector already exists as a stub [R07 §3.3]; GBP API is free but OAuth-verified and quota'd. | free | Per-client OAuth — first true test of the per-client vault (§3) |

### 2.5 Money and paperwork (cross-domain requirements the above create)

| Capability | Candidates | Verdict | Reason | Cost | Secrets / tenancy |
|---|---|---|---|---|---|
| Client billing at scale | **Stripe Connect (Standard)** vs status-quo Payment Links | **BUY/BUILD — Connect, needed before T-100** | Payment Links make the operator merchant of record for 100 businesses (tax, refunds, disputes all his) [R07 §2.5B]; Connect Standard moves each client onto their own Stripe account with platform fees, and it is the hard prerequisite for client e-commerce (§2.3). | cheap (Stripe takes %) | Per-client connected-account IDs in the registry; OAuth-style onboarding link; existing webhook gains `account` routing |
| Per-client e-sign | DocuSign per-client vs operator-signs | **KEEP operator-level until a client asks** | The `esign` client connector is `built:false` by design [R07 §3.3]; operator-as-sender covers agency paperwork, and per-client DocuSign accounts are meaningful per-seat fees with no current Mission. | meaningful (deferred) | Would reuse the DocuSign OAuth path per client |

### 2.6 Priority order (leverage ranking of the buys)

1. **Lob (verify + print)** — unlocks the entire direct-mail chain the product was named for;
   spec already written [R14]; webhook/approval patterns already exist to receive it.
2. **ATTOM property data** — turns farm-building from manual county CSVs into a Capability;
   feeds direct mail, real-estate Workshops, and demographics joins.
3. **MapLibre + bought tiles** — the farm map is the deep-environment surface real estate
   needs (charter: don't force it into the nine-bench canvas); tiles are the only bought part.
4. **Gmail API** — closes the "senses" gap [R03]; every follow-up loop improves when the whole
   inbox is visible, and the OAuth vault pattern already exists to hold it.
5. **Stripe Connect** — the multi-tenancy unlock for money; everything client-commerce shaped
   is blocked behind it.

(Census ACS is free and near-zero effort — do it opportunistically with the map. Printful,
enrichment, GBP follow demand. Social listening deferred.)

---

## 3. What the estate implies the integration PLATFORM must become (T-100)

Five requirements, each grounded in a present-day seam:

**3.1 Unified connector registry.** There are THREE connection systems today —
`provider_connections` (operator OAuth/token vault, RLS-sealed), `public.connections`
(non-secret ad config), and `client_connections` (per-client hookup checklist with
evidence-derived status) [R07 §3.1–3.3]. The checklist's design is the keeper: status derived
from each connector's own table, human overrides never clobbered, `requiredConnectors()` gating
automations. T-100 needs ONE registry schema underneath all three: connector catalog row
(provider, auth mode, sandbox mode, webhook family, budget class) × scope row (operator-global |
per-world/brand | per-client) × credential row (vault reference). Class: PARTIAL + ARCH-CHANGE.

**3.2 Per-client credential vault.** The server-side vault exists and its security shape is
right (RLS-with-zero-policies; browser never sees tokens; probe-validated on paste; auto-refresh
[R07 §3.1]). Its **key is wrong for T-100: one row per (user, provider)** — one operator can
hold one Ayrshare key, one Netlify token, one DocuSign identity. The estate already smuggles
per-client identity around this limit in three inconsistent ways: Ayrshare Profile-Keys resolved
per-world [R13], Twilio numbers as a column on `client_subscriptions` [R07 §2.7], sender
identities in `world_sender_identities` [R07 §3.3]. The fix is a scope column
(`operator | world | client`) on the vault plus migration of those three squatters into it —
prerequisite for GBP OAuth, Stripe Connect accounts, per-client Gmail. Class: PARTIAL +
ARCH-CHANGE.

**3.3 Webhook fan-in.** The house pattern is excellent per-provider (signature verification
never optional, replay windows, idempotency, fail-closed on missing secret [R07 §7]) but each
webhook is a bespoke function. New buys add at least Lob, Printful, and Stripe Connect
`account`-routed events. Needed: a shared fan-in layer that (a) routes provider event → owning
client/world via the registry, (b) stores raw events append-only before interpretation (the
`social_post_metrics` "raw provider object verbatim" discipline generalized), (c) gives each
provider family its verification strategy as config. Class: WORKING per-provider,
MISSING as a platform.

**3.4 Rate-limit and spend budgets per provider.** Only AI spend is metered today
(`_shared/credits.ts`, per-owner, HTTP 402 [R07 §2.3]); Resend/Twilio have global daily caps and
warmup [R07 §2.6–2.7]. Nothing meters ATTOM per-record pulls, Lob per-piece spend, tile
requests, or enrichment lookups — exactly the new buys whose costs scale per-use. Needed: a
provider budget ledger (per-provider AND per-client ceilings, the level-10 "approved estimate
is a hard ceiling the executor enforces" rule [R14] generalized), feeding the T-1K control
plane's cost-anomaly watch. Class: PARTIAL (pattern exists for AI only).

**3.5 Sandbox/test modes.** The estate already practices this unevenly: DocuSign defaults to
sandbox with an explicit "not legally binding" note, Stripe has stub mode, Shotstack has
stage/v1 [R07 §2.4, §2.5, §2.8], and the nightly canary proves send-gates refuse [R07 §6.5].
Lob and Printful both have first-class test environments. Needed: `sandbox` as a first-class
registry field per connector scope, surfaced on the Health page, so a client can be onboarded
end-to-end in test mode before real money/mail moves. Class: PARTIAL (ad hoc per provider).

---

## 4. The fifteen questions (adapted to this cross-cutting domain)

| # | Question | Answer |
|---|---|---|
| 1 | Exists-working | 25 live integration code paths [R07 §1]; approval spine, webhook auth, SSRF spine, honest degradation are uniformly applied [R07 §7] |
| 2 | Partial/scaffold | Multi-tenant identity (Ayrshare Profile-Keys, per-client Twilio numbers, sender domains) exists but scattered outside the vault; credits meter AI only; sandbox modes ad hoc; SMS path enum-dead [R10 #10] |
| 3 | Docs/prototypes only | Lob direct-mail loop fully specced in level-10 [R14]; shared free-tier DB; Cloud Console CC2–9; Netlify OAuth "C4" |
| 4 | Missing | Map/GIS (grep: zero map libs in `src/`), property data API, demographics, address validation, print fulfillment, whole-inbox, POD, Stripe Connect, call tracking beyond missed-call, social listening, unified registry/budget ledger |
| 5 | Build internal | Farm-map UI, ACS/tract joins, client analytics on site-events, call tracking on Twilio, comps on `mls_listings`, all of §3's platform layer |
| 6 | External API | Lob, ATTOM, MapTiler/Protomaps tiles, Census ACS, Gmail API, Printful, Stripe Connect, Hunter-class enrichment, GBP API |
| 7 | Reusable Capability | Each connector = a Capability ("validated address", "printed piece", "enriched contact") usable by any Workshop |
| 8 | Domain Workshop | The farm map is a DEEP-ENVIRONMENT surface (geo canvas ≠ nine-bench grammar); everything else in this doc is plumbing under existing Workshops |
| 9 | Mission | "Stand up client X's integrations" = a Mission template walking the connector checklist to green (`seedForTier` already models this [R07 §3.3]) |
| 10 | Standing Order | Webhook-driven syncs (Lob status, Printful orders, social-sync) join the existing 11-job heartbeat family [R07 §6.4] |
| 11 | Requires approval | Every spend-bearing send stays on the approval spine: mail pieces (cost ceiling pre-approved [R14]), POD orders, Connect onboarding links |
| 12 | Safe autonomous | Read-only pulls (ACS, ATTOM lookups within budget, tile loads, Gmail read, analytics sync) — metered by §3.4, never approval-gated |
| 13 | Portfolio-level | Registry health per client (connector greens), provider budget dashboards, webhook failure fan-in — the control plane's integration lens |
| 14 | Breaks at 10/100/1k | 10: manual A2P registrations and Payment Links get painful. **100: (user,provider) vault key, single Twilio account, merchant-of-record billing, unmetered per-use APIs all fail** — §3 is the T-100 bill. 1k: per-provider org rate limits need brokered pooling + canary deploys of connector config |
| 15 | Mastery needs | Data licensing literacy (ATTOM display rights, DNC/TCPA for appended contacts), Google restricted-scope verification (CASA), USPS mail geometry (already in glory-sprint [R14]), Stripe Connect account taxonomy |

---

## Matrix rows

| Capability | Class | Evidence | Needed-at | Owner object | Note |
|---|---|---|---|---|---|
| Integration estate (25 live, gated, degrading honestly) | WORKING | [R07 §1, §7] | T-ME | substrate | The foundation is real; this doc is about what's missing around it |
| Per-brand email identity (Resend sender domains) | WORKING | [R07 §2.6] | T-ME | Capability | Most MT-ready integration in the estate |
| Ayrshare per-client social profiles | PARTIAL + EXT-REQUIRED | [R13 §social-publish; R07 §2.12] | T-10 | Capability | Code resolves Profile-Keys fail-closed; Ayrshare Business tier fees multiply per client |
| Twilio subaccounts / per-client number provisioning | MISSING + EXT-REQUIRED | [R07 §2.7] (one account for all) | T-100 | substrate | Per-client from-number column is the interim; A2P per-brand registration is the hidden serial cost |
| SMS approval enum fix (`send_sms`) | PARTIAL | [R10 #10] | T-ME | substrate | One-line migration; SMS rail is dead until it lands |
| Stripe Connect client billing | MISSING + EXT-REQUIRED | [R07 §2.5B] (Payment Links only) | T-100 | Capability | Merchant-of-record risk concentrates on the operator until then; prerequisite for client e-commerce |
| Farm map (MapLibre UI + bought tiles) | MISSING + EXT-REQUIRED | grep: no map lib in `src/` | T-ME | Workshop (DEEP-ENVIRONMENT) | Buy tiles (MapTiler/Protomaps), build the geo canvas |
| Property/homeowner data (ATTOM) | MISSING + EXT-REQUIRED | [R14] (audience model open); `farm.verify.ts` (CSV-only today) | T-ME | Capability | Licensing/display rights + DNC scrub gates are part of the buy |
| Demographics (Census ACS) | MISSING + EXT-REQUIRED | no code | T-10 | Capability | Free API; effort is the tract⇄farm join |
| Address validation (Lob verify / CASS) | MISSING + EXT-REQUIRED | [R14 §level-10] (specced fail-closed) | T-ME | Capability | Same vendor as print; fail-closed like suppression |
| Direct-mail fulfillment (Lob) | DOCUMENTED-ONLY + EXT-REQUIRED | [R14 §level-10] full spec; PDF+CSV floor exists | T-ME | Capability | Webhook + cost-ceiling patterns already designed; highest-leverage buy |
| Contact enrichment (email finder) | MISSING + EXT-REQUIRED | [R07 §2.14] (scrape stack exists) | T-10 | Capability | Hybrid: keep owned discovery, buy only verification |
| Whole-inbox (Gmail API) | MISSING + EXT-REQUIRED | [R03] (forward-in only) | T-10 | Capability | Per-user OAuth into existing vault; CASA verification is the real cost |
| POD fulfillment (Printful) | MISSING + EXT-REQUIRED | [R14] (apparel almost all new) | T-10 | Capability | Printify later as margin play |
| Client e-commerce (own builder + Stripe) | PARTIAL | [R07 §2.5B, §2.10] | T-10 | Workshop | Shopify by exception only; blocked on Connect for client-owned money |
| Social listening | MISSING + EXT-REQUIRED | no code | T-SPEC | Standing Order | Defer until a reputation service package exists |
| Call tracking on Twilio | PARTIAL | [R07 §2.7] (voice-inbound live) | T-10 | Capability | Build: number provisioning, per-source attribution; recording needs consent gates |
| Client analytics on site-events | WORKING (reporting layer PARTIAL) | [R04 app_0036; R13 §7.13] | T-10 | Capability | Build reports on owned pixel; do not buy Plausible |
| Google Business Profile connector | DOCUMENTED-ONLY + EXT-REQUIRED | [R07 §3.3] (`built:false`) | T-10 | Capability | First per-client OAuth through the new vault scope |
| Unified connector registry | PARTIAL + ARCH-CHANGE | [R07 §3.1–3.3] (three systems) | T-100 | substrate | Merge three connection systems behind one schema |
| Per-client credential vault scope | PARTIAL + ARCH-CHANGE | [R07 §3.1] ((user,provider) key) | T-100 | substrate | Add scope column; migrate Ayrshare keys, Twilio numbers, sender identities in |
| Webhook fan-in platform | PARTIAL | [R07 §7] (per-provider excellence) | T-100 | substrate | Registry-routed, raw-event-first, verification-as-config |
| Provider budget ledger | PARTIAL | [R07 §2.3] (AI credits only) | T-100 | substrate | Per-provider + per-client ceilings; feeds cost-anomaly control plane |
| Uniform sandbox/test modes | PARTIAL | [R07 §2.4, §2.5, §2.8] (ad hoc) | T-100 | substrate | First-class registry field; onboard clients in test mode |
