// src/lib/garvis/postcardBoard.ts
// THE POSTCARD ADAPTER for the creative board — the pure half. It knows how to turn a prompt + a chosen
// KIND into a real postcard tile (a MailerSpec), how to spin a RENDITION from a plain-language
// instruction ("warmer", "call it Just Sold", "night scene"), and how to build an HONEST image prompt.
// It reuses the real postcard compiler (mailer.ts) and the image-honesty gate (imagegen.ts) — so every
// tile is a genuine 6×9 card and no AI image ever stands in for a specific real home. Deterministic —
// verified by postcardBoard.verify.ts. The impure half (load materials, call the image model, persist,
// export) lives in postcardBoardRun.ts.

import { compileMailer, type MailerSpec, type MailerConcept, type MailerBrand } from './mailer';
import { canGenerateImage, buildImagePrompt, type ImagePromptResult } from './imagegen';
import type { CampaignType } from './campaignCore';
import type { BusinessContext } from './genesis';

/** A postcard tile's content: the compiled card, its look variant, and how its image was sourced. */
export interface PostcardContent {
  spec: MailerSpec;
  variant: number;                       // 0..2 — a genuinely different LOOK from the same materials
  kindId: string;
  campaignType: CampaignType;
  imageMode: 'photo' | 'brand' | 'ai';   // real photo · designed brand card · AI illustration
  aiNote: string | null;                 // the honesty label shown when imageMode === 'ai'
  /** The board-copy editor's verdict when AI wrote these words (1-10 + its notes). Persisted with the tile. */
  quality?: { score: number; notes: string } | null;
}

/** One "kind" of postcard — the chips on the make bar. Maps to a persuasion concept + a campaign type
 *  (which decides, honestly, whether an AI image is allowed or a real photo is required). */
export interface PostcardKind {
  id: string;
  label: string;
  emoji: string;
  hint: string;
  concept: MailerConcept;
  campaignType: CampaignType;
  headline: string;          // default front headline (may carry visible [EDIT: …] holes)
  offer: string;             // default back offer line (may carry [EDIT: …] holes)
  needsRealPhoto: boolean;   // listing types — an AI image would misrepresent a specific home
}

const clip = (s: string, n = 48) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

// Real-estate kinds. Listing types (just_*/open_house) require the REAL home photo — the honesty gate
// in imagegen.ts refuses AI imagery for them, and we mirror that with needsRealPhoto.
export const POSTCARD_KINDS_RE: PostcardKind[] = [
  { id: 'just_listed', label: 'Just Listed', emoji: '🏡', hint: 'A new listing — the real home photo, front and center.',
    concept: 'proof', campaignType: 'just_listed', headline: 'Just Listed', offer: '[EDIT: address · price · beds/baths]', needsRealPhoto: true },
  { id: 'just_sold', label: 'Just Sold', emoji: '🔑', hint: 'Social proof for the neighborhood — a sold home.',
    concept: 'proof', campaignType: 'just_sold', headline: 'Just Sold', offer: '[EDIT: sale price · days on market]', needsRealPhoto: true },
  { id: 'open_house', label: 'Open House', emoji: '📆', hint: 'Drive walk-ins to a showing.',
    concept: 'urgency', campaignType: 'open_house', headline: 'Open House — [EDIT: date & time]', offer: '[EDIT: address]', needsRealPhoto: true },
  { id: 'thinking_of_selling', label: 'Thinking of selling?', emoji: '🤔', hint: 'Prospect sellers — a lifestyle/brand card, AI image OK.',
    concept: 'question', campaignType: 'find_sellers', headline: 'Thinking of selling?', offer: '[EDIT: your hook — e.g. homes near you are moving fast]', needsRealPhoto: false },
  { id: 'free_valuation', label: 'Free valuation', emoji: '💵', hint: 'A no-obligation offer that gets replies.',
    concept: 'offer_first', campaignType: 'find_sellers', headline: 'What’s your home worth?', offer: 'Free, no-obligation home valuation', needsRealPhoto: false },
  { id: 'neighborhood_expert', label: 'Neighborhood expert', emoji: '📍', hint: 'Own a farm area — you as the local agent.',
    concept: 'local_authority', campaignType: 'find_sellers', headline: '[EDIT: neighborhood]’s agent', offer: '[EDIT: why you — recent sales, years here]', needsRealPhoto: false },
  { id: 'market_update', label: 'Market update', emoji: '📈', hint: 'One real stat that positions you as the source.',
    concept: 'local_authority', campaignType: 'find_sellers', headline: '[EDIT: area] market, right now', offer: '[EDIT: one real stat — median price, days on market]', needsRealPhoto: false },
];

