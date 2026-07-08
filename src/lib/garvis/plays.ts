// src/lib/garvis/plays.ts
// PLAYS — pure campaign definitions a work web can run (verified by workweb.verify.ts).
//
// A play is an ordered set of productions across a web's clusters: research → angle → creative →
// sequence → landing → social → video. Every step has a DETERMINISTIC producer (the play works with
// zero AI keys — house fallback pattern, same as the preview engine), plus an optional AI prompt the
// impure runner uses to enrich the deterministic draft when a key/credits exist. Artifacts are
// slug-stable so re-running a play UPSERTS rather than duplicates.
//
// The first play is real work, not a demo: Mom's Lake Geneva lakefront seller campaign.

import type { ArtifactKind } from './clustering';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlayContext {
  town: string;            // "Lake Geneva"
  audienceLabel: string;   // "lakefront homeowners"
  agentName: string;       // filled from the Brand vault when present
  brokerage: string;       // "@properties"
  season: string;          // "this season" — kept generic; no Date.now in pure code
}

export const DEFAULT_LAKE_GENEVA_CONTEXT: PlayContext = {
  town: 'Lake Geneva',
  audienceLabel: 'lakefront homeowners',
  agentName: 'your @properties agent',
  brokerage: '@properties',
  season: 'this season',
};

export interface PlayArtifact {
  slug: string;            // stable within the target cluster → upsert on re-run
  kind: ArtifactKind;
  title: string;
  detail: string;
}

export interface PlayStep {
  id: string;
  title: string;
  worker: 'research' | 'marketing';   // maps onto existing garvis_tasks worker kinds
  targetSlug: string;                  // template cluster slug the artifacts land in
  produce: (ctx: PlayContext) => PlayArtifact[];
  /** Optional AI enrichment: the runner replaces the FIRST produced artifact's detail with the
   *  model's text when the call succeeds; on any failure the deterministic draft stands. */
  ai?: { system: string; buildUser: (ctx: PlayContext) => string; maxTokens: number };
}

export interface EmailStep { step: 0 | 1 | 2; subject: string; body: string }

export interface Play {
  id: string;
  title: string;
  objective: string;       // becomes the mission objective
  steps: PlayStep[];
  /** The sequence this play would queue to a contact (source of truth for queue-sequence). */
  emailSequence: (ctx: PlayContext) => EmailStep[];
}

// ---------------------------------------------------------------------------
// Lakefront Seller — the acceptance-test play
// research → angle → postcard → email sequence → landing page → social → video
// ---------------------------------------------------------------------------

const marketBrief = (c: PlayContext) => `LAKEFRONT MARKET SNAPSHOT — ${c.town}

What matters to a lakefront owner deciding whether to sell:

1. SCARCITY IS THE STORY. Lakefront inventory in ${c.town} is structurally thin — most owners hold
   for decades, so each quality listing competes with only a handful of others. Scarcity, not
   discounting, is the seller's leverage.

2. THE BUYER IS ALREADY HERE. The dominant buyer profile is Chicago-metro wealth seeking a
   second home within a two-hour drive. They shop quietly, often off-season, and they buy the
   shoreline first and the house second.

3. PRICING POWER FOLLOWS PREPARATION. Lakefront sales that set records are staged, filmed, and
   priced against the RIGHT comps (frontage feet and pier rights, not just square footage).
   Owners who list "as-is, whenever" leave six figures on the table.

4. TIMING WINDOWS. Spring listings capture summer-dream buyers; fall listings capture year-end
   money and less competition. Both work — drifting onto the market without a plan does not.

OPEN QUESTIONS TO SHARPEN WITH LIVE DATA (Lake Geneva Brief market report / MLS):
- current active lakefront count and median days-on-market
- last four quarters of lakefront closings and $/frontage-foot
- share of cash purchases (signals second-home buyer strength)`;

const angleBrief = (c: PlayContext) => `CAMPAIGN ANGLE — "The Quiet Listing Advantage"

PREMISE: ${c.audienceLabel} in ${c.town} don't respond to "the market is hot!" — they hear that
every year. They respond to PRIVATE, SPECIFIC, LOW-PRESSURE intelligence about their own asset.

THE ANGLE: position ${c.agentName} as the person who can tell them, precisely and privately, what
their frontage is worth ${c.season} — and who is already in conversation with the buyers looking
for it. Not "list your home" — "know your number."

WHY IT WORKS:
- Luxury sellers act on information advantage, not urgency.
- "Know your number" invites a no-commitment conversation; the listing follows the relationship.
- The private-buyer-demand claim is concrete and checkable — it earns the meeting.

CAMPAIGN SHAPE: postcard (curiosity) → landing page (the number, gated by a short form) →
email sequence (market letter cadence) → call for a private valuation.`;

