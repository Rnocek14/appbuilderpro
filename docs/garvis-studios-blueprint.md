# Garvis Studios Blueprint — Work Webs, Cluster Studios, Mom Real Estate, Video, Design, Lists, MLS

*Deep scan follow-up to `garvis-system-architecture.md`. Covers: Work Web maturity verdict, the
Studio layer (in-cluster AI chat + tools + artifacts + versions + approvals), the complete Mom Real
Estate system, the traction-engine video harvest map, the Design Studio (image gen + print PDF +
social PNG), mailing lists / audience, MLS/IDX, make-vs-API, data model, UX, roadmap, next sprint.*

---

## 1. Executive Verdict

**How close are we to the real Work Web / Studio vision? The skeleton is built and correct; the
studio muscle is not there yet.** Phase 5 gave us the right bones — charters on clusters, a
`(archetype, flavor) → tools` registry, deterministic plays, mission↔world binding, and
approval-gated execution. What a cluster is *missing* to be a real studio is four things, and they
are the same four for every domain:

1. **In-cluster AI chat** — you can't yet talk to a production area ("make this more luxury").
2. **A files/assets layer per cluster** — brand kit, uploaded photos, list attachments.
3. **Artifact versions** — a postcard is one row today; it needs v1/v2/v3 + "approved version".
4. **Real generative tools** — today tools write *text* artifacts; a Studio needs image gen, PDF
   export, video, and list operations.

The honest scoreline: **Work Web engine 8/10, Cluster-as-Studio 3/10, Mom Real Estate coverage 4/10
(structure yes, studios no), Execution safety 8/10, Video 0/10 (all in traction, none ported),
Design/image 0/10 in Garvis (but 90% harvestable from your other repos).**

The good news the scan proved: **almost nothing needs to be invented.** You already own — across your
own repos — production AI image generation (Lake Geneva Brief, `gpt-image-1`), a print-PDF pattern
(credit-optimizer, `@react-pdf/renderer`), a social-PNG exporter (launch-buddy-bot, `html-to-image`),
a full multi-provider video pipeline + ffmpeg assembly (traction-engine), and the section-template
architecture (appbuilderpro `previewSpec`). The work is **harvest, retarget, secure, and wire into
the cluster studio shell** — not greenfield.

**The one hard rule this blueprint keeps:** don't let it sprawl. The cluster studio is *one*
reusable shell. Every "studio" (Direct Mail, Video, Email, Ads, Landing, Design) is that same shell
with a different tool pack + a different artifact renderer. Build the shell once; the studios are
data.

---

## 2. Current System Inventory (what exists, verified)

### appbuilderpro / Garvis core
- **Brain** (`app_0021`): pgvector `embeddings`, `documents` intake, `insights`, `match_embeddings`.
- **Execution spine** (`app_0022`): `approvals` (one queue) + `execution_runs` (one ledger).
- **Outreach** (`app_0023`+`app_0025`): owner-scoped CRM (contacts unique on owner+email, campaigns,
  messages, replies, suppression) + `send-email` (approval+suppression+cap+warmup gated) + Resend
  webhooks + follow-up cron.
- **Work Web** (`app_0024`): `knowledge_clusters.charter` jsonb, `garvis_missions.world_id`,
  `outreach_campaigns.world_id`; pure model `workweb.ts` + `plays.ts` (verified 33/33), impure
  `workwebRun.ts`, UI `/garvis/webs`.
- **Agent chassis**: `agent_runs` (lease/checkpoint/budget), mode-gated observe→plan→act tools
  (`src/lib/garvis/tools.ts`, `runtime.ts`), `garvis-brain` reasoning seam, `garvis-worker` unattended.
- **Missions/workers**: `garvis_missions`/`garvis_tasks`, worker pool (research/analytics/marketing/
  bug/builder). **Marketing** worker writes `marketing_campaigns`/`marketing_assets`
  (`app_0010`; kinds strategy|calendar|social_post|email|landing_page, `content` jsonb, draft→publish).
- **Preview/outreach engine**: `ingest-profile` → SiteSpec (section registry `_shared/previewSpec.ts`)
  → critique → audit → pitch → public `/preview-site/:slug` → claim → `shot-worker` screenshots.
- **Assets**: bucket `project-assets` (public read), table `project_assets`
  (owner/project/name/url/alt/source/w/h), `documents` bucket, `useAssets` hook.
