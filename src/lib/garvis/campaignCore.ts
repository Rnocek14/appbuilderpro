// src/lib/garvis/campaignCore.ts
// ONE listing (or one prospecting angle) → the WHOLE marketing set, in one pure function. This is
// the heart of the "make everything at once" flow: the operator fills one short form and gets a
// designed postcard, a few ready social captions, and an email — all from the SAME real inputs.
//
// Honesty rules (load-bearing):
//  • Every number (price, beds, baths) is a STRING the operator typed — never computed, never invented.
//  • Missing facts become visible [EDIT: …] holes AND a warning, never a plausible guess.
//  • Listing pieces (just listed / sold / open house) carry the REAL property photo. The prospecting
//    piece ("thinking of selling in Lake Geneva?") shows NO property — it's a brand/lifestyle card,
//    so a photo is optional and nothing about a specific home is claimed.
//  • Pure + deterministic: no AI, no clock, no randomness. Same input → same set, offline.

import { compileMailer, type MailerBrand, type MailerConcept, type MailerSpec } from './mailer';
import type { BusinessContext } from './genesis';

export type CampaignType = 'just_listed' | 'just_sold' | 'open_house' | 'find_sellers';

export const CAMPAIGN_TYPES: { id: CampaignType; label: string; blurb: string; needsPhoto: boolean; needsAddress: boolean }[] = [
  { id: 'just_listed', label: 'Just Listed', blurb: 'A new listing hits the market.', needsPhoto: true, needsAddress: true },
  { id: 'just_sold',   label: 'Just Sold',   blurb: 'A recent sale — proof you move homes.', needsPhoto: true, needsAddress: true },
  { id: 'open_house',  label: 'Open House',  blurb: 'Invite the neighborhood in.', needsPhoto: true, needsAddress: true },
  { id: 'find_sellers', label: 'Find sellers', blurb: 'Prospect a neighborhood — no listing needed.', needsPhoto: false, needsAddress: false },
];

export interface CampaignInput {
  type: CampaignType;
  businessName?: string | null;
  agentName?: string | null;
  agentPhone?: string | null;
  address?: string | null;      // listing address
  price?: string | null;        // "$450,000" — the operator's string, never math
  beds?: string | null;
  baths?: string | null;
  area?: string | null;         // neighborhood / town
  highlight?: string | null;    // "what's special" / the angle line
  openWhen?: string | null;     // "Sat 1–3pm"
  brand?: MailerBrand | null;
  photoUrl?: string | null;
  photoAlt?: string | null;
  link?: string | null;         // tracking link → QR
}

export interface SocialPost { platformHint: string; caption: string }
export interface CampaignSet {
  type: CampaignType;
  headline: string;
  postcard: MailerSpec;
  socialPosts: SocialPost[];
  email: { subject: string; body: string };
  warnings: string[];
}

const EDIT = (what: string) => `[EDIT: ${what}]`;

function ctxFor(input: CampaignInput): BusinessContext {
  return {
    business_name: (input.businessName || input.agentName || '').trim(),
    principal: (input.agentName || '').trim() || null,
    craft: 'real estate',
    offerings: [],
    audience: input.area ? `${input.area} homeowners` : null,
    locale: (input.area || '').trim() || null,
    links: input.link ? { site: input.link } : {},
    tone: null,
  };
}

/** A short "4bd · 3ba" style line from whatever the operator gave — omitted cleanly when empty. */
function specsLine(input: CampaignInput): string {
  const bits = [
    input.beds?.trim() ? `${input.beds.trim()} bd` : '',
    input.baths?.trim() ? `${input.baths.trim()} ba` : '',
  ].filter(Boolean);
  return bits.join(' · ');
}

