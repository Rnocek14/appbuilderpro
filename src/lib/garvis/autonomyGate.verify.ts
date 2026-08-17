// Run: npx tsx src/lib/garvis/autonomyGate.verify.ts
// The server autonomy gate's contract (paired suite for the mutation looking-glass, SW10.12):
// fail-closed at EVERY branch — risk blocks, missing grants, manual mode, hit caps, query
// errors, and thrown exceptions all mean "manual"; only a real auto grant under its cap says yes.

import { autonomyAllowed } from '../../../supabase/functions/_shared/autonomyGate';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

/** A stub admin whose grant row and today-count are scripted per case. Captures the day-window
 *  bound the gate queries with, so the "since UTC midnight" claim is an assertion, not a comment. */
const captured: { gte: string[] } = { gte: [] };
function admin(grant: { mode: string; daily_cap: number } | null, count: number | null, opts?: { grantErr?: boolean; countErr?: boolean; explode?: boolean }) {
  return {
    from(table: string) {
      if (opts?.explode) throw new Error('boom');
      const isGrants = table === 'autonomy_grants';
      const chain = {
        select: () => chain, eq: () => chain, contains: () => chain,
        gte: (_col: string, iso: string) => { captured.gte.push(iso); return chain; },
        maybeSingle: async () => (opts?.grantErr ? { data: null, error: { message: 'x' } } : { data: grant, error: null }),
        then: (resolve: (v: { count: number | null; error: unknown }) => unknown) =>
          resolve(opts?.countErr ? { count: null, error: { message: 'x' } } : { count, error: null }),
      };
      void isGrants;
      return chain;
    },
  };
}

// LOW risk facts (send at noon, small payload, known recipient) — the risk gate passes these.
const lowRisk = { kind: 'send_email', amountUsd: null, recipientKnown: true, hourUtc: 12, payloadBytes: 500, medianPayloadBytes: 500 };
// HIGH risk facts — a big-money spend to an unknown recipient at 3am.
const highRisk = { kind: 'spend', amountUsd: 900, recipientKnown: false, hourUtc: 3, payloadBytes: 500, medianPayloadBytes: 500 };

const run = (a: unknown, risk: unknown) => autonomyAllowed(a, 'owner-1', 'chase_send', risk as never);

check('a real auto grant under its cap says yes',
  await run(admin({ mode: 'auto', daily_cap: 5 }, 2), lowRisk) === true);
check('ABSENT RISK FACTS fail closed — no facts, no autonomy',
  await run(admin({ mode: 'auto', daily_cap: 5 }, 0), null) === false);
check('HIGH risk blocks autonomy even with a valid grant',
  await run(admin({ mode: 'auto', daily_cap: 5 }, 0), highRisk) === false);
check('no grant row means manual', await run(admin(null, 0), lowRisk) === false);
check("a 'manual' grant never self-approves", await run(admin({ mode: 'manual', daily_cap: 5 }, 0), lowRisk) === false);
check('AT the cap the gate closes (strict less-than)',
  await run(admin({ mode: 'auto', daily_cap: 5 }, 5), lowRisk) === false);
check('one under the cap is still open', await run(admin({ mode: 'auto', daily_cap: 5 }, 4), lowRisk) === true);
check('a grant-query error fails closed', await run(admin({ mode: 'auto', daily_cap: 5 }, 0, { grantErr: true }), lowRisk) === false);
check('a count-query error fails closed', await run(admin({ mode: 'auto', daily_cap: 5 }, 0, { countErr: true }), lowRisk) === false);
check('a thrown exception fails closed', await run(admin({ mode: 'auto', daily_cap: 5 }, 0, { explode: true }), lowRisk) === false);
check('a null daily_cap falls back to 5 and still caps',
  await run(admin({ mode: 'auto', daily_cap: null as unknown as number }, 5), lowRisk) === false
  && await run(admin({ mode: 'auto', daily_cap: null as unknown as number }, 4), lowRisk) === true);
check('an UNKNOWN count refuses — unknown usage is not zero usage (fail-closed on the cap)',
  await run(admin({ mode: 'auto', daily_cap: 5 }, null), lowRisk) === false);
check("today's window starts at exactly UTC midnight — the cap is per-day, not per-25-hours",
  captured.gte.length > 0 && captured.gte.every((iso) => /T00:00:00\.000Z$/.test(iso)));

console.log(`\nautonomyGate.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} autonomy gate check(s) failed`);
