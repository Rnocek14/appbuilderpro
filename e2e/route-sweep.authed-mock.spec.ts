// e2e/route-sweep.authed-mock.spec.ts — ZERO-INPUT VALUE AS A REGRESSION TEST (SW9.5). Every
// static authed route mounts against the empty-data mock and must: (1) throw no non-benign
// console error, (2) render a real heading or main landmark (a page that shows nothing before
// the operator types is a defect — the simplicity doctrine's third rule, enforced), (3) leak no
// raw plumbing ("undefined", "[object Object]") into visible text. The route list is derived
// from App.tsx AT TEST TIME, so a new route is swept the day it lands — and each route is its
// own test, so a module-scope throw in one lazy chunk fails exactly that route BY NAME.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { installAuthedMocks } from './helpers/authedMock';

const appSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/App.tsx'), 'utf8');
const ROUTES = [...appSrc.matchAll(/path="([^"]+)"/g)]
  .map((m) => m[1]!)
  // Parameterized and wildcard paths need real ids the empty mock can't provide; the public
  // preview route has its own spec; /dev/* are prototype sandboxes (not operator surfaces —
  // the prototypes dir is outside the product's own review scope); /oauth/callback is a
  // token-exchange redirect, not a page. Everything else sweeps.
  .filter((p) => !p.includes(':') && !p.includes('*') && p !== '/p' && !p.startsWith('/dev/') && p !== '/oauth/callback');
const UNIQUE = [...new Set(ROUTES)];

// The sweep only means something if it actually sweeps — a refactor that breaks extraction
// must fail loudly, not silently sweep nothing.
test('the route list extracted from App.tsx is substantial', () => {
  expect(UNIQUE.length).toBeGreaterThan(12);
});

// Console noise the MOCK causes is benign by construction; everything else fails the route.
const BENIGN = [
  /Failed to load resource/i,          // the 503-mocked functions + aborted external fetches
  /status of 503/i,
  /net::ERR/i,
  /favicon/i,
  /ResizeObserver loop/i,
  /Download the React DevTools/i,
];

for (const route of UNIQUE) {
  test(`authed sweep: ${route} renders zero-input value`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (BENIGN.some((b) => b.test(text))) return;
      errors.push(text.slice(0, 300));
    });
    page.on('pageerror', (err) => errors.push(`pageerror: ${String(err).slice(0, 300)}`));

    await installAuthedMocks(page);
    await page.goto(route);
    // A heading or main landmark must render — the page shows something before any input.
    await expect(page.locator('h1, h2, [role="heading"], main').first()).toBeVisible({ timeout: 15_000 });
    // No raw plumbing in what the operator can read.
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('[object Object]');
    expect(body).not.toMatch(/(?<![\w-])undefined(?![\w-])/);
    expect(errors, `non-benign console errors on ${route}:\n${errors.join('\n')}`).toEqual([]);
  });
}
