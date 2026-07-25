# 01 — Capability Inventory: The Verified Reality, Keyed by Audit Domain

*Phase 5.5 capability audit. The evidence backbone for every other audit document. Reorganizes the
verified Phase-1 reconstruction ([R03] feature inventory · [R05] AI system · [R06] workflows ·
[R07] integrations · [R13] edge functions) into an operational inventory per the `_charter.md`
rubric. Every row carries exactly one Class and a citation; grep results resolve only what Phase 1
does not answer. 🔌 = dark until the heartbeat is armed and/or the relevant secret is set
([R06 §0]) — classification counts the code reality, with the 🔌 noted.*

**Class key (charter):** WORKING · DISCONNECTED · PARTIAL · PROTOTYPE-ONLY · DOCUMENTED-ONLY ·
MISSING · +EXT-REQUIRED · +ARCH-CHANGE.

---

## 0. Substrate — what every domain below stands on

| Substrate capability | Honest state | Evidence |
|---|---|---|
| Approval spine (one `approvals` queue, SHA-256 payload hash, CAS claims, `execution_runs` immutable ledger) | WORKING — structural, not procedural; all six outward executors require it; canary nightly tests that the send gate refuses | [R03 §2] [R13 §13.2] |
| Heartbeat/clock (12 pg_cron jobs via `garvis_arm_heartbeat`, Vault secrets, dual-header auth) | WORKING 🔌 — but **never self-arms**; ships OFF; CI self-arm defaults off; Master Switch + Health board are the manual arm | [R03 §2] [R06 §0] [R13 §2] |
| Standing-order core (6 kinds, drift-free anchored scheduling, drains) | WORKING 🔌 — one shared `standingCore.ts`, verified; no concurrency claim on orders (double-run risk noted) | [R05 §7.2] [R03 §2] |
| Memory: `mind_events` spine (20+ writers) → weekly consolidation → approval-gated knowledge | WORKING 🔌 capture + lessons; but beliefs are hand-curated (no distiller) and decision outcomes close manually | [R03 §3] [R06 §8] |
| Embeddings (one polymorphic 1536-dim pgvector space, HNSW, owner-scoped kNN) | PARTIAL — writes cover 2 of 6 declared subject types; beliefs/decisions/clusters/worlds unsearchable by meaning; degrades honestly to lexical | [R03 §3] [R06 §8] |
| Credits (`checkCredits`/`spendCredits` RPCs, per-kind estimates, 402 fail) | WORKING — every AI-spend surface is metered; prices two providers that don't exist yet (Sora/Runway/Luma clip, ElevenLabs voiceover) | [R13 §10.2] |
| safeFetch (SSRF spine: reserved-IP tables, all-records-public DNS, per-hop redirect re-validation) | WORKING — the one fetch path for every user-controlled URL, 8 consumers | [R13 §10.15] [R07 §7] |
| Provider-agnostic AI seam (`_shared/ai.ts`: anthropic/openai/openrouter/local, `modelForPlan`, 300s timeouts, retry, pricing) | WORKING — ~22 consumers; two drift spots: legacy direct-fetch classifiers (gpt-4o-mini / Lovable gateway) and Anthropic-only `agent-turn`/web-search | [R07 §2.3] [R13 §13.7] |
| Payload-hash tamper evidence (`stableStringify` + SHA-256, shared enqueue↔executor) | WORKING — null hash grandfathered (only ever adds refusal) | [R13 §10.6] |
| Cron auth gate (`cronGate.ts`, constant-time) | WORKING — drift: garvis-pulse/consolidate still check `x-worker-secret` raw | [R13 §13.5] |
| RLS everywhere (deny-all server-only tables, definer pins, zero-policy token vaults) | WORKING — `rls.verify.ts` audits real migrations in CI | [R03 §10] [R05 §11] |
| Verify harness (116 wired suites + fuzz + RLS audit + migration-collision guard) | WORKING — but 6 verify files exist unwired (never run in CI) and the AI decision layer (~51 `*Run.ts`, brain, executeTool) has zero coverage | [R05 §11] [R06 §13] |
| Situation model (`compileSituation()` budgeted digest → orchestrator + Commander) | WORKING as LLM input; the "Field" home rendering of it is DOCUMENTED-ONLY | [R03 §2] |
| Earned autonomy (`autonomy_grants`, per-class, daily-capped, fail-closed; streaks from human decisions only) | PARTIAL — real for content weeks + 4 recurring classes ("eligible", operator flips switch); generalized ledger thin | [R03 §2] [R05 §6] |

---

## 1. Real-estate marketing

| Capability | Class | Evidence |
|---|---|---|
| MLS sync — real RESO Web API (OData) client, probe-before-save, incremental, per-user sealed creds, world-scoped | WORKING 🔌 (manual button only — no cron) | [R03 §8] [R13 §9.7] |
| MLS market stats computed purely from synced rows ("the model narrates, never computes") | WORKING | [R05 §9.27] |
| One listing → whole marketing set (postcard + per-platform posts + email; zero AI; `[EDIT]` holes) | WORKING | [R05 §9.6] |
| Listing-honesty backstop (a "Just Sold!" claim strips any AI image; real home photo required) | WORKING | [R05 §9.4] |
| Farm territories (address lists, `householdKey` dedupe, do-not-mail fail-closed, turnover economics, EDDM 200-piece floor) | WORKING | [R05 §9.11] |
| Real-estate vertical expertise pack + 2026-verified compliance notes (HUD/TCPA), Mom's-template work web | WORKING (data, zero-AI floor) | [R05 §9.14] [R05 §9.8] |
| Transaction timelines (listing/purchase anchor+offset steps → firing reminders) | WORKING | [R05 §9.26] |
| First playbook: Lake Geneva lakefront-seller campaign (plays-as-data) | WORKING | [R05 §9.26] |
| MLS sync on the clock (scheduled refresh; multiple feeds per operator) | MISSING (one feed per operator, manual) | [R03 §8] |
| Neighborhood/demographic/turnover data feeds | MISSING + EXT-REQUIRED (ATTOM / Census / county records) | [grep: no source] |

## 2. Map / local prospecting

