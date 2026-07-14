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

// Real-estate announcements and generic ones. The composer shows one set OR the other based on the
// business; the SAME machine (headline + offer + photo → postcard + social + email) drives both.
export type RealEstateType = 'just_listed' | 'just_sold' | 'open_house' | 'find_sellers';
export type GenericType = 'announce' | 'promo' | 'event' | 'reach';
export type CampaignType = RealEstateType | GenericType;

export interface CampaignTypeMeta { id: CampaignType; label: string; blurb: string; needsPhoto: boolean; needsAddress: boolean }

export const CAMPAIGN_TYPES: CampaignTypeMeta[] = [
  { id: 'just_listed', label: 'Just Listed', blurb: 'A new listing hits the market.', needsPhoto: true, needsAddress: true },
  { id: 'just_sold',   label: 'Just Sold',   blurb: 'A recent sale — proof you move homes.', needsPhoto: true, needsAddress: true },
  { id: 'open_house',  label: 'Open House',  blurb: 'Invite the neighborhood in.', needsPhoto: true, needsAddress: true },
  { id: 'find_sellers', label: 'Find sellers', blurb: 'Prospect a neighborhood — no listing needed.', needsPhoto: false, needsAddress: false },
];

// Works for ANY business — a bakery, a consultant, a shop, a launch.
export const GENERIC_CAMPAIGNS: CampaignTypeMeta[] = [
  { id: 'announce', label: 'Announce something', blurb: 'Something new — a product, service, or update.', needsPhoto: false, needsAddress: false },
  { id: 'promo',    label: 'Offer / sale',       blurb: 'A special offer, sale, or discount.',           needsPhoto: false, needsAddress: false },
  { id: 'event',    label: 'Event',              blurb: 'An event, opening, class, or launch.',          needsPhoto: false, needsAddress: false },
  { id: 'reach',    label: 'Find customers',     blurb: 'Reach new people — brand & awareness.',         needsPhoto: false, needsAddress: false },
];

const GENERIC_IDS = new Set<CampaignType>(['announce', 'promo', 'event', 'reach']);

/** The right type list for a business. */
export function campaignsFor(realEstate: boolean): CampaignTypeMeta[] {
  return realEstate ? CAMPAIGN_TYPES : GENERIC_CAMPAIGNS;
}
export function metaFor(type: CampaignType): CampaignTypeMeta | null {
  return [...CAMPAIGN_TYPES, ...GENERIC_CAMPAIGNS].find((t) => t.id === type) ?? null;
}

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
  highlight?: string | null;    // "what's special" / the angle / why it matters
  openWhen?: string | null;     // "Sat 1–3pm"
  subject?: string | null;      // generic: what you're announcing ("Our new fall menu")
  details?: string | null;      // generic: the specifics (date, price, what's included)
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
    craft: null,   // never hard-code the trade — a bakery's card must not say "our real real estate"
    offerings: (input.subject || '').trim() ? [(input.subject as string).trim()] : [],
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

/** Compose the whole set. Deterministic; honest holes for anything missing. Routes real-estate
 *  announcements and generic ones through the same postcard/social/email machine. */
