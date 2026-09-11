# Revenue focus — the one path to a few thousand a month (Sept 2026)

*Written after a full code-level audit of `main` (145 commits, 116k lines, 76 edge functions,
152 migrations) and the deployed branch `claude/garvis-system-app-manager-0rcrae` (83 commits
ahead, running on the live Supabase project since Aug 18–19). Four independent passes: the
client-acquisition funnel, the content/video pillar, the runtime wiring and cost model, and the
strategy docs' own verdicts. This document replaces every other "what is the business" answer in
`docs/` for the purpose of the next 90 days.*

---

## Status — what was built the same night (Sept 11)

The touch-reduction list below is no longer a plan. On `claude/automation-revenue-strategy-is82xt`
(which also folds in the 83 deployed-branch commits):

- **The hunt spends its quota across the day.** `huntTick.ts` slices the daily budget over the
  15-minute ticks — a few searches and one demo per tick — and the work finishes after the tick
  responds. Before: ~1 demo/day regardless of quota.
- **Email before any model call.** A lead with no public address is set aside (`no_email`, phone
  intact, its own Prospects chip) at zero cost. Leads with a website are the unattended build order.
- **Zero-click sales.** The demo's HTML is stashed at build time; a payment publishes it. A paid
  care plan pins its package and books the one onboarding reminder.
- **Replies land.** Resend's `email.received` event is handled by the existing webhook; the body is
  fetched and handed to the reply path. No forwarder, no extra secret.
- **The slate.** The Queue approves the day's cold pitches in one keypress (Shift+A); flagged
  pitches are held out. The waking moment and the morning brief lead with it.
- **Follow-ups draft without an OpenAI key** (shared model seam). Default model moved to the
  current Sonnet, cheaper per token.
- **The monthly offer is the zero-touch care plan** ($299/mo default). Readiness on Win Clients
  now has a fourth gate: *Get paid + go live with no click*.
- **Not done, on purpose:** the server never self-approves a cold pitch. The class is on the trust
  dial for its streak, with no Grant button. The daily protocol is `docs/daily-run.md`.

## The verdict

**Run the local-business funnel that is already built, sell one thing, and touch it for ten
minutes a day.** Everything else in the repo is either a content tool with no coded revenue
(video channels, fact studio), a data rail with no customer (permit leads, MLS), or a product the
operator has already judged inferior to the Claude subscription (the app builder).

The system is finished enough. As of the deployed branch's own runbook (`docs/go-live-runbook.md`,
2026-08-18): schema through `app_0158`, full fleet live, heartbeat armed, 206 verify suites green.
The work stopped at the line that reads *"What remains is keys, accounts, and selling."* Nothing
has been committed since Aug 19. No document, table, seed, or commit in the repo records a single
paid customer, a reply rate, or a booked job. Three weeks of building produced a machine that has
never been switched on against a stranger.

There is no version of this where money arrives with zero human touches. The closest thing that
exists anywhere is what is built here: the machine finds the prospect, builds the demo, writes the
pitch, sends after a keypress, chases, and takes payment through a Stripe link. The human presses
`a` on a phone for a few minutes a day and takes one short call per new client.

---

## What is actually here (code, not docs)

