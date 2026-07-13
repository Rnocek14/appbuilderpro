// src/lib/garvis/standing.verify.ts
// Run: npx tsx src/lib/garvis/standing.verify.ts
// The implementation under test is THE deployed one (supabase/functions/_shared/standingCore.ts)
// — one implementation, verified here, executed in the standing-worker edge function. Verifies: scheduling math is deterministic and drift-free, the watch
// decision never lies (a failed fetch is UNREACHABLE, never "no change"; first sight is a baseline,
// never a "change"; markup noise is not a change), and records are deterministic.

import {
  nextRunAfter, isDue, normalizeContent, contentHash, changeExcerpt, decideWatch,
  watchArtifact, orderStatusLine,
} from '../../../supabase/functions/_shared/standingCore';

let passed = 0, failed = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
};

console.log('standing.verify');

// 1 — scheduling: strictly-after, anchor-stable, drift-free.
{
  const anchor = '2026-07-01T09:00:00.000Z';
  check('daily: next run is tomorrow 09:00 when now is today 10:00',
    nextRunAfter('daily', anchor, '2026-07-01T10:00:00.000Z') === '2026-07-02T09:00:00.000Z');
  check('daily: a LATE worker (now 09:30 three days on) still lands on the 09:00 grid',
    nextRunAfter('daily', anchor, '2026-07-04T09:30:00.000Z') === '2026-07-05T09:00:00.000Z');
  check('now exactly on the anchor → the NEXT slot, strictly after',
    nextRunAfter('daily', anchor, anchor) === '2026-07-02T09:00:00.000Z');
  check('now before the anchor → the anchor itself',
    nextRunAfter('weekly', anchor, '2026-06-20T00:00:00.000Z') === anchor);
  check('hourly steps by the hour',
    nextRunAfter('hourly', anchor, '2026-07-01T09:10:00.000Z') === '2026-07-01T10:00:00.000Z');
  let threw = false;
  try { nextRunAfter('daily', 'garbage', anchor); } catch { threw = true; }
  check('bad timestamps throw, never a silent NaN schedule', threw);
}

// 2 — isDue is a pure comparison and respects pause.
{
  check('due when active and nextRunAt has passed', isDue({ status: 'active', nextRunAt: '2026-07-01T09:00:00Z' }, '2026-07-01T09:00:01Z'));
  check('not due before nextRunAt', !isDue({ status: 'active', nextRunAt: '2026-07-01T09:00:00Z' }, '2026-07-01T08:59:59Z'));
  check('paused is never due', !isDue({ status: 'paused', nextRunAt: '2020-01-01T00:00:00Z' }, '2026-07-01T00:00:00Z'));
}

// 3 — normalization: markup noise is NOT content.
{
  const a = normalizeContent('<html><script nonce="x1">track()</script><style>.a{}</style><body><h1>Price: $49</h1>\n\n<p>per month</p></body></html>');
  const b = normalizeContent('<html><script nonce="ZZZ">track2()</script><body><h1>Price:   $49</h1> <p>per month</p></body></html>');
  check('scripts/styles/tags/whitespace stripped to the human-visible text', a === 'Price: $49 per month');
  check('rotating nonces and script bodies do NOT change the content identity', contentHash(a) === contentHash(b));
  const c = normalizeContent('<body><h1>Price: $59</h1><p>per month</p></body>');
  check('a real price change DOES change the identity', contentHash(a) !== contentHash(c));
}

// 4 — the watch decision: the three honest outcomes.
{
  const now = '2026-07-13T12:00:00.000Z';
  const down = decideWatch({ label: 'Acme pricing', prevHash: 'abc', prevText: 'Price: $49', fetched: { ok: false, error: 'timeout' }, nowIso: now });
  check('failed fetch → UNREACHABLE, never "no change"', down.status === 'unreachable' && /couldn’t reach|couldn't reach/i.test(down.line));
  check('failed fetch keeps the prior hash (no baseline reset)', down.hash === 'abc');
  check('failed fetch line admits nothing was checked', /nothing was checked/i.test(down.line));

  const first = decideWatch({ label: 'Acme pricing', prevHash: null, prevText: null, fetched: { ok: true, text: '<h1>Price: $49</h1>' }, nowIso: now });
  check('first successful check → baseline, not a fake "change"', first.status === 'unchanged' && /baseline/i.test(first.line) && first.hash !== null);

  const same = decideWatch({ label: 'Acme pricing', prevHash: first.hash, prevText: 'Price: $49', fetched: { ok: true, text: '<h1>Price:  $49</h1>' }, nowIso: now });
  check('whitespace/markup drift → unchanged', same.status === 'unchanged' && same.hash === first.hash);

  const changed = decideWatch({ label: 'Acme pricing', prevHash: first.hash, prevText: 'Price: $49', fetched: { ok: true, text: '<h1>Price: $59</h1>' }, nowIso: now });
  check('a real change → CHANGED with an excerpt naming what moved', changed.status === 'changed' && !!changed.excerpt && changed.excerpt.includes('59'));
  check('checkedAt is the caller-supplied now, never invented', changed.checkedAt === now);
}

// 5 — excerpts read like a human note.
{
  check('replacement shows now/was', changeExcerpt('Price: $49 per month', 'Price: $59 per month').includes('was:'));
  check('pure addition shows added:', changeExcerpt('Plans', 'Plans and a free tier').startsWith('added:'));
  check('pure removal shows removed:', changeExcerpt('Plans and a free tier', 'Plans').startsWith('removed:'));
  const long = changeExcerpt('a', `a${'x'.repeat(500)}`);
  check('long excerpts are clipped', long.length < 300 && long.includes('…'));
}

// 6 — records: deterministic, only for real changes.
{
  const now = '2026-07-13T12:00:00.000Z';
  const changed = decideWatch({ label: 'Acme pricing', prevHash: 'zz', prevText: 'Price: $49', fetched: { ok: true, text: 'Price: $59' }, nowIso: now });
  const a1 = watchArtifact('order-1', 'Acme pricing', changed);
  const a2 = watchArtifact('order-1', 'Acme pricing', changed);
  check('a change record is deterministic per order+content', !!a1 && a1.id === a2!.id && a1.id.startsWith('watch-'));
  check('the record is an earned garvis doc naming the change', a1!.source === 'garvis' && a1!.detail.includes('CHANGED'));
  const un = decideWatch({ label: 'x', prevHash: changed.hash, prevText: 'Price: $59', fetched: { ok: true, text: 'Price: $59' }, nowIso: now });
  check('no record for an unchanged run', watchArtifact('order-1', 'x', un) === null);
}

// 7 — the UI status line never synthesizes.
{
  check('paused says paused', orderStatusLine({ status: 'paused', lastRunAt: null, lastResult: null, nextRunAt: 'x' }) === 'Paused — not checking.');
  check('never-ran says when it will', /hasn’t run yet|hasn't run yet/i.test(orderStatusLine({ status: 'active', lastRunAt: null, lastResult: null, nextRunAt: '2026-07-14T09:00:00Z' })));
  const now = '2026-07-13T12:00:00.000Z';
  const res = decideWatch({ label: 'Acme', prevHash: 'a', prevText: 'x', fetched: { ok: false, error: 'dns' }, nowIso: now });
  check('after a run, the line IS the run’s own honest line', orderStatusLine({ status: 'active', lastRunAt: now, lastResult: res, nextRunAt: 'x' }) === res.line);
}

console.log(`\nstanding.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} standing check(s) failed`);
