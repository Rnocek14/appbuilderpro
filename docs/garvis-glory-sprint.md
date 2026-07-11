# The Glory Sprint — from functional to actually useful, end to end

*The question: "Do the studios actually produce? Can we make a direct mailer that looks good and
send it out? Do we get a real scan for emails we can use?" The honest answer before this sprint was
"the copy, yes; the finished product and the plumbing around it, no." This sprint closes the four
gaps between functional and useful, each shipped and verified.*

## 1. Real email discovery (not a paste box)

**Before:** a qualified prospect could only enter the audience if YOU already had their email.
**Now:** Garvis scans the prospect's OWN website for it.
- `fetch-url` mode `contact` mines the raw HTML for `mailto:` links, plain-text emails, and lightly
  obfuscated listings (`name [at] domain [dot] com`); when the landing page lists nothing it follows
  the site's own same-host contact page (one hop, same SSRF guard). Junk filtered (noreply, asset
  files, schema.org). Only what the site publishes is returned — **Garvis never guesses or constructs
  an address.**
- `scanProspectEmails` persists what it finds (`contact_emails`) and stamps `scanned_at` even on a
  miss — "we looked, nothing public" is honest state, distinct from "never looked."
- In the lead finder: a **find email** button on qualified prospects; found addresses render as chips
  that one-click prefill the → audience flow. Scan → contact in two clicks.

## 2. A direct mailer you'd actually put in a mailbox

**Before:** direct mail produced copy variants and dead-ended — no artifact you could print.
**Now:** a print-ready 6×9 postcard, built from the world's real materials.
- `mailer.ts` (pure, 15-check verify) compiles a postcard spec from the business context + brand kit
  + a **real vault photo** (never stock), following the industry concept shapes the expertise packs
  teach (full-bleed proof / before-after / local authority). USPS geometry is encoded: 6.25×9.25 with
  bleed, a 0.25in safe zone, the bottom-right address+postage zone kept clear. Missing facts render as
  visible `[EDIT]` prompts — never a fabricated phone or URL.
- `MailerDesigner` is the surface: live front + back preview at true 6:9, a vault photo picker, the
  one-offer field (the 40/40/20 rule made concrete), a **QR generated from the tracking link**, and a
  real **Print/PDF** path (`@page` bleed CSS — only the card prints, one per page). Save drops the
  design into the area as an artifact.
- The **mail log** (`app_0035`) makes mailing a tracked action: Garvis doesn't mail for you — you
  print or send to a vendor, then log what went out. A `mailed` batch drops a mind_event so the ledger
  and reflection count **mail as real outreach**, alongside email.

## 3. Ask Garvis — retrieval over everything it knows

