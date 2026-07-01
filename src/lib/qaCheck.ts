// src/lib/qaCheck.ts
// Re-export of the canonical self-QA logic (supabase/functions/_shared/qa.ts) so the client and the
// edge pipeline run the IDENTICAL static checks over generated code. Edit it in the _shared file.
export * from '../../supabase/functions/_shared/qa';
