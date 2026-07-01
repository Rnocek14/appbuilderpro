// src/lib/prompts.ts
// SINGLE SOURCE OF TRUTH for all build/edit/advisory prompts now lives at
// supabase/functions/_shared/prompts.ts — a pure, runtime-agnostic module (no browser/Deno APIs)
// imported by BOTH the client (here, extensionless) and the deployed edge functions (with .ts).
// This kills the old drift where the edge functions carried their own weaker, divergent copies.
// Edit the prompts in the _shared file; this just re-exports them.
export * from '../../supabase/functions/_shared/prompts';
