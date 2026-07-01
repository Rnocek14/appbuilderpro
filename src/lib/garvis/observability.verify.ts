// src/lib/garvis/observability.verify.ts
// Standalone verification of the Mission Control rollup helpers (run: `npm run verify:observability`).

import { withinDays, sumCostWithin, countWithin, topByConfidence, sortFeed } from './observability';
import type { FeedItem } from './observability';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

const now = Date.parse('2026-06-24T12:00:00Z');
const today = '2026-06-24T09:00:00Z';
const threeDaysAgo = '2026-06-21T09:00:00Z';
const lastMonth = '2026-05-20T09:00:00Z';

// 1. withinDays.
check('today is within 1 day', withinDays(today, 1, now));
check('3 days ago is NOT within 1 day', !withinDays(threeDaysAgo, 1, now));
check('3 days ago is within 7 days', withinDays(threeDaysAgo, 7, now));
check('null/garbage timestamps are out', !withinDays(null, 7, now) && !withinDays('nope', 7, now));
check('future timestamps are excluded', !withinDays('2027-01-01T00:00:00Z', 7, now));

// 2. sumCostWithin — window vs all-time.
const runs = [
  { cost_usd: 1.0, created_at: today },
  { cost_usd: '2.50', created_at: threeDaysAgo },
  { cost_usd: 4.0, created_at: lastMonth },
  { cost_usd: null, created_at: today },
];
check('today spend sums only today', sumCostWithin(runs, 1, now) === 1.0);
check('7-day spend sums today+3d (string parsed)', sumCostWithin(runs, 7, now) === 3.5);
check('all-time spend sums everything', sumCostWithin(runs, null, now) === 7.5);

// 3. countWithin.
check('counts rows within 1 day', countWithin(runs as Record<string, unknown>[], 1, now) === 2);
check('counts rows within 7 days', countWithin(runs as Record<string, unknown>[], 7, now) === 3);

// 4. topByConfidence.
check('picks the highest confidence', topByConfidence([{ confidence: 0.5 }, { confidence: 0.9 }, { confidence: 0.7 }])?.confidence === 0.9);
check('handles null confidence (beaten by any real one)', topByConfidence([{ confidence: null }, { confidence: 0.2 }])?.confidence === 0.2);
check('empty list => null', topByConfidence([]) === null);

// 5. sortFeed — newest first + cap.
const feed: FeedItem[] = [
  { id: 'a', ts: threeDaysAgo, kind: 'mission', title: 'old', tone: 'dim' },
  { id: 'b', ts: today, kind: 'opportunity', title: 'new', tone: 'ember' },
  { id: 'c', ts: lastMonth, kind: 'recommend', title: 'oldest', tone: 'ok' },
];
const sorted = sortFeed(feed);
check('feed is newest-first', sorted[0].id === 'b' && sorted[2].id === 'c');
check('feed respects the cap', sortFeed(feed, 2).length === 2 && sortFeed(feed, 2)[0].id === 'b');

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} observability check(s) failed`);
