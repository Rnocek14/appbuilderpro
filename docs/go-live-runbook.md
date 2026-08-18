# Go-live runbook — from deployed code to first dollar (2026-08-18)

Everything code-side is DONE and verified in production: schema through app_0158, the full
function fleet live, heartbeat armed, inbox-placement guard deployed, 206 verify suites green.
What remains is keys, accounts, and selling. This is the ordered list — top to bottom, nothing
optional until marked so.

## Phase 1 — Accounts and keys (one sitting, ~2 hours + DNS waits)

Everything goes in ONE place: repo → Settings → Secrets and variables → Actions.
Secrets are secret; the two VITE_ values are **Variables** (they ship in every client bundle by
design — RLS is the security boundary).

| # | Where | What to add | Notes |
|---|-------|-------------|-------|
| 1 | Supabase → Settings → API | Variables: `VITE_SUPABASE_URL` = `https://aobrsurgymnyxifoqfpu.supabase.co`, `VITE_SUPABASE_ANON_KEY` = the anon key | 2 min |
| 2 | console.anthropic.com | Secret: `ANTHROPIC_API_KEY` | The brain — nothing thinks without it. Expect $5–50/mo early |
| 3 | resend.com | Secrets: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | Add a SENDING domain (see below), verify DNS. Webhook endpoint: `https://aobrsurgymnyxifoqfpu.supabase.co/functions/v1/resend-webhook`. Free to 3k emails/mo |
| 4 | netlify.com | Secrets: `NETLIFY_AUTH_TOKEN` (User settings → Applications), `NETLIFY_APP_SITE_ID` (create one empty site → Site details → API ID) | Hosts the console AND client sites. Free tier fine |
| 5 | console.cloud.google.com | Secret: `GOOGLE_PLACES_API_KEY` (enable Places API) | Powers prospect hunting. $200/mo free credit covers early volume |
| 6 | stripe.com | Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (endpoint: `…/functions/v1/stripe-webhook`) | Getting paid. Price-ID secrets are for SaaS tiers later — skip for now |
| 7 | Supabase URL again | Secret: `APP_ORIGIN` = your Netlify site URL | Links in outbound email + QR pages point here |
| 8 | twilio.com — *optional week 1* | Secrets: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | SMS/voice concierge, ~$15/mo |
| 9 | lob.com — *when the first farm client signs* | Secrets: `LOB_API_KEY`, `LOB_WEBHOOK_SECRET` (endpoint: `…/functions/v1/lob-webhook`) | Pay-per-postcard (~$0.99/piece). Order ONE proof to yourself before any client drop |

**The sending domain (do this right, once):** send from a dedicated domain or subdomain (e.g.
`mail.yourbrand.com`), never a personal Gmail-adjacent domain. Resend gives the SPF/DKIM records;
add a DMARC record (`v=DMARC1; p=none;` to start). The warm-up ramp is already enforced in code —
a fresh domain starts at ~5 sends/day and grows daily. Do not fight it; it is what keeps you out
of spam in month two.

Then run two workflows (Actions tab):
1. **Deploy Supabase** — mode=`functions` → syncs every secret above to the function fleet.
2. **Deploy Frontend** → the console goes live at your Netlify URL.

## Phase 2 — Smoke test (30 minutes, same day)

1. Open the site, create your operator account, log in.
2. Build a test app (proves the Anthropic key + generation pipeline).
3. Win Clients → Find (proves Places; the pipeline fills).
4. Create a 2-step email flow to YOURSELF; approve it from the Queue; confirm it arrives — and
   note WHICH TAB. The live placement lint should have shown nothing to fix.
5. Approve something from your phone. That approval loop is the daily driver — make sure it feels
   one-thumb easy.

## Phase 3 — First money (this week, operator-led)

- **Design partner first**: one agent you already know. Free or founding-client price
  ($250–500/mo) in exchange for the case study and the measured rows. Their farm, their drips,
  their site — everything through your Queue.
- **The agency-of-one motion, daily**: hunter finds local businesses with broken web presence →
  real demo site → pitch through the Queue. Target: 5 pitches/day, 25/week.
- **Pricing to open with**: $500/mo digital (site + drips + content + attribution receipts) ·
  $1,000–1,500/mo with the postcard farm (mail hard-costs bundled at the top price). Anchor
  against what they already pay: one bad Zillow month costs more and attributes nothing.
- **The weekly review**: every Friday, the measured-channel table against Act I's gates
  (docs/path-to-one-billion.md — ≥10 clients / $10k MRR / one act-grade channel). Evidence, not
  vibes, decides what scales.

## Standing cautions

- Every client sends from THEIR OWN domain once they're paying — one client's mistake must never
  tax another's deliverability. The per-brand sender setup handles this; use it from client #1.
- SMS is TCPA territory: consent + quiet hours are enforced in code — never work around them.
- MLS sync and voice-ISA depth are built but unproven — don't put them on an invoice yet.
- The first client IS the production soak test. Price like a founding partner, deliver like it's
  fragile, and read every named failure message the system gives you — they say what to fix.
