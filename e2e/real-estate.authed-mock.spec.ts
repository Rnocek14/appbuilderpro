// e2e/real-estate.authed-mock.spec.ts — the real-estate campaign studio rendered for REAL against a
// mocked backend (the authed-mock pattern). This is the hermetic half of the Phase 1 acceptance test
// (docs/real-estate-marketing-implementation.md §5): a listing_campaign world OPENS on its studio,
// the pulse answers "what needs a decision, what is scheduled, what worked" before anything is
// typed, a draft is assembled only from facts that are verified AND sourced AND in date, anything
// else shows as a visible hole that blocks the queue — and the approval that leaves this page is
// bound to an immutable version by content hash, not to a row id.
//
// Hermetic: no external requests at all.

import { test, expect, type Page, type Route } from '@playwright/test';

const WORLD_ID = '00000000-0000-4000-8000-0000000000b1';
const CLUSTER_DB_ID = '00000000-0000-4000-8000-0000000000b2';
const COMMUNITY_ID = '00000000-0000-4000-8000-0000000000b3';
const POST_ID = '00000000-0000-4000-8000-0000000000b4';
const VERSION_ID = '00000000-0000-4000-8000-0000000000b5';
const APPROVAL_ID = '00000000-0000-4000-8000-0000000000b6';

const FAKE_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated', role: 'authenticated', email: 'op@test.local',
  app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
};

function fakeSession() {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const token = `${b64({ alg: 'none' })}.${b64({ sub: FAKE_USER.id, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })}.x`;
  return {
    access_token: token, refresh_token: 'fake-refresh', token_type: 'bearer',
    expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: FAKE_USER,
  };
}

const UNIVERSE = {
  [WORLD_ID]: {
    id: WORLD_ID, title: 'Real Estate Marketing', nodes: [], edges: [], focusSlug: 'campaigns',
  },
};

// Three facts, deliberately one of each kind the gate cares about.
const FACTS = [
  {
    id: 'fact-dues', community_id: COMMUNITY_ID, claim: 'Association dues',
    value_text: 'billed quarterly', status: 'verified',
    reviewed_at: '2026-08-01T00:00:00Z', review_due_at: '2027-01-01T00:00:00Z',
    re_fact_sources: [{ count: 1 }],
  },
  {
    id: 'fact-stale', community_id: COMMUNITY_ID, claim: 'The boat slip waiting list',
    value_text: 'about two years', status: 'verified',
    reviewed_at: '2025-01-01T00:00:00Z', review_due_at: '2026-01-01T00:00:00Z',   // overdue
    re_fact_sources: [{ count: 1 }],
  },
  {
    id: 'fact-unsourced', community_id: COMMUNITY_ID, claim: 'The pool season',
    value_text: 'Memorial Day through September', status: 'verified',
    reviewed_at: '2026-08-01T00:00:00Z', review_due_at: null,
    re_fact_sources: [{ count: 0 }],                                              // no source
  },
];

// One scheduled post and one already published, so the pulse has something honest to say.
const SOCIAL_POSTS_SCHEDULED = [{ body: 'Abbey Springs owners: dues notice timing', scheduled_for: '2026-12-15T00:30:00.000Z' }];
const SOCIAL_POSTS_RECENT = [{
  id: POST_ID, body: 'What Abbey Springs owners ask me most', status: 'posted',
  post_urls: { instagram: 'https://instagram.com/p/abbey1' }, error: null,
}];

