# Working session with Gina — the runbook

*Built from the list she wrote, line by line. Every capability claim below was checked against the
code on this branch, not remembered. Where the app cannot do something, it says so in the words to
say out loud.*

Her list is nineteen lines, but it is really six jobs:

| | The job | Where it stands |
|---|---|---|
| **A** | Be present and consistent on six platforms | 1 hour of her hands. Free. **Do this first.** |
| **B** | Post to all of them, regularly | One screen: photo + six platforms in the Campaign Studio — see §2 |
| **C** | Market content for Abbey Springs and Symphony Bay | The Campaign Studio. This is the engine that feeds B |
| **D** | A monthly newsletter | Real send rail, plain text, needs contacts + email set up |
| **E** | Postcards and farming specific areas | Its own area in her workspace. Design and list work are real; mailing is not |
| **F** | Deal folder and an expense spreadsheet | The spreadsheet is done and in this repo. The deal folder needs one question answered |

---

## 0. The night before (you, not her — 25 minutes)

- [ ] **Apply the migrations.** GitHub → Actions → the Supabase deploy workflow → `mode=full`. The
      real-estate tables are `app_0139`–`app_0141`. Functions auto-deploy on merge; **migrations do
      not**. If the studio says it cannot read the workspace, this is why.
- [ ] **Ayrshare** — Settings → Connections → Ayrshare (sealed per-user, *not* an edge secret). Then
      on the Ayrshare dashboard, link **Facebook, Instagram, LinkedIn, Google Business, YouTube and
      TikTok**. Every one of those six is a supported platform in `socialCore.ts`; the only thing
      standing between her and posting to them is the linking step.
- [ ] **`APP_ORIGIN`** set to the deployed app URL, or links in posts point nowhere.
- [ ] **Health page** (`/garvis/health`) — secrets green, heartbeat stamping.
- [ ] **Open the real-estate door: `/re`.** Five tabs — **Post · Queue · Newsletter · Postcards ·
      People** — and nothing else on screen. If the workspace does not exist yet it shows one button
      to create it; if the database is unreachable it says so instead of hiding. Once this browser
      has been through `/re`, login lands there. The rest of the platform is behind "Everything
      else" — one link, never gone.
- [ ] Open the **Queue** tab once alone, so you know the approval screen before she is watching.
- [ ] Print or open `docs/handoff/Real Estate Expenses 2026.xlsx` — that is item F, already done.

---

## 1. Job A — the photo and the bio (do this first, it is the cheapest win she has)

Her line: *"Change bio and update all my photos to the now photo — same bio"* and *"All platform work
on my @properties site."*

**This is not software. It is one hour of clicking, and it is the highest-value hour on the whole
list** — it is the first thing every prospect sees, it costs nothing, and it never needs doing again.
Do it live, together, before touching anything clever.

Write the bio **once**, in a note, then paste it seven times:

- [ ] Instagram — photo, bio, link
- [ ] Facebook (page, not just profile) — photo, about, link
- [ ] LinkedIn — photo, headline, about
- [ ] Google Business Profile — photo, description  *(this one also affects whether she shows up in
      local search at all, so it is worth more than it looks)*
- [ ] TikTok — photo, bio
- [ ] YouTube — channel art, about
- [ ] Her @properties agent page — photo, bio, contact details

**Ask while you are in there:** is the Facebook **page** the one linked to Ayrshare? Posting to a
personal profile and posting to a business page are different things, and only one of them is
supposed to carry marketing.

---

## 2. Job B — posting to all six

Her list names Instagram, Facebook, Google Business, TikTok, LinkedIn, YouTube, plus "any other
platforms that make sense," and separately calls out reels and posts.

**It is one screen now.** The **Post** tab. Under the draft: **Add a photo** (straight from her
phone — it uploads and the approval binds to those exact bytes), then six chips for where it goes.
Tick the ones she wants; the choice is remembered. Queue one approval. Done.

What the chips will and will not accept, before she wastes a draft:

| Platform | Text-only post | Note |
|---|---|---|
| Facebook | ✅ | on by default |
| LinkedIn | ✅ | |
| Google Business | ✅ | caption capped at 1,500 characters — it warns before you queue |
| **Instagram** | ❌ needs a photo | the chip says *"needs a photo"* until one is attached; the button stays off |
| **TikTok** | ❌ needs a photo | same |
| **YouTube** | ❌ needs a photo | same |

