// Run: npx tsx src/lib/garvis/mediaCast.verify.ts
import {
  PROVIDER_CAPS, isClipProvider, resolveReferences, continuityClause, compileShot,
  buildSeedanceRequest, estimateClipCostUsd, routeShot,
  type RefAsset, type ShotSpec, type CastIndex,
} from './mediaCast';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('mediaCast.verify');

const cast: CastIndex = {
  characters: { sarah: { name: 'Sarah' }, jake: { name: 'Jake' } },
  locations: { kitchen: { name: 'the kitchen' } },
};
const asset = (subjectId: string, kind: RefAsset['kind'], label = '', approved = true, subjectKind: RefAsset['subjectKind'] = 'character'): RefAsset =>
  ({ id: `${subjectId}-${kind}-${label}`, subjectKind, subjectId, kind, label, fileUrl: `https://x/${subjectId}-${kind}${label ? '-' + label : ''}.png`, approved });

const pool: RefAsset[] = [
  asset('sarah', 'face_front'), asset('sarah', 'full_body'), asset('sarah', 'outfit', 'black_sweater'),
  asset('sarah', 'voice_sample'),
  asset('jake', 'face_front'), asset('jake', 'full_body'),
  asset('kitchen', 'loc_wide', '', true, 'location'), asset('kitchen', 'loc_lighting', 'night', true, 'location'),
];

const shot: ShotSpec = {
  action: 'Sarah turns and sees Jake behind her.', dialogue: 'How did you get in here?',
  camera: 'medium close-up, slow push-in', emotion: 'shock', durationS: 5,
  characterIds: ['sarah', 'jake'], locationId: 'kitchen', wardrobe: { sarah: 'black_sweater' }, lighting: 'night',
  continuityIn: { clipUrl: 'https://x/shot14.mp4', wardrobe: { sarah: 'black_sweater' }, positions: { sarah: 'left of counter' }, heldObjects: { sarah: 'glass, right hand' }, lighting: 'warm interior night' },
};

{ // provider caps
  check('providers are recognized', isClipProvider('seedance') && isClipProvider('veo-fast') && !isClipProvider('sora'));
  check('seedance holds the verified slot counts (9/3/3, cap 12)',
    PROVIDER_CAPS.seedance.maxRefImages === 9 && PROVIDER_CAPS.seedance.maxRefVideos === 3
    && PROVIDER_CAPS.seedance.maxRefAudio === 3 && PROVIDER_CAPS.seedance.maxTotalRefs === 12);
  check('veo takes no reference video or audio', PROVIDER_CAPS.veo.maxRefVideos === 0 && PROVIDER_CAPS.veo.maxRefAudio === 0);
}

{ // the resolver
  const refs = resolveReferences(shot, pool, cast, 'seedance');
  const roles = refs.map((r) => r.role);
  check('both visible characters get a face reference', roles.includes('Sarah face') && roles.includes('Jake face'));
  check('the shot outfit resolves by label', roles.includes('Sarah outfit: black_sweater'));
  check('the location wide + named lighting state resolve', roles.includes('the kitchen wide') && roles.includes('the kitchen lighting: night'));
  check('the previous accepted clip rides as the reference video', refs.some((r) => r.modality === 'video' && r.role === 'previous shot'));
  check('a speaking character with a voice sample gets an audio reference', refs.some((r) => r.modality === 'audio' && r.role === 'Sarah voice'));
  check('slots are assigned in order (@Image1..., @Video1, @Audio1)',
    refs.filter((r) => r.modality === 'image').every((r, i) => r.slot === `@Image${i + 1}`)
    && refs.find((r) => r.modality === 'video')?.slot === '@Video1');

  const soloClose: ShotSpec = { ...shot, characterIds: ['sarah'], dialogue: undefined, continuityIn: undefined };
  const solo = resolveReferences(soloClose, pool, cast, 'seedance');
  check('the smallest useful set: Jake is not sent when Jake is not visible', !solo.some((r) => r.role.startsWith('Jake')));
  check('no dialogue → no voice reference', !solo.some((r) => r.modality === 'audio'));

  const unapproved = pool.map((a) => (a.subjectId === 'jake' ? { ...a, approved: false } : a));
  const gated = resolveReferences(shot, unapproved, cast, 'seedance');
  check('unapproved assets NEVER reach a renderer', !gated.some((r) => r.role.startsWith('Jake')));

  const veoRefs = resolveReferences(shot, pool, cast, 'veo');
  check('veo trims to its 3 image slots and drops video/audio it cannot take',
    veoRefs.filter((r) => r.modality === 'image').length === 3 && veoRefs.every((r) => r.modality === 'image'));
  check('identity outranks ambience: trimmed set still leads with faces', veoRefs[0].role === 'Sarah face');
  check('deterministic: same inputs, same references', JSON.stringify(refs) === JSON.stringify(resolveReferences(shot, pool, cast, 'seedance')));
}

{ // continuity + compile
  const clause = continuityClause(shot, cast);
  check('continuity clause carries wardrobe, position, held object, lighting',
    clause.includes('Sarah wears black_sweater') && clause.includes('left of counter')
    && clause.includes('glass, right hand') && clause.includes('warm interior night'));
  const offscreen: ShotSpec = { ...shot, characterIds: ['jake'] };
  check('continuity only speaks about characters IN the shot', !continuityClause(offscreen, cast).includes('Sarah'));

  const refs = resolveReferences(shot, pool, cast, 'seedance');
  const prompt = compileShot(shot, refs, cast, 'seedance');
  check('seedance prompt uses @slot notation and demands identity match', prompt.includes('@Image1 = Sarah face') && prompt.includes('Match every referenced identity exactly'));
  check('the prompt carries action, dialogue, camera, and the continuity clause',
    prompt.includes(shot.action) && prompt.includes('"How did you get in here?"')
    && prompt.includes('medium close-up') && prompt.includes('Continuity (must hold)'));
  const veoPrompt = compileShot(shot, resolveReferences(shot, pool, cast, 'veo'), cast, 'veo');
  check('veo prompt weaves roles into prose (no @ notation)', !veoPrompt.includes('@Image1') && veoPrompt.includes('Reference identities'));
}

{ // seedance request + cost
  const refs = resolveReferences(shot, pool, cast, 'seedance');
  const body = buildSeedanceRequest(shot, refs, cast, 'seedance');
  check('request is 9:16 720p with audio on', body.aspect_ratio === '9:16' && body.resolution === '720p' && body.generate_audio === true);
  check('duration clamps into the 4-15s band', body.duration === '5' && buildSeedanceRequest({ ...shot, durationS: 2 }, refs, cast, 'seedance').duration === '4');
  check('reference urls land in the schema field names (image_urls/video_urls/audio_urls)',
    Array.isArray(body.image_urls) && Array.isArray(body.video_urls) && Array.isArray(body.audio_urls));
  check('a video reference gets the discounted rate (continuity is subsidized)',
    estimateClipCostUsd(shot, refs, 'seedance-fast') === Math.round(0.1452 * 5 * 10000) / 10000);
  const noVid = refs.filter((r) => r.modality !== 'video');
  check('no video reference → the full rate', estimateClipCostUsd(shot, noVid, 'seedance-fast') === Math.round(0.2419 * 5 * 10000) / 10000);
}

{ // the router
  check('characters or dialogue → the reference renderer', routeShot(shot) === 'seedance-fast');
  check('an empty establishing shot → the cheap tier', routeShot({ ...shot, characterIds: [], dialogue: undefined }) === 'veo-fast');
  check('hero forces the premium tier', routeShot(shot, { hero: true }) === 'seedance');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
