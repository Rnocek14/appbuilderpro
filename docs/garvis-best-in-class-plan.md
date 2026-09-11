# The Best-in-All-Areas Plan

**Status: ACTIVE — August 14, 2026.** This is the operative build sequence. It was drafted by
five area planners grounded in the code, then adversarially reviewed through three lenses
(doctrine & safety, sequencing & feasibility, completeness & leverage); every surviving concern
is folded into the items below. Companions: `garvis-first-principles.md` (the vision this plan
builds toward), `garvis-level-10.md` (the quality bar; its Spec 5A is executed here),
`best-software-plan.md` (the lens). Where those docs disagree with this one, this one wins —
it is newer and it was checked against the tree.

**How to use this doc:** one item = one focused session = one PR. Work the sub-waves in order;
inside a sub-wave, items without dependency arrows can go in any order. Before starting any
item, re-verify its file claims in the tree (the plan was written against `app_0138` /
commit `b125a1f`; the tree moves). Every PR passes the standing gates: `npx tsc --noEmit`,
the affected `verify:*` suites, `npm run build`, the growth e2e if UI changed.

---

## The bar, per area (what "best" means, measurably)

**Builder.** "Generated" provably means "runs": every build and edit ends in exactly one honest
verification state — compiled + rendered clean, or a named failure with the one next step —
never a silent static-only pass dressed as clean. Agent edits that fail the gate never land on
Main without the operator seeing the failing diff. Real generator output is built, served, and
driven in a real browser by CI nightly. Closing the tab never kills a build. Every blessed
package is pinned in one registry consumed by all four surfaces. Measured: 100% of generations
and edit turns carry a verification badge; first-forge success is computed from
`project_generations` rows (scorecard item, SW9) and trends >90%; the nightly probe is green;
`grep -r sandpack src/` and `ls supabase/functions/generate-app` both return nothing.

**Intelligence.** Any non-verbatim sentence at the front door is read by a frontier-tier model
that sees the full mind record, goals, situation, and full-size retrieved knowledge — cost held
down by prompt-cache prefixes and hard-capped by the app_0127 spend guard. The vector brain is
fed nightly. The mind closes its own loops: consequential sends open falsifiable predictions
that real reply rows later close, hit-rate honestly surfaced. Consolidation runs nightly and
links evidence to beliefs. The morning brief carries one grounded model-written read on top of
deterministic counts. Measured results transfer across ventures. Zero fabricated numbers
anywhere — the existing gauntlets (`concierge.verify.ts`, `orchestratorCases.verify.ts`,
`gauntletFuzz.verify.ts`) stay green throughout.

**Execution & autonomy.** While the operator sleeps, every catalog action an approved arc
contains advances server-side — creative work included; `build_app`/`template_document` park
*honestly* as browser-required handoffs, everything else runs. A parity verify makes
catalog/worker drift a CI failure. Money closes itself: real Stripe payment links, webhook
auto-mark-paid, chase ladder auto-cancelled. Nothing rots silently: approvals expire on a
visible clock with a nudge that always reaches the operator; failing standing orders trip a
breaker into a visible dead-letter lane. New outbound surfaces (Lob mail, GitHub shipping) flow
through the same approval spine with server-side hash re-verification. An AI risk score
annotates every queue card and can only ADD human review. All fetched external text reaches
prompts through an injection quarantine. Measured: approve a plan at 9pm, close the laptop,
wake to executed steps, reconciled payments, and an honest queue — with zero un-approved
external actions in the ledger (orphan audit, SW9).

**Surface & presence.** Garvis is reachable the way a chief of staff is: text a bound, verified
number, get a grounded answer from the same commander brain, written into the ONE conversation
record; Garvis texts first when a real observation qualifies, never twice. Nothing ever
executes from a text. In-app, spoken replies start within one sentence of latency and stop the
instant the operator speaks or types. The route surface shrinks measurably with zero lost URLs.
The commander classifies every utterance into postures. The Field exists as a working opt-in
surface fed by real mission state — with a dated promote-or-delete checkpoint so it cannot rot
into a third home. Stale strategy docs open with dated truth banners; the quality bar is one
shared constant with a persisted event trail.

**Verification stack.** Every PR gets a rule-anchored review within minutes, tuned to this
repo's actual invariants, with measured precision in a findings ledger. Send-path/money/auth/
migration diffs get a security pass and a monthly deep review. The only merge gate is flipped
on only after the ledger shows ≥60% high-severity precision over ≥4 weeks, scoped to protected
paths, with a logged override. Regression safety extends beyond review: a CI-enforced authed
route sweep and a mutation looking-glass that has demonstrably hardened the spine cores.
Recurring spend stays in low single-digit dollars per week, every lane keep/kill backed by its
own logged data.

---

## Global rules (from the adversarial review — read before any session)

**1. Migration numbers.** Current max at plan time: `app_0138`. Allocation below is by landing
order. These are PROVISIONAL: at the start of any session that adds a migration, re-derive the
next number from `supabase/migrations/` and use it — never the plan's number if the tree moved.
Never reuse a number. Regenerate `supabase/_apply_garvis_all.sql` in the same PR.

| # | Purpose | Item |
|---|---|---|
| app_0139 | standing-order breaker columns | SW2 |
| app_0140 | approval expiry + reminded_at | SW2 |
| app_0141 | copy_quality_events | SW1 |
| app_0142 | embed sweep cron | SW2 |
| app_0143 | garvis_line | SW4 |
| app_0144 | consolidate nightly recadence | SW7 |
| app_0145 | invoice stripe columns | SW7 |
| app_0146 | proactive_spoken unified nudge ledger | SW5 |
| app_0147 | approval risk columns | SW8 |
| app_0148 | strategies | SW9 |
| app_0149 | ship_repo approval kind | SW10 |
| app_0150 | lob fulfillment tables | SW10 |
| app_0151 | send_mail approval kind (enum ALTER alone in its own file, app_0064 precedent) | SW10 |
| app_0152 | generation watchdog cron | SW10 |

