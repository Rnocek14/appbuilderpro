// Run: npx tsx src/lib/garvis/reconcile.verify.ts
import { parseHistory, matchesExpected, reconcile, type ExpectedPost } from './reconcile';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('reconcile.verify');

const SENT = '2026-09-20T23:30:00.000Z';
const expected: ExpectedPost = {
  body: 'Abbey Springs dues are billed quarterly.',
  platforms: ['instagram'],
  sentAtIso: SENT,
};
const record = (o: Record<string, unknown> = {}) => ({
  id: 'prov-1', post: expected.body, created: SENT, platforms: ['instagram'],
  postIds: [{ platform: 'instagram', status: 'success', postUrl: 'https://instagram.com/p/abc' }],
  ...o,
});

// ---- reading whatever shape came back -------------------------------------
{
  check('a bare array parses', parseHistory([record()]).length === 1);
  check('an object with a history array parses', parseHistory({ history: [record()] }).length === 1);
  check('an object with a posts array parses', parseHistory({ posts: [record()] }).length === 1);
  check('the body is read from any of the usual keys',
    parseHistory([{ body: 'x' }, { text: 'y' }, { message: 'z' }, { post: 'w' }]).map((r) => r.body).join() === 'x,y,z,w');
  check('the platform URL is lifted per platform',
    parseHistory([record()])[0].postUrls.instagram === 'https://instagram.com/p/abc');
  check('a single platform string still reads as a list',
    parseHistory([{ post: 'x', platform: 'Instagram' }])[0].platforms.join() === 'instagram');
  check('junk never throws and never invents',
    parseHistory(null).length === 0 && parseHistory('nope').length === 0 && parseHistory({ history: 'nope' }).length === 0);
  check('non-object entries are skipped', parseHistory([null, 'x', 7, record()]).length === 1);
}

// ---- is this record ours? --------------------------------------------------
{
  const rec = parseHistory([record()])[0];
  check('an exact body match in the window is ours', matchesExpected(rec, expected, 6 * 3600_000));
  check('whitespace and case differences still match',
    matchesExpected(parseHistory([record({ post: '  ABBEY SPRINGS   dues are billed quarterly.  ' })])[0], expected, 6 * 3600_000));
  check('a different body is NOT ours',
    !matchesExpected(parseHistory([record({ post: 'Something else entirely.' })])[0], expected, 6 * 3600_000));
  check('an identical post from last week is NOT ours (outside the window)',
    !matchesExpected(parseHistory([record({ created: '2026-09-13T23:30:00.000Z' })])[0], expected, 6 * 3600_000));
  check('a record with no timestamp is judged on the body alone',
    matchesExpected(parseHistory([record({ created: null })])[0], expected, 6 * 3600_000));
  check('an empty body never matches, even against an empty expectation',
    !matchesExpected(parseHistory([record({ post: '   ' })])[0], { ...expected, body: '   ' }, 6 * 3600_000));
}

// ---- the decision ----------------------------------------------------------
{
  const found = reconcile(true, [record()], expected);
  check('our post in the history reads as POSTED', found.verdict === 'posted');
  check('the provider id is captured', found.providerId === 'prov-1');
  check('the platform URL is captured', found.postUrls.instagram === 'https://instagram.com/p/abc');

  const absent = reconcile(true, [record({ post: 'A completely different post.' })], expected);
  check('recent history WITHOUT our post reads as NOT POSTED', absent.verdict === 'not_posted');
  check('and says it is safe to send again', absent.reason.includes('safe to send again'));

  check('a failed history call is UNKNOWN, never not_posted',
    reconcile(false, null, expected).verdict === 'unknown');
  check('an EMPTY history is UNKNOWN, never not_posted (it proves nothing)',
    reconcile(true, [], expected).verdict === 'unknown');
  check('an unparseable payload is UNKNOWN',
    reconcile(true, { something: 'else' }, expected).verdict === 'unknown');
  check('unknown never carries a provider id or url',
    reconcile(false, null, expected).providerId === null && Object.keys(reconcile(false, null, expected).postUrls).length === 0);
  check('every unknown says a human has to look',
    reconcile(false, null, expected).reason.includes('by hand') && reconcile(true, [], expected).reason.includes('by hand'));
}

// ---- the property that keeps a client's account safe -----------------------
{
  // The ONLY route to a retry is not_posted, and the only route to not_posted is a history that
  // came back AND contained recent records AND did not contain ours.
  const cases: [string, ReturnType<typeof reconcile>][] = [
    ['a dead endpoint', reconcile(false, null, expected)],
    ['an empty history', reconcile(true, [], expected)],
    ['an unrecognized shape', reconcile(true, { nope: true }, expected)],
    ['a history that contains ours', reconcile(true, [record()], expected)],
  ];
  for (const [label, r] of cases) {
    check(`${label} never authorizes a re-send`, r.verdict !== 'not_posted');
  }
}

console.log(`\nreconcile.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} reconcile check(s) failed`);
