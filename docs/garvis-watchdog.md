# The Watchdog & the Reactivation Sweep — the heartbeat's next two organs

*The last two levers from the always-on research: a 2am watchdog over ad spend (protects money)
and a monthly dormant-contact sweep (reactivated contacts convert ~10–25% vs ~3–8% cold). Both
run on the existing heartbeat; both are detection/drafting only — nothing acts without you.*

## The ad watchdog (`ads-watch`, daily 10:15 UTC)

For every owner with a connected ad account:
1. **Refresh through the one sync path** — ads-sync gained a worker entry (`x-worker-secret` +
   `owner_id`); metering still applies, the connection row is still required.
2. **Judge YESTERDAY vs a 7-day baseline** with the VERIFIED core
   (`_shared/adsWatchCore.ts` — one dependency-free implementation, imported by the edge
   function AND exercised by `src/lib/garvis/adsWatch.verify.ts`, 17 checks):
   - 🔴 **Spend spike** — ≥2.5× the trailing daily average AND ≥$10 above it.
   - 🔴 **Spend stopped** — a ≥$5/day campaign reported $0 (paused / disapproved / billing).
     A *missing* report is late data, never treated as zero.
   - 🟡 **CTR collapse** — clicks fell below 40% of baseline CTR, judged only on real traffic.
   - 🟡 **CPC spike** — ≥2× baseline cost-per-click with real click volume.
   - MIN-SAMPLE GATED throughout: fewer than 4 baseline days → no verdict, ever. "Today"
     (partial data) is never judged.
3. **Push the findings with their arithmetic** ("$84.00 yesterday vs $12.00/day across 7
   recorded days") + one `mind_event` per finding (source `ads-watch`) so the waking moment
   shows the same record. Dedupe by anomaly key — the same finding never re-alerts within
   3 days. Max 5 findings per push. Quiet accounts stay quiet.
4. **Detection only.** The alert ends with "Nothing was changed — review in Ads Manager."
   No auto-pause, no budget writes; acting is the owner's call (a write path would be a new,
   separately-approved standing rule).

## The reactivation sweep (`outreach-reactivate`, monthly on the 1st)

For every owner with outbound properly configured: find contacts who were once in a REAL
conversation (≥1 sent message) that went quiet **60–365 days ago**, and stage a short, human
check-in as a **draft + PENDING approval** — the morning queue, like everything else.

- Deterministic template referencing the real prior thread ("It's been about 4 months since we
  last spoke about \"Lakefront listing\"…") — no AI invention, no fake-familiarity theater, and
  an explicit easy-out line ("if it's a no, just say so and I'll close the loop").
- Only `unknown`/`valid` contacts; the suppression check **fails closed** (lookup error = skip).
- Skips open drafts and anyone in the last-60-day active window. Hard cap: 10 drafts per owner
  per sweep. The daily send cap still governs what the owner approves.
- A `mind_event` (source `reactivate`) records the sweep honestly.

## Heartbeat fix + upgrade (app_0045)

- `garvis_arm_heartbeat` recreated with FIVE jobs (pulse hourly · followups daily · worker tick
  5-min · **ads-watch daily** · **reactivate monthly**). Re-run the one arm call to pick them up;
  `cron.schedule` upserts by name.
- **Fix:** the worker tick called `garvis-worker` with only the secret header, but it was
  deployed with platform JWT verification — the tick would 401 at the gate. `garvis-worker`
  (with its own internal secret/JWT gate) now ships in the `--no-verify-jwt` deploy list.

## Deploy

- `supabase db push` (app_0045).
- `npm run functions:deploy:webhooks` (now includes `garvis-worker`, `ads-watch`,
  `outreach-reactivate`) + redeploy `ads-sync` (worker entry).
- Re-arm: `select garvis_arm_heartbeat('https://<ref>.supabase.co/functions/v1', '<secret>');`
- Health board probes both new functions under "Heartbeat (works while you sleep)".
