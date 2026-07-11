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
