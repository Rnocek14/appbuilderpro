# 15 — Master Operational Blueprint

*Phase 5.5 synthesis. Twelve domain/cross-cutting audits (01–12), one consolidated 287-row gap
matrix (13), and one dependency-ordered roadmap (14), all bound to one rubric (`_charter.md`)
and grounded in the verified Phase-1 reconstruction with fresh grep-verification wherever Phase 1
was silent or stale. This document is the answer to the phase's central test and the operational
contract for everything built next.*

---

## 1. The central test, answered honestly

> *Can this personal AI let me start almost any serious undertaking, assemble the correct expert
> environment, perform the work deeply, automate the repeatable portions, preserve the
> knowledge, and manage the result alongside hundreds or thousands of other active operations?*

Decomposed and answered per clause, as of this snapshot:

| Clause | Verdict | Evidence |
|---|---|---|
| **Start almost any serious undertaking** | YES in structure, NO in assembly | Worlds/genesis/charters exist; intent→environment assembly is DOCUMENTED-ONLY+prototype |
| **Assemble the correct expert environment** | NO — the audit's largest single gap class | Workshops' session grammar, criteria packs, and composition are DOCUMENTED-ONLY; the shipped reality is the area grammar + bespoke boards [02] |
| **Perform the work deeply** | YES for five domains, NO for four | Deep today: website agency (A-grade funnel end-to-end 🔌), email outreach (single-tenant), social publishing (a pipe, not a service), research/exploration (single-hop depth), app/site building. Not today: direct mail (no fulfillment), geo/territory work (no map environment), apparel/creative commerce (near-zero code), whole-inbox work (no connection) |
| **Automate the repeatable portions** | YES with one urgent caveat | The trigger engine + standing-worker + earned autonomy are real 🔌; but the lifecycle's back half (testing, repair, versioning) is MISSING, and the send_sms bug actively poisons tick budgets [09] |
| **Preserve the knowledge** | YES, better than Phase 1 knew | Research now persists; PDF ingest is built [08 corrections]; the gates and ledgers hold; outcome→judgment joins remain the weak edge |
| **Manage the result alongside hundreds/thousands** | NO today — but cheaper than feared | 0 of 11 fleet questions answerable at fleet grain; yet nearly every missing fleet capability is a scope-promotion of a proven per-world pattern: 2 columns, 5 tables, 6 jobs, 1 approval kind, two new nouns [10] |

**The one-sentence verdict:** the machine can already *perform* a real single-operator agency
and research practice (dark-until-armed caveat standing), it cannot yet *assemble expert
environments* or *fulfill three physical-world domains* (mail, geo, apparel), and it cannot yet
*manage a fleet* — but the fleet gap is the cheapest of the three, because it is scope-promotion,
not invention.

## 2. The state of the machine, in numbers (from 13)

**287 consolidated capabilities:** 96 WORKING · 97 MISSING · 54 PARTIAL · 26 DOCUMENTED-ONLY ·
10 DISCONNECTED · 4 PROTOTYPE-ONLY — with 22 rows +ARCH-CHANGE and 23 +EXT-REQUIRED, and 17 ⚠
inter-audit conflicts preserved rather than silently resolved.

**By tier:** T-ME 154 rows (majority WORKING, 19 outright holes) · **T-10 94 rows — 51 MISSING
vs 1 WORKING: the tier where the build stops being a system** · T-100 35 · T-1K 3 · T-SPEC 1.
Half the machine is real; the missing half concentrates almost entirely at the ten-client tier.
The thousand-client tier is nearly empty because the control plane reduces to promotions of
patterns that already work per-world.

## 3. The eight structural convergences

The 97 MISSING + 22 ARCH-CHANGE rows do not describe 119 separate builds. They converge on eight
shared structures — build these, and the long tail becomes wiring:

