# Go-live checklist — everything you need set up to start selling

The whole system is **opt-in and fails closed**: nothing sends, hunts, or runs on its own until you set
the secret *and* flip the switch. So you can work top-to-bottom at your own pace — nothing goes out by
accident along the way.

Order matters: each tier unlocks the next revenue step. You can stop after any tier and still sell what's
below it. The **live source of truth** for most of this is the in-app **Health page** (Master Switch) —
it shows, from the server, which secrets are set, which cron jobs are scheduled, and whether the heartbeat
is actually ticking. Check yourself against it as you go.

Secrets go in **Supabase → Project Settings → Edge Functions → Secrets** (or `supabase secrets set`).

---

## Tier 0 — Ship the code (one-time) — **do this first**

Functions auto-deploy on every merge to `main`, but **migrations do not** — they only apply on a `mode=full`
deploy. Four recent migrations are waiting:

- [ ] `app_0105` (Veo scenes), `app_0106` (SMS channel), `app_0107` (missed-call), `app_0108` (per-client config)
- [ ] **Run the Supabase deploy workflow once in `mode=full`** (GitHub → Actions → the deploy-supabase
      workflow → Run with `mode=full`). This applies all pending migrations *and* deploys the full function
      fleet, including `system-control`, `send-sms`, `voice-inbound`.

Until this runs, the SMS / missed-call / per-client tables don't exist and those pages will read empty.

---

## Tier 1 — Turn the brain on (the autonomous layer)

Powers the 12 cron jobs + the 15-minute heartbeat (hunts, follow-ups, canary, etc.).

- [ ] `WORKER_SECRET` — shared secret every cron worker checks. Make a long random string.
- [ ] `CRON_SECRET` — for the daily cron functions.
- [ ] **Arm the heartbeat**: Health page → Master Switch → **Arm**, passing this project's functions URL
      (`https://<ref>.supabase.co/functions/v1`) and the `WORKER_SECRET`. Needs the `pg_cron` + `vault`
      extensions enabled on the project.
- [ ] Confirm on the Health page: **12 cron jobs scheduled**, and heartbeat stamps appearing within ~15 min.

Everything the crons do is still draft-and-queue — arming does **not** make anything send.

---

## Tier 2 — Client acquisition (find → build → pitch)

The daily machine that finds businesses, builds demo sites, and queues pitches for your approval.

- [ ] `ANTHROPIC_API_KEY` — the demo intelligence chain (strategy → spec → critique) **and** the
      no-Google-Places "Claude scout" discovery mode.
- [ ] `GOOGLE_PLACES_API_KEY` — structured business discovery (optional if you use Claude scout, but it's
      the richer firehose). **Verify it with the "Probe Places key" button on the Health page** — a
      presence check can't tell a valid key from an over-quota one.
- [ ] `APP_ORIGIN` = your deployed app URL. ⚠ **Critical and silent**: with this unset, hunts build demos
      but **no pitch is ever queued** (the demo link would be broken) and you'll see "nothing happened."
- [ ] `SCREENSHOT_API_KEY` — the screenshot-in-email pitch (optional; falls back to a text+link pitch).
- [ ] Then arm a hunt: **Win clients** → start the daily client hunt (or run "Scrape everything" on demand).

The Setup page's readiness light summarizes this as **canHunt** / **canAutoHunt**.

---

## Tier 3 — Send email (the pitch itself + the email automations)

Nothing above can actually *email* until this tier is done. Every pitch, reminder, review-request, invoice
chase, and reactivation goes through this one path.

- [ ] `RESEND_API_KEY` — and **verify your sending domain in Resend** (SPF/DKIM), or mail lands in spam.
- [ ] Setup → outreach settings → `from_email` — a real sender on the verified domain.
- [ ] Setup → outreach settings → `physical_address` — **CAN-SPAM requires it**; `send-email` refuses without it.
- [ ] Flip `outbound_enabled` **ON** (the email kill switch, off by default).
- [ ] `RESEND_WEBHOOK_SECRET` — bounce/open/click tracking (point the Resend webhook at `resend-webhook`).
- [ ] `INBOUND_SECRET` — reply ingestion (so replies auto-classify + stop the sequence).

Setup's readiness light summarizes this as **canSend**.

---

## Tier 4 — Texting (SMS reminders + missed-call text-back)

Requires the biggest external setup (A2P 10DLC has a 1–3 day approval) — **see `docs/twilio-setup.md`**.

- [ ] `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` (E.164).
- [ ] **A2P 10DLC** brand + campaign registered and your number attached (US texting is blocked otherwise).
- [ ] Flip `outreach_settings.sms_enabled` **ON** — then an Email/Text toggle appears on each automation.
- [ ] **Missed-call**: point the Twilio number's **Voice** webhook at `voice-inbound` (copy the URL from the
      Missed-call page), add a number there (Twilio number + the real line to ring), and switch it on.

The new Twilio secrets now show under the **"texting" pillar** on the Health page.

---

## Tier 5 — Get paid

- [ ] `STRIPE_SECRET_KEY`.
- [ ] Create your **two Stripe Payment Links** (Website one-time, Website+Automation monthly) and paste
      them into the **Client revenue** page.
- [ ] (Optional) Point a Stripe `checkout.session.completed` webhook at `stripe-webhook` so a prospect who
      pays from their demo is recorded and their site auto-publishes.

---

## Tier 6 — Optional pillars (only if you sell them)

- [ ] `AYRSHARE_API_KEY` — real social posting (content-week automation).
- [ ] `SHOTSTACK_API_KEY` — storyboard→mp4 video rendering. `GEMINI_API_KEY` — Veo photoreal scenes.
- [ ] `EMBEDDINGS_API_KEY` — semantic memory (falls back to keyword search without it).
- [ ] `NETLIFY_AUTH_TOKEN` — one-click site hosting (publish demos live). `SB_MANAGEMENT_TOKEN` — provisioning.

---

## Final verification — "is the brain actually on?"

1. **Health page**: every secret you set shows a ✅, all 12 cron jobs scheduled, heartbeat stamps fresh.
2. **Probe Places key** (Health page) returns green.
3. **Setup readiness line** reads *"Ready — find, build, and send are all live, and the daily hunt will fire."*
4. The **nightly canary** (`garvis-canary`) stays silent — it self-tests the live wiring every night and
   only messages you when something it checks (send gate, DB, fetch, heartbeat freshness) actually breaks.

Minimum to **sell your first client today**: Tier 0 + Tier 2 + Tier 3 (find → build → pitch → email) and
Tier 5 (get paid). Texting (Tier 4) can follow once A2P clears.
