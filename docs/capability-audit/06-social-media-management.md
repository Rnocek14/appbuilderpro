# 06 — Social Media as a Managed Service: The Best Rail in the House, and the Missing Service Around It

*Phase 5.5 capability audit. Domain: running many clients' social presences as a paid, recurring
service — connect each client's accounts, understand their brand and market, find local
opportunities, set strategy, produce posts/graphics/video, plan a calendar, approve in batches,
publish on schedule, watch the results, handle failures, and get measurably better. Rubric,
formats, and evidence protocol: `_charter.md`. Evidence: [R03] §6–7, §12 · [R05] §6, §7.2–7.3,
§9.2–9.6, §9.14, §9.20–9.21 · [R06] §0, §9, §15 · [R07] §2.12, §2.14, §3.1, §3.3 ·
[R13] §6.3, §8.8–8.12, §9.8–9.9, §10.2, §10.14 · `prototypes/README.md` · direct greps of
`src/` and `supabase/functions/` cited inline with file:line.*

---

## 0. What this domain already is (the honest headline)

The publish spine is the proudest single rail outside email. `queueSocialPost` validates against
per-platform refusal gates (media required for IG/TikTok/YouTube/Pinterest, 280-char X cap, no
past-scheduling), snapshots into `social_posts`, and enqueues ONE `publish_post` approval;
`social-publish` re-runs the refusal gate server-side, resolves a per-world/brand Ayrshare
Profile-Key **fail-closed** once any mapping exists, posts through Ayrshare to 9 networks, and
maps real per-platform failures honestly [R13 §9.8] [R07 §2.12] [R05 §9.6]. `social-sync` reads
the results back every 6 hours with the house discipline — "absent = NULL, never fake 0," raw
provider object verbatim, plan-gate degrade instead of hammering [R13 §9.9]. And this domain
hosts **the system's only production earned-autonomy loop**: content weeks — producer → judged
fail-closed → ONE weekly approval → clock drain → `auto_mode` after 3 clean, un-edited human
approvals, instantly revocable, tamper-evident via `pieces_hash` [R05 §9.6] [R13 §6.3] [R03 §6].
The approval-posture ladder the charter wants everywhere (approve → slate → earned) was
*invented here*, for one action class.

But judged as a MANAGED SERVICE, what exists is a superb pipe with almost no service around it:

- **Front (onboarding)**: per-client account connection is "paste an API key, then go link the
  actual Facebook/Instagram/LinkedIn accounts on **Ayrshare's dashboard**" — and the per-client
  `client_connections` checklist has **no social connector row at all** (9 connectors: domain,
  email_sender, sms_number, voice_number, booking, payments + 3 `built:false`; social is not
  among them) [R07 §3.3]. A won social-package client's hookup status is invisible to the one
  surface built to track hookups.
- **Middle (planning + decision)**: there is no content-calendar object or view anywhere — the
  "2-week content calendar" is a text draft asset (`marketingRun.ts:73`), and the cross-client
  approval slate exists only in prototype P4 (`morning-brief.html`).
- **Back (operations + learning)**: a failed post's remediation is literally the string
  "Provider reported a per-platform failure — check the provider dashboard"
  (`social-publish/index.ts:158`) — no retry, no re-queue verb, no exception surface; and the
  honestly-collected metrics are read by exactly one display function (`socialRun.ts:79`) and
  feed **nothing** — not the producers, not strategy, not the content-week judge, not a play.

The author's own pillar grade agrees: **Social B−**, Video C/D, "Marketing brain" C [R03 §12].
Everything below is 🔌-qualified per the master gate: dark until the heartbeat is armed and the
Ayrshare/OpenAI keys are set [R06 §0].

---

## 1. The chain — SOCIAL MEDIA AS A MANAGED SERVICE (end to end, one row per step)

