# Hands-On Review: The Real-Estate Portion, Used Like the Operator Would

*July 31, 2026. Method: ran the app locally (Vite dev server, Chromium/Playwright), clicked
through every real-estate surface reachable without a backend (the `/dev/*` preview routes mount
the real board components), and drove the pure content engines (`composeCampaign`,
`compileMailer`, `farm.ts`) directly with realistic Lake Geneva agent data, rendering the actual
`Postcard` component output. Authenticated pages (Command, WorkWeb, FarmPanel) were reviewed at
the code level — no Supabase stack was available in the review sandbox. Cross-checked against
`docs/capability-audit/03-real-estate-marketing.md`, which this review largely confirms.*

---

## 1. The headline answer

**The organizing layer is excellent and real. The content layer is honest but skeletal without
AI keys. The "map + scraper → mailing list" capability the operator wants does not exist —
by design, the app expects you to buy the list and import a CSV.**

## 2. What was verified working, hands-on

- **Farm list engine (`farm.ts`)** — best thing in the domain. In a live test it: caught a
  "201 Oak St"/"201 Oak Street" duplicate; correctly flagged the absentee owner (mailing address
  ≠ property); fail-closed suppressed a do-not-mail household and an incomplete address; exported
  a clean mail-house CSV (`full_name,address1,city,state,zip,absentee_owner`, "Current Resident"
  convention); and `farmMath` returned an honest go/no-go — *"6.9% turnover — viable (the screen
  wants ≥6%). $723/drop, $4,335/yr at 850 homes × 6 drops. Break-even: 0.5 listings/yr."*
- **One listing → whole campaign set (`campaignCore`)** — one typed listing produced a postcard
  spec, four platform-voiced social posts (IG/FB/LinkedIn/X with per-platform hashtag counts),
  and a reply-oriented email. Deterministic, no invented facts, `[EDIT]` holes where facts are
  missing. Copy quality: solid-but-generic; usable with light editing.
- **Postcard render (`Postcard.tsx` + `compileMailer`)** — real 6×9 with USPS geometry (bleed,
  safe zone, address/postage zone), QR encoding `?src=postcard` for attribution, Equal Housing
  compliance line. The no-photo "brand card" front (e.g. *"Thinking of selling in Lake Geneva?"*)
  is clean and genuinely mailable. Photo cards use the real photo full-bleed with a scrim.
- **The boards (`/dev/board`)** — postcard/social/email/branding boards with real-estate chips
  (Just Listed, Just Sold, Open House, Thinking of selling?, Free valuation, Neighborhood expert,
  Market update). Make → spread → compare → star → print works. Honest degradation notices when
  no image/AI key is set.
- **Navigation/organization** — `MOM_REAL_ESTATE_TEMPLATE` one-click instantiates the whole
  operation (brand, market intel, seller/buyer campaigns, direct mail decomposed into
  strategy→lists→creative→print-&-send→follow-up→results, newsletter, social, video, landing
  pages, CRM, automation, results, opportunities) with zero AI keys. The workshops home and
  profile-home spine are polished and coherent.
- **Fixed since the Phase-5.5 audit:** the `send_sms` approval-kind enum gap the audit called
  "latent-dead" is closed (`app_0112_send_sms_enum.sql`).

## 3. Defects found while producing content

1. **Listing headline truncation.** `compileMailer` clips front headlines at 48 chars, so the
   composer's auto-headline *"Just Listed — 123 Shore Dr, Lake Geneva, WI, $1,150,000"* printed
   as *"…WI, $1…"* — the price, the money fact, is cut. Operator can override by hand, but the
   default output of the flagship flow is broken copy on the card's most important line.
   (Composer should shorten its auto-headline — e.g. drop city/state when clipping — before
   handing it to the 48-char gate.)
2. **Trades-flavored copy on listing cards.** The `just_listed` path routes through the `proof`
   concept, whose back copy reads *"The front of this card is our real work. We make it for Lake
   Geneva homeowners."* — written for craftsmen ("no stock photos"), odd on a luxury listing
   card. Beds/baths/price also never appear on the back body.
3. **The board's "idea" input is ignored without an AI key.** Typing *"lakefront colonial, 4bed,
   sunset dock, elegant"* and pressing Make produces the same generic template card as an empty
   idea — the nuance silently goes nowhere until `board-copy` (AI) is configured. Honest footers
   explain imagery, but not that the idea text itself needs the key.

## 4. The map / scraper / area-selection ask — confirmed absent

- **No map anywhere.** Zero map libraries in `src/` (`mapbox|maplibre|leaflet|openlayers` — no
  hits; the `MapPin` in FarmPanel is a lucide icon). "Pick an area" = type a name into a text
  field. `farm_territories` are named rows.
- **No homeowner/property data acquisition.** No ATTOM/DataTree/PropertyRadar/Regrid/county
  integration; provider names appear only in help copy telling the operator where to buy a CSV.
  The one real discovery engine (`discover-run`, Google Places) hunts *businesses* for the
  web-agency side, not homeowners.
- **No mail fulfillment.** Print-it-yourself + CSV-to-print-vendor is the shipped path. No
  Lob/PostGrid, no CASS address validation, no delivery tracking. (All specced in level-10 docs,
  none built — matches audit doc 03 §1 steps 10–13.)
- Reality check for the roadmap: owner names/mailing addresses are county/licensed data and
  emails are effectively not obtainable by scraping — a compliant version of the dream feature is
  **map UI (MapLibre, free) + parcel/owner data (Regrid/ATTOM, paid) + CASS + Lob**, i.e. mostly
  buy, not build. The audit's Territory/Map Workshop spec (doc 03 §7) is the right shape.

## 5. What needs keys/services before "professional results" happen

AI copy (Anthropic key via edge functions or `VITE_AI_DIRECT` for local), social publishing
(Ayrshare), email sends (Resend + domain), MLS sync (RESO creds; manual button, no cron), video
(Shotstack), e-sign (DocuSign — **sandbox default: not legally binding until flipped**), imagery
(image key). Without them the system still organizes, drafts skeletons, imports/dedupes lists,
and renders print-ready cards — but nothing personalized, published, or sent.

## 6. Priority recommendation for this operator

1. Set the content keys (AI + Resend + Ayrshare) — turns skeletons into drafted work overnight;
   the approval spine already gates everything.
2. Fix §3.1 and §3.2 (small, pure-function changes) — they sit on the most-used card.
3. Wire `mls_listings` → `campaignCore` (the audit's named DISCONNECTED seam) so she stops
   retyping facts the DB holds; put `mls-sync` on the clock.
4. Lob + CASS behind a `send_mail` approval — the single change that turns "print at home" into
   a real mail operation with delivery status.
5. Map/territory workshop last — the CSV-import path covers farming until data + fulfillment pay
   for themselves.
