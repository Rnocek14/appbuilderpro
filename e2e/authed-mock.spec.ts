// e2e/authed-mock.spec.ts — the new authed surfaces rendered for REAL, against a mocked backend.
// A synthetic session is seeded into supabase-js's storage key and every backend call is
// intercepted locally, so Orchestrate, the Opportunity feed, and the Client book actually MOUNT
// (their lazy chunks execute, their queries run, their empty states render) — the class of
// failure the signed-out redirect sweep cannot catch. Hermetic: no external requests at all.

import { test, expect, type Page } from '@playwright/test';
import { installAuthedMocks } from './helpers/authedMock';

async function mockBackend(page: Page): Promise<void> {
  // The shared harness (SW9.5) owns the session + hermetic interception.
  await installAuthedMocks(page);
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
