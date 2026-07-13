import { test, expect, type Page } from '@playwright/test';

// Without a Supabase backend the client points at a fallback localhost URL, so session/auth calls
// fail — that noise is EXPECTED. We fail only on REAL errors: uncaught exceptions (route crashes,
// lazy-chunk load failures) and non-network console errors.
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

test('landing page boots and renders a heading', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 15_000 });
  expect(errors, `unexpected errors:\n${errors.join('\n')}`).toEqual([]);
});

test('auth page shows a sign-in surface', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/auth');
  await expect(page.locator('input[type="email"], input[type="password"]').first()).toBeVisible({ timeout: 15_000 });
  expect(errors, `unexpected errors:\n${errors.join('\n')}`).toEqual([]);
});

test('pricing page renders', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/pricing');
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 15_000 });
  expect(errors, `unexpected errors:\n${errors.join('\n')}`).toEqual([]);
});

test('a protected route redirects to /auth when signed out', async ({ page }) => {
  await page.goto('/garvis/command');
  await page.waitForURL(/\/auth/, { timeout: 15_000 });
  expect(page.url()).toContain('/auth');
});

test('another protected route (contacts) also gates to /auth', async ({ page }) => {
  await page.goto('/garvis/contacts');
  await page.waitForURL(/\/auth/, { timeout: 15_000 });
  expect(page.url()).toContain('/auth');
});

test('the setup console route loads (lazy boundary) and gates to /auth', async ({ page }) => {
  await page.goto('/garvis/setup');
  await page.waitForURL(/\/auth/, { timeout: 15_000 });
  expect(page.url()).toContain('/auth');
});

test('public preview route does not throw on an unknown slug', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/preview-site/does-not-exist-xyz');
  await expect(page.locator('body')).toBeVisible();
  // It may show a not-found or loading state — it must not throw an uncaught exception.
  const thrown = errors.filter((e) => e.startsWith('pageerror'));
  expect(thrown, `uncaught exception:\n${thrown.join('\n')}`).toEqual([]);
});

test('an unknown route redirects home, no crash', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/this/route/does/not/exist');
  await page.waitForURL((url) => url.pathname === '/', { timeout: 15_000 });
  const thrown = errors.filter((e) => e.startsWith('pageerror'));
  expect(thrown, `uncaught exception:\n${thrown.join('\n')}`).toEqual([]);
});