- **Image**: CONCEPTS only (`generateImageArtifact` returns a prompt, no pixels); `discover-media`
  finds existing web images (Perplexity/Serper); `shot-worker` = ScreenshotOne (PNG of a route).
- **No** image generation, PDF, or video anywhere in Garvis today.

### traction-engine (video — none ported yet)
- Two flows (script + story) sharing `video_jobs` + a Fly.io `ffmpeg-service`.
- Providers: **Sora** (`/v1/videos`, `sora-2`/`sora-2-pro`), **Runway** (`gen3a_turbo`/`gen4_turbo`),
  **Luma** (`ray-2`), **ElevenLabs** VO (+word-timestamps), **OpenAI** storyboard (`gpt-4o`).
- `ffmpeg-service`: real filtergraph (xfade, audio ducking via sidechain, freeze-extend),
  idempotent, in-memory job store, SSRF allowlist. **Security: every function `verify_jwt=false`,
  RLS `USING(true)`, and `assemble-reel` ships the raw service-role key in the request body; the
  ffmpeg allowlist is hardcoded to traction's Supabase host.** All must be fixed on port.

### The other repos (mined for parts, not merged)
- **idea-digester-spark (Lake Geneva Brief)**: `generate-post-image` (`gpt-image-1`, base64 →
  `generated-images` bucket → public URL) — the image-gen reference; `real_estate_metrics` +
  market-report content — Mom's market data source; newsletter HTML templates.
- **credit-optimizer**: `@react-pdf/renderer` templates (`CertificatePDFTemplate`,
  `TrackResumePDF` + `PDFDownloadLink`) — the print-PDF pattern; `ai-model-router` image route
  (richer params + retry).
- **launch-buddy-bot**: `ResultShareCard` (1080×1080) + `ShareResultDialog` (`toPng` @ pixelRatio 2)
  — the social-PNG exporter; `jsPDF` report generator.
- **swift-prep-pros**: discovery (Google Places) + Firecrawl enrichment — the scraper feed for the
  website-outreach business.

---

## 3. Missing Pieces (by studio)

| Studio | Have | Missing |
|---|---|---|
| **Cluster shell** | charter, tools, artifacts (1 per slug) | in-cluster AI chat, files, **artifact versions**, approval-per-artifact |
| **Mom RE** | web template, lakefront play | studios below, brand kit, market-data feed, list model |
| **Direct Mail** | text postcard artifacts | image gen, template render, **print PDF**, mailing-list pick, cost est, vendor (Lob) |
| **Video** | nothing in Garvis | port Sora/Runway/Luma + ffmpeg + VO; storyboard; attach to cluster |
| **Design** | project_assets bucket, previewSpec registry | image gen fn, template registry, PNG/PDF export, brand kit table |
| **Email** | send-email, sequences, suppression | segmented sends to a list, newsletter template, per-web settings |
| **Mailing Lists** | contacts table | households/properties/lists/segments/consent/source model, CSV clean/dedupe, EDDM |
| **MLS/Listings** | `real_estate_metrics` (in LGB) | listings/comps model, manual import, RESO/IDX (broker-gated, later) |
| **Ads** | nothing | creative variants + copy + budget as artifacts; platform APIs (much later) |
| **Landing** | preview engine builds pages | "web → landing page" wiring, lead form → contacts, QR from mailer |
| **Results/ROI** | rollupWeb (artifacts/approvals/sent/replies) | opens/clicks (Resend), page visits, form submits, cost, ROI, next-move |

---

## 4. Proposed Architecture — one hub, one studio shell, reusable studios

**Do not build separate apps.** Garvis (this repo) is the hub. Everything is:

```
GARVIS HUB (appbuilderpro, one Supabase)
│
├── Cluster Studio Shell  (ONE reusable component + one runtime)
│     charter · AI chat · tool pack · files · artifacts+versions · approvals · results · next move
│
├── Studios = shell + a tool pack + an artifact renderer (DATA, not new apps)
│     Intel · Audience · DirectMail · Video · Design · Email · Ads · Landing · Loop · Ledger · Vault
│
├── Generative services (edge functions, secrets server-side)
│     generate-image (gpt-image-1) · video-* (Sora/Runway/Luma) · render-pdf / render-png ·
│     send-email (have) · embed/ingest (have)
│
├── External connectors (approval-gated, logged to execution_runs)
│     Resend (have) · OpenAI images · Sora/Runway/Luma · ElevenLabs · Lob (later) ·
│     Meta/Google Ads (much later) · RESO/IDX (broker-gated, later)
│
└── Services outside Supabase
      ffmpeg-service (Fly.io, harvested) · scraper runners (swift-prep) → /ingest-profile
```

