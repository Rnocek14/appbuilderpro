// src/lib/garvis/socialBoard.ts
// THE SOCIAL ADAPTER for the creative board — the pure half. Same idea as the postcard adapter, but the
// tile is a platform-native social post (Instagram / Facebook / LinkedIn / X). It knows how to turn a
// KIND (Just Listed, Market tip, Client love, …) + a platform into a real post (caption + hashtags +
// image, honest [EDIT] holes for anything we can't know), how to spin a RENDITION (a different platform
// or a restyled image), and how to size the image per platform. Deterministic — verified by
// socialBoard.verify.ts. The impure half (image gen + the approval-gated queue) lives in socialBoardRun.ts.
//
// HONESTY: real facts fill in; unknowns are visible [EDIT] holes; listing kinds must use the real home
// photo (AI refused, same gate as postcards); the no-photo state is a clearly-designed brand card, never
// a faked photograph. Nothing posts from here — a post is queued to the approval-gated publisher.

import { canGenerateImage, buildImagePrompt, type ImagePromptResult } from './imagegen';
import type { CampaignType, SocialPlatform } from './campaignCore';
import type { BusinessContext } from './genesis';

export type { SocialPlatform };
export const PLATFORM_ORDER: SocialPlatform[] = ['instagram', 'facebook', 'linkedin', 'x'];

/** A social tile's content: the post, its platform, and how its image was sourced. */
export interface SocialContent {
  platform: SocialPlatform;
  kindId: string;
  campaignType: CampaignType;      // for the AI-image honesty gate
  caption: string;                 // the post body — real facts filled, unknowns as [EDIT] holes
  hashtags: string[];
  headline: string | null;         // the no-photo brand card's headline
  imageUrl: string | null;
  imageMode: 'photo' | 'brand' | 'ai';
  aiNote: string | null;
}

/** The real materials the content builder needs (socialBoardRun supplies these from the world + brand). */
export interface SocialMaterials {
  businessName: string;
  area: string | null;
  realEstate: boolean;
  accent: string;
  avatarUrl: string | null;
  images: { url: string; caption: string | null; label: string | null }[];
  // Voice for the copy seam — the difference between on-brand words and generic AI copy.
  tone?: string | null;
  audience?: string | null;
  offerings?: string[];
}

export interface SocialKind {
  id: string;
  label: string;
  emoji: string;
  hint: string;
  campaignType: CampaignType;
  needsRealPhoto: boolean;
  caption: (m: SocialMaterials) => string;
  hashtags: (m: SocialMaterials) => string[];
  headline: string;
}