| Step | Status | Evidence | Build/Buy | Owner object | Approval posture | Portfolio surface | Breaks at |
|---|---|---|---|---|---|---|---|
| 1. Client account connection | **PARTIAL 🔌 + EXT-REQUIRED** | Operator pastes ONE Ayrshare API key, probe-validated against `/api/user` [R07 §3.1]; per-brand Profile-Keys pasted by hand into `AyrshareDestinations.tsx:86` (a password input); resolution is fail-closed once any mapping exists (`social-publish/index.ts:129–140`); the actual account linking happens on Ayrshare's dashboard — grep `generateJWT\|linking` → zero linking-URL generation; `client_connections` has NO social connector [R07 §3.3] | Buy: stay on Ayrshare Business (multi-profile + generated client linking pages — their API supports it, unbuilt here); Build alternative: native Meta/LinkedIn/TikTok/X/Pinterest APIs = 9 separate app reviews + token lifecycles — not worth it below T-1K (doc 11 concurs: MT-plan-dependent) | Capability | none (setup) | Lens: per-client social-connect status on the Client Book checklist (row must first exist) | T-10 — walking each client through a third-party dashboard, then hand-pasting their Profile-Key, with zero checklist visibility; T-100 adds per-profile fees multiplying [doc 11] |
| 2. Brand / audience / product / competitor understanding | **PARTIAL** | Grounded today by: world DNA + `business_context` + `world_intelligence` open questions + evidence-labeled `mind_beliefs` compiled into studio chat [R05 §9.3]; brand kits + vault photos [R05 §9.27]; voice loaded from the world's most recent *posted* row, world-scoped so brands never bleed [R05 §9.4]; 14-vertical compliance packs [R05 §9.14]; market-intel category scans 🔌 [R05 §9.21]; research-on-record injected as "never contradict it" [R05 §9.6] | Build: pull Ayrshare account-level audience analytics into the same nullable-honest tables; competitor-page watch via existing `watch_url` standing order pointed at competitor socials | Workshop + substrate | none (internal) | Cohort: one vertical voice/compliance pack inherited by all clients in a niche | T-10 — audience = the CONTACT list, not the social audience (no follower/demographic data anywhere); competitor presence is a manual research prompt, not a standing input |
| 3. Local trend / opportunity research | **PARTIAL 🔌 → MISSING (social-native)** | General-web machinery is real: Serper sweeps with self-tuning query rotation (`opportunity_hunt` [R13 §6.3]), `research_market` cited briefs [R05 §4.2], Anthropic web_search deep research [R13 §8.13], Perplexity/Serper server proxy [R07 §2.14]; but nothing social-native — no trending-topic/hashtag/audio source, and grep `social listening` → zero code | Buy: platform trend endpoints or a listening vendor (doc 11 defers Brand24/Mention-class to T-SPEC); Build: a `trend_scan` standing order over the EXISTING Serper rail scoped "{city} {niche} this week" is nearly free | Standing Order | none (read) | Lens: this week's local angles per client market | T-10 — an agency selling "we know what's moving in your market" cannot run it manually for ten markets |
| 4. Content strategy | **PARTIAL** | 3-stage generator's stage 1 produces a real strategy + 2-week calendar as draft assets, research-grounded, verifier-gated [R05 §9.6] [R03 §6]; plays-as-data exist (`plays.ts`) [R05 §9.26]; but strategy is regenerated per campaign — there is no standing per-client strategy object that producers consult on later runs | Build: persist strategy as a versioned artifact the content-week producer reads (producers already auto-load prior concepts to diverge from [R05 §9.20]) | Workshop → Artifact | none (drafts) | Cohort rollout: one strategy template versioned across a client cohort | T-10 — ten clients' strategies living as stale campaign drafts can't be compared, versioned, or rolled forward |
| 5. Ideation / creation — posts | **WORKING** | `produceSocial` producer [R05 §9.20]; socialBoard per-platform CTA rewriting + hashtag caps (ig:8/fb:3/li:3/x:2), world-scoped voice exemplars [R05 §9.4]; `board-copy` writer + editor-in-the-loop judge, score <8 triggers revision [R13 §8.8, §10.14]; campaign composer + content weeks [R03 §6]; deterministic socialStudio gallery floor with zero keys ("Nothing posts from here") [R05 §9.3] | Build (done) | Workshop | none (drafts) | Slate: this week's drafts across clients | Holds to T-100 (pure cores + per-world scoping) |
| 6. Ideation / creation — graphics | **WORKING 🔌** | `generate-image` (gpt-image-1) with honesty gates + guardrails [R13 §8.10] [R05 §9.5]; `render-design` brand cards server-side (satori→PNG) in IG/FB/LinkedIn/X sizes, "the business's OWN graphic — no AI disclosure" [R13 §8.9]; provenance first-stamp-wins + `disclosureGate` before publish [R05 §9.5]; brand-kit consistency partial — kits feed boards/postcards but no per-client template library beyond the one brand card | Build: per-client design-template variants on render-design (satori templates are data) | Capability | none (drafts) | — | T-10 — one brand-card design per brand; a managed service needs a reusable per-client template set |
| 7. Ideation / creation — video | **PARTIAL 🔌** | Storyboard → Shotstack render real but "grade C: real but hands-on" [R03 §7] [R13 §8.12]; Veo 3.1 scene library exists but is consumed by bespoke SITES, not social [R13 §8.11]; reel studio is a real 3-stage deterministic pipeline (with the `REEL_BANNED` engagement-farm blocklist) [R05 §9.3] but the reel RENDER engine is a dead schema — Sora/Runway/Luma + ElevenLabs priced in the credits ledger with zero provider code [R13 §10.2, §13.6] [R06 §15 #2] | Buy: pick ONE render provider (Shotstack already live; wire reel scenes through it before buying Sora/Runway) | Workshop bench | approve (AI media out the door) | — | T-ME for anything unattended; T-10 for per-client video at all |
| 8. Content calendar | **MISSING (as a real object/view)** | The "calendar" is a text/JSON draft asset (`marketingRun.ts:73` inserts `'calendar', '2-week content calendar'` into `marketing_assets`); `capabilitySeed.ts:25` lists `content_calendar` at maturity `'stub'`; the only schedule surface is a flat status list with chips (`SocialPublisher.tsx:138–163`); `social_posts.scheduleAt` exists and drains correctly but no time-grid view reads it | Build: a calendar surface over EXISTING rows (§8 spec) — the data model needs nothing new | Workshop (deep surface, §8) | none (view) | THE portfolio surface: all clients' next 14 days on one grid, gaps glaring | T-10 — one client's week fits in the Queue; ten clients' scheduled posts are invisible as a plan |
| 9. Batch approval (slates) | **PROTOTYPE-ONLY (cross-client) / WORKING 🔌 for one class** | The cross-client morning slate that "still catches the planted bad send" is prototype P4 only (`prototypes/README.md` — `morning-brief.html`, staged data); the real system approves per-item in One Queue [R03 §2]; EXCEPT content weeks: a whole week batches into ONE hash-bound approval card, and after 3 clean weeks `auto_mode` skips the card entirely [R05 §9.6] [R13 §6.3] | Build: generalize the content-week pattern — slate = one approval over N hash-bound items with per-item veto (the `pieces_hash` re-hash on edit already exists: `editContentWeekPiece` [R05 §9.6]) | substrate (spine extension) | slate (this IS the posture) | The daily decision surface across all clients | T-10 — the charter's own tier definition puts slates here; per-item approval × 10 clients × 5 posts/week is ~250 decisions/week |
| 10. Scheduling / publishing | **WORKING 🔌** | approval → `social-publish` → Ayrshare 9 platforms, payload-hash bound, atomic double-post claim, per-world Profile-Key fail-closed, server-side refusal-gate re-run, schedule grace (≤1h stale posts now, staler refused) [R13 §9.8]; scheduled posts + approved drafts drained by standing-worker every 15 min [R13 §6.3]; Marketing Publish/Schedule wired to this real rail post-audit [R06 §9] | done (Buy decision already made and LIVE: Ayrshare) | Capability + Standing Order (drain) | approve → earned (content weeks) | Slate: pending posts across clients | Holds to T-100 (per-brand key resolution exists); T-100 cost: per-profile fees [doc 11] |
| 11. Monitoring / metrics | **WORKING 🔌 (read-back only)** | `social-sync` 6-hourly cron + on-demand: per-post analytics into `social_post_metrics`, every metric nullable, raw object verbatim, reconciles `scheduled`→`posted` only on evidence, Ayrshare 402/403 → honest `available:false` (analytics needs Premium/Business) [R13 §9.9] [R07 §2.12] | done for analytics; comments/DMs/mentions are a separate Ayrshare API surface — unbuilt (see step 12 and Matrix) | Standing Order | none (read) | Lens: engagement per client; staleness check per feed | Holds to T-100; ≤20 posts/owner/run is a tuning knob, not a wall |
| 12. Exception handling (failed posts, platform rejections) | **PARTIAL** | Pre-emption is strong: `checkDraft` refusal gates client-side AND re-run server-side, so "a doc a platform would reject never goes out" (`social-publish/index.ts:116`); real failures write `status:'failed'` + error + ledger + a mind_event note (`index.ts:146–166`); but the remediation string is "check the provider dashboard," there is no retry, no re-queue verb, no owner-webhook push (leads/replies get webhooks; failed posts get a note), no failed-post surface; scheduled-post reconciliation exists only in the happy direction [R13 §9.9] | Build: exception queue (failed posts across clients) + one re-queue verb through the existing approval; wire `notify.ts` (exists) to failures | substrate + Capability | exception → approve (re-queue) | Control-plane check: failed/rejected posts across ALL clients, exception-only | T-10 — ten clients' failures buried in per-world mind_events means the service breaks silently |
| 13. Outcome learning (post-performance → Playbook) | **DISCONNECTED** | Metrics land with best-in-corpus honesty, then: grep `social_post_metrics` consumers → `socialRun.ts:79` (display) and the writer, nothing else; producers auto-load prior CONCEPTS to diverge from but never performance [R05 §9.20]; content-week judge is a static rubric (`copyJudge` [R13 §10.14]); the kept-vs-rewritten `draft_verdicts` learning loop exists for EMAIL inbox drafts only [R13 §7.7]; plays are static data [R05 §9.26] | Build: feed top/bottom performers into the producer prompt (the "prior concepts" slot already exists); write a per-client social `decision → outcome` into the mind's decision ledger (which itself closes outcomes manually [R06 §8]) | Standing Order + ledger | none (internal) | Cohort compare: which content class wins across clients in a vertical | T-ME for the "gets better with time" claim (author's own grade: C+ [R03 §12]); T-10 for the service being sellable as improving |
| 14. Canvas ArtifactSheet → publish | **DISCONNECTED** | The social canvas "Change it with Garvis" `ArtifactSheet` is architecturally unable to publish — the `clusterChat.ts` decision contract is only `reply \| create_artifact \| revise_artifact`; the real rail (`SocialBoard → queueSocialPost → approval → Ayrshare`) is one room over with no bridge, re-verified by grep [R06 §9] [R06 §15 #1] | Build: one publish verb routing to the EXISTING approval path (the register's one-line repair) | Capability | approve (inherits the rail's posture) | — | T-ME — the signature dead-end; every canvas session ends in copy-paste |

**Chain verdict.** Steps 5, 6, 10, 11 are a genuinely professional core — draft honestly, gate
fail-closed, publish through one spine, read back without lying. Step 9's content-week loop is
the single most charter-aligned mechanism in the entire system: batch → human streak → earned
autonomy → instant revoke. But the chain as a SERVICE fails at its bookends: onboarding (step 1)
routes through a third party's dashboard with no checklist row tracking it, planning (steps 4, 8)
has no persistent objects, deciding (step 9) generalizes only in a prototype, and operating
(steps 12–13) neither surfaces failures nor learns from successes. The shipped product is:
**"once you've wired a client by hand, we will draft, gate, publish, and honestly count one
client's social — and after three clean weeks, do the drafting-to-posting loop alone."** That is
a T-ME tool with the correct autonomy DNA. The service business begins at the calendar + slate +
exception queue trio, all of which are views and verbs over rows that already exist.

### Step notes — the quotes that carry the table

- **Step 1 (connection)**: the fail-closed rule is stated in the component's own header —
  "zero mappings = everything posts through the one connected account; once ANY mapping exists,
  a business without one BLOCKS at publish rather than posting to the wrong brand"
  (`AyrshareDestinations.tsx:2–6`). The UI copy then narrates the friction verbatim: "On
  Ayrshare's multi-client plan each brand gets a Profile-Key — map it here" (`:67–70`). The
  hard invariant is built; the onboarding around it is not.
- **Step 5 (posts)**: the social board loads voice examples "from the world's most recent
  *posted* row (the `world_id` filter is load-bearing 'so one business's voice doesn't bleed
  into another's')" [R05 §9.4] — the exact isolation a multi-client service requires, already
  in place. `board-copy` runs an "editor-in-the-loop: a judge scores 1–10, score <8 triggers
  one revision… the better draft ships with `quality:{score,notes}`" [R13 §8.8].
- **Step 6 (graphics)**: "a rendered brand design is the business's OWN graphic — not AI
  imagery — so it carries no AI disclosure" [R13 §8.9]; for AI imagery, "first stamp wins,
  provenance can never be stripped" and `disclosureGate` blocks undisclosed publishes
  [R05 §9.5].
- **Step 9 (content-week drain)**: "double hash check, social pieces → `social_posts` +
  pre-authorized `publish_post` approvals, email piece → `outreach_batches`" [R13 §6.3] — the
  one place where a BATCH decision flows to per-item execution with tamper evidence intact.
  This is the slate mechanism, shipped, for one kind.
- **Step 10 (publish)**: "schedule grace — a `scheduleAt` ≤1h past posts now, staler is
  refused" [R13 §9.8] — the rail already encodes the judgment a calendar surface needs.
- **Step 11 (metrics)**: the function's own purpose line names the loop this domain still
  hasn't closed: "Garvis posted to social and never looked at the results; this closes that
  loop" [R13 §9.9]. It closed the *reading* half only (see step 13).
- **Step 12 (exceptions)**: the complete remediation surface today is two strings —
  `error: 'Provider reported a per-platform failure — check the provider dashboard.'`
  (`social-publish/index.ts:158`) and the mind_event subject "A social post failed — check the
  provider." (`:166`). Recorded honestly; routed nowhere.
- **Step 13 (learning)**: producers gather "the world's real materials (DNA, brand voice, vault
  photos, prior research, goals), auto-loading prior concepts to diverge from" [R05 §9.20] —
  the injection slot for performance data exists; performance data never arrives in it.
