// e2e/growth-studio.authed-mock.spec.ts — the GROWTH ENGINE surfaces rendered for REAL against a
// mocked backend (the authed-mock pattern): a content_growth world leads with its studio (not the
// marketing canvas), the Fact Channel Studio mounts with the learning loop's verdicts on real
// mocked numbers, the hook lab's B-cuts are offered on rendered episodes, uncited drafts wear the
// needs-review banner, and a dead edge function degrades to an HONEST message — never supabase-js's
// raw "non-2xx status code". Hermetic: no external requests at all.

import { test, expect, type Page } from '@playwright/test';

const WORLD_ID = '00000000-0000-4000-8000-0000000000aa';
const CLUSTER_DB_ID = '00000000-0000-4000-8000-0000000000cc';
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

const SCRIPT = {
  title: 'The 312 dollars your bank made off you',
  hooks: [
    'Your bank made 312 dollars off you last year.',
    'Most people never see the 312 dollars they hand their bank.',
    "You're funding your bank's profits — 312 dollars a year.",
  ],
  scenes: [
    { voiceover: 'Every dollar in your checking account gets lent back out at interest.', onScreen: 'Your cash works — for them', imagePrompt: 'a river of golden coins flowing into a bank vault', seconds: 6 },
    { voiceover: 'The average checking account pays zero point zero seven percent.', onScreen: '0.07% APY', imagePrompt: 'a tiny sprout beside a shrinking ice block', seconds: 5 },
    { voiceover: 'High-yield accounts pay fifty times more — same insurance.', onScreen: '50x — same FDIC', imagePrompt: 'two identical safes, one glowing', seconds: 6 },
  ],
  caption: 'Where your idle cash actually goes.', cta: 'Follow for one money mechanic a day.',
  hashtags: ['finance', 'money', 'facts'],
  sources: [{ claim: 'average checking APY', url: 'https://www.fdic.gov/national-rates', note: 'FDIC national rates' }],
  confidence: 0.82,
};

const CHANNEL = {
  id: '00000000-0000-4000-8000-00000000c001', world_id: WORLD_ID, cluster_id: CLUSTER_DB_ID,
  name: 'Finance facts', handle: '@dailymoneyfacts', niche: 'personal finance and money facts',
  persona: 'Calm, precise, slightly wry narrator.', platforms: ['tiktok', 'youtube', 'instagram'],
  cadence_per_week: 7, monetization_mode: 'affiliate_first', voice: 'onyx', music_mood: 'minimal',
  visual_style: 'modern flat editorial illustration', status: 'active', created_at: '2026-07-01T00:00:00Z',
  cta_url: 'https://moneyfacts.example.com', cta_label: '',
};

