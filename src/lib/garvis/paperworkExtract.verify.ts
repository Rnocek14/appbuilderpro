// src/lib/garvis/paperworkExtract.verify.ts
// Verifies template extraction's pure gauntlet (run: `npm run verify:paperworkextract`). Pure
// asserts, no DB. The body is the source of truth: orphan fields drop, missing fields generate,
// fragments and zero-token "templates" are refused rather than fabricated.

import { parseExtractedTemplate } from './paperworkExtract';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

const BODY = [
  'EXCLUSIVE LISTING AGREEMENT',
  'This agreement is made between {{seller_name}} ("Seller") and the Brokerage regarding the property at',
  '{{property_address}}. The listing price shall be {{listing_price}} and this agreement remains in force',
  'until {{expiration_date}}. Commission of {{commission_rate}} is due upon closing. Standard clause text',
  'continues here verbatim, unchanged, exactly as the sample document had it, including this boilerplate',
  'paragraph that never varies between deals and therefore stays untokenized.',
].join('\n');

// ---- happy path ----
const good = parseExtractedTemplate(JSON.stringify({
  name: 'Exclusive listing agreement', doc_kind: 'listing', body: BODY,
  fields: [
    { token: 'seller_name', label: 'Seller name', hint: 'full legal name' },
    { token: 'property_address', label: 'Property address', hint: 'as on the deed' },
    { token: 'listing_price', label: 'Listing price', hint: '' },
    { token: 'ghost_token', label: 'Not in the body', hint: 'orphan' },
  ],
}));
check('valid extraction parses', !!good && good.name === 'Exclusive listing agreement' && good.doc_kind === 'listing');
check('orphan field (no token in body) is dropped', !!good && good.fields.every((f) => f.token !== 'ghost_token'));
check('body tokens missing from fields are generated, never lost', !!good && ['expiration_date', 'commission_rate'].every((t) => good.fields.some((f) => f.token === t)));
check('generated field gets a humanized label', !!good && good.fields.find((f) => f.token === 'expiration_date')!.label === 'expiration date');
check('fields follow body appearance order', !!good && good.fields[0].token === 'seller_name' && good.fields[1].token === 'property_address');

// ---- refusals ----
check('a fragment (<200 char body) is refused', parseExtractedTemplate(JSON.stringify({ name: 'x', doc_kind: 'other', body: 'too short', fields: [] })) === null);
check('the model\'s own refusal shape is honored', parseExtractedTemplate(JSON.stringify({ name: '', doc_kind: 'other', body: '', fields: [] })) === null);
const noTokens = parseExtractedTemplate(JSON.stringify({ name: 'Copy', doc_kind: 'other', body: BODY.replace(/\{\{[^}]+\}\}/g, 'VALUE'), fields: [] }));
check('a zero-token "template" (just a copy) is refused', noTokens === null);
check('garbage returns null, not a throw', parseExtractedTemplate('nonsense') === null);
check('unknown doc_kind coerces to other', parseExtractedTemplate(JSON.stringify({ name: 'T', doc_kind: 'weird', body: BODY, fields: [] }))!.doc_kind === 'other');
check('fenced output parses', parseExtractedTemplate('```json\n' + JSON.stringify({ name: 'T', doc_kind: 'letter', body: BODY, fields: [] }) + '\n```') !== null);

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} paperworkExtract check(s) failed`);