**The pattern that keeps it simple:** a "studio" is not code — it's a `charter.flavor` + a tool pack
in `workweb.ts` + an artifact-renderer switch in the UI. Adding "Ads" = add a flavor, a tool row, and
a renderer case. Never a new page, never a new subsystem.

---

## 5. Full Mom Real Estate Work Web (exact clusters, tools, artifacts, flow)

Extends `MOM_REAL_ESTATE_TEMPLATE` in `workweb.ts`. New flavors in **bold**.

```
Mom Real Estate Marketing (world)
├── Brand (vault/brand) ............. brand kit: logo, colors, fonts, headshots, bio, compliance line
├── Market Intel (intel/market) ..... research + LGB market-data feed → market-snapshot artifacts
├── Audience / Mailing Lists (audience/lists) .. lists, segments, upload CSV, dedupe, suppression
├── MLS / Listings (intel/**listings**) ....... manual listing/comp import → listing artifacts
├── Campaign Angles (intel) ......... synthesize angle artifacts (the play's angle step)
├── Direct Mail Studio (launch/direct_mail) ... postcard → image → PDF → list → cost → approve
│   ├── Strategy · Lists · Creative · Print&Send · Follow-Up · Results  (already decomposed)
├── Ad Studio (studio/**ads**) ...... FB/IG/Google creative + copy + budget artifacts (export only, MVP)
├── Video Studio (studio/video) ..... script → storyboard → VO → clips → reel (harvested pipeline)
├── Email / Newsletter (loop/email) . segmented sends to a list; newsletter template; sequences
├── Landing Pages (studio/landing) .. build w/ Preview Engine; lead form → contacts; QR target
├── CRM Follow-Up (loop/crm) ........ lead status, tasks, call scripts, handoff to mom
├── Automation (loop) ............... what runs on its own + kill switches
├── Results / ROI (ledger) .......... sent, opens, clicks, visits, forms, calls, cost, ROI, next move
└── Opportunities (intel) ........... "Garvis noticed": expireds, price cuts, new lakefront inventory
```

**North-star flow — "build a Lake Geneva lakefront seller campaign for my mom":**
1. Garvis opens the Mom world, loads **Brand** (kit) + **Market Intel** (LGB feed) + **Audience**
   (lakefront-owners list) into context.
2. **Run the play** → research + angle + postcard copy + email sequence + landing outline + social +
   video script land in their studios (already works).
3. **Direct Mail Studio**: generate postcard image (gpt-image-1) → compose into the 6×9 template →
   render print-ready PDF → pick the "lakefront owners" list → cost estimate → **queue approval**.
4. **Video Studio**: turn the market-video script → storyboard → ElevenLabs VO → Sora clips →
   ffmpeg reel → artifact on the Video cluster.
5. **Landing**: Preview Engine builds the "know your number" page; its lead form writes `contacts`;
   the postcard's QR points at it.
6. **Email**: segmented send of touch 1 to the list → **approval queue** → `send-email`.
7. **Results**: opens/clicks (Resend), page visits, form submits roll up; Garvis proposes the next move.

Everything outward-facing (mail, email, ads, deploy, spend) stops at the **approval queue** and lands
in the **execution ledger**.

---

## 6. Direct Mail Studio — complete pipeline

The most valuable studio for Mom (luxury sellers respond to mail). Pipeline:

```
angle/copy (play, have)
  → generate-image (gpt-image-1: the artwork layer, 1024×1536 portrait)   [ADAPT from LGB]
  → compose into a Postcard Template (previewSpec-style registry: 4×6 / 6×9 / 6×11 + 0.125" bleed)  [BUILD, small]
  → render-pdf (React-pdf, custom Page size in points, native-res image = 300dpi, trim marks)  [ADAPT from credit-optimizer]
  → pick mailing list + segment (Audience studio)                          [BUILD — list model §9]
  → cost estimate (pieces × postage/print; EDDM vs list)                   [pure calc]
  → APPROVAL (kind: send_mail / print)                                     [have: approvals]
  → execute: MVP = download print-ready PDF + CSV for a print vendor;      [manual first]
             later = Lob API (create postcard, mailing list, send)         [connector, later]
  → results: mailed count, QR scans, landing visits, calls               [Ledger]
```

