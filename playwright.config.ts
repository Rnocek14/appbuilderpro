import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// Use the runner's pre-installed Chromium directly when present, so a version drift between the npm
// @playwright/test build and the on-disk browser build doesn't send Playwright hunting for a
// chrome-headless-shell it can't find. Falls back to Playwright's managed browser on a dev machine.
const PW_CHROMIUM = '/opt/pw-browsers/chromium';
const localBrowser = existsSync(PW_CHROMIUM) ? { executablePath: PW_CHROMIUM } : {};

// Browser-level smoke proof: the verify suites prove logic; these prove the app actually BOOTS,
// routes load, lazy/Suspense boundaries don't crash, and auth-gating redirects. They run against a
// real Vite server with no Supabase backend configured — public routes render, protected routes
// redirect, and the supabase client falls back gracefully (no crash). Auth-gated flow proofs live
// in *.authed.spec.ts and are skipped unless E2E_BASE_URL + a seeded session are provided.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: localBrowser,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Only manage a server when testing the local build; an external E2E_BASE_URL skips this.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev -- --port 4173 --strictPort',
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
