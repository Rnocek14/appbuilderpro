// Run: npx tsx src/lib/garvis/publishGate.verify.ts
import { carriesCompliance, complianceGate, withCompliance } from './publishGate';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('publishGate.verify');

const LINE = 'Gina Nocek · @properties · Equal Housing Opportunity';
const caption = 'Three things every Abbey Springs owner should check before listing.';

// ---- the gate --------------------------------------------------------------
{
  check('a caption without the required line is REFUSED', complianceGate(caption, LINE) !== null);
  check('the refusal quotes the line so it can be pasted', (complianceGate(caption, LINE) ?? '').includes(LINE));
  check('a caption carrying the line passes', complianceGate(`${caption}\n\n${LINE}`, LINE) === null);
  check('an operator with NO line configured is never blocked by a rule they do not have',
    complianceGate(caption, null) === null && complianceGate(caption, '') === null && complianceGate(caption, '   ') === null);
  check('an empty caption with a required line is still refused', complianceGate('', LINE) !== null);
}

// ---- matching is forgiving about shape, strict about substance -------------
{
  check('case does not matter', carriesCompliance(`${caption}\n\n${LINE.toUpperCase()}`, LINE));
  check('line breaks inside the line do not matter',
    carriesCompliance(`${caption}\n\nGina Nocek · @properties ·\nEqual Housing Opportunity`, LINE));
  check('extra spacing does not matter',
    carriesCompliance(`${caption}  Gina   Nocek · @properties · Equal Housing Opportunity`, LINE));
  check('a PARTIAL line does not count as carrying it',
    !carriesCompliance(`${caption}\n\nEqual Housing Opportunity`, LINE));
  check('a different brokerage does not count',
    !carriesCompliance(`${caption}\n\nGina Nocek · Другое · Equal Housing Opportunity`, LINE));
}

// ---- appending -------------------------------------------------------------
{
  const once = withCompliance(caption, LINE);
  check('the line is appended when missing', once.includes(LINE));
  check('it is appended exactly ONCE, never twice', withCompliance(once, LINE) === once);
  check('appending is idempotent however many times it runs',
    withCompliance(withCompliance(withCompliance(caption, LINE), LINE), LINE) === once);
  check('no line configured leaves the caption untouched', withCompliance(caption, null) === caption);
  check('an empty caption gets just the line, with no leading blank lines',
    withCompliance('', LINE) === LINE);
  check('the original caption survives verbatim above it', once.startsWith(caption));
  check('what withCompliance produces always passes the gate', complianceGate(once, LINE) === null);
}

console.log(`\npublishGate.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} publishGate check(s) failed`);
