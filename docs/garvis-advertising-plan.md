# Garvis Advertising — every channel, what exists today, and the connection roadmap

*The operating rule for all paid acquisition, inherited from the honesty spine: Garvis produces
launch-ready campaigns and MEASURES results through its own instrumentation (?src / UTM → site
events → leads → logged spend → measured cost-per-lead). Platform-reported metrics flatter
themselves; the form on YOUR site is the truth. Nothing runs without the operator pressing the
button on the platform — until real API connections exist, and those are gated by platform
approvals only the owner can obtain (detailed below).*

## What ships TODAY (built this sprint)

1. **The `ads` studio flavor** — genesis can now design ad areas into any world; every ads studio
   is born with the paid-ads playbook (structure, testing ladder, budget math template, tracking
   discipline) and the channel map (which platform does which job).
2. **`gen-ads` producer** — one press writes **launch-ready assets at real platform limits**:
   - **Meta**: 3 primary-text variants (≤125 chars), 4 headlines (≤40), 2 descriptions (≤30),
     creative direction pointing at the world's real vault photos.
   - **Google RSA**: 10-12 standalone headlines (≤30), 4 descriptions (≤90), 8-12 buyer-intent
     keywords with match types, negative keywords.
   - Limits are ENFORCED by the parser (word-boundary trims), grounded in the world's DNA, voice,
     photos, and its own research findings; final URLs carry `?src=meta-ads` / `?src=google-ads`.
   - **Compliance rides in the artifact** for regulated verticals: Housing Special Ad Category
     (real estate), restricted financial products + SEC Marketing Rule (finance), personal-
     attributes policy (health). Deterministic playbook floor when AI is unavailable.
3. **Attribution end-to-end** — generated sites read `?src` or `utm_source` (persisted per
   session), so ad clicks land as attributed visits and ad-driven form submissions land as
   attributed leads in the world's ledger.
4. **Spend logging (`ad_spends`)** — real dollars in, so **cost-per-lead = logged spend ÷ measured
   leads**, two real numbers. Logged from the Results panel.
5. **Adaptive Operation** — the verified `adapt()` engine reads the per-channel table and says
   what the numbers say: shift recommendations with both channels' counts attached, CPL
   comparisons only between measured channels, "too early to judge (only N)" below the sample
   floor, "running blind — instrument first" for dark channels. Confidence tiers are honest:
   `act` (≥3 real responses), `watch`, `too-early`. A measured `act` recommendation becomes the
   world's standing recommendation, labeled "From your numbers".

## The channel catalog (what each is FOR — encoded in the ads channel map)

| Channel | Job | Garvis today | Best-fit verticals |
|---|---|---|---|
| Google Search | catch existing demand (highest intent) | full RSA assets + keywords + negatives + tracking | services, local, anything searched |
| Meta (FB/IG) | create demand, visual reach | full ad set assets + creative direction from vault | creative, food, retail, local |
| Google LSA / Maps | pay-per-lead local trust | playbook guidance (LSA has no asset authoring — it's a profile) | home services, health |
| YouTube / TikTok | attention at scale (video) | video studio scripts feed it; ad authoring later | education, creative, ecommerce |
| Nextdoor / Yelp | neighborhood trust | playbook guidance | home services, food, retail |
| LinkedIn | B2B titles | playbook guidance | services, tech |
| Email (owned) | nurture + convert | fully built (approval-gated sends, replies measured) | all |
| Direct mail | tangible local reach | fully built (print-ready card, QR attribution, mail log) | real estate, home services, local |

Rule enforced in the playbook: **master ONE paid channel to a measured CPL before adding the next.**

## The connections roadmap (API integrations — honest about the gates)

Real "connect your ad account" buttons require platform-issued credentials that only the account
owner can obtain. None of this is Garvis-side code first — it's registrations:

1. **Meta Marketing API** — requires: a Meta Business app, App Review for `ads_management`/
   `ads_read`, a System User token on the ad account. Typical approval: days-weeks. Unlocks:
   campaign creation from the generated assets, spend/result sync (replacing manual logging),
   budget changes as APPROVAL-GATED actions through the existing spine.
2. **Google Ads API** — requires: a developer token (basic access review), OAuth client, linked
   manager (MCC) account. Typical approval: days-weeks. Unlocks: same trio (create, sync, adjust)
   behind the same approvals.
3. **Sequencing when the user wants them**: register both in parallel → store tokens as server
   secrets (never in the browser, same rule as all keys) → build a `connections` table +
   per-connection sync worker → spend/results sync replaces manual logs → THEN adaptive
   recommendations can propose "shift $X from Meta to Google" as an approval card that executes.
4. **Interim (now)**: produce → paste → track via src/UTM → log spend → adapt. The loop is
   complete today; the APIs only remove the paste-and-log steps.

*Everything above obeys the standing invariants: no invented numbers (platform estimates are
never shown as results), every outward action approval-gated, suppression sacred, and a channel
without instrumentation is labeled blind — never assumed to work.*