| Capability | Class | Evidence |
|---|---|---|
| Google Places discovery firehose over a (niche × metro) grid, exhaustion-tracked, self-capped | WORKING 🔌 | [R13 §8.1] [R05 §9.18] |
| Claude scout (server-side web_search; lead persists only with a real citation URL) | WORKING 🔌 | [R13 §8.1] |
| National sweep (~200 metros, cross-city domain dedupe) + daily city roll | WORKING | [R05 §9.18] |
| Site audit scoring (observed-fact signals only; verdict weak/dated/solid/unknown) | WORKING | [R05 §9.18] |
| Market-exhaustion tracking (`discovery_queries`, drained after 2 zero-insert runs) | WORKING | [R13 §6.3] |
| Map UI / geographic visualization of prospects, farms, territories | MISSING — no map library anywhere in src/ or supabase/ (leaflet/mapbox/maplibre/google.maps: zero hits) | [grep] |
| Demographic/territory overlays (income, turnover, ownership) | MISSING + EXT-REQUIRED (Census/ATTOM) | [grep] |
| Query self-tuning beyond opportunity hunts (dry client-hunts mutating queries) | DOCUMENTED-ONLY | [R03 §11] |

## 3. Scraping + enrichment

| Capability | Class | Evidence |
|---|---|---|
| fetch-url — the one hardened page reader: text/images/save/contact modes, shallow same-host crawl, Chrome fingerprint for WAFs, Cloudflare email decode | WORKING | [R13 §8.4] [R03 §4] |
| Tech fingerprint (builders, booking widgets, chat, analytics, e-commerce; null-never-guess) | WORKING | [R13 §10.16] |
| Automation-opportunity detection (registry + bounded deterministic matcher over scraped signals) | WORKING | [R03 §4] [R05 §9.23] |
| Scrape-profile extraction → BusinessProfile (photos default `can_publish:false`) | WORKING | [R05 §13] |
| Serper search + rendered-scrape fallback (provider-side fetching) | WORKING 🔌 | [R13 §6.3] |
| Opportunity extraction with URL-allowlist gauntlet (hallucinated links dropped, fuzz-verified) | WORKING 🔌 | [R05 §9.17] |
| Rendered-DOM fetch for JS-portal sites | DOCUMENTED-ONLY | [R03 §11] |
| Proxy rotation / robots.txt layer | MISSING (deliberate — providers fetch on their own infra) | [R03 §4] [R07 §2.14] |
| Contact enrichment via third parties (Apollo/Clearbit-class) | MISSING + EXT-REQUIRED | [grep: no source] |

## 4. Direct mail