export function composeCampaign(input: CampaignInput): CampaignSet {
  if (GENERIC_IDS.has(input.type)) return composeGeneric(input);
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
    phone: input.agentPhone ?? null,
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

// ---------------------------------------------------------------------------
// GENERIC — the same machine for any business (bakery, consultant, shop, launch).
// ---------------------------------------------------------------------------

function composeGeneric(input: CampaignInput): CampaignSet {
  const warnings: string[] = [];
  const biz = (input.businessName || input.agentName || '').trim();
  const subject = (input.subject || '').trim();
  const details = (input.details || '').trim();
  const why = (input.highlight || '').trim();
  const agent = (input.agentName || input.businessName || '').trim();
  const phone = (input.agentPhone || '').trim();

  if (!subject) warnings.push('Tell me what you’re announcing — one short line.');
  if (!biz && !agent) warnings.push('Add your business name so people know who this is from.');
  if (input.type === 'event' && !details) warnings.push('Add the event details (when & where), or the pieces leave a fill-in.');

  // With a photo → 'proof' (photo-forward). Without → 'local_authority', which builds a clean brand
  // card from the business name + what-you-do (offerings := subject) with no photo reference.
  const concept: MailerConcept = input.photoUrl ? 'proof' : 'local_authority';
  let headline: string;
  let offer: string;
  switch (input.type) {
    case 'promo':
      headline = subject || 'A special offer';
      offer = details || 'For a limited time — mention this card.';
      break;
    case 'event':
      headline = subject || 'You’re invited';
      offer = details || EDIT('when and where the event is');
      break;
    case 'reach':
      headline = subject || (biz ? `Meet ${biz}` : 'Say hello');
      offer = why || details || 'Get in touch — we’d love to help.';
      break;
    case 'announce':
    default:
      headline = subject || (biz ? `New at ${biz}` : 'Something new');
      offer = details || why || 'Come see what’s new.';
      break;
  }

  const postcard = compileMailer({
    ctx: ctxFor(input), brand: input.brand ?? null, concept,
    imageUrl: input.photoUrl ?? null, imageAlt: input.photoAlt ?? (subject || biz || null),
    offer, linkUrl: input.link ?? null, headline, phone: input.agentPhone ?? null,
  });

  const g = { biz, subject, details, why, agent, phone };
  return { type: input.type, headline, postcard, socialPosts: socialForGeneric(input, g), email: emailForGeneric(input, g), warnings };
}

interface GBits { biz: string; subject: string; details: string; why: string; agent: string; phone: string }

function socialForGeneric(input: CampaignInput, g: GBits): SocialPost[] {
  const subj = g.subject || EDIT('what you’re announcing');
  const at = g.biz ? ` at ${g.biz}` : '';
  const det = g.details ? ` ${g.details}` : '';
  const fb = 'facebook/instagram';
  switch (input.type) {
    case 'promo':
      return [
        { platformHint: fb, caption: `🎉 ${subj}!${det} For a limited time — don’t miss it.` },
        { platformHint: fb, caption: `Deal alert${at}: ${subj}.${det} ${g.why}`.trim() },
        { platformHint: fb, caption: `Tag a friend who needs this 👇 ${subj}${det}` },
      ];
    case 'event':
      return [
        { platformHint: fb, caption: `📅 You’re invited: ${subj}.${det} Hope to see you there!` },
        { platformHint: fb, caption: `Save the date${at} — ${subj}.${det} ${g.why}`.trim() },
        { platformHint: fb, caption: `Know someone who’d enjoy this? Bring them along 👋 ${subj}${det}` },
      ];
    case 'reach':
      return [
        { platformHint: fb, caption: `${g.biz ? `${g.biz} — ` : ''}${g.why || 'here to help.'}${det}`.trim() },
        { platformHint: fb, caption: `New here? Here’s what we do${at}: ${g.why || subj}.` },
        { platformHint: fb, caption: `Have a question? DM us — we’re happy to help${at}.` },
      ];
    case 'announce':
    default:
      return [
        { platformHint: fb, caption: `📣 ${subj}!${det}${g.biz ? ` — ${g.biz}` : ''}` },
        { platformHint: fb, caption: `Something new${at}: ${subj}.${det} ${g.why}`.trim() },
        { platformHint: fb, caption: `Have you seen this yet? ${subj}.${det} 👇` },
      ];
  }
}

function emailForGeneric(input: CampaignInput, g: GBits): { subject: string; body: string } {
  const sign = `${g.agent || g.biz || EDIT('your name')}${g.phone ? `\n${g.phone}` : ''}`;
  const subj = g.subject || EDIT('what you’re announcing');
  const detLine = g.details ? `${g.details}\n` : '';
  const whyLine = g.why ? `${g.why}\n` : '';
  switch (input.type) {
    case 'promo':
      return { subject: subj, body: `Hi there,\n\nFor a limited time: ${subj}.\n${detLine}${whyLine}\nReply anytime — happy to help.\n\n${sign}` };
    case 'event':
      return { subject: `You’re invited: ${subj}`, body: `Hi there,\n\nYou’re invited to ${subj}.\n${detLine}${whyLine}\nHope to see you there — feel free to bring a friend.\n\n${sign}` };
    case 'reach':
      return { subject: g.biz ? `A quick hello from ${g.biz}` : 'A quick hello', body: `Hi there,\n\n${g.why || (g.biz ? `I wanted to introduce ${g.biz}.` : 'I wanted to reach out.')}\n${detLine}\nIf there’s ever anything I can help with, just reply.\n\n${sign}` };
    case 'announce':
    default:
      return { subject: subj, body: `Hi there,\n\n${g.biz ? `${g.biz} has something new: ` : ''}${subj}.\n${detLine}${whyLine}\nWant to know more? Just reply.\n\n${sign}` };
  }
}
