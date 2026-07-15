// src/lib/garvis/mediaProvenance.ts
// THE AI-PROVENANCE LABEL — an honest, immutable mark on AI-generated media (a generated image, a Sora
// clip, a synthesized voiceover). A growing body of platform policy and law requires AI media to be
// disclosed, and Garvis's own honesty rules demand it: nothing AI is passed off as human-made. This is
// the pure core — it defines the label, stamps it ONCE (provenance only accretes; it can never be
// stripped or downgraded to "not AI"), and gates any PUBLISH of AI media on a visible disclosure.
// Deterministic — verified by mediaProvenance.verify.ts. The impure callers (generate-image, the reel
// clip/voice engine, the social publisher) stamp at generation time and disclose at publish time.

export type MediaKind = 'image' | 'video' | 'audio';

/** An AI-provenance label exists ONLY for AI-generated media — its presence IS the "this is AI" fact. */
export interface AiProvenance {
  aiGenerated: true;
  kind: MediaKind;
  tool: string;          // e.g. 'gpt-image-1', 'sora', 'elevenlabs'
  model?: string;
  createdAt: number;     // epoch ms, caller-stamped (kept out of the pure logic)
}

/** The visible disclosure a viewer must see when AI media is published. */
export const AI_DISCLOSURE = 'Contains AI-generated media';
export const AI_DISCLOSURE_TAG = '#AI';

/** Stamp a fresh AI-provenance label at generation time. */
export function aiProvenance(kind: MediaKind, tool: string, createdAt: number, model?: string): AiProvenance {
  return { aiGenerated: true, kind, tool, ...(model ? { model } : {}), createdAt };
}

/** Immutable merge: once an asset carries AI provenance it can NEVER be replaced with a different origin
 *  — the FIRST stamp wins and any later stamp is ignored. Honesty, once recorded, can't be undone. */
export function stampProvenance(existing: AiProvenance | null | undefined, next: AiProvenance): AiProvenance {
  return existing ?? next;
}

/** Does publishing this asset require a disclosure? True iff it carries AI provenance. */
export function requiresDisclosure(prov: AiProvenance | null | undefined): boolean {
  return prov?.aiGenerated === true;
}

/** Is the disclosure already present in this text (the full sentence OR the #AI tag)? */
export function hasDisclosure(text: string): boolean {
  return text.includes(AI_DISCLOSURE) || new RegExp(`(^|\\s)${AI_DISCLOSURE_TAG}\\b`, 'i').test(text);
}

/** Append the AI disclosure to a caption/body IF the media is AI-generated and it isn't already present
 *  — so a published AI post always carries a visible label, exactly once (idempotent). */
export function withDisclosure(text: string, prov: AiProvenance | null | undefined): string {
  if (!requiresDisclosure(prov) || hasDisclosure(text)) return text;
  const t = text.trimEnd();
  return `${t}${t ? '\n\n' : ''}${AI_DISCLOSURE}.`;
}

/** The PUBLISH GATE: AI media must carry a visible disclosure in its caption before it can go out.
 *  Returns the blocking reason, or null if it's clear to publish (non-AI media is always clear). */
export function disclosureGate(caption: string, prov: AiProvenance | null | undefined): string | null {
  if (!requiresDisclosure(prov)) return null;
  return hasDisclosure(caption) ? null : 'AI-generated media must carry a visible disclosure before publishing.';
}