**2. Shared-file serialization (cross-area, one PR at a time, rebase between):**
- `supabase/functions/standing-worker/index.ts`: breaker → expiry sweep → quarantine → ports
  (mechanical → producers → genesis) → risk annotation. Never two of these in flight at once.
- `ConciergeDock.tsx` / `commander.ts` / `dockBrain.ts`: feed-the-brain → Intention Router v1 →
  Text-Garvis (imports commander into Deno) → routing inversion → speak-while-thinking → Field.
- `supabase/functions/garvis-pulse/index.ts`: Garvis-texts-first → overnight read.

**3. Time-gated items — wave position alone NEVER triggers these:**
- *Model-first routing inversion* (SW8): requires ≥1 week of `usage_events` after SW2's
  feed-the-brain + frontier-tier items ship, AND pre-registered numbers met: cache-read share
  ≥40% on consecutive dock asks, p50 dock deep-brain latency ≤3.5s, brain spend within the
  daily cap with ≥30% headroom. Vibes don't count; the numbers come from `usage_events`.
- *Flip the review gate* (SW10): ledger criteria (≥4 weeks, ≥60% high-severity precision) —
  whichever of "SW10 reached" / "criteria met" comes LATER.
- *Field checkpoint* (SW10): dated 4 weeks after Field part 2 lands — promote to home (retiring
  one of the others to a redirect) OR delete the flag. The experiment cannot outlive the
  decision.

**4. Unattended model spend.** Every worker-side `complete()` call rides
`checkCredits`/`spendCredits` with the app_0127 kill switch and caps — SW1's assertion item
proves it and is a hard dependency of the porting items. Any retry loop on a spend path carries
an attempt cap and a breaker.

**5. One nudge ledger.** `proactive_spoken` (owner_id, key, channel; unique on all three) is
the server-authoritative dedupe for EVERY owner-nudge path — SMS proactive lines, the email
reminder rung, and any future channel. One observation, notified once, per channel by explicit
choice. The device-local ledger in `proactiveRun.ts` remains a display cursor only.

**6. Untrusted text.** External content (watched pages, hunt extractions, fetch-url output,
inbound SMS bodies, URL-sourced document snippets in retrieval, inbound reply rows feeding
consolidation/briefing) passes through `quarantineExternal` before reaching any prompt.
"Data, not instructions" is a gate, not a label.

---

## SW1 — Truth and safety rails (~6.5 sessions)

**1.1 Docs truth ledger** (1s, docs-only). Dated STATUS banners + per-claim ledgers on
`garvis-master-audit.md` (three pillars overtaken: deploy executor, video render, PDF ingest
all shipped), `garvis-level-10.md` (check off landed W1 items with file evidence), and
`full-system-scan.md` (census: 138 migrations, ~76 function dirs, verify-suite count from
package.json). Add explicit keep/kill lines for the designed-but-unbuilt set so nothing reads
as silently done: social calendar slots (DEFER, dated), ship→market seam (BUILD — SW5.5),
branches-as-exploration compare view (DEFER, dated), email segments + drip flows (BUILD — SW10;
A/B + branded shell DEFER). Accept: banners present; every W1 checklist line marked
done/partial/open with a file path; docs-only diff.

**1.2 REVIEW.md: house doctrine as enforceable review rules** (1s). Repo-root REVIEW.md:
(a) approval-spine invariants — new outward side effects must be an `ApprovalKind` in
`execution.ts` executed only via a server executor re-verifying the payload hash; flag any edge
function doing outbound I/O without hash re-verification, any client-side direct send;
(b) honesty spine — no fabricated numbers, failures via named messages, degraded features name
the setup step; (c) pairing rule — new pure logic ships `X.verify.ts` wired as `verify:*`;
(d) migration discipline; (e) simplicity-doctrine checks at advisory severity; (f) reviewer
discipline — file:line + concrete failure scenario per finding, ≤3 nits, skip
`package-lock.json`, `_apply_garvis_all.sql`, `prototypes/**`, `docs/**`, `public/**`. Pointer
line in CLAUDE.md. Accept: two seeded canary diffs (un-hashed send; unpaired core) are flagged
by `/code-review` citing the rule; a clean recent PR yields ≤3 nits.

**1.3 ai-review.yml: report-only review on every PR** (1s). `claude-code-action` on
`pull_request` only, obeying REVIEW.md, concurrency-cancel, paths-ignore per 1.2f, single
sticky comment, capped turns, model taken from a repo Actions variable (never hardcoded — house
rule). Document the `ANTHROPIC_API_KEY` secret in RUNBOOK. Same-repo PRs only; no
fork/`pull_request_target` surface. Accept: a seeded spine-violation PR gets exactly one review
comment naming it at file:line, under ~$0.50/run.

**1.4 Arc-action parity verify** (0.5s). `arcParity.verify.ts` on the `workerParity` pattern:
parse `SERVER_ACTIONS` from the standing-worker source; assert every member is a real
`ACTION_SPECS` id and every catalog action is either server-side or in an explicit
`CLIENT_ONLY` allowlist with a one-line reason. Wire as `verify:arcparity`. Accept: passes on
main pinning exactly 13 client-only actions; a synthetic drift fails naming the action.