The `Social Posts` area still exists for a post that is not about a community (a closing, a client
thank-you, a market-wide note) — same composer, same six platforms, now with a **Choose a photo**
button beside the URL field.

**Reels and video.** The storyboard → mp4 renderer is real but hands-on, and video posting needs a
**paid** Ayrshare tier (the free tier is images only — the composer flags a video URL rather than
letting it fail at the provider). Reels are possible; they are not yet a one-click thing.

**"Get more likes."** No software makes likes. What the app can actually do about it: post
consistently without her having to remember, put the same message everywhere at once, and — only on
a paid analytics tier — tell her honestly which posts did anything. On the free tier the posts go
out fine and the numbers come back as *"not on this plan"* rather than as invented figures. Say that
plainly rather than letting her assume a dashboard is coming.

---

## 3. Job C — Abbey Springs and Symphony Bay

Her line: *"Market — Abbey Springs–Symphony Bay."* This is the **Campaign Studio**, and it is the
part of the system that was built most carefully.

The rail: **a verified fact with a source → a draft → her approval → a scheduled post → a published
post with a real link → an inquiry attributed back to it → an outcome.**

1. Open the studio and say nothing for ten seconds. The pulse line already answers what is waiting on
   her, what goes out next (Central time, in words), and what went out last.
2. **Community setup ▾** → add `Abbey Springs`. Then add `Symphony Bay`. Both, tomorrow — she asked
   for both, and the second one is what proves the first was not a one-off.