// Generic-business kinds — every one is brand/lifestyle, so AI imagery is allowed.
export const POSTCARD_KINDS_GENERIC: PostcardKind[] = [
  { id: 'announce', label: 'Announcement', emoji: '📣', hint: "Something new — say the one thing that matters.",
    concept: 'proof', campaignType: 'announce', headline: '[EDIT: what’s new]', offer: '[EDIT: the one thing to know]', needsRealPhoto: false },
  { id: 'promo', label: 'Offer / promo', emoji: '🏷️', hint: 'A deal that IS the headline.',
    concept: 'offer_first', campaignType: 'promo', headline: '[EDIT: the offer, big]', offer: '[EDIT: the deal + how long it stands]', needsRealPhoto: false },
  { id: 'event', label: 'Event', emoji: '🎉', hint: 'Drive turnout to a date.',
    concept: 'urgency', campaignType: 'event', headline: '[EDIT: event] — [EDIT: date]', offer: '[EDIT: where & when]', needsRealPhoto: false },
  { id: 'reach', label: 'Reach new customers', emoji: '✨', hint: 'Open with the question they’re already asking.',
    concept: 'question', campaignType: 'reach', headline: '[EDIT: a question your customer is asking]', offer: '[EDIT: what you do, plainly]', needsRealPhoto: false },
];

export function postcardKindsFor(realEstate: boolean): PostcardKind[] {
  return realEstate ? POSTCARD_KINDS_RE : POSTCARD_KINDS_GENERIC;
}
export function kindById(id: string): PostcardKind | null {
  return [...POSTCARD_KINDS_RE, ...POSTCARD_KINDS_GENERIC].find((k) => k.id === id) ?? null;
}
/** The kind a free-typed idea (no chip picked) becomes — always a lifestyle/brand kind so an AI image
 *  is honest. */
export function defaultKind(realEstate: boolean): PostcardKind {
  return realEstate ? POSTCARD_KINDS_RE[3] /* thinking_of_selling */ : POSTCARD_KINDS_GENERIC[3] /* reach */;
}

/** The real materials the compiler needs — mirrors MailerMaterials but without importing the impure
 *  loader (postcardBoardRun.ts supplies these from loadMailerMaterials). */
export interface PostcardMaterials {
  ctx: BusinessContext | null;
  brand: MailerBrand | null;
  images: { url: string; caption: string | null; label: string | null }[];
}

const BLANK_CTX: BusinessContext = {
  business_name: '', principal: null, craft: null, offerings: [], audience: null, locale: null, links: {}, tone: null,
};

/** Build a postcard tile from a kind. If an image is supplied (AI result or chosen photo) it is used;
 *  otherwise a listing kind falls back to the best real vault photo, and a lifestyle kind opens as a
 *  designed brand card (no photo) until an image is generated. Honest throughout — never invented. */
export function buildPostcardContent(args: {
  materials: PostcardMaterials;
  kind: PostcardKind;
  idea?: string;
  image?: { url: string; alt?: string | null; mode: 'ai' | 'photo'; note?: string | null } | null;
  variant?: number;
}): PostcardContent {
  const { materials, kind, image } = args;
  const ctx = materials.ctx ?? BLANK_CTX;
  const idea = (args.idea ?? '').trim();

  // A free-idea lifestyle kind lets the idea shape the headline; structured kinds keep their template.
  const headline = kind.id === 'reach' && idea ? clip(idea) : kind.headline;

  let imageUrl: string | null = null;
  let imageAlt: string | null = null;
  let imageMode: PostcardContent['imageMode'];
  let aiNote: string | null = null;

  if (image) {
    imageUrl = image.url; imageAlt = image.alt ?? null;
    imageMode = image.mode === 'ai' ? 'ai' : 'photo';
    aiNote = image.mode === 'ai' ? (image.note ?? 'AI-generated illustration — not a real photo.') : null;
  } else if (kind.needsRealPhoto) {
    const hero = materials.images[0] ?? null;   // listing → the real home photo, or a brand card if none
    imageUrl = hero?.url ?? null;
    imageAlt = hero?.caption ?? null;
    imageMode = hero ? 'photo' : 'brand';
  } else {
    imageMode = 'brand';                         // lifestyle → designed brand card until an image is made
  }

  const spec = compileMailer({
    ctx, brand: materials.brand, concept: kind.concept,
    imageUrl, imageAlt, offer: kind.offer, headline,
  });

  return { spec, variant: args.variant ?? 0, kindId: kind.id, campaignType: kind.campaignType, imageMode, aiNote };
}

/** Directive parsing for a rendition: does the instruction ask to change the words (a headline), or the
 *  look/feel (a visual change we route to image regen)? */