1. **The world_id spine** — stamp `execution_runs`, `usage_events`, `inbound_mail`; make
   retrieval world-scoped. Without it: no per-client cost, no fleet health, no isolation proof,
   and cross-client kNN bleed (the audit's sharpest safety finding [12]).
2. **The package/version/cohort nouns** — one schema serving service packages [04], automation
   versioning [09], and cohort rollout [10]. The single most load-bearing arch-change; building
   any dependent feature first forces a T-100 rewrite.
3. **The criteria-pack object + outcome join** — what turns domain intelligence from prompt text
   into auditable data; everything "learning" waits on it [02].
4. **The asset-grant substrate** — cross-world authorization with provenance; the founding move
   of the flagship creative scenario is unrepresentable without it; every enforcement pattern it
   needs already exists (autonomy_grants, disclosure gates, tile lineage) [07].
5. **The automation back half** — test harness (dry-run, simulated clock, gate lamps), failure
   ledger + repair loop, dead-letter/backoff imported from the generated-app child runtime,
   which ironically out-engineers its parent [09].
6. **The publisher/meter integrations** — Lob+CASS (mail), Printful (apparel), Gmail/Nylas
   (inbox), Mapbox+parcel data (geo): the four buys that unlock the four can't-perform domains;
   "integration instruments no bench design can fix" [02, 11].
7. **The people/connector/vault unification** — six people tables, per-client credentials with
   expiry probes scheduled (probes exist; nothing schedules them), rotation hygiene [12, 10].
8. **The manipulation substrate + four deep environments** — D5's bench hands as a shared layer;
   deep environments only for GIS, production visual design, the Builder (already the proof),
   and the automation test bench. Everything else is the reusable grammar [02].

## 4. Domain verdicts, one line each

- **Real estate (mom)** — listing/content/paperwork rails real; the territory→mail chain dies at
  three EXT gaps (map environment, homeowner data, fulfillment) [03].
- **Website agency** — acquisition is the system's crown; long-term client management is the
  weakest half and the cheapest high-revenue completion (wiring-plus-one-object) [04].
- **Outreach** — A-grade and single-tenant *by declared design*; per-client safety rails are the
  T-10 wall; client reporting is MISSING despite every number existing as rows [05].
- **Social** — the best non-email rail and the only production earned-autonomy loop; a pipe, not
  a managed service; the content calendar is the audit's cheapest deep surface [06].
- **Apparel/creative** — the most-imagined scenario over near-zero code; Printful is this
  domain's Lob; the mural business is nearest-to-real and should ship first [07].
- **Research/exploration** — schema already sufficient for the designed experience ("the gap is
  surface and wiring, not schema"); single-hop depth and the missing experiment lifecycle are
  the real limits [08].
- **Automation platform** — front half real, back half missing; three substrates that should
  stay two, sharing ops patterns [09].
- **Control plane** — 0/11 fleet questions answerable; two new nouns and six subsystems away;
  zero external services required [10].
- **Integrations** — 20 external dependencies with verdicts; Lob is the highest-leverage buy;
  four flagged rows lack rulings [11, 13].
- **Security/cost/isolation** — the trust floor is strong on the owner axis and unbuilt on the
  world axis; six unmetered AI call sites are exactly the rails that grow with clients [12].

## 5. The urgent ledger (T-ME, this week's class of fix)

From the fix-first ledger [14] plus the audits' live-defect findings:

1. **send_sms enum migration** — one line; until then every SMS automation burns tick budgets
   and starves email automations, writing zero error records [09].
2. **Two deploy-list lines** — booking + sender-domain are absent from every deploy list.
3. **The six unmetered AI call sites** — discover-run, embed-worker, inbox-draft,
   garvis-consolidate, outreach-followups, resend-inbound [12].
4. **World-scoped `match_embeddings`** — closes the cross-client context-bleed vector before a
   second client's documents ever share the index [12].
5. **The failure ledger + auto-pause repair loop** — the drain's catch block must stop
   swallowing everything [09].
6. **The four one-verb wire-ups** from the DISCONNECTED register (watch-at-sale insert, canvas
   publish verb, registry drift, verify-file registration) [13 Cut C].

## 6. The critical path (condensed from 14)

**T-ME:** fix-first ledger → heartbeat self-arm + repair loop → metering call sites → the two
substrate nouns (criteria packs, asset grants) → the mail money path in vendor order
(print-DPI render → CASS → send_mail executor → Lob). Research surfaces deliberately last.
**T-10:** world_id spine FIRST → service-package noun + `packageEstablishes()` → per-client
safety rails and reporting → fleet-view v0 → the slate. **T-100:** the ARCH bill (version/cohort
nouns, policy engine, connector/vault consolidation, Stripe Connect). **T-1K:** child-policy
coverage, rotation hygiene, honestly-deferred multi-operator delegation. The do-not-build-yet
list [14] forbids the tempting inversions — cohort machinery before nouns, care-plan one-offs,
the experience surfaces before their rows, runtime unification, the umbrella control plane.

## 7. What this means for the five prototypes

Per the roadmap's P→tier map: **P1 (Minute Zero) and P3 (the bench) become real mid-T-ME**
(P1 rides the builder + preview rails that already work; P3 needs the D5 substrate + criteria
packs); **P2 (Explore→Real) late-T-ME by design** (schema sufficient; surface deliberately
sequenced behind the compounding seams); **P4 (the morning) and P5 (client birth) are T-10
deliverables** (the slate needs the world_id spine + exception data; birth-from-close-won needs
the service-package noun). Prototype graduation order therefore follows capability reality, not
preference: **P1 → P3 → P2 → P5 → P4.**

## 8. The operational thesis

Three sentences to govern the next phase of building:

1. **Wire before you build; build nouns before features; buy publishers and meters.** Half the
   audit's value is DISCONNECTED/one-line items and eight shared structures; almost nothing
   demands invention.
2. **The ten-client tier is the product.** T-ME is mostly done, T-100 is mostly schema, T-1K is
   mostly promotion — but T-10 (51 missing vs 1 working) is where "a system I use" becomes "a
   system that runs a business," and every T-10 item depends on the world_id spine landing
   first.
3. **The experience layer is waiting on rows, not the reverse.** Every validated interaction
   (slates, benches, briefs, births) has a named data dependency in this audit; graduate
   prototypes exactly as their rows become real, and the beautiful demonstrations become
   operations.

---

*Full evidence: 01–12 per domain · 13 for any capability's class and sources · 14 for sequence.
The five prototypes remain preserved as validated interaction experiments; this blueprint is the
contract that makes them true.*
