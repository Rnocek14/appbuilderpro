# The Orchestrator — Garvis's Agency Layer

The organ that turns ANY spoken intent into populated reality. Before this, Garvis had
capabilities (genesis, plans, campaigns, standing orders, the builder) but no layer that maps an
arbitrary sentence onto all of them and composes the steps — one classifier routed chat into a
handful of modes and could reach ~10% of the machinery. The Orchestrator is that missing layer,
and growing it IS growing Garvis.

## Architecture (v1, shipped)

Three files, same religion as genesis (pure core + verified gauntlet + impure run + approval):

- **`orchestrator.ts`** (pure, 17-check verify): the action-spec vocabulary, the compiler system
  prompt, and the **parse gauntlet** — the trust boundary between the model's proposal and real
  execution. Unknown actions dropped (never improvised), why-less steps dropped, unknown params
  stripped, missing required params demoted to questions (never invented), ≤12 steps, dependency
  ordering with cycle fallback. Honesty is structural: `holes` (what the intent asked for that no
  action covers) and `questions` (what it needs from the operator) are first-class plan fields.
- **`actionRegistry.ts`**: the executable catalog. Rule: *if a human can click it, the brain can
  propose it — and nothing else.* Every action wraps machinery that already works, declares its
  risk class (safe / uses-credits / can-send), and returns **outcome language** (what now exists:
  a draft to review, an order armed, a handoff link) — never promises. v1 catalog: found_company,
  research_market, business_plan, marketing_campaign, watch_page, cadence_digest, build_app,
  record_thesis, check_master_switch.
- **`orchestratorRun.ts`** + **`/garvis/orchestrate`**: compile (one credit-metered call through
  the cluster-chat chokepoint) → review card (every step's why, risk, produces; amber holes;
  questions) → approve → sequential dependency-aware execution with live statuses. Failed steps
  never revert completed work; dependents are skipped with the reason. Every compile and run
  lands a mind_event (the consolidation loop learns from orchestration history).

Two-tier consent: plan approval is *structural* consent; outbound machinery (sends, posts) still
creates its own approvals downstream. The Orchestrator can never bypass the spine.

## How this becomes "full Garvis" — the growth path

Every engine on the roadmap lands as *registry actions*, which means every new engine is
immediately reachable from one spoken sentence:

1. **Depth Engine** → upgrade `research_market`/`business_plan` into the multi-pass pipeline
   (research → strategy → adversarial critique → refine, persisted), and the compiler starts
   ordering research before every plan automatically.
2. **Client engagement** → `onboard_client` (a world flagged "operated for a client" with intake,
   scope, assets), so "add Jane the realtor, I'm doing her marketing" compiles to: onboard →
   import assets → depth-plan → campaign → watches.
3. **Paperwork Engine** → `template_document` (upload sample → field extraction → reusable
   template) and `docusign_flow` (trigger → fill → send for signature → track), riding the
   existing docusign-send/webhook rail.
4. **Opportunity Engine** → `standing_search` (JS-capable scheduled search + structured
   opportunities extraction) and `draft_application` (per-opportunity tailored document with
   selected portfolio images), reusing the proven client_hunt shape.
5. **Counsel loop** → recommendations from reflection/next-move become *installable*: each one is
   a pre-filled plan the operator approves — the system proposes additions AND assembles them.

## v1 honesty (what this is not yet)

- Plans live in memory during a session (mind_events record them; no plans table yet — add one
  when re-run/resume of long plans matters).
- The compiler is reachable from /garvis/orchestrate; Commander chat integration (a
  `draft_orchestration` act-tool returning the review link, like draft_world) is the next wire.
- The catalog is 9 actions; the walkthrough audits (docs/where-we-stand.md, the turnkey trace)
  enumerate exactly which engines add the next ones. A hole shown amber today is a registry entry
  tomorrow — that is the design.
