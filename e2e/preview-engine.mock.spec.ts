// e2e/preview-engine.mock.spec.ts — the public preview pages rendered for REAL against a mocked
// backend (same hermetic pattern as authed-mock.spec.ts: the RPC is intercepted locally, every
// external request is aborted). These pin the audit's regressions: a dialable header phone on
// recipes with no quote section, zero dead anchors, scene chapters that stay VISIBLE under
// prefers-reduced-motion, and dignified copy on grief-adjacent categories.

import { test, expect, type Page } from '@playwright/test';
import { assembleFallbackSpec, parseBusinessProfile, type BusinessProfile, type SiteSpec } from '../src/lib/preview/spec';

const profile = (raw: Record<string, unknown>): BusinessProfile => {
  const { profile: p, errors } = parseBusinessProfile(raw);
  if (!p) throw new Error(`bad fixture: ${errors.join(', ')}`);
  return p;
};

function rowFor(slug: string, p: BusinessProfile, spec: SiteSpec) {
  return {
    id: '00000000-0000-4000-8000-00000000e2e0', slug, business_name: p.business_name,
    industry: p.industry, spec, pitch: '', status: 'preview', spec_source: 'fallback',
    profile_id: null, strategy: null, critique: null, audit: null,
    live_url: null, published_at: null, custom_domain: null, created_at: '2026-01-01T00:00:00Z',
  };
}

async function mockBackend(page: Page, row: unknown): Promise<void> {
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  await page.route('**/auth/v1/**', (r) => r.fulfill({ json: {} }));
  await page.route('**/rest/v1/**', (r) => r.fulfill({ json: [] }));
  await page.route('**/functions/v1/**', (r) => r.fulfill({ json: { error: 'mocked-out' }, status: 503 }));
  await page.route('**/realtime/v1/**', (r) => r.abort());
  await page.route('**/rest/v1/rpc/get_preview_by_slug*', (r) => r.fulfill({ json: row }));
}

function trackCrashes(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

const deadAnchors = (page: Page) => page.evaluate(() => {
  const dead: string[] = [];
  for (const a of Array.from(document.querySelectorAll('a[href^="#"]'))) {
    const id = a.getAttribute('href')!.slice(1);
    if (id && !document.getElementById(id)) dead.push(`#${id}`);
  }
  return dead;
});

test('restaurant (no quote section): header dials the real phone, no dead anchors', async ({ page }) => {
  const errors = trackCrashes(page);
  const p = profile({
    business_name: 'Luna Trattoria', industry: 'Italian Restaurant', location: 'Asheville, NC',
    phone: '(828) 555-0177', services: ['Handmade pasta', 'Wood-fired pizza'],
    hours: 'Tue–Sun 5–10pm', google_rating: 4.7, review_count: 312,
    reviews_summary: 'Guests rave about the pasta.',
  });
  await mockBackend(page, rowFor('e2e-luna', p, assembleFallbackSpec(p)));
  await page.goto('/preview-site/e2e-luna', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.pv-site')).toBeVisible({ timeout: 15_000 });
  // The header used to render a dead "#quote" Contact button here (phone only lived on the
  // quote section, which the restaurant recipe doesn't have). It must dial the hero's phone.
  await expect(page.locator('header a[href^="tel:"]').first()).toBeVisible();
  expect(await deadAnchors(page)).toEqual([]);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('scene chapters stay visible under prefers-reduced-motion (glass + ribbon)', async ({ page }) => {
  const errors = trackCrashes(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // glass: a non-vignette contractor trade with 2+ observed stats
  const glassP = profile({
    business_name: 'Haulaway Junk Removal', industry: 'Junk Removal', location: 'Toledo, OH',
    phone: '555-555-0170', services: ['Junk removal', 'Appliance haul-off', 'Cleanouts'],
    google_rating: 4.9, review_count: 203,
  });
  await mockBackend(page, rowFor('e2e-glass', glassP, assembleFallbackSpec(glassP)));
  await page.goto('/preview-site/e2e-glass', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.pv-site')).toBeVisible({ timeout: 15_000 });
  const sceneInnerHeight = () => page.locator('#scene').evaluate((el) => {
    const inner = el.querySelector('.pv-scn-stage > div') ?? el.querySelector(':scope > div > div');
    return inner ? inner.getBoundingClientRect().height : 0;
  });
  // Before the min-h floor this collapsed to 0 — a blank screen-tall band mid-page.
  expect(await sceneInnerHeight()).toBeGreaterThan(300);
  await expect(page.locator('#scene h2')).toHaveText(/\S/);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('thin profile gets the ribbon chapter, visible under reduced motion', async ({ page }) => {
  const errors = trackCrashes(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const thin = profile({ business_name: "Mike's Handyman Service", industry: 'Handyman', services: ['General repairs', 'Odd jobs'] });
  await mockBackend(page, rowFor('e2e-thin', thin, assembleFallbackSpec(thin)));
  await page.goto('/preview-site/e2e-thin', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.pv-site')).toBeVisible({ timeout: 15_000 });
  const h = await page.locator('#scene').evaluate((el) => {
    const inner = el.querySelector('.pv-scn-stage > div') ?? el.querySelector(':scope > div > div');
    return inner ? inner.getBoundingClientRect().height : 0;
  });
  expect(h).toBeGreaterThan(300);
  expect(await deadAnchors(page)).toEqual([]);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('funeral home renders dignified copy, never quote-flavored boilerplate', async ({ page }) => {
  const errors = trackCrashes(page);
  const p = profile({
    business_name: 'Harborview Funeral Home', industry: 'Funeral Home', location: 'Duluth, MN',
    phone: '(218) 555-0119', services: ['Funeral services', 'Cremation services', 'Pre-planning'],
  });
  await mockBackend(page, rowFor('e2e-care', p, assembleFallbackSpec(p)));
  await page.goto('/preview-site/e2e-care', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.pv-site')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'How we can help' })).toBeVisible();
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/go-to for|Get a Free Quote|How do I get a quote|Ready to get started|clean-up/i);
  expect(errors, errors.join('\n')).toEqual([]);
});
