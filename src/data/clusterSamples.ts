// src/data/clusterSamples.ts
// Three deliberately different conversations for the clustering spike. The spike PASSES only if all
// three produce a map you'd recognize as "yes, that's how I was thinking" — a tidy physics rabbit
// hole, a messy multi-thread work session, and a distracted/jumpy session. Each sample has a
// `seed` transcript (cluster from scratch) and a `more` transcript (added later, to test that the
// map EXTENDS rather than reshuffles).

export interface Sample { id: string; label: string; blurb: string; seed: string; more: string }

export const CLUSTER_SAMPLES: Sample[] = [
  {
    id: 'physics',
    label: 'Physics rabbit hole',
    blurb: 'A clean, deepening Explorer-mode thread — should nest tidily and show a discovery trail.',
    seed: `user: Let's explore black holes. Start simple.
assistant: A black hole is a region where gravity is so strong nothing, not even light, escapes past the event horizon.
user: Why does time slow down near one?
assistant: Gravitational time dilation — mass curves spacetime, and clocks deeper in the well tick slower relative to far-away ones. GPS satellites correct for it.
user: Wait, so what actually happens at the event horizon?
assistant: To a distant observer an infalling object appears to freeze and redshift at the horizon; to the object itself, nothing special happens locally as it crosses.
user: That leads me to the information paradox — if stuff falls in, is the information lost?
assistant: That's the crux. Hawking radiation seems to let black holes evaporate, which naively destroys information and breaks quantum mechanics. Proposals: holography, firewalls, the island formula.
user: Generate me a simple diagram idea for the event horizon vs the singularity.
assistant: Concept: nested circles — outer dashed ring (event horizon, "point of no return"), inner solid dot (singularity), light rays bending inward past the ring.`,
    more: `user: Okay back to Hawking radiation — how does it actually work?
assistant: Quantum fluctuations near the horizon: one partner of a virtual pair falls in with negative energy, the other escapes as real radiation, so the hole slowly loses mass.
user: Does that connect to entropy somehow?
assistant: Yes — Bekenstein-Hawking entropy says a black hole's entropy is proportional to its horizon AREA, not volume. That's the seed of the holographic principle.
user: Holographic principle sounds like it ties back to the information paradox.
assistant: Exactly — it suggests the information is encoded on the boundary, which is one way to save it from being lost.`,
  },
  {
    id: 'realestate',
    label: 'Real-estate marketing session',
    blurb: 'A messy Workshop-mode work session with several parallel threads + generated artifacts.',
    seed: `user: I'm helping my mom market her real estate business around Lake Geneva. Where do we start?
assistant: Start with positioning: who's the target seller/buyer, and what makes her different. Lakefront luxury vs. first-time local buyers are very different campaigns.
user: Let's do lakefront luxury sellers. Make a postcard for them.
assistant: Postcard draft — Headline: "Your lakefront legacy deserves a record sale." Sub: recent comps, her track record, a QR to a private valuation. CTA: "Book a confidential walkthrough."
user: Nice. Also I need an email follow-up sequence for people who scan the QR.
assistant: 3-email sequence: (1) the valuation + market snapshot, (2) "how we stage lakefront homes" with photos, (3) social proof + soft close to list.
user: Random thought — what are competitors like Compass doing for luxury listings?
assistant: I can't browse live, but generally: premium photography, drone + twilight shots, dedicated property microsites, and broker network exclusives.
user: Let's also brainstorm a logo refresh idea for her brand.
assistant: Concept: a clean serif wordmark with a subtle wave/horizon line under the name, deep navy + brass accent — reads "established lakefront luxury."
user: Save the postcard and the email sequence, those are keepers.`,
    more: `user: For the lakefront sellers, I want a short video script for Instagram reels.
assistant: 20s reel: hook "This lakefront home sold in 9 days — here's why," fast cuts of staging/twilight shots, end card with her brand + "Thinking of selling? DM 'LAKE'."
user: And we should plan a 2-week content calendar around all this.
assistant: Calendar: Mon market stat, Wed listing spotlight, Fri behind-the-scenes staging, plus the reel and the postcard mailer drop in week 1.
user: Does the logo refresh idea still work with the navy/brass on a dark reel background?
assistant: Yes — put the brass wordmark on the navy end card; it stays legible and on-brand.`,
  },
  {
    id: 'mixed',
    label: 'Distracted / jumpy session',
    blurb: 'Hard case: unrelated threads, tangents, an abandoned idea — granularity is the test here.',
    seed: `user: I wonder why luxury lake towns are so expensive.
assistant: Scarcity of waterfront, zoning limits, wealth migration, and tourism demand all compress supply against high demand.
user: lol unrelated but generate a funny image idea of a raccoon CEO.
assistant: Image concept: a raccoon in a tiny pinstripe suit at a glass-walled boardroom, city skyline behind, holding a tiny espresso. Caption: "Trash quarterly, but we're pivoting."
user: amazing. okay actually — I keep coming back to this idea of hyperlocal news for small towns.
assistant: There's a real gap: local papers are dying, but towns still want events, school, and real-estate news. A templated, low-cost, per-town site could work.
user: could that tie into the real estate stuff somehow?
assistant: Yes — local news drives local SEO and audience; real-estate agents are natural sponsors/advertisers. The two reinforce each other.
user: meh, let me think about that later. what's the deal with raccoons being so smart anyway?
assistant: High manual dexterity and strong problem-solving; studies show they remember solutions to tasks for years.`,
    more: `user: back to hyperlocal news — could I replicate one town site across many towns?
assistant: That's the leverage: one template + automated content ingestion (events, listings, school calendars) rolled out town by town. Marginal cost per new town is low.
user: and real estate agents could be the first advertisers in each town.
assistant: Right — pre-sell a sponsor in each town before launch; the agent gets local visibility, the site gets revenue from day one.`,
  },
];