**Before (the audit's #1 gap):** the system wrote knowledge to many tables and had no surface to ASK
it. "What's our direct-mail plan?" was answerable only by opening the exact right studio.
**Now:** an ask box that searches everything and answers with citations.
- Artifacts **embed on write** (create/revise → `embed-worker` persist, fire-and-forget, fail-soft),
  so earned work becomes searchable.
- **Hybrid retrieval** (`ask.ts` + pure `askCore.ts`, 9-check verify): semantic via the
  `match_embeddings` RPC when embeddings are configured, lexical ILIKE always — so it works with zero
  keys and gets sharper with them. Hits are merged, deduped, and ranked (a result found both ways
  wins), then synthesized into an answer **grounded only in the retrieved sources**; nothing found →
  it says so plainly and points you at what would produce the answer.
- Mounted account-wide in the **Brain** and world-scoped in every **WorkWeb**. Sources are shown with
  similarity and a link back to the area — you see its work, and see honestly when it has none.

## 4. Knowledge into builds + learning on its own

**Before:** the website builder got DNA + photos but not the world's actual findings; reflection ran
only when you clicked it.
**Now:**
- `compileWebsiteBrief` gains a **WHAT THIS BUSINESS HAS LEARNED** section; `buildFromWorld` feeds it
  the world's real research briefs and reflection lessons (earned only — seeded frameworks excluded),
  so the first generation is grounded in accumulated work, not the DNA alone.
- `maybeReflect` runs a reflection **automatically** when a world is opened and it's genuinely due
  (≥5 real events in 7 days, not reflected in the last 7) — the evidence gate still applies, so a thin
  world changes nothing, but an active one learns without being asked.

## 5. The producers — every studio tool makes finished work, not a framework

**Before:** an audit of every producer found only three (`gen-social`, `gen-video-script`,
`gen-postcard`) emit finished, copy-pasteable work — and only for the seven builtin Lake-Geneva
slugs. Everywhere else, `research` reworded a static template (it fetched *nothing*), `gen-social`
wrote a 30-day *plan describing what to post*, and `gen-angle` was ungrounded — it even shared a slug
with `research`, so both buttons produced the same doc. The producers were context-blind: they saw
the DNA tokens and nothing else — not the photos, not prior research.
**Now:** a producers layer routes by tool id and reasons over the world's real materials.
- **`research`** does actual web search (`discover-media`/Serper), then synthesizes a brief grounded
  **only** in the snippets, with a checkable **SOURCES** footer of real URLs — and a "STILL UNKNOWN"
  section when the results don't answer, never an invented statistic.
- **`gen-social`** writes 5 ready-to-paste captions in the world's voice, each **tied to a real vault
  photo** by its caption (or an explicit "shoot: …"), with a hook, a CTA, and specific hashtags.
- **`gen-video-script`** writes a shot-by-shot 30–45s script — timed shots, voiceover, on-screen text.
- **`gen-angle`** synthesizes one campaign angle **grounded in the world's own research artifacts**
  (earned only); with none yet, it's marked provisional and names the scan that would confirm it.
- Verified pure core (`producersCore.ts`, 15 checks). Fail-soft: each falls to the area's expert pack
  when AI/search is down — and that fallback is tagged as context, not activity, so it never fakes
  momentum. Free-form generation runs through the plain-completion seam, not the decision seam.

## 6. G5 — the sensory organ (instrumentation: the system finally SEES results)

**Before:** the loop's back half was blind — websites were one-way, mail untraceable, and
reflection could only reason over sends/replies. **Now the world sees what happens:**
- **`site-events` ingest** (public endpoint, `--no-verify-jwt`): generated sites report visits and
  lead-form submissions using a write-only channel token (`site_channels` — unguessable, revocable,
  maps server-side to owner+world; knowing it lets you POST events, never read). Size caps, email
  validation, one event per request.
- **The brief wires it automatically**: `buildFromWorld` provisions (or reuses) the world's channel
  and the LEAD FORM section now instructs the generated site to POST leads + a visit ping with the
  exact endpoint/token — including `?src=` attribution passthrough. Un-instrumented worlds keep the
  old store-only form; "not instrumented" is a state, never a fake zero.
- **Leads are first-class**: a submission with a real email becomes a `leads` row AND links-or-creates
  a contact (select-first — an existing contact's email_status, including unsubscribed, is NEVER
  modified). A new lead fires the top-ranked waking move — "they asked, answer while it's warm" —
  and the LeadsPanel in every audience area shows name/message/source with honest status transitions.
- **Attribution closes the mail loop**: the postcard QR now encodes `?src=postcard` (printed line
  stays clean), the site passes it through, and the ledger's new **Results by channel** table shows
  Email sent/replies · Mail pieces mailed / QR visits+leads · Website visits/leads — every number a
  count of rows, nothing modeled.
- **The learning organs feed on it**: `leads7d`/`visits7d` join MomentumSignals (a lead = surging,
  lead-first evidence; visits alone never claim surging), and reflection's results line now carries
  visits + leads — Adaptive Operation finally has cause-and-effect to stand on.

## The end-to-end path, now real

Scan a segment → **find the prospect's email on their own site** → add to audience → generate copy in
the studio (in the world's voice, grounded in its playbooks) → **design a print-ready postcard from
the real artwork** → print/PDF or log the mail batch → the send counts in the ledger → **ask Garvis
what happened** and get a cited answer → open the world and it has **already reflected** on the
results → build a website that carries **what it learned**. No step dead-ends at content.

## Deploy checklist (for these features to run live)

- `supabase db push` — migrations through `app_0035` (`app_0033` prospect→audience, `app_0034` contact
  scan, `app_0035` mail log).
- `supabase functions deploy fetch-url embed-worker cluster-chat` — email scan, artifact embedding,
  ask synthesis.
- Secrets: `SERPER_API_KEY` (lead search), `EMBEDDINGS_API_KEY` or `OPENAI_API_KEY` (semantic ask —
  lexical works without it), `ANTHROPIC_API_KEY` (synthesis).
- Hard refresh after deploy (the explorer breaker caches).

*Invariant held throughout: real materials only (never stock), real findings only (never invented),
every external action still behind approvals, every visible number still derived from a real row.*