| Capability | Class | Evidence |
|---|---|---|
| Postcard compiler (print-ready 6×9, USPS sizing, real materials + brand kit + vault photos, EDIT-ME holes) | WORKING | [R05 §9.24] |
| Postcard board over the real compiler + listing-honesty reclassification | WORKING | [R05 §9.4] |
| Farm math + do-not-mail suppression (fail-closed, fully paginated, select-first-insert sacred) | WORKING | [R05 §9.11] |
| Physical-send ledger (`logMailBatch` — operator prints and logs; the ledger counts real outreach) | WORKING | [R05 §9.4] |
| Print-vendor API send (postcard → mailed without the operator's printer) | MISSING + EXT-REQUIRED (Lob — specced in level-10 planning [R14], deliberate "decide, don't drift") | [R03 §6] [R06 §15] |
| Mail delivery tracking / per-piece attribution | MISSING + EXT-REQUIRED (Lob webhooks) | [R06 §15] |

## 5. Website prospecting / reconstruction (the demo engine)

| Capability | Class | Evidence |
|---|---|---|
| Preview intelligence chain: strategist → art director → generator → simulated-owner critique → auditor; contrast gate; de-generic fallback | WORKING | [R03 §4] [R13 §6.3] |
| Bespoke vision-grounded HTML sites, `bespokeHonest` deterministic honesty gate (rejects ungrounded claims) | WORKING | [R05 §13] |
| Deterministic fallback spec — a complete decent site with ZERO model calls (12 industry recipes, dignity guard, WCAG net) | WORKING | [R13 §10.17] |
| publish-preview: Netlify hosting + scraped-photo re-hosting + HTML stash for browserless re-publish | WORKING 🔌 | [R13 §5.1] |
| site-events pixel (write-only capability token) + instant first-touch standing rule | WORKING 🔌 | [R13 §7.13] |
| claim-submit ("Claim this website" → lead + owner webhook) | WORKING 🔌 | [R13 §7.15] |
| ingest-profile — external scraper front door (token-authed, deterministic v1 spec) | WORKING | [R13 §8.3] |
| shot-worker before/after screenshots for pitch emails | WORKING 🔌 | [R13 §8.5] |
| connect-domain (client's existing domain → Netlify; exact DNS records; live `resolveDns` verification; never MX) | WORKING 🔌 | [R13 §5.9] |
| Veo scroll-scene clips consumed by bespoke sites' motion layer | WORKING 🔌 | [R03 §7] |
| One-click Build & send per lead; review-before-send compare | WORKING | [R03 §4] |
| Daily client hunt as standing order (discover → audit → demo → pending pitch) | WORKING 🔌 | [R06 §5] [R13 §6.3] |

## 6. Website-client ops

| Capability | Class | Evidence |
|---|---|---|
| Pay → auto-publish (Stripe Payment Link → webhook flips sale → stashed HTML publishes server-side; churn no-resurrection guard) | WORKING 🔌 — the notable zero-browser loop | [R07 §2.5] [R13 §9.1] |
| Client engagements (scope-derived intake, world genesis handoff, Client Book) | WORKING | [R03 §8] [R05 §9.22] |
| Per-client connections checklist (status derived from evidence in each connector's own table) | WORKING | [R07 §3.3] |
| Google Business / calendar-sync / per-client e-sign connectors | PARTIAL — cataloged `built:false`, honestly "Coming soon" | [R07 §3.3] |
| Client tiers/MRR, close-won → subscription + invoice | WORKING (deliberately manual reconciliation) | [R03 §8] |
| Client-payment webhook reconciliation | MISSING (deliberate "decide, don't drift") | [R06 §15] |
| Custom domains for FableForge builder apps (prospect-site domains DO exist) | DOCUMENTED-ONLY | [R03 §1] |

## 7. Outreach-as-service

| Capability | Class | Evidence |
|---|---|---|
| send-email — THE one send path (approval hash, kill switch, suppression fail-closed, CAN-SPAM, caps, warmup, placeholder 422) | WORKING 🔌 — 7 internal callers, the fan-in hub | [R13 §7.1] [R13 §11] |
| Per-brand sender identities + verified sending domains (SPF/DKIM/DMARC) | WORKING 🔌 — but see sender-domain deploy gap (§DISCONNECTED) | [R03 §5] [R13 §7.3] |
| Segment batch sends (ONE approval → snapshotted list → claimed per-recipient clock drain, crash-safe) | WORKING 🔌 | [R13 §10.11] |
| Follow-ups + opened-3×-silent + monthly reactivation crons (drafts mint approvals, never send alone) | WORKING 🔌 | [R13 §7.8–7.9] |
| Speed-to-lead instant first touch (deterministic template, all gates, opt-in) — the one zero-touch email path | WORKING 🔌 | [R03 §5] [R13 §7.13] |
| Placeholder send-gate (no templated text reaches a prospect) | WORKING | [R03 §4] |
| **SMS rail (send-sms, TCPA fail-closed, STOP, per-client from-numbers, A2P 10DLC docs)** | **DISCONNECTED** — `approval_kind` enum never gains `'send_sms'`; every SMS approval insert fails at the DB; one-line migration severs the whole built rail | [R03 §5] [R06 §15 #0] |
| Missed-call text-back (signature-validated Twilio voice webhook → auto-text; config row is the pre-authorization) | WORKING 🔌 | [R13 §7.11] |
| Earned autonomy on outreach classes (followup/invoice_chase/reactivation/inbox_reply; cold pitches manual forever) | PARTIAL — module says "eligible", never "granted"; generalized surface thin | [R05 §6] |
| Voice/AI receptionist beyond missed-call | DOCUMENTED-ONLY + EXT-REQUIRED (no Vapi/Bland/ElevenLabs; Twilio is the only telephony) | [R03 §5] [R07 §2.16] |

## 8. Email campaigns / automation

| Capability | Class | Evidence |
|---|---|---|
| AI campaign generator (3-stage, research-grounded, deterministic per-asset verifier) | WORKING | [R03 §6] [R05 §9.6] |
| Email board → segment send as one `send_batch` approval | WORKING | [R05 §9.4] |
| Resend delivery webhooks (Svix-verified; bounce/complaint → suppression) + RFC-8058 one-click unsubscribe | WORKING 🔌 | [R13 §7.4–7.5] |
| Warmup ramp + timezone-aware daily caps re-checked per recipient at send time | WORKING | [R13 §7.1] |
| Invoice-chase ladder (4 rungs, each fires once, approval-gated, kill-switch aware) | WORKING 🔌 | [R13 §7.10] |
| Client trigger engine — email channel (window guard, once-only fire keys, claim-first, consent+suppression) | WORKING 🔌 | [R03 §8] |
| Client trigger engine — SMS channel | DISCONNECTED (severed by the same `send_sms` enum gap) | [R06 §15 #0] |
| Sequence depth beyond 2 bumps; A/B testing; deliverability analytics | MISSING | [R13 §7.8] |

## 9. Inbox extraction

| Capability | Class | Evidence |
|---|---|---|
| resend-inbound — replies recorded, AI-classified (3-tier fallback), sequences stopped, campaigns flipped | WORKING 🔌 | [R13 §7.6] |
| Forward-in alias mailbox (`in-xxxxxx@` via Resend inbound MX → `inbound_mail`) | WORKING 🔌 | [R13 §7.6] |
| inbox-draft — overnight reply drafts as pending approvals; `draft_verdicts` kept-vs-rewritten feedback loop | WORKING 🔌 | [R13 §7.7] |
| OpsInbox — replies + leads + inbound mail in one cross-world stream; reply-from-app rides the same spine | WORKING | [R03 §5] [R06 §12] |
| Whole-inbox awareness (IMAP/Gmail pull of the operator's real mailbox) | MISSING + EXT-REQUIRED (Gmail API / IMAP / Nylas-class) — the "senses" gap; only replies-to-own-sends + forward-in exist | [R06 §12] [R03 §5] |
| Inbound-mail → knowledge ingest (attachments/docs from forwarded mail into the second brain) | MISSING — `ingest-document` exists but nothing bridges `inbound_mail` to it | [R13 §7.6] [R13 §8.6] |

## 10. Social management

| Capability | Class | Evidence |
|---|---|---|
| social-publish — approval spine → Ayrshare, 9 platforms, per-brand keys fail-closed, per-platform refusal gates | WORKING 🔌 | [R13 §9.8] |
| social-sync metrics read-back (nullable metrics, never fake 0; 6-hourly cron) | WORKING 🔌 | [R13 §9.9] |
| Social board (per-platform CTA/hashtag caps, world-scoped voice, AI-media provenance stamped before queueing) | WORKING | [R05 §9.4] |
| Content weeks (producer → judged fail-closed → ONE weekly approval → drain; auto_mode after 3 clean weeks, revocable) | WORKING 🔌 — the one earned-autonomy loop in production | [R03 §6] [R13 §6.3] |
| Marketing Publish/Schedule → the real social rail (fixed post-audit; email/manual = deliberate operator handoff) | WORKING 🔌 | [R06 §9] |
| **Canvas "Change it with Garvis" (ArtifactSheet)** | **DISCONNECTED** — decision contract is only reply/create/revise; no bridge to `queueSocialPost`; the publish loop is one room over | [R06 §9] [R06 §15 #1] |
| Faceless-account reels engine (`reel_jobs`/`reel_clips` schema) | PARTIAL — dead schema, zero code consumers; engine never built | [R03 §7] [R06 §15 #2] |
| Ads: OAuth connect, read-only Meta/Google sync, daily anomaly watchdog, draft gallery | WORKING 🔌 (read-only BY DESIGN) | [R13 §9.10–9.11] |
| Ad placement writes (campaign create/pause/budget) | MISSING (deliberate; planned only after read-sync proves out) + EXT-REQUIRED (Meta/Google write APIs) | [R06 §11] |

## 11. Content / video

| Capability | Class | Evidence |
|---|---|---|
| Image generation (gpt-image-1) with the honesty gate (never fake a real property; guardrails; provenance stamp) | WORKING 🔌 | [R13 §8.10] [R05 §9.5] |
| render-design — brand cards to real pixels server-side (satori→resvg), no AI disclosure needed | WORKING | [R13 §8.9] |
| Storyboard video (real vault photos → Shotstack mp4; a beat with no photo renders a SHOOT direction, never a fake frame) | WORKING 🔌 — manual, grade C | [R03 §7] [R05 §9.5] |
| Veo Scene Studio (Veo 3.1 curated photoreal scroll-clip library, operator-approved before use) | WORKING 🔌 | [R13 §8.11] |
| Short-script writer (`fidelity:'script_only'` force-stamped client-side — the model cannot lie) | WORKING | [R13 §6.8] |
| Reel studio (3-stage pure pipeline: ideation → script → scenes; banned-phrase list; zero AI calls) | WORKING (deterministic) | [R05 §9.3] |
| Reel RENDER engine (Sora/Runway/Luma per-scene, ElevenLabs voiceover) | MISSING + EXT-REQUIRED — priced in the credits ledger, schema exists, zero provider code | [R13 §10.2] [R13 §13.6] |
| Nine producers (research/social/video/reel/angle/ads/ideas/feature-spec/business-plan) | WORKING | [R05 §9.20] |
| **Depth engine (research → draft → red-team → refine)** | **DISCONNECTED** — wired to 1 of ~8 producers (business plans only) | [R03 §2] |

## 12. CRM / leads

| Capability | Class | Evidence |
|---|---|---|
| Contacts CRM (stages, notes, delete, unified activity timeline; suppression sacred, per-address) | WORKING | [R03 §5] [R05 §9.22] |
| Prospect pipeline board (honest derived stages, detail drawer, live post-send signals, Replied filter, read-reply in place) | WORKING | [R03 §4] [R05 §9.18] |
| Leads capture (site-events, claim-submit, automation-intake) + owner webhook notification | WORKING 🔌 | [R13 §7.13–7.15] |
| Customer lists / segments feeding batch sends and triggers | WORKING | [R13 §6.3] |
| Email-finding enrichment (fetch-url contact mode incl. de-obfuscation) | WORKING | [R13 §8.4] |
| People-table unification | PARTIAL + ARCH-CHANGE — "six unreconciled people tables" debt stands | [R03 §5] |
| Third-party lead enrichment / scoring | MISSING + EXT-REQUIRED (Apollo/Clearbit-class) | [grep: no source] |

## 13. Branding

| Capability | Class | Evidence |
|---|---|---|
| Brand board AI logo concepts (style library; "not final or trademarked art" note on every result) | WORKING 🔌 | [R05 §9.4] |
| Brand kits + vault files feeding postcards/social/sites | WORKING | [R05 §9.27] |
| Design DNA for generated apps (8 named archetypes, anti-"AI slop" rules, token-only styling) | WORKING | [R13 §10.13] |
| Per-brand sending domains + sender identities (brand-true from-addresses) | WORKING 🔌 | [R03 §5] |
| Per-world voice isolation (one business's voice never bleeds into another's) | WORKING | [R05 §9.4] |
| Brand finalization (vector logo delivery, trademark workflow, brand guidelines doc) | MISSING | [R05 §9.4] |

## 14. Apparel / product

| Capability | Class | Evidence |
|---|---|---|
| Apparel / print-on-demand (design → garment → order → fulfillment) | MISSING + EXT-REQUIRED (Printful/Printify-class) — zero code hits for apparel/merch/POD anywhere | [grep] |
| E-commerce storefront for products | PARTIAL — generated apps get merchant-compliance + Stripe guidance and the builder can produce store UIs; no product/order/inventory pipeline of the platform's own | [R03 §1] [R13 §10.13] |
| Product mockup imagery | PARTIAL — generic gpt-image-1 exists; no mockup templating | [R13 §8.10] |
| Retail vertical knowledge pack | WORKING (seed framework data only) | [R05 §9.14] |

## 15. Artwork provenance

| Capability | Class | Evidence |
|---|---|---|
| AI-media provenance (first-stamp-wins, can never be stripped; disclosure gate before publish) | WORKING | [R05 §9.5] |
| Vision cataloging of artwork/images ("describe ONLY what is visible; never invent an artist, title, price") | WORKING | [R13 §8.6] |
| Flagship artist portfolio (scroll-story; packaged as a real project riding the normal edit/deploy pipeline) | WORKING as showcase | [R05 §12.3] |
| `/dev/flagship-artist` spike page (ungated in production — flagged risk) | PROTOTYPE-ONLY | [R03 §10] |
| Artwork grants / physical-art provenance registry (editions, certificates, collector records) | DOCUMENTED-ONLY — exists only in `docs/experience-architecture/`; no code | [grep] |
| Certificates of authenticity / provenance chain for physical works | MISSING | [grep] |

## 16. Campaign development

| Capability | Class | Evidence |
|---|---|---|
| Campaign playbooks as data (`plays.ts`: ordered productions across a web's clusters, slug-stable re-runs) | WORKING | [R05 §9.26] |
| 3-stage campaign generator + deterministic verifier gating publishing | WORKING | [R05 §9.6] |
| Campaign composer (one form → postcard + 4 posts + email) | WORKING | [R03 §6] |
| Marketing mission worker (full campaign via generateCampaign, all reviewable drafts) | WORKING | [R05 §3.1] |
| Research-on-record grounding injected into campaign strategy ("never contradict it") | WORKING | [R05 §9.6] |
| Cross-channel orchestration on the clock (email leg = deliberate manual audience handoff) | PARTIAL | [R06 §9] |
| Per-channel results attribution (row counts only; uninstrumented channels say so) | PARTIAL | [R05 §9.27] |

## 17. Research / explore / simulation

| Capability | Class | Evidence |
|---|---|---|
| Explorer / rabbit holes (credit-gated turns, galaxy + 3D universe, cluster cartographer) | WORKING — still filed under admin-only "Labs" nav yet embedded in Command home | [R03 §3] |
| Rabbit hole → build brief bridge → NewProject → app → mounted Room (the two halves interlock) | WORKING | [R06 §13b] |
| Deep research (140k-char source digest + Anthropic web_search, cited, calibration-prompted) | WORKING 🔌 | [R13 §8.13] |
| research_market action (persisted Serper-cited briefs) | WORKING | [R05 §4.2] |
| Lab Bench (deterministic simulations with basis/assumptions/what-it-does-NOT-model) | WORKING | [R05 §9.21] |
| Inquiry / theory scaffold (falsifier-required; spawns experiment sparks) | WORKING | [R05 §9.21] |
| Market-intel category scans (read-only, capped) | WORKING 🔌 | [R05 §9.21] |
| Data workspace (real CSV parser; every number computed in pure code; model only narrates) | WORKING | [R05 §9.21] |
| **Builder research persistence** | **DISCONNECTED** — web_search research evaporates into chat, never routed to ingest-document/knowledge | [R06 §8] |
| Free-floating research (no-world) | MISSING (deliberate) | [R06 §15] |
| Insights proximity scanner (periodic "Garvis noticed a connection") | DISCONNECTED — insights fire only on document upload; not on the clock | [R03 §3] [R06 §8] |

## 18. App / site building (FableForge)

| Capability | Class | Evidence |
|---|---|---|
| 11-stage generation pipeline (contracts → parallel pages → static QA → real tsc gate → agentic repair → zombie auto-resume) | WORKING [A−] | [R03 §1] [R05 §12.2] |
| Conversational edit (agentic tool loop, review-before-write, safeedit guardrails) | WORKING | [R03 §1] [R05 §14] |
| Feature branches + readiness-gated merge (green-candidate-only; Main never broken) | WORKING | [R05 §14] |
| Autopilot (job-worker: checkpointed phases, leases, self-chain, budget caps) | WORKING 🔌 | [R13 §4.5] |
| Deploy: deploy-site / deploy-backend / provision-supabase / apply-migration / db-console / project-logs | WORKING 🔌 — deploy approval executors are REAL (deploy_bundles consumed) | [R06 §4] [R13 §5] |
| GitHub export (Git Data API full snapshot) | WORKING 🔌 (serial, no retry) | [R03 §1] |
| ai-gateway — managed AI for generated apps, metered at 1.25× against owner credits | WORKING 🔌 | [R13 §9.12] |
| Rooms — built apps mounted back inside worlds (sandboxed iframes) | WORKING | [R03 §1] |
| Project Brain / plan mode / research / roadmap / ideation | PARTIAL — several DIRECT-mode-only; die when the tab closes | [R03 §1] |
| Server generate-app single-stream pipeline | WORKING but legacy — "rotting fork", still deployed | [R03 §1] |
| Custom domains for builder apps | DOCUMENTED-ONLY | [R03 §1] |
| Vercel as deploy target | DOCUMENTED-ONLY — name reserved in the connections enum; no probe, no call path | [R07 §1] |
| Cloud Console CC2–CC9 (auth users, storage, backups parity) | PARTIAL — CC1 built (db-console); rest spec-only | [R07 §1] |

## 19. Automation platform

| Capability | Class | Evidence |
|---|---|---|
| Standing orders (watch_url, cadence_digest, client_hunt, idea_stream, content_week, opportunity_hunt) + 8 drain/sweep subsystems | WORKING 🔌 — standing-worker is the de-facto second application (2,375 lines) | [R13 §6.3] [R13 §13.10] |
| Orchestrator: intent → compiled plan over 21-action catalog → durable resumable arcs + ARC WAKE LOOP | WORKING | [R05 §4] |
| Client trigger engine (registry, window guard, once-only keys, claim-first, consent gates, `trigger_fires` ledger) | WORKING 🔌 (email); SMS leg DISCONNECTED (enum) | [R03 §8] [R06 §15 #0] |
| Automation capability registry (honest maturity; `not_built` never proposed, surfaces as a gap) | WORKING | [R05 §9.23] |
| Deterministic automation detection from scraped signals + free-text intake | WORKING | [R05 §9.23] |
| Per-client automation config + ROI stats + attribution to paying clients | WORKING 🔌 | [R03 §8] |
| Generated-app automation: `automation-runner` + per-minute pg_cron wired into the CHILD project at deploy | WORKING 🔌 | [R13 §5.3] [R13 §13.8] |
| Automation versioning / staging / test harness / self-repair | MISSING | [charter; no evidence anywhere in R03/R05/R06/R13] |
| Cohort rollout of an automation across many clients | MISSING + ARCH-CHANGE | [R03 §8: per-client config only] |

## 20. Recurring client ops

| Capability | Class | Evidence |
|---|---|---|
| Booking (public page → DB-exclusion double-book guard → confirmations + day-before reminders) | WORKING 🔌 — but the function is in NO deploy list (§DISCONNECTED) | [R13 §7.12] [R13 §13.4] |
| Invoices + 4-rung chase ladder ("PAID is a fact only the operator confirms") | WORKING 🔌 | [R05 §9.26] [R13 §7.10] |
| Paperwork front half (sample → {{token}} template → merge with visible holes → refuse-unsendable) | WORKING | [R03 §8] |
| DocuSign send + webhook (HMAC fail-closed) + signed-PDF filing to the world | WORKING 🔌 (sandbox default) | [R13 §9.5–9.6] |
| DocuSign back half (auto-template → auto-populate from client records → trigger-send) | PARTIAL — the middle is the gap; filing exists | [R06 §6] |
| Monthly automation report (numbers from ledger rows; "Quiet month so far") | WORKING | [R05 §9.23] |
| Client console rollups (per-client automations, honest Unassigned bucket) | WORKING | [R05 §9.22] |
| Multi-business isolation (world-scoped reads, per-world sender identity) | PARTIAL — author's own "~70% true" for two companies cleanly | [R03 §8] |
| Inherited service packages / per-cohort client ops (T-10 concept) | MISSING | [no evidence] |

## 21. Portfolio management

| Capability | Class | Evidence |
|---|---|---|
| Situation digest consumed by every planner surface (fail-soft probes, honest truncation) | WORKING | [R05 §9.15] |
| Universe 2D/3D (bands = structural commitment; undercounts honestly) + system altitude per world | WORKING | [R03 §3] [R05 §9.9] |
| Next Move engine (deterministic ranking, max 3, honesty basis tags) | WORKING | [R05 §9.12] |
| Goals / objective / follow-through accountability (open loops computed, not stored) | WORKING | [R05 §9.12] [R05 §9.16] |
| Portfolio triage with strategic guard in CODE (core apps can never be archived) | WORKING | [R05 §9.16] |
| Morning pulse + Sunday scorecard (quiet night sends NOTHING) | WORKING 🔌 | [R13 §6.4–6.5] |
| Gardener (cross-world recurring-thread surfacing; never merges, only surfaces) | WORKING | [R05 §9.11] |
| Portfolio synergies (`garvis_opportunities` — connections between YOUR ventures) | PARTIAL — backend real, surface thin | [R03 §4] |
| World intelligence on the clock | DISCONNECTED — recomputes on visit only, not scheduled | [R03 §3] [R06 §8] |
| `apps` vs `knowledge_worlds` dual portfolio noun (no FK bridge) | PARTIAL + ARCH-CHANGE — "the core ambiguity" | [R03 §9] [R06 §15] |
| Two mission writers with incompatible lifecycles | PARTIAL | [R03 §9] [R06 §15] |
| Fleet-level portfolio control plane (100s–1000s of operations, exception-only attention) | MISSING + ARCH-CHANGE | [charter; substrate is single-operator throughout R03–R13] |

## 22. Billing / credentials / cost / logs / security

| Capability | Class | Evidence |
|---|---|---|
| Stripe SaaS billing (Pro, checkout, portal, idempotent webhook, canonical `syncSubscription`) | WORKING 🔌 — legacy `subscriptions` table still read by Billing.tsx (dual-generation drift) | [R03 §1] [R07 §2.5] |
| Client billing (Payment Links, sale activation, churn, failed-invoice notes) | WORKING 🔌 | [R13 §9.1–9.3] |
| Credits + per-kind metering on every AI surface; ai-gateway margin | WORKING 🔌 | [R13 §10.2] |
| provider_connections token vault (RLS zero-policy; tokens never reach the browser) + OAuth PKCE flow + probe-validated pastes | WORKING | [R07 §3.1] |
| Secrets surfacing (~21 edge secrets; Health board presence map; go-live tiers, all fail-closed) | WORKING | [R03 §10] [R07 §6] |
| Webhook auth never optional (Stripe sig, Svix, Twilio HMAC, DocuSign fail-closed, capability tokens, cron secrets) | WORKING | [R07 §7] |
| RLS everywhere + in-CI RLS audit + migration-collision guard | WORKING | [R03 §10] [R05 §11] |
| Nightly canary (live wiring + send-gate refusal test) + weekly scorecard | WORKING 🔌 | [R13 §6.7] |
| CI: tsc + 116 verify suites + build + deno-check all functions + 4-layer Playwright; deploys test-gated | WORKING | [R03 §10] |
| Six unwired verify files (workerParity, productLifecycle, mindContextRun, agentRunControl, missionRun, deploymentApproval) | DISCONNECTED — exist, never run in CI | [R05 §11] |
| Verify coverage of the AI decision layer (brain, executeTool, ~51 `*Run.ts`) | MISSING | [R06 §13] |
| Per-user cost/usage admin charts; failed generations; logs | WORKING | [R03 §1] |
| Fleet cost-anomaly detection (own AI spend across many clients) | MISSING + ARCH-CHANGE | [no evidence; ads-watch pattern exists as the template, R13 §9.11] |
| Data export + account deletion (compliance) | DOCUMENTED-ONLY | [R03 §10] |
| `/dev/flagship-artist` ungated in production | PROTOTYPE-ONLY (flagged risk) | [R03 §10] |
| booking + sender-domain deploy-list absence | DISCONNECTED — see register below | [R13 §13.4] |

---

## DISCONNECTED register — every built-but-not-connected item, and what it is not connected TO

The charter's central disease. Each item below is built to (or near) house standard and severed
from exactly the thing that would make it matter.

| # | Built thing | Not connected to | One-line repair shape | Evidence |
|---|---|---|---|---|
| 1 | **The entire SMS rail** — `send-sms` executor, `sms.ts` TCPA/E.164/segment core, Twilio integration, trigger-engine SMS channel, per-client from-numbers | The `approval_kind` DB enum (`'send_sms'` never added) — every SMS approval INSERT fails, so the approval-gated rail is latent-dead | One-line enum migration | [R03 §5] [R06 §15 #0] |
| 2 | Canvas social ArtifactSheet ("Change it with Garvis") | `queueSocialPost` / the real publish rail — decision contract has no publish verb; verified by grep, no bridge exists | Add a publish verb routing to the existing approval path | [R06 §9] [R06 §15 #1] |
| 3 | Depth engine (research → draft → red-team → refine) | 7 of ~8 producers — only business plans get depth | Wire producers through the existing loop | [R03 §2] |
| 4 | Insights engine ("Garvis noticed a connection") | The clock — fires only on document upload; no periodic proximity scanner | Standing order over existing cosine machinery | [R03 §3] [R06 §8] |
| 5 | World intelligence (intel/reflection/momentum) | The clock — recomputes on visit only | Cron the existing `gather()` | [R03 §3] [R06 §8] |
| 6 | Builder research output (Anthropic web_search in the workspace) | Knowledge/memory — evaporates into chat; never persisted via ingest-document | Route result through existing ingest | [R06 §8] |
| 7 | `booking` edge function (public customer-facing API) | Every deploy list (npm lists + workflow curated lists) — manual deploy only; silently absent from a fresh environment | Add to deploy list | [R13 §1] [R13 §13.4] |
| 8 | `sender-domain` edge function (per-brand deliverability) | Every deploy list — same gap | Add to deploy list | [R13 §7.3] [R13 §13.4] |
| 9 | Six verify files (incl. workerParity — the worker-tool-drift guard) | `package.json`/CI — exist but never run | Wire the scripts | [R05 §11] |
| 10 | Marketing email/`manual` channel assets | The send rail — deliberate operator handoff (audience must be human-chosen); honest label, but the loop ends at a prefilled composer | Deliberate; revisit at T-10 | [R06 §9] |
| 11 | Reel schema (`reel_jobs`/`reel_clips`, faceless roster) | Any engine — zero code consumers (classified PARTIAL above; listed here because the schema half was built to standard) | Build or drop | [R03 §7] [R06 §15 #2] |
| 12 | Portfolio synergies (`garvis_opportunities`) | An attention surface — backend rows exist, UI thin | Surface in Queue/NextMove | [R03 §4] |
| 13 | Legacy `subscriptions` table | The canonical `stripe_subscriptions` — Billing.tsx still reads the superseded generation | Repoint one read | [R03 §1] |

**Posture cousin (not a code gap): the heartbeat never self-arms.** Everything 🔌 in this
document — roughly half the WORKING rows — is built AND dark until `garvis_arm_heartbeat()` runs
and secrets are set. The Master Switch, Health board, and go-live checklist exist; arming remains
an operator act, and the CI self-arm step defaults off [R06 §0] [R13 §2].

---

## Class census (this inventory's rows, substrate excluded)

WORKING ≈ 118 (of which ~44 are 🔌 dark-until-armed/keyed) · DISCONNECTED 13 (register above; 8
carried in domain tables) · PARTIAL 18 · PROTOTYPE-ONLY 2 (plus the five `prototypes/` HTML
experiments, preserved per charter non-goals) · DOCUMENTED-ONLY 8 · MISSING 24 (of which 9
+EXT-REQUIRED, 4 +ARCH-CHANGE). The verified pattern from [R13 §13.1] holds: nothing is
meaningfully stubbed — what exists makes real API calls and degrades honestly; the gaps are
absence and disconnection, not fakery.

---

## Matrix rows

| Capability | Class | Evidence | Needed-at | Owner object | Note |
|---|---|---|---|---|---|
| MLS sync (RESO) | WORKING | [R13 §9.7] | T-ME | Capability | 🔌 manual button; no cron |
| MLS scheduled refresh | MISSING | [R03 §8] | T-10 | Standing Order | one feed per operator today |
| Listing → full marketing set | WORKING | [R05 §9.6] | T-ME | Workshop | zero-AI, [EDIT] holes |
| Farm territories + do-not-mail | WORKING | [R05 §9.11] | T-ME | Capability | suppression fail-closed |
| Demographic/turnover data feed | MISSING + EXT-REQUIRED | [grep] | T-10 | Capability | ATTOM/Census candidate |
| Places discovery grid | WORKING | [R13 §8.1] | T-ME | Standing Order | 🔌 |
| Claude scout discovery | WORKING | [R13 §8.1] | T-ME | Capability | citation-grounded |
| Map/territory UI | MISSING | [grep] | T-10 | Workshop | no map lib anywhere |
| Hardened scrape (fetch-url + safeFetch) | WORKING | [R13 §8.4] | T-ME | substrate | |
| Tech fingerprint | WORKING | [R13 §10.16] | T-ME | Capability | |
| Rendered-DOM fetch (JS portals) | DOCUMENTED-ONLY | [R03 §11] | T-10 | Capability | |
| Postcard compiler (print-it-yourself) | WORKING | [R05 §9.24] | T-ME | Workshop | operator prints + logs |
| Print-vendor mail send | MISSING + EXT-REQUIRED | [R06 §15] | T-10 | Capability | Lob; specced in level-10 |
| Demo-site intelligence chain | WORKING | [R13 §6.3] | T-ME | Capability | strategist→auditor personas |
| Bespoke honest HTML sites | WORKING | [R05 §13] | T-ME | Capability | deterministic honesty gate |
| Zero-AI fallback site spec | WORKING | [R13 §10.17] | T-ME | Capability | the floor |
| Publish preview + photo re-host | WORKING | [R13 §5.1] | T-ME | Capability | 🔌 |
| Site pixel + instant first touch | WORKING | [R13 §7.13] | T-ME | Standing Order | 🔌 |
| Domain connect (DNS verified) | WORKING | [R13 §5.9] | T-ME | Capability | 🔌 never MX |
| Pay → auto-publish loop | WORKING | [R13 §9.1] | T-ME | Capability | 🔌 zero-browser |
| Client engagement + intake | WORKING | [R05 §9.22] | T-ME | Mission | |
| Client connections checklist | WORKING | [R07 §3.3] | T-ME | Capability | 3 connectors built:false |
| Payment reconciliation | MISSING | [R06 §15] | T-100 | substrate | deliberate today |
| send-email one path | WORKING | [R13 §7.1] | T-ME | substrate | 🔌 fan-in hub, 7 callers |
| Batch segment sends | WORKING | [R13 §10.11] | T-ME | Capability | 🔌 one approval, clock drains |
| Follow-up/reactivation crons | WORKING | [R13 §7.8] | T-ME | Standing Order | 🔌 approvals only |
| SMS rail | DISCONNECTED | [R06 §15 #0] | T-ME | Capability | enum lacks 'send_sms' |
| Missed-call text-back | WORKING | [R13 §7.11] | T-ME | Capability | 🔌 |
| Voice AI receptionist | DOCUMENTED-ONLY + EXT-REQUIRED | [R07 §2.16] | T-10 | Workshop | Twilio-only today |
| Earned autonomy generalized | PARTIAL | [R05 §6] | T-10 | substrate | eligible-not-granted |
| Campaign generator + verifier | WORKING | [R05 §9.6] | T-ME | Workshop | |
| Trigger engine (email) | WORKING | [R03 §8] | T-ME | Standing Order | 🔌 |
| Sequences/A-B beyond 2 bumps | MISSING | [R13 §7.8] | T-10 | Capability | |
| Reply ingest + classify | WORKING | [R13 §7.6] | T-ME | Capability | 🔌 |
| Overnight reply drafts + verdicts | WORKING | [R13 §7.7] | T-ME | Standing Order | 🔌 learning loop real |
| Whole-inbox IMAP/Gmail | MISSING + EXT-REQUIRED | [R06 §12] | T-ME | Capability | the "senses" gap |
| Inbound mail → knowledge ingest | MISSING | [R13 §8.6] | T-10 | Capability | no bridge to ingest-document |
| Social publish (Ayrshare ×9) | WORKING | [R13 §9.8] | T-ME | Capability | 🔌 per-brand keys |
| Social metrics read-back | WORKING | [R13 §9.9] | T-ME | Standing Order | 🔌 |
| Content weeks (earned auto) | WORKING | [R13 §6.3] | T-ME | Standing Order | 🔌 the autonomy proof |
| Canvas → publish bridge | DISCONNECTED | [R06 §15 #1] | T-ME | Capability | no publish verb |
| Reel render engine | MISSING + EXT-REQUIRED | [R13 §13.6] | T-10 | Workshop | schema dead, priced, unbuilt |
| Ads read-only sync + watchdog | WORKING | [R13 §9.10] | T-ME | Standing Order | 🔌 deliberate read-only |
| Ad placement writes | MISSING + EXT-REQUIRED | [R06 §11] | T-100 | Capability | deliberate deferral |
| Image gen + honesty gates | WORKING | [R13 §8.10] | T-ME | Capability | 🔌 |
| Storyboard → Shotstack video | WORKING | [R03 §7] | T-ME | Workshop | 🔌 manual, grade C |
| Veo scene library | WORKING | [R13 §8.11] | T-ME | Capability | 🔌 |
| Depth engine wiring | DISCONNECTED | [R03 §2] | T-ME | substrate | 1 of ~8 producers |
| Contacts CRM + timeline | WORKING | [R03 §5] | T-ME | Capability | |
| People-table unification | PARTIAL + ARCH-CHANGE | [R03 §5] | T-10 | substrate | six tables |
| Prospect pipeline board | WORKING | [R03 §4] | T-ME | Workshop | live signals |
| Third-party enrichment | MISSING + EXT-REQUIRED | [grep] | T-10 | Capability | Apollo/Clearbit-class |
| Brand boards + kits | WORKING | [R05 §9.4] | T-ME | Workshop | 🔌 |
| Apparel / print-on-demand | MISSING + EXT-REQUIRED | [grep] | T-SPEC | Workshop | Printful/Printify |
| Artwork provenance registry | DOCUMENTED-ONLY | [grep] | T-SPEC | Workshop | experience-arch docs only |
| AI-media provenance stamps | WORKING | [R05 §9.5] | T-ME | substrate | never strippable |
| Explorer / rabbit holes | WORKING | [R03 §3] | T-ME | Workshop | filed EXPERIMENTAL |
| Deep cited research | WORKING | [R13 §8.13] | T-ME | Capability | 🔌 Anthropic-only |
| Builder research persistence | DISCONNECTED | [R06 §8] | T-ME | Capability | evaporates in chat |
| Insights proximity scanner | DISCONNECTED | [R06 §8] | T-10 | Standing Order | upload-only trigger |
| Lab sims / theory scaffold / data workspace | WORKING | [R05 §9.21] | T-ME | Workshop | deterministic |
| 11-stage app generation | WORKING | [R05 §12.2] | T-ME | Capability | A− pillar |
| Agentic edit + branches + merge | WORKING | [R05 §14] | T-ME | Capability | |
| Autopilot builds (job-worker) | WORKING | [R13 §4.5] | T-ME | Mission | 🔌 |
| Deploy/provision/backend rail | WORKING | [R13 §5] | T-ME | Capability | 🔌 real executors |
| ai-gateway for generated apps | WORKING | [R13 §9.12] | T-ME | substrate | 🔌 1.25× margin |
| Builder-app custom domains | DOCUMENTED-ONLY | [R03 §1] | T-10 | Capability | prospect domains exist |
| Standing orders + drains | WORKING | [R13 §6.3] | T-ME | substrate | 🔌 |
| Orchestrator arcs + wake loop | WORKING | [R05 §4] | T-ME | substrate | 21-action catalog |
| Automation registry (honest maturity) | WORKING | [R05 §9.23] | T-ME | substrate | not_built never proposed |
| Automation versioning/testing/repair | MISSING | [no evidence] | T-100 | substrate | charter expectation confirmed |
| Cohort automation rollout | MISSING + ARCH-CHANGE | [R03 §8] | T-100 | substrate | per-client only today |
| Booking + reminders | WORKING | [R13 §7.12] | T-ME | Capability | 🔌 deploy-list gap |
| Booking/sender-domain deploys | DISCONNECTED | [R13 §13.4] | T-ME | substrate | in no deploy list |
| Invoice + chase ladder | WORKING | [R13 §7.10] | T-ME | Standing Order | 🔌 |
| DocuSign send/webhook/filing | WORKING | [R13 §9.5] | T-ME | Capability | 🔌 sandbox default |
| DocuSign auto-populate middle | PARTIAL | [R06 §6] | T-10 | Capability | the back-half gap |
| Multi-business isolation | PARTIAL | [R03 §8] | T-10 | substrate | "~70% true" |
| Situation digest | WORKING | [R05 §9.15] | T-ME | substrate | Field UI docs-only |
| Next Move + goals + triage | WORKING | [R05 §9.12] | T-ME | substrate | deterministic ranking |
| Pulse + scorecard + canary | WORKING | [R13 §6.4] | T-ME | Standing Order | 🔌 quiet-when-green |
| World intel on the clock | DISCONNECTED | [R06 §8] | T-10 | Standing Order | visit-only recompute |
| apps↔worlds noun bridge | PARTIAL + ARCH-CHANGE | [R03 §9] | T-10 | substrate | the core ambiguity |
| Fleet control plane | MISSING + ARCH-CHANGE | [charter] | T-100 | substrate | single-operator substrate |
| Stripe SaaS + credits | WORKING | [R07 §2.5] | T-ME | substrate | 🔌 legacy-table read drift |
| Token vault + OAuth | WORKING | [R07 §3.1] | T-ME | substrate | zero-policy RLS |
| Per-client credential mgmt at scale | MISSING + ARCH-CHANGE | [R07 §3] | T-100 | substrate | 3 systems, operator-scoped |
| CI + verify harness | WORKING | [R05 §11] | T-ME | substrate | 116 suites |
| Unwired verify files | DISCONNECTED | [R05 §11] | T-ME | substrate | 6 files, incl. workerParity |
| AI-layer test coverage | MISSING | [R06 §13] | T-10 | substrate | brain/executeTool/*Run.ts |
| Fleet cost anomaly watch | MISSING + ARCH-CHANGE | [R13 §9.11] | T-100 | substrate | ads-watch is the template |
| Data export / deletion | DOCUMENTED-ONLY | [R03 §10] | T-10 | Capability | compliance |
| Heartbeat self-arm | PARTIAL | [R06 §0] | T-ME | substrate | ships OFF; CI step defaults off |
