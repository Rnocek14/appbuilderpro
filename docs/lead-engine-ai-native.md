# Lead Engine — the AI-native play: what "blow people away" actually means here

Companion to `lead-engine-plan.md` (pilot) and `lead-engine-deep-dive.md` (economics).
This doc answers: should AI be used to create something genuinely new in this space —
and if so, where does AI create a real advantage versus decoration?

Researched August 2026. Sources at the end.

---

## The strategic fact that reframes everything

**Dodge Construction Network's moat is a payroll.** Every Dodge Report is "sourced,
researched, and quality-checked" by their team of **400+ field reporters**, supported by
**400+ content acquisition specialists** and ~20 economists. Their researchers verify
projects by calling architects, contractors, and planning departments. That human
pipeline is why Dodge costs $6k–12k/yr and why nobody could compete for 130 years —
reading unstructured documents and making verification calls didn't scale without
headcount.

LLMs collapse both activities to API cost. The incumbent price umbrella is set by a cost
structure that no longer has to exist. That's the classic disruption setup: attack from
below with software margins on work the incumbent does with people.

The equally important caveat: **AI is an equalizer, not a moat.** It removes the barrier
that protected Dodge without erecting a new one for us. The 2026 landscape proves it —
the "AI reads planning documents" layer is already commoditizing (see below). So the
play is: use AI to reach parity with an 800-person operation as roughly one person,
move fast, and pour the advantage into the assets AI can't replicate — outcome data,
verified-accuracy reputation, and distribution in the trades.

## Layer 1 — Read what humans can't afford to read (pre-permit signals)

Permits are late. By permit issue, a project is designed, funded, and half the vendors
are chosen. The earlier record — planning commission agendas, zoning board minutes, city
council packets, site plan reviews — is public in every county but lives in unstructured
PDFs and meeting audio that were economically unreadable before LLMs. That's **6–18
months of lead time** on every commercial project, upstream of everyone working from
permit feeds.

Reality check — this layer is already being built by others:
- **cityminutes.ai**: structured pre-permit planning data (conditions of approval,
  hearing outcomes, objections, staff recommendations) from every US planning
  commission across 3,142 counties, weekly.
- **Curate (FiscalNote)**: scans minutes/agendas from 12,000+ local government entities.

Implication: **buy or license the parsing, don't rebuild it.** Evaluate cityminutes.ai
as a data supplier (site blocks bots; contact directly). The differentiation isn't
extracting the data — it's what the next three layers do with it. If licensing is
unavailable or too dear, LLM-parsing agendas for a handful of pilot metros is a
weekend-scale build on the existing stack; national coverage is not needed until Year 2.

## Layer 2 — Verify with AI voice (the genuinely underexploited one)

Dodge's core quality claim — "a human called and confirmed this project" — is exactly
400 salaries of cost. AI voice agents (Retell, Bland, Synthflow) now make short
informational calls reliably. The play:

**Every lead is verified by an AI phone call before delivery.** The agent calls the
architect/GC office or planning department on the record: confirms timeline, scope,
and who's making purchasing decisions. Leads ship stamped *"verified by call,
Tuesday 2:14pm — bid window confirmed open."*

Nobody selling to SMB contractors delivers verified leads. This is Dodge's premium
quality claim at ~1% of Dodge's cost, and it directly attacks the #1 objection every
contractor has about bought leads ("they're stale/junk").

Compliance box (from the 2026 rules):
- Informational verification calls to **business landlines** — not marketing, not
  consumer cells. This is the clean category under TCPA.
- **Disclose AI at the top of every call** — the safe default now, likely law soon
  (FCC proposal pending; California bot-disclosure already in force for commercial
  influence calls).
- Never let the verification agent sell on the call. Verify facts, thank them, done.
- Cell phones require prior express consent — route around them.

## Layer 3 — Event-triggered outreach (why generic AI SDRs fail and ours wouldn't)

The 2026 field results on AI SDRs (Artisan, 11x) are mixed: autonomous AI outreach
frequently produces worse cost-per-qualified-pipeline than an outsourced human SDR,
because generic AI SDRs have **no reason to reach out** — they personalize from
firmographics and spray. Relevance is the missing input.

