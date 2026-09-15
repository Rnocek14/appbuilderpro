# Real-Estate Marketing Workspace — Implementation Audit and Phase 1 Proposal

**Companion to** the *Lake Geneva Marketing and AI Operating Plan* (September 14, 2026).
**Repository snapshot inspected:** `2c61d03294db856b3da1c92b592102e62c5c192a` — the same commit the
operating plan reviewed, and the current tip of `main`.
**Status:** audit, proposal, and — as of the commits listed in §8 — a built Phase 1 spine.
The audit (§§0–2) describes the repository as it was found. The proposal (§§3–7) describes what was
then designed. §8 records what has actually been built since, and what has not.

---

## 0. Honesty preamble — what this audit establishes and what it does not

This is a **source inspection**. Every claim below was checked by opening the file and reading it.
Paths, table names, column names and quoted fragments are copied from the repository, not recalled.

It does **not** establish any of the following, and nothing here should be read as if it did:

- that a Supabase project is deployed, migrated, or healthy;
- that an Ayrshare account exists, which plan it is on, or which social accounts are linked to it
  (Ayrshare's analytics API is plan-gated, and the read-back path already handles a 402/403 by
  degrading honestly — see §2.5);
- that the pg_cron heartbeat is *armed* on the live database (the arming function exists;
  whether anyone has called it is a production fact);
- that any post has ever been published to a real account from this code.

Those are connected-environment checks. They belong in the Phase 1 acceptance run (§6), not here.

A second limit worth stating plainly: **this audit is about what the software can carry, not about
whether the marketing is any good.** The plan is right that the software only exists to make the
real marketing work easier. Nothing below improves a single listing appointment on its own.

---

## 1. The short version

**Do not start over, and do not rebuild the publishing rail.** The repository already contains a
working, carefully-reasoned approval → publish → read-back spine: `social_posts` +
`approvals(kind='publish_post')` + `social-publish` (Ayrshare) + the `standing-worker` drain +
`social-sync` metrics, with an atomic double-post claim, a server-side refusal gate, a fail-closed
AI-disclosure gate, and per-brand destination mapping. That is months of the hard part, already done
and already reasoned about in its own comments.

**What is missing is not the rail — it is what rides on it.** Five structural gaps stand between
the current code and the plan's first milestone (a second pass added several smaller ones, all
recorded in §2):

| # | Gap | Why it blocks the milestone |
|---|---|---|
| 1 | An approval binds to a **mutable row**, not to an immutable content version — and the media bytes behind an approved URL are mutable too | The approved text/destination/time/image is not what is guaranteed to publish (§2.2, §2.6) |
| 2 | No **final platform URL** is ever stored | "Verified publication result" has no record to point at (§2.5) |
| 3 | No **fact-with-source-and-review-date** record exists anywhere | "Never invent a marketing fact" has nothing to enforce against (§2.9) |
| 4 | Social scheduling has **no timezone** — `scheduled_for` is a bare `timestamptz` | "America/Chicago scheduling" is unimplemented (§2.4) |
| 5 | Cancellation and provider-timeout **reconciliation** stop at our own database | A cancelled post can still publish; a timed-out post strands (§2.3, §2.4) |

All five are small, additive, and fixable inside the existing spine. None requires a new
application, a new CRM, an MLS engine, or a client portal.

**And the fix for gap 1 does not need inventing — this repo already built it once.** The
`content_week` approval carries a `pieces_hash` in its payload, and the drain re-hashes the current
content before executing (`standing-worker/index.ts:721-733`):

```ts
if ((await hashPayload(wk.pieces)) !== wkPayload.pieces_hash) {
  // The content changed AFTER the decision — the decision no longer covers it. Refuse.
```

Phase 1's job is to give `publish_post` the same treatment the content week already has.

---

## 2. Capability inventory

Legend: **REUSE** — use as-is. **EXTEND** — good bones, additive change needed. **NEW** — must be
built. **AVOID** — exists, but do not pull it into this workspace.

### 2.1 Social post creation and content versioning

| Artifact | What it is | Verdict |
|---|---|---|
| `supabase/functions/_shared/socialCore.ts` | Pure core: `KNOWN_PLATFORMS`, `PLATFORM_LIMIT`, `MEDIA_REQUIRED`, `checkDraft()`, `providerPayload()`, `mapProviderResult()`. Refuses what a platform would reject rather than mangling it. | **REUSE** |
| `src/lib/garvis/socialRun.ts` | Impure half: `queueSocialPost()` (validate → insert `social_posts` → `enqueueApproval`), `cancelSocialPost()`, `listSocialMetrics()`, `metricsLine()`. | **EXTEND** |
| `supabase/migrations/app_0070_social_posts.sql` | `public.social_posts`: `body`, `platforms text[]`, `media_urls text[]`, `scheduled_for`, `status in ('queued','scheduled','posted','failed','canceled')`, `provider`, `provider_post_id`, `approval_id`, `error`, `posted_at`. Owner RLS, world-pinned. | **EXTEND** |
| `supabase/migrations/app_0123_growth_engine.sql` | Adds `social_posts.ai_provenance jsonb` (and on `cluster_files`). | **REUSE** |
| `supabase/migrations/app_0084_world_social_profiles.sql` | `world_social_profiles` — per-world Ayrshare Profile-Key mapping, fail-closed once any mapping exists. | **REUSE** |
| `src/components/garvis/SocialPublisher.tsx`, `AyrshareDestinations.tsx`, `canvas/SocialBoard.tsx` | Composer + destination UI inside the general studio. | **EXTEND** (a simpler surface reuses the logic, not the layout) |

**The finding that matters:** a post's content is **mutated in place**. `social_posts` is a single
live row; there is no content-version table and no `content_hash` column anywhere in the schema
(`grep` finds none). `public.artifact_versions` (`app_0026_cluster_studio.sql`) with its
`snapshot_artifact_version()` BEFORE UPDATE trigger is the nearest *shape*, but it is **not
immutable** — its policy is `for all using (owner_id = auth.uid())`, so the owner can update or
delete a snapshot. Its own migration calls it "snapshot-on-update history", not a ledger. A Phase 1
version table must therefore grant **SELECT + INSERT only**, and must not copy that policy.

### 2.2 The approval spine — and the binding gap

| Artifact | What it is | Verdict |
|---|---|---|
| `supabase/migrations/app_0022_execution.sql` | `approval_kind` enum (`send_email, publish_post, deploy_site, deploy_backend, spend, apply_migration, crm_action`), `approval_status`, `public.approvals` (`title`, `preview`, `payload jsonb`, `requested_by`, `status`, `result jsonb`, `expires_at`), `public.execution_runs` ledger. | **REUSE** |
| `supabase/migrations/app_0069_approval_payload_hash.sql` | `approvals.payload_hash` — "deterministic SHA-256 of that payload at creation so the executor can refuse if the payload changed after it was approved". Null-grandfathered. | **REUSE** |
| `supabase/functions/_shared/payloadHash.ts` | `stableStringify()`, `hashPayload()`, `payloadMatches()`. Shared client + edge. | **REUSE** |
| `src/pages/Queue.tsx` (`/garvis/queue`) | The one room for everything awaiting a human: decisions, questions, messages; keyboard model; Undo on reversible actions only. | **REUSE** |
| `src/components/garvis/approvalMeta.ts` | `KIND_META` — one vocabulary (icon + label) per approval kind. | **EXTEND** (only if a new kind is ever added — Phase 1 adds none) |

**The gap, stated exactly.** `queueSocialPost()` enqueues:

```ts
payload: { post_row_id: row.id },
```

and `social-publish` then loads the *current* row:

```ts
const { data: row } = await admin.from('social_posts')
  .select('id, owner_id, world_id, body, platforms, media_urls, scheduled_for, status, provider_post_id, ai_provenance')
  .eq('id', rowId).single();
```

So `payload_hash` protects a row **id**, not the text, media, destinations or scheduled time.
Editing the post row after approval changes what publishes, and the hash cannot see it. The code
says so itself, in `social-publish/index.ts`:

