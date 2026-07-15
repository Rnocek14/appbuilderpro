// src/lib/garvis/emailStudio.ts
// THE EMAIL STUDIO — pure core (verified by emailStudio.verify.ts). Clicking "Email" should open a
// STUDIO full of ideas and worked examples, not a single generated output. This module is the ideas:
// a catalog of email types a local business actually sends, and a deterministic engine that turns any
// one of them into a ready, editable example — with several distinct "angles" (renditions) each.
//
// HONESTY: every example is a real starting draft written from the facts we HAVE (business name,
// who signs it, phone, area). Anything specific we can't know is a visible [EDIT: …] hole the owner
// fills — never invented. {{first_name}} is a mail-merge field the send path fills per recipient.

import {
  type StudioCtx, type StudioIdea, type StudioSpec,
  area, biz, sign, pick, fillTokens,
} from './studioKit';

export type EmailCtx = StudioCtx;
export interface EmailExample { subject: string; body: string }

export interface EmailConcept extends StudioIdea {
  render: (ctx: EmailCtx, variant: number) => EmailExample;
}

// ---- real-estate concepts ------------------------------------------------------------------
const RE: EmailConcept[] = [
  {
    id: 're_new_listing', name: 'Just listed', emoji: '🏡', audience: 'realestate',
    blurb: 'Announce a new listing to your list before the crowd.',
    sample: 'Just listed in {area} — a first look', variants: 2,
    render: (c, v) => {
      const subj = pick([`Just listed in ${area(c)} — a first look`, `New on the market: [EDIT: address]`], v);
      const hook = pick([
        `I just listed a home in ${area(c)} and wanted you to see it before it hits the portals.`,
        `A new one just came to market in ${area(c)} — sending it your way first.`,
      ], v);
      return {
        subject: subj,
        body: `Hi {{first_name}},\n\n${hook}\n\n• [EDIT: address]\n• [EDIT: price] · [EDIT: beds/baths]\n• What makes it special: [EDIT: one standout — the view, the kitchen, the lot]\n\nWant a private walkthrough, or know someone who'd love it? Just reply and I'll set it up.\n\n${sign(c)}`,
      };
    },
  },
  {
    id: 're_just_sold', name: 'Just sold nearby', emoji: '✅', audience: 'realestate',
    blurb: 'Social proof + a soft "what\'s yours worth?" to neighbors.',
    sample: 'Sold in {area} — and what it means for you', variants: 2,
    render: (c, v) => ({
      subject: pick([`Just sold in ${area(c)}`, `Another ${area(c)} home just sold — here's what it means`], v),
      body: `Hi {{first_name}},\n\nI just helped a ${area(c)} owner sell [EDIT: how fast / over asking / detail].\n\n${pick([
        `Homes here are moving, and a lot of owners are surprised by what theirs would sell for today.`,
        `The market in ${area(c)} has shifted, and your home's number has probably moved with it.`,
      ], v)}\n\nIf you're curious — even just curious — I'll put together a free, no-pressure estimate for your place. Takes about five minutes, no obligation.\n\nJust reply "value" and I'll get started.\n\n${sign(c)}`,
    }),
  },
  {
    id: 're_open_house', name: 'Open house invite', emoji: '📅', audience: 'realestate',
    blurb: 'Invite your list (and their friends) to an open house.',
    sample: "You're invited — open house this [EDIT: day]", variants: 2,
    render: (c, v) => ({
      subject: pick([`Open house this [EDIT: day] in ${area(c)}`, `You're invited: [EDIT: address], [EDIT: day/time]`], v),
      body: `Hi {{first_name}},\n\n${pick([`Come by — I'm hosting an open house at a home I think you'll love.`, `Grab a coffee and stop in — open house this [EDIT: day].`], v)}\n\n• Where: [EDIT: address], ${area(c)}\n• When: [EDIT: day, time]\n• The short version: [EDIT: one line on the home]\n\nBring a friend who's house-hunting. Reply if you'd like the details or a private time instead.\n\n${sign(c)}`,
    }),
  },
  {
    id: 're_home_value', name: 'Free home valuation', emoji: '📈', audience: 'realestate',
    blurb: 'Find sellers — offer a no-pressure estimate of their home\'s worth.',
    sample: 'What your home is worth right now (free)', variants: 3,
    render: (c, v) => ({
      subject: pick([`What your ${area(c)} home is worth right now`, `A free, honest number for your home`, `Curious what your home would sell for?`], v),
      body: `Hi {{first_name}},\n\n${pick([
        `Values in ${area(c)} have moved, and if you own here you've probably wondered what that means for your place specifically.`,
        `A few of your neighbors have asked me lately what their homes are worth — so I'll offer you the same.`,
        `No pitch here — just an offer: a free, current estimate of what your home would sell for today.`,
      ], v)}\n\nI run these by hand — real comps, your home's actual features, no auto-generated guess. You get your number; what you do with it is entirely up to you.\n\nWant yours? Reply "number" and I'll take it from there.\n\n${sign(c)}`,
    }),
  },
  {
    id: 're_market_update', name: 'Monthly market update', emoji: '🗞️', audience: 'realestate',
    blurb: 'Stay top-of-mind with a short, useful local update.',
    sample: '{area} market — the 60-second version', variants: 2,
    render: (c, v) => ({
      subject: pick([`${area(c)} market — the 60-second version`, `What's happening in ${area(c)} this month`], v),
      body: `Hi {{first_name}},\n\nQuick read on ${area(c)} this month:\n\n• Homes are selling in [EDIT: avg days on market] days\n• Prices are [EDIT: up/down/flat — the honest trend]\n• What I'm watching: [EDIT: one real thing — inventory, rates, a neighborhood]\n\n${pick([`If you've been wondering whether it's a good time to make a move, reply and I'll give you my honest read for your situation.`, `Thinking about buying or selling this year? Reply and let's talk timing — no pressure.`], v)}\n\n${sign(c)}`,
    }),
  },
  {
    id: 're_price_improvement', name: 'Price improvement', emoji: '🔻', audience: 'realestate',
    blurb: 'Re-market a listing after a price drop.',
    sample: 'Price improved: [EDIT: address]', variants: 2,
    render: (c, v) => ({
      subject: pick([`Price improved on [EDIT: address]`, `New price in ${area(c)} — worth a second look`], v),
      body: `Hi {{first_name}},\n\n${pick([`Good news on a home I mentioned — the price just improved.`, `A home in ${area(c)} just got more attractive: the price came down.`], v)}\n\n• [EDIT: address]\n• Now: [EDIT: new price] (was [EDIT: old price])\n• Still the same [EDIT: what's great about it]\n\nIf it's back in range for you or someone you know, reply and I'll arrange a look.\n\n${sign(c)}`,
    }),
  },
  {
    id: 're_past_client', name: 'Stay in touch', emoji: '🤝', audience: 'realestate',
    blurb: 'Check in with a past client — warmth first, business second.',
    sample: 'Thinking of you — how\'s the house?', variants: 2,
    render: (c, v) => ({
      subject: pick([`How's the house treating you?`, `A quick hello from ${biz(c)}`], v),
      body: `Hi {{first_name}},\n\n${pick([
        `It's been a little while — I was thinking about you and wanted to check in. How's the home?`,
        `No agenda here, just a hello. Hope you're settled and loving the place.`,
      ], v)}\n\nIf you ever need a contractor recommendation, a market read, or a hand for a friend who's buying or selling, I'm one reply away — always happy to help.\n\n${sign(c)}`,
    }),
  },
  {
    id: 're_referral', name: 'Referral ask', emoji: '💬', audience: 'realestate',
    blurb: 'Gently ask happy past clients to send a friend your way.',
    sample: 'A small favor (and a thank-you)', variants: 2,
    render: (c, v) => ({
      subject: pick([`A small favor?`, `Know anyone thinking about a move?`], v),
      body: `Hi {{first_name}},\n\n${pick([
        `Working with you was a genuine highlight — thank you again for trusting me.`,
        `Hope all's well! Most of my work comes from people like you sending a friend my way.`,
      ], v)}\n\nIf anyone you know is even thinking about buying or selling in ${area(c)}, I'd be grateful for an introduction — I'll take great care of them, same as I did for you.\n\nNo pressure at all. Thank you either way.\n\n${sign(c)}`,
    }),
  },
];

// ---- general-business concepts -------------------------------------------------------------
const GEN: EmailConcept[] = [
  {
    id: 'gen_announcement', name: 'Announcement', emoji: '📣', audience: 'general',
    blurb: 'Tell your list about something new.',
    sample: 'Something new from {biz}', variants: 2,
    render: (c, v) => ({
      subject: pick([`Something new from ${biz(c)}`, `[EDIT: the news] — you'll want to see this`], v),
      body: `Hi {{first_name}},\n\n${pick([`I've got news I've been excited to share:`, `Quick one — here's what's new at ${biz(c)}:`], v)}\n\n[EDIT: what it is, in one or two lines]\n\n• Why it matters to you: [EDIT: the benefit]\n• How to get it: [EDIT: the next step]\n\nReply if you have any questions — happy to help.\n\n${sign(c)}`,
    }),
  },
  {
    id: 'gen_offer', name: 'Limited offer', emoji: '🏷️', audience: 'general',
    blurb: 'A time-boxed deal that creates a reason to act now.',
    sample: '[EDIT: offer] — this week only', variants: 2,
    render: (c, v) => ({
      subject: pick([`[EDIT: the offer] — this week only`, `A little something for you, {{first_name}}`], v),
      body: `Hi {{first_name}},\n\n${pick([`For a short window, I'm offering:`, `Wanted you to have first crack at this:`], v)}\n\n👉 [EDIT: the offer — what + how much]\n\n• Good through: [EDIT: end date]\n• How to claim it: [EDIT: reply / link / code]\n\nThat's it — no fine print games. Reply if you'd like it and I'll sort the rest.\n\n${sign(c)}`,
    }),
  },
  {
    id: 'gen_welcome', name: 'Welcome', emoji: '👋', audience: 'general',
    blurb: 'First email to a new subscriber or customer.',
    sample: 'Welcome — glad you\'re here', variants: 2,
    render: (c, v) => ({
      subject: pick([`Welcome to ${biz(c)}`, `Glad you're here, {{first_name}}`], v),
      body: `Hi {{first_name}},\n\n${pick([`Welcome — really glad you're here.`, `Thanks for joining ${biz(c)}. Here's what to expect.`], v)}\n\nA quick hello and what I'll send you:\n• [EDIT: what value they'll get]\n• [EDIT: how often]\n\nIf there's anything I can help with right now, just reply — a real person (me) reads these.\n\n${sign(c)}`,
    }),
  },
  {
    id: 'gen_newsletter', name: 'Monthly note', emoji: '🗞️', audience: 'general',
    blurb: 'A short, useful monthly update to stay top-of-mind.',
    sample: 'This month at {biz}', variants: 2,
    render: (c, v) => ({
      subject: pick([`This month at ${biz(c)}`, `${biz(c)} — the short version`], v),
      body: `Hi {{first_name}},\n\nA quick monthly note:\n\n• What's new: [EDIT: one update]\n• Something useful: [EDIT: a tip / resource your people care about]\n• Coming up: [EDIT: what's next]\n\n${pick([`As always, reply if I can help with anything.`, `Hit reply anytime — I love hearing from you.`], v)}\n\n${sign(c)}`,
    }),
  },
  {
    id: 'gen_winback', name: 'We miss you', emoji: '🔁', audience: 'general',
    blurb: 'Re-engage someone who\'s gone quiet.',
    sample: 'Been a while, {{first_name}}', variants: 2,
    render: (c, v) => ({
      subject: pick([`Been a while, {{first_name}}`, `Still here whenever you need us`], v),
      body: `Hi {{first_name}},\n\n${pick([`It's been a bit — I wanted to check in and see how you're doing.`, `No hard feelings if life got busy. Just a friendly hello from ${biz(c)}.`], v)}\n\nIf it's helpful, here's a reason to come back: [EDIT: an offer / what's new].\n\nAnd if now's not the time, that's completely fine — the door's always open.\n\n${sign(c)}`,
    }),
  },
  {
    id: 'gen_review', name: 'Ask for a review', emoji: '⭐', audience: 'general',
    blurb: 'Ask a happy customer for a quick review.',
    sample: 'A quick favor (30 seconds)', variants: 2,
    render: (c, v) => ({
      subject: pick([`A quick favor — 30 seconds?`, `Would you mind sharing your experience?`], v),
      body: `Hi {{first_name}},\n\n${pick([`It was a pleasure working with you — thank you.`, `Hope you're happy with how everything turned out!`], v)}\n\nIf you have half a minute, a short review would mean a lot and helps others find ${biz(c)}:\n👉 [EDIT: your review link]\n\nNo worries at all if you'd rather not — either way, thank you.\n\n${sign(c)}`,
    }),
  },
];

export const EMAIL_CONCEPTS: EmailConcept[] = [...RE, ...GEN];

/** The ideas to show for this business — real-estate concepts for a real-estate world, general
 *  ones otherwise (plus any marked 'both'). Order is the gallery order. */
export function conceptsFor(realEstate: boolean): EmailConcept[] {
  return EMAIL_CONCEPTS.filter((k) => k.audience === 'both' || k.audience === (realEstate ? 'realestate' : 'general'));
}

export function conceptById(id: string): EmailConcept | null {
  return EMAIL_CONCEPTS.find((k) => k.id === id) ?? null;
}

/** Build a ready, editable example of one email idea, in a chosen angle (variant wraps). Returns a
 *  visible-hole draft — never an invented fact. */
export function buildEmailExample(conceptId: string, ctx: EmailCtx, variant = 0): EmailExample | null {
  const k = conceptById(conceptId);
  if (!k) return null;
  const ex = k.render(ctx, variant);
  // Fill the gallery-card {biz}/{area} placeholders in any sample-style subject that slipped through.
  return { subject: fillTokens(ex.subject, ctx), body: fillTokens(ex.body, ctx) };
}

/** The teaser subject for a gallery card (tokens filled), so every idea shows an example up front. */
export function conceptSample(k: StudioIdea, ctx: EmailCtx): string {
  return fillTokens(k.sample, ctx);
}

/** The Email studio as a plug-in for the shared IdeaStudio scaffold. */
export const EMAIL_SPEC: StudioSpec = {
  kind: 'email', emoji: '✉️', title: 'Email studio',
  subtitle: 'Pick an idea — each opens a ready email you can spin, edit, and save.',
  savePrefix: 'Email',
  ideasFor: conceptsFor,
  sampleFor: conceptSample,
  build: (id, ctx, v) => {
    const ex = buildEmailExample(id, ctx, v);
    return ex ? { parts: [{ label: 'Subject', value: ex.subject }, { label: 'Body', value: ex.body, multiline: true }] } : null;
  },
};
