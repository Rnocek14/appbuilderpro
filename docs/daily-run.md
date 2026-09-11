# The daily run — ten minutes, one screen

This is the whole job once the keys are in and the heartbeat is armed (`docs/go-live-runbook.md`).
Everything below the line runs on its own; everything above it is you.

## What you do

**Morning (5–10 minutes, phone is fine).**
1. Open **Command**. The waking moment leads with the slate: *"N pitches are ready — read one,
   approve the rest in one go."*
2. Open the **Queue**. Read one pitch card (they share one template, in your voice). Press
   **Shift+A** (or the orange *Approve all N* button). Every pitch goes out through the same send
   gates as a hand-approved one: kill switch, suppression, CAN-SPAM footer, daily cap, warm-up.
   A pitch the risk classifier flagged is held out of the slate and keeps its own card.
3. Walk the rest of the lane with `j`/`k` and `a`/`x`: reply drafts to people who answered,
   follow-ups (until you grant them autonomy), anything else the machine wants a yes on.
4. Done. Close the tab.

**When someone replies (the Queue → Messages lane, same pass).** The reply is classified, the
sequence stops, and a draft answer waits for you. Edit or approve. A real conversation is yours.

**When someone pays (a SOLD ping).**
- *New Website ($1,500):* the site is already live — the hunt stashed the demo's HTML at build
  time and the webhook published it. Point their domain when they send it.
- *Website + Care Plan ($299/mo):* the webhook pinned the package and booked you **one reminder**:
  a 20-minute call for their phone number (missed-call text-back) and, only if they want review
  requests or win-back notes, their customer list. Everything else in the plan runs on its own.

**Weekly (5 minutes).** Read the scorecard. Grant autonomy to follow-ups, reactivation, and
invoice chases once each shows five clean approvals — after that they never touch the Queue.

## What runs on its own

| Clock | What it does | Touch |
|---|---|---|
| Every 15 min | The hunt spends a slice of the day's budget: a few searches, then ONE demo for a lead with a public email (the email is checked before any model spend; leads with no address are set aside with their phone) | none |
| Each pitch | Bespoke demo, before/after screenshot, pitch drafted into the Queue, demo HTML stashed for a zero-click sale | the slate |
| Daily 13:00 UTC | Follow-ups drafted for quiet threads (two bumps + "opened three times, silent") | `a` per draft, or none once granted |
| On reply | Resend's inbound webhook fetches the reply, classifies it, stops the sequence, honours opt-outs, drafts the answer | approve the draft |
| On payment | Sale recorded, MRR updated, site auto-published from the stash, package pinned, onboarding reminder booked, SOLD ping | one call per care plan |
| For clients | Missed-call text-back, booking + reminders, instant reply to enquiries, daily site watch | none |
| 7–9am local | The morning brief: pitches ready, replies, other approvals, reminders — to your webhook, or to your own email when no webhook is set | read it |

## The numbers that decide it

- **Demos/day** is set on Win Clients (default 5, cap 25). The hunt card shows *today: 3/5 demos ·
  12/20 searches*. Raise it once the first week's pitches read well.
- **Spend guard** (Settings): $10/day, $100/month by default. At 10 demos a day the monthly cap
  arrives around day 15–20 and demos silently fall back to the template — raise it first.
- **Send cap**: 25/day per sending domain, warm-up from 5. Approving 25 pitches with a cap of 10
  sends 10 today and holds the rest; the clock drains them under the cap.

## What never happens without you

A first email to a stranger. The cold pitch has a streak on the trust dial so you can see how
many you have approved cleanly, but it has no *Grant auto* button. The slate is its one-keypress
path, and you are the keypress.
