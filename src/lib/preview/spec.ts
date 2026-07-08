// src/lib/preview/spec.ts
// Re-export of the canonical pure preview-spec module (supabase/functions/_shared/previewSpec.ts)
// so the client and the ingest-profile edge function share IDENTICAL validation, recipes, and
// normalization. Edit it in the _shared file.
export * from "../../../supabase/functions/_shared/previewSpec";
