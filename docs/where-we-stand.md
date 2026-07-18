# Where We Stand — Full-System Capability Audit

July 2026. Seven deep audit passes across the entire system: builder pipeline, ship/monetize/
trust, product surface, marketing/outreach, research/explore/scraping, lists/contacts/leads, and
the learning loops. This is the honest map of the "everything builder" — app, marketing, design,
research, explore, scraping, lists, and gets-better-with-time — with maturity per pillar and the
system-level findings that cut across all of them.

Maturity legend: **A** real & wired (works, runs, closes its loop) · **B** real but manual ·
**C** scaffolding (one edge of the loop missing) · **D** stub/dead.

---

## Pillar scorecard

| Pillar | Grade | One-line verdict |
|---|---|---|
| **App building** | A− | Elite generation architecture + verified edits + branches/gated merge; undermined by a rotting duplicate pipeline, tab-bound orchestration, conditional verification, zero CI/e2e |
| **Ship (deploy/backend)** | A− | Real Netlify deploys, Supabase provisioning, edge-fn+cron backend deploys, GitHub export; no custom domains, stub buttons still in UI, ~12 secrets undocumented |
| **Email outreach** | A | Production-grade: approval spine, tamper checks, atomic claims, suppression fail-closed, RFC-8058 unsubscribe, warmup, reply classification, follow-up crons |
| **Prospecting funnel** | A− | Scrape → audit → demo site → pitch → claim → speed-to-lead loop is complete; daily client-hunt runs it unattended (when armed) |
| **Design** | B+ | Design-direction fan-out with committed token bundles + a checkable anti-slop rubric; but the agent can't SEE what it builds (no vision loop) |
| **Scraping/ingestion** | B+ | SSRF-hardened fetch, honest extraction, real pgvector document ingestion; no JS-rendered text, no rate-limiting, dark without ~5 keys |
| **Research** | B | Two engines that don't share: builder research (Anthropic web_search) evaporates into chat; world research (Serper) persists to knowledge; neither is multi-hop |
| **Explore** | B | Polished human-driven knowledge universe (clusters/galaxy/media); does nothing unattended |
| **Social** | B− | Real posting via Ayrshare behind the same approval spine — but no worker drain: 100% hands-on-keyboard |
| **Ads** | B− | Real Meta/Google integrations, deliberately read-only: sync + anomaly alerts, no management |
| **Lists/CRM** | C+ | Outbound half mature & autonomous; inbound half underbuilt: no lead scoring/routing, six unreconciled people tables, no tags/enrichment/export, no deal object |
| **Video/reels** | C/D | Shotstack storyboard-video real-but-manual; reel_jobs/reel_clips (Sora/Runway/Luma) = dead schema, zero code references |
| **Marketing brain** | C | 3-stage campaign generator with a real verifier — publishes into a web-intent/mailto dead end; never touches the real send/post rails |
| **Gets better with time** | C+ | Remembers more, does not yet learn better: corpus & events compound, judgment doesn't — every sharpening loop is manual or captured-but-never-fed-back |

---

## The three system-level findings

### 1. The brain is built, and it is switched off
Every unattended capability hangs off 9 pg_cron jobs armed by a one-time SQL call —
`garvis_arm_heartbeat()` — that is defined in migrations and **never called anywhere**. On top of
that, ~10-12 edge secrets (Resend, Serper, Places, Screenshot, Ayrshare, Shotstack, ads, worker/
cron secrets, embeddings key) are required for pillars to light up, none are in `.env.example`,
and nothing in-app shows which are set. The line between "real" and "aspirational" in this entire
system is drawn almost exactly by which secrets exist and whether one SQL line was run — and that
line is invisible. **Most of what was audited as "real & wired" is currently dark.**

### 2. The signature disease: built-but-not-connected
The same pattern appears in every pillar — a capability is built to a high standard on one side
and never wired to the thing that would make it matter:

- Marketing Worker generates full campaigns → "publishes" via `mailto:`/web-intent, never the
  real send/post rails in the same repo
- `draft_verdicts` measures kept-vs-rewritten drafts → displayed, never fed back into drafting
- `message_engagement` captures opens/clicks → read only by a report; the "opened 3×, no reply"
  trigger the migration itself names is never fired
- Builder research produces cited market analysis → lands in chat, never into the knowledge store
- `mind_events` spine exists for belief consolidation → beliefs are 100% hand-curated; no
  consolidation engine exists
