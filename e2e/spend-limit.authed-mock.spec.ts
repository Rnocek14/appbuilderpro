// e2e/spend-limit.authed-mock.spec.ts — THE SPENDING LIMIT, as the owner actually meets it.
//
// The defect these guard against: the caps were real and enforced server-side, but no screen ever
// showed one coming, and when one was reached supabase-js's "Edge Function returned a non-2xx
// status code" hid the honest 402 underneath it. The page fell through to its generic fallback and
// told the owner to add a Claude key that was already there. A limit doing its job read as a broken
// app — which is exactly what it got reported as.
//
// The last test is the important one: a 402 carrying a spending-limit body must surface THAT, and
// must not say a word about keys.

import { test, expect, type Page } from '@playwright/test';

const U = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'op@test.local', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
function fakeSession() {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const token = `${b64({ alg: 'none' })}.${b64({ sub: U.id, exp: Math.floor(Date.now()/1000)+3600, role: 'authenticated' })}.x`;
  return { access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, user: U };
}
const guard = (spent_today: number, kill = false) => ({ kill, daily_cap: 5, monthly_cap: 50, spent_today, spent_month: spent_today * 3 });

async function mock(page: Page, g: object, pool: unknown[] = []) {
  await page.route('**/auth/v1/user**', (r) => r.fulfill({ json: U }));
  await page.route('**/auth/v1/token**', (r) => r.fulfill({ json: fakeSession() }));
  await page.route('**/rest/v1/**', (r) => r.fulfill({ json: [] }));
  await page.route('**/rest/v1/discovered_businesses**', (r) => r.fulfill({ json: pool }));
  await page.route('**/rest/v1/rpc/spend_guard_state**', (r) => r.fulfill({ json: g }));
  await page.route('**/functions/v1/**', (r) => r.fulfill({ json: { error: 'mocked-out' }, status: 503 }));
  await page.route('**/realtime/v1/**', (r) => r.abort());
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  await page.addInitScript((s) => { window.localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)); }, fakeSession());
}

test('meter: normal', async ({ page }) => {
  await mock(page, guard(0.42));
  await page.goto('/garvis/leads', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Businesses to pitch' })).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: '/tmp/claude-0/s-normal.png', fullPage: true });
});

test('meter: at the limit disables the button', async ({ page }) => {
  await mock(page, guard(5));
  await page.goto('/garvis/leads', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Businesses to pitch' })).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(900);
  await expect(page.getByRole('button', { name: 'Find businesses' })).toBeDisabled();
  await expect(page.getByText(/Today's limit is used up/)).toBeVisible();
  await page.screenshot({ path: '/tmp/claude-0/s-stopped.png', fullPage: true });
});

test('meter: nearly there warns', async ({ page }) => {
  await mock(page, guard(4.3), [{ id: 'a', company_name: 'Harbor Dock & Dredge', keyword: 'plumber', category: 'Plumbing', phone: null, website: null, has_website: false, address: null, city: 'Lake Geneva', state: 'WI', status: 'new', preview_site_id: null, created_at: '2026-09-15T12:00:00Z' }]);
  await page.goto('/garvis/leads', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Businesses to pitch' })).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: '/tmp/claude-0/s-close.png', fullPage: true });
});

test('a spending limit does not read as a broken app', async ({ page }) => {
  await mock(page, guard(0.42));
  // The real shape: a 402 whose body carries the honest reason.
  await page.route('**/functions/v1/discover-run**', (r) => r.fulfill({
    status: 402,
    json: { error: "Nothing is broken — that is today's spending limit reached ($5.00 of the $5.00 a day you allow). It starts fresh at midnight UTC. Raise the limit in Settings if you want to keep going now.", code: 'daily_cap' },
  }));
  await page.goto('/garvis/leads', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Businesses to pitch' })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Find businesses' }).click();
  await expect(page.getByText(/today's spending limit reached/i)).toBeVisible({ timeout: 15000 });
  // The old fallback sent you to fix a key that was already fine.
  await expect(page.getByText(/add your Claude key/i)).toHaveCount(0);
  await page.screenshot({ path: '/tmp/claude-0/s-refused.png', fullPage: true });
});
