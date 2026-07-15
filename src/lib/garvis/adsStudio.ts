// src/lib/garvis/adsStudio.ts
// THE ADS STUDIO — a gallery of paid-ad ideas (Meta + Google), each a ready, editable campaign draft.
// Same system + voice as the email studio (studioKit): pick an idea → a worked example with all the
// fields a real ad needs (primary text, headline, audience, keywords, landing), spin a different
// angle, edit, save. Verified by adsStudio.verify.ts.
//
// HONESTY: examples are starting drafts from the facts we HAVE. Budget, landing URL, and any specific
// claim are visible [EDIT: …] holes — never invented. These are DRAFTS to launch YOURSELF: Garvis does
// not place paid ads for you (there is no ad-launch integration), so the finished ad is copied into
// Meta/Google Ads Manager by hand. Nothing here spends, and no approval auto-launches an ad.

import { type StudioCtx, type StudioIdea, type StudioSpec, type StudioExample, area, biz, pick, fillTokens } from './studioKit';

export interface AdIdea extends StudioIdea {
  render: (ctx: StudioCtx, variant: number) => StudioExample;
}

const P = (label: string, value: string, multiline = false) => ({ label, value, multiline });

// ---- real-estate ad ideas ------------------------------------------------------------------
const RE: AdIdea[] = [
  {
    id: 'ads_meta_valuation', name: 'Meta — free home valuation', emoji: '📊', audience: 'realestate',
    blurb: 'Facebook/Instagram lead ad to find sellers in your area.', sample: 'Meta lead ad · “What’s your {area} home worth?”', variants: 2,
    render: (c, v) => ({
      parts: [
        P('Platform & goal', 'Meta (Facebook + Instagram) · Lead form'),
        P('Primary text', pick([
          `Curious what your ${area(c)} home would sell for today? Get a free, no-obligation estimate — I run every one by hand, not an auto-generated guess.`,
          `${area(c)} home values have moved. Find out what yours is worth in about a minute — free, no pressure, no spam.`,
        ], v), true),
        P('Headline', pick([`What’s your ${area(c)} home worth?`, `Free home valuation — ${area(c)}`], v)),
        P('Description', 'Real, current numbers from a local expert.'),
        P('Audience', `Homeowners, age 35–70, within [EDIT: X] miles of ${area(c)}. Exclude renters if possible.`),
        P('Call to action', 'Get quote'),
        P('Daily budget', '[EDIT: e.g. $10–20/day to start] · Landing: [EDIT: your valuation form URL]'),
      ],
    }),
  },
  {
    id: 'ads_meta_new_listing', name: 'Meta — new listing', emoji: '🏡', audience: 'realestate',
    blurb: 'Put a fresh listing in front of local buyers + their friends.', sample: 'Meta traffic ad · a new listing', variants: 2,
    render: (c, v) => ({
      parts: [
        P('Platform & goal', 'Meta · Traffic / Engagement'),
        P('Primary text', pick([
          `Just listed in ${area(c)} 🏡 [EDIT: one line — the view, the kitchen, the price]. Tap to see the photos and book a private tour.`,
          `New on the market in ${area(c)}. [EDIT: standout feature]. Homes like this don’t sit long — take a look before the open house.`,
        ], v), true),
        P('Headline', pick([`Just listed in ${area(c)}`, `[EDIT: price] · [EDIT: beds/baths] in ${area(c)}`], v)),
        P('Description', 'Photos + private tours — tap for details.'),
        P('Audience', `${area(c)} + [EDIT: X]-mile radius · home-buying interests · age 28–60.`),
        P('Call to action', 'Learn more'),
        P('Daily budget', '[EDIT: budget] · Landing: [EDIT: the listing page URL]'),
      ],
    }),
  },
  {
    id: 'ads_meta_just_sold', name: 'Meta — just sold (social proof)', emoji: '✅', audience: 'realestate',
    blurb: 'Turn a recent sale into seller leads from the neighbors.', sample: 'Meta lead ad · “Just sold near you”', variants: 2,
    render: (c, v) => ({
      parts: [
        P('Platform & goal', 'Meta · Lead form'),
        P('Primary text', pick([
          `Just sold in ${area(c)} — [EDIT: over asking / in X days / detail]. If you’ve wondered what your home would go for in this market, I’ll tell you, free.`,
          `Another ${area(c)} home just closed. Prices here have shifted — reply and I’ll send you an honest number for yours, no obligation.`,
        ], v), true),
        P('Headline', `Just sold near you in ${area(c)}`),
        P('Description', 'See what your home is worth now.'),
        P('Audience', `Homeowners near [EDIT: the sold address], ${area(c)}.`),
        P('Call to action', 'Learn more'),
        P('Daily budget', '[EDIT: budget] · Landing: [EDIT: your valuation form URL]'),
      ],
    }),
  },
  {
    id: 'ads_google_sell', name: 'Google — “sell my house”', emoji: '🔎', audience: 'realestate',
    blurb: 'Catch high-intent sellers searching Google right now.', sample: 'Google Search · sellers in {area}', variants: 2,
    render: (c, v) => ({
      parts: [
        P('Platform & goal', 'Google Search · Leads'),
        P('Headlines (≤30 chars each)', [
          pick([`Sell Your ${area(c)} Home`, `${area(c)} Home Selling`], v),
          'Free Home Valuation',
          'Local Agent, Real Results',
        ].join('\n'), true),
        P('Descriptions (≤90 chars each)', [
          `Thinking of selling in ${area(c)}? Get a free, honest valuation from a local expert.`,
          'No pressure, no obligation — just a real number and a plan. Call or request online.',
        ].join('\n'), true),
        P('Keywords', `sell my house ${area(c)}\nhome value ${area(c)}\n${area(c)} real estate agent\nhow much is my home worth`, true),
        P('Final URL', '[EDIT: your valuation / seller landing page URL]'),
      ],
    }),
  },
  {
    id: 'ads_google_buy', name: 'Google — “homes for sale”', emoji: '🔑', audience: 'realestate',
    blurb: 'Reach buyers searching for homes in your area.', sample: 'Google Search · buyers in {area}', variants: 2,
    render: (c, v) => ({
      parts: [
        P('Platform & goal', 'Google Search · Leads / Traffic'),
        P('Headlines (≤30 chars each)', [
          pick([`Homes for Sale ${area(c)}`, `${area(c)} Homes & Listings`], v),
          'See New Listings First',
          'Tour Homes This Week',
        ].join('\n'), true),
        P('Descriptions (≤90 chars each)', [
          `Browse ${area(c)} homes and get new listings the day they hit the market.`,
          'Work with a local agent who knows the neighborhoods. Book a tour today.',
        ].join('\n'), true),
        P('Keywords', `homes for sale ${area(c)}\n${area(c)} houses for sale\nnew listings ${area(c)}\nreal estate ${area(c)}`, true),
        P('Final URL', '[EDIT: your listings / IDX search page URL]'),
      ],
    }),
  },
  {
    id: 'ads_meta_retarget', name: 'Meta — retarget site visitors', emoji: '🎯', audience: 'realestate',
    blurb: 'Bring back people who visited but didn’t reach out.', sample: 'Meta retargeting · warm visitors', variants: 2,
    render: (c, v) => ({
      parts: [
        P('Platform & goal', 'Meta · Retargeting (site visitors, last 30 days)'),
        P('Primary text', pick([
          `Still thinking about ${area(c)}? I’m here whenever you’re ready — a quick question or a full plan, no pressure either way.`,
          `Saw you were browsing homes in ${area(c)}. Want new listings sent to you the day they hit the market? Just reply.`,
        ], v), true),
        P('Headline', `Ready when you are — ${biz(c)}`),
        P('Description', 'A local expert, one message away.'),
        P('Audience', 'Website visitors (Pixel) + Instagram engagers, last 30 days.'),
        P('Call to action', 'Contact us'),
        P('Daily budget', '[EDIT: small — $5–10/day] · Landing: [EDIT: contact page URL]'),
      ],
    }),
  },
];