| Surface | Code state | Coded revenue path | Unattended? | Verdict |
|---|---|---|---|---|
| Client hunt → demo site → cold pitch → Stripe link | Real end to end (`standing-worker`, `send-email`, `client-checkout`, `stripe-webhook`) | Yes: $1,500 one-time / $500 mo payment links | Everything except the pitch approval | **The path** |
| Follow-ups, invoice chase, reactivation, reply drafts | Real; earned autonomy after 5 clean approvals (`autonomy_grants`, cap 5/day) | Part of the monthly tier | Yes, once granted | Keep |
| Missed-call text-back, booking + reminders, instant first touch | Real, fail-closed, "runs on its own" rung | Sold inside the monthly tier ($200–500/mo hints) | Yes | Keep — the zero-touch fulfilment |
| Direct mail (Lob) — deployed branch only | Real send/verify/webhook rails | Real-estate farming at $1–1.5k/mo | Approval-gated per drop | Phase 2 channel, not the product |
| Fact-channel video | Drafts unattended; production is browser-only; posts need approval; `monetization_mode` is dead data | None | No | Stop |
| FableForge app builder + Pro billing | Real Stripe checkout; $19 plan is underwater at full credit use; landing page sells a different product | Yes, but no buyer | n/a | Stop |
| Permit lead engine | Real scrapers; **zero email addresses on every portal** | None reachable | n/a | Stop |
| Opportunity hunt, portfolio triage, merch board | Operator memos / concept cards | None | n/a | Stop |