**1.5 Worker spend-guard assertion** (0.5s). Prove (and where missing, add) that every
worker-side `complete()` path — standing-worker's episode/idea/discover/board-copy calls today,
the ports tomorrow — is gated by `checkCredits`/`spendCredits` with a verify case showing a
`SpendCapError` parks the arc step instead of retrying. Hard dependency of SW6. Accept: verify
case green; grep inventory of worker `complete()` call sites is covered 100%.

**1.6 Delete the dead fork** (0.5s). Remove `supabase/functions/generate-app/` (unreachable —
`startGeneration` routes everything to `chunkedGenerate`), drop it from deploy scripts and
`healthRun.ts` FUNCTIONS, remove `@codesandbox/sandpack-react`. PR body carries the manual
`supabase functions delete generate-app` step. Accept: greps return nothing (except the
reworded historical comment); `npm ci && tsc && build` green.

**1.7 One dependency registry, pinned everywhere** (1s). `_shared/depRegistry.ts` — canonical
name→pinned-version map, re-exported client-side; derive `qa.ts` ALLOWED_TS from it, assert
`scaffold.ts` matches in the verify, read PreviewPane pins from it, make `reconcilePackageJson`
inject the registry pin (unknown packages still get `latest` + a visible log line naming the
unpinned package). Accept: `verify:depregistry` fails on any drift (proven by a temporary
edit); a generated app importing framer-motion gets the registry pin.

**1.8 QUALITY_BAR becomes law** (1s, app_0141). `_shared/qualityCore.ts` (`QUALITY_BAR = 8`,
`holdsBar`, null = not-proven), client re-export + verify; replace the literal in
`board-copy/index.ts:109`; `copy_quality_events` table (owner RLS) with a best-effort insert
that can never block the response. Accept: no literal-8 threshold greps in board-copy;
shadow-DB applies; a run inserts an event row.

---

## SW2 — The clock stops rotting; the brain gets fed (~7 sessions)

**2.1 Standing-order failure breaker + dead-letter lane** (1s, app_0139). Mirror the app_0113
trigger breaker onto `standing_orders`: consecutive_failures/last_error columns; 5 consecutive
`unreachable` results pause the order with a mind_event + notify; Automations shows a
dead-letter strip with one-click Resume. Accept: an unreachable hunt pauses after 5 ticks with
the error visible; Resume re-arms; shadow-DB green.

**2.2 Approval expiry, part 1: stamp + countdown only** (1s, app_0140). Stamp per-kind TTLs at
enqueue (`execution.ts` + worker-side minters); render time-remaining on Queue cards; add
`reminded_at`. The expiry SWEEP does NOT ship here — flipping rows to `expired` while the
operator has no off-app nudge channel would regress the away-from-app case; the sweep lands
with the nudge in SW5.3. Accept: countdowns render; nothing expires yet; CAS paths untouched.

**2.3 Feed the brain: full-context front door with cached prefix** (1s). Raise the starvation
caps: MIND_BUDGET 2500→6000, MAX_TOKENS 1000→2000, BRAIN_WINDOW 6→16 (parameterize
`buildCommanderUser`), retrieval snippets 220→400 chars and k 5→8. Restructure the commander
call so the stable prefix (system + identity/beliefs) rides the cached position — `rawComplete`
and `_shared/ai.ts complete()` already send cache_control blocks; volatile content stays in the
user turn so the prefix keeps matching. Retrieval snippets originating from URL-sourced
documents route through the quarantine once SW4.2 lands (cross-dependency noted there).
Accept: verify:thread/commander assert new windows; a dev-logged ask shows the full block;
second consecutive ask shows cache READS in the usage recorder.

**2.4 Frontier brain tier behind the spend guard** (1s). `brainModelForPlan()` beside
`modelForPlan()` in `_shared/ai.ts`, resolving judgment-path calls to `AI_BRAIN_MODEL` (unset =
today's behavior, byte-identical); adopt in the two judgment chokepoints (`cluster-chat`,
`garvis-brain`). Free plans stay on the fast tier; every call remains behind
checkCredits/spendCredits. Accept: unset → identical; set → usage_events logs the brain model
for brain calls only; kill switch blocks both with the named message.

**2.5 Nightly embedding sweep** (1s, app_0142). `embed-sweep` edge fn: per owner, left-join
artifacts/documents against embeddings, embed the missing in batches, run the
`match_embeddings` neighbor pass at the same ≥0.5 threshold ingest-document uses, file
`connection` insights. Nightly cron via the app_0088 pattern; idempotent; honest skip when
embeddings unconfigured. Accept: second run embeds 0; two worlds sharing material grow a
cross-world filament; shadow-DB green.

**2.6 One revenue room** (1s). Fold ClientBilling into Money as tabs (the Memory.tsx merge
pattern); `/garvis/client-billing` keeps resolving; nav shows one Money door. Accept: routes
e2e green; one door; build green.

**2.7 Knowledge doors close honestly** (1s). `/garvis/mind` + `/garvis/brain` become redirects
into Memory's tabs (delete the dead shells); `/garvis` (orphan dashboard) redirects to
`/garvis/command` after confirming each panel is reachable elsewhere — relocate any that
isn't (merge and relocate, never amputate). Accept: no blank flashes; route count drops ≥2;
no in-app link targets retired routes.

---

## SW3 — Verified builds, verified edits (~7 sessions)

**3.1 Honest verification states** (2s). Pure `verification.ts` core: `compiled` /
`compile_failed(n)` / `static_only(reason)` / `unverified`. Fix the conflation where
`tsErrors===null` renders "clean"; `generationCompileGate` returns `{ran, errors, reason}`;
persist level+reason on `project_generations` and the summary message; badge in chat +
PreviewPane. Degraded states name the setup step. Freeze state names in the verify suite first
— three items depend on them. Accept: preview-closed generation says "static checks only — open
the preview to compile-verify", never "clean".

