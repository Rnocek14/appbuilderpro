// Run: npx tsx src/lib/preview/publishCore.verify.ts
import {
  netlifySiteName, normalizeCustomDomain, publishStatusAfter, isPublishableSpec, publishedHtmlPath,
  extractRehostableImages, rewriteImageUrls, imageExtFor, rehostedImagePath,
} from './publishCore';

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

// --- image re-hosting: what to pull off the prospect's site onto our storage --------------------
{
  const SELF = 'abc.supabase.co';
  const html = `
    <img src="https://joesroofing-old.com/roof.jpg" alt="">
    <img src="https://joesroofing-old.com/crew.png" srcset="https://joesroofing-old.com/crew@2x.png 2x">
    <div style="background-image:url('https://joesroofing-old.com/hero.webp')"></div>
    <img src="https://abc.supabase.co/storage/v1/object/public/ai.png" alt="ours">
    <link href="https://fonts.googleapis.com/css2?family=Inter">
    <img src="data:image/png;base64,AAAA">
    <img src="/local/relative.jpg">`;
  const c = extractRehostableImages(html, SELF);
  const urls = c.map((x) => x.url);
  check('pulls the scraped external images (src, srcset, css url)', urls.includes('https://joesroofing-old.com/roof.jpg') && urls.includes('https://joesroofing-old.com/crew.png') && urls.includes('https://joesroofing-old.com/crew@2x.png') && urls.includes('https://joesroofing-old.com/hero.webp'));
  check('never re-hosts our OWN storage (AI images/screenshot already durable)', !urls.some((u) => u.includes('abc.supabase.co')));
  check('leaves the font CDN alone', !urls.some((u) => u.includes('fonts.googleapis.com')));
  check('ignores data: URIs and relative paths', !urls.some((u) => u.startsWith('data:') || u.startsWith('/local')));
  check('dedupes + honors the cap', extractRehostableImages(html, SELF, 2).length === 2);

  // srcset/entity decoding: the fetch URL has entities decoded, the raw keeps the HTML form.
  const ent = extractRehostableImages(`<img src="https://x.com/a.jpg?w=1&amp;h=2">`, SELF);
  check('raw keeps HTML form, url is entity-decoded for fetching', ent[0].raw.includes('&amp;') && ent[0].url === 'https://x.com/a.jpg?w=1&h=2');

  // rewrite swaps each original for its re-hosted copy; unmapped/empty is left as-is.
  const rewritten = rewriteImageUrls(html, {
    'https://joesroofing-old.com/roof.jpg': 'https://abc.supabase.co/storage/v1/object/public/project-assets/o/published/p/img/deadbeef.jpg',
    'https://joesroofing-old.com/crew.png': '',
  });
  check('rewrite replaces a mapped URL', rewritten.includes('/img/deadbeef.jpg') && !rewritten.includes('joesroofing-old.com/roof.jpg'));
  check('rewrite leaves an unmapped/failed image on its original URL (fail-soft)', rewritten.includes('joesroofing-old.com/crew.png'));

  // Longest-key-first: a short URL that is a PREFIX of a longer one must not corrupt the longer one.
  const collide = rewriteImageUrls(
    `<img src="https://old.com/hero.jpg"><div style="background:url(https://old.com/hero.jpg?w=1200)"></div>`,
    { 'https://old.com/hero.jpg': 'https://cdn/self/base.jpg', 'https://old.com/hero.jpg?w=1200': 'https://cdn/self/wide.jpg' },
  );
  check('a prefix URL does not corrupt the longer variant', collide.includes('https://cdn/self/wide.jpg') && collide.includes('https://cdn/self/base.jpg') && !collide.includes('base.jpg?w=1200'));

  check('imageExtFor prefers content-type, falls back to the URL', imageExtFor('image/jpeg', 'x') === 'jpg' && imageExtFor(null, 'https://x.com/a.PNG?v=2') === 'png' && imageExtFor('image/svg+xml', 'x') === 'svg' && imageExtFor(null, 'https://x.com/no-ext') === 'img');
  check('rehostedImagePath is owner+preview scoped', rehostedImagePath('o1', 'p1', 'ab12', 'jpg') === 'o1/published/p1/img/ab12.jpg');
}

console.log(`\npublishCore.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} publishCore check(s) failed`);
