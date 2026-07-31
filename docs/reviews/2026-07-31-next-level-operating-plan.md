# Next-Level Operating Plan: Running Mom's Real Estate Marketing Seamlessly

*Companion to `2026-07-31-real-estate-hands-on-review.md`. Goal, in the operator's words: easy,
creative, automated, simple — one person juggling social, direct mail, paperwork, and leads for
one agent (Lake Geneva, @properties) without it feeling like juggling. This plan is ordered by
payoff, not by feature list. Ballpark running cost once everything below is on: ~$100–200/mo.*

---

## A. Turn the engine on (one afternoon, one time)

The app is built "honest-by-degradation": every feature works at skeleton level with no keys and
lights up when its secret is set. The Health page's Master Switch panel shows live which of these
are set. In payoff order:

| # | Secret | What it unlocks for her, concretely |
|---|--------|--------------------------------------|
| 1 | `ANTHROPIC_API_KEY` (+ `AI_PROVIDER`/`AI_MODEL`) | The single biggest jump. Board "Make" starts *using the idea you type*; the 3-stage campaign generator, board-copy quality judge (≥8 gate), reply drafting, and per-piece variety all come alive. Without it, everything is template stubs. |
| 2 | `RESEND_API_KEY` + sender domain + `RESEND_WEBHOOK_SECRET` | Real email sends with open/click/bounce tracking, the monthly market letter, and the **speed-to-lead instant first touch** (the one pre-authorized zero-touch send — a QR-scan lead gets a reply in seconds, not hours). |
| 3 | `WORKER_SECRET` + `CRON_SECRET` + arm the heartbeat (Health page) | Nothing scheduled runs until this is armed: follow-up crons, content weeks, social metric sync, invoice chasing. This is the "automated" switch. |
| 4 | `AYRSHARE_API_KEY` | Real posting to Instagram/Facebook/LinkedIn/X (9 networks) from the approval queue, plus engagement metrics synced every 6h. |
| 5 | Image key (`generate-image` provider) | Imagery on brand/prospecting cards and logo concepts. Listing cards still always use the real photo — that gate is deliberate (misrepresentation). |
| 6 | MLS RESO credentials (`mls-sync`) | Market stats computed from real synced listings — the substance behind "market update" posts and the newsletter. Currently a manual sync button (see D1). |
| 7 | Twilio (documented A2P ceremony in `twilio-setup.md`) | Missed-call text-back and SMS follow-ups (the `send_sms` approval enum is fixed as of app_0112). |
| 8 | DocuSign production review | E-sign works today in sandbox; **sandbox signatures are not legally binding** — flip after DocuSign's go-live review before any real listing agreement. |

## B. The weekly rhythm (~30 focused minutes a day)

The design insight to lean on: **one approval queue is the whole cockpit.** Everything outbound —
posts, emails, mail batches, envelopes — stops at the same Queue. The rhythm:

- **Monday (20 min):** content-week producer drafts the week's social as ONE approval card.
  Approve/edit. After **3 clean weeks it earns auto_mode** (revocable anytime) — the system's
  real earned-autonomy loop. From then on Mondays are a glance, not a task.
- **Daily (10 min):** open the Queue, clear it. Leads that came in overnight already got the
  pre-authorized instant first touch; you're approving the follow-ups, not racing the clock.
- **Monthly (1 hr):** market-letter newsletter from MLS stats; check Results (every number is a
  count of real rows — sends, replies, QR scans by source).
- **Quarterly (half a day):** farm drop. Refresh the CSV (title rep pull), run farmMath's
  go/no-go, generate the card, print run, `logMailBatch` so the ledger stays honest. List
  refresh is twice a year; drops reuse it.
- **Per listing (30 min):** one composer intake → postcard + 4 platform posts + email + landing
  page + QR, approved as a slate. (D1 below removes the retyping.)

## C. Build backlog, in payoff order

For future build sessions; each item is scoped and most are specced in the repo already.

1. **MLS → composer autofill + mls-sync cron.** The DB already holds price/beds/baths the
   operator retypes into the composer; wire `mls_listings` → `campaignCore` inputs and put the
   sync on the heartbeat. Small build, daily payoff. (The audit's named DISCONNECTED seam.)
2. **Print-DPI postcard render.** Extend `render-design` (satori→PNG) with 6.25×9.25in @300dpi
   sizes so the approved card exports print-vendor-perfect instead of via the browser print
   dialog. Fully specced (level-10 #1).
3. **Lob (or PostGrid) + CASS behind a `send_mail` approval.** The one integration that turns
   direct mail from "print 850 cards at home" into "approve a drop with a hard cost ceiling;
   addresses validate fail-closed; delivery webhooks land in Results." Fully specced (level-10
   wave 5). This is the biggest single automation win in the whole domain.
4. **Portal-lead parsing.** Zillow/Realtor lead emails forwarded to the existing inbound alias,
   parsed into contacts (low-confidence parse stays plain mail — never an invented contact).
   Portal leads are most agents' #1 source; specced (level-10 #5).
5. **Open-house sign-in page.** A small variant of the existing booking/lead-capture rail + a QR
   at the door; ends paper sign-in sheets and feeds follow-up automatically.
6. **Newsletter shell + drip flows.** Branded HTML wrapper and multi-step nurture sequences on
   the existing trigger engine (window guard, consent, suppression already real).
7. **Map over her own list ("Build B").** MapLibre + free Census batch geocoding of imported
   households; draw a polygon to slice/select into the existing mailable pipeline. No data
   subscription. (Map-as-data-source stays out until multi-agent scale.)
8. **DocuSign auto-populate.** Fill envelope templates from client records instead of by hand —
   the declared-missing middle of the paperwork chain.

## D. Creative engine (the idea side)

What exists: campaign chips (Just Listed / Just Sold / Open House / Thinking of selling? / Free
valuation / Neighborhood expert / Market update), seven persuasion concepts per postcard, the
`lakefront-seller` play (research→angle→creative→sequence→landing→social→video), idea boards,
and — with the AI key — the research-grounded 3-stage campaign generator with a quality judge.

A Lake Geneva idea bank to feed it (each maps to an existing chip/board):

- **Seasonal lake series** — pier install/removal week, boat parade, ice castles, "the lake in
  November": recurring content weeks that don't depend on inventory.
- **"What $X buys on the lake"** tiered posts (uses real MLS rows once synced — never invented).
- **Just Sold stories with numbers** — days on market, over asking (real numbers from her MLS).
- **Absentee-owner drop** — the farm importer already flags them; "your lake house's value while
  you're away" is the highest-signal mailer segment she has.
- **Market myth vs. fact** monthly (market-update chip + mlsStats).
- **Annual Lake Geneva Market Report** as a QR/landing lead magnet — the email-capture engine
  (postcard QR → landing → speed-to-lead) is already wired end to end.
- **Expireds/price-cut watch** — the Opportunities area is designed to surface these; each one
  is a warm, time-boxed campaign.

## E. Why it's safe to automate this much

The guardrails are already structural, not policy: every outbound act stops at the approval
spine; earned autonomy is streak-based and revocable; listing cards refuse AI imagery; Fair
Housing/HUD rules ride the real-estate vertical overlay; do_not_mail is fail-closed and
survives re-imports; SMS is TCPA-gated; suppression never leaks into exports. The honest-holes
convention (`[EDIT: …]`) means nothing invented ever ships silently. Automating on top of these
rails is how "automated" stays compatible with "her license and reputation."
