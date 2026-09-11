// e2e/helpers/authedMock.ts — THE SHARED AUTHED-MOCK HARNESS (SW9.5). One place owns the
// synthetic session + hermetic backend interception every authed-mock spec rides: a decodable
// unexpired session seeded into supabase-js's storage key, REST answered with empty rows,
// functions answered 503 (so honest-degrade paths render), realtime and all external hosts
// aborted. Specs layer their own page.route overrides ON TOP for scenario data — Playwright
// matches the most recently registered route first.

import type { Page } from '@playwright/test';

export const FAKE_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated', role: 'authenticated', email: 'op@test.local',
  app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
};

export function fakeSession() {
  // supabase-js trusts a stored, unexpired session shape; header/payload are decodable base64url.
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const token = `${b64({ alg: 'none' })}.${b64({ sub: FAKE_USER.id, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })}.x`;
  return {
    access_token: token, refresh_token: 'fake-refresh', token_type: 'bearer',
    expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: FAKE_USER,
  };
}

/** Install the hermetic authed baseline: empty-data REST, degraded functions, no external I/O. */
export async function installAuthedMocks(page: Page): Promise<void> {
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