- **Step 14 (canvas)**: "the 'Change it with Garvis' `ArtifactSheet` on the social canvas is
  architecturally unable to publish… the real publish loop is one room over with no bridge"
  [R06 §9] — the reconstruction's "signature dead-end," carried here as the domain's
  DISCONNECTED emblem.

---

## 2. Step 1 expanded — per-client account connection (the build-vs-buy note)

The resolved decision is **buy (Ayrshare), and it is live** [R07 §2.12] — the right call, since
the build alternative means nine separate platform apps (Meta App Review, LinkedIn Marketing
Developer Platform, TikTok audits, X API tiers…), each with its own token lifecycle and TOS
drift. Doc 11 already prices the consequence: multi-profile + analytics require Ayrshare's paid
tiers, and per-client profile fees multiply at T-100.

What the audit adds: the friction is not the vendor, it is the **unbuilt half of the vendor
integration**. Today's per-client sequence is:

1. Operator pastes the one Ayrshare API key into the connections hub (probe-validated against
   `/api/user`) [R07 §3.1].
2. On Ayrshare's multi-client plan, the operator creates a per-client Profile on **Ayrshare's
   dashboard**, gets the Profile-Key, and pastes it into a password field per business
   (`AyrshareDestinations.tsx:67–90` — the component's own copy narrates exactly this manual
   flow).