**Artifacts** (versioned): `postcard_design` (image url + template + copy + size), `postcard_pdf`
(print-ready), `mail_run` (list, count, cost, status). **Make vs API:** image=API; template render +
PDF = make (thin, from your patterns); CMYK = skip (most vendors accept RGB PDF); mail send = Lob API
later, manual PDF now.

---

## 7. Video Studio — integration plan (traction harvest)

**Verdict: harvest the pipeline as a Garvis service; do NOT merge traction's product.** The scan gives
a clean minimal cut. Port in this order:

**Phase V1 — assembly service (drop-in, ~1 day):** Deploy `ffmpeg-service` under a Garvis-owned Fly
app. **Two mandatory edits:** (1) `src/validation.ts` `ALLOWED_HOSTNAMES` is *hardcoded* to traction's
Supabase host — repoint to Garvis's (make env-driven); (2) rename `fly.toml` app + `FFMPEG_SERVICE_URL`.
Keep the SSRF guards, path prefix restriction, idempotency, filtergraph.

**Phase V2 — the spine (small edits + auth, ~3–4 days):** Port `generate-storyboard` (**legacy mode
only** — excise the verticals/`story_engine` branch to avoid the `vertical_profiles`/`story-type-router`
hairball), `generate-voiceover` (ElevenLabs + OpenAI fallback), `queue-video` (Sora) + `process-video`
(poller), `assemble-reel` + `poll-assembly-status`. Pure `_shared` modules are drop-in
(`cinematic-prompts`, `scene-role-router`, `motif-injection`, `moderation-safety`, `timing-helpers`,
`storyboard-prompts`, `storyboard-validation`). Tables: `video_jobs`, `story_jobs`, `story_voiceovers`
with **`account_id` → `owner_id`** and **owner-scoped RLS** (not `USING(true)`). New glue function to
persist storyboard → `story_jobs.storyboard_json` and fan scenes → `video_jobs`.

**Security fixes (non-negotiable on port):** flip `verify_jwt=true` + `getUser()` + credits on every
function; owner-scoped RLS on all tables; **replace the service-role-key-in-request-body in
`assemble-reel` with a scoped signed-upload token**; re-pin the ffmpeg allowlist. Re-point text calls
(storyboard/hook/sanitize) to Garvis's Anthropic `complete()` for model consistency; keep
video/TTS providers (OpenAI Sora / ElevenLabs / Runway / Luma).

**Phase V3 — multi-provider (later):** add Runway + Luma queue/poll pairs; static routing first, skip
`queue-video-smart`'s comparison-history intelligence.

**Cluster attach:** a finished reel/clip is a `knowledge_artifact` (kind `video`, url) on the Video
cluster, reusable in Email/Landing/Social. Real-estate video types (market update, listing film, agent
intro, reels, YouTube script) are just play steps / storyboard presets.

---

## 8. Design Studio — plan (image gen + print PDF + social PNG)

**Verdict: assemble from parts you already own; only bleed/trim/dpi sizing is new (small).**

- **AI image generation** — ADAPT `idea-digester-spark/generate-post-image` (`gpt-image-1`, base64 →
  bucket → public URL). Changes: add credit metering (`_shared/credits.ts`), non-square sizes, write to
  `project_assets`/a new `designs` table. New fn `generate-image`.
- **Print PDF** — ADAPT credit-optimizer's `@react-pdf/renderer` + `PDFDownloadLink`. `<Page
  size={[wPt,hPt]}>` in points makes 4×6+bleed = `[450,306]`pt expressible; native-res images give
  300dpi from 300dpi sources. **Build:** bleed guides, trim marks, size presets. **Skip:** CMYK (RGB
  PDF accepted by most vendors; Ghostscript post-process only if a vendor demands it).
- **Social PNG** — DROP-IN launch-buddy-bot's `ResultShareCard` + `toPng` @ pixelRatio 2. Parameterize
  canvas per platform (1080×1080, 1080×1350, 1200×630). Server alt: `shot-worker` (ScreenshotOne) at a
  styled `/design/render/:id` route — already uploads to `project-assets`.
- **Template registry** — model on `_shared/previewSpec.ts` `SectionType` pattern: define
  `PostcardTemplate` / `SocialTemplate` with props the AI fills; render client-side (React) for PNG,
  React-pdf for print.
- **Brand kit** — new `brand_kits` table (logo url, palette, fonts, tone, headshots, compliance line);
  injected into every generator's context.

**Recommendation:** build a *thin* internal design studio (template + brand kit + AI image + export).
Do **not** integrate Canva — it adds a dependency and breaks the "one intelligence" feel. Templates +
generation + export cover 90% of real-estate needs.

---

## 9. Mailing List / Audience plan

**The audience model is the biggest genuinely-new data build.** Today `contacts` is flat. Real estate
needs households, properties, lists, segments, source, and consent.

```sql
-- proposed app_00xx_audience.sql (owner-scoped RLS throughout)
properties      (id, owner_id, address, unit, city, state, zip, county, apn,
                 lat, lng, property_type, is_lakefront, frontage_ft, waterbody,
                 assessed_value, year_built, source, tags text[])