3. Add three facts per community — *not ten*. Five fields each: what the fact is about ("Association
   dues") · what she verified ("billed quarterly") · a source link **or** the line she read · who
   checked it.
4. Press the one orange button: **Draft Abbey Springs post**. Kinds: *Owner brief* · *One question,
   answered* · *Thinking of selling* (which deliberately makes no claim about their home, because she
   has not seen it).
5. **Read the holes out loud.** A missing or expired fact shows as `[VERIFY: …]` under *"Verify these
   before this can publish."* It does not fill the hole with a pleasant sentence. Show her that on
   purpose — it is the reason to trust the thing.
6. Fill the two required fields: who signs it, and the **brokerage line**. Publication is refused
   server-side without the brokerage line, on every post.
7. Schedule it, queue it, and open the **Queue** tab **together so she clicks approve** — the badge
   on the tab shows how many decisions are waiting. That click
   is the moment worth the whole meeting: the approval binds to the exact text, media, destinations
   and time she saw, and editing any of it afterward makes publishing refuse and name the field that
   changed.

**Both jobs, one screen:** the fact-checked draft, the photo and the six platforms are all on this
page. There is no second surface to copy into.

---

## 4. Job D — the monthly newsletter

She wrote "newsletter" three times. It matters to her more than anything else on the list except the
photo.

- **Writing and sending it:** the **Newsletter** tab — one room. Compose once, see the honest
  reachable count with exclusions named, queue one approval. Pick a segment, see the **honest
  reachable count** with exclusions named, queue one approval; the clock then drains it under a daily
  cap, re-checking suppression for every recipient at send time. `{{name}}` and `{{first_name}}`
  merge; anything else refuses at compose rather than sending broken.
- **What it needs first:** contacts in the system (see Job F), and the email tier set up — a Resend
  key, a **verified sending domain**, a real from-address, and a physical mailing address, which
  CAN-SPAM requires and the send function refuses without.
- **What it is not:** there is no branded HTML template and no drip sequences. It is a clean plain
  letter. If she wants the @properties-branded look, that is a real piece of work to scope, not a
  setting.

---

## 5. Job E — postcards and farming specific areas

**Where:** the **Postcards** tab — the neighborhood-farm panel and the postcard designer share the
room, because the list decides *who* and the card decides *what*.

Her own sixteen-step chain, marked against what the code does. Green = the app does it. Amber = she
does it, the app keeps it honest. Red = money or a vendor, not code.

| # | Her step | Status | Tomorrow's truth |
|---|---|---|---|
| 1 | Pick the territory on a map | 🔴 | **No map exists.** "Territory" is a name she types. A real one is a map library plus parcel data — buy, not build |
| 2 | Get the owner list | 🟡 | **She buys the CSV** (title company, county, a data provider). Imports only ever ADD |
| 3 | Permission / source check | 🟡 | Do-not-mail suppression is fail-closed and permanent. Licensing is her paperwork |
| 4 | Enrichment | 🟡 | Absentee is computed only if her file has mailing-address columns; otherwise **unknown**, never zero |
| 5 | De-duplicate | 🟢 | Catches "201 Oak St" against "201 Oak Street," within a file and across imports |
| 6 | Segment | 🟢 | Turnover screen with a real go/no-go — ≥8% strong, ≥6% viable, ≥5% thin, else don't farm — plus cost per drop and break-even in listings |
| 7 | Campaign ideas | 🟢 | Research-grounded, with a verifier pass |
| 8 | Design the postcard | 🟢 | Real 6×9, USPS geometry, a QR that attributes the response, Equal Housing line |
| 9 | Personalize per household | 🟡 | Address block only |
| 10 | Address validation | 🔴 | No CASS. Every drop risks postage on unvalidated addresses |
| 11 | Approve the drop | 🟡 | **Her printing it is the approval today.** No spend ceiling on mail |
| 12 | Hand off to the printer | 🔴 | **The app never mails.** Print-ready PDF + mail-house CSV. Closing this is the highest-leverage thing left in her operation |
| 13 | Delivery status | 🔴 | Nothing receives mail events |
| 14 | Attribution | 🟡 | QR and link scans work. Phone calls do not — no per-campaign tracking numbers |
| 15 | Follow-up | 🟡 | Scan → lead → first touch works and is gated. Calls are manual |
| 16 | Learn from the drop | 🟡 | The batch is logged; response rate across drops is not modelled |

**The sentence to say:** *"Buy the list, and this hands the print shop a deduped, suppressed,
USPS-correct PDF and CSV, then records honestly what you sent. It does not put anything in a
mailbox."*

---

## 6. Job F — the back office

**The expense spreadsheet is done.** `docs/handoff/Real Estate Expenses 2026.xlsx`. Five tabs: *Start
here* · *Setup* · *Expenses* · *Mileage* · *Monthly summary*. She types in two places; the summary
fills itself. Twenty-one categories shaped for an agent, a mileage log, and a monthly grid.

One deliberate blank: **the IRS mileage rate is empty.** It changes every year, and a guessed rate is
a wrong number on a tax form. There is a yellow cell, a note, and a pointer to irs.gov. Until it is
filled the mileage deduction reads `$0.00` rather than something invented.

*(The app itself has no expense feature — `re_expenses` is specced and not built. A spreadsheet she
owns is the right answer for now, and it is a better answer than waiting.)*

**"Inputting my deal folder stuff" is the one line on her list I cannot map without asking her.** It
has two plausible readings and they lead to completely different work:

1. **Past clients and closed deals → contacts.** This is the operationally urgent one, because the
   newsletter in Job D has no audience until it happens. **Where:** the **People** tab → *Import a
   CSV*. It finds the email column on its own and tolerates a header row; the name it keeps is
   the first non-email column, so a "first, last, email, phone" export lands as first names only and
   drops the phone. Good enough for the first newsletter; a fuller import is on the list below.
2. **Transaction paperwork → documents.** Templates from a sample document, merge with visible
   `[YOU FILL]` holes, e-signature with every envelope approved by a human. Note: **e-sign is on the
   sandbox default, where signatures are not legally binding** — going live needs a review first.

Ask her which, in one sentence, before building anything. My guess is (1), and (1) is also the one
that unblocks the newsletter she asked for three times.

---

## 7. Say these out loud before she asks

- **Nothing sends without her.** Not a draft, not a schedule, not a "smart" automation. An approval
  the software minted for itself is explicitly refused on her accounts.
- **Instagram, TikTok and YouTube need a photo or video.** The composer refuses a text-only post
  rather than letting the platform reject it.
- **Numbers may be plan-gated.** Engagement counts need a paid tier. Until then: no numbers, never
  invented ones.
- **A post already scheduled at the provider cannot be cancelled from here yet.** It refuses honestly
  rather than claiming it cancelled something that will still publish.
- **Stale facts block sends.** A fact past its review date stops the post and names itself. That will
  feel like friction in month three. It is the feature.
- **The app does not mail anything, and there is no map.**

---

## 8. The whole plan — what is done, what she needs to buy, what is left

### Done on this branch

- **A real-estate door: `/re`.** Five tabs over her workspace, none of the platform's forty routes
  on screen. Login remembers it. An unreachable database says so; a missing workspace is one button.
- The workspace carries her list: **Social Posts**, **Newsletter**, **Postcards & Farming** areas
  beside the Campaign Studio. Still opens on the studio. Eight areas, not twenty.
- **One screen for a post:** photo upload + six platform chips in the Campaign Studio, with the
  media-required refusal named under the draft instead of discovered at the Queue.
- **Choose a photo** in the general composer, beside the URL field.
- The expense spreadsheet.
- A verify suite that fails CI if any of those areas quietly disappears from the template.

### Accounts and keys — the only "plugins" this needs (none are code)

| | What | Why | Cost |
|---|---|---|---|
| 1 | **Supabase deploy, `mode=full`** | applies `app_0139`–`app_0141`; nothing real-estate works without it | — |
| 2 | **Ayrshare** with all six accounts linked | every post on her list | free tier: 1 profile, 50 image posts/mo, **no video, no numbers**. Paid tier when reels or analytics start |
| 3 | **`APP_ORIGIN`**, `WORKER_SECRET`, `CRON_SECRET`, heartbeat armed | scheduled posts and newsletter batches drain on the clock; without the heartbeat, "scheduled" waits forever | — |
| 4 | **Resend** + SPF/DKIM on her sending domain + a physical address in outreach settings | the newsletter. The send function refuses without the address (CAN-SPAM) | Resend free tier is fine to start |
| 5 | Anthropic key | **not needed** for the Campaign Studio — its drafts are deterministic from her facts. Only for AI copy on the boards | optional |

**Not needed now, and say so:** a mail vendor (Lob), a map / parcel-data provider, a video renderer
(Shotstack), texting (Twilio), DocuSign go-live. Each is real work with a real bill, and none of them
is on the critical path to her first month of posting and one newsletter.

### Left to build, in the order it is worth to her

1. **The rhythm.** A standing order — "an Abbey Springs owner brief every Tuesday, drafted from the
   facts on file, one approval" — so posting stops depending on her remembering. The content-week
   producer exists for other worlds; wiring it to `listing_campaign` is the next real feature.
2. **Its own address.** The same repo can build a second entry that mounts only `/re` and deploy it
   to its own domain, so it feels like its own product. A config change, not a codebase.
3. **A fuller contact import** — full name from two columns, keep the phone, tolerate a CRM export's
   extra columns. Her sphere is the newsletter's audience; this is what makes it clean.
4. **A branded newsletter template.** She wrote "newsletter" three times; plain text will not hold.
5. **Reels** — once the paid Ayrshare tier is on: the storyboard rail plus a video file in the same
   photo field.
6. **Receipt-linked expenses in the app**, so the spreadsheet retires into the same ledger as
   results.
7. **A mail vendor behind an approval with a hard cost ceiling** — closes farming steps 11–13 and
   turns the postcard chain from a tool into a business. Last, because it is the one with a bill.

---

*Claims trace to: `src/lib/garvis/workweb.ts` (the workspace areas) ·
`supabase/functions/_shared/socialCore.ts` (the platform and media rules) ·
`src/components/garvis/SocialPublisher.tsx` · `src/components/garvis/re/CampaignStudio.tsx` ·
`src/components/garvis/BatchSendCard.tsx` (the newsletter send) · `src/lib/garvis/re/reRun.ts` (the photo upload) ·
`docs/real-estate-marketing-implementation.md` §§2, 5, 6, 8 ·
`docs/capability-audit/03-real-estate-marketing.md` §1 (her sixteen-step chain) ·
`docs/reviews/2026-07-31-real-estate-hands-on-review.md` §§2–4 · `docs/go-live-checklist.md`.*
