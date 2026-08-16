// Run: npx tsx src/lib/garvis/overnightRead.verify.ts
// Pins the overnight read's one law: ADDITIVE AND OPTIONAL. The deterministic counts are the
// spine; the model may only connect facts that exist, with numbers the rows already said —
// and any failure of any kind degrades to the brief exactly as it was.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { READ_MAX_SENTENCES, READ_MIN_FACTS, acceptOvernightRead, buildReadUser } from './overnightRead';
import { composeBriefing, type BriefingFacts } from './briefing';

let passed = 0;
let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

const FACTS = [
  '• 3 new leads from your sites — answer while it\'s warm',
  '• 2 actions waiting on your approval',
  '⏸ Arc "Vertical empire" has been waiting a day+: the CTA link needs you first',
];

// WHAT PASSES — grounded, short, plain.
{
  const good = acceptOvernightRead('The 3 new leads and the parked arc point the same way: approve the 2 waiting actions first, then answer the leads. The arc resumes itself once the CTA link is set.', FACTS);
  check('a grounded 2-sentence read passes', good.ok);
  check('…normalized to single-spaced text', good.ok && !/\s{2}/.test(good.read));
  check('a read with no numbers at all passes', acceptOvernightRead('Approve the waiting actions first — the parked arc resumes itself after that.', FACTS).ok);
}

// WHAT FAILS — every rejection is named, and a rejected read simply never ships.
{
  const invented = acceptOvernightRead('You got 7 new leads overnight.', FACTS);
  check('an invented count is rejected BY NAME', !invented.ok && !invented.ok && invented.reason.includes('"7"'));
  check('a real count passes the numbers gate', acceptOvernightRead('3 leads landed.', FACTS).ok);
  const four = acceptOvernightRead('One. Two. Three. Four.', FACTS);
  check(`more than ${READ_MAX_SENTENCES} sentences is rejected`, !four.ok && four.reason.includes('sentences'));
  check('hype is rejected', !acceptOvernightRead('Great news — the leads are rolling in!', FACTS).ok);
  check('hours-saved claims are rejected', !acceptOvernightRead('The machines saved you hours overnight.', FACTS).ok);
  check('persona chatter is rejected', !acceptOvernightRead("I've been hard at work on the leads.", FACTS).ok);
  check('empty is rejected', !acceptOvernightRead('   ', FACTS).ok);
  check('overlong is rejected', !acceptOvernightRead(`${'Very long sentence about leads and approvals and arcs, '.repeat(12)}.`, FACTS).ok);
  check('the min-facts floor is the documented one', READ_MIN_FACTS === 2);
  check('the prompt builder carries the facts as the only ground truth', buildReadUser(FACTS, [], []).includes('only ground truth'));
}

// THE BRIEFING SIDE — additive and optional, never load-bearing.
{
  const base: BriefingFacts = {
    hour: 8, sinceHours: 14, episodes: [], opportunities: 2,
    arcsFinished: [], arcsWaiting: [], approvals: 0, clocks: 0, channels: 0, predictions: null, read: null,
  };
  const withRead = composeBriefing({ ...base, read: 'The opportunities relate to the parked arc.' });
  check('a present read leads the lines', withRead.lines[0] === '» The opportunities relate to the parked arc.');
  check('…and the deterministic lines still follow', withRead.lines.some((l) => l.includes('2 opportunities filed')));
  const without = composeBriefing(base);
  check('an absent read costs nothing — the deterministic brief stands alone', without.lines[0]!.includes('2 opportunities filed'));
}

// ---- the pulse wiring (textual contract) ----
const here = dirname(fileURLToPath(import.meta.url));
const pulse = readFileSync(join(here, '../../../supabase/functions/garvis-pulse/index.ts'), 'utf8');
const run = readFileSync(join(here, 'briefingRun.ts'), 'utf8');
{
  check('the read runs AFTER the quiet-night gate — a quiet night makes NO call',
    pulse.indexOf('quiet night stays quiet') > 0
    && pulse.indexOf('quiet night stays quiet') < pulse.indexOf('acceptOvernightRead('));
  check('credits gate BEFORE the model call, real spend recorded after',
    pulse.indexOf("checkCredits(admin, p.id, 'garvis')") > 0
    && pulse.indexOf("checkCredits(admin, p.id, 'garvis')") < pulse.indexOf('content: READ_SYSTEM')
    && pulse.includes('spendCredits(admin, p.id,'));
  check('only an ACCEPTED read ships or is stored', pulse.includes('if (verdict.ok)'));
  check('the prompt rides the quarantine (fact lines carry external text)',
    pulse.includes('quarantineExternal(buildReadUser('));
  check('the read is an INSERTION into the deterministic lines, never a rewrite',
    pulse.includes('lines.splice(1, 0, `» ${readLine}`)'));
  check('every failure path degrades to the brief as-is (catch swallows, notify still sends)',
    pulse.indexOf('the deterministic brief stands alone') > 0
    && pulse.indexOf('the deterministic brief stands alone') < pulse.indexOf('await notifyText(p.webhook_url, lines.join'));
  check('the stored read is findable by the dock (source overnight-read)',
    pulse.includes("source: 'overnight-read'") && run.includes("eq('source', 'overnight-read')"));
}

console.log(`\novernightRead.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} overnight read check(s) failed`);
