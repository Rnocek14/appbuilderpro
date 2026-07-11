// src/lib/garvis/expertise.ts
// DOMAIN EXPERTISE AS DATA — pure (verified by expertise.verify.ts).
// The answer to the blank-world problem: every chartered area is born with a real, expert
// playbook — not an empty room and not a vague stub. These are the frameworks a seasoned
// operator would write on day one: campaign plans, content calendars, comparison matrices,
// sequence cadences, KPI trees. They ship DETERMINISTICALLY (zero AI keys needed), speak the
// world's own voice via {{tokens}}, and are honest by construction: they are labeled
// frameworks/heuristics, and wherever real DATA belongs (prices, comps, rates) the framework
// says "fill this from a Market Intelligence scan / your records" — it never invents a number.

import type { Archetype, Flavor } from './workweb';

export interface SeedArtifact { slug: string; kind: 'doc' | 'research' | 'post'; title: string; detail: string }

const H = (s: string) => `${s}\n${'—'.repeat(Math.min(s.length, 60))}`;
const NOTE = '\n\n(Framework — expert structure, not measured data. Where a number belongs, run a Market Intelligence scan or use your records; Garvis never invents figures.)';

// ---------------------------------------------------------------------------
// Studio packs
// ---------------------------------------------------------------------------

const SOCIAL: SeedArtifact[] = [
  {
    slug: 'social-30-day-plan', kind: 'doc', title: '30-day social plan',
    detail: `${H('30-day plan for {{business_name}}')}
Voice: {{tone}}. Audience: {{audience}}.

WEEKLY RHYTHM (repeat 4x, rotate topics)
- Mon — PROOF: finished work / result ("{{offerings}}" in the wild). Photo-first, 1-line story.
- Tue — PROCESS: behind the scenes. Process beats polish for trust.
- Wed — EDUCATION: answer one question buyers actually ask ({{audience}}).
- Thu — STORY: the why — {{principal}}'s story, one chapter at a time.
- Fri — OFFER: one clear CTA (commission/booking/inquiry). Only 1 in 5 posts sells.
- Weekend — COMMUNITY: local tags, reshares, replies. Show up where {{audience}} already are.

POST ARCHETYPES (reuse forever)
1) Before/after  2) One-piece deep dive  3) Client story + result  4) FAQ answer
5) "How it's made" carousel  6) Team/founder note  7) Local landmark tie-in  8) Offer with deadline

RULES OF THUMB (heuristics, labeled as such)
- Hook in the first 6 words; caption ≤ 3 short paragraphs; 3-5 niche hashtags beat 30 generic.
- Every post: one idea, one image, one CTA. Batch-produce weekly from the Artwork/asset library.${NOTE}`,
  },
  {
    slug: 'social-hashtag-map', kind: 'doc', title: 'Hashtag & channel map',
    detail: `${H('Channel map')}
- Instagram: primary showcase — feed = portfolio, stories = process, reels = reach.
- Facebook: local groups + event marketing; share IG winners.
- LinkedIn: only if {{audience}} includes businesses/designers — post case studies, not art shots.
- TikTok/Shorts: process video with 1-line narration; same clip everywhere.

HASHTAG SETS (build 3 sets of 5; rotate)
- Niche craft tags (what you make) · Local tags (city/region) · Buyer-intent tags (what {{audience}} search).
Fill the actual tags from a Market Intelligence scan of top local accounts.${NOTE}`,
  },
];

const DIRECT_MAIL: SeedArtifact[] = [
  {
    slug: 'direct-mail-campaign-plan', kind: 'doc', title: 'Direct mail campaign plan',
    detail: `${H('Direct mail plan for {{business_name}}')}
THE 40/40/20 RULE: 40% of response is the LIST, 40% the OFFER, 20% the creative.

1) LIST — who receives it (fill from Audience/Lead Finder):
   - Primary: {{audience}}.
   - Sources: owned contacts, Lead Finder scans, purchased/compiled lists (verify permissions).
2) OFFER — one per campaign. Strong shapes: free consult/valuation, limited slots, seasonal
   deadline, "see 3 concepts free". Weak: "we exist".
3) CREATIVE — 3 postcard concepts (below), 6x9 beats 4x6 for luxury; real photography only.
4) CADENCE — one-off mail rarely converts: plan 3 touches, 3-4 weeks apart, same list.
5) BUDGET MATH (template — fill your real numbers):
   pieces × (print + postage) = cost; responses needed to break even = cost ÷ avg job value.
6) TRACKING — unique URL or QR per campaign; count inquiries in the Results ledger.${NOTE}`,
  },
  {
    slug: 'postcard-concepts', kind: 'doc', title: '3 postcard concepts',
    detail: `${H('Concepts (copy skeletons — drop in real photos from the vault)')}
A) FULL-BLEED PROOF — front: one stunning piece, no text. Back: "Made for a space like yours.
   {{business_name}} · {{craft}}." + offer + QR.
B) BEFORE/AFTER — front: split image. Back: 2-line story of the transformation + offer.
C) LOCAL AUTHORITY — front: piece in a recognizable local setting. Back: "{{locale}}'s own —
   {{principal}}." + offer.
Each: one CTA, one phone/URL, the compliance line from the brand kit.${NOTE}`,
  },
];

