// Run: npx tsx src/lib/garvis/emailBoard.verify.ts
// The email board adapter fills real facts, keeps unknowns as [EDIT] holes, leaves merge fields intact,
// signs from the real business, and a rendition always yields a visibly-different subject line.
import {
  EMAIL_KINDS_RE, EMAIL_KINDS_GENERIC, emailKindsFor, emailKindById, defaultEmailKind,
  buildEmailContent, applyEmailRendition, composeEmailText, type EmailMaterials, type EmailKind,
} from './emailBoard';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('emailBoard.verify');

const full: EmailMaterials = { businessName: 'Lakeside Realty', agentName: 'Jane Doe', phone: '(262) 555-0148', area: 'Lake Geneva', realEstate: true };
const bare: EmailMaterials = { businessName: '', agentName: '', phone: null, area: null, realEstate: true };
const ALL: EmailKind[] = [...EMAIL_KINDS_RE, ...EMAIL_KINDS_GENERIC];

check('kinds are well-formed with unique ids', new Set(ALL.map((k) => k.id)).size === ALL.length && EMAIL_KINDS_RE.length >= 5 && EMAIL_KINDS_GENERIC.length >= 3);
check('every kind offers ≥2 subject angles + a body', ALL.every((k) => k.subjects(full).length >= 2 && !!k.body(full)));
check('kindsFor / kindById / defaultKind resolve', emailKindsFor(true) === EMAIL_KINDS_RE && !!emailKindById('re_referral') && !!defaultEmailKind(false));

{
  const c = buildEmailContent({ materials: full, kind: emailKindById('re_home_value')! });
  check('build: subject from the first angle + non-empty body', c.subject === c.subjectOptions[0] && c.body.length > 20);
  check('body fills real facts (area, signer, phone) + keeps the merge field', /Lake Geneva/.test(c.body) && /Jane Doe, Lakeside Realty/.test(c.body) && /\(262\) 555-0148/.test(c.body) && /\{\{first_name\}\}/.test(c.body));

  const bareC = buildEmailContent({ materials: bare, kind: emailKindById('re_market_update')! });
  check('bare materials → visible [EDIT] holes, name/area holed, no invented phone', /\[EDIT/.test(bareC.body) && /\[EDIT: your name\]/.test(bareC.body) && !/\d{3}/.test(bareC.body));
}

// renditions: cycle subject angles; a "subject:" instruction sets it verbatim
{
  const c = buildEmailContent({ materials: full, kind: emailKindById('re_new_listing')! });
  const r1 = applyEmailRendition(c, '');
  check('rendition cycles to a different subject angle', r1.subject !== c.subject && r1.subject === c.subjectOptions[1] && r1.body === c.body);
  const r2 = applyEmailRendition(c, 'subject: Your dream lakefront awaits');
  check('a "subject:" instruction sets the subject verbatim', r2.subject === 'Your dream lakefront awaits');
  // cycling wraps around all options
  let cur = c; const seen = new Set<string>();
  for (let i = 0; i < c.subjectOptions.length; i++) { seen.add(cur.subject); cur = applyEmailRendition(cur, ''); }
  check('cycling covers every subject angle', seen.size === c.subjectOptions.length);
}

check('composeEmailText has Subject + body', /^Subject: /.test(composeEmailText(buildEmailContent({ materials: full, kind: EMAIL_KINDS_RE[0] }))));

console.log(`\nemailBoard.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} emailBoard check(s) failed`);