3. The CLIENT must then link their actual Facebook/Instagram/LinkedIn accounts — again on
   Ayrshare's surfaces. Ayrshare exposes API-generated single-use linking pages precisely for
   agencies; **no code here calls them** (grep: zero).
4. Nothing records any of this on the client's `client_connections` checklist, because no
   `social` connector exists in the 9-connector catalog [R07 §3.3] — the checklist that gates
   "automation may be switched on only when every required connector is connected" cannot see
   the social service at all.

The engineering that DOES exist is the hard part done well: fail-closed Profile-Key resolution
("zero mappings = the one account; once ANY mapping exists, an unmapped business BLOCKS at
publish rather than posting to the wrong brand" — `AyrshareDestinations.tsx:4–6`,
`social-publish/index.ts:129–140`). The missing part is pure onboarding plumbing: create-profile
+ generate-linking-URL via Ayrshare's API, a `social` row in `client_connections` with
`deriveStatus` reading `world_social_profiles`, and the linking URL dropped into the client's
intake email. Classification: **PARTIAL 🔌 + EXT-REQUIRED** (the EXT is already chosen and
live; what remains is build-internal against it).

---

## 3. The missing middle — calendar and slates

Two absences turn ten clients from a business into a scramble, and neither needs new substrate:

- **Calendar.** `social_posts` rows already carry `scheduleAt`, status, platforms, world_id;
  the standing-worker already drains them on time; `editContentWeekPiece` already proves the
  edit-re-hash-approval pattern for changing a pending item [R05 §9.6]. What does not exist is
  any surface that renders time: the marketing page renders the strategy stage's "content
  calendar" as a labeled text asset (`Marketing.tsx:16`, `marketingRun.ts:73`), and
  `SocialPublisher.tsx` renders a flat reverse-chron list with status chips. The seeded
  capability registry even names the gap honestly: `content_calendar … maturity: 'stub'`
  (`capabilitySeed.ts:25`). §8 specs the surface.
