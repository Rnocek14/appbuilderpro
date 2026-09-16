// e2e/app-origin.authed-mock.spec.ts — THE ADDRESS THAT GOES IN A STRANGER'S EMAIL.
//
// APP_ORIGIN is the base of the demo link inside a cold email to a real business, and it is the one
// setting whose WRONG value is more dangerous than its missing one. Unset, standing-worker refuses
// to queue any pitch and nothing goes out. Set to a laptop address, every readiness light reports
// green and every recipient clicks through to their own machine.
//
// Start here used to offer exactly that, as a button: "Use the address I'm on". Run locally — which
// is how this app is run today — it wrote http://localhost:5173. This pins the guard, and it runs
// against a local dev server, so it is testing the real condition rather than a simulated one.

import { test, expect, type Page } from '@playwright/test';
const U = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'op@test.local', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
function fakeSession() {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return { access_token: `${b64({alg:'none'})}.${b64({sub:U.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})}.x`, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, user: U };
}
async function mock(page: Page) {
  await page.route('**/auth/v1/user**', (r) => r.fulfill({ json: U }));
  await page.route('**/rest/v1/**', (r) => r.fulfill({ json: [] }));
  await page.route('**/functions/v1/**', (r) => r.fulfill({ json: { secrets: [], cron: [] } }));
  await page.route('**/realtime/v1/**', (r) => r.abort());
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  await page.addInitScript((s) => { window.localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)); }, fakeSession());
}
test('running locally, Start here refuses to suggest a laptop address', async ({ page }) => {
  await mock(page);
  await page.goto('/garvis/start', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Switch the machine on' })).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(600);
  // The trap: this button would have written http://localhost:xxxx into every cold email.
  await expect(page.getByRole('button', { name: /Use the address I/ })).toHaveCount(0);
  await expect(page.getByText(/only\s+works on this computer/i)).toBeVisible();
  await expect(page.getByText(/Blank is the safe setting/i)).toBeVisible();
  await page.screenshot({ path: '/tmp/claude-0/origin-guard.png', fullPage: true });
});
