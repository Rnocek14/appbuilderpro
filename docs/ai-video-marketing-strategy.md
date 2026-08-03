# The Growth Engine — AI Video Marketing Strategy

*Written July 31, 2026. Synthesizes a full audit of both repos (appbuilderpro + traction-engine) and
current-market research into video-generation APIs, posting APIs, platform policy, and the
faceless-video competitor landscape. This is the plan for turning the "AI video marketing" idea into
something special — without repeating the traction-engine overcomplication.*

---

## 1. The idea, sharpened

The raw idea: AI video marketing and editing, vertical channels, sparking virality, fact channels
(finance facts, interesting facts), using AI to build websites, and marketing products across those
channels — your own apps, dropship/Temu finds, handmade jewelry, paintings.

The sharpened version, after research:

> **Build a channel operating system, not a video generator.**
> A small portfolio of distinctly-branded niche channels (3–10, not 50), each fed by an AI
> production line (research → script → voiceover → AI clips → assembly → captions), published
> through real approval-gated rails to TikTok / Shorts / Reels, with performance synced back so the
> system *learns which hooks and formats win* and routes attention to whatever is being monetized
> that month — apps, affiliate products, or handmade goods.

Every competitor in this space generates videos. **Almost nobody closes the loop** from published
performance (retention, hook CTR, winners) back into the next batch. That loop — plus honest
billing and honest provenance — is the moat, and this repo is uniquely positioned to build it
because the rails already exist here.

---

## 2. What we actually have (two-repo audit, July 2026)

### traction-engine: the factory that never shipped a delivery truck

~105,000 hand-written lines, 65 edge functions, 116 migrations, built in ~6 working days of
Lovable-velocity generation. The honest verdict:

**Real and wired end-to-end:** Sora / Runway / Luma clip generation with polling, ElevenLabs
voiceover with word-level timestamps, OpenAI storyboarding, Perplexity + SerpAPI + Firecrawl
product research, and a genuinely well-engineered FFmpeg assembly microservice on Fly.io
(SSRF allowlist, idempotency keys, crossfade offset math, freeze-frame extension).

**Never existed:** publishing. The README claims TikTok Content Posting API integration; there is
zero code for it — no OAuth, no publish function, and the `published_posts` table has no code
references. Posting was always manual copy-paste. The Winner Engine / 10-Video Rule decision loop
also never ran (columns exist, no cron ever invoked it).

**The overcomplication, quantified:** five near-identical copies of "queue a clip" (one per
provider, ~4,000 lines that should be one parameterized function), seven story-mode functions with
two parallel continuity engines, three coexisting generations of production schema
(`script_runs` → `story_jobs` → `studio_timelines`), four abandoned analytics subsystems, ~14%
confirmed dead code (including a 2,459-line component referenced by nothing), 9 orphan tables from
an unrelated career app (the Supabase project was recycled), and security problems: `.env`
committed to git, 41 functions with JWT verification off behind a key shipped to every browser.

**The crown jewels — the ~4,000 lines that matter, all portable:**

| Asset | Where | Why it's valuable |
|---|---|---|
| FFmpeg assembly service | `ffmpeg-service/` (1,054 lines) | Deployed, hardened, product-agnostic. Crossfade/audio-probe/freeze-extend math takes days to get right. |
| Audio-first timing | `_shared/timing-helpers.ts` + assembly contract | The core insight: **narration is the timing authority**; clips get trimmed or freeze-extended to fit. `estimateNarrationDuration()`, provider duration snapping, bucket-aware rebalance. |
| Word-level caption alignment | `generate-story-voiceover` + `compile-story-script` | canonical text → scene char-ranges → ElevenLabs `/with-timestamps` → free per-word caption + scene sync. |
| 3-layer sanitization ladder | `prompt-sanitizer.ts`, `moderation-safety.ts`, `moderation-ladder.ts`, `sanitize-prompt-ai` | Survives video-provider moderation without losing the shot; retry → soft-rewrite → provider fallback with style anchors re-injected. Everyone building on these APIs hits this wall. |
| Provider health + routing | `provider-health.ts`, `scene-role-router.ts` | Circuit breaker (90% fail over 24h → disable), shot-role → provider routing. |
| Cost guard + kill switch | `cost-guard.ts` + `api_call_log` | Global kill switch, daily/per-job spend caps, per-call cent logging. Any product that spends real money needs exactly this. |
| VLM auto-rater | `auto-rate-video` (882 lines) | Vision-model scoring of generated clips with defect taxonomy and context-aware tolerance — the "generate 5, auto-pick 1" loop. |
| Domain content data | `vertical-profiles.ts`, `story-types.ts`, `cinematic-prompts.ts`, style presets | Months of accumulated prompt taste. Pure data, keep it. |
| Product research pipeline | `product-research`, `validate-product-links`, `research-engine.ts` | Fuzzy description → real product page + real images, tiered source priority. Standalone value; barely touches the video half. |

