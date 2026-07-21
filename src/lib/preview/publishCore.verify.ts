// Run: npx tsx src/lib/preview/publishCore.verify.ts
import { netlifySiteName, normalizeCustomDomain, publishStatusAfter, isPublishableSpec, publishedHtmlPath } from './publishCore';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('publishCore.verify');

// --- netlifySiteName: a valid, readable, collision-resistant name ------------------------------
{
  check('a clean slug passes through', netlifySiteName('summit-roofing-co-ab12cd') === 'summit-roofing-co-ab12cd');
  check('uppercase + junk are sanitized', netlifySiteName('Summit Roofing! Co.') === 'summit-roofing-co');
  check('collapses repeats and trims edge hyphens', netlifySiteName('--a__b  c--') === 'a-b-c');
  check('caps at 63 chars', netlifySiteName('x'.repeat(200)).length === 63);
  check('a long name never ends in a hyphen', !netlifySiteName(`${'a'.repeat(62)}-tail`).endsWith('-'));
  check('empty / junk → safe fallback, never ""', netlifySiteName('') === 'site' && netlifySiteName('!!!') === 'site' && netlifySiteName(null) === 'site');
  check('result is always Netlify-legal', /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(netlifySiteName('  --Weird__Name!! ')));
}

// --- normalizeCustomDomain: strict, never guesses ----------------------------------------------
{
  check('a bare domain passes', normalizeCustomDomain('summitroofing.com') === 'summitroofing.com');
  check('uppercase + trailing dot are normalized', normalizeCustomDomain('SummitRoofing.COM.') === 'summitroofing.com');
  check('scheme/path/port stripped to the host', normalizeCustomDomain('https://www.summitroofing.com:443/home') === 'www.summitroofing.com');
  check('subdomains are kept', normalizeCustomDomain('go.summitroofing.co.uk') === 'go.summitroofing.co.uk');
  check('no TLD → rejected', normalizeCustomDomain('localhost') === null && normalizeCustomDomain('summitroofing') === null);
  check('spaces / junk → rejected', normalizeCustomDomain('not a domain') === null && normalizeCustomDomain('a b.com c') === null);
  check('empty / null → null', normalizeCustomDomain('') === null && normalizeCustomDomain(null) === null && normalizeCustomDomain('   ') === null);
  check('an underscore (illegal in host) is rejected', normalizeCustomDomain('bad_host.com') === null);
}

// --- publishStatusAfter: a sold site never downgrades ------------------------------------------
{
  check('a fresh preview becomes published', publishStatusAfter('preview') === 'published');
  check('an emailed demo becomes published', publishStatusAfter('emailed') === 'published');
  check('a PURCHASED site stays purchased (never downgraded by a republish)', publishStatusAfter('purchased') === 'purchased');
  check('re-publishing a published site stays published', publishStatusAfter('published') === 'published');
  check('null/unknown → published', publishStatusAfter(null) === 'published' && publishStatusAfter(undefined) === 'published');
}

// --- isPublishableSpec: never ship a blank host ------------------------------------------------
{
  check('a spec with sections is publishable', isPublishableSpec({ sections: [{ type: 'hero' }] }));
  check('no sections / empty / null → not publishable', !isPublishableSpec({ sections: [] }) && !isPublishableSpec({}) && !isPublishableSpec(null));
}

// --- publishedHtmlPath: owner-scoped, stable ---------------------------------------------------
{
  check('path is owner + preview scoped', publishedHtmlPath('owner-1', 'prev-9') === 'owner-1/published/prev-9.html');
}

console.log(`\npublishCore.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} publishCore check(s) failed`);
