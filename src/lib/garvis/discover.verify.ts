// Run: npx tsx src/lib/garvis/discover.verify.ts
// Pins the "random photos" fix: media only attaches when it is ABOUT the topic.
import { mediaRelevant } from './discoverRelevance';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

// The resolved-page gate.
check('the right page passes ("lake como wisconsin" → "Lake Como (Wisconsin)")',
  mediaRelevant('lake como wisconsin', 'Lake Como (Wisconsin)'));
check('a ZERO-overlap top hit is rejected ("lakefront resort branding" → "Danny DeVito")',
  !mediaRelevant('lakefront resort branding', 'Danny DeVito'));
check('the gate\'s honest limit: a same-term wrong page ("Perry Como") passes the TITLE gate — the FILENAME gate still constrains its images',
  mediaRelevant('como country club', 'Perry Como'));
check('an unrelated page is rejected ("stroke recovery exercises" → "Butterfly stroke" shares a term, but "Rowing (sport)" does not)',
  !mediaRelevant('stroke recovery exercises', 'Rowing (sport)'));
check('prefix folding matches derivatives ("resort branding" → "Brand")',
  mediaRelevant('resort branding', 'Brand'));

// The filename gate — the actual random-photo killers.
check('a topical file passes ("lake como wisconsin" → "Lake_Como_WI_aerial.jpg")',
  mediaRelevant('lake como wisconsin Lake Como (Wisconsin)', 'Lake_Como_WI_aerial.jpg'));
check('a random gallery portrait is dropped ("roman concrete" → "Giuseppe_Verdi_portrait.jpg")',
  !mediaRelevant('roman concrete Roman concrete', 'Giuseppe_Verdi_portrait.jpg'));
check('a location map is dropped when unrelated ("black holes" → "USA_Wisconsin_location_map.jpg")',
  !mediaRelevant('black holes Black hole', 'USA_Wisconsin_location_map.jpg'));
check('underscores and extensions never hide a match ("golf carts" → "Golf_cart_fleet.png")',
  mediaRelevant('golf carts', 'Golf_cart_fleet.png'));

// Honest edges.
check('stopword-only queries are never relevant to anything', !mediaRelevant('how does it work', 'Mechanism'));
check('empty candidate is never relevant', !mediaRelevant('lake como', ''));
check('deterministic', mediaRelevant('lake como', 'Lake Como') === mediaRelevant('lake como', 'Lake Como'));

console.log(`\ndiscover.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} discover check(s) failed`);
