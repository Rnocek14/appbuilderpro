// Dev-only probe of /dev/board ideas tab (deterministic floor, no AI key).
import { chromium } from 'playwright';

const out = { tiles: [], focus: null, copyBrief: null, handoff: null, toasts: [] };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await ctx.newPage();
await page.goto('http://localhost:5173/dev/board', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'ideas', exact: true }).click();
await page.waitForTimeout(600);

const lenses = ['Feature', 'Automation', 'Content', 'Growth', 'Revenue', 'Wild card'];
for (const l of lenses) {
  await page.locator('.cb-chip', { hasText: l }).click();
  await page.getByRole('button', { name: 'Make', exact: true }).click();
  await page.waitForTimeout(700);
}
// Typed idea through Feature lens
await page.locator('.cb-chip', { hasText: 'Feature' }).click();
await page.locator('input[placeholder*="replay mode"]').fill('replay mode for past trading days with indicator overlays');
await page.getByRole('button', { name: 'Make', exact: true }).click();
await page.waitForTimeout(800);

// Extract all tile cards (title + pitch visible on card)
const cards = await page.locator('.cb-card').all();
for (const c of cards) out.tiles.push((await c.innerText()).replace(/\n+/g, ' | '));

// Open the LAST tile (typed one) in focus and capture full fields
const tiles = page.locator('.cb-tile');
const n = await tiles.count();
await tiles.nth(n - 1).hover();
await tiles.nth(n - 1).locator('button[title="Open & edit"]').click();
await page.waitForTimeout(500);
out.focus = {
  title: await page.locator('label:has-text("Title") input').inputValue(),
  pitch: await page.locator('label:has-text("Pitch") textarea').inputValue(),
  notes: await page.locator('textarea').last().inputValue(),
};
// Copy brief -> read clipboard
await page.getByRole('button', { name: 'Copy brief' }).click();
await page.waitForTimeout(300);
out.copyBrief = await page.evaluate(() => navigator.clipboard.readText().catch(() => null));
// Send to app builder -> localStorage handoff + navigation
await page.getByRole('button', { name: 'Send to app builder' }).click();
await page.waitForTimeout(800);
out.handoff = { url: page.url(), stored: await page.evaluate(() => localStorage.getItem('ff:build-brief')) };

console.log(JSON.stringify(out, null, 2));
await browser.close();
