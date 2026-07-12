# Speed-to-Lead — the instant first touch (Garvis's first standing rule)

*The research verdict was blunt: answering a lead within 5 minutes makes contact ~100x more
likely (MIT lead-response study), sub-minute response lifts conversion ~4x (Velocify, 3.5M
leads), 78% of buyers choose the first responder — and only ~7% of businesses manage it, because
humans sleep. This is the one lever where "works while you sleep" is directly, measurably
revenue. Garvis now pulls it — without ever becoming a spam cannon.*

## What happens at 3am now

1. A visitor submits the form on one of your generated sites → `site-events` records the lead,
   links-or-creates the contact (suppression sacred, as always).
2. **If the standing rule is on**, Garvis instantly sends *your* acknowledgment template — their
   first name and your business name filled in deterministically. No AI writes anything at 3am.
3. The send flows through **THE ONE SEND PATH** (`send-email`) with every gate re-verified
   server-side: fail-closed suppression, the kill switch, CAN-SPAM address, daily cap + warmup,
   the double-send CAS. A blocked send is an honest `skipped` ledger row, never a silent retry.
4. The lead is stamped `first_touch_at` (a real timestamp — "answered instantly" is never a
   guess), your phone ping says "⚡ answered instantly," and the morning brief counts them.
5. The *personal* reply is still yours — the ack buys you the morning, it doesn't impersonate a
   conversation. Anyone you've already messaged in the last 7 days is skipped entirely (Garvis
   never barges into an active thread).

## Tiered autonomy, done honestly (the architecture this establishes)

The research consensus: autonomy that survives is *pre-authorized narrow action classes behind
the same guardrails*, expanded one class at a time. This is the first class:

- **The standing rule is explicit and owned**: `outreach_settings.auto_first_touch`, off by
  default, only enableable when outbound is on with a from-address + mailing address, template
  editable in Settings → Outreach.
- **The authority is a normal approvals row** — `requested_by 'garvis-auto'`,
  `decided_via 'standing_rule'` — created at send time, so the queue and ledger show every
  autonomous action exactly like a human-clicked one. No side channel.
- **`send-email` gained a worker entry** (`x-worker-secret`), accepted ONLY for
  `garvis-auto` approvals; the owner is derived from the approval row, never from the caller.
  The single-send-path invariant holds: there is still exactly one Resend caller, one set of
  gates, one ledger.
- **The kill switch kills it**: `outbound_enabled=false` (or cap 0) blocks standing-rule sends
  exactly like human ones — verified server-side on every send.

Future action classes (followup autopilot after N manual approvals, budget-alert autopause)
follow this same shape: a named standing rule, a `garvis-auto` approval, the one gated path.

## Deploy

- `supabase db push` (app_0044: `auto_first_touch`, `first_touch_subject/body`,
  `leads.first_touch_at`).
- Redeploy: `send-email`, `site-events`, `garvis-pulse` (already in the deploy lists).
- Requires `WORKER_SECRET` (the same one the heartbeat uses).
- Turn it on: Settings → Outreach → "Instant first touch."