// ---- general-business ad ideas -------------------------------------------------------------
const GEN: AdIdea[] = [
  {
    id: 'ads_meta_offer', name: 'Meta — offer / promotion', emoji: '🏷️', audience: 'general',
    blurb: 'Drive action with a time-boxed offer.', sample: 'Meta conversion ad · your offer', variants: 2,
    render: (c, v) => ({
      parts: [
        P('Platform & goal', 'Meta · Conversions / Leads'),
        P('Primary text', pick([
          `[EDIT: the offer] at ${biz(c)} — but only through [EDIT: end date]. Tap to claim it before it’s gone.`,
          `We don’t run offers often, so here’s a good one: [EDIT: the offer]. Ends [EDIT: date].`,
        ], v), true),
        P('Headline', pick(['[EDIT: the offer] — this week', `A deal from ${biz(c)}`], v)),
        P('Description', '[EDIT: one line on why it’s worth it]'),
        P('Audience', `[EDIT: your customer] within [EDIT: X] miles · age [EDIT: range].`),
        P('Call to action', 'Shop now'),
        P('Daily budget', '[EDIT: budget] · Landing: [EDIT: the offer page URL]'),
      ],
    }),
  },
  {
    id: 'ads_meta_awareness', name: 'Meta — local expert / awareness', emoji: '📣', audience: 'general',
    blurb: 'Introduce the business to your local market.', sample: 'Meta awareness ad · meet {biz}', variants: 2,
    render: (c, v) => ({
      parts: [
        P('Platform & goal', 'Meta · Awareness / Reach'),
        P('Primary text', pick([
          `Meet ${biz(c)} — [EDIT: what you do, in one honest line]. Proudly serving ${area(c)}.`,
          `Local, trusted, and here for you: ${biz(c)}. [EDIT: the one thing that makes you different].`,
        ], v), true),
        P('Headline', `${biz(c)} — ${area(c)}`),
        P('Description', '[EDIT: your tagline]'),
        P('Audience', `${area(c)} + [EDIT: X]-mile radius · [EDIT: relevant interests].`),
        P('Call to action', 'Learn more'),
        P('Daily budget', '[EDIT: budget] · Landing: [EDIT: your homepage URL]'),
      ],
    }),
  },
  {
    id: 'ads_google_service', name: 'Google — “[service] near me”', emoji: '🔎', audience: 'general',
    blurb: 'Capture high-intent searches for what you do.', sample: 'Google Search · high intent', variants: 2,
    render: (c, v) => ({
      parts: [
        P('Platform & goal', 'Google Search · Leads / Calls'),
        P('Headlines (≤30 chars each)', [
          pick(['[EDIT: Your Service] Near You', `${area(c)} [EDIT: Service]`], v),
          `Top-Rated in ${area(c)}`,
          'Fast, Fair, Local',
        ].join('\n'), true),
        P('Descriptions (≤90 chars each)', [
          `Looking for [EDIT: service] in ${area(c)}? ${biz(c)} — [EDIT: your one-line promise].`,
          'Free quotes. Local team. Call or request online today.',
        ].join('\n'), true),
        P('Keywords', `[EDIT: service] near me\n[EDIT: service] ${area(c)}\nbest [EDIT: service] ${area(c)}\n[EDIT: service] company`, true),
        P('Final URL', '[EDIT: your service / contact page URL]'),
      ],
    }),
  },
  {
    id: 'ads_google_brand', name: 'Google — brand defense', emoji: '🛡️', audience: 'general',
    blurb: 'Own your own name so competitors don’t bid on it.', sample: 'Google Search · your brand name', variants: 2,
    render: (c, v) => ({
      parts: [
        P('Platform & goal', 'Google Search · Brand (cheap, high-converting)'),
        P('Headlines (≤30 chars each)', [
          biz(c).slice(0, 30),
          pick(['Official Site', 'Book Direct'], v),
          `${area(c)} · Contact Us`,
        ].join('\n'), true),
        P('Descriptions (≤90 chars each)', [
          `The official ${biz(c)} site. [EDIT: your one-line promise].`,
          'Call, book, or request a quote directly — no middleman.',
        ].join('\n'), true),
        P('Keywords', `${biz(c).toLowerCase()}\n${biz(c).toLowerCase()} ${area(c).toLowerCase()}\n${biz(c).toLowerCase()} reviews`, true),
        P('Final URL', '[EDIT: your homepage URL]'),
      ],
    }),
  },
  {
    id: 'ads_meta_retarget_gen', name: 'Meta — retarget site visitors', emoji: '🎯', audience: 'general',
    blurb: 'Win back people who visited but didn’t buy.', sample: 'Meta retargeting · warm visitors', variants: 2,
    render: (c, v) => ({
      parts: [
        P('Platform & goal', 'Meta · Retargeting (site visitors, last 30 days)'),
        P('Primary text', pick([
          `Still deciding? Here’s a little nudge from ${biz(c)}: [EDIT: an offer or reassurance].`,
          `You checked us out — thank you! Any questions, just reply. And if it helps: [EDIT: offer].`,
        ], v), true),
        P('Headline', `Come back to ${biz(c)}`),
        P('Description', '[EDIT: the reason to return]'),
        P('Audience', 'Website visitors + engagers, last 30 days.'),
        P('Call to action', 'Shop now'),
        P('Daily budget', '[EDIT: small — $5–10/day] · Landing: [EDIT: the page they viewed]'),
      ],
    }),
  },
];

export const AD_IDEAS: AdIdea[] = [...RE, ...GEN];

export function adIdeasFor(realEstate: boolean): AdIdea[] {
  return AD_IDEAS.filter((k) => k.audience === 'both' || k.audience === (realEstate ? 'realestate' : 'general'));
}
export function adById(id: string): AdIdea | null { return AD_IDEAS.find((k) => k.id === id) ?? null; }

export function buildAdExample(id: string, ctx: StudioCtx, variant = 0): StudioExample | null {
  const k = adById(id);
  if (!k) return null;
  const ex = k.render(ctx, variant);
  return { parts: ex.parts.map((p) => ({ ...p, value: fillTokens(p.value, ctx) })) };
}

export const ADS_SPEC: StudioSpec = {
  kind: 'ads', emoji: '📣', title: 'Ads studio',
  subtitle: 'Pick a campaign idea — each opens a ready ad you can spin, edit, and save. These are drafts to launch yourself in Meta/Google Ads Manager — Garvis doesn’t place paid ads for you.',
  savePrefix: 'Ad',
  ideasFor: adIdeasFor,
  sampleFor: (k, ctx) => fillTokens(k.sample, ctx),
  build: buildAdExample,
};
