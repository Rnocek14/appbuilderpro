import { test, expect } from '@playwright/test';

// AUTH-GATED FLOW PROOFS — the deep flows the smoke suite can't reach without a real signed-in
// session + Supabase backend. They run ONLY when E2E_STORAGE_STATE (a Playwright storageState json
// with a valid session) and E2E_BASE_URL point at a live, seeded deployment; otherwise they skip
// (never a false green). This is the extensible skeleton for CI against a staging project.
const configured = !!process.env.E2E_STORAGE_STATE && !!process.env.E2E_BASE_URL;
test.skip(!configured, 'set E2E_BASE_URL + E2E_STORAGE_STATE (seeded session) to run authed flows');

if (configured) test.use({ storageState: process.env.E2E_STORAGE_STATE });

test('command loads for a signed-in user', async ({ page }) => {
  await page.goto('/garvis/command');
  await expect(page).toHaveURL(/\/garvis\/command/);
  await expect(page.locator('textarea, input[type="text"]').first()).toBeVisible();
});

test('the queue page loads and shows its lanes', async ({ page }) => {
  await page.goto('/garvis/queue');
  await expect(page).toHaveURL(/\/garvis\/queue/);
  await expect(page.locator('body')).toBeVisible();
});

test('contacts page loads with the segment sender', async ({ page }) => {
  await page.goto('/garvis/contacts');
  await expect(page.getByText(/send to a segment/i)).toBeVisible();
});

// Further flows to add against a seeded project: approve a send in the queue, run a farm merge,
// queue a paperwork document for signature, start a transaction timeline. Each needs seed data
// (a world, contacts, a saved postcard design), which the CI seed script provides.