households      (id, owner_id, property_id?, primary_name, mailing_address, source)
contacts        -- EXTEND: + household_id, + kind (owner|buyer|past_client|lead), + consent, + source, + tags
mailing_lists   (id, owner_id, world_id?, name, purpose, source, created_at)
list_members    (list_id, contact_id?, household_id?, added_at, status)   -- membership, dedupe key
segments        (id, owner_id, name, rule jsonb)   -- e.g. {is_lakefront:true, kind:'owner'}
suppression     -- HAVE (owner-scoped): email/domain; ADD address suppression for mail
consent_records (id, owner_id, contact_id, channel email|mail|sms, basis, at)
```

**Where lists come from (MVP → later):** CSV upload (have parser) + Google Sheets paste → **now**;
past-clients / website leads / lead forms → **now** (write on capture); county property records /
purchased homeowner lists / EDDM carrier routes → **import CSV now**, connectors later; MLS-derived →
**broker-gated, later** (§10).

**Clean / dedupe / segment:** dedupe by normalized `(owner, email)` (have unique constraint) and by
normalized mailing address for households; segments are stored `rule` jsonb evaluated to a member set;
suppression checked at send/mail time (email have; add address). **Compliance:** store `source` +
`consent` on every contact; never mail/email a suppressed address; CAN-SPAM footer + physical address
(have in `outreach_settings`); mail has no unsubscribe requirement but honor do-not-mail.

**Prevent duplicate mail/email:** one `list_members` row per (list, dedupe-key); a campaign records
which list_members it targeted so a re-run skips already-contacted members.

---

## 10. MLS / IDX plan

**Reality:** MLS data is contractually controlled. **Never scrape it.** Three tiers:

- **MVP (now):** manual listing/comp import (CSV or paste) into a `listings` table; use your own
  **Lake Geneva Brief `real_estate_metrics`** + market reports as the market-data feed (you own that
  data). This covers "lakefront inventory / sold comps / seasonality" for campaigns today.
- **V2 (broker-gated):** RESO Web API / IDX feed via Mom's brokerage (@properties) MLS membership —
  requires a signed data license + display-rule compliance (attribution, no commingling, refresh
  cadence). Store as `listings`/`comps` with a `source='mls'` + license id.
- **What's usable for marketing:** her own listings (freely), aggregate market stats (freely),
  public record property data (freely, per county terms). Other agents' active listings: only under
  IDX display rules. **Compliance gate:** anything `source='mls'` is display-only unless the license
  permits marketing use.

```sql
listings  (id, owner_id, mls_id?, source manual|mls|public, address, price, status,
           beds, baths, sqft, frontage_ft, is_lakefront, dom, list_date, sold_date, sold_price, photos jsonb, license_id?)
