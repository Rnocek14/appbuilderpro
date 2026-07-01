// src/lib/garvis/profiles.verify.ts
// Standalone verification of the app-profile pure helpers (run: `npm run verify:profiles`).
// Pure-function asserts, no DB, no test framework (matches objective.verify.ts / knowledge.verify.ts).
//   - Tolerant parse: clean JSON, fenced JSON, garbage, and out-of-range confidence all normalize safely.
//   - Empty profiles are detected and excluded from the digest.
//   - The digest renders only usable profiles, by app name.
//   - Staleness is computed against an injectable clock.

import { parseProfileResponse, isProfileEmpty, isProfileStale, buildProfilesDigest, buildProfileUser } from './profiles';
import type { GarvisAppProfile } from '../../types';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

function profile(over: Partial<GarvisAppProfile> = {}): GarvisAppProfile {
  return {
    id: 'p', owner_id: 'o', app_id: over.app_id ?? 'a1',
    purpose: null, audience: null, business_model: null, current_state: null,
    blocker: null, next_milestone: null, stage_assessment: null,
    confidence: null, source: null, model: null,
    generated_at: '2026-06-01T00:00:00Z', created_at: '', updated_at: '', ...over,
  };
}

// 1. Tolerant parse — clean JSON.
const clean = parseProfileResponse('{"purpose":"Does X","audience":"devs","confidence":0.7}');
check('parses clean JSON purpose', clean.purpose === 'Does X');
check('parses clean JSON audience', clean.audience === 'devs');
check('parses confidence', clean.confidence === 0.7);

// 2. Fenced JSON + surrounding prose.
const fenced = parseProfileResponse('Here you go:\n```json\n{"purpose":"P","next_milestone":"Ship it"}\n```\nthanks');
check('parses fenced JSON purpose', fenced.purpose === 'P');
check('parses fenced JSON next_milestone', fenced.next_milestone === 'Ship it');

// 3. Garbage never throws → all-null profile.
const garbage = parseProfileResponse('the model refused and wrote prose only');
check('garbage parse returns nulls (no throw)', garbage.purpose === null && garbage.confidence === null);

// 4. Confidence clamped to 0..1; empty strings become null.
const clamp = parseProfileResponse('{"purpose":"   ","confidence":5}');
check('blank string field normalizes to null', clamp.purpose === null);
check('out-of-range confidence clamps to 1', clamp.confidence === 1);
const negc = parseProfileResponse('{"confidence":-2}');
check('negative confidence clamps to 0', negc.confidence === 0);

// 5. Empty detection.
check('all-null profile is empty', isProfileEmpty(garbage));
check('profile with purpose is not empty', !isProfileEmpty(parseProfileResponse('{"purpose":"x"}')));

// 6. Digest excludes empties, includes content + app name.
const names = { a1: 'LaunchBuddy', a2: 'EmptyApp' };
const digest = buildProfilesDigest(
  [profile({ app_id: 'a1', purpose: 'Stripe/OAuth plumbing', next_milestone: 'Deploy to a live URL' }), profile({ app_id: 'a2' })],
  names,
);
check('digest includes the named usable profile', digest.includes('LaunchBuddy') && digest.includes('Stripe/OAuth plumbing'));
check('digest includes next milestone', digest.includes('Deploy to a live URL'));
check('digest excludes the empty profile', !digest.includes('EmptyApp'));
check('digest of only-empty profiles is empty string', buildProfilesDigest([profile({ app_id: 'a2' })], names) === '');

// 7. Staleness against an injectable clock.
const now = Date.parse('2026-06-24T00:00:00Z');
check('a 23-day-old profile is stale (14d threshold)', isProfileStale('2026-06-01T00:00:00Z', 14, now));
check('a 2-day-old profile is fresh', !isProfileStale('2026-06-22T00:00:00Z', 14, now));
check('a null timestamp is treated as stale', isProfileStale(null, 14, now));
check('an unparseable timestamp is treated as stale', isProfileStale('not-a-date', 14, now));

// 8. Prompt build folds in evidence and degrades gracefully when fields are missing.
const prompt = buildProfileUser({
  name: 'launch-buddy-bot', storedStage: 'building', deployUrl: null,
  repo: { description: 'A bot', language: 'TypeScript', archived: false, pushedAt: '2026-06-20T00:00:00Z', openIssues: 3, recentCommits: [{ message: 'wire Stripe', date: '2026-06-20T00:00:00Z' }], topIssues: [{ title: 'OAuth flow broken', comments: 2 }] },
  readme: '# Launch Buddy\nHelps founders launch.',
});
check('prompt includes product name', prompt.includes('launch-buddy-bot'));
check('prompt includes a recent commit', prompt.includes('wire Stripe'));
check('prompt includes an open issue', prompt.includes('OAuth flow broken'));
check('prompt includes README content', prompt.includes('Helps founders launch'));
check('prompt marks no deploy URL', prompt.includes('not deployed'));
const sparse = buildProfileUser({ name: 'lonely-repo' });
check('sparse prompt notes no README', sparse.includes('no README found'));
check('sparse prompt notes no commits', sparse.includes('(none read)'));

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} profile check(s) failed`);