Sources: the audits behind this table cite `supabase/functions/standing-worker/index.ts:1781-2577`
(hunt, build, pitch), `_shared/autonomyGate.ts`, `src/lib/garvis/automation/registry.ts`,
`FactChannelStudio.tsx:152-291`, `docs/lead-engine-productization.md` ("Email addresses —
blocking — zero"), and `docs/capability-audit/16-vertical-slice-status.md` ("the proof at ten live
clients has not been run").

---

## Why nothing has made money yet

1. **The machine has never met a stranger.** Every strategy doc ends at a pilot that never
   started. The reality-check series, the gap matrix, and the vertical-slice status all say the
   same sentence in different words: arm it on one real client.
2. **Cold pitches are un-automatable by design.** `classifyApproval` refuses
   `payload.kind === 'cold_site_pitch'` (`src/lib/garvis/autonomy.ts:24-27`), so the money step
   always waits for a keypress. That is the right call for reputation and law, but it means
   "barely touch it" has a floor: one keypress per prospect.
3. **Eight product stories, no customer.** `docs/operating-model` diagnosed "seven apps sharing a
   sidebar" and then kept all of them as "genome families." The repo's own Jobs-lens critique
   named this the master yes.

---

## The path: the agency-of-one funnel, reshaped for minimum touch

### What runs alone once armed (per the code)

- `garvis-standing-tick` (every 15 min) runs the `client_hunt` order: Google Places discovery
  over the niche × city grid, up to `demoQuota` bespoke demos per day, screenshot, pitch drafted
  into the Queue.
- `outreach-followups` (daily 13:00 UTC): two bumps at 3 business days, plus "opened 3×, silent".
- `resend-inbound`: reply classification, sequence stop, opt-out suppression.
- `inbox-draft` (daily): drafts replies to positive responses.
- `client-checkout` → Stripe Payment Link → `stripe-webhook`: marks the sale, records MRR,
  notifies, arms a site watch.
- `voice-inbound`, `booking`, `drainBookingReminders`, `maybeInstantFirstTouch`: the sold
  automations that never need approval.

### The touch ledger (what still needs a human, per the code)

| Event | Touch | Time | Can it be removed? |
|---|---|---|---|
| Each cold pitch | Press `a` in the Queue | ~10 s | Not without a code change (see slate + autonomy below) |
| Each follow-up | Press `a` | ~5 s | Yes: grant `followup` autonomy after 5 clean approvals |
| Positive reply | Approve the drafted reply, or write one | 1–3 min | Partly: grant `inbox_reply` autonomy; a real conversation is yours |
| Sale paid ($1,500) | Click **Go Live** once | 10 s | Yes, with the HTML-stash fix below |
| Sale paid (monthly) | 20–30 min onboarding call; import list; Twilio number | 30–60 min | Partly: the webhook could establish the package; the call is yours |
| Weekly | Read the scorecard | 5 min | Already optional |

At the default hunt (20 searches, 5 demos/day) the audit estimates **5–12 Queue decisions per
day**, all keyboard-passable. That is the "barely touch it" number as the code stands: about ten
minutes a day, plus one call per new client.

### Reshape the offer so fulfilment is near zero

Keep the two Stripe links. Change what the monthly one contains.

| Offer | Price | What it delivers | Fulfilment touch |
|---|---|---|---|
| **New website** | $1,500 once | Bespoke site, hosted, domain pointed | One click (Go Live), one DNS record |
| **Keep it running** | $249–299/mo | Hosting, missed-call text-back, booking page + reminders, instant lead acknowledgement, monthly site watch | Twilio number + 20-min call at signup, then zero |
| Add-on, only when asked | +$250/mo | Review requests, reactivation, invoice chase (the "drafts — you approve" rungs) | Customer-list import; each send is a Queue item |

The current $500/mo "Website + Automation" bundle sells the drafts-rung automations by default,
which is the tier that generates Queue work for every client customer touched
(`triggersRun.ts` is single-tenant; every reminder is one approval). Selling the runs-rung bundle
as the default monthly plan is what makes ten clients cost the operator nothing after onboarding.

### The money math (honest ranges, not projections)

Assumptions: cold email with a real, screenshot-in-email demo to local trades; benchmark reply
rates for personalised local pitches run 3–8%; closes on pitched prospects around 0.5–1.5%. The
send cap is 25/day per domain with a warm-up ramp from 5/day (`send-email/index.ts:234-241`).

| Hunt setting | Pitches/mo | Expected replies | Expected closes | API cost/mo |
|---|---|---|---|---|
| 5 demos/day (default) | ~100–150 | 3–10 | 1–2 | ~$60–90 |
| 10 demos/day | ~250–300 | 8–20 | 2–4 | ~$150–200 |
| 25 demos/day (cap) | ~600–750 | 20–50 | 4–10 | ~$400–500 |

Per-demo cost on the house model is roughly $0.40–0.60 plus ~$0.15 of images and screenshots
(`standing-worker/index.ts:2098-2254`, `_shared/ai.ts:30-37`). Fixed monthly: Resend free tier,
Netlify free, Google Places inside the $200 free credit, ScreenshotOne ~$20, Twilio ~$15 plus
~$1.15 per client number. The `spend_guard` defaults ($10/day, $100/mo, `app_0127`) must be raised
or the hunt silently degrades to template demos.

At 10 demos/day, a plausible trajectory is 2–4 closes a month. If half take the one-time site and
half the monthly plan, month 3 looks like $1.5–3k in one-time revenue plus 3–6 monthly clients
($750–1,800 MRR); month 6 looks like $3–5k a month combined. That is the "few thousand a month".
It is not week two, and no channel in this repo makes it week two.

---

## The next 14 days

1. **Merge the deployed branch.** `claude/garvis-system-app-manager-0rcrae` is 83 commits ahead
   of `main` and is what the live project runs. Any push to `main` touching `supabase/**`
   redeploys the older fleet over it. Fast-forward `main` first.
2. **Do the two-hour keys session** exactly as `docs/go-live-runbook.md` Phase 1 lists it:
   Anthropic, Resend (dedicated sending subdomain, SPF/DKIM/DMARC), Netlify, Google Places,
   Stripe, `APP_ORIGIN`, Twilio. Then Deploy Supabase (mode=functions) and Deploy Frontend.
3. **Set the in-app switches**: `from_email`, `physical_address`, `outbound_enabled`,
   `auto_first_touch`, own plan to `pro`, raise `spend_guard`, paste the two Payment Links, set
   the profile `webhook_url` so the morning brief and SOLD pings reach a phone.
4. **Smoke test on yourself**: one demo, one pitch to your own address, one Stripe test
   payment, one Go Live. Confirm which tab the email lands in.
5. **One design partner.** Someone known, at founding-client price. Their site through the
   funnel, their number on missed-call text-back. This is the production soak test the docs kept
   asking for.
6. **Start the hunt at 5 demos/day**, niches limited to trades with high ticket and weak sites
   (roofers, HVAC, plumbers, remodelers, med spas, dentists). Raise to 10/day after the first
   week's pitches read well.
7. **Grant autonomy** to follow-ups, reactivation, and invoice chase after their fifth clean
   approval. Keep cold pitches and reply drafts manual.
8. **Stop building anything else.** No video, no builder, no lead engine, no docs. The only code
   allowed is the touch-reduction list below.

---

## Code changes that reduce touches (small, in order)

Each of these is a few hours, not a sprint. Several may already be addressed on the deployed
branch; verify there before building.

1. **Slate approval for cold pitches.** One "Approve today's N pitches" action in the Queue after
   the first has been read (the reality-check's own decision D3, never built). Turns ten
   keypresses into one.
2. **`cold_pitch` autonomy class with a daily cap** (opt-in, after a long clean streak). This is
   the one change that reaches "barely touch it". The operator decides whether to take the
   reputational risk; the code should make it possible.
3. **Stash demo HTML server-side at build time** so a self-serve sale auto-publishes.
   Today the hunt's bespoke demo never stashes, so `saleActionOnPaid` resolves to `notify` and
   the "goes live automatically" copy in `ClientBilling.tsx:150` is untrue for this path.
4. **Call `pinAndEstablish` from the Stripe webhook** so a monthly sale creates its world, sender
   identity, and automation asks without the operator's manual close-won path.
5. **Reply ingestion adapter.** `resend-inbound` expects `{from, subject, text, in_reply_to}`
   with an `x-inbound-secret` header, not Resend's Svix-signed webhook shape. Without an adapter,
   replies never land and follow-ups keep nagging people who answered. Check whether the deployed
   branch's email-flow work covers this; if not, it is the first fix.
6. **No-website leads dead-end.** The best prospects (no site) have no address to mine, so they
   become `built` with no pitch. Options: Lob postcard with a QR to the demo (the rail exists on
   the deployed branch, ~$1/piece, no consent needed for B2B mail), or phone them.
7. **Hunt tick budget.** `pg_net`'s 60 s timeout versus `HUNT_TIME_BUDGET_MS = 90_000`; build one
   demo per tick or drop the budget to ~50 s so builds are never killed mid-way.
8. **Follow-up and inbox drafters need `OPENAI_API_KEY`** (`outreach-followups/index.ts:29-31`,
   `inbox-draft/index.ts:56`) and are not on the Master Switch panel. Either set the key or route
   them through `_shared/ai.ts`.

---

## Outside the box, considered

- **Postcards to no-website businesses.** Reuses the Lob rail built for real-estate farming.
  A screenshot of "the site we built for you" with a QR is a compliant channel to exactly the
  leads email cannot reach. Worth a 100-piece test in month two, after the email funnel is live.
- **Wholesale the pipeline to other agencies.** Sell "30 ready-to-pitch demo sites + contacts a
  month" to web freelancers at ~$299/mo; the buyer does the selling. Flips the operator's
  constraint, but it is a new B2B sale with new delivery code and no validation. Park it.
- **Let a scheduled Claude session be the reviewer.** A routine that reads the day's queued
  pitches against a rubric and texts "12 ready, 2 flagged" is possible, but it is the same
  decision as the `cold_pitch` autonomy class with more moving parts. Build the class instead.
- **Rank-and-rent, faceless channels, app marketplaces.** Months to first dollar, no coded
  revenue, and the docs already rate them "lottery". No.

---

## What to stop

The video pillar, the app builder, the permit lead engine, the real-estate stack beyond the one
family client, the opportunity hunt, merch, and the 70-document design corpus. None of them is
deleted; none of them gets another commit until the funnel has ten paying clients.

*The parts are done. The missing piece was never code. It is a two-hour keys session, one known
client, and pressing `a` for ten minutes a day.*
