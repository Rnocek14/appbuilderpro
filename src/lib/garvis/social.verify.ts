// src/lib/garvis/social.verify.ts — proof the social core refuses what a platform would reject and
// warns (visibly) about the rest, before anything is queued.
// Run: npx tsx src/lib/garvis/social.verify.ts

import { checkDraft, providerPayload, mapProviderResult, isPlatform, type SocialDraft, platformUrls } from './social';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

const NOW = '2026-07-13T12:00:00Z';
const draft = (over: Partial<SocialDraft>): SocialDraft => ({ text: 'New listing on Shore Dr!', platforms: ['facebook'], ...over });

// --- platform validation -------------------------------------------------------------------------
check('known platforms recognized', isPlatform('instagram') && isPlatform('gmb') && !isPlatform('myspace'));
check('no platforms → refused', !checkDraft(draft({ platforms: [] }), NOW).ok);
check('unknown platform → refused by name', (() => {
  const c = checkDraft(draft({ platforms: ['facebook', 'myspace'] }), NOW);
  return !c.ok && (c.reason ?? '').includes('myspace');
})());

// --- content requirements ------------------------------------------------------------------------
check('empty text + no media → refused', !checkDraft(draft({ text: '' }), NOW).ok);
check('Instagram with no image → refused (media required)', (() => {
  const c = checkDraft(draft({ platforms: ['instagram'], text: 'hi' }), NOW);
  return !c.ok && (c.reason ?? '').includes('Instagram');
})());
check('Instagram WITH an image → ok', checkDraft(draft({ platforms: ['instagram'], mediaUrls: ['https://x/i.jpg'] }), NOW).ok);
check('Facebook text-only → ok (no media required)', checkDraft(draft({ platforms: ['facebook'] }), NOW).ok);

// --- scheduling ----------------------------------------------------------------------------------
check('a future schedule time is ok', checkDraft(draft({ scheduleAt: '2026-07-20T15:00:00Z' }), NOW).ok);
check('a past schedule time is refused', (() => {
  const c = checkDraft(draft({ scheduleAt: '2026-07-01T15:00:00Z' }), NOW);
  return !c.ok && (c.reason ?? '').includes('past');
})());
check('a garbage schedule time is refused', !checkDraft(draft({ scheduleAt: 'next tuesday' }), NOW).ok);

// --- honesty warnings (non-blocking) -------------------------------------------------------------
const longX = checkDraft(draft({ platforms: ['twitter'], text: 'a'.repeat(300) }), NOW);
check('an over-limit X post is allowed but WARNS about the cut', longX.ok && longX.warnings.some((w) => w.includes('280')));
const vid = checkDraft(draft({ platforms: ['facebook'], mediaUrls: ['https://x/reel.mp4'] }), NOW);
check('a video URL warns about the paid tier', vid.ok && vid.warnings.some((w) => w.toLowerCase().includes('video')));
check('a clean post has no warnings', checkDraft(draft({}), NOW).warnings.length === 0);

// --- provider payload ----------------------------------------------------------------------------
const p = providerPayload(draft({ platforms: ['facebook', 'instagram'], mediaUrls: ['https://x/i.jpg'], scheduleAt: '2026-07-20T15:00:00Z' }));
check('payload carries post + platforms', (p.post as string).includes('Shore Dr') && Array.isArray(p.platforms));
check('payload includes media + scheduleDate when present', Array.isArray(p.mediaUrls) && p.scheduleDate === '2026-07-20T15:00:00Z');
check('payload omits media/schedule when absent', (() => {
  const q = providerPayload(draft({}));
  return !('mediaUrls' in q) && !('scheduleDate' in q);
})());

// --- provider result mapping ---------------------------------------------------------------------
check('scheduled → scheduled', mapProviderResult({ status: 'scheduled' }, true) === 'scheduled');
check('success with post ids → posted', mapProviderResult({ status: 'success', postIds: [{ status: 'success' }] }, false) === 'posted');
check('any per-platform error → failed', mapProviderResult({ status: 'success', postIds: [{ status: 'error' }] }, false) === 'failed');
check('provider error status → failed', mapProviderResult({ status: 'error', errors: [{}] }, false) === 'failed');
check('unknown shape → failed, never a false posted', mapProviderResult({}, false) === 'failed');

// --- the final platform URL ----------------------------------------------------------------------
check('a returned per-platform URL is captured under its platform',
  platformUrls({ postIds: [{ platform: 'instagram', status: 'success', postUrl: 'https://instagram.com/p/abc' }] }).instagram === 'https://instagram.com/p/abc');
check('several platforms each keep their own URL', (() => {
  const u = platformUrls({ postIds: [
    { platform: 'instagram', postUrl: 'https://instagram.com/p/a' },
    { platform: 'facebook', url: 'https://facebook.com/p/b' },
  ] });
  return u.instagram === 'https://instagram.com/p/a' && u.facebook === 'https://facebook.com/p/b';
})());
check('the platform key is normalized', platformUrls({ postIds: [{ platform: ' Instagram ', postUrl: 'https://x.test/1' }] }).instagram === 'https://x.test/1');
check('a platform that returns NO url gets no entry — never a constructed one',
  Object.keys(platformUrls({ postIds: [{ platform: 'tiktok', status: 'success' }] })).length === 0);
check('a non-url value is ignored',
  Object.keys(platformUrls({ postIds: [{ platform: 'tiktok', postUrl: 'pending' }] })).length === 0);
check('an entry with no platform name is ignored',
  Object.keys(platformUrls({ postIds: [{ postUrl: 'https://x.test/1' }] })).length === 0);
check('a response with no postIds yields nothing, and never throws',
  Object.keys(platformUrls({})).length === 0 && Object.keys(platformUrls(null)).length === 0 && Object.keys(platformUrls('nope')).length === 0);
check('a scheduled response with no urls yet yields nothing',
  Object.keys(platformUrls({ status: 'scheduled' })).length === 0);

console.log(`\nsocial.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) { throw new Error(`${failed} check(s) failed`); }
