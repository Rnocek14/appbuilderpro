# Working session with Gina — the runbook

*A single page for the table. Everything here was checked against the code on
`claude/awesome-cray-9yr6ks`, not remembered. Where the app cannot do something, it says so in the
same plain words you should use out loud.*

The rail that exists today is one line, and only one:

> **a verified fact with a source → a draft → your approval → a scheduled post → a published post
> with a real link → an inquiry attributed back to that post → an outcome.**

Everything else in this document is either setup for that line, or an honest "not yet."

---

## 0. The night before (you, not her — 20 minutes)

If any of this is skipped, tomorrow stalls on plumbing instead of on her work.

- [ ] **Apply the migrations.** GitHub → Actions → the Supabase deploy workflow → run with
      `mode=full`. The real-estate tables are `app_0139`–`app_0141`; functions auto-deploy on merge
      but **migrations do not**. If the studio says it cannot read the workspace, this is why.
- [ ] **Ayrshare key** — Settings → Connections → Ayrshare (it is *not* an edge secret; it is sealed
      per-user). Link **her Facebook page** on the Ayrshare dashboard.
- [ ] **`APP_ORIGIN`** set to the deployed app URL.
- [ ] **Health page** (`/garvis/health`) — secrets green, heartbeat stamping.
- [ ] **Create the workspace**: Home → the real-estate card → it creates *Real Estate Marketing*
      (`real-estate-campaign`) and lands directly on the **Campaign Studio**. Five areas, not twenty —
      Campaign Studio · Communities & Facts · Destinations · Inquiries · Results.
- [ ] Open `/garvis/queue` once so you know what the approval screen looks like before she is watching.

---

## 1. What she brings (send her this list tonight)

These are not nice-to-haves. Six of the seven block a real post.

| # | What to bring | Why it blocks |
|---|---|---|
| 1 | **The brokerage's compliance line, verbatim** | Publication is refused without it — server-side, every post. Not an approximation of it. |
| 2 | **Ten Abbey Springs facts, each with where she read it** | The draft is assembled from verified facts. No facts = an empty template with holes. **This is the actual bottleneck — not the software.** |
| 3 | **Has @properties approved posting through a third-party publisher?** | If not, stop before the live post. |
| 4 | **Which accounts** the first live post goes to | Facebook page today (see §4). |
| 5 | **Where the inquiry form lives** — `ginanocek.com` or a page this system deploys | Decides whether attribution works at all. |
| 6 | **Who answers an inquiry, within what hours** | "Gina, one business hour" is a Queue item and a column. Any other answer is a different build. |
| 7 | **What CRM she actually uses today** | Until that is known, this system holds marketing-originated inquiries only and claims nothing more. |

Her Ayrshare plan matters for one thing only: **numbers**. Analytics is plan-gated — on the free
tier the post publishes fine and the engagement counts honestly report "not on this plan" rather
than inventing figures.

---

## 2. The hour with her — do it in this order

Work the screen, not the slides. Every step below is a real control that exists.

**1. Open the Campaign Studio and say nothing for ten seconds.**
The top line — the *pulse* — already answers three questions before she touches anything: what is
waiting on her decision, what goes out next (in Central time, in words), what went out last and what
it did. That is the whole point of the page. Let her read it.

**2. Add the community.** Chip strip → **Community setup ▾** → type `Abbey Springs` → Add.

**3. Add three facts — she types, you drive.** Same disclosure. Each fact takes five fields:

- *What the fact is about* — "Association dues"
- *What you verified* — "billed quarterly"
- *Source link* **or** *the line she read in the document*
- *Who checked it*

Do three, not ten. Three is enough to draft. Ten is homework.

**4. Press the one orange button: “Draft Abbey Springs post.”**
Pick the kind next to it:

| Kind | Use it for |
|---|---|
| **Owner brief** | People who already own there — what changed, one thing worth knowing |
| **One question, answered** | A single ownership question, answered from a verified source |
| **Thinking of selling** | An invitation to talk — makes **no claim about their home**, because she has not seen it |

**5. Read the holes out loud.** If a fact is missing or past its review date, the draft shows
`[VERIFY: …]` and a box headed *“Verify these before this can publish.”* It does not fill the hole
with a pleasant sentence. Show her that on purpose — it is the reason to trust the thing.

**6. Fill the two required fields.** *Who signs it* and the *brokerage line*. Optionally a link —
if the link is in the post body, it carries that post's own tracking tag, which is what makes an
inquiry name the post that caused it.

**7. Schedule it.** Central time, typed as local time. The system resolves DST edges deterministically
and tells you when it had to.

**8. Queue it.** Then walk to `/garvis/queue` **together** and let *her* approve it. This is the
moment worth the whole meeting: nothing on her accounts happens without that click, and the approval
is bound to the exact text, images, destinations and time she saw. Edit anything afterward and
publishing refuses and asks for re-approval, naming the field that changed.

