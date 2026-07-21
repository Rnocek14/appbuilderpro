import { buildVerifiedHandoff, deriveMissionStatus } from './missionRun';
import type { GarvisTask } from '../../types';

let passed = 0; let failed = 0;
function check(name: string, condition: boolean) {
  if (condition) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

const task = (id: string, seq: number, status: GarvisTask['status'], ok: boolean | null, body = ''): GarvisTask => ({
  id, owner_id: 'u', mission_id: 'm', seq, worker: 'research', title: `Task ${id}`,
  input: {}, status,
  result: body ? { summary: `Summary ${id}`, artifacts: [{ kind: 'doc', title: `Artifact ${id}`, body }] } : null,
  verify: ok === null ? null : { ok, issues: ok ? [] : ['bad'], warnings: [] },
  cost_usd: 0, created_at: '', updated_at: '',
});

const tasks = [task('a', 0, 'done', true, 'trusted research'), task('b', 1, 'failed', false, 'untrusted guess'), task('c', 2, 'queued', null)];
const handoff = buildVerifiedHandoff(tasks, 2);
check('handoff includes verified upstream output', handoff.includes('trusted research'));
check('handoff excludes failed or unverified output', !handoff.includes('untrusted guess'));
check('handoff excludes later tasks', buildVerifiedHandoff(tasks, 0) === '');
check('handoff respects its hard budget', buildVerifiedHandoff([task('long', 0, 'done', true, 'x'.repeat(500))], 1, 180).length <= 180);

check('all verified done → review', deriveMissionStatus([task('a', 0, 'done', true)]) === 'review');
check('mixed done and failed → partial', deriveMissionStatus([task('a', 0, 'done', true), task('b', 1, 'failed', false)]) === 'partial');
check('all failed → failed', deriveMissionStatus([task('b', 0, 'failed', false)]) === 'failed');
check('queued work remains running', deriveMissionStatus([task('a', 0, 'queued', null)]) === 'running');
check('cancel signal wins', deriveMissionStatus([task('a', 0, 'done', true)], true) === 'cancelled');

console.log(`\nmissionRun.verify: ${passed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} mission run check(s) failed`);
