// src/lib/themePresets.ts
// Re-export of the canonical theme/palette generator (supabase/functions/_shared/themePresets.ts) so
// the client and the edge pipeline produce the IDENTICAL per-app palette CSS. Edit it in the _shared file.
export * from '../../supabase/functions/_shared/themePresets';