**3.2 Stage-then-commit agentic edits** (2s). Writes accumulate in the in-memory overlay and
sync to the live preview, but the DB commit happens once, after the final gate: pass → upsert;
fail → the overlay becomes a PendingEdit diff card with the named failure and an "apply anyway"
choice. Generation-time verify keeps direct writes; branch turns keep copy-on-write. The
overlay→preview sync lands in the same PR as the commit deferral (the "watch it build" feel
must not regress). Accept: a forced failing edit leaves `project_files` untouched with the
pending diff shown; passing edits land as before.

**3.3 Render probe: route-walk builds AND post-edit routes** (2s). After the compile gate:
extract routes from the saved App.tsx (pure core), drive the preview iframe via a new
`navigate` command on the existing shim protocol (both runtimes), judge each route's
PreviewSnapshot (uncaught error, empty DOM, console errors). Failures feed agentic repair; the
verdict joins the badge ("compiled + 6/6 routes render"). Per the completeness review: after
every *edit* gate passes, judge at least the current route's snapshot too — otherwise an edit
regression lands wearing a "compiled" badge. Respect the single-WebContainer token guards.
Accept: a planted runtime throw is named by route and repaired; an edit that breaks the open
route downgrades the badge.

**3.4 Provider honesty: compile-gate the classic edit path** (1s). Decision: no OpenAI
tool-loop (permanent double-maintenance of the spine for a path the operator doesn't use).
Instead: classic-path edits get `deepTypecheck` + the same badge; on failure one `qaFixPass`,
then the named residual. Settings' provider cards state plainly which capabilities are
Anthropic-only. Accept: a type-error edit on a non-Anthropic provider ends "compile_failed: N
errors", never silence.

---

## SW4 — Reachable, and safe to reach (~7 sessions)

**4.1 Intention Router v1: postures in the commander** (1s — pulled ahead of everything that
consumes the commander contract). Add `posture: think|create|execute|observe` to the Command
union; COMMANDER_SYSTEM classifies; `parseCommand` tolerant (missing posture defaults by kind).
Zero behavior change; the dock's transient status line may name it. This is the contract the
inversion, Text-Garvis, and the Field all re-test — it lands FIRST so they land once. Accept:
verify:commander asserts posture resolution with and without the model supplying one; e2e
untouched.

**4.2 Injection quarantine for all external text reaching prompts** (2s).
`_shared/untrustedText.ts` (+ client re-export): `quarantineExternal` strips/flags
instruction-shaped content, wraps the remainder in fenced UNTRUSTED delimiters with a
data-not-instructions preamble, caps length. Apply at: watch_url decide path, hunt extraction
blocks, fetch-url output, `ask.ts` retrieval snippets from URL-sourced documents, and the
consolidation/briefing row inputs (reply subjects/excerpts). A quarantine hit surfaces as a
named flag ("page contained instruction-like content — reviewed as data only"), never a silent
drop — over-flagging legit RFPs must degrade to honesty lines, not lost opportunities. Accept:
verify corpus (ignore-previous, tool-call JSON, role markers) neutralized while a clean RFP
passes; `opportunityHunt.verify.ts` untouched and green.

**4.3 The Garvis Line: bind your number** (2s, app_0143). `garvis_line` table (owner-unique,
phone-unique, code hash, expiry, attempt counters, `proactive_enabled` default false); pure
core (binding state machine, code expiry, attempt limits) + verify; `garvis-line` edge fn
(start → 6-digit code via Twilio, confirm → verified_at); a "Text Garvis" disclosure in
Settings — closed by default, no new page, no new primary button. Accept: binding an unverified
number impossible by construction; lockout after N wrong codes; unconfigured Twilio names the
setup step.

**4.4 Text Garvis, Garvis answers** (2s). In `sms-inbound`, after STOP/START: a
signature-validated message from a VERIFIED bound number routes into the commander server-side
(same edge-imports-src pattern send-sms uses). STRICT read-only, enforced in a pure core
(`smsConcierge.ts` + verify): only Command kind `reply` answers; mission/act/build/open/explore
degrade to a sentence naming what Garvis WOULD do plus "open the app to run it"; no approval
is ever created, decided, or executable by text. Per the doctrine review: inbound bodies pass
through `quarantineExternal` before the commander call (dep: 4.2); both turns land in
`command_messages` stamped with channel provenance (`sms`) so replayed history carries its
origin; the commander call is metered (checkCredits/spendCredits kind `garvis`, out-of-credits
degrades to a fixed no-model reply); per-number hourly cap; unbound senders keep today's
behavior. Accept: verify proves every non-reply kind degrades + injection-corpus bodies are
neutralized + unbound senders never get a reply; a texted question round-trips onto
`/garvis/command`; STOP short-circuits before any brain call.

---

## SW5 — The owner is never in the dark (~5.5 sessions)

**5.1 Unified nudge ledger + email fallback + expiry sweep ON** (2s, app_0146). One design for
"one observation, notified once": `proactive_spoken` (owner+key+channel unique) as the
server-authoritative ledger; `notifyOwner(admin, ownerId, text)` — webhook when set, else
plain email to the operator's own `profiles.email` via Resend (self-notification, strictly
owner-addressed, therefore not queue-routed; anything else WOULD be an approval-spine
violation); migrate the worker/cron `notifyText` call sites; the approval half-life reminder
rung consults the ledger; Health names the no-channel gap. With the nudge live, enable the
SW2.2 expiry sweep: CAS-flip overdue pending rows to `expired` with a mind_event naming what
lapsed + an honest expired lane in History. Accept: webhook-less operator gets exactly one
email per aged approval (ledger row proves dedupe); expired rows never execute afterward;
with neither channel, Health says so.