const postcardA = (c: PlayContext) => `POSTCARD — VARIANT A ("Know your number")

FRONT (over a calm dawn shot of the lake):
  Your shoreline has a number.
  Do you know it?

BACK:
  Lakefront values in ${c.town} moved again ${c.season} — and the buyers moving them are quiet,
  qualified, and already looking. If you've ever wondered what your frontage is actually worth,
  I'll tell you privately. No listing pitch. Just your number.

  ${c.agentName} · ${c.brokerage}
  [phone] · [landing page URL] · QR code

DESIGN NOTES: matte stock, one image, generous whitespace, no starbursts, no "HOT MARKET".`;

const postcardB = (c: PlayContext) => `POSTCARD — VARIANT B ("The buyer is already here")

FRONT (over a pier-and-water detail shot):
  The buyer for your lakefront
  is probably already looking.

BACK:
  Every season a handful of ${c.town} lakefront homes change hands quietly — often before the
  sign goes up. I keep the shortlist of qualified buyers waiting for frontage like yours. If the
  right offer found you first, would you want to hear it?

  ${c.agentName} · ${c.brokerage}
  [phone] · [landing page URL] · QR code

DESIGN NOTES: same family as Variant A; test which front line pulls more scans.`;

const landingOutline = (c: PlayContext) => `LANDING PAGE — "What is your ${c.town} lakefront worth?"

GOAL: one page, one action — request a private valuation. Build with the Preview Engine.

HERO
  H1: What is your ${c.town} lakefront actually worth ${c.season}?
  Sub: Private valuation from the team that watches every lakefront closing on the lake.
  CTA: Get my number →  (name, email, property address — nothing else)

PROOF STRIP
  · $/frontage-foot trend (from the market report)
  · recent closings count
  · "buyers waiting" counter (only if true — never invent)

HOW IT WORKS (3 steps)
  1. You tell us the address. 2. We run frontage-true comps. 3. You get the number, privately.

TRUST
  ${c.agentName} — ${c.brokerage}. Local, discreet, no-obligation. Testimonial slot.

FOOTER: brokerage compliance line, privacy note ("we never share your info"), unsubscribe promise.`;

const socialPosts = (c: PlayContext): PlayArtifact[] => [
  {
    slug: 'social-post-1', kind: 'post', title: 'Post 1 — the number',
    detail: `CAPTION: Your ${c.town} shoreline has a number. Most owners are off by six figures — in
both directions. DM "NUMBER" for a private valuation. No pitch, just the math.
VISUAL: dawn water, still. TAGS: #LakeGeneva #lakefront #realestate`,
  },
  {
    slug: 'social-post-2', kind: 'post', title: 'Post 2 — the quiet market',
    detail: `CAPTION: The best lakefront sales here never hit the portal. They happen quietly, between
one prepared seller and one waiting buyer. Preparation is the whole game.
VISUAL: pier detail, golden hour. TAGS: #LakeGenevaWI #luxuryrealestate`,
  },
  {
    slug: 'social-post-3', kind: 'post', title: 'Post 3 — market letter CTA',
    detail: `CAPTION: Once a month I write down what actually happened on the lake — closings, $/frontage
foot, who's buying. If you own here, you should be reading it. Link in bio.
VISUAL: the letter itself, printed, on a desk. TAGS: #LakeGeneva #marketupdate`,
  },
];

const videoScript = (c: PlayContext) => `30-SECOND VIDEO — "${c.town} lakefront, ${c.season}"

HOOK (0-3s, drone over the lake, cold open):
  "Here's what your ${c.town} lakefront is worth ${c.season} — roughly."

BODY (3-20s, cut between water, piers, one interior):
  "Inventory on the lake is thin again. The buyers are Chicago money, they're qualified, and they
  buy the shoreline first, the house second. Which means your number depends on frontage feet,
  pier rights, and timing — not the Zestimate."

CTA (20-30s, agent to camera, calm):
  "I run private valuations for lakefront owners — no listing pitch, just your number.
  The link's below."

SHOT LIST: drone establisher · pier detail · water-level pan · one bright interior · agent to camera.
CAPTION FILE: yes. MUSIC: minimal, no EDM. END CARD: name, ${c.brokerage}, landing URL.`;

const emailSequence = (c: PlayContext): EmailStep[] => [
  {
    step: 0,
    subject: `What your ${c.town} lakefront is worth ${c.season}`,
    body: `Hi {{first_name}},

Lakefront values here moved again ${c.season}, and if you own on the water you've probably wondered
what that means for your place specifically.

I run private valuations for ${c.audienceLabel} — frontage-true comps, pier rights included, no
listing pitch attached. You get your number; what you do with it is your business.

Want yours? Reply "number" and I'll take it from there.

— ${c.agentName}, ${c.brokerage}`,
  },
  {
    step: 1,
    subject: `Re: What your ${c.town} lakefront is worth ${c.season}`,
    body: `Hi {{first_name}},

Quick nudge on the private valuation — a couple of your neighbors took me up on it and both were
surprised (one high, one low, for what it's worth).

Still happy to run yours. Just reply "number."

— ${c.agentName}`,
  },
  {
    step: 2,
    subject: `Re: What your ${c.town} lakefront is worth ${c.season}`,
    body: `Hi {{first_name}},

Last note from me — if the timing's not right, that's completely fine. If you'd ever like the
number anyway (it's useful for insurance and estate planning too), the door's open.

— ${c.agentName}`,
  },
];