const bizOf = (m: SocialMaterials) => (m.businessName.trim() || '[EDIT: your business]');
const areaOf = (m: SocialMaterials) => ((m.area && m.area.trim()) || '[EDIT: your area]');
const slug = (s: string) => { const t = (s || '').trim(); return (!t || /\[EDIT/.test(t)) ? '[EDIT: area]' : t.replace(/[^a-zA-Z0-9]+/g, ''); };
// Set-dedup: a kind whose lead tag is also a stock tag (e.g. ask_question → #RealEstate) must not post it twice.
const reTags = (m: SocialMaterials, lead: string) => [...new Set([lead, `#${slug(areaOf(m))}RealEstate`, '#RealEstate', '#Realtor'])];
const genTags = (m: SocialMaterials, lead: string) => [lead, `#${slug(areaOf(m))}`, '#SmallBusiness'];

// Real-estate kinds. Listing kinds require the REAL home photo (AI refused) — same honesty gate as postcards.
export const SOCIAL_KINDS_RE: SocialKind[] = [
  { id: 'just_listed', label: 'Just Listed', emoji: '🏡', hint: 'A new listing — the real home photo.', campaignType: 'just_listed', needsRealPhoto: true,
    caption: (m) => `Just listed in ${areaOf(m)}! [EDIT: address · price · beds/baths]. [EDIT: the one standout feature]. DM me for a private showing 🔑`, hashtags: (m) => reTags(m, '#JustListed'), headline: 'Just Listed' },
  { id: 'just_sold', label: 'Just Sold', emoji: '🔑', hint: 'Neighborhood social proof.', campaignType: 'just_sold', needsRealPhoto: true,
    caption: (m) => `SOLD in ${areaOf(m)}! 🎉 [EDIT: a real detail — over asking? days on market?]. Thinking of selling? Let’s talk.`, hashtags: (m) => reTags(m, '#JustSold'), headline: 'Just Sold' },
  { id: 'open_house', label: 'Open House', emoji: '📆', hint: 'Drive walk-ins to a showing.', campaignType: 'open_house', needsRealPhoto: true,
    caption: (m) => `Open House this [EDIT: day & time]! 🏡 [EDIT: address]. Come see [EDIT: a standout feature]. See you there 👋`, hashtags: (m) => reTags(m, '#OpenHouse'), headline: 'Open House' },
  { id: 'market_tip', label: 'Market tip', emoji: '📈', hint: 'Position yourself as the local source.', campaignType: 'find_sellers', needsRealPhoto: false,
    caption: (m) => `${areaOf(m)} market tip: [EDIT: one genuinely useful insight or a real stat]. Questions about your home’s value? I’m here to help.`, hashtags: (m) => reTags(m, '#MarketUpdate'), headline: 'Market tip' },
  { id: 'client_love', label: 'Client love', emoji: '💬', hint: 'A real testimonial — trust builds sales.', campaignType: 'find_sellers', needsRealPhoto: false,
    caption: (m) => `“[EDIT: a real client quote]” — grateful for clients like this 🙏 — ${bizOf(m)}`, hashtags: (m) => reTags(m, '#ClientLove'), headline: 'Client love' },
  { id: 'behind_scenes', label: 'Behind the scenes', emoji: '🎬', hint: 'Show the human behind the work.', campaignType: 'find_sellers', needsRealPhoto: false,
    caption: (m) => `Behind the scenes: [EDIT: what you’re doing today — a showing, prepping a listing]. This is the part people don’t see.`, hashtags: (m) => reTags(m, '#BehindTheScenes'), headline: 'Behind the scenes' },
  { id: 'ask_question', label: 'Ask a question', emoji: '❓', hint: 'Invite comments — the algorithm loves them.', campaignType: 'find_sellers', needsRealPhoto: false,
    caption: (m) => `Quick question, ${areaOf(m)}: [EDIT: a question that invites comments — e.g. what’s your #1 dream-home feature?] 👇`, hashtags: (m) => reTags(m, '#RealEstate'), headline: 'Ask me anything' },
];

// Generic-business kinds — brand/lifestyle, so AI imagery is allowed.
export const SOCIAL_KINDS_GENERIC: SocialKind[] = [
  { id: 'announce', label: 'Announcement', emoji: '📣', hint: 'Say the one thing that matters.', campaignType: 'announce', needsRealPhoto: false,
    caption: (m) => `Big news from ${bizOf(m)}: [EDIT: what’s new]! [EDIT: why it matters to you].`, hashtags: (m) => genTags(m, '#Announcement'), headline: 'Big news' },
  { id: 'promo', label: 'Offer / promo', emoji: '🏷️', hint: 'A deal that gets action.', campaignType: 'promo', needsRealPhoto: false,
    caption: (m) => `[EDIT: the offer] — for a limited time at ${bizOf(m)}. [EDIT: how to claim it]. 🏷️`, hashtags: (m) => genTags(m, '#Sale'), headline: 'Limited-time offer' },
  { id: 'tip', label: 'Useful tip', emoji: '💡', hint: 'A save-worthy tip in your field.', campaignType: 'reach', needsRealPhoto: false,
    caption: (m) => `[EDIT: a genuinely useful tip in your field]. Save this for later 📌 — ${bizOf(m)}`, hashtags: (m) => genTags(m, '#Tips'), headline: 'A quick tip' },
  { id: 'ask', label: 'Ask a question', emoji: '❓', hint: 'Spark comments.', campaignType: 'reach', needsRealPhoto: false,
    caption: (m) => `We’re curious: [EDIT: a question your customers would love to answer] 👇`, hashtags: (m) => genTags(m, '#Community'), headline: 'Ask me anything' },
];

export function socialKindsFor(realEstate: boolean): SocialKind[] {
  return realEstate ? SOCIAL_KINDS_RE : SOCIAL_KINDS_GENERIC;
}
export function socialKindById(id: string): SocialKind | null {
  return [...SOCIAL_KINDS_RE, ...SOCIAL_KINDS_GENERIC].find((k) => k.id === id) ?? null;
}
export function defaultSocialKind(realEstate: boolean): SocialKind {
  return realEstate ? SOCIAL_KINDS_RE[3] /* market_tip — AI-image OK */ : SOCIAL_KINDS_GENERIC[0];
}

/** Build a social tile from a kind + platform. Image sourcing mirrors the postcard board's honesty:
 *  supplied image wins; a listing kind falls back to the real vault photo; otherwise a brand card. */
export function buildSocialContent(args: {
  materials: SocialMaterials; kind: SocialKind; platform: SocialPlatform;
  image?: { url: string; mode: 'ai' | 'photo'; note?: string | null } | null;
}): SocialContent {
  const { materials, kind, platform, image } = args;
  let imageUrl: string | null = null;
  let imageMode: SocialContent['imageMode'];
  let aiNote: string | null = null;

  if (image) {
    imageUrl = image.url;
    imageMode = image.mode === 'ai' ? 'ai' : 'photo';
    aiNote = image.mode === 'ai' ? (image.note ?? 'AI-generated illustration — not a real photo.') : null;
  } else if (kind.needsRealPhoto) {
    const hero = materials.images[0] ?? null;
    imageUrl = hero?.url ?? null;
    imageMode = hero ? 'photo' : 'brand';
  } else {
    imageMode = 'brand';
  }

  return {
    platform, kindId: kind.id, campaignType: kind.campaignType,
    caption: platformizeCta(kind.caption(materials), platform), hashtags: kind.hashtags(materials), headline: kind.headline,
    imageUrl, imageMode, aiNote,
  };
}

export interface SocialRenditionResult { content: SocialContent; wantsImage: boolean; imageStyle: string | null }

/** Spin a rendition: naming a platform switches to it; otherwise restyle the image (when AI is allowed
 *  and it's not a real photo we must keep); if neither applies, cycle to the next platform so the child
 *  is always visibly different. Pure — the impure image regen happens in the run. */
/** Fields the board-copy AI seam may write — WORDS only. Hashtags are normalized (no #, ≤6);
 *  imageMode / imageUrl / the listing-photo gate are untouchable from here. */
export interface SocialCopyFields { caption?: string; hashtags?: string[] }
export function applySocialCopy(content: SocialContent, f: SocialCopyFields): SocialContent {
  const caption = typeof f.caption === 'string' && f.caption.trim() ? f.caption.trim() : content.caption;
  const hashtags = Array.isArray(f.hashtags)
    ? f.hashtags.map((t) => String(t).replace(/^#/, '').trim()).filter(Boolean).slice(0, 6)
    : content.hashtags;
  return { ...content, caption, hashtags: hashtags.length ? hashtags : content.hashtags };
}

export function applySocialRendition(parent: SocialContent, instruction: string): SocialRenditionResult {
  const instr = (instruction ?? '').trim();
  const named = PLATFORM_ORDER.find((p) => new RegExp(p === 'x' ? '\\b(x|twitter)\\b' : `\\b${p}\\b`, 'i').test(instr));
  if (named && named !== parent.platform) return { content: { ...parent, platform: named, caption: platformizeCta(parent.caption, named) }, wantsImage: false, imageStyle: null };

  if (instr && canGenerateImage(parent.campaignType) && parent.imageMode !== 'photo') {
    return { content: parent, wantsImage: true, imageStyle: instr };
  }
  const next = PLATFORM_ORDER[(PLATFORM_ORDER.indexOf(parent.platform) + 1) % PLATFORM_ORDER.length];
  return { content: { ...parent, platform: next }, wantsImage: false, imageStyle: null };
}

export function withGeneratedImage(content: SocialContent, url: string, note: string | null): SocialContent {
  return { ...content, imageUrl: url, imageMode: 'ai', aiNote: note ?? 'AI-generated illustration — not a real photo.' };
}
export function withPhoto(content: SocialContent, url: string): SocialContent {
  return { ...content, imageUrl: url, imageMode: 'photo', aiNote: null };
}

/** The honest AI-image prompt for a tile, or a refusal (listing types must use the real photo). */
export function socialImagePrompt(content: SocialContent, materials: SocialMaterials, style: string | null): ImagePromptResult {
  return buildImagePrompt({
    campaignType: content.campaignType,
    area: materials.area, businessName: materials.businessName,
    subject: content.headline ?? content.caption.slice(0, 60),
    highlight: content.caption.slice(0, 80), style,
  });
}

export function tileAllowsAI(content: SocialContent): boolean {
  return canGenerateImage(content.campaignType);
}

/** Instagram needs a landscape-free square; the rest read best as landscape. Matches the image sizes the
 *  generator supports. */
export function sizeForPlatform(p: SocialPlatform): '1024x1024' | '1536x1024' {
  return p === 'instagram' ? '1024x1024' : '1536x1024';
}

/** The exact text that would post (caption + hashtags), joined the way each network expects. Inlined
 *  here (not imported from the mock component) so this core stays pure + testable. */
/** Platform tag budgets — IG rewards a fuller tag set; LinkedIn/Facebook read spammy past ~3; X past 2. */
/** Exported so previews can show EXACTLY the tags that will post — never more. */
export const TAG_CAP: Record<SocialPlatform, number> = { instagram: 8, facebook: 3, linkedin: 3, x: 2 };

export function composeSocialText(platform: SocialPlatform, caption: string, hashtags: string[]): string {
  const tags = hashtags.slice(0, TAG_CAP[platform]);
  if (!tags.length) return caption;
  if (platform === 'x') return `${caption} ${tags.join(' ')}`.trim();
  return `${caption}\n\n${tags.join(' ')}`;
}

/** "DM me" is Instagram-native; every other platform gets its own action verb — a LinkedIn post
 *  saying "DM me" reads wrong to the exact audience it courts. Pure text swap, applied at build. */
export function platformizeCta(caption: string, platform: SocialPlatform): string {
  if (platform === 'instagram') return caption;
  const sub = platform === 'linkedin' ? 'Message me' : platform === 'x' ? 'Reply or DM' : 'Send me a message';
  return caption.replace(/\bDM me\b/g, sub);
}