**Decision: harvest and freeze.** Lift the assets above into this repo; do not merge traction's
product, schemas, or Supabase project. Rotate every provider key and the pipeline key before reuse
(`.env` is in traction's git history). This matches the verdict already recorded in
`docs/garvis-studios-blueprint.md` §7 — the harvest was planned but never executed.

### appbuilderpro: the delivery truck that never got a factory

This repo grades itself honestly in `docs/where-we-stand.md`: video/reels is C/D — but the
*surrounding system* is exactly what traction-engine lacked:

- **Approval spine** (`approvals` + `execution_runs` + payload-hash binding): nothing outbound
  without a yes, and what was approved is re-verified byte-for-byte at execution. Production-grade.
- **Real social publishing** (`social-publish` via Ayrshare) with atomic double-post claims, plus
  **analytics sync-back** (`social-sync` → `social_metrics`). The learning loop's plumbing exists.
- **Credits metering** with `video_clip` and `voiceover` kinds already registered (nothing spends
  them yet).
- **ReelStudio** (ported from traction's Idea → Script → Storyboard flow) — ends at "save as
  draft"; **`reel_jobs`/`reel_clips`** schema (provider-checked for AI clip engines) — dead, zero
  code references; **VideoStudio** (Shotstack photo-montage path) — works today but every render
  overwrites the last (`videoRun.ts` fixed slug) and stores a URL that rots in 24h.
- **Veo 3.1 scene generation** (`generate-video` + `scroll_scenes`) — a second video path that IS
  wired end-to-end with human approval.
- **`mediaProvenance.ts`** — an AI-provenance labeling core, currently used nowhere.
- **Named gap:** `_shared/socialCore.ts` knows 9 platforms including TikTok/YouTube/Pinterest, but
  `socialBoard.ts:18` and `campaignCore.ts:70` only expose 4 — **TikTok, Reels-native, and Shorts
  are unreachable from the creative board today.** Two one-line bottlenecks.
- `docs/garvis-level-10.md` Spec 6 already specs most of Phase 0/2 below with file paths and line
  numbers. The `content_growth` flavor is the designated honest home for generated-footage work.

**The two repos are perfect complements: traction has the factory, this repo has the rails.**

---

## 3. Market reality (July 2026) — what research changed about the plan

### 3.1 Sora is dead; build provider-agnostic or die with a vendor

OpenAI shut the Sora app April 26, 2026; **the Sora API shuts down September 24, 2026**. A large
share of traction-engine's provider code is about to be a museum piece — which conveniently
lowers the cost of the harvest-and-freeze decision. Current landscape (cost per ~5s clip):

| Tier | Models | Cost/5s clip | Use |
|---|---|---|---|
| Premium | Veo 3.1 Standard ($0.40/s, native audio) | ~$2.00–3.20/8s | Hero shots only |
| Value | Veo 3.1 Fast ($0.15/s), Runway Gen-4 Turbo ($0.25), Kling 2.5/2.6 (~$0.31), Luma Ray3.14 (~$0.10) | $0.10–0.75 | Default b-roll |
| Floor | Hailuo 02 ($0.28/6s 768p; $0.10 at 512p), Wan 2.6/2.7 (~$0.07/s, open weights), Seedance 2.0 (~$0.09/s 1080p) | $0.05–0.30 | Volume |

**Implication:** the provider seam should be two-headed from day one — **Veo 3.1 (Gemini API)** as
the quality head and **an aggregator (fal.ai / Replicate)** as the value head, so models can churn
underneath without code changes. Model churn is violent (Sora dead 12 months after launch; Kling on
v3; Wan on 2.7); never hard-wire a single vendor again.

TTS is a rounding error: OpenAI `gpt-4o-mini-tts` ≈ $0.015/min (default), ElevenLabs ≈
$0.10–0.30/min (optional quality head — and its word-timestamp alignment is worth it for caption
sync on flagship channels).

### 3.2 The 50-account farm is structurally dead; 3–10 branded channels is the play

This directly revises traction-engine's "50+ account network" premise:

- TikTok removed 86M+ fake accounts in Q1 2026; device-fingerprint clustering catches clone
  networks (~73% of blocks are device-signal, not content); fresh farmed profiles hit
  "200-view purgatory" within ~48h.
- **YouTube's July 2025 "inauthentic content" policy** demonetizes mass-produced, templated,
  minimal-variation content. **TikTok Creator Rewards only pays on original videos ≥60s**, and
  since Sept 2025 unlabeled AI content draws immediate strikes.
- A 10-account farm costs $400–700 setup + $150–300/mo in antidetect infrastructure before any
  content — and the monetization programs are engineered against exactly that content class.

**The 2026 playbook that survives:** 3–10 accounts, one distinct niche brand each, 1–2 original
60–90-second videos/day, real editorial input (original research, a recognizable voice/visual
system), proper AI labeling, and monetization that doesn't depend on view payouts.

### 3.3 The money is in routing attention, not RPM

Per 1M views (US-skewed): YouTube Shorts general $30–100, **finance niche $100–350**; TikTok CRP
$0.40–2.00 RPM on *qualified* views of ≥60s originals (a documented faceless AI account did 21M
views for ~$3,000); Instagram bonuses ≈ $0, plan around it. Ad-share alone rarely sustains a
channel. What actually monetizes:

- **TikTok Shop affiliate** — avg 13% commission US (2026), 10–15% open collabs, 18–50%
  invite-only. The highest-EV route for TikTok-native content.
- **Amazon Associates/Influencer** — 1–20% by category, storefront + shoppable videos.
- **Temu affiliate** — still live (5–20%, promos to ~30%, reliable payouts) but a brand-fit risk
  for a quality-positioned channel; fine for a dedicated "finds"-style channel.
- **Your own products** — apps first (this repo literally builds and ships them), and the
  handmade route: the proven jewelry/art play is authenticity content (process videos, packing
  orders, behind-the-scenes; e.g. Liz Fox Roseberry: ~500k TikTok followers → 20k+ Etsy sales).
  **For handmade, automate the editing/captioning/scheduling — never the filming.** That's a
  distinct "own-footage" mode of the same pipeline.
- **Finance/facts channels**: whiteboard/diagram visuals outperform stock wallpaper; hooks in
  ≤1.5s (specific-number curiosity gaps, stakes framing); a re-hook every 15–30s; 60–90s
  mini-explainers for CRP + Shorts, sub-30s clips as top-of-funnel only. Growth inflects around
  day 45–75 of daily posting. Finance content requires claim-binding to real citations — both for
  compliance and because "adds new ideas" originality is now a monetization gate.

### 3.4 Posting APIs: don't do the audits — rent pre-audited rails

Direct TikTok API = private-only posts until a 2–6 week audit; YouTube = uploads locked private
until a project compliance audit; Instagram = friendliest for own accounts (dev mode). The
practical answer for a self-hoster: **pre-audited cross-posting APIs** — Post Bridge (~$9–14/mo
incl. API), Blotato ($29/mo, 20 accounts, n8n/MCP-native), upload-post.com (free tier: 10
uploads/mo — perfect for validating the pipeline), vs the already-integrated Ayrshare at $149+/mo.

**Implication:** keep Ayrshare as the current head, but make `social-publish` a two-provider seam
so a cheap head (Post Bridge or upload-post) can carry personal channel volume.

### 3.5 Competitor gaps = the product's differentiation

The faceless-video SaaS category (Crayo, AutoShorts, Revid, Zebracat, InVideo, OpusClip, Klap,
Submagic, Faceless.video) has loud, consistent user complaints — each one is a feature:

1. **Billing dark patterns** (unauthorized renewals, credits burned on failed generations, no
   rollover) → our credits system already meters honestly; charge only for what rendered.
2. **Generic AI slop** — same stock b-roll, same voices, series repetitive within weeks → per-
   channel visual systems (vertical knowledge packs + style presets) that are hard to clone but
   cheap to repeat.
3. **No analytics loop / no A/B testing** — *the promise nobody has shipped end-to-end* → we have
   `social-sync` + `social_metrics` already; add hook variants and winner detection.
4. **Unreliable auto-posting** (silent failures, delays) → approval spine + execution ledger +
   breaker already solve this class of problem.
5. **No scene-level regeneration** (pay twice to fix one shot) → `reel_clips` is per-scene by
   design; regenerate one clip, keep the rest.

---

## 4. The product

**Name for the pillar: the Growth Desk** (working name; it's the `content_growth` flavor grown up).
One operator, a handful of branded channels, an honest machine underneath.

Five loops, mapped to what exists:

| Loop | What it does | Rails it rides |
|---|---|---|
| **Research** | Niche/trend/fact sourcing with citations; product research (harvested from traction later) | standing orders (`idea_stream`, `opportunity_hunt`), knowledge worlds |
| **Production** | Script → VO → captions → AI clips (or own footage) → assembly | ReelStudio, `reel_jobs`/`reel_clips`, harvested video-core, VideoStudio/Shotstack, ffmpeg-service |
| **Distribution** | Approval-gated publish to TikTok/Shorts/Reels/etc. on a per-channel cadence | approvals + `social-publish` + `content_week` slates |
| **Learning** | Metrics sync-back → hook/format leaderboard → scale winners, kill losers | `social-sync`, `social_metrics`, a new `post_results`-style ledger |
| **Monetization** | Route attention: app CTAs, affiliate links (TikTok Shop/Amazon/Temu), own shop | campaign core, `?src` attribution from the advertising plan |

**The channel** is the new first-class object (a lean reincarnation of traction's
`account_configs`, minus the farm): persona, niche, platform set, visual system, cadence,
monetization mode (`app_first` / `affiliate_first` / `shop_first`), and a content mix. A channel
belongs to a world, so client work (an Etsy jewelry seller as a Garvis client) and personal
channels (a finance-facts brand) use the same machinery.

**Two production modes, one pipeline:**
- **Generated mode** (fact channels, app promos, product finds): AI clips via the provider seam,
  always provenance-labeled.
- **Own-footage mode** (jewelry, paintings, UGC): operator uploads raw clips; the system does
  scripts, cuts, captions, music, scheduling. This mode is immune to every platform crackdown and
  serves the highest-margin monetization (own products) — competitors mostly ignore it.

---

## 5. The roadmap — closing circuits, not building empires

The traction lesson, made into law: **every phase ends with something publishable, and no phase
builds a subsystem that isn't invoked by the end of that phase.**

### Phase 0 — Close the three circuits that are already specced (days)

Everything here is named in `docs/garvis-level-10.md` Spec 6 with file paths:

1. **TTS seam**: `tts-voiceover` edge function — `gpt-4o-mini-tts` default (~$0.015/min),
   ElevenLabs Flash optional. Spends the already-registered `voiceover` credit kind.
2. **Fix VideoStudio's two bugs**: unique render slugs (stop overwriting), server-side finalize of
   the rendered mp4 into storage (kill the 24h URL rot). Wire SRT captions into the render.
3. **Render → publish**: "Queue to social" button wiring `queueSocialPost({mediaUrls:[durableUrl]})`
   — connects two production-grade paths with ~50 lines.
4. **Widen the platform surface**: fix the two one-line bottlenecks (`socialBoard.ts:18`,
   `campaignCore.ts:70`) so TikTok/YouTube/Pinterest are reachable; add a music bed (CC0).

**Exit criterion: one finished vertical video with voiceover and captions, approved in the queue,
actually live on a real TikTok/Shorts/Reels account, from inside this app.** That moment is the
product's minute-zero, and it is days away, not months.

### Phase 1 — Channels + the fact-channel engine (1–2 weeks)

1. New migration (`app_0123_channels.sql` pattern): `channels` (world-scoped, persona/niche/
   platforms/cadence/monetization_mode/visual_system) + link `social_posts` and `reel_jobs` to a
   channel.
2. **Fact-channel series engine**: a standing-order kind that drafts N scripts/week per channel —
   finance facts with **claim-binding citations required** (rides the finance vertical knowledge
   pack's SEC-marketing-rule awareness; refusal over fabrication, exactly the Garvis ethos), 60–90s
   format for CRP eligibility, **3 hook variants per script**.
3. **Content-week slates** per channel through the approval queue (the `content_week` kind exists) —
   approve a week of posts in one sitting.
4. Wire `mediaProvenance.ts` into the publish gate: AI-generated content is labeled at post time.
   Non-negotiable under 2025-26 platform policy, and it's the honest-by-construction brand.

### Phase 2 — The clip engine: harvest traction's core (2–3 weeks)

1. Port the crown jewels into `src/lib/garvis/videoCore/` (pure, with `.verify.ts` suites — the
   house convention traction never had): timing-helpers, sanitization ladder, provider
   health/routing, VLM rating rubric. Keep `vertical-profiles`/`story-types`/`cinematic-prompts`
   as data.
2. **One** `generate-clip` edge function (provider as parameter — never five copies again) with the
   two-headed seam: Veo 3.1 Fast/Standard + fal.ai (Kling/Hailuo/Wan). Revive `reel_jobs`/
   `reel_clips` (add `provider_job_id`, extend the provider check with `'veo'`/`'fal'`), spend the
   `video_clip` credit kind, log through the cost guard.
3. **Assembly**: start with Shotstack (already integrated) for stitching; lift `ffmpeg-service/`
   when volume/cost justifies it (swap the in-memory job Map for Postgres, repoint the SSRF
   allowlist, redeploy on Fly). Audio-first contract throughout: narration duration is authority.
4. Per-scene regeneration in ReelStudio (the anti-"pay twice" feature), auto-rate on arrival,
   generate-2-pick-1 on flagship channels.

### Phase 3 — The learning loop (the moat; ongoing from week 4)

1. `post_results` ledger fed by `social-sync`: views, retention proxy, likes/comments/shares,
   link clicks per post, joined to hook variant + format + channel.
2. **Hook leaderboard** per channel; **winner detection** (a post >3x channel baseline → queue a
   "scale it" suggestion: variants, follow-ups, cross-post) and **kill rules** (traction's 10-video
   rule reborn, but as approval-queue suggestions, not silent automation).
3. Feed results into generation: the script prompt for next week's slate includes the channel's
   top/bottom hooks. This is the flywheel no competitor ships.

### Phase 4 — Monetization routing + the product engine (when phases 0–3 are live)

1. Affiliate link registry per channel (TikTok Shop, Amazon, Temu where brand-appropriate) with
   `?src` attribution riding the advertising plan's existing site-events → leads chain.
2. **Own-footage mode** for the jewelry/paintings route: upload raw clips → auto-cut/captions/
   music → slate → publish. Pitchable to real Etsy-seller clients through the existing client
   machinery — the Growth Desk becomes a service you can sell, not just a tool you use.
3. Optionally harvest traction's product-research pipeline (SERP → validate → images) as the
   "finds channel" feeder. It's decoupled and good; it's also the lowest-priority jewel.
4. App promos: every FableForge-shipped app gets a launch content slate in its target vertical.

**Explicit non-goals (the anti-traction list):** no 50-account farm, no per-provider function
copies, no second continuity engine, no analytics subsystem built before the data it reads exists,
no publishing claim in any doc until the code exists, and no new Supabase project recycling.

---

## 6. Unit economics

Per 60–90s generated video: script (LLM) ~$0.02–0.10 + VO $0.015–0.20 + 8–10 budget clips
$0.60–2.50 + assembly $0.20–0.40 (Shotstack) ≈ **$1–3 COGS** (Veo-heavy hero videos ~$10–25 —
flagship use only). Three channels × 1/day ≈ **$90–270/mo generation + $9–29/mo posting rails**.
Break-even is a handful of affiliate conversions or ~1–3M finance-niche Shorts views/mo — and the
own-products route (apps, jewelry) keeps the whole margin. Competitors charge $19–79/mo for 12–60
generic videos; at these COGS an honest-billing SaaS tier is viable later without dark patterns.

## 7. Compliance guardrails (baked in, not bolted on)

- AI-generated media is provenance-labeled at publish (TikTok strikes for unlabeled AI since
  Sept 2025; `mediaProvenance.ts` exists for exactly this).
- Finance/health scripts require citation binding; refusal over fabrication (house ethos, and the
  YPP "inauthentic content" defense is real editorial input).
- ≥60s originals for CRP-eligible content; distinct visual systems per channel; no cross-channel
  content cloning (spam-cluster + inauthentic-content double-trigger).
- Official APIs only, human-approved slates, per-channel cadence caps (1–3/day) — the breaker
  pattern pauses a channel on repeated publish failures.
- Rotate every key that ever touched traction-engine before reuse; nothing from its Supabase
  project is imported.

## 8. THE MONEY MAP — how this actually pays (researched July 31, 2026)

Deep-dive research into real operator earnings (income reports, case studies, platform policy)
lands on one headline: **stack the avenues on one pipeline; don't pick one.** Ranked by realistic
$/month for a solo operator with strong automation, months 3-6:

| # | Avenue | Realistic mo. 3-6 | Ceiling | Notes |
|---|---|---|---|---|
| 1 | **Content-as-a-service for local businesses** | $3,000-8,000 | $15k+ | $1,000-5,000/mo retainers; short-form video is the biggest price driver; AI-assisted packages bill 20-50% HIGHER, not lower. Sales-driven, not virality-driven — ~10 conversations, not an algorithm. ~46%/yr churn; plan for it. |
| 2 | **TikTok Shop affiliate** | $500-3,000 | $5-15k | Median mid-tier creator: ~$680/mo; survivors' earnings grow ~6x by month 12 (59% churn out). Commissions cut to 10-15% June 2026. See the AI-content warning below. |
| 3 | **Own apps via organic** | $0-2,000 median | $70k+ MRR tail | Pure lottery with good EV: Starcrossed hit $70k MRR in 90 days — off 18 months of pre-built audience. Audience first, app second. 1M targeted views ≈ $1,700-4,000 of equivalent paid installs. |
| 4 | **Finance/fact funnel → newsletter + digital product** | $200-1,500 | $10k+ at 12-24mo | The compounding asset: finance newsletters sponsor at $50-300 CPM; precedent exit at ~$43.50/subscriber (The Peak, $5M). Kyla Scanlon model: short-form as top-of-funnel AND as topic research. Cheap $20-40 products convert best (Easlo). |
| 5 | **Maker/handmade multiplier** | +20-100% on an existing shop | production-capped | 80% process/BTS content, 20% selling; TikTok Shop native checkout converts 4.7% vs ~1-3% off-platform. Only monetizes without a product line as a service to makers (see #1). |
| — | **Paid clipping (Whop bounties)** | $100-500 → $500-3,000 | $5k+ | The wildcard CPM floor: $0.50-2 per 1k views clipping others' content while your own funnels mature. |

**The stack for this operator:** CaaS retainers as the floor → affiliate/CRP as the content-native
cash layer → one finance newsletter + a small digital product as the compounding asset → app
equity as the lottery ticket. All four ride the SAME pipeline this repo now ships.

### Course corrections the research forced

1. **TikTok Shop killed pure-AI product content (July 2026).** AI voices, slideshows, looping
   footage, and static-image shoppable content are banned on Shop; violations dent the new
   Account Health Rating and brands claw back commissions. **The two lanes must never mix:** the
   fact-channel engine (AI visuals + AI voice, labeled) is for fact/education channels on
   Shorts/Reels/general TikTok; product/Shop content follows the 70/30 rule — AI for scripts,
   editing, scheduling; REAL hands, product, and voice on screen. The maker preset already
   encodes this ("Real footage first — AI only for diagrams").
2. **Per-video attribution is non-negotiable.** Click data under-credits short-form 2-5x; the
   standard is a unique tag per video + your own landing page (21-50% conversion vs 3-6% for
   Linktree-style pages) + a "how did you hear about us" survey at purchase. `ctaLink` now stamps
   `src=gc_<channel>` + `utm_content=ep_<episode>` on every caption link.
3. **The learning loop's design is validated by practice**: median-of-channel baseline (one viral
   hit must not distort it), ≥3x = double down with a sequel inside 24-48h (serialized "part 2"
   content drives 52% higher profile-visit rates; profile visits convert to follows at 11x feed
   rate), ~3 attempts before killing a format, and deliberate variance when nothing clears 2x.
   Trust the loop only after ~30 days / ~50 posts — before that everything is honest 'unmeasured'.
4. **Retention data exists in the rails already**: Ayrshare returns TikTok `averageTimeWatched` /
   `fullVideoWatchedRate` and YouTube quartile playbacks — social-sync stores the raw object
   verbatim today; promoting those fields to columns is a cheap follow-up. YouTube's Analytics API
   exposes the full 100-point retention curve — the richest loop signal — via a future direct
   integration. Instagram **Trial Reels** (post to non-followers only, auto-promote winners) is
   the industry's only native organic A/B surface and the natural home for hook testing.

### How it ties to everything already built here

| Existing asset | Role in the money map |
|---|---|
| Prospecting funnel (scrape → audit → demo → pitch) | Sells avenue #1: the same local businesses buying sites buy the $1-2k/mo content retainer. The growth channels ARE the portfolio that closes the deal. |
| `service_packages` + client worlds + client reports | The CaaS offer is a package row (`key: 'social_content'`, monthly) — versioned, pinned per client, reported monthly. The noun already exists. |
| Per-world Ayrshare Profile-Keys | Multi-client posting is already fail-closed per brand — the agency model works TODAY. |
| FableForge app builder | Builds each channel's own landing page (the 21-50% converting destination) and the apps that avenue #3 promotes. |
| `site_events` + `?src` attribution + leads | Answers "which channel/episode sold this" on every owned destination — the survey-grade attribution the research demands. |
| Approval queue + standing orders + breaker | The unattended layer: content weeks approved in slates, publishing drained on the clock, channels pause themselves on repeated failures. |
| Credits + cost guard | Honest per-client COGS — the margin math for retainer pricing. |

## 9. Build log — what shipped on this branch (July 31, 2026)

Phase 0 and the core of Phase 1 landed together as the first full circuit:

- **`tts-voiceover` edge fn** — per-scene TTS (OpenAI gpt-4o-mini-tts default, ElevenLabs Flash
  optional), credit-metered under the pre-registered `voiceover` kind, provenance-stamped.
- **`storyboard.ts`** — audio/caption/music layers on `toShotstackEdit` (no-opts output unchanged,
  regression-checked); ceiling raised 60→90s for the CRP-eligible band; fixed a latent ceiling
  overflow bug the new tests exposed.
- **`render-video`** — server-side FINALIZE: finished mp4s are copied into durable storage (the
  provider URL dies in 24h) and recorded as provenance-stamped vault rows; renders no longer
  overwrite each other (`videoRun.ts` unique slugs).
- **`musicBed.ts`** — CC0-only license gate (fail-closed), mood pick, the duck-under-VO volume rule.
- **AI-label hard gate** — `mediaProvenanceCore.ts` shared pure core; `ai_provenance` jsonb on
  `social_posts` + `cluster_files` with an ACCRETE-ONLY SQL trigger (app_0123); `social-publish`
  blocks any AI-media post whose caption lacks the visible disclosure, server-side, fail-closed.
- **VideoStudio** — voiceover toggle, music bed, and "Queue to social" straight into the approval
  spine with TikTok/YouTube/Instagram/Facebook/LinkedIn/X reachable.
- **The channel model** — `growth_channels` (a handful of distinct niche brands, not a farm) +
  `channel_episodes` (app_0123).
- **The fact-channel engine** — `fact-script` edge fn (cited 60-90s scripts, 3 hook variants,
  NEVER-invent-a-URL rule), `factChannel.ts` pure core (`needs_review` flag on uncited claims,
  band check, illustration guardrails), and the **Fact Channel Studio** in every `content_growth`
  area: draft → pick hook → illustrate → narrate → render → queue to the channel's platforms.

**Round 2 (same day) — the learning loop + money routing:**

- **`growthLoop.ts`** pure core: per-episode reach from synced metrics (null = honest
  'unmeasured', never fake zeros), median-of-channel baseline (min 3 measured episodes),
  winner (≥3x) / quiet (≤0.3x) classification, and hook intel for the next draft.
- **The loop closes**: `loadChannelPerf` joins episodes → posts → metrics; `fact-script` receives
  "hooks that won/died on THIS channel" and writes new hooks with winning mechanisms; winner
  episodes get a one-click "Draft a follow-up" (the sequel-inside-48h play).
- **Money routing v1** (app_0124): one destination per channel; every caption link stamped
  `src=gc_<channel>&utm_content=ep_<episode>` — per-video attribution through the existing
  site_events chain on owned destinations.
- Studio surfaces: channel baseline, winning-hook count, per-episode perf lines with verdicts,
  live posted status read from the publisher's own record.

**Round 3 (same day) — retention, the hook lab, and the sellable service (app_0125):**

- **Retention into the loop**: social-sync now promotes TikTok `averageTimeWatched` /
  `fullVideoWatchedRate` and YouTube `averageViewPercentage` to real columns; `retentionRead()`
  turns them into the honest diagnosis (≥55% avg viewed = algorithm-push territory; <30% = fix
  the hook/pacing; no data = null, never a guess) on every episode card.
- **The Hook Lab**: a rendered episode spins a **B-cut** — same script, same art (persisted in
  `episode.assets` and reused), a different hook variant — for ~$0.30 (new VO + render). The only
  hook A/B the loop can trust: otherwise-identical videos. UI guides spacing cuts hours apart.
- **The `social_content` service package** (v1, monthly, from $1,000/mo) seeded into the client
  machinery: 12 videos/mo from the client's real footage, approval slates, branded channel
  identity, attributed destination links, monthly performance report.

**Round 4 (same day) — creation craft, researched and encoded:**

The generation layer was audited against how winning operators actually prompt (two research
sweeps: visual layer + audio/script layer). What changed, each rule sourced:

- **TTS is now DIRECTED, not just voiced**: gpt-4o-mini-tts steers on an `instructions` block
  (its `speed` param is silently ignored) — every channel narrates with a labeled-axis delivery
  direction (brisk documentary pacing, numbers landed deliberately, zero lead-in silence, rising
  energy) with the channel persona woven in (`deliveryInstructions`). Default voice moved to
  `marin` (OpenAI's own best-quality pick); presets use onyx/marin/coral. ElevenLabs head gets
  the community-tested energetic settings (stability 0.4 / similarity 0.75 / style 0.3 / 1.1x).
- **Scripts write for the ear**: ~2.3 spoken words/second budget, 8-12-word sentences, concrete
  number in every claim, numbers written as spoken, a curated banned-phrase list (delve,
  game-changer, "imagine a world"…), hooks ≤12 words with three distinct mechanisms, and the
  **open loop**: the hook's gap resolves only in the final beat, which recontextualizes the hook
  so the video loops on rewatch.
- **Images use the style-block architecture**: SUBJECT + the channel's STYLE block repeated
  VERBATIM across a video's set (the only set-consistency lever a seedless model has) + FORMAT
  (single bold focal subject, upper two-thirds, quiet bottom third for captions) + RULES in
  prose (gpt-image-1 is an instruction-follower — no negative-prompt param). Preset styles now
  lock named palettes with drift suppressors ("literal colors, no gradients").
- **Beats shortened to 4-6s** — a Ken-Burns still reads as static past ~4s; word-timed captions
  and alternating motion buy up to 6.
- **The cut grammar**: hard cuts between scenes (one fade-in on frame one only); overlay text in
  the TOP third; captions big bold white-with-stroke on a rounded 60%-black box at lower-middle
  (margin.top 0.63) — above the platforms' ~300-400px bottom UI dead zone.

Two named upgrades to verify against live docs when taken: **gpt-image-2** (native 1080x1920 —
kills the crop) and **Shotstack Rich Captions** (word-level karaoke with active-word
highlighting — the current caption meta; our SRT path is the compatible fallback).

Explicitly deferred (in priority order): client-world channel auto-provisioning when the
`social_content` package is pinned (`packageEstablishes` hook); Instagram Trial Reels as a native
hook-test surface next to the in-house B-cut lab; the creative-board platform widening for image
posts (`socialBoard.ts`/`campaignCore.ts` still expose 4 platforms — the VIDEO path already
reaches all of them); a cheap posting head next to Ayrshare (Post Bridge/upload-post seam);
Phase 2's AI clip engine (`generate-clip` with the Veo + aggregator seam over
`reel_jobs`/`reel_clips`); a direct YouTube Analytics API integration (the only API exposing the
full 100-point retention curve).

**Round 5 (Aug 3) — the own-footage lane (UGC Studio):**

The missing third lane between "fully faceless" and "hire an editor": the operator films real
takes and the machine applies the researched native edit. Two research sweeps (the 2026 UGC edit
grammar; the hybrid real+AI doctrine) encoded as:

- **`ugcEdit.ts` pure core** (21 verified checks): real takes → Shotstack edit with HARD CUTS
  only, alternating full-frame ↔ ~115% punch-ins with a 6% slow push (the retention device),
  word-karaoke captions transcribed from the footage's OWN audio (`alias://aroll`), a ≤1.5s
  frame-one hook card, b-roll as a MUTED 1-8s layer over continuous voice, music at 0.15 under
  speech, `transcode: true` for phone rotation/VFR.
- **`scriptToShotList()`** — a drafted episode becomes a station-grouped filming sheet: verbatim
  lines, framing + delivery notes, POST slots for the hook card and stylized AI cutaways
  (locked prompts, never photoreal). One-click download on every episode card.
- **The UGC Studio** in every `content_growth` area: upload takes (vault storage) → hook card →
  optional AI diagram cutaways → render → queue through the same approval-gated publisher.
- **The hybrid doctrine, enforced honestly**: the human testifies (hook, claims, CTA on camera —
  the host's face/voice are never AI-altered); AI illustrates (stylized, provenance-stamped
  cutaways + "Illustrations AI-assisted." in the caption). A cut with NO AI elements carries no
  provenance and no AI mark — the honest inverse.

**Round 6 (Aug 3) — CapCut parity, researched and encoded:**

Two sweeps (the CapCut-grade edit anatomy with measured numbers; the Shotstack v1.14.1 schema
verified from the official OAS repo) closed the gap between "an edit" and "a CapCut-grade edit":

- **AUTO JUMP-CUT** (`autoCut.ts`, 15 checks): browser-side audio decode → window-RMS envelope →
  adaptive speech detection → pauses >0.5s (0.3s energetic) become jump cuts with the pro padding
  (0.09s front / 0.15s tail — the TimeBolt/Descript convention). Analysis failure keeps the take
  WHOLE — never a silent discard. Silence removal supplies the winning 2-4s cut cadence
  automatically, and the punch alternation disguises every cut it makes.
- **THE SFX LAYER**: whooshes riding the cuts (−18dB, leading by ~3 frames), pop on the hook
  card (−14dB), riser under an energetic hook (−24dB). Sparse (≤3) on the calm lane, dense (≤12)
  energetic. CC0-attested kit only (the musicBed rule); unknown cut times place NOTHING — auto-cut
  makes the timeline computable, which is what unlocks precise cues.
- **LANES**: calm (caregiver/educational — karaoke captions, restraint, no shake: the 2026
  "dynamic minimalism" read) vs energetic (UGC-ad — pop captions, tighter cuts, a CapCut hard-shake
  on the first punch-in via rapid X-offset keyframes).
- **Fixes from the schema verification**: captions were positioned ABOVE center (Shotstack +y
  moves UP — real bug); now lower-middle (-0.2) in a wrap:true pill with a 3px stroke; light
  'boost' grade on every take (correct, don't grade); active-word yellow #f7c204.
- Known ceiling, documented honestly: no audio ducking/sidechain, no emoji in rich captions, no
  speed ramps (single scalar only), no server-side silence detection — all verified absent from
  the Edit API as of v1.14.1.

## 10. Why this wins

1. **The rails already exist here** — approval spine, publishing, metrics sync, credits, breaker,
   client machinery. Competitors have none of this; traction-engine had none of this.
2. **The factory already exists there** — ~4,000 proven lines solving the genuinely hard problems
   (timing, moderation, routing, cost control), ready to port behind clean seams.
3. **The market gap is the loop, not generation** — and the loop is Phases 1+3, which are mostly
   wiring things this repo already has.
4. **Honesty is the brand** in the exact year platforms declared war on slop: labeled provenance,
   cited claims, approval-gated sends, billing that only charges for what rendered.
5. **Multiple monetization heads on one spine**: your apps, affiliate, and the authenticity-first
   handmade route — the attention gets built once and routed to whatever converts this month.
