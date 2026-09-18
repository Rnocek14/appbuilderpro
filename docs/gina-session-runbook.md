# Working session with Gina — the runbook

*Built from the list she wrote, line by line. Every capability claim below was checked against the
code on this branch, not remembered. Where the app cannot do something, it says so in the words to
say out loud.*

Her list is nineteen lines, but it is really six jobs:

| | The job | Where it stands |
|---|---|---|
| **A** | Be present and consistent on six platforms | 1 hour of her hands. Free. **Do this first.** |
| **B** | Post to all of them, regularly | The app does this today — see §2 |
| **C** | Market content for Abbey Springs and Symphony Bay | The Campaign Studio. This is the engine that feeds B |
| **D** | A monthly newsletter | Real send rail, plain text, needs contacts + email set up |
| **E** | Postcards and farming specific areas | Design and list work are real; mailing is not |
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
- [ ] **Create the workspace.** Home → the real-estate card → *Real Estate Marketing*. It opens on
      the Campaign Studio. Seven areas: Campaign Studio · Communities & Facts · **Social Posts** ·
      **Newsletter** · Destinations · Inquiries · Results.
- [ ] Open `/garvis/queue` once alone, so you know the approval screen before she is watching.
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

**Where to do it: the `Social Posts` area of her workspace.** One caption, a media link, tick the
platforms, pick a time, queue one approval. After she approves it in the Queue, it posts or the
provider schedules it.

What the composer will and will not accept, before she wastes a draft:

| Platform | Text-only post | Note |
|---|---|---|
| Facebook | ✅ | |
| LinkedIn | ✅ | |
| Google Business | ✅ | caption is capped at 1,500 characters — the composer warns before you queue |
| **Instagram** | ❌ needs a photo or video | refused at compose, not at the provider |
| **TikTok** | ❌ needs a photo or video | |
| **YouTube** | ❌ needs a photo or video | |

The media field takes a **URL**, not a file picker. The path that works today: upload the photo into
the app's assets, copy the public link, paste it in. Clunky, honest, works. Make her do it once with
you so she has seen it.

**Reels and video.** The storyboard → mp4 renderer is real but hands-on, and video posting needs a
**paid** Ayrshare tier (the free tier is images only — the composer flags a video URL rather than
letting it fail at the provider). So: reels are possible, they are not yet a one-click thing, and
they are the honest answer to "what would move the needle most" — which leads to the next line.

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
7. Schedule it, queue it, and walk to `/garvis/queue` **together so she clicks approve**. That click
   is the moment worth the whole meeting: the approval binds to the exact text, media, destinations
   and time she saw, and editing any of it afterward makes publishing refuse and name the field that
   changed.

**One limit to state:** the Campaign Studio posts **text to Facebook only** — attaching media from
inside it is the next piece of work. For Instagram and the rest, the fact-checked caption it produces
gets copied into the `Social Posts` area with a photo. Two surfaces for now; one when media
attachment lands.

---

## 4. Job D — the monthly newsletter

She wrote "newsletter" three times. It matters to her more than anything else on the list except the
photo.

- **Writing it:** the `Newsletter` area of her workspace.
- **Sending it:** `/garvis/contacts` → the batch send card. Pick a segment, see the **honest
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
   newsletter in Job D has no audience until it happens. Contacts arrive from website leads, prospect
   scans, and CSV uploads into a world's audience area.
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

## 8. What to build next, in order of what it is worth to her list

1. **Media attachment inside the Campaign Studio** — collapses the two-surface workaround in §3 and
   unlocks Instagram from the fact-checked rail. Nothing else on this list is worth as much.
2. **An asset picker in the social composer** — kills the upload-then-paste-a-URL step.
3. **A branded newsletter template** — she asked for the newsletter three times and will not love a
   plain-text letter for long.
4. **Receipt-linked expenses in the app**, so the spreadsheet eventually retires into the same ledger
   as the results.
5. **A mail vendor behind an approval with a hard cost ceiling** — closes farming steps 11–13.

---

*Claims trace to: `src/lib/garvis/workweb.ts` (the workspace areas) ·
`supabase/functions/_shared/socialCore.ts` (the platform and media rules) ·
`src/components/garvis/SocialPublisher.tsx` · `src/components/garvis/re/CampaignStudio.tsx` ·
`src/components/garvis/BatchSendCard.tsx` (the newsletter send) ·
`docs/real-estate-marketing-implementation.md` §§2, 5, 6, 8 ·
`docs/capability-audit/03-real-estate-marketing.md` §1 (her sixteen-step chain) ·
`docs/reviews/2026-07-31-real-estate-hands-on-review.md` §§2–4 · `docs/go-live-checklist.md`.*
