# Twilio setup — turn the SMS + missed-call automations on

Three of the money automations send through **Twilio**: SMS reminders / review-requests, and
**missed-call text-back**. None of them can send until you do this setup once. It takes ~30 minutes of
clicking plus a **1–3 business-day wait** for US texting approval (A2P 10DLC). Do the wait-gated part
first so it's registering in the background while you finish everything else.

Everything is **opt-in and fails closed** — nothing sends until you both set the secrets *and* flip a
switch, so you can do this at your own pace without anything going out by accident.

---

## 0. What each automation needs

| Automation | Needs a Twilio number | Needs A2P 10DLC (US SMS) | Needs Voice webhook |
|---|:---:|:---:|:---:|
| SMS reminders / review-requests | ✅ | ✅ | — |
| Missed-call **text-back** | ✅ | ✅ (the text-back is an SMS) | ✅ |
| Email automations | — | — | — |

So the SMS pieces share one setup. Missed-call adds one extra webhook.

---

## 1. Create the Twilio account + grab your credentials

1. Sign up at **twilio.com** and upgrade to a **paid** account (trial accounts can only text verified
   numbers — useless for real clients). Add a small balance ($20 is plenty to start).
2. From the **Console dashboard**, copy:
   - **Account SID** (starts with `AC…`)
   - **Auth Token** (click to reveal)

Keep these two — they go into Supabase secrets in step 5.

---

## 2. Buy a phone number (SMS **and** Voice capable)

1. Console → **Phone Numbers → Manage → Buy a number**.
2. Filter capabilities to **Voice ✅ + SMS ✅** (a local number in your client's area code reads best).
3. Buy it. This is the number that sends texts *and* — for missed-call text-back — receives the calls.
   You can buy one per client later; one is enough to start.

> Cost: ~**$1.15/mo** per US local number + ~**$0.0079** per SMS segment + ~**$0.014/min** for voice.

---

## 3. Register A2P 10DLC (required for US texting) — **do this early, it's the slow part**

US carriers **block** application-to-person SMS from unregistered numbers. You must register a **Brand**
and a **Campaign**. This is a one-time registration, approved in **1–3 business days** (sometimes hours).

1. Console → **Messaging → Regulatory Compliance → A2P 10DLC** (or the **Trust Hub**).
2. **Register a Brand**: your (or the agency's) legal business name, EIN/tax id, address, website. A
   registered "Standard" brand is worth it; the "Sole Proprietor" path exists if you have no EIN but has
   lower throughput.
3. **Create a Campaign**: use case **"Mixed" or "Customer Care / Account Notification"**. Describe it
   honestly, e.g.:
   > *"Appointment reminders, review requests, and missed-call replies sent to a business's own existing
   > customers who contacted them. Recipients can reply STOP to opt out."*
   Provide 2 sample messages (a reminder + the missed-call reply) and confirm opt-in language.
4. **Attach your phone number** to the approved campaign (Messaging → Services / the campaign's number
   pool).

While this registers, keep going — the code is already compliant (STOP/START handled, consent gated).

---

## 4. (Missed-call only) Point the number's Voice webhook at the app

1. In the app, open **Missed-call text-back** (`/garvis/missed-call`) and **copy the webhook URL** shown
   there (it's `…/functions/v1/voice-inbound`).
2. Console → **Phone Numbers → Manage → your number → Voice Configuration**.
3. Set **"A call comes in"** to **Webhook**, method **HTTP POST**, and paste the URL.
4. Save.

That's it — the app returns the TwiML that rings the business line and texts back on a miss. Every request
is signature-validated, so no one can trigger texts by forging calls.

---

## 5. Put the secrets into Supabase

Supabase → your project → **Project Settings → Edge Functions → Secrets** (or `supabase secrets set`):

| Secret | Value |
|---|---|
| `TWILIO_ACCOUNT_SID` | your `AC…` SID |
| `TWILIO_AUTH_TOKEN` | your auth token |
| `TWILIO_FROM_NUMBER` | the number you bought, **E.164** (`+15551234567`) |

Optional, only if signature validation rejects calls behind a proxy:
`VOICE_WEBHOOK_URL` = the exact URL you pasted into Twilio in step 4.

> These are the **same** `TWILIO_*` secrets the SMS send path uses — set them once and both SMS and
> missed-call work.

---

## 6. Flip the switches (nothing sends until you do)

- **SMS reminders**: turn on the SMS kill switch — `outreach_settings.sms_enabled = true` for your owner
  row (Settings, or SQL). Then on the **Automations** page, an **Email/Text** toggle appears on each
  automation; switch the ones you want to Text. Customers need a **phone** on file (the CSV import takes a
  `phone` column).
- **Missed-call text-back**: on the **Missed-call** page, **Add a number** (the Twilio number + the real
  business line to ring + a template) and switch it **On**.

---

## 7. Test it end to end

1. **SMS**: on Automations, attach a test customer (with your own mobile as the phone) to a Text
   automation and hit **Run due now** → approve the queued text in the **Queue** → you get the SMS.
2. **Missed-call**: call the Twilio number from your phone and **don't answer** the forwarded line → within
   seconds you get the text-back. Check the **Missed-call** page's *Recent calls* ledger — it logs every
   call and whether it texted.

---

## Compliance (already enforced in code — don't defeat it)

- **STOP / HELP** are honored automatically; a number that replies STOP is never texted again.
- SMS automations only go to a business's **own warm customers** (transactional consent), never cold lists.
- Missed-call text-back replies only to someone who **just called** — a single reply, the inbound call is
  the consent.
- Keep A2P registration accurate; carriers audit. Don't send marketing blasts on a customer-care campaign.

---

## Costs, roughly

| Item | Cost |
|---|---|
| Phone number | ~$1.15 / mo each |
| SMS | ~$0.0079 / segment (160 chars) |
| Voice (missed-call forwarding) | ~$0.014 / min |
| A2P 10DLC | ~$4/mo campaign + one-time brand/vetting (~$4–44) |

At agency pricing ($200–600/mo per automation) these costs are a rounding error — one recovered
missed-call job pays for a year of the number.
