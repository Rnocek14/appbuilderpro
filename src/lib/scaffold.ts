// src/lib/scaffold.ts
// Re-export of the canonical scaffold (supabase/functions/_shared/scaffold.ts) so the client and the
// deployed generate-app edge function seed the IDENTICAL Vite + TypeScript project. Edit the scaffold
// in the _shared file.
export * from '../../supabase/functions/_shared/scaffold';