- `reel_jobs`/`reel_clips` schema models a clip engine → the engine was never built
- `discovered_businesses` pool fills daily → no UI to browse/qualify it; no-email demos dead-end
- Agent-run failures are recorded as events → nothing reads them; agent runs have no retry
  (build jobs do)

Each connection is mostly glue code. Collectively they are the difference between a set of
impressive parts and a compounding system.

### 3. Three brains that don't share one memory
There are three separate context assemblers: the Commander gets the mind digest
(identity/beliefs/decisions/events), agent runs get approved knowledge, and the **builder gets
neither** (only its per-project brain files). Server-enqueued agent runs can get no knowledge at
all. Meanwhile semantic recall covers only artifacts + documents — lessons, beliefs, decisions,
and outcomes are never embeddable, so past judgment can't surface by meaning at decision time.
One shared `assembleContext(scope)` + wider embedding coverage would make every surface smarter
simultaneously.

---

## The path, in order

### Phase 0 — Turn it on and make "on" visible (days)
1. **Arm + health panel**: one screen showing every edge secret present/absent (each function
   already self-reports `{available:false}`), the 9 cron jobs scheduled-or-not (query `cron.job`),
   heartbeat freshness, and a guarded "arm" button that runs `garvis_arm_heartbeat()`. Fold in a
   Resend domain-verification check (the deliverability blind spot).
2. Document every secret in `.env.example` with which pillar it lights up.
3. Run the arm call. The system's unattended layer starts existing.

### Phase 1 — Protect the foundation (the builder trust items)
CI gate (typecheck + verify suites + 3 core e2e), auto-resume interrupted generations, honest
verification badges, retire the duplicate edge generation pipeline, retry/backoff for agent runs
(port the job-worker pattern). You vibe-code your own brain; this is the second operator.

### Phase 2 — Close the instrumented loops (compounding begins)
Highest learning-per-line-of-code, because capture already exists — only the feedback edge is
missing:
1. **Consolidation worker** on the heartbeat: read recent `mind_events` + closed decisions →
   *propose* beliefs with auto-linked evidence (human gate preserved) → flag stale/contradicted
   beliefs. The evidence-counting primitives already exist and are verified.
2. **Draft-verdict feedback**: inject per-topic rewrite-rates and kept-examples into drafting
   prompts.
3. **Engagement trigger**: fire a follow-up proposal on `open_count ≥ 3 ∧ no reply`.
4. **Persist research**: route builder research output through `ingest-document`/`embed-worker`
   so every research run becomes searchable knowledge.
5. **Unify context assembly** + embed `garvis_knowledge`/`mind_beliefs` so lessons surface by
   meaning everywhere — including in the builder.

### Phase 3 — Connect the amputated limbs
1. Marketing Worker assets → the real rails (email → queuePitch/batch; social → queueSocialPost),
   or delete it.
2. Social worker drain (add `x-worker-secret` to social-publish, mirror send-email's dual-caller
   pattern) — social gets the email treatment.
3. Lead scoring + aged/prioritized queue lane; a browse/qualify cockpit for
   `discovered_businesses`; contact/segment CSV export.
4. Headless-render fetch mode (rendered-DOM text for JS sites) + a shared fetch cache/rate
   limiter so the hunt scales safely.

### Phase 4 — Sharpen the agent (multiplies everything)
`edit_file` str-replace patches; `see_preview` vision self-critique against the design rubric;
`grep` tool; prompt-cache the agent loop; branch compare view; then the canvas.

---

## North-star metrics

- **Unattended hours**: time the heartbeat runs work without operator touch or silent failure.
- **Loops closed**: of the instrumented capture points (verdicts, engagement, failures,
  research, events→beliefs), how many feed behavior. Today: ~1 of 6.
- **Idea → live URL** time, and **first-forge success rate** (builder pillar).
- **Approval throughput**: proposals surfaced per week vs. acted on — the measure of whether the
  brain is generating real leverage or noise.

*Bottom line: the parts are unusually good — an A-grade builder, an A-grade email spine, a real
prospecting funnel, a real memory substrate. What's missing is current (the heartbeat is unarmed),
circuits (built things aren't connected), and consolidation (data doesn't become judgment). All
three are wiring problems, not invention problems — which is the best possible place to be.*
