// Run: npx tsx src/lib/garvis/postVersion.verify.ts
import {
  VERSION_FIELDS, parseVersionContent, canonicalVersion, versionHash, versionsDiffer,
  describeChange, boundPayload, readBoundPayload, type PostVersionContent,
} from './postVersion';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('postVersion.verify');

const base: PostVersionContent = {
  body: 'Abbey Springs dues are billed quarterly.',
  platforms: ['instagram', 'facebook'],
  mediaUrls: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'],
  mediaDigests: { 'https://cdn.example.com/a.jpg': 'aaa', 'https://cdn.example.com/b.jpg': 'bbb' },
  scheduledFor: '2026-09-20T23:30:00.000Z',
  scheduledLocal: '2026-09-20T18:30',
  scheduleTz: 'America/Chicago',
  factIds: ['f1', 'f2'],
  complianceLine: 'Equal Housing Opportunity',
};
const clone = (o: Partial<PostVersionContent> = {}): PostVersionContent => ({ ...base, ...o });

// ---- canonical shape -------------------------------------------------------
{
  const c = canonicalVersion(base) as Record<string, unknown>;
  check('platforms canonicalize to a sorted set', JSON.stringify(c.platforms) === JSON.stringify(['facebook', 'instagram']));
  check('media ORDER is preserved (reordering a carousel changes the post)',
    JSON.stringify(c.mediaUrls) === JSON.stringify(base.mediaUrls));
  check('fact ids canonicalize to a sorted set', JSON.stringify(c.factIds) === JSON.stringify(['f1', 'f2']));
  check('body is trimmed', (canonicalVersion(clone({ body: '  hi  ' })) as { body: string }).body === 'hi');
  check('an empty compliance line normalizes to null',
    (canonicalVersion(clone({ complianceLine: '   ' })) as { complianceLine: unknown }).complianceLine === null);
  const stray = canonicalVersion(clone({ mediaDigests: { ...base.mediaDigests, 'https://gone.example/x.jpg': 'zzz' } })) as { mediaDigests: Record<string, string> };
  check('a digest for media that is no longer attached is dropped', !('https://gone.example/x.jpg' in stray.mediaDigests));
}

// ---- the hash covers everything a human would re-approve --------------------
{
  const h = await versionHash(base);
  check('the hash is stable across key order',
    (await versionHash(clone())) === h);
  check('platform ORDER does not change the hash',
    (await versionHash(clone({ platforms: ['facebook', 'instagram'] }))) === h);

  const mustChange: [string, Partial<PostVersionContent>][] = [
    ['the text', { body: `${base.body} ` + 'And more.' }],
    ['a destination', { platforms: ['instagram', 'facebook', 'linkedin'] }],
    ['the media list', { mediaUrls: [base.mediaUrls[0]] }],
    ['the media ORDER', { mediaUrls: [base.mediaUrls[1], base.mediaUrls[0]] }],
    ['the media BYTES behind the same url', { mediaDigests: { ...base.mediaDigests, 'https://cdn.example.com/a.jpg': 'CHANGED' } }],
    ['the scheduled instant', { scheduledFor: '2026-09-21T23:30:00.000Z' }],
    ['the operator-typed local time', { scheduledLocal: '2026-09-20T19:30' }],
    ['the time zone', { scheduleTz: 'America/New_York' }],
    ['the facts relied on', { factIds: ['f1'] }],
    ['the brokerage line', { complianceLine: 'Another Brokerage' }],
  ];
  for (const [label, patch] of mustChange) {
    check(`changing ${label} changes the hash`, (await versionHash(clone(patch))) !== h);
  }
  check('every hashed field is covered by a case above', VERSION_FIELDS.length === mustChange.length - 1);
}

// ---- named differences -----------------------------------------------------
{
  check('an identical version differs in nothing', versionsDiffer(base, clone()).length === 0);
  const d = versionsDiffer(base, clone({ body: 'Different.', platforms: ['tiktok'] }));
  check('the changed fields are named', d.includes('body') && d.includes('platforms'));
  check('describeChange names them in words',
    describeChange(d).includes('the text') && describeChange(d).includes('the destinations'));
  check('describeChange refuses to invent a change', describeChange([]) === 'Nothing changed.');
  check('a bytes-only change is described as the file itself',
    describeChange(versionsDiffer(base, clone({ mediaDigests: { ...base.mediaDigests, 'https://cdn.example.com/a.jpg': 'X' } })))
      .includes('the media file itself'));
}

// ---- tolerant reader -------------------------------------------------------
{
  const fromRow = parseVersionContent({
    body: 'x', platforms: ['instagram'], media_urls: ['u'], media_digests: { u: 'd' },
    scheduled_for: '2026-01-01T00:00:00.000Z', scheduled_local: '2025-12-31T18:00',
    schedule_tz: 'America/Chicago', fact_ids: ['a'], compliance_line: 'Line',
  });
  check('a snake_case DB row reads back', fromRow.mediaUrls[0] === 'u' && fromRow.factIds[0] === 'a' && fromRow.complianceLine === 'Line');
  const junk = parseVersionContent({ platforms: 'not-an-array', mediaDigests: ['nope'], factIds: [1, null, 'ok'] });
  check('junk shapes never throw and never invent', junk.platforms.length === 0 && Object.keys(junk.mediaDigests).length === 0 && JSON.stringify(junk.factIds) === JSON.stringify(['ok']));
  check('a missing timezone defaults to America/Chicago', junk.scheduleTz === 'America/Chicago');
  check('an absent schedule reads as null, never as now', junk.scheduledFor === null && junk.scheduledLocal === null);
}

// ---- the payload -----------------------------------------------------------
{
  const p = boundPayload('post-1', 'ver-1', 'hash-1');
  check('the payload carries the row, the version and the hash',
    p.post_row_id === 'post-1' && p.version_id === 'ver-1' && p.content_hash === 'hash-1');
  const read = readBoundPayload(p);
  check('a bound payload reads back', read.versionId === 'ver-1' && read.contentHash === 'hash-1');
  const legacy = readBoundPayload({ post_row_id: 'old' });
  check('a legacy { post_row_id } payload reads as unbound, never as bound',
    legacy.postRowId === 'old' && legacy.versionId === null && legacy.contentHash === null);
  check('garbage reads as nothing', readBoundPayload(null).postRowId === null);
}

console.log(`\npostVersion.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} postVersion check(s) failed`);
