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

const PUBLIC_ROUTES = ['/', '/auth', '/pricing', '/platform'];

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
  '/garvis/lead-engine',
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

// ── the studio site (the prospect-facing "/" — what a cold-pitch recipient googles into) ──
test('studio site: hero, pick-a-la-carte menu totals live, contact never fake-submits', async ({ page }) => {
  const errors = trackErrors(page);
  await blockExternal(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Zero-input value: tagline + pricing render before any interaction.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Plain prices, picked à la carte' })).toBeVisible();

  // The menu is real registry data: ticking a box changes the live total.
  const before = await page.getByText(/once/).last().textContent();
  await page.getByRole('checkbox').first().check();
  await expect(page.getByText(/once \+ \$\d/).last()).toBeVisible();
  const after = await page.getByText(/once \+ \$\d/).last().textContent();
  expect(after).not.toBe(before);

  // With no channel token configured (this hermetic run), the contact section must show the
  // honest email panel — never a form that pretends to submit.
  await expect(page.locator('#contact').getByRole('link', { name: /@/ })).toBeVisible();
  expect(errors, `unexpected errors:\n${errors.join('\n')}`).toEqual([]);
});

// The showpiece exhibit: scan → build → finished, performed live. This test is the regression
// guard on the state machine (a stall would leave a prospect staring at a dated site forever).
test('studio exhibit performs scan → build → finished site', async ({ page }) => {
  const errors = trackErrors(page);
  await blockExternal(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByText(/Watch it happen/i).scrollIntoViewIfNeeded();

  // Act 1 — reading their current site, with the honest recreation caption.
  await expect(page.getByText(/A recreation of where most of our clients start/i)).toBeVisible({ timeout: 15_000 });

  // Act 3 — the build ran to completion and offers a replay. Generous timeout: the performance
  // is ~10s by design, and CI runners are slower than a laptop.
  await expect(page.getByRole('button', { name: /Replay the build/i })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/assembled by our engine in your browser/i)).toBeVisible();
  expect(errors, `unexpected errors:\n${errors.join('\n')}`).toEqual([]);
});

test('studio exhibit honors reduced motion — finished site, no performance', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = trackErrors(page);
  await blockExternal(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByText(/Watch it happen/i).scrollIntoViewIfNeeded();

  // Straight to the finished demo: no scan act, and no replay control to invite one.
  await expect(page.getByText(/assembled by our engine in your browser/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/A recreation of where most of our clients start/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Replay the build/i })).toHaveCount(0);
  expect(errors, `unexpected errors:\n${errors.join('\n')}`).toEqual([]);
  await context.close();
});

test('an unknown route lands somewhere real, not a blank crash', async ({ page }) => {
  const errors = trackErrors(page);
  await blockExternal(page);
  await page.goto('/definitely-not-a-route-xyz', { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/auth|\/$/, { timeout: 15_000 });
  expect(errors, `unexpected errors:\n${errors.join('\n')}`).toEqual([]);
});
