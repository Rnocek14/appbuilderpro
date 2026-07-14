// src/lib/garvis/imagegen.ts
// The honest prompt-builder for AI image generation. Pure + deterministic so the ONE load-bearing
// rule is testable: an AI image may NEVER stand in for a specific real property. A listing card
// (just listed / sold / open house) shows the REAL home photo — full stop. AI imagery is only for
// lifestyle / brand pieces ("life in Lake Geneva", a bakery's promo), where no specific property or
// person is being depicted, and it is always labelled as an illustration.
//
// Every generated prompt carries the same guardrails: no text/logos/watermarks (the card adds those),
// no recognizable real people's faces, and never "a specific real property or address."

import type { CampaignType } from './campaignCore';

// The campaign types that depict a SPECIFIC real home — AI images are refused for these.
const LISTING_TYPES = new Set<CampaignType>(['just_listed', 'just_sold', 'open_house']);

/** True when it's honest to offer an AI image for this campaign — i.e. it is NOT about a specific
 *  real property. Lifestyle prospecting (find_sellers) and every generic-business type qualify. */
export function canGenerateImage(type: CampaignType): boolean {
  return !LISTING_TYPES.has(type);
}

export interface ImagePromptInput {
  campaignType: CampaignType;
  area?: string | null;         // town / neighborhood (real estate lifestyle)
  subject?: string | null;      // generic: what's being announced ("Fresh sourdough")
  businessName?: string | null;
  highlight?: string | null;    // the angle / what's special
  style?: string | null;        // optional free-text nudge from the operator
}

export type ImagePromptResult =
  | { ok: true; prompt: string; note: string }
  | { ok: false; reason: string };

// Shared guardrail clause appended to every prompt — keeps text/logos/faces/specific-property out.
const GUARDRAILS =
  'No text, no words, no letters, no logos, no watermarks, no signage. ' +
  'Do not depict any specific real property, address, or house. ' +
  'No recognizable real people or faces. Natural, tasteful, editorial quality.';

const clean = (s?: string | null) => (s || '').trim().replace(/\s+/g, ' ');

/** Build an honest image prompt, or refuse (with a reason) when the type must use a real photo. */
export function buildImagePrompt(input: ImagePromptInput): ImagePromptResult {
  if (!canGenerateImage(input.campaignType)) {
    return {
      ok: false,
      reason: 'A listing card must show the real home — upload the actual photo. AI images are for lifestyle & brand pieces, never a specific property.',
    };
  }
  const area = clean(input.area);
  const subject = clean(input.subject);
  const biz = clean(input.businessName);
  const highlight = clean(input.highlight);
  const styleNudge = clean(input.style);

  let scene: string;
  if (input.campaignType === 'find_sellers') {
    // A lifestyle/brand piece about living in the area — a place, a mood, never a specific home.
    scene = area
      ? `A warm, inviting lifestyle photograph evoking life in ${area}: soft natural light, an established residential neighborhood or town setting seen at a distance, seasonal greenery, an aspirational but genuine everyday feel. Golden-hour tones.`
      : `A warm, inviting lifestyle photograph evoking a desirable small town to live in: soft natural light, tree-lined streets, aspirational everyday calm. Golden-hour tones.`;
  } else {
    // Generic business — an on-brand image evoking the offering, not a claim about a real object.
    const topic = subject || highlight || (biz ? `${biz}` : 'a local small business');
    scene = `A clean, modern, editorial marketing image evoking: ${topic}. Bright, appealing, professional product/lifestyle photography style with shallow depth of field and natural light. Uncluttered composition with room to breathe.`;
  }

  const prompt = [scene, styleNudge, GUARDRAILS].filter(Boolean).join(' ');
  return {
    ok: true,
    prompt,
    note: 'AI-generated illustration — not a photograph of a specific place, property, or person.',
  };
}