- **Slates.** The charter's `slate` posture exists in production for exactly one class:
  a content week is ONE approval card covering ~6 pieces, hash-bound, with earned `auto_mode`
  graduation [R05 §9.6] [R13 §6.3]. The cross-client, cross-kind morning slate — "ten clients,
  7am… slate approval that still catches the planted bad send" — is prototype P4
  (`morning-brief.html`), staged data, no server [prototypes/README.md]. The generalization
  path is visible in the existing code: a slate is an approval whose payload is a list of
  hash-bound child items with per-item veto, drained exactly like `content_week`/`send_batch`
  already are [R05 §6]. Classification stands: **PROTOTYPE-ONLY**, with the one-class WORKING
  precedent as the implementation seed.

---

## 4. The open back — exceptions and learning

- **Exceptions (PARTIAL).** The system is excellent at *preventing* platform rejections
  (per-platform refusal gates enforced at queue AND re-checked at publish [R13 §9.8]) and
  honest at *recording* failures (status, error, immutable ledger row, mind_event). It has no
  concept of *remediating* them: no retry policy, no re-queue verb, no failed-post view, and
  the owner-webhook channel that pushes leads and positive replies [R03 §5] is not wired to
  publish failures. At T-10 this means a client's Tuesday post can fail quietly into a
  mind_events stream nobody reads, while the client notices the gap before the operator does —
  the exact inversion of a managed service's promise.
- **Learning (DISCONNECTED).** This is the charter's built-but-not-connected disease in its
  purest form: the read-back half was explicitly built because "Garvis posted to social and
  never looked at the results; this closes that loop" [R13 §9.9] — and then the loop was closed
  into a display component and nothing else. No producer prompt receives performance data; the
  judge rubric never recalibrates; no play or strategy artifact updates; the mind's decision
  ledger (the designed home for outcome learning) receives no social outcomes. The repair is
  small and native: the producers already take "prior concepts to diverge from" [R05 §9.20] —
  feeding them "these 3 outperformed / these 3 died, with real counts" is the same slot with
  better contents, and a weekly per-client rollup writing to the decision ledger rides the
  existing consolidation pattern [R06 §8].

---

## 5. Approval-posture map — where the dial sits today, and where it must sit

The charter's posture ladder (approve → slate → earned → auto → none) is more fully realized in
this domain than anywhere else in the system, which makes the remaining mismatches precise:

| Action class | Posture today | Posture the service needs | Gap |
|---|---|---|---|
| One-off post (board / composer / Marketing Publish) | approve (per item, One Queue) [R06 §9] | approve at T-ME → slate at T-10 | slate generalization (§3) |
| Scheduled post | approve, then the clock drains it [R13 §6.3] | same | none |
| Content week (the weekly pack) | slate (ONE card) → **earned** (`auto_mode` after 3 clean, revocable) [R05 §9.6] | same — this is the template | per-client streaks don't aggregate into cohort trust until T-100 |
| Re-queue of a failed post | does not exist | approve (payload unchanged = same hash, cheap to verify) | the verb itself (§4) |
| Gap-fill drafts from the calendar | does not exist | none (drafts are Initiative-inward) | the surface (§8) |
| Metrics / trend / audience syncs | none (read-only) [R13 §9.9] | none | pull more (audience, comments) |
| Community replies (comments/DMs) | does not exist | approve → earned, mirroring the inbox-draft `draft_verdicts` pattern [R13 §7.7] | the entire engagement rail |
| Monthly client report send | does not exist | approve (rides the send-email spine) | the report producer (§9 Q10) |

Two facts make this domain the autonomy proving ground for the whole audit: the earned streak
is computed from **human decisions only** ("streaks from human decisions only" [doc 01 §0]),
and revocation is instant and total ("rejecting a week revokes auto-mode" [R05 §6]).
Nothing else in the system — email follow-ups included — has graduated past "eligible."

---

## 6. Scale-gate walk (what the managed service needs at each tier)