**5.2 Garvis texts first** (1.5s). Extend `garvis-pulse`: gather ProactiveFacts per owner, run
`observe`/`pickToSay` unchanged, text the top line to the verified number — only when
`proactive_enabled`, outside quiet hours, never to an unsubscribed number, deduped through
`proactive_spoken` (channel `sms`). Sent lines land as garvis turns in `command_messages`
(provenance-stamped). Aged-approval nudges come free — already the top-priority Observation;
the email rung and SMS line share the ledger so one observation cannot double-fire on one
channel (cross-channel delivery is an explicit operator choice, not an accident). Accept: a
forced pulse with a 3-day approval sends exactly one text, rerun sends zero; quiet night sends
nothing; toggle off stops sends.

**5.3 Ship→market seam** (0.5s). A deployed site currently triggers nothing. On a successful
`deploy_site` execution, write a mind_event that the existing nextMove collectors surface as
the natural next move ("site is live — point a channel at it"), linking the world's marketing
surface. A few hours of glue, high leverage. Accept: a deploy produces exactly one next-move
card naming the live site; no new page.

**5.4 Security-review lane** (1s). `security-review.yml` with the claude-code-security-review
action, comments-only, path-filtered to send-path/money/auth/migration surfaces; same-repo PRs
only. Accept: UI-only PR doesn't trigger; a send-email PR does; never fails the check.

**5.5 Findings ledger + reviewGate core (measure before gating)** (1s).
`docs/reviews/ai-review-ledger.md` (one row per AI finding: lane, rule, severity, kept/dropped)
with flip criteria pre-registered in the header (≥4 weeks, ≥60% high-severity precision).
`scripts/reviewGate.ts` pure core parsing the severity JSON (fail only on CONFIRMED
high-severity on protected paths; malformed JSON fails safe-open with a named message), wired
as `verify:reviewgate`, run in report mode by ai-review.yml. Accept: verify green; the gate
verdict shows in the PR comment without affecting mergeability.

---

## SW6 — The worker takes the creative load (~6 sessions, strictly serial on standing-worker)

Deps for all three: 1.4 (parity verify), 1.5 (spend-guard assertion). All outcomes remain
drafts/needs_review — porting moves WORK server-side, never approval.

**6.1 Port the seven mechanical creative actions** (2s). `queue_social_post`, `email_segment`
(insert + pending approval via the existing shared cores), `point_channel_cta`,
`start_app_marketing`, `draft_episode` (reuse the worker's episode path), and
`build_app`/`template_document` as honest parked handoffs carrying their links ("waiting for
your visit" only where a browser is genuinely required). Allowlist 13→6. Accept: an approved
arc with social+segment steps advances overnight to pending approvals; nothing sent.

**6.2 Port the producer trio** (2s). `research_market`, `business_plan`, `marketing_campaign`
via the worker's `complete()` + the pure producer cores (grounded research, red-teamed plan,
campaign drafts) with the honesty seams intact and spend guard proven (1.5). Acceptance
includes a defined field-level comparison against the client path's artifact shape (not
"spot-compare"): same keys, same grounding markers, cited sources present. Allowlist 6→3.

**6.3 Port the genesis actions** (2s). `found_company`, `onboard_client`, `launch_vertical`
composites mirroring the client executors; every outcome a reviewable draft; failures park via
WaitingError. Allowlist → build_app + template_document only (honest browser-required
handoffs), and the verify pins it there. The area's "zero parked blockedOnCreative" claim is
scoped to server-executable work — the two handoffs park by design and say so. Accept: a
"found a company + research it" arc completes to a reviewable draft by morning.

---

## SW7 — Money closes; the mind starts predicting (~6.5 sessions)

**7.1 Stripe payment links + webhook auto-reconciliation** (2s, app_0145). Payment Link
creation (`invoice-payment-link` fn, metadata.invoice_id) behind one Money button (hand-paste
stays as fallback; unconfigured Stripe names the setup step). Webhook: per the doctrine review,
the event discrimination is a PURE CORE — `_shared/stripeRouteCore.ts` (session →
`invoice | client_sale | saas | ignore`) with a verify covering metadata.invoice_id present /
uuid client_reference_id / both / neither — consumed by `stripe-webhook`, invoice branch
checked BEFORE client_reference_id. Mark-paid server-side (draft/sent→paid, paid_via stripe),
cancel pending chase approvals, PAID mind_event. Accept: test-mode pay flips the invoice
without UI touch and auto-rejects the chase; a Pro checkout still syncs (regression);
verify:striperoute green.

**7.2 Automatic prediction producer + hit-rate surfacing** (2s). Pure `prediction.ts`:
executed outbound action + optional measured channel facts → falsifiable prediction row
(measured base-rate when rows exist, labeled heuristic otherwise, never invented); closure
judges an elapsed window against real reply/lead counts. Producer wired into the send-email
executor as FIRE-AND-FORGET after the send is recorded (the house `.then(()=>{},()=>{})`
pattern — a throwing producer must never change a send outcome; verify asserts it). Closer in
`garvis-consolidate`. `decisionHitRate` becomes one briefing line at ≥5 closed. Accept: an
approved send opens a decision; a window-elapsed consolidation closes it; briefing shows
"Predictions: N of M hit" only at ≥5.