const EMAIL_PACK: SeedArtifact[] = [
  {
    slug: 'email-sequence-frameworks', kind: 'doc', title: 'Email sequence frameworks',
    detail: `${H('Sequences (cadences are heuristics; adjust to replies)')}
COLD (3 touches, 3-4 business days apart):
 1. Relevance: why THEM specifically (cite something real about them) + one-line offer + soft CTA.
 2. Proof: one result/piece + "worth a look?".
 3. Close the loop: "closing the file unless…" — highest reply rate of the three.
NURTURE (monthly): one insight for {{audience}} + one piece + no ask 2 of 3 sends.
POST-INQUIRY (48h, 5d, 12d): recap their ask → proposal → gentle deadline.
RULES: plain text beats HTML for outreach; subject ≤ 6 words; every send through Approvals.${NOTE}`,
  },
];

const VIDEO_PACK: SeedArtifact[] = [
  {
    slug: 'video-formats', kind: 'doc', title: 'Video formats that work',
    detail: `${H('Formats for {{business_name}}')}
1) 15s PROCESS REEL — 4 shots: raw material → hands working → detail → reveal. No talking needed.
2) 30s STORY — {{principal}} on camera: "why I make {{offerings}}" — one take, natural light.
3) WALKTHROUGH — piece in its final space, slow pan, ambient sound.
4) COMMISSION EXPLAINER — 45s: how it works, timeline, price range (say "from…", never invent).
Script each in the studio chat; shoot batches; captions always on.${NOTE}`,
  },
];

const LANDING_PACK: SeedArtifact[] = [
  {
    slug: 'landing-structure', kind: 'doc', title: 'Landing page structure',
    detail: `${H('The page (order matters)')}
1) HERO: one full-bleed proof image + one sentence: what {{business_name}} makes for whom.
2) PROOF STRIP: 3-6 best pieces (from the vault, captions as alt).
3) HOW IT WORKS: 3 steps to a commission/booking.
4) ABOUT: {{principal}} in 2 paragraphs — story sells the premium.
5) INQUIRY FORM: name, email, project type, budget range (optional), message. Stores only.
6) FOOTER: compliance line, socials.
Build it with "Build the website" — the artwork flows in automatically.${NOTE}`,
  },
];

// ---------------------------------------------------------------------------
// Intel / audience / loop / ledger / launch / vault packs
// ---------------------------------------------------------------------------

const MARKET_INTEL: SeedArtifact[] = [
  {
    slug: 'market-comparison-framework', kind: 'research', title: 'Market comparison framework',
    detail: `${H('Comparison matrix for {{business_name}} (fill via Lead Finder + scans)')}
COMPETITORS — for each of 5: name | what they sell | price signal | channel presence | their gap.
DEMAND SIGNALS — what {{audience}} search/ask; seasonal peaks; local events that drive demand.
PRICING SCAN — collect 5 real price points from public sources before setting yours; note the
range and where {{offerings}} should sit and WHY (positioning, not wishful thinking).
YOUR EDGE — one sentence: the thing competitors can't copy.
Refresh quarterly; the world's intelligence flags this when it goes stale.${NOTE}`,
  },
  {
    slug: 'research-checklist', kind: 'research', title: 'Research checklist',
    detail: `${H('Before spending on marketing, know:')}
□ Who buys {{offerings}} (segments, from DNA) □ What they pay (5 real data points)
□ Where they look (channels) □ Who else sells to them (top 5) □ What triggers purchase
□ Seasonal timing □ Regulatory/compliance basics for this vertical
Each unchecked box is an open question — Garvis tracks these in the world's intelligence.${NOTE}`,
  },
];

