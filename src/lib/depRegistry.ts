// Re-export of the canonical dependency registry (supabase/functions/_shared/depRegistry.ts)
// so client surfaces (preview shell, WebContainer reconcile) read the same pins the QA
// allowlist and scaffold are held to. Edit versions in the _shared file only.
export * from '../../supabase/functions/_shared/depRegistry';
