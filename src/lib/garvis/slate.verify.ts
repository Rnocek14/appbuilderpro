// src/lib/garvis/slate.verify.ts — the slate must bundle ONLY the cold-pitch class, and must hold
// flagged items out. Anything else in one keypress would be the bureaucracy the Queue exists to avoid.
import { buildSlate, isColdPitch, slateOffered, slateLine, slateResultLine } from './slate';

let pass = 0, fail = 0;
function check(name: string, ok: boolean) { if (ok) pass++; else { fail++; console.error(`✗ ${name}`); } }

const cold = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, kind: 'send_email', status: 'pending', payload: { kind: 'cold_site_pitch', campaign_id: 'c', message_id: id }, ...extra });

check('a cold pitch is a member', isColdPitch(cold('a')));
check('a follow-up is not (same shape, no marker)', !isColdPitch({ kind: 'send_email', payload: { campaign_id: 'c', message_id: 'm' } }));
check('an invoice chase is not', !isColdPitch({ kind: 'send_email', payload: { chase_stage: 1, message_id: 'm' } }));
check('a deploy is never a member', !isColdPitch({ kind: 'deploy_site', payload: { kind: 'cold_site_pitch' } }));
check('null payload is not', !isColdPitch({ kind: 'send_email', payload: null }));

const s = buildSlate([
  cold('p1'), cold('p2'),
  { id: 'f1', kind: 'send_email', status: 'pending', payload: { campaign_id: 'c', message_id: 'f' } },
  { id: 'd1', kind: 'deploy_site', status: 'pending', payload: {} },
  cold('p3', { riskScore: 90 }),
  cold('p4', { status: 'approved' }),
  cold('p5', { riskScore: 10 }),
], 70);
check('members are exactly the pending cold pitches under the risk bar', s.ids.join(',') === 'p1,p2,p5');
check('a high-risk pitch is held out as an outlier', s.outliers.join(',') === 'p3');
check('an already-decided pitch is not a member', !s.ids.includes('p4') && !s.outliers.includes('p4'));
check('order is preserved', s.ids[0] === 'p1' && s.ids[2] === 'p5');

check('the slate is offered from two up', slateOffered(s) && !slateOffered(buildSlate([cold('x')], 70)) && !slateOffered(buildSlate([], 70)));
check('the line names the count and the read-one rule', /3 cold pitches ready/.test(slateLine(s)) && /Read one/.test(slateLine(s)));
check('the line names held-out items', /1 held out/.test(slateLine(s)));
check('no held-out clause when none', !/held out/.test(slateLine(buildSlate([cold('a'), cold('b')], 70))));
check('result line: all ok', slateResultLine(4, 0) === 'Approved and sent 4 pitches.');
check('result line: partial names the failures and where they went', /sent 3; 1 failed and stay in the Queue/.test(slateResultLine(3, 1)));
check('result line: none sent is said plainly', /None sent/.test(slateResultLine(0, 2)));

console.log(`slate.verify: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