const AUDIENCE_PACK: SeedArtifact[] = [
  {
    slug: 'audience-segmentation', kind: 'doc', title: 'Audience segmentation worksheet',
    detail: `${H('Segments (start from the DNA, refine with evidence)')}
For each segment ({{audience}}): WHO exactly | WHAT they need from {{offerings}} | WHERE to
reach them | TRIGGER moment | one-line pitch angle.
LIST BUILDING — in order of quality: past clients/referrals > inbound inquiries > Lead Finder
scans > events/communities > purchased lists (verify consent; suppression always wins).
Target: 50 named contacts before the first campaign. Upload as CSV here.${NOTE}`,
  },
];

const CRM_PACK: SeedArtifact[] = [
  {
    slug: 'pipeline-stages', kind: 'doc', title: 'Pipeline & follow-up playbook',
    detail: `${H('Stages')}
NEW → CONTACTED → REPLIED → QUALIFIED → PROPOSAL → WON/LOST.
FOLLOW-UP RULES: reply within 24h; no reply → touch at 3d, 10d, then monthly nurture; every
promise gets a dated next step. LOST is data: record the reason — it feeds reflection.${NOTE}`,
  },
];

const LEDGER_PACK: SeedArtifact[] = [
  {
    slug: 'kpi-tree', kind: 'doc', title: 'KPI tree — what to count',
    detail: `${H('Count these (all from real rows — sends, replies, inquiries)')}
REACH: sends, post reach · ENGAGEMENT: replies, inquiries · PIPELINE: qualified, proposals ·
REVENUE: won, avg value · EFFICIENCY: cost per inquiry.
WEEKLY REVIEW (ties to Reflection): what moved, what stalled, one thing to change.
Garvis fills what it can measure; the rest you log here honestly.${NOTE}`,
  },
];

const LAUNCH_PACK: SeedArtifact[] = [
  {
    slug: 'launch-checklist', kind: 'doc', title: 'Send/launch checklist',
    detail: `${H('Before anything goes out')}
□ Offer clear □ List clean (suppression respected — automatic) □ Compliance line present
□ Tracking in place (unique URL/QR) □ Follow-ups drafted □ Approval queued.
Everything external waits in Approvals — that is the design, not a delay.${NOTE}`,
  },
];

const VAULT_PACK: SeedArtifact[] = [
  {
    slug: 'vault-checklist', kind: 'doc', title: 'What belongs in this vault',
    detail: `${H('Collect here')}
□ Best 20 photos (hero-grade first — intake grades them) □ Logo/marks □ Bio + story
□ Price sheet □ Past client list □ Testimonials □ Press.
Everything uploaded is captioned and graded by intake, then flows into the website, social,
and mail automatically.${NOTE}`,
  },
];

const GENERIC_STUDIO: SeedArtifact[] = [
  {
    slug: 'studio-brief', kind: 'doc', title: 'Creative brief',
    detail: `${H('Brief for {{business_name}}')}
Voice: {{tone}}. Audience: {{audience}}. Offerings: {{offerings}}.
Every piece made here: one idea, one proof point, one CTA. Draft in the studio chat — it knows
the brand kit and the files in this area.${NOTE}`,
  },
];

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

const STUDIO_PACKS: Partial<Record<Flavor, SeedArtifact[]>> = {
  social: SOCIAL, direct_mail: DIRECT_MAIL, email: EMAIL_PACK, video: VIDEO_PACK, landing: LANDING_PACK,
};

/** Every (archetype, flavor) gets a NON-EMPTY expert pack — verified exhaustively. */
export function expertiseFor(archetype: Archetype, flavor: Flavor): SeedArtifact[] {
  switch (archetype) {
    case 'intel': return MARKET_INTEL;
    case 'audience': return AUDIENCE_PACK;
    case 'studio': return STUDIO_PACKS[flavor] ?? GENERIC_STUDIO;
    case 'launch': return flavor === 'direct_mail' ? [...LAUNCH_PACK, ...DIRECT_MAIL] : LAUNCH_PACK;
    case 'loop': return flavor === 'crm' ? CRM_PACK : EMAIL_PACK;
    case 'ledger': return LEDGER_PACK;
    case 'vault': return VAULT_PACK;
  }
}