**7.3 Nightly consolidation + auto evidence linking** (1s, app_0144). Recadence weekly→nightly
03:00 (MIN_EVENTS=15 keeps quiet owners free — verify that claim with a seeded quiet owner);
extend the prompt to nominate which active beliefs the events support/contradict with verbatim
subjects; a pure matcher verifies citations against real fetched events before `attachEvidence`
— unverifiable citations dropped, never guessed. Accept: fabricated subject → no link; seeded
owner gains links in one run; skippedThin works.

**7.4 Cross-model second opinion: pre-registered Codex trial** (0.5s). Protocol doc only:
scoped to security-lane paths, operator-invoked, advisory, every finding into the ledger with
unique/duplicate + kept/dropped; kill criteria dated before the first run (1 month: ≥1 unique
confirmed finding per ~10 reviews AND ≥30% precision, else drop); ~$5/month cap. Rationale
recorded: reviewers barely overlap (93% unique findings) but the one controlled study says this
direction can hurt — so it earns its keep or dies.

**7.5 Monthly deep-review cadence** (1s). Cadence doc (targets: execution spine end-to-end,
payloadHash both sides, autonomyGate/cronGate, stripe-webhook, RLS in new migrations
cross-checked against the shadow-DB isolation script) + run the FIRST deep review and file its
findings as the inaugural dated entry. Fixes land as separately-estimated follow-ups — fix
scope on the money spine is unbounded by definition and does not fit inside this session.

---

## SW8 — The brain takes the front door (~8 sessions)

**8.1 Model-first routing inversion at the dock** (2s — TIME-GATED, see global rule 3).
> **PARKED 2026-08-16 (SW8 execution):** the rule-3 gate is unmet — SW2's feed-the-brain items
> are merged but not deployed, so zero production `usage_events` exist and none of the
> pre-registered numbers (cache-read share ≥40%, p50 ≤3.5s, spend headroom ≥30%) can be cited.
> Builds only after ≥1 week of real usage post-deploy. Wave position alone never triggers this.

