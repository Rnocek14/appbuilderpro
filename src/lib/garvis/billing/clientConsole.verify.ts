// Run: npx tsx src/lib/garvis/billing/clientConsole.verify.ts
import { buildClientConsole, totalLiveSurfaces, type ClientRef, type TriggerRef, type MissedCallRef, type ListRef } from './clientConsole';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('clientConsole.verify');

const clients: ClientRef[] = [
  { id: 'c1', business_name: 'Joe’s Plumbing', status: 'active', price_cents: 50000, cadence: 'monthly' },
  { id: 'c2', business_name: 'Ace Dental', status: 'pending', price_cents: 40000, cadence: 'monthly' },
];
const triggers: TriggerRef[] = [
  { client_subscription_id: 'c1', status: 'active' },
  { client_subscription_id: 'c1', status: 'paused' },
  { client_subscription_id: null, status: 'active' },            // unassigned
  { client_subscription_id: 'c_ghost', status: 'active' },       // FK to a deleted client → unassigned
];
const missed: MissedCallRef[] = [
  { client_subscription_id: 'c1', enabled: true },
  { client_subscription_id: 'c2', enabled: false },
];
const lists: ListRef[] = [
  { client_subscription_id: 'c1' },
  { client_subscription_id: null },
];

const rows = buildClientConsole(clients, triggers, missed, lists);
const byId = (id: string | null) => rows.find((r) => r.clientId === id);

check('every paying client appears (even c2 with almost nothing attached)', !!byId('c1') && !!byId('c2'));
check('c1 counts its 2 triggers, 1 live', byId('c1')!.triggers === 2 && byId('c1')!.liveTriggers === 1);
check('c1 counts its missed-call number as live', byId('c1')!.missedCall === 1 && byId('c1')!.liveMissedCall === 1);
check('c1 liveTotal = active triggers + enabled numbers', byId('c1')!.liveTotal === 2);
check('c1 counts its list', byId('c1')!.lists === 1);
check('c2 has a paused/off surface, nothing live', byId('c2')!.missedCall === 1 && byId('c2')!.liveMissedCall === 0 && byId('c2')!.liveTotal === 0);
check('c2 still shown though it has no triggers (empty, not missing)', byId('c2')!.triggers === 0);

const un = byId(null);
check('an Unassigned bucket collects the null + dangling-FK surfaces', !!un && un.triggers === 2 && un.lists === 1);
check('Unassigned is appended last', rows[rows.length - 1].clientId === null);
check('client rows keep the given order (c1 before c2)', rows[0].clientId === 'c1' && rows[1].clientId === 'c2');

check('totalLiveSurfaces sums live across clients + unassigned', totalLiveSurfaces(rows) === 4);  // c1: 2 · c2: 0 · unassigned: 2 active triggers (null + dangling FK)

// Unassigned bucket is omitted entirely when everything is attached.
const allAssigned = buildClientConsole(
  [clients[0]],
  [{ client_subscription_id: 'c1', status: 'active' }],
  [{ client_subscription_id: 'c1', enabled: true }],
  [{ client_subscription_id: 'c1' }],
);
check('no Unassigned row when nothing is unassigned', !allAssigned.some((r) => r.clientId === null));

// No clients, no surfaces → empty, never a phantom row.
check('empty inputs → empty console', buildClientConsole([], [], [], []).length === 0);

// Determinism.
check('deterministic for identical inputs', JSON.stringify(buildClientConsole(clients, triggers, missed, lists)) === JSON.stringify(rows));

console.log(`\nclientConsole.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} clientConsole check(s) failed`);
