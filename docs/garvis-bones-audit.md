# The Bones Audit — do we have a skeleton or a surface?

*Method: five scenario traces run in parallel through the actual code — not the docs, not the
intent. (1) a user chats inside a studio of a generated world; (2) a newborn seeded world renders
across every derived signal; (3) the operating loop from prospect scan → contact → send → reply →
learning; (4) four non-marketing intents pushed through Genesis; (5) "Garvis, what's our plan?"
asked at every ask-surface, and knowledge flow into builds. Every claim below carried file:line
evidence in the traces. Fixes marked ✅ shipped with this audit; open items are named, not hidden.*

## Verdict

**The skeleton is real. The circulation was not.** The structural bones — genesis pipeline with
quality gates, the one approval spine, RLS ownership, evidence-gated reflection, fail-soft AI with
deterministic floors, derived-not-invented status signals — all held under adversarial tracing.
What failed was the flow of intelligence THROUGH the skeleton: knowledge was being written into
tables that nothing downstream read, and the new seed packs were polluting the honest signals.
This pass fixed the circulation faults that were wiring errors; the remaining gaps are real
feature builds, listed at the end in priority order.

## What broke under tracing — and was fixed in this pass

**1. Seeded playbooks made newborn worlds LIE (the worst finding — a No-Theater violation).**
Seeds carried `source:'garvis'` + fresh `created_at`, indistinguishable from earned work. A world
born 10 minutes ago rendered: every area "active", momentum "steady" ("N artifacts this week"),
planets larger and glowing, the star's corona lit, the "market intel on record" risk suppressed
by a framework doc that was never research — and a false waking-moment move ("the empty list is
blocking staged sends") fired at birth. 13 signals polluted.
✅ Seeds now carry `source:'garvis-seed'` and are EXCLUDED from every derived signal: area status
and rollups count earned work only (workwebRun), planet size/glow (systemViewRun), world mass
(universeViewRun), momentum + intel-age + reflection evidence (worldIntelRun), launch-active
floors (nextMoveRun). The UI shows playbooks as what they are ("playbooks" chip, ᵖ counts).
A newborn world is dormant, quiet, and small again — full of knowledge, empty of claims.

**2. The studio chat was blind to the business it worked for.** It saw the cluster's artifacts
(truncated), files, and brand kit — but never `business_context`, never the DNA, never the open
questions. The postcard studio for Mom's world was writing for "a business", not HER business.
✅ The studio context now leads with a BUSINESS block (name/principal/craft/offerings/audience/
locale/voice + key DNA lines) and the world's KNOWN UNKNOWNS ("don't guess these"), budget raised
7000→9000 bytes, and the system prompt orders the model to speak THIS identity's voice or say
what it doesn't know. (5 new verify checks.)

**3. Genesis's honesty died at approval.** The questions Garvis refused to invent answers to,
the intake requests, the designed first moves — all shown on the draft card, then never seen
again (they stayed in the web_templates row; the world's open_questions channel was fed only by
reflection). ✅ approveDraft now writes the draft's questions (+ intake requests) into
`world_intelligence.open_questions` and the first moves into the opening recommendation, labeled
"From the world's design (pre-reflection)" — replaced by the first real reflection.

**4. Qualified prospects went nowhere.** `'contacted'` existed in the schema; nothing ever wrote
it. There was no path from a qualified prospect to a contact. ✅ app_0033 + `prospectToAudience`:
the operator supplies the email found on the prospect's site (scans can't find emails and Garvis
won't guess one — the input field IS the honesty), contact created via select-first-insert (never
resetting a suppressed status), prospect linked and marked `in_audience`. `'contacted'` stays
reserved for actual queued outreach.

**5. The model could invent {{tokens}} that render as raw mustache text.** GENESIS_SYSTEM listed
legal tokens but never said they were the ONLY ones. ✅ The prompt now states the closed set,
that {{first_name}} is email-only, and that anything else renders literally. Plus: DNA_SYSTEM no
longer fabricates customer segments for non-customer intents (personal systems, internal ops) —
it names real stakeholders and says so in questions.

## What held (the bones that are real)

- Reply → next action: fully connected — a positive unanswered reply is the highest-priority
  waking move in the system.
- The approval spine: every external verb (send/publish/deploy) queues; the studio chat can only
  PROPOSE; send-email's suppression/CAS/claim discipline held in earlier audits and holds here.
- Genesis quality gauntlet: structure validation, coverage repair, zero-AI floors, rationale +
  omissions requirements all enforced in code, not vibes.
- Derived signals that don't touch artifact counts (event-driven glow, charter-driven bands,
  cosine filaments, structural blockers) were honest before and after.
- Momentum/status honesty machinery itself worked as designed — which is exactly why the seed
  pollution was visible and fixable in one pass.

## The named remaining gaps (bones still missing — priority order)

1. **Retrieval (G6) is unbuilt and the plumbing is idle.** Only uploaded documents are embedded;
   `match_embeddings` has ONE caller (ingest-document's own classifier); embed-worker's persist
   mode has ZERO callers. There is no ask-surface that searches the world's knowledge — "what's
   our direct-mail plan?" is answerable only by opening the right studio. Build: embed artifacts
   on write, an ask box (Brain) over match_embeddings, cross-area context assembly.
2. **Knowledge doesn't flow into builds.** The website brief gets DNA+brand+photos+objective —
   not the intel area's findings, not audience segments, not reflection learnings. Play-step
   enrichment runs on voice tokens only. Build: a "world knowledge digest" compiled into briefs
   and enrich calls.
3. **Learning is manual.** Reflection runs only on click/nudge; no cron drives it, so results
   become lessons only when the user remembers to ask. (G5, with site-event instrumentation.)
4. **Direct mail dead-ends after content.** "Print & Send" is a label — no print approval kind,
   no vendor, not even a mark-mailed checklist writing to the ledger.
5. **Websites are one-way.** Lead-form submissions and site events from generated apps have no
   path back into the world (no tables, no ingestion endpoint). This is the heart of G5.
6. **The archetype vocabulary is a demand-gen funnel.** intel/audience/studio/launch/loop/
   ledger/vault fits customer-acquisition businesses natively; operations businesses (rental
   portfolio management, program delivery, personal systems) get a forced marketing skeleton —
   the ledger is hardcoded to sends/replies/sales. Honest fix is a vocabulary extension
   (ops/records archetypes + a generalized ledger), which is a design decision, not a patch.
7. Reflection can still cite a seeded playbook if the user manually pastes one into evidence
   paths outside gather() — low risk now that gather() excludes seeds; watch it.

*Invariant restated: knowledge a world is BORN with is context, never activity. Only things that
happened may light the sky.*
