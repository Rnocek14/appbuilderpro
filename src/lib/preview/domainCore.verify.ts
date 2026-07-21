// Run: npx tsx src/lib/preview/domainCore.verify.ts
import { classifyDomain, dnsRecordsFor, apexPointsAtNetlify, NETLIFY_APEX_IP } from './domainCore';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('domainCore.verify');

// --- classifyDomain: apex vs subdomain, incl. two-part TLDs ------------------------------------
{
  const a = classifyDomain('summitroofing.com');
  check('a .com root is apex', !!a && a.isApex && a.registrable === 'summitroofing.com' && a.sub === null);
  const w = classifyDomain('www.summitroofing.com');
  check('www is a subdomain', !!w && !w.isApex && w.sub === 'www' && w.registrable === 'summitroofing.com');
  const g = classifyDomain('go.summitroofing.com');
  check('go. is a subdomain', !!g && !g.isApex && g.sub === 'go');
  const uk = classifyDomain('summitroofing.co.uk');
  check('a .co.uk root is treated as apex', !!uk && uk.isApex && uk.registrable === 'summitroofing.co.uk');
  const wuk = classifyDomain('www.summitroofing.co.uk');
  check('www on .co.uk is a subdomain', !!wuk && !wuk.isApex && wuk.sub === 'www');
  const deep = classifyDomain('a.b.example.com');
  check('multi-label subdomain keeps the full sub', !!deep && deep.sub === 'a.b' && deep.registrable === 'example.com');
  check('a bare label / junk → null', classifyDomain('localhost') === null && classifyDomain('') === null && classifyDomain('a b.com') === null);
}

// --- dnsRecordsFor: exact records, apex gets A + www CNAME, sub gets one CNAME ------------------
{
  const apex = dnsRecordsFor('summitroofing.com', 'summit-roofing-ab12.netlify.app');
  check('apex → an A record at the root + a www CNAME', apex.length === 2
    && apex[0].type === 'A' && apex[0].host === '@' && apex[0].value === NETLIFY_APEX_IP
    && apex[1].type === 'CNAME' && apex[1].host === 'www' && apex[1].value === 'summit-roofing-ab12.netlify.app');
  const sub = dnsRecordsFor('go.summitroofing.com', 'summit-roofing-ab12.netlify.app');
  check('subdomain → a single CNAME at that label', sub.length === 1 && sub[0].type === 'CNAME' && sub[0].host === 'go' && sub[0].value === 'summit-roofing-ab12.netlify.app');
  check('never emits an MX record (email is never touched)', ![...apex, ...sub].some((r) => (r.type as string) === 'MX'));
  check('junk domain or missing host → no records', dnsRecordsFor('nope', 'x.netlify.app').length === 0 && dnsRecordsFor('summitroofing.com', '').length === 0);
  const www = dnsRecordsFor('www.summitroofing.com', 'x.netlify.app');
  check('an explicit www is a single CNAME (not apex A)', www.length === 1 && www[0].host === 'www' && www[0].type === 'CNAME');
}

// --- apexPointsAtNetlify: the "DNS verified" signal --------------------------------------------
{
  check('A-records containing the Netlify IP → verified', apexPointsAtNetlify(['75.2.60.5']));
  check('the wrong IP → not verified', !apexPointsAtNetlify(['1.2.3.4']));
  check('empty / non-array → not verified', !apexPointsAtNetlify([]) && !apexPointsAtNetlify(undefined as unknown as string[]));
}

console.log(`\ndomainCore.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} domainCore check(s) failed`);
