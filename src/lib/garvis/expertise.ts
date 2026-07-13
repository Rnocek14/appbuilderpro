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
import { H, NOTE, verticalOverlay, type SeedArtifact, type Vertical } from './verticals';

export type { SeedArtifact, Vertical } from './verticals';
export { detectVertical } from './verticals';

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

const BRAND_STUDIO: SeedArtifact[] = [
  {
    slug: 'brand-messaging-house', kind: 'doc', title: 'Messaging house',
    detail: `${H('The one-page brand argument for {{business_name}}')}
POSITIONING STATEMENT (fill each slot, then defend it):
"For {{audience}}, {{business_name}} is the only ___ that ___ — because ___ (proof)."
THREE PILLARS — the three things you want remembered, each with its receipts:
1) Pillar: ___  · Proof: a real result, piece, or fact from the vault.
2) Pillar: ___  · Proof: ___
3) Pillar: ___  · Proof: ___
TONE: {{tone}}. Write 5 DO words and 5 DON'T words (e.g., do: "crafted"; don't: "cheap").
THE LADDER: the 5-second line (one sentence), the 30-second version (elevator), the
2-minute story ({{principal}}'s why). Every studio in this world inherits this page —
when the messaging house changes, everything downstream changes with it.${NOTE}`,
  },
  {
    slug: 'brand-identity-checklist', kind: 'doc', title: 'Visual identity checklist',
    detail: `${H('Collect/decide these, store them in the vault')}
□ Logo: primary + one-color + mark-only variants, on light AND dark.
□ Palette: 1 primary, 1-2 accents, neutrals — hex codes written down, used everywhere.
□ Type: one heading face, one body face — named, with fallbacks.
□ Photography rules: what real photos look like here (light, crop, subjects) — and what
  never appears (stocky handshakes, fake smiles).
□ Templates: social post, story, one-pager, email header — built once, reused always.
Consistency compounds: the tenth exposure does the convincing, and it only counts if it
looks like the first nine.${NOTE}`,
  },
];

const MARKET_STUDIO: SeedArtifact[] = [
  {
    slug: 'market-update-format', kind: 'doc', title: 'Market update format',
    detail: `${H('The recurring update that makes {{business_name}} the source')}
THE SHAPE (same every time — the format IS the brand):
1) THREE NUMBERS from real sources (your records, a Market Intelligence scan, a public
   dataset) — each stated plainly with its source named.
2) "WHAT THIS MEANS" — one line per number, translated for {{audience}}.
3) ONE ACTION — what a reader should do or watch this period.
CADENCE: monthly minimum; same day, same channel. Consistency beats depth here — the
compounding asset is being the person who ALWAYS knows the numbers.
RULES: cite every figure; if a number can't be sourced, it doesn't run. Never extrapolate
beyond the data; "we don't know yet" is a credible sentence.${NOTE}`,
  },
];

const CRM_STUDIO: SeedArtifact[] = [
  {
    slug: 'crm-scripts', kind: 'doc', title: 'Call, voicemail & DM scripts',
    detail: `${H('Scripts (skeletons — fill with this world\'s facts, then say them like a human)')}
CALL OPENER (permission-based): "Hi — {{principal}} from {{business_name}}. Did I catch
you at a bad time?" → one-line reason for calling THEM specifically → one question.
VOICEMAIL (under 20s): name, one specific reason, callback number said slowly, twice.
DM/TEXT FIRST TOUCH: one line of genuine specificity about them + one low-pressure
question. Never paste the same message twice — specificity is the whole trick.
OBJECTION GRID (acknowledge → reframe → evidence → small ask):
- "Too expensive" → what's the cost of the alternative? → proof of value → smaller first step.
- "Bad timing" → agree, ask WHEN → calendar the follow-up in the loop, honor it.
- "Happy with current provider" → good! what would have to change? → stay warm, no bashing.
Marketing calls/texts require consent and DNC hygiene — see the launch checklist.${NOTE}`,
  },
];

