// servicePackages.verify.ts — the pure half of the package noun (app_0115): version selection and
// the establish plan's honesty (mechanical vs deliberate; no invention on missing data).
import { currentPackage, establishPlan, type PackageRow } from './servicePackages';

let failed = 0;
const check = (name: string, pass: boolean) => {
  console.log(`  ${pass ? 'ok ' : 'FAIL'} - ${name}`);
  if (!pass) failed++;
};

const mk = (over: Partial<PackageRow>): PackageRow => ({
  id: 'p1', owner_id: null, key: 'website', version: 1, name: 'New Website', blurb: '', cadence: 'one_time',
  price_hint: '', definition: {}, status: 'current', ...over,
});

// ---- currentPackage: highest current version; the operator's override beats a built-in ----
check('no rows → null', currentPackage([], 'website') === null);
check('retired versions never win', currentPackage([mk({ version: 3, status: 'retired' }), mk({ version: 1 })], 'website')?.version === 1);
check('highest current version wins', currentPackage([mk({ version: 1 }), mk({ version: 2, id: 'p2' })], 'website')?.version === 2);
check('the operator\'s row beats a built-in at the same version',
  currentPackage([mk({ version: 2 }), mk({ version: 2, id: 'mine', owner_id: 'op' })], 'website')?.id === 'mine');
check('a different key never leaks in', currentPackage([mk({ key: 'website_automation' })], 'website') === null);

// ---- establishPlan: honest about what it can and cannot do ----
const full = mk({ definition: { establishes: { watch_site: true, propose_automations: ['lead_followup', ' '], reporting: 'monthly' } } });
const plan = establishPlan(full, 'https://riverside-dental.example.com');
check('a live URL + watch_site → the watch arms', plan.watchUrl === 'https://riverside-dental.example.com');
check('blank automation ids are dropped, real ones proposed', plan.proposeAutomations.length === 1 && plan.proposeAutomations[0] === 'lead_followup');
check('reporting cadence carries', plan.reporting === 'monthly');
check('no live URL → watchUrl null (payment-time watch is the backstop), never a guess',
  establishPlan(full, null).watchUrl === null && establishPlan(full, 'not-a-url').watchUrl === null);
check('watch_site absent → no watch even with a URL', establishPlan(mk({ definition: { establishes: {} } }), 'https://x.example.com').watchUrl === null);
check('an empty definition establishes nothing', JSON.stringify(establishPlan(mk({}), null)) === JSON.stringify({ watchUrl: null, proposeAutomations: [], reporting: null }));

console.log(`\nservicePackages.verify: ${11 - failed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} service-package check(s) failed`);