function restRows(url: string): unknown {
  const p = new URL(url).pathname + new URL(url).search;
  if (p.includes('re_communities')) {
    return [{ id: COMMUNITY_ID, slug: 'abbey-springs', name: 'Abbey Springs', kind: 'association', boundary_note: 'Association parcels only.' }];
  }
  if (p.includes('re_facts')) return FACTS;
  if (p.includes('social_post_metrics')) return [{ likes: 12, comments: 3, impressions: null }];
  if (p.includes('social_posts')) {
    if (p.includes('scheduled_for=not.is.null')) return SOCIAL_POSTS_SCHEDULED;
    return SOCIAL_POSTS_RECENT;
  }
  // Scoped to the studio's OWN count queries — the page has other readers of these tables, and a
  // bare { id } row is not a shape they expect.
  if (p.includes('approvals')) {
    return p.includes('kind=eq.publish_post') && p.includes('status=eq.pending')
      ? [{ id: APPROVAL_ID }, { id: 'a2' }] : [];
  }
  if (p.includes('leads')) return p.includes('status=eq.new') ? [{ id: 'l1' }] : [];
  if (p.includes('knowledge_clusters')) {
    return [{ id: CLUSTER_DB_ID, slug: 'campaigns', charter: { archetype: 'studio', flavor: 'listing_campaign', status: 'active', refs: [] }, world_id: WORLD_ID }];
  }
  if (p.includes('knowledge_worlds')) {
    return [{ id: WORLD_ID, title: 'Real Estate Marketing', focus_slug: 'campaigns', created_at: '2026-09-01', updated_at: '2026-09-14', business_context: null }];
  }
  return [];
}

/** Everything the page POSTed, so the test can assert what the approval was bound to. */
interface Writes { table: string; body: unknown }

async function mockBackend(page: Page, writes: Writes[]): Promise<void> {
  await page.route('**/auth/v1/user**', (r) => r.fulfill({ json: FAKE_USER }));
  await page.route('**/auth/v1/token**', (r) => r.fulfill({ json: fakeSession() }));
  await page.route('**/rest/v1/**', (r: Route) => {
    const req = r.request();
    const url = new URL(req.url());
    const table = url.pathname.split('/rest/v1/')[1]?.split('?')[0] ?? '';
    // RPCs are POSTs too, and they return a VALUE, not a row — answering one with a row is how the
    // sidebar ends up trying to render an object.
    if (table.startsWith('rpc/')) return r.fulfill({ json: 0 });
    if (req.method() === 'POST' || req.method() === 'PATCH') {
      let body: unknown = null;
      try { body = JSON.parse(req.postData() ?? 'null'); } catch { body = req.postData(); }
      writes.push({ table, body });
      const made =
        table === 'social_posts' ? { id: POST_ID }
          : table === 'post_versions' ? { id: VERSION_ID }
            : table === 'approvals' ? { id: APPROVAL_ID }
              : { id: 'row-1' };
      // .select().single() asks for a single OBJECT — answering with an array is how an insert
      // silently yields an undefined id.
      const wantsOne = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
      return r.fulfill({ json: wantsOne ? made : [made] });
    }
    const rows = restRows(req.url());
    const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
    return r.fulfill({ json: single && Array.isArray(rows) ? (rows[0] ?? null) : rows });
  });
  await page.route('**/functions/v1/**', (r) => r.fulfill({ status: 503, body: '' }));
  await page.route('**/realtime/v1/**', (r) => r.abort());
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  await page.addInitScript(({ session, universe }) => {
    window.localStorage.setItem('sb-localhost-auth-token', JSON.stringify(session));
    window.localStorage.setItem('ff:worlds:v1', JSON.stringify(universe));
    window.localStorage.setItem('ff:worlds:current', Object.keys(universe)[0]);
  }, { session: fakeSession(), universe: UNIVERSE });
}