const HEADLINE_RE = /^\s*(?:headline|call it|title|say|make it say)\s*[:\-]?\s*["“']?(.+?)["”']?\s*$/i;

export interface RenditionResult {
  content: PostcardContent;
  wantsImage: boolean;        // true → the run should regenerate the front image with imageStyle
  imageStyle: string | null;  // the instruction, as a style nudge for the image model
}

/** Spin a rendition from a plain-language instruction. Always advances the LOOK (so the child is
 *  visibly different), applies a headline directive when the instruction is a text change, and otherwise
 *  flags a visual change for the image model. Pure — the impure image regen happens in the run. */
export function applyRendition(parent: PostcardContent, instruction: string): RenditionResult {
  const instr = (instruction ?? '').trim();
  const variant = ((parent.variant + 1) % 3 + 3) % 3;
  const hm = HEADLINE_RE.exec(instr);

  if (hm) {
    // A words change — keep the image, restyle the layout, set the new headline. The listing-honesty
    // backstop runs here: renaming a card to a listing claim reclassifies it (and strips AI imagery).
    const spec: MailerSpec = { ...parent.spec, front: { ...parent.spec.front, headline: clip(hm[1]) } };
    return { content: enforceListingHonesty({ ...parent, spec, variant }).content, wantsImage: false, imageStyle: null };
  }

  // A look/feel change — advance the variant now; regenerate the image (unless it's a real photo we must
  // not replace, or an empty instruction). A listing kind (needsRealPhoto) keeps its real photo.
  const canImage = !!instr && canGenerateImage(parent.campaignType) && parent.imageMode !== 'photo';
  return { content: { ...parent, variant }, wantsImage: canImage, imageStyle: instr || null };
}

/** THE LISTING-HONESTY BACKSTOP. Renaming a lifestyle card's headline to "Just Sold!" must not smuggle
 *  an AI image past the real-photo rule — a listing claim requires the real home photo. If a headline
 *  (from an edit, a rendition, or the copy seam) makes a listing claim, the card is RECLASSIFIED to the
 *  matching listing type and any AI imagery is stripped back to the brand design. Pure; callers toast. */
const LISTING_CLAIM: [RegExp, CampaignType][] = [
  [/\bjust\s+listed\b/i, 'just_listed'],
  [/\bjust\s+sold\b/i, 'just_sold'],
  [/\bopen\s+house\b/i, 'open_house'],
];
export function enforceListingHonesty(content: PostcardContent): { content: PostcardContent; reclassified: CampaignType | null; strippedAI: boolean } {
  const claim = LISTING_CLAIM.find(([re]) => re.test(content.spec.front.headline))?.[1] ?? null;
  if (!claim || claim === content.campaignType) return { content, reclassified: null, strippedAI: false };
  const strippedAI = content.imageMode === 'ai';
  return {
    content: {
      ...content,
      campaignType: claim,
      ...(strippedAI ? { imageMode: 'brand' as const, aiNote: null, spec: { ...content.spec, front: { ...content.spec.front, imageUrl: null } } } : {}),
    },
    reclassified: claim,
    strippedAI,
  };
}

/** Fields the board-copy AI seam may write — WORDS only. Pure applier: patches exactly the named
 *  fields and never touches imageMode / the photo rules, so the listing-photo honesty gate is
 *  untouchable from here. Unknown/empty fields leave the current words in place. */
export interface PostcardCopyFields { headline?: string; sub?: string; body?: string; cta?: string }
export function applyCopyFields(content: PostcardContent, f: PostcardCopyFields): PostcardContent {
  const headline = typeof f.headline === 'string' && f.headline.trim() ? clip(f.headline.trim()) : null;
  const spec: MailerSpec = {
    ...content.spec,
    front: {
      ...content.spec.front,
      ...(headline ? { headline } : {}),
      ...(typeof f.sub === 'string' && f.sub.trim() ? { kicker: f.sub.trim() } : {}),
    },
    back: {
      ...content.spec.back,
      ...(headline ? { headline } : {}),
      ...(typeof f.body === 'string' && f.body.trim() ? { body: f.body.trim() } : {}),
      ...(typeof f.cta === 'string' && f.cta.trim() ? { cta: f.cta.trim() } : {}),
    },
  };
  // The seam writes words, but words can make listing claims — the honesty backstop still applies.
  return enforceListingHonesty({ ...content, spec }).content;
}

/** Apply a generated image to a tile (the run calls this after the model returns). */
export function withGeneratedImage(content: PostcardContent, url: string, note: string | null): PostcardContent {
  return {
    ...content,
    imageMode: 'ai',
    aiNote: note ?? 'AI-generated illustration — not a real photo.',
    spec: { ...content.spec, front: { ...content.spec.front, imageUrl: url } },
  };
}

/** Apply an uploaded/real photo to a tile. */
export function withPhoto(content: PostcardContent, url: string, alt: string | null): PostcardContent {
  return {
    ...content,
    imageMode: 'photo',
    aiNote: null,
    spec: { ...content.spec, front: { ...content.spec.front, imageUrl: url, imageAlt: alt ?? content.spec.front.imageAlt } },
  };
}

/** Build the honest AI-image prompt for a tile, or a refusal (listing types must use the real photo). */
export function postcardImagePrompt(content: PostcardContent, materials: PostcardMaterials, style: string | null): ImagePromptResult {
  const ctx = materials.ctx;
  return buildImagePrompt({
    campaignType: content.campaignType,
    area: ctx?.locale ?? null,
    businessName: ctx?.business_name ?? null,
    subject: content.spec.front.headline,
    highlight: content.spec.back.offer,
    style: style ?? null,
  });
}

/** True when this tile's kind can ever carry an AI image (mirrors the honesty gate). */
export function tileAllowsAI(content: PostcardContent): boolean {
  return canGenerateImage(content.campaignType);
}
