// src/lib/garvis/brandBoard.ts
// THE BRANDING ADAPTER for the creative board — pure half. A tile is an AI logo concept generated from
// your real brand: business name + palette. Pick a style (Minimal mark, Emblem, Geometric, …), Make a
// concept, spread many out, spin renditions ("more minimal", "warmer"), star the keeper, set it as your
// brand logo. Deterministic prompt-building — verified by brandBoard.verify.ts. Impure half (the image
// model + save-to-brand) lives in brandBoardRun.ts.
//
// HONESTY: a generated logo is a CONCEPT, not final trademarked art — labeled as such. Logos are built
// from your palette; text is deliberately NOT rendered by the model (AI text is unreliable) — you add
// the wordmark. Unlike photo generation, a logo MARK is exactly what we want here, so this builds its
// own prompt rather than the photo prompt (which forbids marks).

export interface BrandContent {
  styleId: string;
  prompt: string;         // the exact prompt used / to use
  imageUrl: string | null;
  note: string | null;    // the honest concept label
}

export interface BrandMaterials {
  businessName: string;
  palette: string[];      // brand hex colors (first = primary)
  logoUrl: string | null; // an existing logo, if any (shown for reference)
  realEstate: boolean;
}

export interface LogoStyle {
  id: string;
  label: string;
  emoji: string;
  hint: string;
  describe: string;       // the style clause fed to the model
}

export const LOGO_STYLES: LogoStyle[] = [
  { id: 'minimal', label: 'Minimal mark', emoji: '▲', hint: 'A simple, single-idea abstract mark.', describe: 'a minimal, single-concept abstract mark — one clean idea, lots of negative space' },
  { id: 'emblem', label: 'Emblem / badge', emoji: '🛡️', hint: 'A circular crest or badge.', describe: 'a circular emblem or badge crest, balanced and symmetrical' },
  { id: 'geometric', label: 'Geometric', emoji: '🔷', hint: 'Bold monoline geometry.', describe: 'a bold geometric monoline mark built from simple shapes (circles, lines, angles)' },
  { id: 'organic', label: 'Organic', emoji: '🌿', hint: 'Soft, nature-inspired — great for lifestyle.', describe: 'a soft, organic, nature-inspired mark with gentle curves' },
  { id: 'monogram', label: 'Monogram', emoji: '◇', hint: 'An elegant shape-based monogram.', describe: 'an elegant monogram-style mark suggested by simple interlocking shapes (no readable letters)' },
  { id: 'playful', label: 'Playful', emoji: '⭐', hint: 'Friendly and rounded.', describe: 'a friendly, rounded, playful mark with warmth and character' },
];

export function logoStyleById(id: string): LogoStyle | null { return LOGO_STYLES.find((s) => s.id === id) ?? null; }
export function defaultLogoStyle(realEstate: boolean): LogoStyle { return realEstate ? LOGO_STYLES[3] /* organic */ : LOGO_STYLES[0]; }

/** Build the logo-concept prompt. A MARK is wanted (unlike photo prompts) but text is forbidden — the
 *  owner adds the wordmark. Uses the real palette; nothing about a specific real object is claimed. */
export function buildLogoPrompt(materials: BrandMaterials, style: LogoStyle, extra?: string | null): string {
  const name = (materials.businessName || '').trim() || 'a local business';
  const colors = materials.palette.length ? materials.palette.join(', ') : 'a tasteful, professional color palette';
  return [
    `A clean, modern, iconic logo mark for "${name}": ${style.describe}.`,
    `Brand colors: ${colors}.`,
    (extra || '').trim(),
    'Flat vector style, simple shapes, centered on a plain solid background, high contrast, memorable, scalable.',
    'No text, no letters, no words, no numbers, no watermark, not a photograph.',
  ].filter(Boolean).join(' ');
}

export const LOGO_CONCEPT_NOTE = 'AI logo concept — a starting point, not final or trademarked art. Add your own wordmark.';

export function buildBrandContent(args: { materials: BrandMaterials; style: LogoStyle; extra?: string | null }): BrandContent {
  return { styleId: args.style.id, prompt: buildLogoPrompt(args.materials, args.style, args.extra ?? null), imageUrl: null, note: null };
}

export interface BrandRenditionResult { content: BrandContent; wantsImage: boolean; imageStyle: string | null }

/** A rendition re-generates the mark with a style tweak (always wants a fresh image). */
export function applyBrandRendition(parent: BrandContent, instruction: string, materials: BrandMaterials): BrandRenditionResult {
  const style = logoStyleById(parent.styleId) ?? LOGO_STYLES[0];
  const extra = (instruction ?? '').trim();
  const content: BrandContent = { ...parent, prompt: buildLogoPrompt(materials, style, extra || null) };
  return { content, wantsImage: true, imageStyle: extra || null };
}

export function withGeneratedLogo(content: BrandContent, url: string): BrandContent {
  return { ...content, imageUrl: url, note: LOGO_CONCEPT_NOTE };
}