function trackCrashes(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

test('the world opens on the campaign studio, and the pulse is useful before anything is typed', async ({ page }) => {
  const errors = trackCrashes(page);
  await mockBackend(page, []);
  await page.goto(`/garvis/webs/${WORLD_ID}`, { waitUntil: 'domcontentloaded' });

  // WORK FIRST: the studio is the front page, not a click behind "Advanced".
  await expect(page.getByRole('heading', { name: 'Campaign Studio' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Abbey Springs', exact: true })).toBeVisible();

  // ZERO-INPUT VALUE: who needs attention, what is scheduled, what worked.
  await expect(page.getByText(/waiting on your decision in the Queue/)).toBeVisible();
  await expect(page.getByText(/inquir(y|ies) with no reply yet/)).toBeVisible();
  await expect(page.getByText(/Next out:/)).toBeVisible();
  // The scheduled time is shown in the operator's zone, named — not as a UTC string.
  await expect(page.getByText(/CST|CDT/)).toBeVisible();
  // The last post links to the real platform URL, and shows only the numbers that came back.
  await expect(page.getByRole('link', { name: /see it/ })).toHaveAttribute('href', 'https://instagram.com/p/abbey1');
  await expect(page.getByText('12 likes · 3 comments')).toBeVisible();
  await expect(page.getByText(/impressions/)).toHaveCount(0);   // absent metric = absent, never a 0

  // CHROME COLLAPSED: setup exists, closed.
  await expect(page.getByRole('button', { name: /Community setup/ })).toBeVisible();
  await expect(page.getByLabel('Community name')).toHaveCount(0);
  await page.getByRole('button', { name: /Community setup/ }).click();
  await expect(page.getByLabel('Community name')).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});

test('a draft uses only verified, sourced, in-date facts — and names the rest instead of using them', async ({ page }) => {
  const errors = trackCrashes(page);
  await mockBackend(page, []);
  await page.goto(`/garvis/webs/${WORLD_ID}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Campaign Studio' })).toBeVisible({ timeout: 20_000 });

  // The count is honest about what is usable versus what needs checking.
  await expect(page.getByText(/1 verified fact available · 2 need checking/)).toBeVisible();

  await page.getByRole('button', { name: /Draft Abbey Springs post/ }).click();
  const draft = page.getByLabel('The draft post');
  await expect(draft).toBeVisible();

  // The good fact became real copy.
  await expect(draft).toHaveValue(/billed quarterly/);
  // The overdue one and the unsourced one did NOT — and neither was replaced by something plausible.
  await expect(draft).not.toHaveValue(/about two years/);
  await expect(draft).not.toHaveValue(/Memorial Day/);

  // Both are named, with what to do about them.
  await expect(page.getByText(/due for re-check on 2026-01-01/)).toBeVisible();
  await expect(page.getByText(/carries no source/)).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});

test('the approval that leaves this page is bound to an immutable version, not to a row id', async ({ page }) => {
  const errors = trackCrashes(page);
  const writes: Writes[] = [];
  await mockBackend(page, writes);
  await page.goto(`/garvis/webs/${WORLD_ID}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Campaign Studio' })).toBeVisible({ timeout: 20_000 });

  await page.getByLabel('Brokerage compliance line').fill('Gina Nocek · @properties · Equal Housing Opportunity');
  await page.getByRole('button', { name: /Draft Abbey Springs post/ }).click();
  const draft = page.getByLabel('The draft post');
  await expect(draft).toBeVisible();
  await page.getByLabel('When to post (Central time)').fill('2026-12-14T18:30');

  await page.getByRole('button', { name: /Send to the Queue/ }).click();
  await expect(page.getByText(/Sent to the Queue/)).toBeVisible({ timeout: 15_000 });

  const version = writes.find((w) => w.table === 'post_versions')?.body as Record<string, unknown> | undefined;
  expect(version, 'a version row must be written before any approval').toBeTruthy();
  expect(String(version?.content_hash ?? ''), 'the version carries its own content hash').toMatch(/^[0-9a-f]{64}$/);
  expect(version?.schedule_tz).toBe('America/Chicago');
  expect(version?.scheduled_local).toBe('2026-12-14T18:30');
  // The instant is resolved through the zone: 6:30pm Central in December is 00:30Z the next day.
  expect(version?.scheduled_for).toBe('2026-12-15T00:30:00.000Z');
  expect(version?.fact_ids, 'the version records which facts the copy leans on').toEqual(['fact-dues']);
  expect(version?.compliance_line).toContain('Equal Housing Opportunity');

  const approval = writes.find((w) => w.table === 'approvals')?.body as Record<string, unknown> | undefined;
  expect(approval, 'an approval must be enqueued').toBeTruthy();
  const payload = approval?.payload as Record<string, unknown>;
  expect(payload.version_id, 'the approval binds the VERSION').toBe(VERSION_ID);
  expect(payload.content_hash, 'and the hash of what it says').toBe(version?.content_hash);
  expect(payload.post_row_id).toBe(POST_ID);
  expect(approval?.payload_hash, 'the payload itself stays tamper-evident').toMatch(/^[0-9a-f]{64}$/);
  expect(approval?.status ?? 'pending', 'nothing arrives pre-approved').toBe('pending');
  expect(approval?.requested_by).toBe('user');

  expect(errors, errors.join('\n')).toEqual([]);
});

test('a link in the post carries this post\'s own tracking tag, so an inquiry can name it', async ({ page }) => {
  const errors = trackCrashes(page);
  const writes: Writes[] = [];
  await mockBackend(page, writes);
  await page.goto(`/garvis/webs/${WORLD_ID}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Campaign Studio' })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: /Draft Abbey Springs post/ }).click();
  const draft = page.getByLabel('The draft post');
  await expect(draft).toBeVisible();

  const link = 'https://gina.example/abbey-springs';
  await draft.fill(`Abbey Springs dues are billed quarterly. More here: ${link}`);
  await page.getByLabel('A link in this post').fill(link);
  await expect(page.getByText(/carry this post’s tracking tag/)).toBeVisible();

  await page.getByRole('button', { name: /Send to the Queue/ }).click();
  await expect(page.getByText(/Sent to the Queue/)).toBeVisible({ timeout: 15_000 });

  const version = writes.find((w) => w.table === 'post_versions')?.body as Record<string, unknown> | undefined;
  const body = String(version?.body ?? '');
  // The tag points at THIS post, and it is in the approved version — so what was approved is what
  // publishes, tracking included.
  expect(body, 'the link is tagged in the APPROVED version').toContain(`src=re_p_${POST_ID}`);
  expect(body).toContain('billed quarterly');

  // And the post row was updated to the same text, so the two never disagree.
  const bodyPatch = writes.filter((w) => w.table === 'social_posts')
    .map((w) => w.body as Record<string, unknown>).find((b) => typeof b.body === 'string' && String(b.body).includes('src=re_p_'));
  expect(bodyPatch, 'the stored post carries the same tagged text').toBeTruthy();

  expect(errors, errors.join('\n')).toEqual([]);
});

test('an untagged or absent link is left exactly as the operator wrote it', async ({ page }) => {
  const errors = trackCrashes(page);
  const writes: Writes[] = [];
  await mockBackend(page, writes);
  await page.goto(`/garvis/webs/${WORLD_ID}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Campaign Studio' })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: /Draft Abbey Springs post/ }).click();
  const draft = page.getByLabel('The draft post');
  await expect(draft).toBeVisible();
  await draft.fill('Abbey Springs dues are billed quarterly. Call me.');
  // A link named but NOT present in the text must not be bolted on — that would publish a link the
  // operator never wrote.
  await page.getByLabel('A link in this post').fill('https://gina.example/not-in-the-post');
  await expect(page.getByText(/only a link that appears in the text gets tagged/)).toBeVisible();

  await page.getByRole('button', { name: /Send to the Queue/ }).click();
  await expect(page.getByText(/Sent to the Queue/)).toBeVisible({ timeout: 15_000 });

  const version = writes.find((w) => w.table === 'post_versions')?.body as Record<string, unknown> | undefined;
  expect(String(version?.body ?? ''), 'no link was added').not.toContain('gina.example');
  expect(String(version?.body ?? ''), 'and no tag was invented').not.toContain('src=re_p_');

  expect(errors, errors.join('\n')).toEqual([]);
});

test('copy with an unverified fact in it cannot be queued at all', async ({ page }) => {
  const errors = trackCrashes(page);
  const writes: Writes[] = [];
  await mockBackend(page, writes);
  await page.goto(`/garvis/webs/${WORLD_ID}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Campaign Studio' })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: /Draft Abbey Springs post/ }).click();
  const draft = page.getByLabel('The draft post');
  await expect(draft).toBeVisible();

  // Put a hole back in, the way an operator would while writing.
  await draft.fill('Abbey Springs dues are [VERIFY: how often are they billed?] and the pool opens soon.');
  await expect(page.getByRole('button', { name: /Send to the Queue/ })).toBeDisabled();
  await expect(page.getByText(/Every \[VERIFY: …\] has to be filled or removed first/)).toBeVisible();
  expect(writes.filter((w) => w.table === 'approvals'), 'nothing may reach the Queue').toHaveLength(0);

  // Resolve it and the path opens again.
  await draft.fill('Abbey Springs dues are billed quarterly.');
  await expect(page.getByRole('button', { name: /Send to the Queue/ })).toBeEnabled();

  expect(errors, errors.join('\n')).toEqual([]);
});