**9. Show Results.** The published post's real platform link, and either live numbers or an honest
"not on this plan."

If time remains: do one deliberate **cancel** and one deliberate **failure**, so she has seen the
failure paths work rather than been told they do.

---

## 3. Her mailing / farming list — mapped, step by step

This is her own sixteen-step sequence. Green = the app does it. Yellow = she does it, the app keeps
it honest. Red = money or a vendor, not code.

| # | Her step | Tomorrow's truth |
|---|---|---|
| 1 | Pick the territory on a map | 🔴 **No map exists.** "Territory" is a name she types. A real one is MapLibre + parcel data — buy, not build. |
| 2 | Get the owner list | 🟡 **She buys the CSV** (title company, county, ATTOM/DataTree). The app imports it. Imports only ever ADD. |
| 3 | Permission / source check | 🟡 Do-not-mail suppression is fail-closed and permanent. Source licensing is her paperwork. |
| 4 | Enrichment (absentee / equity / tenure) | 🟡 Absentee is computed *only* if her file has mailing-address columns; otherwise it reports **unknown**, never zero. Equity/tenure needs a paid source. |
| 5 | De-duplicate | 🟢 Real. Catches "201 Oak St" vs "201 Oak Street" across files. |
| 6 | Segment | 🟢 Turnover screen with a go/no-go: ≥8% strong, ≥6% viable, ≥5% thin, else don't farm — plus cost per drop and break-even in listings. |
| 7 | Campaign ideas | 🟢 Real. |
| 8 | Design the postcard | 🟢 Real 6×9 with USPS geometry, QR that attributes the response, Equal Housing line. |
| 9 | Personalize per household | 🟡 Address block only. Per-household copy is not built. |
| 10 | Address validation (CASS) | 🔴 Not built. Every drop currently risks postage on unvalidated addresses. |
| 11 | Approve the drop | 🟡 **Her printing it IS the approval today.** No spend ceiling on mail yet. |
| 12 | Hand off to the printer | 🔴 **The app never mails.** It produces a print-ready PDF + a clean mail-house CSV. Closing this (Lob/PostGrid) is the single highest-leverage thing left in her whole operation. |
| 13 | Delivery status | 🔴 Nothing receives mail events. |
| 14 | Attribution | 🟢 for QR / link scans. 🔴 for phone calls — no per-campaign tracking numbers. |
| 15 | Follow-up | 🟡 Scan → lead → first touch works. Calls are manual. |
| 16 | Learn from the drop | 🟡 The batch is logged; response-rate learning across drops is not modelled. |

**The one sentence to say about mail:** *"Buy the list, and this will hand the print shop a deduped,
suppressed, USPS-correct PDF and CSV and record honestly what you sent. It does not put anything in
a mailbox."*

---

## 4. Say these out loud before she asks

- **Facebook only, for now.** A text-only post to Instagram is refused by the platform rules the
  code enforces, and attaching photos is the next piece of work — not built. Instagram is one
  feature away, and it is the feature that unlocks it.
- **Nothing sends without her.** Not a draft, not a schedule, not a "smart" automation. An
  approval the software minted for itself is explicitly refused on her accounts.
- **Numbers may be plan-gated.** Counts arrive on a paid Ayrshare tier. Until then: no numbers,
  never invented ones.
- **A scheduled post already at the provider cannot be cancelled from here yet.** It refuses
  honestly rather than telling her it cancelled something that will still publish.
- **No second CRM.** This holds marketing-originated inquiries and claims nothing more.
- **Stale facts block sends.** A fact past its review date stops the post and names itself. That
  will feel like friction in month three. It is the feature.

---

## 5. What to do next, in order of what it is worth

1. **Media attachment** → unlocks Instagram. Highest ratio of value to work left on the social rail.
2. **The second community** (Symphony Bay). One community proves the rail; the second proves it
   generalises, and it is cheap.
3. **`re_expenses`** — receipt-linked spend, CSV export, so the postcard money is in the same ledger
   as the results.
4. **Lob** behind a `send_mail` approval with a hard cost ceiling → closes steps 11–13 and turns the
   mail chain from a tool into a business.
5. **MLS rows into the composer.** The feed already syncs; she still retypes price/beds/baths the
   database already holds.

---

*Source of truth for the claims above: `docs/real-estate-marketing-implementation.md` §§2, 5, 6, 8
(what is built and what deliberately is not), `docs/capability-audit/03-real-estate-marketing.md` §1
(her sixteen-step chain), `docs/reviews/2026-07-31-real-estate-hands-on-review.md` §§2–4 (what was
verified by hand), `docs/go-live-checklist.md` (setup tiers),
`src/components/garvis/re/CampaignStudio.tsx` (every control named above).*
