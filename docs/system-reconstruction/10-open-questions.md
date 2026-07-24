# 10 — Open Questions, Conflicts, and Ambiguities

*Part of the system-reconstruction series. Where two sources disagree, both are documented here
with the conflict explained. Where the record is simply silent, the question is stated so a new
team knows it is unanswered rather than answered somewhere they haven't looked.*

---

## A. Conflicts between planning documents (vision-level)

1. **What is "the noun" — Missions or Worlds?**
   `garvis-first-principles.md` is unambiguous: "NOUNS: Missions. Nothing else." The later
   `os-blueprint.md` resolves the opposite way: "**Worlds are the things you run — the orbs.**
   Missions/arcs are the live work moving *through* a world." Both documents are deliberate,
   reasoned, and mutually exclusive as stated. The blueprint is newer (July 23) and grounded in
   the verified data model (worlds exist and accumulate; missions are an "overloaded run-log"),
   so the blueprint's resolution should be treated as current intent — but the first-principles
   UX (orbs = missions on the Field) was never rewritten against it. A new team implementing the
   Field must decide which rows the orbs enumerate. (The blueprint says worlds; the mockup's orbs
   are labeled like missions.)

2. **Radical UI reduction vs. accretion-with-aliases.** First-principles: "The sidebar.
   Entirely. [disappears]" vs the shipped reality of a 30-item nav with a Core-loop/"More" split
   and seven "(legacy)" rooms kept alive, and os-blueprint's Phase 5 rule that subtraction comes
   only after supersession. These are contradictory philosophies with a documented
   reconciliation: safety ("everything is clickable… nothing ever made becomes unreachable")
   won the adversarial round. But the tension re-appears in every doc.

3. **Cinema vs. substance.** The universe-visual-design and design-scan docs invest heavily in
   the 3D sky (grading it 5.5/10 against astronomy references); os-blueprint rules "Not chasing
   the full cinematic mockup first… Substance before cinema." Both survive in the repo; the 3D
   scene is shipped and linked, so "substance first" governs *future* effort, not removal.