export const LAKEFRONT_SELLER_PLAY: Play = {
  id: 'lakefront-seller',
  title: 'Lakefront Seller Campaign',
  objective: 'Win private-valuation conversations with Lake Geneva lakefront owners, converting to listing appointments.',
  emailSequence,
  steps: [
    {
      id: 'research', title: 'Research the lakefront market', worker: 'research',
      targetSlug: 'lake-geneva-market',
      produce: (c) => [{ slug: 'lakefront-market-snapshot', kind: 'research', title: 'Lakefront market snapshot', detail: marketBrief(c) }],
      ai: {
        system: 'You are a real-estate market analyst. Rewrite and sharpen the provided market brief for the stated town. Keep the exact section structure, keep it factual and hedged where data is not provided, never invent statistics. Plain text.',
        buildUser: (c) => `Town: ${c.town}. Audience: ${c.audienceLabel}.\n\nBRIEF TO SHARPEN:\n${marketBrief(c)}`,
        maxTokens: 900,
      },
    },
    {
      id: 'angle', title: 'Synthesize the campaign angle', worker: 'research',
      targetSlug: 'seller-campaigns',
      produce: (c) => [{ slug: 'angle-quiet-listing', kind: 'research', title: 'Campaign angle: The Quiet Listing Advantage', detail: angleBrief(c) }],
    },
    {
      id: 'postcard', title: 'Write the postcard variants', worker: 'marketing',
      targetSlug: 'direct-mail-creative',
      produce: (c) => [
        { slug: 'postcard-a', kind: 'post', title: 'Postcard A — Know your number', detail: postcardA(c) },
        { slug: 'postcard-b', kind: 'post', title: 'Postcard B — The buyer is already here', detail: postcardB(c) },
      ],
      ai: {
        system: 'You are a luxury real-estate direct-mail copywriter. Improve the postcard copy: tighter, calmer, zero hype adjectives, no exclamation marks. Keep the FRONT/BACK/DESIGN NOTES structure and the placeholders exactly as given. Plain text.',
        buildUser: (c) => `Audience: ${c.audienceLabel} in ${c.town}.\n\n${postcardA(c)}`,
        maxTokens: 500,
      },
    },
    {
      id: 'email-seq', title: 'Draft the follow-up email sequence', worker: 'marketing',
      targetSlug: 'direct-mail-follow-up',
      produce: (c) => emailSequence(c).map((e) => ({
        slug: `email-step-${e.step}`, kind: 'doc' as ArtifactKind,
        title: `Email ${e.step === 0 ? '1 — first touch' : e.step === 1 ? '2 — nudge' : '3 — breakup'}: ${e.subject}`,
        detail: `SUBJECT: ${e.subject}\n\n${e.body}`,
      })),
    },
    {
      id: 'landing', title: 'Outline the landing page', worker: 'marketing',
      targetSlug: 'landing-pages',
      produce: (c) => [{ slug: 'landing-know-your-number', kind: 'doc', title: 'Landing page — Know your number', detail: landingOutline(c) }],
    },
    {
      id: 'social', title: 'Write the social posts', worker: 'marketing',
      targetSlug: 'social-content',
      produce: (c) => socialPosts(c),
    },
    {
      id: 'video', title: 'Script the 30-second market video', worker: 'marketing',
      targetSlug: 'video-ideas',
      produce: (c) => [{ slug: 'video-market-30s', kind: 'video', title: '30-sec video — lakefront market', detail: videoScript(c) }],
    },
  ],
};

export const PLAYS: Play[] = [LAKEFRONT_SELLER_PLAY];

export function playById(id: string): Play | null {
  return PLAYS.find((p) => p.id === id) ?? null;
}

/** Play integrity (used by verify + validateTemplate callers): every step's target slug must exist
 *  in the given template slugs, artifacts must be non-empty and slug-unique per target. */
export function validatePlay(play: Play, templateSlugs: string[], ctx: PlayContext): string[] {
  const problems: string[] = [];
  for (const step of play.steps) {
    if (!templateSlugs.includes(step.targetSlug)) problems.push(`step "${step.id}" targets unknown cluster "${step.targetSlug}"`);
    const arts = step.produce(ctx);
    if (!arts.length) problems.push(`step "${step.id}" produces no artifacts`);
    const seen = new Set<string>();
    for (const a of arts) {
      if (!a.title.trim() || !a.detail.trim()) problems.push(`step "${step.id}" artifact "${a.slug}" has empty title/detail`);
      if (seen.has(a.slug)) problems.push(`step "${step.id}" duplicate artifact slug "${a.slug}"`);
      seen.add(a.slug);
    }
  }
  const seq = play.emailSequence(ctx);
  if (seq.length !== 3) problems.push(`email sequence must be 3 steps, got ${seq.length}`);
  for (const e of seq) if (!e.subject.trim() || !e.body.trim()) problems.push(`email step ${e.step} is empty`);
  return problems;
}