- **T-ME (the operator, this quarter)**: viable today, with hands. Arm the heartbeat, set the
  Ayrshare + OpenAI keys [R06 §0], map one Profile-Key per brand, and the draft→judge→approve→
  publish→measure loop runs for a handful of brands — the operator personally serving as the
  calendar (memory), the slate (One Queue triage), and the exception queue (reading mind
  events). Cheapest unlocks at this tier: the canvas publish verb (register repair #2) and the
  performance→producer feed, because "gets better with time" is the sales pitch from client one.
- **T-10 (ten clients)**: the tier this document's gaps are ABOUT. Requires: the calendar
  surface (§8), the generalized slate (§3), the failed-post exception queue + re-queue verb
  (§4), the `social` checklist connector, and Ayrshare linking-URL automation (§2). Per-client
  autonomy dials already exist (content weeks are per-standing-order); per-client voice
  isolation already exists [R05 §9.4]. Without the four builds, ten clients ≈ 250
  approvals/week hand-triaged and failures found by clients.
- **T-100 (one hundred)**: cohort mechanics dominate — one vertical's strategy template
  versioned and rolled out ([R03 §9] vertical-as-data is PLANNED), trust aggregation (a
  cohort's clean record informing, never granting, a new client's dial), per-profile Ayrshare
  fees forcing a native-API re-evaluation [doc 11], and credential scope migration
  (`world_social_profiles` and Ayrshare keys into the per-client vault scope — doc 11's
  ARCH-CHANGE row). Compliance packs need their update loop [R05 §9.14 note].
- **T-1K (one thousand)**: nothing at this tier is domain-specific — it is doc 10's control
  plane consuming this domain's signals: failed-post rate per client as an SLA, key-health
  probes (Ayrshare 402/403 `available:false` already emits the signal [R13 §9.9]), spend
  anomalies on image/video credits (the ads-watch pattern is the named template
  [doc 01 §22]), canary posts on a test profile. The domain's job between now and then is
  to keep emitting honest, nullable, ledgered signals — which it already does.

---

## 7. Proposed Workshop: SOCIAL / CONTENT WORKSHOP (charter 14-field spec)

*Like the real-estate case, this Workshop mostly exists as data already: the `social` studio
flavor has a named workshop definition (`workshops.ts:57`, routed at `:191`), the social board
is a working bench, and producers/content-weeks are its engine room. The spec below closes it.*

- **Job**: run one client's complete social presence — standing strategy, weekly content,
  graphics and video, calendar, publish, engagement triage, monthly report — from the client's
  chartered world, at an agency professional's bar.
- **Knowledge required**: platform grammar (hashtag caps, char limits, media requirements —
  encoded in `socialCore.ts`/`socialBoard.ts`); brand voice (world-scoped posted exemplars);
  vertical compliance packs (encoded, `verticals.ts` [R05 §9.14]); AI-media disclosure rules
  (encoded, `mediaProvenance.ts`); engagement-farm bans (encoded, `REEL_BANNED` [R05 §9.3]);
  local market context (market-intel scans, MLS stats where the vertical applies).
- **Source data required**: brand kit + vault photos; world DNA/`business_context`; the standing
  strategy artifact (new, step 4); `social_posts` + `social_post_metrics` history; research on
  record; trend-scan results (new); Ayrshare profile/linking state; the client's approval-streak
  and autonomy state.
- **Direct-manipulation surface**: the existing nine-bench grammar carries the making — social
  board (tiles, lineage, archive), studio gallery floor, campaign composer — plus the
  CONTENT-CALENDAR surface (§8) for time.
- **AI's role**: ideation (produceSocial), drafting with the editor-in-the-loop judge
  (board-copy ≥8 fail-closed), image generation under honesty gates, short-script/storyboard
  drafting, performance narration over real counts; never invents metrics, never posts outside
  the spine, never strips provenance.
- **Tools**: `queueSocialPost`, `contentWeekRun` (+ auto-mode dial), `boardCopyRun`,
  `imagegenRun`/`render-design`, storyboard→`render-video`, `socialRun` metrics fetch,
  slate builder (new), re-queue verb (new).
- **External integrations**: Ayrshare posting + analytics (LIVE 🔌); gpt-image-1 (LIVE 🔌);
  Shotstack + Veo (LIVE 🔌); Serper (LIVE 🔌); **missing**: Ayrshare profile-create/linking-URL
  endpoints, Ayrshare comments/messages API (community management), any trend/listening source.
- **Evaluation/critique criteria**: copyJudge score ≥8 fail-closed; per-platform `checkDraft`
  refusal gates; `disclosureGate` on AI media; hashtag/char caps; vertical compliance flags;
  no-empty-week cadence check per active client (new).
- **Output Artifacts**: posts (all platforms), weekly content packs, brand-card graphics,
  storyboards/mp4s, the standing strategy doc, the calendar (a view over rows), monthly
  per-client performance report (new — clone the monthly automation-report pattern [R05 §9.23]).
- **Missions it creates**: "Stand up client X's social presence" (connect → ground → first
  strategy → first week), "October local-events push for Y" — arcs on the existing spine.
- **Standing Orders it establishes**: `content_week` (exists), `social-sync` (exists),
  `trend_scan` per client market (new, over the Serper rail), gap-watch on the calendar (new),
  monthly report (new).
- **Outcome signals it learns from**: `social_post_metrics` per piece; approval verdicts
  (approved-clean vs edited vs rejected — the streak substrate exists); failed-post ledger;
  posted-vs-planned adherence; follower/audience deltas once account-level analytics are pulled.
- **Expert controls**: per-client autonomy dial (exists for content weeks); platform on/off per
  client; voice-exemplar pinning; compliance-flag review; Profile-Key mapping; freeze windows;
  per-client posting caps.
- **Fast-path (AI-assisted)**: "signed {client} for the social package" → seed strategy from
  world DNA + vertical pack → first content week drafted same day ("same-day evidence" is
  already the content-week ethos [R05 §9.6]) → one slate card → linking URL sent to client via
  the intake rail.
- **Verdict**: **REUSABLE-FRAMEWORK.** The social studio flavor, board bench, producers, and
  content-week loop demonstrably ARE this workshop's skeleton — no new grammar is needed. What
  is missing is one deep surface (the calendar, §8), two rails (onboarding plumbing, engagement
  read), one verb (re-queue), and one loop (performance → producer).

---

## 8. Proposed surface: CONTENT-CALENDAR (charter 14-field spec + the archetype ruling)

- **Job**: see and shape time — every client's planned/queued/scheduled/posted/failed content on
  one grid; drag to reschedule; gaps and pile-ups visible at a glance; the weekly slate composed
  from what the grid shows.
- **Knowledge required**: platform cadence norms; client timezones/quiet hours; the publish
  rail's schedule-grace rule (≤1h past posts now, staler refused [R13 §9.8]); campaign anchor
  dates; local-event dates (once the trend scan exists).
- **Source data required**: `social_posts` (all statuses + `scheduleAt` + platforms + world_id);
  `content_weeks`; `marketing_assets` calendar/strategy drafts; approvals state per item —
  ALL existing rows; nothing new to store except optional event pins.
- **Direct-manipulation surface**: week/month time grid; per-client lanes and an all-client
  portfolio lens; drag-to-reschedule; click-through to the item's board tile/approval; gap
  highlighting per active client.
- **AI's role**: propose gap fills grounded in the client's facts (producers already do this);
  narrate cadence health over real counts; never auto-schedules — a drag writes through the
  spine.
- **Tools**: reschedule (re-hash the pending approval exactly as `editContentWeekPiece` does
  [R05 §9.6]); bulk-shift; duplicate-across-clients (with voice re-grounding, never verbatim);
  compose-slate-from-view.
- **External integrations**: none beyond what publishing already uses; optional holiday/local
  events feed later.
- **Evaluation/critique criteria**: no-empty-week per active client; collision detection (two
  posts, same platform, same hour); schedule-grace validation before the drag commits.
- **Output Artifacts**: the calendar is a VIEW over rows, not a copy (the house "thin index,
  never a copy" rule from `client_connections` applies [R07 §3.3]); the weekly slate.
- **Missions it creates**: "Fill client X's next two weeks."
- **Standing Orders it establishes**: gap-watch (alert when any active client's next 7 days are
  empty — exception-only, quiet when full).
- **Outcome signals it learns from**: posted-vs-planned adherence; per-slot engagement once
  step 13 closes.
- **Expert controls**: freeze windows (client asks for silence); per-client cadence targets;
  manual pin (never auto-moved).
- **Fast-path**: "push everything for client X back one day" → bulk-shift with re-hash →
  one confirmation.
- **The archetype ruling** (bench or DEEP?): the nine-bench grammar has no time axis — boards
  are freeform-spatial canvases, studios are galleries, the Queue is a list [R05 §9.2–9.4].
  A time grid with drag-commit semantics is a genuinely different interaction surface, and the
  charter forbids forcing campaign-planning surfaces into one canvas for consistency's sake.
  **Verdict: DEEP-ENVIRONMENT** — but explicitly the *cheapest deep environment in the audit*:
  unlike the map workshop (which also lacks its data), everything beneath this surface —
  `scheduleAt`, drains, approvals, tamper re-hash — already runs. One surface, zero new
  substrate.

---

## 9. The fifteen questions

| # | Question | Answer for this domain |
|---|---|---|
| 1 | Exists-working | Publish rail (Ayrshare ×9, fail-closed Profile-Keys, refusal gates) 🔌; metrics read-back 🔌; content weeks with earned auto_mode 🔌 (the system's one autonomy loop); social board + producers + board-copy judge; graphics (image gen + brand cards + provenance); scheduled-post drain; deterministic studio floor |
| 2 | Partial/scaffold | Client connection (key paste + hand-mapped Profile-Keys; linking on Ayrshare's dashboard; no checklist row); brand/audience grounding (voice yes, social audience no); trend research (general-web only); strategy (per-campaign, not standing); video (Shotstack manual; reel render dead schema); exception handling (recorded, never remediated) |
| 3 | Docs/prompts/prototypes only | Cross-client slate approval (P4 `morning-brief.html`); the Field/Brief surface it lives in; reel providers priced in the credits ledger with zero code [R13 §10.2] |
| 4 | Missing | Content calendar as object/view (text asset + `'stub'` seed only); social listening/community management (grep zero); social-native trend sources; social connector in `client_connections`; Ayrshare linking-URL automation; per-client social report; failed-post exception surface |
| 5 | Build internal | Calendar surface; slate generalization (content-week pattern exists); re-queue verb + failure webhooks; `social` checklist connector + `deriveStatus` over `world_social_profiles`; performance→producer feedback; standing strategy artifact; canvas publish verb (register repair #2) |
| 6 | External API | Already live: Ayrshare (post + analytics), gpt-image-1, Shotstack, Veo, Serper. To buy/extend: Ayrshare profile-create + linking-URL + comments/messages endpoints (same vendor, unbuilt surface); trend/listening vendor deferred (doc 11: T-SPEC for Brand24-class) |
| 7 | Reusable Capability | Publish spine, provenance/disclosure gates, copy judge, image gen, metrics-honesty pattern, slate mechanism (once generalized) — all channel/vertical-agnostic |
| 8 | Domain Workshop | Social/Content Workshop (REUSABLE-FRAMEWORK, §7) + Content-Calendar surface (DEEP-ENVIRONMENT, §8 — the thin one) |
| 9 | Mission | Client social stand-up, campaign pushes, month-of-content arcs — fit the existing arc/approval spine today |
| 10 | Standing Order | content_week (exists), social-sync (exists), trend_scan (new), calendar gap-watch (new), monthly report (new) |
| 11 | Requires approval | Every outward post (house invariant); AI-media publishing (disclosureGate); re-queues of failed posts; strategy sign-off optional |
| 12 | Safe autonomous | Content weeks after the earned 3-clean streak (exists, revocable — the model); metrics/trend syncs (read-only); calendar gap ALERTS (not fills); drains of already-approved items |
| 13 | Portfolio-level | The calendar all-client lens; the daily slate; failed-post exception queue; per-client connect-status on the checklist; engagement lens per client; cohort content-class comparison |
| 14 | Breaks at 10/100/1k | T-ME: video unattended, learning loop, canvas dead-end. T-10: onboarding friction, no calendar/slate/exception surface, strategy versioning, social audience data. T-100: Ayrshare per-profile fees, per-client credential scale (doc 11 ARCH-CHANGE), cohort trust aggregation. T-1K: everything portfolio-level here presupposes the doc-10 control plane |
| 15 | Mastery needs | Platform grammar (encoded); brand voice isolation (encoded); compliance packs (encoded, need update loop); trend/audience literacy (absent); performance feedback loop (collected, not consumed — the domain's defining gap) |

---

## Matrix rows

| Capability | Class | Evidence | Needed-at | Owner object | Note |
|---|---|---|---|---|---|
| Per-client social account connection (Ayrshare profiles) | PARTIAL 🔌 + EXT-REQUIRED | key paste [R07 §3.1]; hand-mapped Profile-Keys `AyrshareDestinations.tsx:86`; no linking-URL code (grep) | T-10 | Capability | linking lives on Ayrshare's dashboard; vendor endpoints exist, unbuilt |
| Social connector row in client checklist | MISSING | [R07 §3.3] 9-connector catalog has no social | T-10 | Capability | small build; `deriveStatus` over `world_social_profiles` |
| Native platform publish APIs (build alternative) | MISSING + EXT-REQUIRED | — | T-SPEC | Capability | 9 app reviews; the buy (Ayrshare) is live and correct |
| Brand/voice grounding (world-scoped exemplars) | WORKING | [R05 §9.4, §9.3] | T-ME | substrate | one business's voice never bleeds into another's |
| Social audience + competitor intel | MISSING | no follower/demographic pull; watch_url unused for socials | T-10 | Capability | Ayrshare account analytics + existing watch_url |
| Social-native trend research | MISSING + EXT-REQUIRED | grep: no trend source; Serper is general-web [R13 §6.3] | T-10 | Standing Order | `trend_scan` over the existing Serper rail is the cheap start |
| Social listening / community management (comments, DMs) | MISSING + EXT-REQUIRED | grep `social listening` zero; social-sync is analytics-only [R13 §9.9] | T-10 | Capability | Ayrshare comments/messages API; doc 11 defers listening VENDORS to T-SPEC |
| Standing per-client content strategy object | PARTIAL | strategy is a per-campaign draft [R05 §9.6] | T-10 | Workshop → Artifact | producers never re-read it |
| Post ideation/creation (boards + producers + judge) | WORKING | [R05 §9.4, §9.20] [R13 §8.8] | T-ME | Workshop | copyJudge ≥8 fail-closed |
| Social graphics (image gen + brand cards + provenance) | WORKING 🔌 | [R13 §8.9–8.10] [R05 §9.5] | T-ME | Capability | per-client template library thin |
| Social video (storyboard/Shotstack; reel render) | PARTIAL 🔌 + EXT-REQUIRED | manual grade C [R03 §7]; reel providers priced, zero code [R13 §10.2, §13.6] | T-10 | Workshop bench | wire reels through Shotstack before buying Sora/Runway |
| Content calendar object/view | MISSING | `marketingRun.ts:73` text asset; `capabilitySeed.ts:25` stub; `SocialPublisher.tsx` flat list | T-10 | Workshop (deep surface) | data model complete; the surface is the whole gap |
| Cross-client approval slates | PROTOTYPE-ONLY | `prototypes/README.md` P4 morning-brief | T-10 | substrate | content_week is the WORKING one-class precedent [R05 §9.6] |
| Content weeks earned autonomy | WORKING 🔌 | [R05 §9.6] [R13 §6.3] | T-ME | Standing Order | the system's autonomy model; per-client streaks don't aggregate (T-100) |
| Social publish rail (Ayrshare ×9, fail-closed keys) | WORKING 🔌 | [R13 §9.8] [R07 §2.12] | T-ME | Capability | holds to T-100; per-profile fees at scale [doc 11] |
| Scheduled-post drain on the clock | WORKING 🔌 | [R13 §6.3] | T-ME | Standing Order | 15-min tick |
| Social metrics read-back | WORKING 🔌 | [R13 §9.9] | T-ME | Standing Order | nullable-honest; Ayrshare plan-gated |
| Failed-post exception loop (retry/re-queue/surface) | PARTIAL | `social-publish/index.ts:146–166`: recorded, never remediated; no webhook | T-10 | substrate | "check the provider dashboard" is the whole runbook |
| Post-performance → producer/Playbook learning | DISCONNECTED | `socialRun.ts:79` sole metrics reader; producers diverge from concepts, not results [R05 §9.20] | T-ME | Standing Order | the read-back was built to close this loop and doesn't |
| Canvas ArtifactSheet → publish bridge | DISCONNECTED | decision contract lacks a publish verb [R06 §9, §15 #1] | T-ME | Capability | register repair #2: one verb to the existing rail |
| Per-client monthly social report | MISSING | no social report; monthly automation-report pattern exists to clone [R05 §9.23] | T-10 | Standing Order | numbers from ledger rows, quiet month says quiet |
