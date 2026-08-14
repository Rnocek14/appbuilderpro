// src/lib/scaffold.ts
// Re-export of the canonical scaffold (supabase/functions/_shared/scaffold.ts) so every consumer —
// the client orchestrator and any server-side harness — seeds the IDENTICAL Vite + TypeScript
// project. Edit the scaffold in the _shared file.
export * from '../../supabase/functions/_shared/scaffold';