/** Compose the whole set. Deterministic; honest holes for anything missing. */
export function composeCampaign(input: CampaignInput): CampaignSet {
  const warnings: string[] = [];
  const addr = (input.address || '').trim();
  const price = (input.price || '').trim();
  const area = (input.area || '').trim();
  const highlight = (input.highlight || '').trim();
  const specs = specsLine(input);
  const agent = (input.agentName || input.businessName || '').trim();
  const phone = (input.agentPhone || '').trim();

  if (input.type !== 'find_sellers' && !addr) warnings.push('No address yet — add it so the card and posts name the home.');
  if ((input.type === 'just_listed' || input.type === 'just_sold') && !price) warnings.push('No price yet — add it, or the card leaves a fill-in.');
  if (input.type === 'find_sellers' && !area) warnings.push('No neighborhood yet — add the area you want to farm.');
  if (CAMPAIGN_TYPES.find((t) => t.id === input.type)?.needsPhoto && !input.photoUrl) warnings.push('No photo yet — a listing card is strongest with the real home photo.');
  if (!agent) warnings.push('Add your name and phone so people know who to call.');

  // ---- the campaign's core headline (front of the card) ----
  let headline: string;
  let concept: MailerConcept;
  let offer: string;
  switch (input.type) {
    case 'just_listed':
      headline = `Just Listed${addr ? ` — ${addr}` : ''}${price ? `, ${price}` : ''}`;
      concept = input.photoUrl ? 'proof' : 'offer_first';
      offer = highlight || 'Book a private showing — scan the code for photos & details.';
      break;
    case 'just_sold':
      headline = `Just Sold${addr ? ` — ${addr}` : ''}`;
      concept = input.photoUrl ? 'proof' : 'local_authority';
      offer = highlight || `Thinking of selling${area ? ` in ${area}` : ''}? Let's talk about your home's value.`;
      break;
    case 'open_house':
      headline = `Open House${input.openWhen ? ` — ${input.openWhen.trim()}` : ''}`;
      concept = input.photoUrl ? 'proof' : 'question';
      offer = `${addr ? `${addr}. ` : ''}${input.openWhen ? `${input.openWhen.trim()}. ` : ''}Come see it in person.`.trim() || EDIT('when and where the open house is');
      break;
    case 'find_sellers':
    default:
      headline = highlight || `Thinking of selling${area ? ` in ${area}` : ''}?`;
      concept = 'local_authority';
      offer = `Curious what your${area ? ` ${area}` : ''} home is worth? Scan for a free, no-pressure estimate.`;
      break;
  }

  const postcard = compileMailer({
    ctx: ctxFor(input),
    brand: input.brand ?? null,
    concept,
    imageUrl: input.photoUrl ?? null,
    imageAlt: input.photoAlt ?? (addr || area || null),
    offer,
    linkUrl: input.link ?? null,
    headline,
  });

  // ---- social: three distinct, ready-to-post captions from the same facts ----
  const socialPosts = socialFor(input, { addr, price, area, highlight, specs });

  // ---- email: one subject + body ----
  const email = emailFor(input, { addr, price, area, highlight, specs, agent, phone });

  return { type: input.type, headline, postcard, socialPosts, email, warnings };
}

interface Bits { addr: string; price: string; area: string; highlight: string; specs: string }

