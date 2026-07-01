import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Cross-origin isolation — required for the in-browser WebContainer runtime to boot.
// `credentialless` (not `require-corp`) keeps public cross-origin resources working
// (Monaco CDN, esm.sh, Tailwind CDN, images) and CORS fetches (Anthropic, Supabase),
// so enabling isolation doesn't break the rest of the app.
const crossOriginIsolation = {
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, headers: crossOriginIsolation },
  preview: { headers: crossOriginIsolation },
  build: { sourcemap: true },
});