> `// The approval payload is only { post_row_id }, so the payload hash alone can't protect body/media — this re-derivation from the DB is the binding`

That comment is about the AI-disclosure gate, which *is* re-derived server-side. In fact three
gates re-read the row — `checkDraft()`, the disclosure gate, and the per-world Profile-Key
destination gate — but **none of them compares the row against what the human approved.** They are
validity and policy gates, not content binding. **This is the one structural change Phase 1 must
make**, and the plan names it correctly.

Two further properties of the spine that Phase 1 must handle deliberately:

- **The hash check is null-grandfathered.** `payloadHash.ts`: `if (!storedHash) return true;`. An
  approval minted without a hash skips verification entirely. A new `content_hash` must be
  **required** for `publish_post` on the new rail, or the binding is opt-out by omission.
- **There is already a machine path that mints pre-approved `publish_post` approvals.** The
  content-week drain inserts them with `status: 'approved', requested_by: 'garvis-auto',
  decided_via: 'content_week'` (`standing-worker/index.ts:767-771`), and `social-publish`
  deliberately accepts them (its comment: "status='approved' IS the human authority for either
  class"). For a general marketing tool that is a considered trade. For Gina's accounts it is not:
  **no post in this workspace may publish on an approval no human decided.** Phase 1 scopes the new
  rail so auto-minted approvals cannot ride it, and says so in a verify suite.

### 2.3 Ayrshare publishing

`supabase/functions/social-publish/index.ts` — **REUSE**, with two additive fixes. What it already
does well, all verified by reading it:

- **One path, two callers** — the owner's browser (JWT) or the worker (`x-worker-secret`); the owner
  is derived *from the approval row*, never from the caller.
- **Approval gates**: kind must be `publish_post`, status must be `approved`, `payloadMatches()`
  must hold, else `409`.
- **Atomic double-post claim** — a conditional update that only one caller can win:
  `.eq('status','approved').is('result->>send_claimed_at', null)`.
- **Schedule grace** — a moment that just passed (≤1h) posts now; anything staler keeps its past
  time so `checkDraft` refuses it with an honest reason rather than posting a day late.
- **Fail-closed AI disclosure** — `disclosureGate(text, provenance)` re-derived from the post row
  *or* from any attached media's `cluster_files.ai_provenance`.
- **Per-brand destinations** — `world_social_profiles` → `Profile-Key` header; fail-closed once any
  mapping exists.
- **Honest failure** — `status='failed'` + `error` on the row, an `execution_runs` ledger entry, a
  `mind_events` note, `channel_episodes` kept in step, and the claim released.
- **Provider timeout** — `AbortSignal.timeout(30_000)` on the Ayrshare call.

Two additive fixes needed (both in §4):

1. **Nothing captures the platform URL.** The handler stores `provider_post_id = out.id` and maps a
   status from `out.postIds[].status`. There is no `post_url`/`permalink` column on `social_posts`
   or `social_post_metrics` anywhere in the schema, and nothing reads a per-platform URL out of the
   response. *Whether the provider returns one, and under what field name, must be confirmed
   against a real response before coding — this audit inspected source only and did not call the
   API.*
2. **A thrown fetch (timeout) escapes to the outer `catch`**, which returns `500` — *without*
   releasing the claim and *without* touching `social_posts.status`. That is fail-safe against
   duplicates (good) but leaves the post permanently `queued`-and-claimed with no reconciliation
   (bad). **And it is worse than "stuck":** the 30-second abort can fire *after* Ayrshare accepted
   the post, so the post can be live on the platform while our row says `queued` with no
   `provider_post_id` — and `social-sync` only looks at rows that *have* a `provider_post_id`, so it
   is never noticed, never reconciled and never measured. There is also no `in_flight`/`publishing`
   status in the check constraint, so such a row is indistinguishable from a fresh one. The plan's requirement — "a timeout needs reconciliation before any retry that might
   create a duplicate" — is exactly right and currently unmet.

   Worth knowing: `send_claimed_at` appears in `social-publish`, `send-email`, `send-sms` and
   `docusign-send`, and **nothing anywhere resets a stranded claim**. This is a house-wide property,
   not a social-only bug. Phase 1 should build the reconciler for social in a shape that generalises
   (a small shared core + one table-agnostic claim record), so email, SMS and e-sign can adopt it
   later without a second design.

Two smaller properties worth knowing before touching this file:

- **A late post dies rather than slips — permanently.** Past the one-hour grace, `checkDraft`
  refuses and `block()` sets `status: 'failed'`. A worker outage longer than an hour kills every
  post scheduled inside it, and nothing re-queues them. That is the honest choice over publishing a
  day late, but Phase 1 should surface those as a Queue item rather than a silent failed row.
- **`approvals.result` is written read-modify-write over the whole jsonb column** (`priorResult` is
  snapshotted, then re-spread at every later write). Any concurrent writer's additions are
  clobbered. If Phase 1 stores anything else there, use a jsonb merge or a separate column.

**Swapping providers** (Upload-Post, per the plan's §11) is a contained change: `AYRSHARE_URL`, the
`Authorization`/`Profile-Key` headers, `providerPayload()` and `mapProviderResult()`. The last two
are already pure and verified. It is not abstracted behind an interface today, but it is close
enough that Phase 1 should not pre-abstract it — extract the adapter when a second provider is
actually being tested, not before.

### 2.4 Scheduling and background execution

| Artifact | What it is | Verdict |
|---|---|---|
| `supabase/functions/standing-worker/index.ts` (social drain, ~line 388) | Executes already-approved posts through the one publish path. Retires posts whose approval was rejected/expired; skips already-claimed ones; bounded `POSTS_PER_TICK = 5`, `SOCIAL_DRAIN_BUDGET_MS = 30_000`; inspects 25 to avoid head-of-line starvation. | **REUSE** |
| `supabase/migrations/app_0087_social_metrics.sql` → `garvis_arm_heartbeat()` | pg_cron heartbeat: `garvis-standing-tick` every 15 min, `garvis-social-sync` every 6h, plus 8 other jobs. Secrets in Vault. | **REUSE** |
| `public.social_posts.scheduled_for` | A bare `timestamptz`. | **EXTEND** |

**Timezone gap.** `America/Chicago` appears in this repo only in `outreach_settings.timezone`
(`app_0023_outreach.sql`, default `'America/Chicago'`), `src/pages/Settings.tsx`, `send-email`,
`garvis-pulse`, and the ICS helper (`_shared/icsCore.ts` → `calendarLine`, which uses
`Intl.DateTimeFormat` with a `timeZone` — the correct precedent). **No social-scheduling code
reads any timezone at all.** "Tonight at 8" is whatever instant the browser happened to compute.

**Cancellation gap.** `cancelSocialPost()` flips a still-`queued` row to `canceled` locally. Once
Ayrshare has accepted a future `scheduleDate` (status `scheduled`, `provider_post_id` set), nothing
in this repo asks the provider to delete it. The post is cancelled in our database and still live on
the provider's schedule.

### 2.5 Metrics and delivery read-back

`supabase/functions/social-sync/index.ts` + `supabase/migrations/app_0087_social_metrics.sql` —
**REUSE**. `social_post_metrics` is `unique (post_id, platform)`, every metric column nullable
("absent = NULL, never a fake 0"), raw provider object kept verbatim, owner-read RLS with
service-role writes. Plan-gating is handled honestly: a 402/403 sets `available:false`, stamps
`last_synced_at` and stops hammering, and the UI renders counts-only rather than invented numbers.
A `scheduled` post is reconciled to `posted` **only on evidence** (analytics actually came back) —
the comment is explicit that a 2xx envelope "proves nothing about the post being live".

Two corrections to the happy picture, both found on a second read:

- `last_synced_at` is stamped on the 2xx path and on the plan-gated 402/403 path — **but not on any
  other non-2xx (404/429/5xx) nor on a thrown fetch.** Those rows stay inside the
  `last_synced_at.is.null` selector and are re-fetched on every 6-hour tick indefinitely.
- Coverage is deliberately bounded: `MAX_POSTS_PER_OWNER = 20`, `STALE_AFTER_MS = 6h`,
  `WINDOW_MS = 30 days`. Fine for one realtor; worth knowing before anyone reads a number as
  complete.

**EXTEND:** add the platform URL (`post_url`) to what is captured and displayed. This is the single
column that turns "we think it went out" into "here it is".

**A plan consequence that matters for the acceptance test:** because the `scheduled → posted`
reconciliation requires analytics to come back, on a plan without analytics a *provider-scheduled*
post is never confirmed posted and never gets metrics. On that plan the honest way to prove
publication is to post immediately rather than schedule provider-side, or to read the provider's
history endpoint — not to wait for a status that cannot arrive.

### 2.6 Assets, media and provenance

| Artifact | What it is | Verdict |
|---|---|---|
| `supabase/functions/_shared/mediaProvenanceCore.ts` | The one pure provenance core: `AiProvenance {aiGenerated, kind, tool, model?, createdAt}`, `AI_DISCLOSURE = 'Contains AI-generated media'`, `AI_DISCLOSURE_TAG = '#AI'`, `stampProvenance()` (accrete-only), `disclosureGate()`. Re-exported client-side by `src/lib/garvis/mediaProvenance.ts`. | **REUSE** unchanged |
| `src/lib/garvis/mediaProvenance.verify.ts` | The executable spec — including *"an existing AI label can NEVER be replaced (no laundering AI → not-AI)"*. | **REUSE** |
| `app_0123_growth_engine.sql` | `ai_provenance` on `social_posts` + `cluster_files`, backfill, and the SQL trigger `ai_provenance is accrete-only: an AI-media stamp can never be changed or removed`. | **REUSE** |
| `src/lib/garvis/imagegen.ts:48` | Already refuses exactly the right thing: *"A listing card must show the real home — upload the actual photo. AI images are for lifestyle & brand pieces, never a specific property."* | **REUSE** — and generalise to every property-factual piece |
| `public.cluster_files` + the `project-assets` bucket | One public bucket; files at `<owner_id>/studio/<clusterId>/<name>`; `getPublicUrl()`, no signed URLs, no expiry. | **EXTEND** |

Three real defects found here, all of which touch Phase 1:

1. **Media bytes behind an approved URL are mutable.** `generate-video` and `render-video` upload
   with `upsert: true` to a deterministic path, so a re-render silently replaces the bytes behind a
   URL that is already in `social_posts.media_urls`. Binding an approval to immutable *text* is not
   enough if the image can change underneath it. **The version row must therefore record a digest
   (or an immutable, content-addressed path) for every attached media item**, and the publisher must
   refuse when the bytes no longer match what was approved.
2. **No media versioning exists at all.** `cluster_files` has no version/revision column, and
   `artifact_versions` snapshots only a knowledge artifact's title/detail — not a URL.
3. **Rendered videos never get a provenance row.** `render-video/index.ts:121` inserts
   `kind: 'video'` into `cluster_files`, whose constraint is
   `check (kind in ('image', 'doc', 'csv', 'other'))` (`app_0026_cluster_studio.sql:62`), and the
   insert's error is not checked — so the row is silently dropped and the disclosure gate can only
   see provenance if the *post row* carries it. A one-line additive migration fixes the constraint;
   it is worth doing in Phase 1 because Gina's video is the plan's main content format.

The plan's stricter real-estate rule — generated imagery must never add amenities, change views, or
invent a neighborhood scene presented as real — is *already half-written* in `imagegen.ts`. Phase 1
lifts it from one call site into a verify-suite-enforced rule covering every property-factual piece.

### 2.7 Provider connections

`supabase/functions/_shared/connections.ts` — **REUSE**. `provider_connections` holds
`access_token`, `refresh_token`, `expires_at`, `scope`, `account_label`, `metadata` (which carries
`profile_key` for Ayrshare); tokens are service-role only and never reach the browser.
`probeProvider()` already validates an Ayrshare key against `https://app.ayrshare.com/api/user` and
returns a human label (`"N accounts linked"`).

**Gap:** the probe is only run when someone opens the connections UI. Nothing checks connection
health *before* a scheduled run, and `social-publish`'s failure text for a missing connection is
good ("No social account connected — connect a provider (Ayrshare) in Settings first.") but a
*revoked* key surfaces only as a provider error after the attempt. Phase 1 adds a pre-flight probe
in the drain — cheap, and it turns a silent overnight failure into a morning Queue item.

### 2.8 Contacts, leads, CRM — audit before building anything

**There is already a canonical inbound-inquiry chain, and Phase 1 must not create a second one.**

| Table | Defined in | Role |
|---|---|---|
| `public.contacts` | `app_0023_outreach.sql` | The person record: `full_name`, `email`, `email_status`, `confidence`, `source_url`, `is_primary`, `business_profile_id`. |
| `public.leads` | `app_0036_site_events.sql` | The inbound inquiry: `world_id`, `channel_id`, `contact_id`, `name`, `email`, `phone`, `message`, `source` (`website \| postcard-qr \| social \| …`), `status in ('new','contacted','qualified','closed','spam')`. |
| `public.site_channels` / `public.site_events` | `app_0036_site_events.sql` | Write-only ingest token per world's site; raw events (`visit \| lead \| click \| qr`) with `?src=` attribution. |
| `le_events`, `le_leads`, `le_customers`, `le_sources` | `app_0129`–`app_0135` | The **permit/licence lead engine** — outbound B2B prospecting. A different namespace and a different business. |
| `prospects`, `outreach_campaigns`, `client_engagements`, `customers` | `app_0032`, `app_0023`, `app_0090` | Agency-side prospecting and client book. |

The comment in `app_0036` states the consent rule that must be preserved verbatim: a lead
"consented to be answered, so the edge fn links (or creates) a contact — **NEVER modifying an
existing contact's `email_status`** (suppression is sacred)." The implementation
(`supabase/functions/_shared/leadIntake.ts`) honours it: select-first, insert-only, no UPDATE path.

Four second-pass corrections that change what Phase 1 must do:

1. **A phone-only inquiry cannot be recorded today.** `leads.email` is `not null` and
   `captureLead()` refuses anything failing its `EMAIL_RE`. For a realtor — where the highest-intent
   inquiry is a phone call — that is a hole, not a detail. Phase 1 needs
   `alter column email drop not null` plus a `check (email is not null or phone is not null)`.
   (Loosening a `not null` on this table has precedent: `app_0138` did exactly that for `world_id`.)
2. **`leads` has grown since `app_0036`:** `first_touch_at` (`app_0044`), `preview_site_id`
   (`app_0138`), and `world_id` is **no longer** `not null`. The only inserts anywhere are in
   `_shared/leadIntake.ts`, called from `site-events` and `claim-submit`.
3. **`contacts` is not the only person store.** `public.mail_recipients` (`app_0063_farm.sql`) is a
   parallel address-first store with its own suppression table `public.do_not_mail`. Direct mail in
   Phase 2 will meet it; Phase 1 should not quietly create a third.
4. **Contact dedupe is convention, not constraint.** `uq_contacts_owner_email` is on raw
   `(owner_id, email)` with no `lower()`; every caller lowercases by hand. And the lead engine is
   *not* a separate namespace after all — `le_customers.contact_id` foreign-keys `public.contacts`
   and `lead-ingest` writes `contacts` directly. It shares the person, campaign and invoice spines;
   only its event/lead/outcome tables are its own.

**Recommendation: no new CRM, no new contact table.** An Abbey Springs inquiry lands in
`public.leads` with its `contact_id`, exactly as a website lead does today. Phase 1 adds
*attribution columns* to `leads`, nothing more (§4.3). Whether Gina's brokerage CRM becomes the
master record is a business decision the plan already flags; until it is made, this system holds
marketing-originated inquiries and does not pretend to be her book of business.

### 2.9 Facts, sources and the honesty spine

**No table pairs a claim with a source URL *and* a review date.** That is the precise gap — the
looser statement "there is no facts table" would be wrong, and the near-misses matter:

- **`public.garvis_knowledge` (`app_0005`) is closer than anything else**: its own header says
  "Every row is a SOURCED ASSERTION (claim + source + confidence)", with `body` (the assertion),
  `source` (**free text, not a URL**), `confidence`, and `approved_at` — a human approval gate
  already. What it lacks is a source URL, a re-review date, and community scoping.
- The `needsReview` flag pattern is already implemented twice (`factChannel.ts`: "No sources came
  back — the claims are UNVERIFIED"), and surfaced in the Fact Channel Studio UI. That is the
  cheapest honest primitive to reuse for an unsourced community fact.

The other near-misses:

- `src/lib/garvis/factChannel.ts` — `FactSource { claim, url, note }` and `needsReview`, but these
  live *inside a script JSON blob*, persisted as part of `channel_episodes.script`. They cannot be
  queried, re-reviewed, or expired.
- `public.documents` (`app_0021_brain_vector.sql`) — uploads/URLs with `source_url`, `summary`,
  `extracted_text`, embeddings. Good for *ingesting* an association document; not a fact record.
- `public.knowledge_artifacts` / `public.artifact_versions` — versioned content with a `source` text
  field. The right *versioning* precedent, the wrong shape for facts.

The honesty spine that **does** exist and must be extended rather than duplicated:

- `checkDraft()` — refuses what a platform would reject, warns where it would truncate.
- `disclosureGate()` — fail-closed AI labelling, re-derived server-side.
- `src/lib/garvis/automationCards.verify.ts` — bans persona language and hours-saved claims in CI.
  It lints a hand-written static array, so it is the *weaker* form of the pattern.
- **`src/lib/preview/bespokeSite.ts` → `bespokeHonest(html, profile): HonestyResult` is the stronger
  precedent, and the one Phase 1 should copy**: a deterministic runtime gate over *generated* output
  that rejects invented credentials, invented licence numbers, invented tenure, invented star
  ratings and invented warranties, with a verify suite asserting each refusal. Its comment states
  the disposition exactly: "it fails toward safety … a lie never reaches a real business." A fact
  gate over generated real-estate copy is the same function with a different grounding set.
- `invokeFailure` — named, actionable failure messages instead of raw plumbing errors.

And the counter-example the plan flagged, confirmed at the exact line:

```
src/lib/garvis/campaignCore.ts:306:      body: `Another happy seller${b.area ? ` in ${b.area}` : ''}. ${highlight}`,
```

One correction to how this is usually described: it is **not a fallback default**. It is the
unconditional body for *every* `just_sold` campaign — only `highlight` degrades to an `EDIT(…)`
hole. Two more in the same file: `'The right marketing brought the right buyer.'` (:309) and
`'Move-in ready.'` (:330).

`campaignCore.ts` is otherwise scrupulous — its header states "Every number (price, beds, baths) is
a STRING the operator typed — never computed, never invented". And `socialStudio.ts` deserves a
correction too: it does **not** contain invented testimonials. Every testimonial slot is an explicit
hole (`"[EDIT: a real testimonial]"`) and the card itself says *"Only ever use real reviews."* What
it shares with `campaignCore` is the unverifiable *sentiment framing around* the holes
(`"Another happy [EDIT: seller/buyer]!"`, `"Nothing means more than a happy client."`).

So the fix is narrow and worth stating precisely: remove the unverifiable sentiment, keep the holes.
Nobody wrote a lie here; they wrote a sentence that assumes a feeling nobody checked.

### 2.10 Campaigns

| Artifact | What it is | Verdict |
|---|---|---|
| `src/lib/garvis/campaignCore.ts` (+ `.verify.ts`) | Pure: one listing → postcard + social captions + email. `CAMPAIGN_TYPES` = `just_listed \| just_sold \| open_house \| find_sellers`. Deterministic, offline, no AI. | **EXTEND** (remove fabricated defaults; feed from verified facts) |
| `public.marketing_campaigns` / `public.marketing_assets` (`app_0010_garvis_marketing.sql`) | Live, read by `src/hooks/useMarketing.ts` on `/garvis/marketing`. `subject` literally documents "mom's real-estate business". **But:** `marketing_assets.status` (`draft/approved/scheduled/published`) is a *second* approval lifecycle that does not go through `approvals`. | **EXTEND** — with the explicit rule that the approval of record is the `approvals` row, never `marketing_assets.status` |
| `src/lib/garvis/workweb.ts` → `MOM_REAL_ESTATE_TEMPLATE`, `workwebRun.ts` → `instantiateWeb('mom-real-estate')` | Deterministic seeding of the whole "Mom's Real Estate Marketing" venture (campaigns, mail, social, video, pages, contacts), zero AI. Surfaced by `QuickStartRealEstate.tsx`. | **REUSE** as the world seed |
| `FarmPanel.tsx`, `MailerDesigner.tsx`, `Postcard.tsx`, `MarketDataPanel.tsx` | Farm/mailer/market surfaces. | **DEFER** to Phase 2 (mail is a funded, physical step; it should not gate the software milestone) |
| `supabase/migrations/app_0066_mls.sql` → `public.mls_listings` | **An MLS rail already exists**: a RESO Web API feed with credentials sealed in `provider_connections`, market stats *computed* from real rows, "No feed configured = honest empty state, never sample data." | **REUSE** if a feed is ever configured — and **do not build another** |

Two structural facts about campaigns:

- **`campaignCore.ts` is pure and unpersisted.** Its only consumers are UI components; nothing
  writes its output to a table. A composed campaign piece has **no database home** between
  composition and `social_posts.body` — which is precisely the mutable window the version table
  closes.
- **There are three parallel "campaign" namespaces already**: `marketing_campaigns` /
  `marketing_assets` (`app_0010`), `outreach_campaigns` (`app_0023`, per-contact cold email), and
  `growth_channels` / `channel_episodes` (`app_0123`) plus `content_weeks` (`app_0088`). Phase 1
  must pick one and say so rather than quietly adding a fourth — hence extending
  `marketing_campaigns` (§3.3), which is the one the existing `/garvis/marketing` page already
  reads.

### 2.11 Money, spend and outcomes

| Artifact | What it is | Verdict |
|---|---|---|
| `public.spend_guard` + `spend_guard_state()` (`app_0127`) | Per-owner daily/monthly **USD caps on AI spend**, enforced inside `checkCredits`, sourced from `usage_events.cost_usd`. | **REUSE** (it guards model spend, not marketing spend) |
| `ad_spends`, `ad_metrics`, `ads-sync`, `ads-watch` | Paid-ads spend and metrics. | **DEFER** (Phase 1 runs no paid campaign) |
| `invoices`, `stripe-webhook`, `create-checkout`, `app_0047_money_loop.sql` | Agency billing — money *in*, from clients. | **AVOID** for this workspace |
| Marketing expenses (postage, print, production) | — | **NEW** (and deliberately Phase 1b, §5.3) |
| Business outcomes (appointment, listing signed, closed) | `public.timelines` (`app_0067`) has `kind in ('listing','purchase')` — a transaction timeline, not an attributed outcome. `public.appointments` (`app_0109`) is real and fully wired, but stores `customer_name/email/phone` with **no `contact_id` and no `lead_id`**, so a booked meeting never joins the CRM | **NEW** (and `appointments` wants a `lead_id`) |
| `app_0086_invoice_provenance.sql` | **The precedent for outcome attribution already exists on the money side**: `invoices.source`, `invoices.lead_id → leads`, `invoices.campaign_id → outreach_campaigns`. "REVENUE KNOWS WHERE IT CAME FROM." | **REUSE the pattern** |

Note what this implies: the house has already solved "which campaign earned this" — for invoices.
Phase 1's `re_outcomes` is the same idea one step earlier in the funnel, and should look like
`app_0086`, not like something new. **With one caveat: `invoices.lead_id` has zero call sites.** The
column was added for exactly this purpose and never wired. That is a warning, not a discouragement —
a provenance column nobody writes is decoration, so Phase 1's outcome writes must be part of the
operator's actual flow, not an optional field.

Three more dead-column findings in the same area, all of which argue for keeping Phase 1b small and
real: `ad_spends.period_start` / `period_end` have **zero writers and zero readers**;
`mail_batches.cost_usd` is accepted by `logMailBatch` and passed by **none** of its three callers;
and the weekly scorecard's "Ad spend" line reads `ad_metrics` only, so the operator's own manually
logged spend never appears in the review the product asks them to do.

And one live bug worth fixing whenever results are next touched: `src/lib/garvis/resultsRun.ts:39`
caps its leads query at `.limit(50)` and then uses `leads.length` as the world's total lead count —
past 50 leads every headline count and every cost-per-lead figure is understated. Meanwhile `leads` itself carries no `campaign_id`, no post
reference and no UTM columns (`grep utm` over the migrations returns nothing), and only two tables
in the entire schema reference `social_posts` at all (`social_post_metrics.post_id`,
`channel_episodes.post_id`) — so **the last two legs of the Phase 1 chain have no schema today.**

### 2.12 Existing UI surfaces and where a focused workspace fits

Routes (from `src/App.tsx`): `/garvis/home/:businessId?/:areaSlug?` (ProfileHome — the waking
moment), `/garvis/queue` (the Queue), `/garvis/marketing`, `/garvis/webs` and
`/garvis/webs/:worldId` (WorkWebs / WorkWeb — the per-venture studios), `/garvis/leads`,
`/garvis/contacts`, `/garvis/channels`, `/garvis/money`, plus ~40 more.

Two naming traps that will mislead anyone reading this map:

- **`src/pages/Leads.tsx` is not about Gina's leads.** It is the agency's own B2B prospect board
  (scraped businesses to sell websites to), and `navConfig.ts` even labels it *Prospects*. A
  realtor's actual inquiries — `public.leads` — have **no page at all** today.
- **`/garvis/marketing` is registered in `App.tsx` and listed in `navConfig.ts` nowhere.** It is a
  live route with no way to reach it, carrying a whole second campaign model
  (`marketing_campaigns` + `marketing_assets`). Extending that table (§3.3) is still right — it is
  the only campaign table with the right semantics — but nobody should assume the page behind it is
  in use.

A **world** (`public.knowledge_worlds`, `app_0013`) is the tenant/brand scope: campaigns, posts,
documents, leads, site channels and execution runs all carry `world_id`, and `app_0114_world_spine`
stamps it onto `execution_runs` automatically from the approval. **Gina's marketing is one world.**
That is the scoping answer — not a new app, not a new tenant model.

CLAUDE.md's simplicity-doctrine reference implementations (Home, Queue, Prospects, the growth world
page, Fact Channel Studio) are the layout precedent: work first, chrome collapsed; one orange
primary action; something useful on screen before the operator types anything.

### 2.13 The adjacent rails — email, booking, print, automation

The plan's operation is not only social, and a reviewer looking at the publishing rail will miss
these. All four are real, not stubs:

| Rail | State | Verdict |
|---|---|---|
| **Email** — `supabase/functions/send-email/index.ts` | The most production-ready path in the repo: approval + payload-hash tamper check, atomic double-send claim, kill switch, CAN-SPAM physical address enforced, sender-domain verification, fail-closed suppression, and a **timezone-anchored daily cap with warmup** (`const tz = settings.timezone \|\| 'America/Chicago'`). | **REUSE untouched** — and copy its timezone anchoring for scheduling (§3.2) |
| **Booking** — `booking` edge function, `app_0109_booking.sql`, `BookingSetup.tsx` | Fully real end to end: public booking, a DB-level `gist` anti-double-book constraint, confirmations, and a reminder drain in `standing-worker`. | **REUSE** — with two fixes: `appointments` has no `lead_id`, and `BookingSetup.tsx` hardcodes DST-era offsets (`Central (UTC−5)`), so slots shown to a customer are an hour wrong for half the year |
| **Print / mail** — `FarmPanel.tsx` `MergeRun` | The *real* per-recipient print run is here, not in `MailerDesigner.tsx`: true `9.25in × 6.25in` pages, USPS address block, fail-closed `partitionMailable` suppression, logged as a `mail_batches` row pinned to a territory. | **DEFER to Phase 2**, but know where it is |
| **Automation** — `app_0076_automation_triggers.sql` | The runner exists and fires on the heartbeat (the migration's own header understates it). But it keys to `customers` inside `customer_lists` — **a third people-model, disjoint from both `contacts` and `mail_recipients`.** | **AVOID** for Phase 1 |

Two findings here that bear directly on a brokerage:

- **The compliance line is rendered only on the postcard back.** `brand_kits.compliance_line`
  reaches printed mail (`FarmPanel.tsx:396`, `Postcard.tsx:176`) and is passed to the chat prompts
  as *context* (`clusterChat.ts:144`) — but it is never rendered into a social caption or an email
  body, and nothing blocks a send when it is missing — unlike CAN-SPAM's physical address, which `send-email` does enforce. For licensed
  real estate that is the wrong way round. Phase 1 adds the brokerage line to the publish gate.
- **Per-drop attribution was designed and never built.** `mail_batches.batch_token` exists in
  `app_0063_farm.sql:79` with a comment explaining exactly what it enables — and has **zero**
  references anywhere in the repo. Every postcard QR therefore carries the generic `?src=postcard`.

### 2.14 An assistant-independent action layer

`src/lib/garvis/actionCatalog.ts` already defines `ACTION_SPECS` — id, title, category, `risk`,
description, typed `params`, and what each action `produces` — split deliberately from
`actionRegistry.ts` (the executors) so the specs stay pure. Its rule is the right one:

> "if a human can click it, the brain can propose it — and nothing else."

That is the seam an MCP server plugs into later. Phase 1 does **not** build the MCP server; it
builds every new operation *as a named action with typed params* so that exposing it over MCP or
HTTP later is an adapter, not a rewrite (§4.6).

### 2.15 Database conventions and CI

- Migrations: `supabase/migrations/app_01XX_*.sql`, additive and idempotent
  (`create table if not exists`, `add column if not exists`, `drop policy if exists` then
  `create policy`, `do $$ … exception when duplicate_object then null; end $$` for enums).
  RLS on every table; owner policies read `owner_id = auth.uid()`; service-role-written tables get
  owner-**read** policies only and say so in a comment. **Next free number: `app_0139`.**
  Regenerate `supabase/_apply_garvis_all.sql` with `node scripts/generate-apply-all.mjs`.
- A new approval kind needs `alter type public.approval_kind add value if not exists '…'`
  (the `app_0112` lesson: the enum value was forgotten once) **and** a `KIND_META` entry.
  *Phase 1 adds no new kind.*
- Verify suites: pure `X.ts` + `X.verify.ts` with the house `check(name, condition)` idiom;
  `.github/workflows/ci.yml` auto-discovers **every** `verify:*` script in `package.json` and fails
  on any. Adding a script entry is all it takes to be gated.
- e2e: `e2e/*.authed-mock.spec.ts` — hermetic, a fake session, all Supabase routes mocked, no
  external requests. `e2e/growth-studio.authed-mock.spec.ts` is the model to copy.
- Shadow-DB tier (`.github/workflows/shadow-db.yml`) applies every migration to real Postgres.

---

## 3. Phase 1 — the proposal

### 3.1 The one thing Phase 1 proves

> One real Abbey Springs campaign travels from **approved community facts with sources** → a
> **campaign** → an **immutable content version** → a **human approval bound to that version** →
> a **scheduled job** in America/Chicago → an **actual publication** on a real account → a stored
> **final platform URL and status** → **metrics** → an **inquiry** attributed back to the post that
> caused it → a recorded **outcome**.

Until that chain holds end to end, on one campaign, with one community, nothing else gets built.

### 3.2 The six design decisions

1. **The approval binds to an immutable version, and the publisher reads only that version.**
   `social_posts` becomes a header (identity, live status, provider results). The content of record
   moves to `post_versions`, whose RLS grants **SELECT + INSERT only** — deliberately *not* the
   `for all` policy `artifact_versions` uses, which is why that table is history rather than a
   ledger. Editing an approved post creates v2 and *invalidates the approval*. This is the plan's
   requirement ("changing its text, destination, media or timing should require the appropriate
   renewed approval") expressed as a schema constraint rather than a convention.

   **Copy the house's own implementation.** The content-week rail already does this with
   `pieces_hash` (`standing-worker/index.ts:721-733`): the payload carries a hash of the content and
   the executor re-hashes before acting, cancelling with a named `mind_events` note on mismatch.
   Phase 1 is that pattern applied to `publish_post`, with a version row behind it.
2. **No new approval kind.** `publish_post` stays. The payload gains `version_id` + `content_hash`;
   the existing `payload_hash` machinery then protects the whole thing for free. **But
   `content_hash` is required on this rail, not grandfathered** — `payloadMatches()` returns `true`
   for a null hash, so an optional binding is no binding. A `publish_post` approval scoped to this
   workspace with no `content_hash` must be refused, and one minted with
   `requested_by='garvis-auto'` must be refused outright (§2.2). Existing posts elsewhere in the app
   keep today's behaviour untouched.
3. **A fact without a source and a review date cannot appear in published copy.** Enforced in a pure
   core, in CI, *and* server-side at publish time — the same three-layer shape the disclosure gate
   already uses. A missing fact renders a visible hole and blocks queueing; it never becomes a
   confident sentence.
4. **America/Chicago is stored, not inferred.** A version records both the instant (`scheduled_for
   timestamptz`) and the operator's intent (`scheduled_local text` + `schedule_tz text`). DST is a
   test case, not a hope. The precedent to copy is `send-email`, which already anchors its daily cap
   to `outreach_settings.timezone` — and the anti-precedent is `BookingSetup.tsx`, which hardcodes
   `Central (UTC−5)` and is therefore wrong for half the year (§2.13).
5. **The brokerage line publishes with the post, or the post does not publish.**
   `brand_kits.compliance_line` currently reaches only the printed postcard back (§2.13). For a
   licensed agent the caption and the email body are exactly where it is required. This is one more
   server-side refusal in the same place the disclosure gate already lives, and it costs almost
   nothing.
6. **Every new operation is a named action with typed params.** The UI calls the action; later an
   MCP/HTTP adapter calls the same action. The action layer can draft, schedule, read and report —
   **it can never approve.** Approval stays a human act in the Queue.

### 3.3 Data model — three migrations

**`app_0139_re_facts.sql` — communities, facts, sources**

```sql
public.re_communities
  id, owner_id, world_id, slug, name,
  kind text check (kind in ('community','association','lake','town','development')),
  boundary_note text,            -- the exact boundary in words; no inferred geometry
  notes text, created_at, updated_at
  unique (owner_id, world_id, slug)

public.re_facts
  id, owner_id, world_id, community_id,
  claim text not null,           -- "Abbey Springs association dues are billed quarterly"
  value_text text,               -- the specific value, as typed/verified. never computed
  status text check (status in ('draft','verified','stale','retired')) default 'draft',
  reviewed_at timestamptz, review_due_at timestamptz,
  reviewed_by text,              -- who verified it (a person, named)
  created_at, updated_at

public.re_fact_sources
  id, owner_id, fact_id,
  url text, title text,
  source_kind text check (source_kind in ('official','association','document','person','observation')),
  quote text,                    -- the fragment that supports the claim
  captured_at timestamptz, note text
```

Rule encoded in `reFactsCore.ts` and re-checked server-side: **citable** = `status='verified'` AND
at least one source row AND (`review_due_at` is null OR in the future). Anything else is a hole.

**`app_0140_post_versions.sql` — the immutable content version**

```sql
public.post_versions
  id, owner_id, post_id references social_posts(id) on delete cascade,
  version int not null,
  body text not null,
  platforms text[] not null,
  media_urls text[] not null,
  media_digests jsonb not null default '{}',  -- url -> sha256 of the bytes at approval time (§2.6)
  ai_provenance jsonb,
  scheduled_for timestamptz,          -- the instant
  scheduled_local text,               -- 'YYYY-MM-DDTHH:mm' as the operator typed it
  schedule_tz text not null default 'America/Chicago',
  fact_ids uuid[] not null default '{}',   -- every fact this copy relies on
  content_hash text not null,         -- sha256 over the canonical version (payloadHash.ts)
  created_at
  unique (post_id, version)

-- RLS: SELECT + INSERT for the owner. No UPDATE policy, no DELETE policy. A version is a fact.

alter table public.social_posts
  add column if not exists current_version_id uuid references public.post_versions(id),
  add column if not exists campaign_id uuid references public.marketing_campaigns(id),
  add column if not exists post_urls jsonb,        -- { instagram: 'https://…', facebook: '…' }
  add column if not exists claimed_at timestamptz,        -- timeout reconciliation
  add column if not exists idempotency_key text;          -- sent to the provider; the reconcile key
-- status check extended additively with 'in_flight' (today's constraint has no sending state at all,
-- which is why a timed-out row is indistinguishable from a fresh one)
alter table public.social_post_metrics add column if not exists post_url text;
```

**`app_0141_re_campaigns_outcomes.sql` — campaign scope and outcome attribution**

```sql
alter table public.marketing_campaigns
  add column if not exists world_id uuid references public.knowledge_worlds(id) on delete set null,
  add column if not exists community_id uuid references public.re_communities(id) on delete set null,
  add column if not exists offer text,             -- the one thing this campaign asks for
  add column if not exists owner_name text,        -- the named human who answers it
  add column if not exists starts_on date, add column if not exists ends_on date;

-- A realtor's highest-intent inquiry is a phone call, and leads.email is currently not null (§2.8).
alter table public.leads alter column email drop not null;
alter table public.leads add constraint leads_email_or_phone
  check (email is not null or phone is not null) not valid;  -- not valid: existing rows all have email

alter table public.leads
  add column if not exists campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  add column if not exists post_id uuid references public.social_posts(id) on delete set null,
  add column if not exists community_id uuid references public.re_communities(id) on delete set null,
  add column if not exists first_source text, add column if not exists last_source text,
  add column if not exists stated_influence text;  -- what the prospect said, verbatim

-- A booked meeting must be able to become an outcome (app_0109 appointments has no CRM link today).
alter table public.appointments
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists contact_id uuid references public.contacts(id) on delete set null;

public.re_outcomes
  id, owner_id, world_id, lead_id, campaign_id, appointment_id,
  kind text check (kind in ('qualified_conversation','appointment_set','appointment_held',
                            'listing_signed','closed','lost')),
  occurred_on date not null, note text, value_usd numeric,
  attribution text check (attribution in ('stated','inferred','unknown')) default 'unknown',
  created_at
```

`attribution='unknown'` is a first-class value. The plan is explicit that attribution must be
allowed to stay unknown, and a system that forces a guess will be lied to.

This table is deliberately shaped like `app_0086_invoice_provenance.sql` ("REVENUE KNOWS WHERE IT
CAME FROM"), which already links an invoice to its lead and campaign. `re_outcomes` is the same idea
one step earlier in the funnel — not a new concept.

**Why not extend `garvis_knowledge` instead of adding `re_facts`?** It is genuinely close (claim +
source + confidence + `approved_at`, §2.9), and the question deserved asking. Three things decide
against it: its `source` is free text rather than a URL row, it has no re-review date, and it has no
community scope — so the additive changes would be a new sources table, a new date column and a new
FK, i.e. the new tables anyway, bolted onto a table full of unrelated rows. The honest move is a
small purpose-built pair that borrows `garvis_knowledge`'s approval discipline.

### 3.4 Code — pure cores, verify suites, run layers

New (house pattern: pure `X.ts` + `X.verify.ts` + impure `XRun.ts`):

| File | Purpose | Verify script |
|---|---|---|
| `supabase/functions/_shared/postVersionCore.ts` | `canonicalVersion()`, `versionHash()` (on `stableStringify`/`hashPayload`), `versionsDiffer()` → the named re-approval reason | `verify:postversion` |
| `supabase/functions/_shared/reScheduleCore.ts` | `localToInstant(local, tz)`, `instantToLocal(iso, tz)`, `describeSchedule()` — DST-correct via `Intl`, the `icsCore.ts` precedent | `verify:reschedule` |
| `supabase/functions/_shared/reFactsCore.ts` | `isCitable(fact, sources, now)`, `renderWithFacts(template, facts)` → text + `holes[]`, `blockingReason()` — shaped after `bespokeHonest()` (§2.9): a deterministic gate over *generated* output that fails toward safety | `verify:refacts` |
| `src/lib/garvis/re/reAttribution.ts` | inquiry → (campaign, post, community) resolution from `?src=` tags and stated influence; never invents a link | `verify:reattribution` |
| `src/lib/garvis/re/reActions.ts` | `RE_ACTION_SPECS` — the named-action seam (§3.6) | `verify:reactions` |
| `src/lib/garvis/re/reRun.ts` | impure: draft → version → approval → schedule → cancel → read status | — |
| `supabase/functions/_shared/publishGate.ts` | the brokerage-compliance refusal, beside the disclosure gate | `verify:publishgate` |

Changed:

| File | Change |
|---|---|
| `src/lib/garvis/socialRun.ts` | `queueSocialPost()` writes a `post_versions` row and enqueues `payload: { post_row_id, version_id, content_hash }`. `cancelSocialPost()` gains the provider-side cancel path. |
| `supabase/functions/social-publish/index.ts` | Load the **version** by `payload.version_id`; recompute `content_hash` and refuse on mismatch; publish from the version, not the row; capture per-platform URLs into `social_posts.post_urls` (field name confirmed against a real provider response first, never assumed); on a thrown/timed-out fetch set `status='in_flight'` + `claimed_at` instead of escaping to the outer catch; fact-freshness gate and `media_digests` re-check before sending. *Version-less payloads keep the current behaviour.* |
| `supabase/functions/standing-worker/index.ts` | Pre-flight `probeProvider` before a drain run; reconcile `in_flight` posts older than N minutes against provider history before any retry; never auto-retry an unconfirmed send. |
| `supabase/functions/social-sync/index.ts` | Persist `post_url` when the provider returns one. |
| `src/lib/garvis/campaignCore.ts` | Delete `"Another happy seller"` (line 306) and every other unverifiable claim default; replace with a `[VERIFY: …]` hole. Extend `campaignCore.verify.ts` to **assert the absence** of claim-words — the `automationCards.verify.ts` pattern. |
| `src/lib/garvis/socialStudio.ts` | Same treatment for the invented-testimonial defaults. |

### 3.5 The Gina-facing surface

The house already has the right mechanism, and it is better than a bespoke page: a **work web** is a
world seeded from a `WebTemplate` whose areas carry a `Charter { archetype, flavor }`, and a
`flavor` listed in `WorkWeb.tsx`'s `STUDIO_FIRST` array makes the world **open directly on that
flavor's studio**. `src/lib/garvis/workweb.ts` states the rule in its own header: adding a domain is
"adding a template and (maybe) a flavor's tool row — never a new subsystem".

Two facts about the existing `MOM_REAL_ESTATE_TEMPLATE` (`workweb.ts:200-228`) decide the design:

1. It seeds **structure only** — 20 charter nodes (brand, market, seller/buyer campaigns, direct
   mail and its six children, newsletter, social, video, landing pages, lists, CRM, automation,
   results, opportunities) plus starter playbook artifacts. No facts, no sources, no campaign rows.
   It is a *map of options*, which is exactly the "so many places to go" complaint.
2. None of its flavors is in `STUDIO_FIRST`, and because it has `launch`/`audience` areas,
   `hasCampaign` is true — so the world opens on `MarketingCanvas` with the whole area tree hidden
   behind an **Advanced** disclosure (`WorkWeb.tsx:501-516`). It never opens on a studio.

**So: do not fork the mom template.** Add one new flavor, one studio, one template:

- **`Flavor = 'listing_campaign'`** in `workweb.ts`, added to `STUDIO_FIRST` in `WorkWeb.tsx:142`
  and to `STUDIO_BY_FLAVOR`, with its `toolsFor` row.
- **`src/components/garvis/re/CampaignStudio.tsx`** — copying `FactChannelStudio.tsx:294-448`
  literally: title row → community chips + a closed **"Community setup ▾"** disclosure → a live
  pulse line → **one orange primary button** → filter chips → the list of work.
- **A small `WebTemplate`** (5 areas, not 20): *Communities & facts* · *Campaign studio*
  (`listing_campaign`, first) · *Destinations* · *Inquiries* · *Results*.

What the operator sees on open, before typing anything: what is waiting on her, what is scheduled
next in plain America/Chicago words, what went out last with its live platform link and real
numbers (or an honest "not on this plan"), and one orange button — *Draft this week's Abbey Springs
post* — which opens the composer with that community's verified facts already loaded and holes
visible where facts are missing.

Approvals still happen in the Queue (`/garvis/queue`). The studio links to it and does not clone it:
one room for decisions, always.

No new top-level route, no second navigation, nothing removed from the existing app.

### 3.6 The action seam (MCP later, not now)

`RE_ACTION_SPECS` mirrors `actionCatalog.ts`'s shape — `id`, `title`, `risk`, `params`, `produces`:

| Action | Produces | Risk |
|---|---|---|
| `re.today` | what needs attention, what is scheduled, what is working | read |
| `re.community_brief` | a community's verified facts with sources and review dates | read |
| `re.draft_post` | a draft + the list of holes where facts are missing | draft |
| `re.submit_for_approval` | a `post_versions` row + a pending `publish_post` approval | queue |
| `re.cancel` | a cancelled post (provider-side cancel attempted and reported) | queue |
| `re.publication_status` | status, platform URL, provider errors | read |
| `re.results` | posts → inquiries → outcomes, with attribution honestly labelled | read |

There is deliberately **no `re.approve`**. The whole value of the spine is that a model cannot
approve its own work; exposing approval over an API would hand that away for convenience.

Phase 2 wraps these in one edge function with per-action auth, and an MCP manifest on top. Because
the specs are pure and the executors are separate, that is an adapter — ChatGPT and Claude both call
the same actions, and neither becomes the database.

---

## 4. Explicitly out of scope for Phase 1

- **No MLS engine.** One already exists (`app_0066_mls.sql` + `mls-sync`, §2.10) and is the only
  numbers source the house trusts. Phase 1 neither builds another nor depends on it: if a RESO feed
  is configured, market copy reads from `mls_listings`; if not, the honest empty state stands.
- **No client portal**, no public community pages, no lead-capture redesign. Phase 1 uses the
  existing `site_channels` → `site_events` → `leads` ingest that already works.
- **No second CRM.** `leads` + `contacts` as they stand, plus attribution columns (§3.3).
- **No paid campaigns, no postcards, no print.** Physical mail is funded, one-way and slow; it must
  not gate the software milestone. (`FarmPanel`, `MailerDesigner`, `Postcard` untouched.)
- **No provider abstraction layer.** Ayrshare stays hard-wired until a second provider is actually
  being tested against the same acceptance criteria.
- **No Symphony Bay.** Second community is the *first* thing Phase 2 does — and it is the proof
  that Phase 1 generalised.
- **No MCP server yet** (§3.6), and no new approval kind.

**Phase 1b**, immediately after: `re_expenses` (receipt-linked, CSV export), the expired-connection
pre-flight surfaced on Home, and the weekly results summary.

---

## 5. Acceptance tests

### 5.1 Pure suites (CI-gated automatically by `verify:*` discovery)

- `verify:postversion` — canonical hash is order-independent; any change to body, platforms, media,
  schedule instant **or** timezone changes the hash; `versionsDiffer()` names *which* field changed.
- `verify:reschedule` — `localToInstant('2026-03-08T02:30', 'America/Chicago')` (spring-forward gap)
  and `'2026-11-01T01:30'` (fall-back ambiguity) both resolve deterministically and are documented;
  round-trip stability; a past local time is refused with an honest reason.
- `verify:refacts` — an unsourced fact is never citable; a `review_due_at` in the past makes a
  previously-verified fact stale; a missing fact yields a visible hole, never a substituted phrase.
- `verify:campaigncore` (extended) — **asserts the absence** of `happy`, `thrilled`, `dream home`,
  `move-in ready` and similar unverifiable claims in every generated default.
- `verify:reattribution` — a lead with no `?src=` resolves to `attribution='unknown'`, never to the
  most recent campaign.
- `verify:approvalkinds` — a cheap parity suite asserting every `approval_kind` value has a
  `KIND_META` entry and vice versa. Nothing enforces this today, and it has already broken once:
  `app_0112_send_sms_enum.sql` exists because the SMS rail shipped without its enum value and
  "Every approval insert with kind='send_sms' therefore failed at the DB".

### 5.2 Hermetic e2e (`e2e/real-estate.authed-mock.spec.ts`)

The nine-step chain against mocked Supabase + mocked Ayrshare, plus the hostile cases:

| Case | Required behaviour |
|---|---|
| Edit after approval | Publishing refuses; the Queue shows a re-approval item naming the changed field |
| Cancel before send | Post `canceled`, approval retired, drain never touches it |
| Cancel after provider scheduling | Provider delete attempted (endpoint verified against live docs first); on failure the row stays `scheduled` with a named error — never a false "cancelled" |
| Two drains, one post | Exactly one publish; the second gets `409` from the atomic claim |
| Missing / revoked connection | Blocked with a named, actionable message; nothing silently retried |
| Provider timeout | `in_flight` + `claimed_at`; **no** retry until reconciliation; an unresolvable case becomes a Queue decision, not a duplicate post |
| Stale fact at send time | Blocked with the fact named and the review date shown |
| Media replaced after approval | Digest mismatch blocks the send with a named reason; a new version must be approved |
| Approval with no `content_hash` | Refused on this rail — the binding is never optional (§3.2) |
| Auto-minted approval (`requested_by='garvis-auto'`) | Refused on this rail: nothing publishes to Gina's accounts on a decision no human made |
| Timeout where the provider *did* post | Reconciler finds it by idempotency key / history, records the real status and URL — never a second post |
| Analytics plan-gated (402/403) | Counts-only, `available:false`, no invented numbers |
| Missing brokerage compliance line | Refused before the provider call, with the setting named |
| Past schedule beyond grace | Refused with the honest reason, never posted a day late |

### 5.3 The live run (the only test that proves anything)

Against Gina's real, authorized accounts, with real approved Abbey Springs facts: one post through
the whole chain; the platform URL stored and clickable; metrics synced (or honestly reported as
plan-gated); one inquiry — real or a genuine test submission through the live form — landing in
`leads` with its campaign and post attribution; one outcome recorded. Plus, in the same session, a
deliberate cancel and a deliberate failure so the failure paths are seen working, not assumed.

**Gates before any push** (CLAUDE.md): `npx tsc --noEmit` · the affected `verify:*` suites ·
`npm run build` · the e2e spec if UI changed.

---

## 6. Open questions — these need answers from the operator, not guesses

1. **Ayrshare plan.** Analytics is plan-gated. On the free/Premium tier the metrics step of the
   acceptance test degrades honestly but does not *pass*. Which plan, and which accounts are linked?
2. **Which accounts are in scope for the first live post** — and has the brokerage approved posting
   through a third-party publisher at all?
3. **Where does the inquiry form live** — `ginanocek.com` (audit first, per the plan) or a page this
   system deploys? That decides whether `site_channels` is used as-is.
4. **Who answers an inquiry, and within what hours?** `leads` has no owner column today because the
   system has never had to route to a named human. If the answer is "Gina, one business hour", that
   is a column and a Queue item, not a philosophy.
5. **Gina's current CRM.** Until it is inventoried, this system holds marketing-originated inquiries
   only and claims nothing more.
6. **The first ten Abbey Springs facts.** Phase 1 cannot be demonstrated without real, sourced,
   reviewed facts. This is Gina's work and it is the actual bottleneck — not the code.
7. **The brokerage's required disclosure line**, verbatim, and where it must appear. §2.13 shows it
   currently reaches printed mail only; Phase 1 puts it on every published caption, and it has to be
   the line the brokerage actually requires, not an approximation.

---

---

## 7. What this preserves

Nothing in Phase 1 removes a capability. The general app builder, the ventures, the lead engine, the
studios and every existing route stay exactly as they are. The approval spine is extended, not
replaced; the publish path keeps its two callers, its atomic claim and its disclosure gate; the
metrics reader keeps its honest degradation. The additions are: one studio flavor, one small
template, three migrations, five pure cores, and the removal of a handful of sentences that claimed
things nobody verified.

---

## 8. Implementation status

Built and gated (`tsc` · 179 verify suites · build · `deno check` on every edge function · the full
e2e suite · the shadow DB on real Postgres):

| Phase 1 item | State | Where |
|---|---|---|
| Migrations `app_0139`–`app_0141` | **Built.** Applied to real Postgres with 17 shadow-DB checks proving the version is immutable, the constraints reject, and post → inquiry → outcome joins | `supabase/migrations/` |
| The approval binds the content | **Built.** `post_versions` + `{post_row_id, version_id, content_hash}`; the publisher loads the version, not the row | `postVersionCore.ts`, `social-publish` |
| Media bound by bytes | **Built.** Both ends hash the bytes; unverifiable is recorded as unverifiable, never as unchanged | `postVersionCore.bytesDigest` |
| Auto-minted approvals refused on this rail | **Built.** `requested_by='garvis-auto'` cannot publish a bound post | `social-publish` |
| Timeout → `in_flight` → reconciliation | **Built.** `not_posted` only on positive evidence; unknown never retries | `reconcileCore.ts`, `standing-worker` |
| Final platform URL | **Built.** Captured at publish and on sync | `socialCore.platformUrls`, `social-sync` |
| America/Chicago scheduling | **Built.** DST gap resolves forward and says so; ambiguity takes the first and says so | `reScheduleCore.ts` |
| Facts with sources and review dates | **Built.** Three-layer gate: composer, queue, publisher | `reFactsCore.ts`, `app_0139` |
| Brokerage line gates publication | **Built** | `publishGate.ts` |
| Fabricated sentiment removed | **Built**, with CI asserting its absence across every generated default | `campaignCore.verify.ts` |
| The Gina-facing surface | **Built.** A `listing_campaign` flavor, a five-area template, a studio that opens on the work | `CampaignStudio.tsx`, `workweb.ts` |
| Inquiry attribution | **Built.** A post's link carries its own tag; the capture rail resolves it or attributes to nobody | `reAttributionCore.ts`, `leadIntake.ts` |
| Phone-only inquiry | **Built.** The DB accepts it and the rail records it (no instant email touch — a call is answered by a call) | `app_0141`, `leadIntake.ts` |

Not built, and deliberately:

- **Media attachment**, which is what unlocks Instagram (`socialCore` correctly refuses a text-only
  post there, so the studio posts to Facebook alone for now).
- **Provider-side cancel.** `cancelSocialPost` refuses honestly for a provider-scheduled post rather
  than marking something cancelled that would publish anyway. Wiring the delete needs the endpoint
  verified against a real account — this audit has never called the API.
- **`re_expenses`** (Phase 1b), the MCP adapter over `RE_ACTION_SPECS`, and everything in §4.

Three defects found while building, all fixed: the runtime `FLAVORS` array is separate from the
`Flavor` type union (a new flavor typechecks, then silently becomes `generic` at parse time — now
bridged by a compiler-enforced check in `workweb.verify.ts`); a `listing_campaign` world routed to
the marketing canvas with its studio behind *Advanced*; and `render-video` inserting a `kind` its own
CHECK constraint forbade, so no rendered video ever got a provenance row.

**Commits:** `78657bc` (audit) · `b469ae0` (verification pass) · `3c81ca9` (the binding) ·
`e075d63` (reconciler + studio) · plus the attribution loop.
