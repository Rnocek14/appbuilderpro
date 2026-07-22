// Run: npx tsx src/lib/garvis/videoScenes.verify.ts
import { VIDEO_SCENE_KINDS, SCENE_PROMPTS, isVideoSceneKind, buildVeoRequest, veoOperationName, veoResult, sceneUpdateAfterPoll } from './videoScenes';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('videoScenes.verify');

// ── prompts ────────────────────────────────────────────────────────────────
check('every scene kind has a prompt + label + negative', VIDEO_SCENE_KINDS.every((k) => SCENE_PROMPTS[k]?.prompt && SCENE_PROMPTS[k]?.label && SCENE_PROMPTS[k]?.negative));
check('the plumber prompt describes water bursting from a pipe', /pipe/i.test(SCENE_PROMPTS.pipe.prompt) && /burst/i.test(SCENE_PROMPTS.pipe.prompt) && /water/i.test(SCENE_PROMPTS.pipe.prompt));
check('prompts ask for photoreal + no text (clean overlay)', VIDEO_SCENE_KINDS.every((k) => /photoreal/i.test(SCENE_PROMPTS[k].prompt) && /no text/i.test(SCENE_PROMPTS[k].prompt)));
check('isVideoSceneKind guards unknown kinds', isVideoSceneKind('pipe') && !isVideoSceneKind('nope'));

// ── request body ─────────────────────────────────────────────────────────────
const req = buildVeoRequest(SCENE_PROMPTS.pipe.prompt, { negativePrompt: SCENE_PROMPTS.pipe.negative, durationSeconds: 6 });
check('request wraps the prompt in instances[]', req.instances.length === 1 && req.instances[0].prompt.includes('copper pipe'));
check('request carries aspectRatio default 16:9', req.parameters.aspectRatio === '16:9');
check('negativePrompt + durationSeconds passed through when set', req.parameters.negativePrompt === SCENE_PROMPTS.pipe.negative && req.parameters.durationSeconds === 6);
const bare = buildVeoRequest('x');
check('optional params omitted when unset (never send rejected fields)', !('negativePrompt' in bare.parameters) && !('durationSeconds' in bare.parameters));

// ── start-response parsing ───────────────────────────────────────────────────
check('operation name extracted from the start response', veoOperationName({ name: 'operations/abc123' }) === 'operations/abc123');
check('missing operation name → null', veoOperationName({}) === null);

// ── poll-response parsing ────────────────────────────────────────────────────
const pending = veoResult({ done: false });
check('not-done poll → keep waiting', pending.done === false && pending.videoUri === null);

const ok = veoResult({ done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: 'https://files/vid.mp4' } }] } } });
check('done+ok poll → the video uri', ok.done === true && ok.videoUri === 'https://files/vid.mp4' && ok.error === null);

const apiErr = veoResult({ done: true, error: { code: 400, message: 'blocked prompt' } });
check('done+error poll → surfaces the error', apiErr.done === true && apiErr.videoUri === null && /blocked prompt/.test(apiErr.error ?? ''));

const empty = veoResult({ done: true, response: { generateVideoResponse: { generatedSamples: [] } } });
check('done but no sample → an error, not a silent success', empty.done === true && empty.videoUri === null && !!empty.error);

// ── status transitions ───────────────────────────────────────────────────────
check('pending poll → status generating', sceneUpdateAfterPoll(pending).status === 'generating' && sceneUpdateAfterPoll(pending).done === false);
check('ok poll → status ready', sceneUpdateAfterPoll(ok).status === 'ready' && sceneUpdateAfterPoll(ok).done === true);
check('error poll → status failed', sceneUpdateAfterPoll(apiErr).status === 'failed');

console.log(`\nvideoScenes.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} videoScenes check(s) failed`);
