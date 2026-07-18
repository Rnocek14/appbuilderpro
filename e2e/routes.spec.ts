// e2e/routes.spec.ts — THE FULL ROUTE SWEEP. Every public route must render without a real error;
// every protected route must redirect to /auth cleanly (no crash, no hang) when signed out. This
// catches the class tsc can't: lazy-chunk load failures, module-eval crashes on public paths, and
// a Protected wrapper that wedges instead of redirecting. Runs backendless like smoke.spec.

import { test, expect, type Page } from '@playwright/test';

const BENIGN = [
  /supabase/i, /54321/, /localhost/i, /net::err/i, /failed to fetch/i, /failed to load resource/i,
  /err_connection/i, /authretryable/i, /fetch/i, /the user aborted a request/i,
];

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !BENIGN.some((r) => r.test(m.text()))) errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/** HERMETIC: abort every non-local request (fonts, CDNs). The sweep tests OUR code, and in
 *  network-restricted environments hanging external sockets can starve the whole browser
 *  process — with this, the sweep is deterministic anywhere. */
async function blockExternal(page: Page): Promise<void> {
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
}

const PUBLIC_ROUTES = ['/', '/auth', '/pricing'];

// Every protected destination in App.tsx — builder + the whole Garvis surface, including the
// session's new pages (orchestrate, opportunity-feed, client-book). Signed out, each must land
// on /auth without an uncaught error.
const PROTECTED_ROUTES = [
  '/dashboard', '/new', '/import', '/autopilot', '/settings', '/billing',
  '/garvis/command', '/garvis/orchestrate', '/garvis/opportunity-feed', '/garvis/client-book',
  '/garvis/home', '/garvis/memory', '/garvis/mind', '/garvis/brain', '/garvis/control',
  '/garvis/missions', '/garvis/marketing', '/garvis/queue', '/garvis/clients',
  '/garvis/automations', '/garvis/client-billing', '/garvis/money', '/garvis/contacts',
  '/garvis/health', '/garvis/setup', '/garvis/webs', '/garvis/universe', '/garvis/working',
];

test('every public route renders without real errors', async ({ page }) => {
  const errors = trackErrors(page);
  await blockExternal(page);
  for (const route of PUBLIC_ROUTES) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1, h2, input').first()).toBeVisible({ timeout: 15_000 });
  }
  expect(errors, `unexpected errors:\n${errors.join('\n')}`).toEqual([]);
});

test('every protected route redirects to /auth signed out, without crashing', async ({ page }) => {
  const errors = trackErrors(page);
  await blockExternal(page);
  for (const route of PROTECTED_ROUTES) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/auth/, { timeout: 15_000 });
  }
  expect(errors, `unexpected errors:\n${errors.join('\n')}`).toEqual([]);
});

test('an unknown route lands somewhere real, not a blank crash', async ({ page }) => {
  const errors = trackErrors(page);
  await blockExternal(page);
  await page.goto('/definitely-not-a-route-xyz', { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/auth|\/$/, { timeout: 15_000 });
  expect(errors, `unexpected errors:\n${errors.join('\n')}`).toEqual([]);
});
