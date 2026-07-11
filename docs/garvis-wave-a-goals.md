# Wave A (trust floor) + the Goals Spine (Garvis understands what each project is FOR)

*Two layers shipped together: the security/integrity fixes the full-system audit demanded before
anyone else touches the system, and the first layer of "it has to adapt all functions toward
project goals" — the owner's own goals steering Next Move, the producers, Ask, and the Commander.*

## Wave A — integrity & trust

**A1 · preview_sites lockdown (the audit's one true cross-tenant exposure).** The old policy was
`for select using (true)` — anyone holding the public anon key could dump every tenant's prospect
pipeline (names, specs, pitches, owner ids). Now (app_0041): owners read their own rows; the ONLY
anonymous door is `get_preview_by_slug(slug)` — a security-definer function returning exactly one
row for an exact, unguessable slug, with the owner id stripped. `getPreviewSite` routes through it.

**A2 · the approval spine is real for every deploy.**
- `deploy-site` and `deploy-backend` now REQUIRE an approved approval of the matching kind, owned
  by the caller, verified server-side (the send-email discipline). No approval → no deploy, even
  for a direct API caller.
- Both write their own `execution_runs` rows via service role (`ok`/`failed`, with the URL or the
  failed steps). The audit found the client's `connector:'netlify'` ledger writes were silently
  RLS-rejected — real deploys were leaving NO audit row. Client-side, only honest `skipped`
  decision records remain (the narrow app_0031 policy).
- `deploy_backend` has a REAL executor now: the workspace's Deploy routes through
  `deployBackendThroughSpine` (functions + secrets captured into the approval payload, your click
  is the approval), and a Garvis-proposed `deploy_backend` executes on approval instead of
  silently no-oping.
- `deploy-site` honesty: reports `state: 'building'` when the host hasn't confirmed ready —
  deployments record `live` only when it's live.
- siteId binding (audit H3): the authoritative Netlify site id lives in `projects.netlify_site_id`,
  written server-side on first deploy. A client-supplied siteId is honored only with the caller's
  OWN token — never with the shared operator token, where a foreign site id could overwrite
  another tenant's site.

**A3 · SSRF hardened (one shared path).** `_shared/safeFetch.ts`: full private/reserved IP table
(incl. CGNAT, decimal/hex IP forms, IPv6 loopback/link-local/ULA/IPv4-mapped), DNS resolution with
EVERY record required public (rebinding defense), and MANUAL redirects re-validated per hop.
`fetch-url` fetches through it; `shot-worker` validates targets with it.

**A4 · the hardening set.**
- `queuePitch` no longer blind-upserts contacts — select-first, so an existing contact's
  `email_status` (unsubscribed/bounced/complained) is NEVER reset. Suppression stays sacred.
- `job-worker` gained the garvis-worker auth gate (service-key self-chain, worker secret, or a
  signed-in user) — it was fully ungated.
- `resend-inbound` compares its secret in constant time (matching resend-webhook).
- The operator-paid media/reporting seams meter credits like every AI call: `render-video`
  ('render'), `shot-worker` ('screenshot'), `ads-sync` ('ads_sync').

**Honestly not done yet (documented, not hidden):** `apply-migration`, `github-export`, and
`provision-supabase` still execute on direct ownership checks without an approval row or ledger
entry — the same treatment as deploys is the natural next extension. `publish_post`/`spend` still
record honest `skipped` decisions (no executor exists).

## The Goals Spine — different projects, every function adapted toward what each is FOR

**The model (app_0042 `world_goals`, owner RLS):** a goal is the owner's own statement of what a
world is trying to achieve — title, why, an optional metric (`leads` | `visits` | `manual` |
`none`), an optional target and date, and a lifecycle (active/achieved/paused/dropped).

**Honest progress (goals.ts, pure, verified — 26 checks):** a meter renders ONLY with a real
numerator AND denominator. `leads`/`visits` count real rows since the goal was set — and only when
the world's site actually has reporting wired (`site_channels`); otherwise "not instrumented yet."
`manual` is the owner's own logged number, labeled as such. `none` is directional — it still
steers, it just never fakes a meter.

**Where the goal steers (all fail-soft — no goal, nothing changes):**
1. **Next Move** — `applyGoalFocus` (deterministic, verified): a move that advances an active
   goal's world gains +15 (+10 more inside a 14-day deadline window) and NAMES the goal in its
   why: *"…Advances your goal “10 seller leads a month” (due 2026-07-20)."* Paused/achieved goals
   stop steering. Never silent, never invented.
2. **Producers** — `gather()` loads the world's goal line into `businessContext`, so research,
   social, video, angles, and ads are all written AT the goal, in every producer prompt.
3. **Ask Garvis** — a world-scoped ask carries the goal (labeled owner-stated) so answers are
   framed by what the world is for.
4. **The Commander (front door)** — `goalsDigest()` injects ALL active project goals (with world
   names and real progress) alongside the identity/mind digest, so every conversation knows what
   each project is trying to achieve.

**The UI:** the world page's "The goal" panel (`WorldGoalPanel`) — set it in your words, pick how
it's measured, see honest progress, log manual counts, pause/achieve. Distinct from the legacy
portfolio Goals & Constraints panel on the Garvis page (that one feeds the old objective function;
consolidation is a Wave C identity task).

**Who you are** was already wired: `mind_identity` slots (goals/values/priorities/voice, edited on
the Mind page) flow into every Commander conversation via `compileMindContext`. The goals spine
adds the per-project half.

## Deploy

- `supabase db push` (app_0041 + app_0042).
- Redeploy changed functions: `deploy-site`, `deploy-backend`, `fetch-url`, `shot-worker`,
  `render-video`, `ads-sync`, `resend-inbound`, `job-worker` (all in the existing deploy lists).
- Gate: tsc clean · vite build clean · verify suites green (goals 26, workweb, genesis, nextMove,
  worldIntel, adaptive, producers, storyboard, contacts).