function socialFor(input: CampaignInput, b: Bits): SocialPost[] {
  const where = b.addr || (b.area ? `${b.area}` : '');
  const specLine = b.specs ? `${b.specs}. ` : '';
  const highlight = b.highlight || EDIT('one line about what makes this special');
  if (input.type === 'find_sellers') {
    const area = b.area || EDIT('the neighborhood');
    return [
      { platformHint: 'facebook/instagram', caption: `Thinking of selling in ${area}? Homes here are moving. Curious what yours is worth — no pressure, no obligation. DM me “VALUE”. 🏡` },
      { platformHint: 'facebook/instagram', caption: `Life in ${area} is good. ${b.highlight || 'If a move has crossed your mind, I can walk you through what your home would sell for today.'} Let’s talk.` },
      { platformHint: 'facebook/instagram', caption: `Free home-value estimate for ${area} homeowners. Five minutes, real numbers, zero pressure. Comment “ESTIMATE” or DM me. 📈` },
    ];
  }
  if (input.type === 'just_sold') {
    return [
      { platformHint: 'facebook/instagram', caption: `SOLD${b.addr ? ` — ${b.addr}` : ''}! 🎉 Another happy seller${b.area ? ` in ${b.area}` : ''}. Thinking of selling? Let’s find out what your home is worth.` },
      { platformHint: 'facebook/instagram', caption: `Just closed${b.area ? ` in ${b.area}` : ''}. ${highlight} Homes are moving — if you’ve wondered about your timing, message me.` },
      { platformHint: 'facebook/instagram', caption: `Another one sold. If you’re curious what your${b.area ? ` ${b.area}` : ''} home would go for in today’s market, I’ll run the numbers for you — free.` },
    ];
  }
  if (input.type === 'open_house') {
    const when = input.openWhen?.trim() || EDIT('open house day & time');
    return [
      { platformHint: 'facebook/instagram', caption: `🚪 OPEN HOUSE ${when}${b.addr ? ` · ${b.addr}` : ''}. ${specLine}Come take a look — bring a friend who’s house-hunting!` },
      { platformHint: 'facebook/instagram', caption: `You’re invited 👋 ${b.addr || 'This one'} is open ${when}. ${highlight} Stop by, no appointment needed.` },
      { platformHint: 'facebook/instagram', caption: `Know someone looking${b.area ? ` in ${b.area}` : ''}? Send them our way — open house ${when}${b.addr ? ` at ${b.addr}` : ''}.` },
    ];
  }
  // just_listed
  return [
    { platformHint: 'facebook/instagram', caption: `🏡 JUST LISTED${where ? ` — ${where}` : ''}${b.price ? ` · ${b.price}` : ''}\n${specLine}${highlight}\nDM me for a private showing.` },
    { platformHint: 'facebook/instagram', caption: `New on the market${b.area ? ` in ${b.area}` : ''}! ${specLine}${b.highlight || 'Move-in ready and priced to sell.'} Link for photos & details.` },
    { platformHint: 'facebook/instagram', caption: `Know someone house-hunting${b.area ? ` in ${b.area}` : ''}? Tag them 👇 ${b.addr ? `${b.addr} ` : 'This one '}just hit the market${b.price ? ` at ${b.price}` : ''}.` },
  ];
}

function emailFor(input: CampaignInput, b: Bits & { agent: string; phone: string }): { subject: string; body: string } {
  const sign = `${b.agent || EDIT('your name')}${b.phone ? `\n${b.phone}` : ''}`;
  const specLine = b.specs ? `${b.specs}\n` : '';
  if (input.type === 'find_sellers') {
    const area = b.area || EDIT('your neighborhood');
    return {
      subject: `Curious what your ${area} home is worth?`,
      body: `Hi there,\n\nHomes in ${area} have been moving, and a lot of owners are surprised by what theirs would sell for today.\n\nIf you’ve ever wondered — even out of curiosity — I’m happy to put together a free, no-pressure estimate for your home. It takes about five minutes and there’s no obligation at all.\n\nJust reply to this email and I’ll get started.\n\n${sign}`,
    };
  }
  if (input.type === 'just_sold') {
    return {
      subject: `Just sold${b.area ? ` in ${b.area}` : ''} — is your home next?`,
      body: `Hi there,\n\nI just closed on ${b.addr || 'another home'}${b.area ? ` in ${b.area}` : ''}. ${b.highlight || 'The right marketing brought the right buyer.'}\n\nHomes are moving right now. If you’ve thought about selling, I’d be glad to tell you what yours could sell for — free, and with no pressure.\n\nReply anytime.\n\n${sign}`,
    };
  }
  if (input.type === 'open_house') {
    const when = input.openWhen?.trim() || EDIT('day & time');
    return {
      subject: `Open house ${when}${b.addr ? ` — ${b.addr}` : ''}`,
      body: `Hi there,\n\nYou’re invited to an open house at ${b.addr || EDIT('the address')} on ${when}.\n${specLine}${b.highlight ? `${b.highlight}\n` : ''}\nStop by — no appointment needed. Know someone who’s house-hunting? Please pass this along.\n\n${sign}`,
    };
  }
  // just_listed
  return {
    subject: `Just listed${b.addr ? `: ${b.addr}` : ''}${b.price ? ` (${b.price})` : ''}`,
    body: `Hi there,\n\nA new home just hit the market${b.area ? ` in ${b.area}` : ''}${b.addr ? `: ${b.addr}` : ''}${b.price ? `, listed at ${b.price}` : ''}.\n${specLine}${b.highlight || EDIT('a line about what makes this home special')}\n\nWant a private showing, or know someone who might be interested? Just reply and I’ll set it up.\n\n${sign}`,
  };
}
