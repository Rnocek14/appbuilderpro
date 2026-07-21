import { createClient } from '@supabase/supabase-js';

// The cast keeps this file checkable OUTSIDE Vite too (deno check follows worker imports into
// src/): Vite injects import.meta.env at build/dev time either way.
const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const url = viteEnv.VITE_SUPABASE_URL;
const anonKey = viteEnv.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);
// Exposed for streaming edge-function calls, which must bypass supabase-js
// (functions.invoke buffers the whole response and can't stream).
export const supabaseUrl = url ?? 'http://localhost:54321';
export const supabaseAnonKey = anonKey ?? 'missing-key';

if (!supabaseConfigured) {
  console.warn(
    'FableForge: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. ' +
      'Copy .env.example to .env and fill in your Supabase project values.',
  );
}

export const supabase = createClient(
  url ?? 'http://localhost:54321',
  anonKey ?? 'missing-key',
  { auth: { persistSession: true, autoRefreshToken: true } },
);