const ep = (n: string, title: string, status: string, opts: { script?: unknown; post?: string; video?: string; hook?: number } = {}) => ({
  id: `00000000-0000-4000-8000-0000000000e${n}`, channel_id: CHANNEL.id, cluster_id: CLUSTER_DB_ID,
  title, topic: '', script: opts.script ?? SCRIPT, hook_index: opts.hook ?? 0, status,
  render_id: null, video_url: opts.video ?? null, srt_url: null, caption: '', post_id: opts.post ?? null,
  error: null, created_at: `2026-07-${20 + Number(n)}T00:00:00Z`, assets: {}, variant_of: null,
});
const EPISODES = [
  ep('7', 'The compound interest myth', 'draft', { script: { ...SCRIPT, title: 'The compound interest myth', sources: [] } }),
  ep('6', 'How ATMs actually work', 'rendered', { video: 'data:video/mp4;base64,AAAA' }),
  ep('4', 'The 312 dollars your bank made off you', 'queued', { post: 'p4', hook: 1 }),
  ep('5', 'Inflation vs your savings', 'queued', { post: 'p5' }),
  ep('1', 'Why banks love your idle cash', 'posted', { post: 'p1' }),
  ep('2', 'The 50-30-20 lie', 'posted', { post: 'p2' }),
  ep('3', 'Credit scores decoded', 'posted', { post: 'p3' }),
];
const POSTS = ['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => ({ id, status: 'posted' }));
const metric = (post_id: string, views: number, pct: number) => ({
  post_id, video_views: views, impressions: null, likes: 5, comments: 1, shares: 0, saves: 0,
  clicks: 1, engagement: null, avg_watch_seconds: 30, full_watch_rate: 0.2, avg_view_pct: pct,
});
const METRICS = [metric('p1', 100, 41), metric('p2', 110, 39), metric('p3', 90, 36), metric('p4', 400, 62), metric('p5', 20, 17)];

const UNIVERSE = {
  [WORLD_ID]: {
    id: WORLD_ID, title: 'Growth Engine', focusId: 'growth-studio',
    createdAt: '2026-07-01T00:00:00Z', updatedAt: '2026-07-30T00:00:00Z',
    graph: {
      clusters: [{
        id: 'growth-studio', parentId: null, title: 'Growth studio',
        summary: 'Faceless fact channels.', kind: 'project', salience: 0.9, maturity: 'building',
        turnRefs: [], artifacts: [],
      }],
      edges: [],
    },
  },
};

function restRows(url: string): unknown {
  const p = new URL(url).pathname;
  if (p.includes('/rest/v1/rpc/')) return 0;
  if (p.includes('knowledge_clusters')) return [{ id: CLUSTER_DB_ID, slug: 'growth-studio', charter: { archetype: 'studio', flavor: 'content_growth', status: 'active', refs: [] }, world_id: WORLD_ID }];
  if (p.includes('knowledge_worlds')) return [{ id: WORLD_ID, title: 'Growth Engine', focus_slug: 'growth-studio', created_at: '2026-07-01', updated_at: '2026-07-30', business_context: null }];
  if (p.includes('growth_channels')) return [CHANNEL];
  if (p.includes('channel_episodes')) return EPISODES;
  if (p.includes('social_post_metrics')) return METRICS;
  if (p.includes('social_posts')) return POSTS;
  return [];
}

async function mockBackend(page: Page): Promise<void> {
  await page.route('**/auth/v1/user**', (r) => r.fulfill({ json: FAKE_USER }));
  await page.route('**/auth/v1/token**', (r) => r.fulfill({ json: fakeSession() }));
  await page.route('**/rest/v1/**', (r) => {
    const rows = restRows(r.request().url());
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object');
    r.fulfill({ json: single && Array.isArray(rows) ? (rows[0] ?? null) : rows });
  });
  // Functions are down and return NO body — the UI must show the honest fallback, not raw plumbing.
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

test('a growth world leads with its studio, and the loop\'s verdicts render on real numbers', async ({ page }) => {
  const errors = trackCrashes(page);
  await mockBackend(page);
  await page.goto(`/garvis/webs/${WORLD_ID}`, { waitUntil: 'domcontentloaded' });

  // The studio is the front page — NOT buried behind the marketing canvas's Advanced toggle.
  await expect(page.getByText('Fact Channel Studio', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Finance facts' })).toBeVisible();

  // The learning loop, visibly alive: median baseline + winner/quiet verdicts + retention reads.
  await expect(page.getByText(/baseline 100 views\/episode/)).toBeVisible();
  await expect(page.getByText('WINNER', { exact: true })).toBeVisible();
  await expect(page.getByText(/4x baseline — WINNER, double down/)).toBeVisible();
  await expect(page.getByText(/62% avg viewed — strong retention/)).toBeVisible();
  await expect(page.getByText(/quiet, change the mechanism/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Draft a follow-up to this winner/ })).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});

test('rendered episodes offer the hook lab; uncited drafts wear the needs-review banner', async ({ page }) => {
  const errors = trackCrashes(page);
  await mockBackend(page);
  await page.goto(`/garvis/webs/${WORLD_ID}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Fact Channel Studio', { exact: true })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: /How ATMs actually work/ }).first().click();
  await expect(page.getByRole('button', { name: /Queue to tiktok \+ youtube \+ instagram/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'B-cut with hook 2' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'B-cut with hook 3' })).toBeVisible();

  await page.getByRole('button', { name: /The compound interest myth/ }).first().click();
  await expect(page.getByText(/Unverified claims — no sources came back/)).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});

test('a dead edge function degrades to an honest message, never raw "non-2xx" plumbing', async ({ page }) => {
  const errors = trackCrashes(page);
  await mockBackend(page);
  await page.goto(`/garvis/webs/${WORLD_ID}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Fact Channel Studio', { exact: true })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: /Draft a cited episode/ }).click();
  await expect(page.getByText(/The script writer \(fact-script\) isn't answering/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/non-2xx status code/)).toHaveCount(0);

  expect(errors, errors.join('\n')).toEqual([]);
});