Invert
the tier walk: only exact/verbatim deterministic claims keep their pre-brain position (command
prefix, learned aliases, brief capture, follow-up memory, go-back, small-talk halts, briefing
greetings, exact stat matches); fuzzy resolve() tiers demote to AFTER `askCommander`; the regex
ladder becomes the fail-soft floor (no AI key → today's behavior, exercised in verify).
Re-classify gauntlet cases deliberately in the same PR — verbatim stays deterministic,
paraphrases assert brain-first. Accept: concierge/dockbrain/orchestratorCases/fuzz all green
with new ordering assertions; authed-mock e2e passes; the pre-registered latency/cost numbers
from rule 3 are cited in the PR body from real `usage_events`.

**8.2 The overnight read: grounded briefing synthesis** (2s). One metered model call per
owner-morning, only when real activity exists: same real rows + compiled mind context + open
questions → a 2-3 sentence read connecting facts, stored on the brief, spoken by the dock's
briefing tier. Deterministic counts remain the spine — verify asserts the narrative is additive
and optional, counts never come from the model, synthesis failure degrades to the deterministic
brief, quiet night → no call and no send. Consolidation/briefing inputs ride the quarantine
(4.2). Accept: every referenced fact traces to a real row; credits exhausted → brief minus the
read.

**8.3 Approval risk classifier that only ever adds review** (2s, app_0147). Pure
`approvalRisk.ts` scoring from deterministic features only (kind, amounts,
never-contacted-before recipient, payload anomaly vs class history, off-hours minting) →
`{score, reasons[]}`; worker annotates pending rows; Queue renders the chip with named reasons.
Wired into `autonomyGate`: high risk forces MANUAL — the classifier can only block earned
autonomy, never grant; absence/error fails closed to manual. Verify pins monotonicity (adding
a risk feature never lowers the score) and can-only-block. Accept: an auto-mode chase to a
brand-new recipient stays manual with the reason on the card.

**8.4 Speak-while-thinking: chunked TTS + barge-in** (2s). Pure `speech.ts` (sentence chunker
under the speak cap, queue ordering, generation-token contract so a stale fetch never plays
over a new turn) + `speakRun.ts` as a sequential queue (sentence 1 immediately, prefetch rest,
per-sentence cache keys); barge-in: first keystroke or mic activation stops and cancels;
speak the commander's preface the moment it returns. Browser-voice fallback keeps working
keyless; confirm the speak fn meters per character. Accept: 3-sentence answer starts in ~one
sentence's latency; typing mid-speech silences instantly.

---

## SW9 — Strategy, self-testing, and the scorecard (~9 sessions)

**9.1 Strategies spine: table + pure core** (2s, app_0148). The anticipation design's one new
table (its critic-fatal prerequisite — the chartered-cluster guard — already shipped in
`universe.ts`): strategies rows (mission link, rationale, evidence jsonb, basis
measured|heuristic, proposed→adopted→retired) + pure parse/validate core with the grounding
gate (uncited measured claim → relabeled heuristic; hostile JSON → `[]`, never a throw), in
the fuzz suite. Accept: shadow-DB applies twice; fuzz never throws or leaks an off-list status.

**9.2 Propose-strategies engine + world disclosure** (2s). Edge fn: objective + world context +
brain retrieval + adaptive channelFacts → 2-4 grounded strategies stored proposed;
credits-gated, frontier tier. Surface: a thin Strategies disclosure in the world page's chip
strip — closed by default, zero-input value, adopt/retire only shapes nextMove/briefing inputs;
nothing sends; NO new orange button. Accept: measured claims quote real rows verbatim; bare
world yields labeled heuristics; one primary action preserved; growth e2e green.

**9.3 Shared generation driver + nightly real-output CI probe** (3s). Per the sequencing
review, the off-browser generation pipeline gets built ONCE: extract the driver orchestration
(manifest derivation, page fan-out, QA heal, stage marking) from `aiClient.ts` into a
runtime-neutral `_shared` core; `scripts/headless-generate.mjs` consumes it to generate a real
app in CI (Anthropic key from secrets); pipe the output dir into the existing
generated-app-probe. Nightly cron + workflow_dispatch, never a required push check; failure
uploads the log and files/updates a tracking issue. SW10's server-side resume consumes the
same core. Accept: dispatch run generates, builds, and Chromium-probes a real app end-to-end;
a sabotaged prompt fixture fails the job and files the issue.

**9.4 Builder/autonomy scorecard** (1s). The definitions' headline metrics stop being
unfalsifiable: a pure core computing first-forge success (compiles AND route-walks clean on
first try) and verification-badge coverage from `project_generations`, plus the
execution-ledger orphan audit (every external `execution_runs` row traces to an approval or an
autonomy grant; unattended actions per night). Surfaced on Health or the weekly scorecard.
Accept: numbers render from real rows (a fresh account shows honest zeroes); a seeded orphan
row is flagged.

**9.5 Authed route sweep: zero-input value as a regression test** (1s). Extract the
authed-mock harness into a shared helper; sweep EVERY authed route with empty-data mocks
asserting: no non-benign console error, a rendered heading/main landmark (zero-input value as
a test), no raw-plumbing text ("undefined", "[object Object]"). Accept: a module-scope throw
in one lazy route fails exactly that route by name; runs in the ci.yml e2e job.

**9.6 see_preview: the agent looks at what it built** (1s). New agent tool returning the live
PreviewSnapshot + a screenshot image block (labeled approximate — html2canvas); `loop.ts`
learns image-bearing tool results; honest degrade with no preview; prompt nudge to
self-critique UI changes against the blueprint's design spec. Accept: activity feed shows
"Looking at the preview"; closed preview → honest degrade string.

**9.7 Runtime QA scanners over the rendered preview** (2s). Wake the ~2,100 idle lines: shim
reports a capped serialized HTML snapshot; a thin pure adapter runs
renderQa/a11yScan/mobileScan over captured HTML per route during the render probe;
error-severity findings feed repair, the rest a collapsed "runtime QA" disclosure. Accept: a
planted contrast/label defect surfaces; the three scanner suites untouched and green.

---

## SW10 — Ship, mail, resume, and the Field (~13 sessions)

**10.1 ship_repo: GitHub export through the approval spine** (2s, app_0149). New approval kind
(enum ALTER alone in its file); `requestRepoShip` captures {project_id, repo, files_hash} with
the snapshot in `deploy_bundles`; `approveAndExecute` routes to `github-export`, reworked to
load EVERYTHING from the approved row with `payloadMatches` re-verification + ledger row. Per
the doctrine review, closing the old door is part of the item: invoking github-export with a
raw {files, repo} body and no approval_id returns 4xx; the request-body githubToken
passthrough is REMOVED (token resolved server-side at execution time); grep proves
ProjectWorkspace no longer calls it directly. Accept: all of the above + tamper → 409;
reject → nothing pushed.

**10.2 Lob direct mail, part 1: verification rail** (2s split: migration+`lob-verify` fn /
farm+UI, app_0150). Recipient verify columns, mail_batches/mail_pieces (per-household
qr_token), `mail_enabled` fail-closed settings; `lob-verify` calls Lob US verifications
throttled, writing status honestly (errors leave `unverified`, never guessed). Per the
doctrine review: the Verify control shows "N lookups × $unit ≈ $X" BEFORE running and
`lob-verify` enforces a per-run row cap — no un-ceilinged third-party spend button.
`farm.ts partitionMailable` gains the lobDrop suppression + verify cases; PeopleSheet shows
verified/undeliverable/unverified counts.

**10.3 Lob part 2: send_mail approval + drop staging** (1s, app_0151). `send_mail` kind;
`lobRun.requestMailDrop` partitions, estimates with real farmMath, snapshots batch+pieces,
enqueues ONE approval binding `est_total_usd` as the hard ceiling; `_shared/lobCore.ts`
compiles MailerSpec → Lob HTML honoring the existing 6.25×9.25 bleed geometry, refusing while
any `[EDIT:]` hole remains (verify proves both). Queue card shows cost + suppression breakdown.
Nothing mails yet and the card says so.

**10.4 Lob part 3: executor + webhook + QR attribution** (3s split: `lob-send` executor /
`lob-webhook` + site-events). `lob-send` mirrors send-email gate-for-gate (kind/status/owner,
hash 409, kill switch, do-not-mail re-check, cost-ceiling refusal, per-piece CAS,
Idempotency-Key, ledger, drain+re-invoke); `lob-webhook` verifies HMAC constant-time, maps
events monotonically, marks returned-to-sender undeliverable; site-events accepts the piece
token so scans attribute to the exact household. Accept: test-mode approve → submitted pieces
with lob_ids; replayed webhook rejected; delivered never regresses; tampered payload 409;
a token visit attributes the lead.

**10.5 Server-side generation resume** (2s). New job kind in `job-worker` consuming the SW9.3
shared driver: re-derive the manifest from saved App.tsx, generate only missing pages,
static-QA heal, mark stages — finishing with the honest `static_only` state; the deep gate
upgrades the badge on next open (that mitigation must stay). Accept: kill a generation
mid-pages, invoke the job → all routed pages exist, honest state recorded, open upgrades.

**10.6 Stalled-build watchdog** (1s, app_0152). Cron finds `running` generations with no stage
progress for 10+ min and enqueues a resume job. Per the doctrine review: `resume_attempts`
capped at 2 with the row then flipped to a named "failed — needs your attention" state (no
infinite re-enqueue spend loop); the resume job explicitly rides checkCredits; the mind_event
is written at job COMPLETION — success says "resumed your build", failure says "tried; it
failed: <reason>" — never at enqueue (no fake progress). Accept: a permanently-failing
generation stops consuming credits after the cap; both mind_event variants covered.

**10.7 Email flows: behavioral segments + drip** (2s). The level-10 email path's two
high-leverage steps (its prerequisite, outreach_events, shipped long ago): behavioral segments
over real open/reply/click rows and composable 2-3 step drip flows, clock-executed through the
existing batch drain + approval spine. Subject A/B and the branded shell stay deferred (dated
in 1.1). Accept: a segment computed from real events; a drip whose step 2 only fires on real
non-reply; everything approval-gated.

**10.8 The Field, part 1: core + flagged route** (1.5s). Pure `field.ts` (worlds/arcs/
approvals → orb states: ember=working, warn=needs-you, green=news, dim=quiet) + verify mapping
every combination to exactly one state; `/garvis/field` behind an explicit door chip on
Command, rendering orbs + the approvals whisper from real state with zero input; honest empty
state on a fresh account. Shippable alone.

**10.9 The Field, part 2: the Line + postures + the morph** (1.5s). Mount the dock brain as
the centered Line; postures (4.1) drive the dressing; utterances land in the same
`command_messages` record. Per the completeness review, the morph must be provable: touching
an orb transitions to that world's existing surface with the Line persistent — the
two-destination claim is not checkable without it. One primary element (the Line).

**10.10 Field checkpoint** (0.5s — dated 4 weeks after 10.9). Promote the Field to the home
surface (retiring one existing home to a redirect) OR delete the flag. Recorded either way in
the docs ledger. The flag cannot outlive this decision.

> **DATED 2026-08-17 (SW10 execution):** 10.9 landed today, so this checkpoint is due
> **2026-09-14**. Decide from four weeks of real use of the door chip: promote or delete —
> the chip cannot outlive the decision.

**10.11 Cross-venture transfer engine (+ social joins the measured world)** (2s). Pure
`crossVenture.ts`: a channel measured working at honest sample in world A while world B runs
it silent/absent → one "transfer the play" recommendation carrying BOTH worlds' evidence,
inheriting MIN_SAMPLE discipline. Per the completeness review, first wire social into the
measured world: `social_posts` + `social_post_metrics` become a ChannelIn in
`resultsRun`/`adaptiveRun` (instrumented=false when metrics never synced) so social can ever
appear in a measured recommendation. Surfaced as at most ONE move via the existing
`measured_recommendation` kind. Accept: no recommendation below sample on either side;
single-world portfolios produce nothing; the seeded two-world case yields exactly one move
with both worlds' numbers.

**10.12 Mutation looking-glass + kill the survivors** (2s). Small mutation tool (pure operator
core + verify; impure runner that mutates a named core, runs its paired verify suite per
mutant, prints survivors — human-run, not CI). Then run it against the ACTUAL spine cores —
`src/lib/garvis/payloadHash.ts`, `supabase/functions/_shared/payloadHash.ts`,
`_shared/autonomyGate.ts`, `_shared/cronGate.ts` (the "automation/breaker" target named
earlier does not exist as a core file — corrected here) — and strengthen the paired suites
until every meaningful survivor dies, real before/after counts in the PR body.

**10.13 Flip the review gate** (0.5s — TIME-GATED, rule 3). Only after the ledger meets its
pre-registered criteria: reviewGate becomes a required check for protected-path PRs only;
override label honored and auto-logged; branch-protection commands in RUNBOOK. Everything else
stays advisory forever.

> **PARKED 2026-08-17 (SW10 execution):** the ledger criteria (≥4 weeks of runs, ≥60%
> precision — docs/reviews/ai-review-ledger.md) are unmet because no PRs have flowed yet; the
> clock starts when the branch deploys and PRs begin. Everything else in SW10 is built; this
> flip is the wave's only remaining line, and it flips on evidence, not on schedule.

**Optional spike (cuttable, 0.5s): wake word.** Continuous-listen toggle in the dock's voice
disclosure, on-device match, default off, persistent mic indicator, one commit to remove.
Chrome-only and network-backed — demoted from 2 sessions on the completeness review's verdict
that it is the weakest leverage in the plan. Build only if the SW8.4 voice loop leaves you
wanting it.

---

## Totals and cadence

~78 sessions across 10 sub-waves (6.5 / 7 / 7 / 7 / 5.5 / 6 / 6.5 / 8 / 9 / 13, + 0.5
optional). At a solo cadence of 5-6 sessions a week this is roughly 13-15 weeks. Every
sub-wave ends with the app shippable; sub-waves are the checkpoint unit, not waves. Nothing in
SW6+ starts before its SW1 safety rails (parity verify, spend-guard assertion) are green.

## How we know it worked (the anti-vibes section)

- **Builder:** first-forge success + badge coverage on the scorecard (9.4), trending >90%;
  nightly real-output probe green (9.3).
- **Intelligence:** the routing inversion's pre-registered latency/cost numbers held (8.1);
  "Predictions: N of M hit" visible and rising (7.2); filaments accruing nightly (2.5).
- **Execution:** the 9pm test — approve, sleep, wake to executed steps and reconciled
  payments; orphan audit shows zero un-approved external rows (9.4); allowlist pinned at 2
  honest handoffs (6.3).
- **Surface:** route count in App.tsx strictly down with zero lost URLs; the Field checkpoint
  decision recorded (10.10); a texted question answered on the record (4.4).
- **Verification:** the ledger's precision numbers, and a gate that only exists because they
  earned it (10.13).