4. **SaaS vs. personal OS vs. agency-in-a-box.** Three commercial postures coexist: FableForge
   SaaS billing (Free/Pro, pricing pages — early era), the personal-OS lens ("the bar is 'does
   this multiply me'"), and the agency business ($1,500 sites / $500-mo automations,
   client-billing-setup.md). best-software-plan.md explicitly deprioritizes the SaaS posture but
   keeps its machinery ("the credits engine meters *client* apps"). The $19-vs-$49 pricing-page
   contradiction is acknowledged and left unresolved ("only matters if FableForge is ever sold
   as SaaS").

5. **Fabricated footage.** garvis-video-pillar.md: "never a fabricated frame" (shoot directions
   instead). garvis-level-10.md plans **disclosed AI b-roll**. The AI-provenance disclosure
   spine (commit abc0e57) suggests the synthesis — AI media allowed when disclosed — but no doc
   states the reconciliation explicitly.

6. **Direct mail.** The shipped campaign composer makes print-it-yourself postcards "by
   design"; level-10 specs a Lob print-vendor integration. Deliberate sequencing, but the
   "decide, don't drift" list still carries it as an open decision.

## B. Code-level ambiguities (the author's own unresolved seams)

7. **`apps` vs `knowledge_worlds`** — two unlinked "which venture" pointers with no FK between
   them; older intelligence tables (mind_events, goals, knowledge, missions) key on `app_id`,
   all new surfaces on `world_id`. The blueprint *forces* a decision (fold apps under worlds)
   that had not been executed by the snapshot.

8. **Two mission writers.** `useMissions.planMission` (tasks, no world) vs `workwebRun.runPlay`
   (world, no tasks) — incompatible lifecycles behind one table. Phase 3 work; not done.

9. **Two decomposition vocabularies.** 5 mission WorkerKinds vs 21 orchestrator actions vs 25
   chat tools — three overlapping "what can be done" registries. `workerParity.verify.ts`
   guards one seam but is among the ~6 verify files never wired to CI.

10. **`send_sms` in the approval enum — RESOLVED: the bug is REAL and still present.** Verified
    during this reconstruction: `approval_kind` is created in `app_0022_execution.sql:17–21`
    with seven values and later gains only `send_batch` (app_0064), `send_for_signature`
    (app_0065), and `content_week` (app_0088). **No migration ever adds `'send_sms'`.** Yet
    `send-sms/index.ts:36` requires `approval.kind === 'send_sms'` and
    `execution.ts:13` includes it in the client type. Any insert of an approval with
    `kind='send_sms'` fails at the DB, so the approval-gated SMS path is dead at the enum layer
    exactly as os-blueprint claimed (its Phase 0 lists the one-line fix). The SMS verify suites
    (#63–#66) test pure cores and never touch a live enum, which is how it shipped.

11. **Cron-job count drift.** RUNBOOK says 9 · go-live checklist says 12 · SQL truth is 11 ·
    os-blueprint says 12 · full-system-scan says "10 armed (should be 11)". The count changed
    era by era and the docs were not all updated. `verify:migrations` pins the SQL truth; treat
    11 as current.

12. **Numbers drift across audit docs generally.** 43 vs 40 vs ~50 pages; 55 vs 56 vs 67–70 edge
    functions; 90 vs 94 vs 96 vs 116 verify suites; 29-table vs 97-table vs ~124-table data
    model (different counting scopes: spine-only vs all-public). Each document froze the truth
    of its week during a 37-day sprint. This reconstruction's counts (02/04/13) are from the
    final snapshot and should supersede.

## C. Risks and oddities found by this reconstruction (not in any author doc)

13. **`/dev/flagship-artist` ships ungated to production, unauthenticated** (App.tsx:167) — a
    bespoke client scroll-site with real media in `public/flagship/`. Every other /dev/* page is
    `import.meta.env.DEV`-gated. Intent unknown: demo link for a real artist client, or an
    oversight.
14. **`supabase/seed.sql` seeds tables that don't exist** (LearnFlow courses/lessons/quizzes) —
    a generated-app artifact that leaked into the platform repo. Harmless but confusing.
15. **`Billing.tsx` still reads the superseded `subscriptions` table** while the webhook writes
    canonical `stripe_subscriptions` — plan display may not reflect reality on that page.
16. **os-blueprint calls `Universe.tsx` "dead… imported by no route"** but it is actually the
    `?mode=flat` fallback inside `Universe3D` (frontend survey). The blueprint's one verifiable
    factual error — worth knowing because Phase 5 says "delete dead Universe.tsx."
17. **Migration ordering is not `db push`-safe** (timestamped files sort before app_00NN but
    depend on later ones; six duplicate numbers) — the repo assumes the SQL-editor/manual or
    CI multi-pass replay path. A naive `supabase db push` on a fresh project may fail.
18. **The clone ships shallow** (233 commits); the true history is 477 commits. Any future
    archaeology must `git fetch --unshallow` first.
19. **Secrets-at-rest for builder projects** remain in localStorage ("interim",
    `useProjectSecrets.ts:6–9`) despite legendary-roadmap Phase 8a (Vault) being specced.

## D. Genuinely unanswerable from the repository (questions for the operator)

20. **Who/what is "Stoke"?** Named once as an example venture ("build Stoke") — no world, code,
    or doc defines it.
21. **Is "mom's real estate" a real running deployment?** The vertical (MLS, real-estate
    toolbelt, "her real accounts" for social) is coded as if for a real person (client zero),
    but no production data is in the repo (correctly). Which pillars are actually armed and
    live-keyed in the real deployment — the single fact that most changes what "done" means —
    is unknowable from code.
22. **Original conversations.** The brief for this reconstruction asks that "project
    conversations" be treated as first-class sources. **No conversation exports exist in the
    repository.** The 37 docs in /docs are clearly distillations of such conversations (several
    quote the operator: "Riley: one clear identity"; "the user's own correction of the
    five-mode proposal"), and commit bodies occasionally embed decision records. Those are the
    only conversational traces available; anything discussed but never distilled into docs,
    code, or commit messages is lost to this reconstruction.
23. **Multi-operator future?** Everything assumes one operator; client_engagements model client
    *relationships*, not logins. Whether clients ever get accounts (portal beyond
    booking/claim/checkout pages) is undecided in the record.
24. **Which model keys were live in production** (Anthropic vs OpenAI vs local; Veo, Shotstack,
    Ayrshare tiers) — .env.example documents slots, not choices.
25. **"Crews"** — if the operator's surrounding conversations used a crews/multi-agent-team
    concept, it never reached this repository under that name (verified by grep). The nearest
    constructs are mission workers (5 kinds) and the producers registry.

## E. Verification debt this reconstruction inherits

- The scan addendum's "all defects closed" claims were spot-checked (deploy executors ✅ real;
  marketing publish ✅ fixed; canvas dead-end ❌ still severed) — but not every one of B1–B18 was
  individually re-verified here. The addendum is credible (each fix names its migration) but
  item-by-item re-verification is listed as follow-up work.
- The AI decision layer (brain step loop, executeTool, ~51 *Run.ts files) has **no verify
  coverage** — the author knew (scan risk #10). Any behavioral claim about it in these docs
  rests on code reading, not tests.
- Live-wiring claims (does the heartbeat actually tick when armed with real keys?) are untestable
  from this environment; the nightly canary exists precisely to answer this in production.
