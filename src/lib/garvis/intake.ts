// src/lib/garvis/intake.ts
// G2 — photo/document intake, pure core (verified by intake.verify.ts).
// Photos are not just assets; they are UNDERSTANDING. The edge function returns caption, style,
// themes, mood, suggested use, an honest quality note, why-this-matters, and an open question.
// This module normalizes that response for the propose-sort-approve review table — tolerant of
// missing fields, never inventing them. Filing remains approval-first: the review table proposes,
// the user files.

export const SUGGESTED_USES = ['website', 'social', 'video', 'print'] as const;
export type SuggestedUse = (typeof SUGGESTED_USES)[number];

export interface VisionMeta {
  subject: string;
  style: string;
  medium: string | null;
  colors: string[];
  mood: string;
  themes: string[];
  suggested_use: SuggestedUse[];
  quality_note: string;
}

export interface IntakeItem {
  documentId: string;
  title: string;
  summary: string;
  concepts: string[];
  vision: VisionMeta | null;
  whyMatters: string | null;
  openQuestion: string | null;
  suggestedWorldId: string | null;
}

const str = (v: unknown, max = 400): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const arr = (v: unknown, cap: number): string[] =>
  (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean).slice(0, cap);

/** Normalize an ingest-document response into a review-table row. Null when it isn't one. */
export function normalizeIntake(resp: unknown, fallbackTitle: string): IntakeItem | null {
  const r = resp as Record<string, unknown> | null;
  const documentId = str(r?.document_id, 60);
  if (!documentId) return null;
  const v = r?.vision as Record<string, unknown> | null | undefined;
  const vision: VisionMeta | null = v
    ? {
        subject: str(v.subject, 120),
        style: str(v.style, 120),
        medium: str(v.medium, 120) || null,
        colors: arr(v.colors, 4),
        mood: str(v.mood, 60),
        themes: arr(v.themes, 5),
        suggested_use: arr(v.suggested_use, 4).filter((u): u is SuggestedUse => (SUGGESTED_USES as readonly string[]).includes(u)),
        quality_note: str(v.quality_note, 200),
      }
    : null;
  return {
    documentId,
    title: fallbackTitle,
    summary: str(r?.summary, 1000),
    concepts: arr(r?.concepts, 8),
    vision,
    whyMatters: str(r?.why_matters, 400) || null,
    openQuestion: str(r?.open_question, 300) || null,
    suggestedWorldId: str(r?.suggested_world_id, 60) || null,
  };
}

export function isImageFile(name: string, mime: string): boolean {
  return mime.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic)$/i.test(name);
}

/** The default routing label for the cluster-file bridge: the model's first valid suggestion. */
export function defaultLabel(vision: VisionMeta | null): SuggestedUse | null {
  return vision?.suggested_use[0] ?? null;
}
