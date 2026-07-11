# The Heartbeat — Garvis works while you sleep (+ the email front door)

*"I need this system to be working for me at all times." The audit's blunt finding was that
nothing ran unattended — the worker tick was a commented-out SQL block, reflections happened only
on page-open, and the morning digest was pull-only. This sprint gives Garvis a pulse, and opens
the front door the email pillar was missing.*

## What runs while you sleep now

**One-call arming (app_0043).** No more hand-edited SQL blocks:

```sql
select public.garvis_arm_heartbeat(
  'https://<project-ref>.supabase.co/functions/v1',
  '<shared secret>'   -- the same value you set as the WORKER_SECRET and CRON_SECRET edge secrets
);
```

That stores the URL + secret in Vault and schedules three pg_cron jobs (upsert by name; re-run to
re-arm; `garvis_disarm_heartbeat()` stops everything). Arming is operator-only — the function is
revoked from anon/authenticated.

| Job | Cadence | What it does while you're away |
| --- | --- | --- |
| `garvis-pulse-hourly` | hourly | **The morning brief** — at 7–9am in YOUR timezone, once a day: new leads, new replies, approvals waiting, reminders due — pushed to your notification webhook (Discord/Slack/phone). |
| `garvis-followups-daily` | daily | Drafts follow-up bumps for warm outreach threads as PENDING approvals. Never sends — the drafts wait for you in the queue. |
| `garvis-worker-tick` | 5 min | Advances queued agent runs (missions keep moving without a tab open). |

**garvis-pulse honesty rules:** a quiet night sends NOTHING (no "all good!" noise); every number
is a count of real owner-scoped rows since the last brief; the same brief lands as a `mind_event`
(source `pulse`) so the waking moment shows the identical record; and the pulse never acts
outward — it tells you what's waiting, the approval queue still gates everything.

So the overnight loop is: **site captures leads → instant webhook ping (already live) → followup
drafts staged overnight → morning brief with the totals → you open Command, approve, and it all
executes through the ledger.** Offloaded, but never out of your control.

## The email front door (audit E1 — the pillar that couldn't send)

`outreach_settings` had zero UI, so `outbound_enabled` stayed false and the (excellent) send-email
gates blocked 100% of real sends. Settings now has the **Outreach — sending email** card:

- **The master switch** — off by default; can't be flipped on without a from-address AND a real
  mailing address (CAN-SPAM requires it in every footer — the UI enforces what the server checks).
- Sender identity (from name/email, reply-to, company), the mailing address, the **daily send
  cap** (0 blocks everything; start small — deliverability grows with reputation), and your
  **timezone** — which drives both the cap window and the morning brief.
- Every gate stays server-side in send-email; this card only supplies the settings those gates read.

## Deploy

- `supabase db push` (app_0043).
- `supabase functions deploy garvis-pulse --no-verify-jwt` (added to `functions:deploy:webhooks`).
- Set `WORKER_SECRET` and `CRON_SECRET` edge secrets to the same value, then run the arm call above.
- Health board now probes `garvis-pulse` + `garvis-worker` under "Heartbeat (works while you sleep)".
