// src/content/studio.ts
// THE STUDIO'S PUBLIC IDENTITY — one file, one honest source of truth for the prospect-facing
// site at "/". A prospect who gets the cold pitch googles the sender before replying; this page
// is what they must find, so everything it says must be as checkable as the email itself.
//
// ⚠ EDIT ME BEFORE GOING LIVE: name, city, and email below are seeded with the launch
// placeholder identity. Swap them for the studio's real identity (they should match the
// outreach sending identity — from_name / from_email / physical_address in Settings) and the
// whole page updates. Nothing else on the page hardcodes the brand.
//
// HONESTY RAILS (enforced by studio.verify.ts):
//   * Every copy string passes the same claims gate the cold email passes (claimViolations).
//   * No testimonial/review theater: the studio is new, and the page says so instead of faking
//     social proof. As real clients land, add real case studies — never before.
//   * The "instant reply" promise on the contact form is OFF by default: it may only be turned
//     on once the lead rail is live for this form (channel token set + auto_first_touch armed),
//     because the form then literally demonstrates the product. Until then the form promises a
//     human within one business day — a claim that is true on day zero.

export interface StudioIdentity {
  name: string;
  city: string;              // shown in the footer; keep to city/state until a real street address should be public
  email: string;             // the reply-to a prospect can actually reach
  tagline: string;
  /** site_channels token for the contact form (mint one in-app; see site-events). Null ⇒ the
   *  form degrades honestly to a "email us" panel — it never pretends to submit. */
  formChannelToken: string | null;
  /** Only set true when formChannelToken is live AND auto_first_touch is armed in Settings —
   *  the form's "answered in under a minute" line is a product demo, not marketing copy. */
  instantReplyLive: boolean;
}

export const STUDIO: StudioIdentity = {
  name: 'Anvil Web Studio',
  city: 'Lake Geneva, Wisconsin',
  email: 'hello@anvilwebstudio.com',
  tagline: 'We build your new website before you ever pay us.',
  formChannelToken: null,
  instantReplyLive: false,
};

/** The three-step model, exactly as the pipeline works — each step is a claim the code enforces. */
export const HOW_IT_WORKS = [
  {
    title: 'We read your current site first',
    body: 'Before we write a word, we read the actual code of your homepage and the pages it links. Anything we tell you about your site — no contact form, not mobile-ready, missing descriptions — held on every page we read, or we don’t say it.',
  },
  {
    title: 'We build the new site before we talk',
    body: 'You don’t get a proposal, a mood board, or a discovery call. You get a finished, working website built for your business — before any money changes hands. If it isn’t obviously better than what you have, close the tab. No obligation either way.',
  },
  {
    title: 'Nothing goes live without your approval',
    body: 'When you say yes, publishing takes a day. Every email the system sends on your behalf afterwards waits for your explicit approval first — suppression lists, unsubscribe, and sending limits are enforced on the server, not promised in a slide.',
  },
] as const;

/** The candor block — the anti-testimonial. Every sentence must stay true on day zero. */
export const CANDOR = {
  heading: 'Why trust a studio you’ve never heard of?',
  lines: [
    'You shouldn’t have to. That’s the point of building the site first: you judge the finished work, not our promises.',
    'You won’t find fake five-star walls or borrowed client logos here. We’re a new studio, and we’d rather prove it than claim it.',
    'Everything our system sends is approved by a human first, every recipient can unsubscribe in one click, and every claim in our emails is verified against your site’s real code before it’s written.',
  ],
} as const;

/** Industries offered in the pricing menu's selector — each maps through the same vertical
 *  detection the real pitch pipeline uses, so the menu can never disagree with the product. */
export const MENU_INDUSTRIES = [
  'Plumbing', 'Roofing', 'HVAC', 'Landscaping', 'Dental', 'Salon & Spa', 'Restaurant', 'Other',
] as const;
