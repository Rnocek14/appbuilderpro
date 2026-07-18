// e2e/authed-mock.spec.ts — the new authed surfaces rendered for REAL, against a mocked backend.
// A synthetic session is seeded into supabase-js's storage key and every backend call is
// intercepted locally, so Orchestrate, the Opportunity feed, and the Client book actually MOUNT
// (their lazy chunks execute, their queries run, their empty states render) — the class of
// failure the signed-out redirect sweep cannot catch. Hermetic: no external requests at all.

import { test, expect, type Page } from '@playwright/test';

const FAKE_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated', role: 'authenticated', email: 'op@test.local',
  app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
};

function fakeSession() {
  // supabase-js trusts a stored, unexpired session shape; header/payload are decodable base64url.
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const token = `${b64({ alg: 'none' })}.${b64({ sub: FAKE_USER.id, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })}.x`;
  return {
    access_token: token, refresh_token: 'fake-refresh', token_type: 'bearer',
    expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: FAKE_USER,
  };
}

async function mockBackend(page: Page): Promise<void> {
  // The client falls back to localhost:54321 when VITE_SUPABASE_URL is unset (e2e mode).
  await page.route('**/auth/v1/user**', (r) => r.fulfill({ json: FAKE_USER }));
  await page.route('**/auth/v1/token**', (r) => r.fulfill({ json: fakeSession() }));
  await page.route('**/rest/v1/**', (r) => r.fulfill({ json: [] }));
  await page.route('**/functions/v1/**', (r) => r.fulfill({ json: { error: 'mocked-out' }, status: 503 }));
  await page.route('**/realtime/v1/**', (r) => r.abort());
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  await page.addInitScript((session) => {
    window.localStorage.setItem('sb-localhost-auth-token', JSON.stringify(session));
  }, fakeSession());
}

function trackCrashes(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

test('Orchestrate mounts with the intent composer', async ({ page }) => {
  const errors = trackCrashes(page);
  await mockBackend(page);
  await page.goto('/garvis/orchestrate', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Orchestrate' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /Compile the plan/i })).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('Opportunity feed mounts with tabs and the honest empty state', async ({ page }) => {
  const errors = trackCrashes(page);
  await mockBackend(page);
  await page.goto('/garvis/opportunity-feed', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Opportunity feed' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('No new opportunities yet')).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('Client book mounts, opens the add form, validates required fields', async ({ page }) => {
  const errors = trackCrashes(page);
  await mockBackend(page);
  await page.goto('/garvis/client-book', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Client book' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('No client engagements yet')).toBeVisible();
  await page.getByRole('button', { name: /^Client$/ }).click();
  await expect(page.getByPlaceholder(/Client name/)).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});