const LISTS_STUDIO: SeedArtifact[] = [
  {
    slug: 'list-building-hygiene', kind: 'doc', title: 'List building & hygiene playbook',
    detail: `${H('The list is the asset — build it clean, keep it honest')}
SOURCES, RANKED BY CONSENT QUALITY: past clients/inquiries (best) > people who opted in for
something real (lead magnet, event) > scans/prospecting (cold — outreach rules apply) >
purchased lists (worst; verify provenance and permissions before ANY send).
HYGIENE CADENCE: prune hard bounces immediately (automatic here); sunset non-engagers
(no opens/clicks over a long window) to a re-permission pass, then let them go — a smaller
honest list outperforms a big dead one and protects deliverability.
SEGMENTATION MINIMUM: new vs known, customer vs prospect, and one interest split — three
cuts beat thirty empty ones. PERMISSION RULES: suppression always wins (unsubscribes are
sacred and automatic), every send through Approvals, physical address + visible opt-out
on every email.${NOTE}`,
  },
];

const ADS_STUDIO: SeedArtifact[] = [
  {
    slug: 'paid-ads-playbook', kind: 'doc', title: 'Paid ads playbook',
    detail: `${H('Paid acquisition for {{business_name}} — the operator\'s rules')}
STRUCTURE (both platforms): campaign (one objective) → ad set/group (one audience or keyword
theme) → ads (2-3 variants MAX per set — more splits the data into noise).
THE TESTING LADDER: start with ONE campaign, ONE audience, small daily budget. Kill nothing for
the first days (learning phase); judge on cost per LEAD (your form, measured), never platform
vanity metrics. Scale the survivor ~20-30% at a time; big jumps reset learning.
TRACKING IS NON-NEGOTIABLE: every ad's final URL carries ?src= / UTM parameters so clicks and
leads land in YOUR ledger — spend without tracking is spend without knowledge. Log spend in the
Results panel; cost-per-lead only exists as logged-spend ÷ measured-leads.
CREATIVE: your REAL photos outperform stock everywhere; the hook is the first 3 words / first
frame; one idea, one proof, one CTA per ad. Match the landing page to the ad's promise exactly.
BUDGET MATH (template — your numbers): daily budget × 30 = monthly test cost; leads needed to
break even = monthly cost ÷ value per customer. Decide the kill threshold BEFORE spending.
PLATFORM COMPLIANCE: each platform restricts targeting and claims by industry (housing,
credit, employment, health, finance are "special categories" with hard rules) — the launch
checklist in this world carries your industry's specifics.${NOTE}`,
  },
  {
    slug: 'ads-channel-map', kind: 'doc', title: 'Which ad channel does what',
    detail: `${H('Channels, by the job they do')}
GOOGLE SEARCH: catches EXISTING demand ("near me", "price of X") — highest intent, pay per
click. Start here when people already search for what {{business_name}} sells.
META (FB/IG): CREATES demand — visual, interest/lookalike audiences, cheap reach. Start here
for visual products and local awareness. Lead-form ads work without a landing page (but your
instrumented site measures better).
GOOGLE LSA / MAPS: local services — pay per lead, trust badge; strongest for home services.
YOUTUBE/TIKTOK: attention at scale, needs video; use after the social studio proves a format.
NEXTDOOR/YELP: neighborhood trust plays; strongest for local services with reviews.
LINKEDIN: B2B only — expensive clicks, precise titles.
RULE: master ONE channel to a measured cost-per-lead before adding the next.${NOTE}`,
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

// PRODUCT work is not marketing work: the feature lab's born-with knowledge is a product
// discipline, not a creative brief. This is also the honest AI-down floor for gen-features.
const FEATURE_LAB_PACK: SeedArtifact[] = [
  {
    slug: 'feature-ideation-frame', kind: 'doc', title: 'Feature ideation frame',
    detail: `${H('How this lab evaluates a feature for {{business_name}}')}
EVERY CONCEPT ANSWERS THREE THINGS: the user problem (whose day gets better, how) · the core
interaction in ONE line · why THIS platform specifically wins by having it.
RANGE THE SEARCH — concepts should span at least three of these axes, never five variants of one:
□ Power-user depth (what heavy users hack around today) □ First-five-minutes onboarding
□ Daily-return hooks (what brings them back tomorrow) □ Integrations (where users already live)
□ Trust & clarity (what confuses or worries new users).
PICK BY IMPACT × EFFORT: gut-score each concept 1-3 on both; argue the top-right cell first.
THEN SPEC IT: press "Write feature spec" steered with the winning concept — problem → who it
serves → v1 scope (say what's OUT) → data & dependencies → success metric → risks.
Evidence beats opinion: run Research on user complaints/competitor moves before ranking.${NOTE}`,
  },
];

// ANSWERING a message is not composing a campaign: the assist desk's born-with knowledge is a
// grounding discipline — reply only from the knowledge base, refuse over an empty one, and keep
// the knowledge base fed. This is the honest floor for the answering studio.
const ASSIST_PACK: SeedArtifact[] = [
  {
    slug: 'answering-discipline', kind: 'doc', title: 'How this desk answers',
    detail: `${H('The rule that makes replies safe for {{business_name}}')}
GROUND EVERY REPLY IN THE KNOWLEDGE BASE. The desk drafts only from what's on record here — your
policies, past answers, and facts. It does NOT invent a price, a date, an order detail, a name, or
a promise. If the knowledge base has nothing on the question, the desk REFUSES and tells you to add
an entry — a confident wrong answer is worse than none.
WHAT YOU DO: paste the incoming message → press "Draft the reply" → read it. Anything the knowledge
base couldn't cover comes back marked "[needs your input: …]" for you to fill. YOU copy and send —
the desk never sends for you, and nothing is automated.
VOICE: {{tone}}. Answer the person's actual question, courteous and specific, never "as an AI".${NOTE}`,
  },
  {
    slug: 'knowledge-base-starter', kind: 'doc', title: 'What to put in the knowledge base',
    detail: `${H('Feed the vault so the desk can answer')}
The desk is only as good as what it can stand on. Drop these into this world's vault (as documents
or artifacts) and each reply gets grounded in them:
□ Your policies — returns, refunds, shipping/turnaround, warranty, cancellation.
□ Canned answers to the questions you get most (write the reply you'd actually send).
□ Facts people ask for — hours, service area, what's included, what isn't.
□ Past replies you were happy with — they teach the desk your voice and your specifics.
KEEP IT CURRENT: when a reply comes back refused or you had to rewrite it, that's the signal — add
the missing entry. The ledger tracks kept-vs-rewritten so you can see where the base is thin.${NOTE}`,
  },
];

// PRODUCING a document is not writing a campaign: the document studio's born-with knowledge is a
// document-craft discipline — structure it, ground the facts, flag what's missing, export it clean.
const DELIVER_PACK: SeedArtifact[] = [
  {
    slug: 'document-craft', kind: 'doc', title: 'How this studio builds a document',
    detail: `${H('Producing a hand-over document for {{business_name}}')}
PICK THE TYPE, THEN THE SHAPE. Each document has a job and a skeleton: a PROPOSAL wins the work
(overview → scope → approach → timeline → investment → next steps); a REPORT informs (summary →
background → findings → recommendations); a ONE-PAGER orients at a glance; a BRIEF aligns people; a
LETTER speaks to one person. Start from the skeleton, drop a section the document doesn't need.
GROUND EVERY FACT. Prices, dates, terms, names, quantities come from the vault (rate card, terms,
past documents) or from your brief — NEVER invented. Anything missing is marked "[needs your input:
…]" so you fill it before it leaves. A confident wrong number in a proposal is worse than a blank.
EXPORT IT. The document leaves as Markdown, a printed/PDF page, or a real .docx — pick what the
recipient expects. You review and hand it off; nothing is auto-delivered.
BATCH IT. Same type + one line per recipient = a document each, personalized from the shared brief.${NOTE}`,
  },
  {
    slug: 'document-source-starter', kind: 'doc', title: 'What to put in the vault',
    detail: `${H('Feed the studio so documents ground themselves')}
The stronger the source material, the less you fill in by hand. Drop these into this world's vault:
□ Your rate card / pricing so "investment" sections cite real numbers.
□ Your standard terms, scope language, and warranty so proposals and contracts stay consistent.
□ Past documents you were happy with — they teach structure and your voice.
□ Credentials, case studies, and results you cite as proof.
KEEP IT CURRENT: when a document keeps coming back with "[needs your input: …]" in the same spot,
that's the signal — add the missing source, and the next document fills it automatically.${NOTE}`,
  },
];

// ANALYZING data is not writing copy: the data studio's born-with knowledge is a numeracy
// discipline — bring clean data, read the computed stats honestly, chart only what's real.
const DATA_PACK: SeedArtifact[] = [
  {
    slug: 'data-workspace-craft', kind: 'doc', title: 'How this workspace reads data',
    detail: `${H('Making honest sense of numbers for {{business_name}}')}
BRING A CLEAN CSV. First row is the header (column names); one record per row. Paste it or upload
the file. The workspace types each column (number / date / text) and computes the stats itself.
READ THE SUMMARY FIRST. For every numeric column you get count, sum, mean, MEDIAN, min, max, and
spread (stddev). Two honest tells: mean far from median means the data is skewed (a few big values
pulling the average); a large stddev next to the mean means the values are all over the place.
Missing cells are counted, never silently zeroed.
CHART ONLY WHAT'S REAL. Pick a category (or date) to group by and a number to aggregate — sum,
mean, count, min, max. The bar chart is drawn straight from that computation; there is no decorative
or invented data anywhere.
THE NUMBERS ARE COMPUTED, NEVER GUESSED. The optional "Interpret" read narrates only the figures on
the summary — it cannot state a number that wasn't computed. A wrong number is worse than none.${NOTE}`,
  },
  {
    slug: 'data-source-starter', kind: 'doc', title: 'What data to bring in',
    detail: `${H('Feed the workspace something worth analyzing')}
Export to CSV from wherever your numbers already live and drop it in the vault or straight into the
workspace:
□ Sales / orders — one row per sale, with amount, date, and a category (region, product, channel).
□ A metrics log — dates down the side, the numbers you track across the top.
□ Survey or form results — one row per response.
□ Any spreadsheet you keep by hand — save a sheet as CSV.
TIDY BEATS PRETTY: one thing per row, one measure per column, real headers, no merged cells or
totals rows mixed in. The cleaner the shape, the sharper the read.${NOTE}`,
  },
];

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

const STUDIO_PACKS: Partial<Record<Flavor, SeedArtifact[]>> = {
  social: SOCIAL, direct_mail: DIRECT_MAIL, email: EMAIL_PACK, video: VIDEO_PACK, landing: LANDING_PACK,
  brand: BRAND_STUDIO, market: MARKET_STUDIO, crm: CRM_STUDIO, lists: LISTS_STUDIO, ads: ADS_STUDIO,
  feature_lab: FEATURE_LAB_PACK, assist: ASSIST_PACK, deliver: DELIVER_PACK, data: DATA_PACK,
};

/** The FUNCTIONAL pack — what this kind of area knows how to do, regardless of industry. */
function basePack(archetype: Archetype, flavor: Flavor): SeedArtifact[] {
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

// ---------------------------------------------------------------------------
// PRODUCT-LAB pack set — a world whose studios are feature_lab does PRODUCT work, not marketing.
// Its born-with knowledge must match: platform research instead of pricing scans, source material
// instead of hero photos, shipped-thinking instead of send KPIs. Industry overlays (which are
// go-to-market advice) are deliberately NOT applied to product labs.
// ---------------------------------------------------------------------------

const PRODUCT_INTEL: SeedArtifact[] = [
  {
    slug: 'platform-research-frame', kind: 'research', title: 'Platform research frame',
    detail: `${H('Know the platform before inventing for it — {{business_name}}')}
USERS — who actually uses it, segmented by intensity (daily power users / weekly regulars /
churned). What does each group hack around, complain about, or export to other tools?
COMPETITORS — for each of 5: what they ship that users envy | their gap | their pricing posture.
COMPLAINT MINING — support threads, reviews, community posts: the top 10 recurring pains, verbatim.
ADJACENT MOVES — what neighboring products shipped lately that changed user expectations.
Each box unfilled is an open question — run Research here and the feature lab ranks better.${NOTE}`,
  },
];

const PRODUCT_VAULT: SeedArtifact[] = [
  {
    slug: 'vault-checklist', kind: 'doc', title: 'What belongs in this vault',
    detail: `${H('Collect here')}
□ Screenshots of the current product (the surfaces you want to improve) □ Docs/help center
extracts □ User feedback exports □ Competitor screenshots □ Internal terminology/glossary.
Everything uploaded is filed by intake and grounds the feature lab's concepts and specs —
a spec written against real screenshots beats one written from memory.${NOTE}`,
  },
];

const PRODUCT_LEDGER: SeedArtifact[] = [
  {
    slug: 'progress-ledger', kind: 'doc', title: 'Progress ledger — shipped thinking',
    detail: `${H('Count what this lab actually produces')}
EXPLORED: concepts generated · CHOSEN: concepts promoted to specs · SPECCED: full specs written ·
PITCHED/SHIPPED: what you carried into the platform's roadmap, and what happened to it.
WEEKLY REVIEW: which axis produced the winners (power-user? onboarding? retention?), what
died and why. Garvis fills what it can measure; log the pitched/shipped column here honestly.${NOTE}`,
  },
];

/** Pack selection for PRODUCT-LAB worlds: product variants for intel/vault/ledger, the functional
 *  base for studios (feature_lab resolves its own pack) — and NO industry overlay anywhere. */
export function productLabExpertiseFor(archetype: Archetype, flavor: Flavor): SeedArtifact[] {
  switch (archetype) {
    case 'intel': return PRODUCT_INTEL;
    case 'vault': return PRODUCT_VAULT;
    case 'ledger': return PRODUCT_LEDGER;
    default: return basePack(archetype, flavor);
  }
}

/** A product lab = has a feature_lab studio and no outreach machinery. */
export function isProductLab(charters: { archetype: Archetype; flavor: Flavor }[]): boolean {
  return charters.some((c) => c.archetype === 'studio' && c.flavor === 'feature_lab')
    && !charters.some((c) => c.archetype === 'launch' || c.archetype === 'audience');
}

// ---------------------------------------------------------------------------
// SINGLE-PURPOSE pack sets — an answering desk / document studio / data workspace is NOT a marketing
// operation, so its vault/intel/ledger must not be seeded with hero-photo checklists, competitor
// scans, and send-KPI trees (which describe an outreach business the user does not run). Each kind
// gets born-with content that matches what its areas actually hold and do. Mirrors productLab.
// ---------------------------------------------------------------------------

type SinglePurposeKind = 'assist' | 'deliver' | 'data';

const SINGLE_PURPOSE: Record<SinglePurposeKind, { vault: SeedArtifact[]; intel: SeedArtifact[]; ledger: SeedArtifact[] }> = {
  assist: {
    vault: [{
      slug: 'kb-vault', kind: 'doc', title: 'The knowledge base — what lives here',
      detail: `${H('This is what the desk answers from')}
The answering desk grounds every reply ONLY in what's here, and refuses when it finds nothing — so an
empty knowledge base means an empty desk. Put in: your policies (returns, shipping, refunds), canned
answers to the questions you get most, key facts (hours, service area, what's included), and past
replies you were happy with (they teach your voice). Add them fast with the "Add knowledge" box on the
desk, or drop a document/text file into any area's Files and it's ingested here automatically.${NOTE}`,
    }],
    intel: [{
      slug: 'who-writes-in', kind: 'doc', title: 'Who writes in — the question map',
      detail: `${H('The shape of your inbound, not a market')}
This isn't competitor research — it's understanding what people actually ask so the knowledge base can
cover it. List the TOP 10 questions you get, verbatim, and who asks them (new customers? existing?
vendors?). Each recurring question is a knowledge entry waiting to be written. When the desk refuses,
that's a new line for this list — and a new entry for the vault.${NOTE}`,
    }],
    ledger: [{
      slug: 'answered-log', kind: 'doc', title: 'Answered, not sent',
      detail: `${H('What this desk measures')}
Nothing is sent from here — you copy and send. Track instead: drafts KEPT as-is vs. rewritten (a high
rewrite rate means the knowledge base is thin there), and questions that came back REFUSED (the desk
had nothing on record). Both point at the same fix — add the missing answer. The desk gets sharper
because you feed it, never because it guessed.${NOTE}`,
    }],
  },
  deliver: {
    vault: [{
      slug: 'source-vault', kind: 'doc', title: 'Source material — what lives here',
      detail: `${H('What the documents draw on')}
Documents cite real numbers and terms only if the source is on record here. Put in: your rate card /
pricing (so "investment" sections are real), your standard terms, scope language, and warranty (so
proposals stay consistent), and past documents you were happy with (they teach structure and voice).
Add them with the "Add source material" box on the studio, or drop a file into any area's Files.${NOTE}`,
    }],
    intel: [{
      slug: 'the-recipient', kind: 'doc', title: 'Who receives this — what a strong one contains',
      detail: `${H('Aim the document, don\'t scan a market')}
This isn't a competitor scan — it's knowing your reader. For each kind of recipient (a prospect, a
client, an investor), note: the sections they actually care about, the proof they want to see, the
objection they arrive with, and the one outcome the document must drive. A document written to a real
reader beats a generic template — capture that here so every draft aims true.${NOTE}`,
    }],
    ledger: [{
      slug: 'documents-log', kind: 'doc', title: 'Documents made',
      detail: `${H('What this studio measures')}
Nothing is auto-delivered — you review and hand each off. Track: documents KEPT as-is vs. rewritten,
and the sections that keep coming back with "[needs your input: …]" — those mark exactly which source
material is missing from the vault. Add it, and the next document fills that section itself.${NOTE}`,
    }],
  },
  data: {
    vault: [{
      slug: 'datasets-vault', kind: 'doc', title: 'Datasets — what lives here',
      detail: `${H('The data you analyze')}
Keep the CSVs, exports, and logs you work from here — sales/orders, a metrics log, survey or form
results, anything you'd otherwise open in a spreadsheet. Tidy beats pretty: one thing per row, one
measure per column, real headers, no totals rows mixed in. Paste a CSV straight into the workspace, or
drop the file into Files. The cleaner the shape, the sharper the read.${NOTE}`,
    }],
    intel: [{
      slug: 'the-question', kind: 'doc', title: 'What you\'re answering with the data',
      detail: `${H('Frame the question, don\'t scan a market')}
Before the numbers, name what you want them to tell you: the decision you're trying to make, the
metric you actually care about, and what "good" would look like. A sharp question turns a table into an
answer; a vague one turns it into a wall of stats. Write the two or three questions this data should
settle — the workspace's charts and reads are only as useful as the question behind them.${NOTE}`,
    }],
    ledger: [{
      slug: 'analyses-log', kind: 'doc', title: 'Analyses run',
      detail: `${H('What this workspace measures')}
Every figure here is computed from your data, never guessed. Save the summaries you run so you can
compare them over time — the same metric month over month, or before-and-after a change. This log is
the honest record of what the numbers actually showed, kept so you can watch it move.${NOTE}`,
    }],
  },
};

/** A single-purpose world = an answering desk / document studio / data workspace: one grounded studio
 *  of that flavor and no outreach machinery. Returns the kind, or null for anything else. */
export function singlePurposeKind(charters: { archetype: Archetype; flavor: Flavor }[]): SinglePurposeKind | null {
  const studio = charters.find((c) => c.archetype === 'studio' && (c.flavor === 'assist' || c.flavor === 'deliver' || c.flavor === 'data'));
  if (!studio) return null;
  if (charters.some((c) => c.archetype === 'launch' || c.archetype === 'audience')) return null;
  return studio.flavor as SinglePurposeKind;
}

/** Pack selection for a single-purpose world: the studio keeps its craft pack; vault/intel/ledger get
 *  the kind-matched content instead of the marketing defaults. No industry overlay (like productLab). */
export function singlePurposeExpertiseFor(archetype: Archetype, flavor: Flavor, kind: SinglePurposeKind): SeedArtifact[] {
  const p = SINGLE_PURPOSE[kind];
  switch (archetype) {
    case 'vault': return p.vault;
    case 'intel': return p.intel;
    case 'ledger': return p.ledger;
    default: return basePack(archetype, flavor);
  }
}

/** The ONE born-with-pack selector, given the whole world's charters. Routes a cluster to the right
 *  pack by the world's SHAPE — product lab, single-purpose (answering desk / document studio / data
 *  workspace), or a marketing operation (with its industry overlay). Every seed/regenerate site uses
 *  this so a world never gets marketing packs in one place and coherent ones in another. */
export function seedPackFor(
  charters: { archetype: Archetype; flavor: Flavor }[],
  archetype: Archetype, flavor: Flavor, vertical: Vertical = 'generic',
): SeedArtifact[] {
  if (isProductLab(charters)) return productLabExpertiseFor(archetype, flavor);
  const sp = singlePurposeKind(charters);
  if (sp) return singlePurposeExpertiseFor(archetype, flavor, sp);
  return expertiseFor(archetype, flavor, vertical);
}

/** Every (archetype, flavor) gets a NON-EMPTY expert pack — verified exhaustively.
 *  With a vertical, the pack is COMPOSED: the functional base (how to run a social studio,
 *  a mail campaign, a KPI ledger) plus the industry overlay (what a real estate / finance /
 *  restaurant operator knows that a generic marketer doesn't — CMA method, due-diligence
 *  ladders, menu engineering, Fair Housing / SEC / HIPAA compliance flags). The base always
 *  stands first so index-stable callers keep working; overlays only ever add. */
export function expertiseFor(archetype: Archetype, flavor: Flavor, vertical: Vertical = 'generic'): SeedArtifact[] {
  return [...basePack(archetype, flavor), ...verticalOverlay(vertical, archetype, flavor)];
}
