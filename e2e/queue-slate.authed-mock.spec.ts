// e2e/queue-slate.authed-mock.spec.ts — THE SLATE, hermetic. Three cold pitches wait in the
// mocked approvals table; the Queue must offer them as ONE decision ("Approve all 3"), hold a
// flagged pitch out, and — when the send function is unreachable (503 mock) — say so honestly
// and keep the cards, never claim a send.
import { test, expect } from '@playwright/test';
import { installAuthedMocks, FAKE_USER } from './helpers/authedMock';

const pitch = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  kind: 'send_email',
  title: `Pitch "Business ${n}" → owner${n}@example.com`,
  preview: `Subject ${n}\n\nHi — I built you a new site.`,
  payload: { kind: 'cold_site_pitch', campaign_id: `c${n}`, message_id: `m${n}` },
  requested_by: 'garvis-auto',
  status: 'pending',
  result: null,
  created_at: new Date(Date.now() - n * 60_000).toISOString(),
  decided_at: null,
  world_id: null,
  expires_at: new Date(Date.now() + 6 * 3_600_000).toISOString(),
  risk_score: 10,
  risk_reasons: [],
  ...extra,
});

test('the Queue offers the day\'s cold pitches as one slate and reports a failed run honestly', async ({ page }) => {
  await installAuthedMocks(page);
  // Order matters: a later page.route wins, so the approvals table is registered AFTER the
  // catch-all REST mock. GET → the three pitches (+ one flagged, held out); PATCH (the CAS
  // claim) → one claimed row so approveAndExecute proceeds to the (503-mocked) send function.
  await page.route('**/rest/v1/approvals**', (r) => {
    if (r.request().method() === 'PATCH') return r.fulfill({ json: [{ id: 'claimed' }] });
    return r.fulfill({ json: [pitch(1), pitch(2), pitch(3), pitch(4, { risk_score: 95, risk_reasons: ['first contact', 'off hours'] })] });
  });
  await page.goto('/garvis/queue');
  await expect(page.getByRole('heading', { name: 'Queue', exact: true })).toBeVisible();

  // The slate names the three members and the one held out.
  const approveAll = page.getByRole('button', { name: /Approve all 3/ });
  await expect(approveAll).toBeVisible();
  await expect(page.getByText(/3 cold pitches ready/)).toBeVisible();
  await expect(page.getByText(/1 held out for review/)).toBeVisible();

  // Run it against the unreachable send function: nothing may read as sent.
  await approveAll.click();
  await expect(page.getByText(/None sent/)).toBeVisible({ timeout: 15_000 });
  expect(FAKE_USER.id).toBeTruthy();
});
