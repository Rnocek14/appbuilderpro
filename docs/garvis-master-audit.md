# Garvis — Master System Audit (all-in-one readiness)

*Method: the built app was driven route-by-route in a real headless browser (every `/garvis/*`
page + builder pages rendered honestly — no crashes, no stuck spinners; unconfigured shows the
"Supabase isn't configured" banner, which is the correct degradation). Four deep code-path audits
ran in parallel — every click/handler, the eight vision pillars, the manage/ops surface, and the
brain/cross-cutting layer. This is the honest state of the whole system, what was fixed in this
pass, and the ranked roadmap for what remains.*

## Verdict

**The spine is real and honest end-to-end; the operator surface on top of it is where the gaps
are.** Every pillar has a working core: you can explore, design a business, produce finished work
(research/social/video/ads/postcards/website), instrument it, measure per channel, get evidence-
gated recommendations, and connect ad platforms. What's thin is the *daily-driver* layer — reading
replies in-app, editing contacts, being notified off-app, one brain that sees everything — and two
capabilities that need real render/deploy infrastructure (video, autonomous deploy).

## Fixed in this pass (the real breakages the audit found)

1. **Approvals toast lied** — it said "Approved and executed" for publish/deploy/CRM kinds that are
   only recorded (no executor yet), contradicting the ledger right below. Now: "Approved and sent"
   only for real sends; "Approved — recorded for you to run where the capability lives" otherwise.
2. **Two forever-spinner paths** — Mission Control (`useObservability`) and the portfolio hook had
   no try/catch/finally, so a network rejection stranded the spinner. Both now resolve to an honest
   empty state.
3. **Universe 2D dead click** — a local-world click had no `.catch`; on load failure it silently
   no-op'd with an unhandled rejection. Now it always navigates.
4. **Approvals crash-guard** — an approval kind outside the known set would throw and blank the
   whole queue; now it renders generically.
5. **Notifications — the biggest ops unlock**: website **leads** and **positive email replies** now
   fire the owner's notification webhook (Discord/Slack/generic), so the business reaches the owner
   instead of waiting to be discovered. Previously only site *claims* notified.
6. **Perf**: the `/garvis/webs` index had an N+1 (a count query per world) — now one grouped query;
   and world-open ran the 14-query `gather()` twice — the not-due reflection path now reads the
   just-persisted signals (one query), roughly halving world-open cost.
7. **Credits were invisible** — enforced server-side but never shown, so a throttle looked like a
   bug. The balance now shows in the sidebar with a low-balance warning.
8. **Brain unification (the throughline all four audits named)** — Command could not see worlds at
   all ("how is mom's business doing?" was unanswerable while her world sat one nav-item away). Added
   three world tools to the Command brain: **list_worlds** (momentum/blockers/recommendation per
   world), **ask_worlds** (grounded, cited retrieval over the owner's own artifacts), and
   **draft_world** (act-gated — proposes a world for approval, never creates one silently). The brain
   prompt now knows products AND business worlds. One brain, two domains.

## Pillar scorecard (post-fix)

| Pillar | State | The gap that remains |
|---|---|---|
| **Explore** | Solid | Filed under "spike" naming; no explicit cluster→document capture button |
| **Build** | Solid (manual) / partial (autonomous) | Real Netlify deploy exists from the workspace; the **approval queue has no deploy executor** — an approved deploy is recorded, not performed |
| **Videos** | **Scripts only** | No render pipeline — needs a render edge fn (Remotion/Shotstack/Veo) turning script beats → mp4 in project-assets |
| **Documents** | Partial | **No PDF ingest** (throws "coming"); **no export** — docs go in, originals/text can't come out |
| **Emails** | Solid (outbound) / partial (no inbox) | Replies are stored but **not readable in-app** (only counts + subject); no reply-from-app composer |
| **Manage/CRM** | Partial → missing | No contacts CRUD page (edit/notes/history/delete), no pipeline board, no user tasks/reminders, no calendar/booking |
| **Smart brain** | Partial → **unified this pass** | Command↔worlds now connected; Mind memory and world reflections are still two separate memories |
| **Connections** | Solid (plumbing) | Ad sync is read-only (no campaign write); status is split across Settings + WorkWeb — no one integrations dashboard/health board |

## The ranked roadmap (what "all-in-one, end to end" still needs)

**Tier 1 — daily-driver completeness (small, high value):**
1. **Reply/lead inbox + composer** — read `replies.body_text` and lead messages in-app; reply
   enqueues a `send_email` approval. Turns the waking moment from "go look" into "act here."
2. **Contacts CRM page** (`/garvis/contacts`) — editable fields, notes, a per-contact activity
   timeline (messages/replies/leads unioned by contact_id), delete, a `stage` column.
3. **User tasks/reminders** — a `reminders` table + list + a `collectReminders` waking move
   ("remind me Friday"), the one operator affordance with no home today.
4. **Integrations/health board** — one page: every edge function deployed? every secret set? per
   provider configured/needs-secret/last-error. Highest operability win given ~38 functions.

**Tier 2 — capability depth (needs infrastructure):**
5. **PDF ingest** (pdf.js in docExtract) + a document reader with download/copy — completes the
   Documents pillar.
6. **Deploy executor from approvals** — wire the existing `deploy-site`/`deploy-backend` edge fns
   into `approveAndExecute` so an approved deploy actually ships (+ a server-side build so
   autonomous deploy has files).
7. **Video render pipeline** — the one genuinely-absent pillar; a render provider + asset storage +
   a beats→clips studio.

**Tier 3 — scale + safety:**
8. **Data export + account deletion** (compliance-relevant — contacts are real people's emails).
9. **Mobile 3D auto-fallback** (WebGL detect → flat SVG on phones), table overflow wrappers.
10. **Scheduler cron** (publish due `marketing_assets`/scheduled sends) + booking section for sites.
11. **Ad campaign WRITE** (guarded, approval-gated) once read-sync proves out.

*Invariants confirmed intact across the whole audit: honest degradation on every route, one
approval spine for outward actions, no invented numbers, suppression sacred, and every visible
figure backed by a real row.*