comps     (id, owner_id, subject_address, comp_listing_id?, sold_price, $_per_frontage_ft, distance_mi, sold_date)
```

---

## 11. Cluster AI Chat plan — the piece that makes clusters feel alive

**This is the highest-leverage new build, and it reuses the agent chassis you already have.** No new
agent system — a cluster chat is the existing observe→plan→act loop with a **cluster-scoped tool set**
and a **compiled cluster context pack**.

**Context the chat gets** (compiled, budget-bounded like `mind.ts`): the cluster charter +
tagline; its artifacts (titles + short bodies); its files/brand kit; audience stats if an Audience
cluster is linked; recent results; the web's objective. Retrieval: `match_embeddings` over the web's
documents for relevant source material.

**Tools it can call** (mode-gated, the existing gate): the cluster's own studio tools
(`toolsFor(charter)`) + generic `create_artifact` / `revise_artifact` (writes a new version) +
`propose_approval` (never sends — enqueues). Higher-consequence tools (`queue-send`, `render-pdf`,
`generate-video`) require **act** mode + land an approval.

**How it creates/revises without acting:** "make this more luxury" → the chat calls
`revise_artifact(postcard-copy)` → writes artifact **v2**, marks it the active draft, shows a diff.
Nothing outward-facing happens. "Send touch 1 to the lakefront list" → `propose_approval` → the
Approval queue. The **approval boundary is the same one send-email already enforces.**

**UI:** the cluster workspace gets a chat strip at the bottom (command-line feel), tools as
contextual cards above it, the active artifact + version pills center, approvals/results on a right
rail. One screen, no tabs.

**Implementation:** new edge fn `cluster-chat` (mirrors `garvis-brain`'s decision contract, scoped
tools) + `src/lib/garvis/clusterChat.ts` (context pack builder, pure + verifiable) + chat UI in
`WorkWeb.tsx`. Reuses `agent_runs` for durable multi-step, credits, and the tool gate.

---

## 12. UX Layout — Tony Stark, one screen per depth

```
HOME  ──────────────────────────────────────────────
  "What are we doing today?"   [ command line ]  🎙
  live: 2 approvals waiting · Mom: lakefront inventory −18% · Mission 'CMP batch 3' → 2 replies
  quick: Explore · Build · Mom Real Estate · Website Outreach · Open a Web

WORK WEB  ─────────────────────────────────────────
  left rail: the web (production areas, status dots, connected)   ~340px
  center: selected cluster STUDIO
  right rail: approvals + results for this web
  bottom: cluster AI chat (command line)

CLUSTER STUDIO (center)  ──────────────────────────
  objective line + charter badge + live status
  ┌ tools (contextual cards) ─────────────┐
  │ Generate image · Render PDF · Pick list │
  └────────────────────────────────────────┘
  active draft (with v1/v2/v3 pills + diff)     artifacts list (expand)
  [ ask this studio… ]  ← chat, always one line