We own the missing input. An outreach email generated from a real event — "the TI
permit for 6,200 sq ft at 400 Main St was issued Tuesday; the GC of record is X" — is
not spray. It's the one email the recipient actually wants that week. AI SDR + a
proprietary trigger stream is the combination neither the AI SDR vendors (no data) nor
the data vendors (no outreach) currently ship.

Mechanically this is the existing Garvis pattern: standing orders draft, the approval
queue gates every send (which also keeps CAN-SPAM/mini-TCPA exposure controlled), email
first, business phones second, no cold SMS ever.

## Layer 4 — The analyst experience (the demo that closes sales)

The presentation layer that makes people say "I've never seen anything like this":
- **Conversational market access**: "What's coming to my side of town in Q4 that needs
  security work?" answered from the event graph, with sources.
- **The morning brief**: each customer opens a daily "here are the 6 events that matter
  to you today, 2 verified overnight, 1 outreach drafted and waiting for your yes."
- **Live demo in sales calls**: their metro, their trade, five real verified leads on
  screen while they watch. This weaponizes Layer 1–3 into the founder-led sales motion.

Honest label: this layer is wow, not moat — it sells the product and defends nothing.
Build it thin on top of the data; never mistake it for the asset.

## What this changes in the roadmap

1. **Pilot unchanged** — but add one AI verification call per delivered lead from week
  one, even if it's semi-manual. "Verified" goes in the very first pitch, and the
  verification transcripts become training/eval data.
2. **Contact cityminutes.ai about licensing** before building any pre-permit parsing.
  Build-vs-buy decided by their price, not by pride.
3. **The product ladder gets a new claim at every tier**: feed → *verified* feed →
  *verified + outreach drafted* → *verified + outreach run + meetings booked*. Each
  AI layer justifies the next price step; the $1,500–3,000/mo done-for-you tier is an
  "AI sales employee for the trades," priced against a $60k salesperson, not against
  other software.
4. **Unit economics watch**: parsing + verification calls carry real per-lead model and
  telephony cost (rough order: cents for parsing, low dollars per verified lead).
  Trivial against $250–3,000/mo price points, but meter it per lead from day one.
5. **Speed matters more, not less.** Since AI hands every competitor the same parsing
  ability, the compounding assets are (a) the outcome dataset (close rates by event
  type — contractual at every tier), (b) verified-accuracy reputation, and (c) being
  first into the trades' word-of-mouth network. The window is open now; it will not
  stay open long — funded teams are already colonizing the parsing layer.

## Positioning sentence

Not "a leads database with AI features" but: **an AI research-and-sales staff for the
trades** — it reads every public record in the county, calls to verify what's real,
and puts a drafted, compliant outreach in front of you every morning. Dodge built this
with 800 people for enterprises; we deliver it to a 10-person contractor for
$500–3,000 a month.

---

## Sources

- [Dodge's 400+ field reporters](https://www.construction.com/what-is-dodge-construction-network-the-dodge-report-explained/) · [Dodge data quality analyst role (verification calls)](https://apply.workable.com/dodge-construction-network/j/9A6468547B/) · [Dodge 130-years profile](https://www.marketscale.com/industries/engineering-and-construction/dodge-construction-network-how-130-years-of-data-is-reshaping-construction-intelligence)
- [cityminutes.ai — pre-permit planning data, 3,142 counties](https://cityminutes.ai) · [Curate/FiscalNote — 12,000+ local gov entities](https://www.curatesolutions.com/) · [AI meeting-minutes tooling in local gov](https://www.govtech.com/artificial-intelligence/ai-takes-the-drudgery-out-of-compiling-meeting-minutes)
- [AI SDR field results — mixed vs human SDR](https://www.upliftgtm.com/blog/ai-sdr-tools-comparison-2026) · [AI sales agents tested](https://www.salesforge.ai/blog/ai-sales-agents) · [Artisan review](https://marketbetter.ai/blog/artisan-ai-review-2026/) · [Artisan platform](https://www.artisan.co/)
- [Voice AI TCPA playbook (Retell)](https://www.retellai.com/blog/tcpa-compliance-playbook-voice-ai-outbound) · [AI call disclosure requirements](https://thoughtly.com/blog/ai-disclosure-requirements-what-to-tell-callers) · [AI voice compliance & state laws](https://www.henson-legal.com/ai-voice-compliance) · [Are AI voice calls legal (2026)](https://www.bitbytes.io/blog/ai-voice-speech-tools/ai-voice-calls-legal)