```

Rules: **max three regions on screen** (web · studio · rail). Tools appear only when relevant to the
charter. Approvals are always one tap. Results are glanceable. The chat is the primary verb — typing
beats clicking. Forge/ember identity throughout (already built).

---

## 13. Data Model — what exists vs needs migrations

**Exists:** worlds/clusters/edges/artifacts (+charter), missions(+world_id), approvals,
execution_runs, contacts/campaigns/messages/replies/suppression(+world_id), marketing_campaigns/assets,
documents/embeddings/insights, project_assets, outreach_settings.

**Needs migrations (proposed order):**
- `app_0026_cluster_studio` — `artifact_versions` (version, is_active, diff), `cluster_files`
  (cluster_id, asset ref), `brand_kits`.
- `app_0027_designs` — `designs` (kind postcard|social|ad|flyer, template, image_url, pdf_url, size,
  copy, version, status), or extend `marketing_asset_kind` + reuse `marketing_assets`.
- `app_0028_video` — `video_jobs`, `story_jobs`, `story_voiceovers` (owner-scoped; from traction).
- `app_0029_audience` — `properties`, `households`, `mailing_lists`, `list_members`, `segments`,
  `consent_records`, address suppression; extend `contacts`.
- `app_0030_listings` — `listings`, `comps`.
- `app_0031_results` — `campaign_metrics` (opens/clicks/visits/forms/calls/cost) or roll from
  `execution_runs` + Resend webhooks + `preview_events`.

**New edge functions:** `cluster-chat`, `generate-image`, `render-pdf` (or client React-pdf),
`render-png` (or `shot-worker` route), plus the ported `video-*`. **Connectors later:** Lob,
Meta/Google Ads, RESO/IDX.

---

## 14. Execution Safety — audit

**Strong today:** one approval queue, one execution ledger, owner-scoped RLS, suppression + caps +
warmup + CAN-SPAM in `send-email`, kill switch, Svix-verified webhooks. **Gaps to close as studios
land:** add approval kinds `send_mail`, `publish_ad`, `publish_social`, `deploy_landing`, `spend`
(schema already has `spend`, `publish_post`, `deploy_site`); add **address** suppression for mail; log
every new connector (Lob/Ads/image/video) to `execution_runs`; per-connector daily caps; the video
functions must NOT ship (they're internal-generate, not outward — but they DO spend, so
credit-gate them). Retries/failures: `execution_runs.attempt` exists; wire backoff per connector.

---

## 15. Roadmap + Next Sprint

### Phases (each ships green: tsc + build + verify)
- **Phase 6 — Cluster Studio shell**: artifact versions + files + brand kit + **cluster AI chat**.
  (Turns every cluster into a real studio at once — highest leverage.)
- **Phase 7 — Design Studio**: `generate-image` + template registry + PDF/PNG export → Direct Mail
  becomes real.
- **Phase 8 — Audience**: properties/households/lists/segments/consent; CSV clean/dedupe; segmented
  email sends.
- **Phase 9 — Video Studio**: harvest ffmpeg-service + spine (V1+V2) with the security fixes.
- **Phase 10 — Listings + Results**: manual MLS import + LGB feed; campaign metrics + ROI + next-move.
- **Phase 11 — Connectors**: Lob (mail), then Ads, then RESO/IDX (broker-gated).

### Next Sprint — Cluster Studio Shell (Phase 6)
The one build that makes clusters feel like studios and unblocks everything after it.

1. **`app_0026_cluster_studio.sql`**: `artifact_versions` (id, owner_id, artifact_id?, cluster_id,
   slug, version int, kind, title, detail/content jsonb, is_active bool, created_at); `cluster_files`
   (id, owner_id, cluster_id, asset_url, name, kind); `brand_kits` (id, owner_id, world_id, name,
   logo_url, palette jsonb, fonts jsonb, tone, headshots jsonb, compliance_line). Owner-scoped RLS.
2. **`supabase/functions/cluster-chat/index.ts`**: mirror `garvis-brain`'s decision contract; scoped
   tools = `toolsFor(charter)` + `create_artifact`/`revise_artifact`/`propose_approval`; getUser +
   credits; Anthropic `complete()`. Inspect: `garvis-brain/index.ts`, `_shared/{ai,credits}.ts`.
3. **`src/lib/garvis/clusterChat.ts`** (pure + `clusterChat.verify.ts`): compile the cluster context
   pack (charter + artifacts + files + brand kit + linked audience stats + recent results, byte-
   budgeted like `mind.ts`); parse the decision; map tool calls. Inspect: `mind.ts`, `commander.ts`,
   `workweb.ts`, `workwebRun.ts`.
4. **`src/lib/garvis/artifacts.ts`**: `reviseArtifact` (writes a new `artifact_versions` row, flips
   active) + `listVersions` + diff helper. Wire `writeArtifacts` in `workwebRun.ts` to also seed v1.
5. **UI in `WorkWeb.tsx`**: chat strip at the bottom of the workspace; version pills + active-draft +
   diff on the selected artifact; files panel; brand-kit chip. Keep the three-region layout.
6. **Verify + review**: `verify:workweb` + new `verify:clusterchat`; `tsc`/`build`; adversarial review
   workflow over the diff (as we did for Work Webs).

**Acceptance:** In the Direct Mail cluster I type "make the postcard copy more luxury, less salesy" →
Garvis writes postcard-copy **v2**, marks it active, shows the diff, sends nothing. I type "queue
touch 1 to the lakefront list" → an approval appears; approving it sends via `send-email` and logs to
the ledger. The same chat works in any cluster of any web.

---

## Keep / Kill / Merge / Freeze (blunt)

- **KEEP & INVEST:** the Cluster Studio shell — build it once, every studio rides it. Garvis hub.
- **HARVEST:** traction-engine's `ffmpeg-service` + video spine (with the security fixes); LGB's
  `generate-post-image`; credit-optimizer's React-pdf templates; launch-buddy-bot's `ResultShareCard`
  PNG exporter. Take the parts, leave the products.
- **MERGE (capability, not repo):** swift-prep discovery → `/ingest-profile` (website outreach half
  already built here).
- **FREEZE:** traction-engine, launch-buddy-bot, credit-optimizer, theory-thread as products; LGB
  stays a running product **and** Mom's market-data source.
- **KILL:** nothing new (path-to-success-tracker already slated).
- **DON'T BUILD:** Canva integration (use thin templates); MLS scraping (broker-gated API only);
  CMYK pipeline (RGB PDF suffices); a second agent system (cluster chat reuses the chassis); ads
  platform APIs before there's ad spend to manage (export creatives first).

**North star, unchanged:** one intelligence operating through many studios. The studios are data; the
shell is the product; approval + ledger keep it safe; the brain keeps it connected.
