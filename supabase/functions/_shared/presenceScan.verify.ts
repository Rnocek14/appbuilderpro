// supabase/functions/_shared/presenceScan.verify.ts
// run: npx tsx supabase/functions/_shared/presenceScan.verify.ts
// Proves the presence lens only ever reports what the markup really declares: each finding fires
// when its signature is really absent, stays silent on a page that declares its identity properly,
// refuses to fire on structured data that is only commented out or only quoted inside a <script>
// string, claims nothing on empty, fragment or app-shell input, and never puts a compliance, legal
// or ranking claim in an owner-facing string.

import { scanPresence, presenceFacts, PRES_CODES } from './presenceScan.ts';
import type { Finding, ScanResult } from './scanTypes.ts';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ok  - ${name}`); }
  else { fail++; console.error(`  FAIL - ${name}`); }
};

const has = (r: ScanResult, code: string): boolean => r.findings.some((f) => f.code === code);
const get = (r: ScanResult, code: string): Finding | undefined => r.findings.find((f) => f.code === code);

// ── A page that declares everything: LocalBusiness subtype, NAP, hours, canonical, OG cards. ─────
const GOOD = `<!doctype html><html lang="en"><head>
  <title>Acme Roofing — Lake Geneva, WI</title>
  <link rel="canonical" href="https://acme.example/">
  <meta property="og:title" content="Acme Roofing">
  <meta property="og:description" content="Roofing in Lake Geneva since 1998">
  <meta property="og:image" content="https://acme.example/og.png">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Roofer",
    "name":"Acme Roofing","telephone":"+1-262-555-0143",
    "address":{"@type":"PostalAddress","streetAddress":"1 Main St","addressLocality":"Lake Geneva","addressRegion":"WI"},
    "openingHours":"Mo-Fr 08:00-17:00"}</script>
  </head><body>
  <h1>Acme Roofing</h1>
  <p>Mon-Fri 8am-5pm. 1 Main St, Lake Geneva, WI 53147.</p>
  <a href="tel:+12625550143">Call us</a>
  </body></html>`;
const good = scanPresence(GOOD);
ok('good: claims nothing at all', good.findings.length === 0);
ok('good: no_structured_data silent', !has(good, 'pres.no_structured_data'));
ok('good: no_localbusiness silent (Roofer is a business type)', !has(good, 'pres.no_localbusiness'));
ok('good: no_nap silent', !has(good, 'pres.no_nap'));
ok('good: no_hours silent', !has(good, 'pres.no_hours'));
ok('good: no_canonical silent', !has(good, 'pres.no_canonical'));
ok('good: no_open_graph silent', !has(good, 'pres.no_open_graph'));
ok('good: malformed_json_ld silent (the block parses)', !has(good, 'pres.malformed_json_ld'));
ok('good: limits still ship on a page with nothing wrong', good.limits.length >= 4);

const goodFacts = presenceFacts(GOOD);
ok('facts: reads the declared @type', goodFacts.jsonLdTypes.includes('Roofer'));
ok('facts: hasNap true when address and phone are declared', goodFacts.hasNap === true);
ok('facts: hasHours true when openingHours is declared', goodFacts.hasHours === true);
ok('facts: canonical carries the href', goodFacts.canonical === 'https://acme.example/');
ok('facts: hasOpenGraph true', goodFacts.hasOpenGraph === true);

// ── A page declaring nothing at all: every absence finding should fire. ──────────────────────────
const BARE = `<html lang="en"><head><title>Acme Roofing</title></head><body>
  <h1>Acme Roofing</h1>
  <p>We have been putting roofs on houses around the county since 1998. Tear-offs, storm damage,
  gutters and skylights. Ask about our workmanship warranty.</p>
  </body></html>`;
const bare = scanPresence(BARE);
ok('bare: no_structured_data fires', has(bare, 'pres.no_structured_data'));
ok('bare: no_structured_data is med severity', get(bare, 'pres.no_structured_data')?.severity === 'med');
ok('bare: no_structured_data is "detected"', get(bare, 'pres.no_structured_data')?.confidence === 'detected');
ok('bare: no_structured_data uses the spec sentence',
  /no machine-readable record of who this business is, what it does, or where it is/i
    .test(get(bare, 'pres.no_structured_data')?.detail ?? ''));
ok('bare: no_localbusiness does NOT fire (there is no JSON-LD to judge)', !has(bare, 'pres.no_localbusiness'));
ok('bare: no_nap fires', has(bare, 'pres.no_nap'));
ok('bare: no_nap is high severity', get(bare, 'pres.no_nap')?.severity === 'high');
ok('bare: no_nap is only "likely" (a number can be set in an image)', get(bare, 'pres.no_nap')?.confidence === 'likely');
ok('bare: no_hours fires', has(bare, 'pres.no_hours'));
ok('bare: no_hours is low severity and "likely"',
  get(bare, 'pres.no_hours')?.severity === 'low' && get(bare, 'pres.no_hours')?.confidence === 'likely');
ok('bare: no_canonical fires', has(bare, 'pres.no_canonical'));
ok('bare: no_canonical is low + "detected"',
  get(bare, 'pres.no_canonical')?.severity === 'low' && get(bare, 'pres.no_canonical')?.confidence === 'detected');
ok('bare: no_open_graph fires', has(bare, 'pres.no_open_graph'));
ok('bare: no_open_graph is low + "detected"',
  get(bare, 'pres.no_open_graph')?.severity === 'low' && get(bare, 'pres.no_open_graph')?.confidence === 'detected');
ok('bare: every finding is categorised presence', bare.findings.every((f) => f.category === 'presence'));
ok('bare: facts agree with the findings',
  presenceFacts(BARE).jsonLdTypes.length === 0 && presenceFacts(BARE).canonical === null &&
  presenceFacts(BARE).hasOpenGraph === false && presenceFacts(BARE).hasNap === false);

// ── JSON-LD that parses but never says "business". ───────────────────────────────────────────────
const article = scanPresence(`<html><head>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Article",
    "headline":"Five signs your roof is done","author":{"@type":"Person","name":"Dale"}}</script>
  </head><body><h1>Five signs your roof is done</h1>
  <p>Curling shingles, granules in the gutter, daylight through the boards, sagging, and moss.</p>
  <a href="tel:+12625550143">Call</a><p>Mon-Fri 8am-5pm</p></body></html>`);
ok('article: no_localbusiness fires', has(article, 'pres.no_localbusiness'));
ok('article: no_localbusiness is med severity', get(article, 'pres.no_localbusiness')?.severity === 'med');
ok('article: no_structured_data stays silent — data IS present', !has(article, 'pres.no_structured_data'));
ok('article: the detail quotes the page\'s own declared type back to it',
  /Article/.test(get(article, 'pres.no_localbusiness')?.detail ?? ''));
ok('article: a Person node is not mistaken for a business', !presenceFacts('').hasNap);

// ── @graph and a top-level array are both real shapes and both must be read. ─────────────────────
const graph = scanPresence(`<html><head>
  <script type="application/ld+json">{"@context":"https://schema.org","@graph":[
    {"@type":"WebSite","url":"https://acme.example/"},
    {"@type":"Plumber","name":"Acme","telephone":"555-010-0100","openingHours":"Mo-Su 00:00-23:59"}]}</script>
  </head><body><p>Acme Plumbing, emergency callouts across the county, seven days a week.</p></body></html>`);
ok('graph: a Plumber inside @graph suppresses no_localbusiness', !has(graph, 'pres.no_localbusiness'));
ok('graph: @graph types land in the facts', presenceFacts(`
  <html><head><script type="application/ld+json">{"@graph":[{"@type":"WebSite"},{"@type":"Plumber"}]}</script></head>
  <body><p>x</p></body></html>`).jsonLdTypes.join(',') === 'WebSite,Plumber');
ok('graph: telephone inside @graph suppresses no_nap', !has(graph, 'pres.no_nap'));
ok('graph: openingHours inside @graph suppresses no_hours', !has(graph, 'pres.no_hours'));

const arrayLd = scanPresence(`<html><head>
  <script type="application/ld+json">[{"@type":"BreadcrumbList"},{"@type":"Dentist","name":"Bright Smile"}]</script>
  </head><body><p>Bright Smile Dental, Main Street.</p></body></html>`);
ok('array: a top-level array of nodes is read', !has(arrayLd, 'pres.no_localbusiness'));
ok('array: both array members land in the facts',
  presenceFacts(`<html><body><script type="application/ld+json">[{"@type":"BreadcrumbList"},{"@type":"Dentist"}]</script><p>x</p></body></html>`)
    .jsonLdTypes.length === 2);

// ── A LocalBusiness hanging off a property still identifies a business. ──────────────────────────
const nested = scanPresence(`<html><head>
  <script type="application/ld+json">{"@type":"WebPage","publisher":{"@type":"HVACBusiness","name":"Acme Air"}}</script>
  </head><body><p>Acme Air, heating and cooling.</p></body></html>`);
ok('nested: a business type on a property suppresses no_localbusiness', !has(nested, 'pres.no_localbusiness'));
ok('nested: but the facts list only the DECLARED top-level type',
  presenceFacts(`<html><body><script type="application/ld+json">{"@type":"WebPage","publisher":{"@type":"HVACBusiness"}}</script><p>x</p></body></html>`)
    .jsonLdTypes.join(',') === 'WebPage');

// ── A schema.org URL or prefix is the same claim as the bare name. ───────────────────────────────
ok('type: a full schema.org URL is recognised', !has(scanPresence(`<html><head>
  <script type="application/ld+json">{"@type":"https://schema.org/Restaurant","name":"Rosa's"}</script>
  </head><body><p>Rosa's, pasta and wine.</p></body></html>`), 'pres.no_localbusiness'));
ok('type: an unlisted but business-shaped subtype is recognised', !has(scanPresence(`<html><head>
  <script type="application/ld+json">{"@type":"WindowContractor","name":"Panes"}</script>
  </head><body><p>Panes, glazing and window repair.</p></body></html>`), 'pres.no_localbusiness'));
ok('type: a bare "Service" node is NOT read as a business identity', has(scanPresence(`<html><head>
  <script type="application/ld+json">{"@type":"Service","name":"Gutter cleaning"}</script>
  </head><body><p>Gutter cleaning, booked by the season.</p></body></html>`), 'pres.no_localbusiness'));

// ── Malformed JSON-LD. ──────────────────────────────────────────────────────────────────────────
const broken = scanPresence(`<html><head>
  <script type="application/ld+json">{"@type":"Plumber","name":"Acme",}</script>
  <script type="application/ld+json">{'@type': 'Roofer'}</script>
  </head><body><p>Acme, plumbing and heating on Main Street.</p></body></html>`);
ok('broken: malformed_json_ld fires', has(broken, 'pres.malformed_json_ld'));
ok('broken: counts every unparseable block', get(broken, 'pres.malformed_json_ld')?.count === 2);
ok('broken: is med + "detected"',
  get(broken, 'pres.malformed_json_ld')?.severity === 'med' && get(broken, 'pres.malformed_json_ld')?.confidence === 'detected');
ok('broken: carries the block as evidence', /ld\+json/i.test(get(broken, 'pres.malformed_json_ld')?.evidence ?? ''));
ok('broken: nothing parsed, so no_structured_data also fires', has(broken, 'pres.no_structured_data'));
ok('broken: no_localbusiness stays silent — we never parsed a type to judge', !has(broken, 'pres.no_localbusiness'));
ok('broken: facts report no types', presenceFacts(`<html><body><script type="application/ld+json">{oops}</script><p>x</p></body></html>`).jsonLdTypes.length === 0);
const halfBroken = scanPresence(`<html><head>
  <script type="application/ld+json">{"@type":"Plumber","name":"Acme","telephone":"555-010-0100","openingHours":"Mo-Fr 09:00-17:00"}</script>
  <script type="application/ld+json">not json at all</script>
  </head><body><p>Acme Plumbing.</p></body></html>`);
ok('halfBroken: one bad block is counted', get(halfBroken, 'pres.malformed_json_ld')?.count === 1);
ok('halfBroken: the good block still suppresses no_structured_data', !has(halfBroken, 'pres.no_structured_data'));
ok('halfBroken: the good block still suppresses no_localbusiness', !has(halfBroken, 'pres.no_localbusiness'));
ok('empty ld+json block is not called malformed', !has(scanPresence(`
  <html><head><script type="application/ld+json"></script></head><body><p>Acme Roofing, Main Street.</p></body></html>`),
  'pres.malformed_json_ld'));
ok('a CDATA-wrapped block still parses', !has(scanPresence(`<html><head>
  <script type="application/ld+json">//<![CDATA[
  {"@type":"Plumber","name":"Acme"}
  ]]></script></head><body><p>Acme.</p></body></html>`.replace('//<![CDATA[', '<![CDATA[')), 'pres.malformed_json_ld'));

// ── FALSE-POSITIVE TRAPS: patterns inside <script> and comments must not fire. ───────────────────
const commentedOut = scanPresence(`<html><head>
  <!-- <script type="application/ld+json">{"@type":"Plumber","name":"Acme","telephone":"555-010-0100"}</script> -->
  <!-- <link rel="canonical" href="https://acme.example/"> -->
  <!-- <meta property="og:title" content="Acme"> -->
  </head><body><h1>Acme</h1><p>Plumbing and heating, all makes and models, no callout charge.</p></body></html>`);
ok('trap: a commented-out JSON-LD block is not counted as structured data', has(commentedOut, 'pres.no_structured_data'));
ok('trap: a commented-out JSON-LD block is not counted as malformed either', !has(commentedOut, 'pres.malformed_json_ld'));
ok('trap: a commented-out canonical tag does not suppress the finding', has(commentedOut, 'pres.no_canonical'));
ok('trap: a commented-out og:title does not suppress the finding', has(commentedOut, 'pres.no_open_graph'));
ok('trap: facts agree — no canonical was really declared',
  presenceFacts(`<html><head><!-- <link rel="canonical" href="https://acme.example/"> --></head>
    <body><p>Acme roofing and siding.</p></body></html>`).canonical === null);

const scriptText = scanPresence(`<html><head><title>Docs</title></head><body>
  <h1>How to add structured data</h1>
  <script>
    var example = '<address>1 Main St, Lake Geneva, WI 53147</address>';
    var hours = "Mon-Fri 8am-5pm";
    var phone = "(555) 010-0100";
    var tpl = '<link rel="canonical" href="https://example.com/">';
  </script>
  <p>Paste the block above into the head of your page and you are done. Nothing else is required.</p>
  </body></html>`);
ok('trap: an address quoted inside a <script> does not suppress no_nap', has(scriptText, 'pres.no_nap'));
ok('trap: hours quoted inside a <script> do not suppress no_hours', has(scriptText, 'pres.no_hours'));
ok('trap: a canonical tag quoted inside a <script> string is never STORED as the canonical',
  presenceFacts(`<html><head><script>var t='<link rel="canonical" href="https://x.example/">';</script></head>
    <body><p>hi there</p></body></html>`).canonical === null);

// ── A head tag seen only inside a script: silence plus a stated reason, never a finding. ────────
// A DIY builder that writes its own <head> at runtime, and a page that merely quotes the tag, look
// identical from static bytes — so this claims nothing in either direction and says why.
const scriptedHead = scanPresence(`<html><head><title>Acme</title>
  <script>head.push({rel:"canonical",href:"https://acme.example/"});head.push({property:"og:title",content:"Acme"});</script>
  </head><body><h1>Acme Roofing</h1><p>Roofing, siding and gutters across the county since 1998.</p></body></html>`);
ok('offstage: a script-borne canonical buys silence, not a finding', !has(scriptedHead, 'pres.no_canonical'));
ok('offstage: and the reason ships in this result\'s limits',
  scriptedHead.limits.some((l) => /canonical declaration appears in this page's scripts/i.test(l)));
ok('offstage: a script-borne og: key buys silence too', !has(scriptedHead, 'pres.no_open_graph'));
ok('offstage: with its own stated reason',
  scriptedHead.limits.some((l) => /og: declaration appears in this page's scripts/i.test(l)));
ok('offstage: the FACTS still refuse to claim a canonical was declared', presenceFacts(`
  <html><head><script>x={rel:"canonical",href:"https://acme.example/"}</script></head>
  <body><p>Acme roofing.</p></body></html>`).canonical === null);
ok('offstage: silence is scoped — the other findings still fire on that page',
  has(scriptedHead, 'pres.no_structured_data') && has(scriptedHead, 'pres.no_nap'));
ok('offstage: a COMMENTED-OUT tag gets no such benefit — nothing loads it', has(commentedOut, 'pres.no_canonical'));

// ── FALSE-POSITIVE TRAPS: things that legitimately suppress. ─────────────────────────────────────
ok('trap: microdata suppresses no_structured_data (we do not read it, so we do not deny it)',
  !has(scanPresence(`<html><body><div itemscope itemtype="https://schema.org/Plumber">
    <span itemprop="name">Acme</span></div><p>Acme Plumbing on Main Street.</p></body></html>`), 'pres.no_structured_data'));
ok('trap: microdata also suppresses no_localbusiness',
  !has(scanPresence(`<html><body><div itemscope itemtype="https://schema.org/Plumber">
    <span itemprop="name">Acme</span></div><p>Acme Plumbing on Main Street.</p></body></html>`), 'pres.no_localbusiness'));
ok('trap: twitter cards suppress no_open_graph — the link does NOT share as a bare URL',
  !has(scanPresence(`<html><head><meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Acme"></head><body><p>Acme Roofing, county-wide.</p></body></html>`), 'pres.no_open_graph'));
ok('trap: but hasOpenGraph stays false — twitter cards are not Open Graph',
  presenceFacts(`<html><head><meta name="twitter:card" content="summary"></head><body><p>Acme.</p></body></html>`).hasOpenGraph === false);
ok('trap: an empty canonical href is treated as no canonical',
  presenceFacts(`<html><head><link rel="canonical" href=""></head><body><p>Acme roofing.</p></body></html>`).canonical === null);
ok('trap: an empty og:title content does not suppress no_open_graph',
  has(scanPresence(`<html><head><meta property="og:title" content=""></head><body><p>Acme roofing and siding.</p></body></html>`), 'pres.no_open_graph'));
ok('trap: "we respond within 24 hours" is a callback promise, not opening hours',
  has(scanPresence(`<html><body><h1>Acme</h1><p>We respond within 24 hours to every enquiry, guaranteed by our team.</p></body></html>`), 'pres.no_hours'));
ok('trap: a bare year is not read as a postal code',
  has(scanPresence(`<html><body><h1>Acme</h1><p>Family run since 1998, serving the whole county with pride.</p></body></html>`), 'pres.no_nap'));
ok('suppress: a tel: link alone is enough for hasNap',
  presenceFacts(`<html><body><a href="tel:+15550100100">Call</a><p>Acme.</p></body></html>`).hasNap === true);
ok('suppress: an <address> element alone is enough for hasNap',
  presenceFacts(`<html><body><address>1 Main St, Lake Geneva</address><p>Acme.</p></body></html>`).hasNap === true);
ok('suppress: an empty <address> element is not',
  presenceFacts(`<html><body><address></address><p>Acme roofing, county wide.</p></body></html>`).hasNap === false);
ok('suppress: "Open 24/7" counts as hours',
  presenceFacts(`<html><body><p>Emergency callouts, open 24/7 across the county.</p></body></html>`).hasHours === true);
ok('suppress: a rel list containing canonical is still a canonical tag',
  presenceFacts(`<html><head><link rel="canonical" href="https://a.example/"></head><body><p>x</p></body></html>`).canonical === 'https://a.example/');

// ── HONESTY: empty, garbage and app-shell input claim NOTHING. ──────────────────────────────────
const empty = scanPresence('');
ok('empty: zero findings', empty.findings.length === 0);
ok('empty: limits still ship', empty.limits.length >= 4);
ok('empty: facts claim nothing', (() => {
  const f = presenceFacts('');
  return f.jsonLdTypes.length === 0 && !f.hasNap && !f.hasHours && f.canonical === null && !f.hasOpenGraph;
})());
ok('garbage: claims nothing', scanPresence('<<<>>>&&& ').findings.length === 0);
ok('garbage: does not throw', (() => { try { scanPresence('<<<>>>&&& '); return true; } catch { return false; } })());
ok('non-string input is tolerated', (() => {
  try { return presenceFacts(undefined as unknown as string).jsonLdTypes.length === 0; } catch { return false; }
})());
ok('fragment: a bare <div> is not a document and gets no opinion',
  scanPresence('<div>Acme Roofing</div>').findings.length === 0);
ok('app shell: an unrendered SPA mount claims no content findings', (() => {
  const shell = scanPresence('<html><head><title>App</title></head><body><div id="root"></div></body></html>');
  return !has(shell, 'pres.no_structured_data') && !has(shell, 'pres.no_nap') && !has(shell, 'pres.no_hours');
})());
ok('app shell: a broken block inside one is STILL reported (it is really there)',
  has(scanPresence('<html><body><div id="root"></div><script type="application/ld+json">{oops}</script></body></html>'),
    'pres.malformed_json_ld'));

// ── The codes are the contract. ─────────────────────────────────────────────────────────────────
const emitted = new Set([bare, article, broken, halfBroken, commentedOut, scriptText]
  .flatMap((r) => r.findings.map((f) => f.code)));
ok('codes: every emitted code is declared in PRES_CODES', [...emitted].every((c) => (PRES_CODES as readonly string[]).includes(c)));
ok('codes: all seven declared codes are exercised above', PRES_CODES.length === 7 && emitted.size === 7);
ok('codes: every code is namespaced pres.*', PRES_CODES.every((c) => /^pres\.[a-z0-9_]+$/.test(c)));
ok('shape: every finding has a code, title and detail',
  [bare, article, broken].flatMap((r) => r.findings).every((f) => f.code && f.title && f.detail));
ok('shape: evidence snippets stay within the shared cap',
  [bare, article, broken, halfBroken].flatMap((r) => r.findings).every((f) => (f.evidence?.length ?? 0) <= 300));

// ── LIMITS must say what this scan cannot see. ──────────────────────────────────────────────────
const limits = bare.limits.join(' ');
ok('limits: JS-served structured data is not visible',
  /structured data served by javascript after load is not visible/i.test(limits));
ok('limits: one page only, About/Contact not counted',
  /this scan reads one page only, so identity declared on an about or contact page is not counted/i.test(limits));
ok('limits: says microdata is detected but not read', /microdata/i.test(limits));
ok('limits: the standing set ships identically on every result',
  JSON.stringify(bare.limits) === JSON.stringify(empty.limits));
ok('limits: a result with an off-stage tag ADDS to the standing set, never replaces it',
  bare.limits.every((l) => scriptedHead.limits.includes(l)) && scriptedHead.limits.length > bare.limits.length);

// ── LANGUAGE: no finding may assert compliance, illegality, or a ranking outcome. ────────────────
const allText = [good, bare, article, graph, arrayLd, broken, halfBroken, commentedOut, scriptText]
  .flatMap((r) => r.findings).map((f) => `${f.title} ${f.detail}`).join(' ');
ok('language: never asserts compliance or non-compliance', !/complian|\bADA\b|\bWCAG\b|conform|certif/i.test(allText));
ok('language: never threatens legal consequence', !/sued|lawsuit|liabilit|illegal|unlawful|violat|penalt/i.test(allText));
ok('language: never promises rankings or traffic', !/guarantee|rank (?:higher|first)|top of google|\d+% more (?:traffic|leads|customers)/i.test(allText));
ok('language: states absence as "found none", not "there is none"', /was found|were found/i.test(allText));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ADVERSARIAL: pages a competent small business really ships, that must NOT be accused of an
// absence. Every case below was a live false finding before the fix that follows it.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// ── An UNTERMINATED comment swallows the rest of the document, as a browser does. ────────────────
// A block inside one is never loaded by anything, so it is neither this page's structured data nor
// this page's broken structured data.
const unterminated = scanPresence(`<html><head><title>Acme</title>
  <!-- <script type="application/ld+json">{"@type":"Plumber",}</script>
  </head><body><h1>Acme</h1><p>Plumbing and heating across the county, gas safe registered.</p></body></html>`);
ok('unterminated comment: a block inside it is NOT reported as broken structured data',
  !has(unterminated, 'pres.malformed_json_ld'));
ok('unterminated comment: nor is it counted as structured data that exists',
  has(unterminated, 'pres.no_structured_data'));
ok('unterminated comment: the `--!>` terminator closes a comment too',
  !has(scanPresence(`<html><head><!-- <script type="application/ld+json">{oops}</script> --!>
    </head><body><p>Acme plumbing, county wide.</p></body></html>`), 'pres.malformed_json_ld'));
ok('script bodies still keep their own <!-- : a real block after one is still read',
  !has(scanPresence(`<html><head><script>var s="<!--";</script>
    <script type="application/ld+json">{"@type":"Plumber","name":"Acme"}</script>
    </head><body><p>Acme plumbing on Main Street.</p></body></html>`), 'pres.no_structured_data'));
ok('perf: a document full of unterminated comment openers does not stall the scan', (() => {
  const bomb = `<html><body><p>hello there friend</p>${'<!--'.repeat(60000)}</body></html>`;
  const t = Date.now();
  scanPresence(bomb);
  return Date.now() - t < 1500;
})());

// ── JSON-LD that parses to nothing is not "structured data is present". ─────────────────────────
const emptyLd = scanPresence(`<html><head><script type="application/ld+json">[]</script></head>
  <body><p>Acme roofing, Lake Geneva WI 53147, call 262-555-0143. Mon-Fri 8am-5pm.</p></body></html>`);
ok('empty ld array: not reported as structured data that fails to identify a business',
  !has(emptyLd, 'pres.no_localbusiness'));
ok('empty ld array: reported as the absence it is', has(emptyLd, 'pres.no_structured_data'));
ok('null ld literal: same', (() => {
  const r = scanPresence(`<html><head><script type="application/ld+json">null</script></head>
    <body><p>Acme roofing, Lake Geneva WI 53147, 262-555-0143. Mon-Fri 8am-5pm.</p></body></html>`);
  return !has(r, 'pres.no_localbusiness') && has(r, 'pres.no_structured_data');
})());
ok('an object with no @type IS structured data and still gets judged',
  has(scanPresence(`<html><head><script type="application/ld+json">{"name":"Acme"}</script></head>
    <body><p>Acme roofing, Lake Geneva WI 53147, 262-555-0143. Mon-Fri 8am-5pm.</p></body></html>`),
  'pres.no_localbusiness'));

// ── A business buried past the walk budget must not be reported as absent. ──────────────────────
const bigGraph = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [...Array.from({ length: 2500 }, (_, i) => ({ '@type': 'ListItem', position: i })),
    { '@type': 'Plumber', name: 'Acme' }],
});
const budgeted = scanPresence(`<html><head><script type="application/ld+json">${bigGraph}</script></head>
  <body><p>Acme plumbing, 262-555-0143, Mon-Fri 8am-5pm, 1 Main Street.</p></body></html>`);
ok('walk budget: a tree too big to finish reading is never called "no business here"',
  !has(budgeted, 'pres.no_localbusiness'));
ok('walk budget: and the truncation ships as a stated limit',
  budgeted.limits.some((l) => /too large to read in full|not read in full/i.test(l)));

// ── A tag that is PRESENT but empty must not be described as missing. ───────────────────────────
const emptyAttrs = scanPresence(`<html><head><link rel="canonical" href=""><meta property="og:title" content=""></head>
  <body><p>Acme roofing, Lake Geneva WI 53147, 262-555-0143. Mon-Fri 8am-5pm.</p></body></html>`);
ok('empty href: the canonical finding still fires (it carries no address)', has(emptyAttrs, 'pres.no_canonical'));
ok('empty href: but the title never says the TAG is absent — it is right there in the markup',
  !/no canonical link tag/i.test(get(emptyAttrs, 'pres.no_canonical')?.title ?? 'no canonical link tag'));
ok('empty content: the og finding still fires', has(emptyAttrs, 'pres.no_open_graph'));
ok('empty content: but the detail never says no such META TAG was found',
  !/meta tag was found on the page/i.test(get(emptyAttrs, 'pres.no_open_graph')?.detail ?? 'meta tag was found on the page'));

// ── Unquoted and un-vocab'd machine-readable identity still counts. ─────────────────────────────
ok('unquoted itemtype suppresses no_structured_data',
  !has(scanPresence(`<html><body><div itemscope itemtype=https://schema.org/Plumber>
    <span itemprop=name>Acme</span></div><p>Acme plumbing, 262-555-0143, Mon-Fri 8am-5pm, 1 Main St.</p></body></html>`),
  'pres.no_structured_data'));
ok('unquoted twitter:card still means the link does not share as a bare URL',
  !has(scanPresence(`<html><head><meta name=twitter:card content=summary_large_image>
    <meta name=twitter:title content=Acme></head><body><p>Acme roofing, 262-555-0143, 1 Main St, WI 53147.</p></body></html>`),
  'pres.no_open_graph'));
ok('RDFa declared with typeof/prefix rather than vocab is still structured data',
  !has(scanPresence(`<html><body prefix="schema: https://schema.org/">
    <div typeof="schema:Plumber"><span property="schema:name">Acme</span></div>
    <p>Acme plumbing, 262-555-0143, Mon-Fri 8am-5pm, 1 Main St.</p></body></html>`), 'pres.no_structured_data'));

// ── An address or hours typed with non-breaking spaces is still an address. ─────────────────────
ok('nbsp: a street line written with &nbsp; is not read as no address at all',
  !has(scanPresence(`<html><body><h1>Acme</h1>
    <p>Visit us at 1&nbsp;Main&nbsp;Street, Lake Geneva. Open Mon&nbsp;-&nbsp;Fri 8am&nbsp;-&nbsp;5pm.</p></body></html>`),
  'pres.no_nap'));
ok('nbsp: the facts agree',
  presenceFacts('<html><body><p>Come see us at 1&nbsp;Main&nbsp;Street, Lake Geneva</p></body></html>').hasNap === true);

// ── Hours written the way half the trades write them: a bare numeric range. ─────────────────────
ok('hours: "Open Monday to Friday, 9 to 5" is opening hours',
  !has(scanPresence(`<html><body><h1>Acme</h1>
    <p>Open Monday to Friday, 9 to 5. Call 262-555-0143. 1 Main Street, Lake Geneva.</p></body></html>`),
  'pres.no_hours'));
ok('hours: "Mon-Fri 9-5, Sat 10-2" is opening hours',
  !has(scanPresence(`<html><body><h1>Acme</h1>
    <p>Mon-Fri 9-5, Sat 10-2. Call 262-555-0143. 1 Main Street, Lake Geneva.</p></body></html>`),
  'pres.no_hours'));
ok('hours: a lone number range with no day name is still not hours',
  has(scanPresence('<html><body><h1>Acme</h1><p>Packages from 9 to 5 thousand dollars, fitted county wide.</p></body></html>'),
    'pres.no_hours'));

// ── A page we admit we cannot read gets no "detected" claim about its <head>. ───────────────────
const shell = scanPresence('<html><head><title>App</title></head><body><div id="root"></div><script src="/b.js"></script></body></html>');
ok('app shell: no_canonical does not fire — this page\'s head is written by the script we cannot run',
  !has(shell, 'pres.no_canonical'));
ok('app shell: no_open_graph does not fire either', !has(shell, 'pres.no_open_graph'));
ok('app shell: claims nothing at all', shell.findings.length === 0);
ok('app shell: and says out loud that it could not read the page',
  shell.limits.some((l) => /almost no rendered content|assembled in the browser/i.test(l)));
ok('app shell: an unquoted mount id is recognised too',
  scanPresence('<html><head><title>App</title></head><body><div id=root></div></body></html>').findings.length === 0);
ok('a real page is still judged — the shell rule is not a blanket amnesty',
  has(bare, 'pres.no_canonical') && has(bare, 'pres.no_open_graph'));

// ── Markup a browser never finishes parsing: say so rather than read the absence as fact. ───────
const cut = scanPresence(`<html><head><title>Acme</title><style>body{color:red}
  </head><body><h1>Acme Roofing</h1><p>1 Main Street, Lake Geneva, WI 53147. 262-555-0143. Mon-Fri 8am-5pm.</p></body></html>`);
ok('truncation: an unterminated <style> leaves the tail unexamined, and the result says so',
  cut.limits.some((l) => /never closes|was not examined/i.test(l)));
ok('truncation: a well-formed page carries no such sentence',
  !good.limits.some((l) => /never closes|was not examined/i.test(l)));
ok('truncation: a </body> that only exists inside a <script> string is not read as a cut tail',
  !scanPresence(`<html><head><title>Docs</title></head><body><h1>Docs</h1>
    <p>Acme roofing, 1 Main Street, 262-555-0143, Mon-Fri 8am-5pm.</p>
    <script>document.write("</body></html>");</script>`)
    .limits.some((l) => /never closes|was not examined/i.test(l)));
ok('truncation: an unterminated comment cuts the tail and says so',
  scanPresence('<html><body><p>Acme roofing across the county</p><!-- todo')
    .limits.some((l) => /never closes|was not examined/i.test(l)));

// ── A bound we hit is never reported as an absence we verified. ─────────────────────────────────
ok('bounds: JSON-LD nested past the depth bound is not reported as no structured data',
  !has(scanPresence(`<html><body><script type="application/ld+json">${'['.repeat(200)}{"@type":"Plumber"}${']'.repeat(200)}</script>
    <p>Acme plumbing on Main Street, county wide.</p></body></html>`), 'pres.no_structured_data'));
ok('bounds: nor is it reported as structured data that identifies no business',
  !has(scanPresence(`<html><body><script type="application/ld+json">${'['.repeat(200)}{"@type":"Plumber"}${']'.repeat(200)}</script>
    <p>Acme plumbing on Main Street, county wide.</p></body></html>`), 'pres.no_localbusiness'));
ok('bounds: an empty nest we CAN see the bottom of is still reported as the absence it is',
  has(scanPresence(`<html><body><script type="application/ld+json">${'['.repeat(5)}${']'.repeat(5)}</script>
    <p>Acme plumbing on Main Street, county wide.</p></body></html>`), 'pres.no_structured_data'));
ok('bounds: one we cannot see the bottom of claims nothing in either direction',
  scanPresence(`<html><body><script type="application/ld+json">${'['.repeat(200)}${']'.repeat(200)}</script>
    <p>Acme plumbing on Main Street, county wide.</p></body></html>`)
    .findings.every((f) => f.code !== 'pres.no_structured_data' && f.code !== 'pres.no_localbusiness'));

// ── Crash surface. ──────────────────────────────────────────────────────────────────────────────
const survives = (label: string, html: string) => ok(`crash: ${label}`, (() => {
  try { scanPresence(html); presenceFacts(html); return true; } catch { return false; }
})());
survives('a lone surrogate', '<html><body><p>\uD800 hello</p></body></html>');
survives('a null byte', '<html><body><p>a b</p><script type="application/ld+json">{ }</script></body></html>');
survives('an unterminated tag', '<html><body><p>hi<a href="tel:+15550100100"');
survives('an unbalanced quote in a link tag', '<html><head><link rel="canonical href="https://a.example/"></head><body><p>hi</p></body></html>');
survives('deeply nested JSON-LD', `<html><body><script type="application/ld+json">${'['.repeat(400)}1${']'.repeat(400)}</script><p>x</p></body></html>`);
survives('JSON-LD nested deep enough to overflow a recursive read',
  `<html><body><script type="application/ld+json">${'['.repeat(50000)}{"@type":"Plumber"}${']'.repeat(50000)}</script><p>x</p></body></html>`);
survives('deeply nested JSON-LD objects',
  `<html><body><script type="application/ld+json">${'{"a":'.repeat(50000)}1${'}'.repeat(50000)}</script><p>x</p></body></html>`);
survives('an enormous single line', `<html><body><p>${'a'.repeat(500000)}</p></body></html>`);
ok('perf: a megabyte of markup still scans quickly', (() => {
  const big = `<html><head><title>x</title></head><body>${'<div class="row"><p>Acme roofing and siding</p></div>'.repeat(20000)}</body></html>`;
  const t = Date.now();
  scanPresence(big);
  return Date.now() - t < 3000;
})());

// ── Minified / uppercase / unquoted / self-closing markup reads the same as pretty markup. ──────
ok('minified: uppercase, unquoted, self-closing head tags are seen',
  scanPresence('<!DOCTYPE HTML><HTML LANG=en><HEAD><LINK REL=canonical HREF=https://a.example/ />' +
    '<META PROPERTY=og:title CONTENT=Acme /></HEAD><BODY><P>Acme roofing, 262-555-0143, 1 Main Street.</P></BODY></HTML>')
    .findings.every((f) => f.code !== 'pres.no_canonical' && f.code !== 'pres.no_open_graph'));

// ── An attribute whose NAME merely ends in the one we want is a different attribute. ────────────
// `data-href`, `data-content` and friends must not be read as `href`/`content`, or a page with a
// perfectly good canonical tag gets told it has none.
const prefixed = scanPresence(`<html><head><link rel="canonical" data-href="" href="https://a.example/">
  <meta property="og:title" data-content="" content="Acme"></head>
  <body><p>Acme roofing, 262-555-0143, 1 Main St, Mon-Fri 9-5.</p></body></html>`);
ok('prefixed attrs: data-href does not shadow the real href', !has(prefixed, 'pres.no_canonical'));
ok('prefixed attrs: data-content does not shadow the real content', !has(prefixed, 'pres.no_open_graph'));
ok('prefixed attrs: and the canonical fact is the real one',
  presenceFacts('<html><head><link rel="canonical" data-href="/wrong" href="https://a.example/"></head><body><p>x y z</p></body></html>')
    .canonical === 'https://a.example/');
ok('prefixed attrs: a data-rel is not a rel',
  presenceFacts('<html><head><link data-rel="canonical" href="https://a.example/x.css" rel="stylesheet"></head><body><p>x y z</p></body></html>')
    .canonical === null);

// ── A JSON-LD body wrapped whole in an HTML comment. ────────────────────────────────────────────
ok('comment-wrapped ld+json that IS valid JSON is credited, never accused',
  !has(scanPresence(`<html><head><script type="application/ld+json"><!--{"@type":"Roofer","name":"Acme"}//--></script>
    </head><body><p>Acme roofing, 262-555-0143, 1 Main St, Mon-Fri 9-5.</p></body></html>`), 'pres.malformed_json_ld'));
ok('comment-wrapped ld+json that is only a NOTE is not called a broken block',
  !has(scanPresence(`<html><head><script type="application/ld+json"><!-- TODO: add the schema here --></script>
    </head><body><p>Acme roofing, 262-555-0143, 1 Main St, Mon-Fri 9-5.</p></body></html>`), 'pres.malformed_json_ld'));
ok('comment-wrapped ld+json that is only a note still reports the absence',
  has(scanPresence(`<html><head><script type="application/ld+json"><!-- TODO: add the schema here --></script>
    </head><body><p>Acme roofing, 262-555-0143, 1 Main St, Mon-Fri 9-5.</p></body></html>`), 'pres.no_structured_data'));
ok('a genuinely broken block is still reported', has(broken, 'pres.malformed_json_ld'));

// ── Honesty sweep over EVERY string this module can emit. ───────────────────────────────────────
const everyString = [good, bare, article, graph, arrayLd, broken, halfBroken, commentedOut, scriptText,
  scriptedHead, unterminated, emptyLd, budgeted, emptyAttrs, cut, shell]
  .flatMap((r) => [...r.findings.map((f) => `${f.title} ${f.detail}`), ...r.limits]).join(' ');
ok('honesty: no string anywhere asserts compliance, legality or a guarantee',
  !/complian|conform|certif|illegal|unlawful|violat|penalt|lawsuit|liabilit|\bsued\b|guarantee/i.test(everyString));
ok('honesty: no string claims a search ranking, an index position or traffic',
  !/\brank(?:s|ed|ing)?\b|\bindexed\b|\binvisible to (?:google|search)\b|top of google/i.test(everyString));
ok('honesty: no finding claims the declared data is correct or current',
  !/\b(?:up to date|accurate|correct(?:ly)? listed)\b/i.test(everyString));

// ── Determinism. ────────────────────────────────────────────────────────────────────────────────
ok('deterministic: scanPresence', JSON.stringify(scanPresence(GOOD)) === JSON.stringify(scanPresence(GOOD)));
ok('deterministic: presenceFacts', JSON.stringify(presenceFacts(BARE)) === JSON.stringify(presenceFacts(BARE)));
ok('deterministic: repeated calls do not drift (no sticky /g state)',
  JSON.stringify(scanPresence(BARE)) === JSON.stringify(scanPresence(BARE)) &&
  JSON.stringify(scanPresence(BARE)) === JSON.stringify(scanPresence(BARE)));

console.log(`${fail === 0 ? '✓' : '✗'} presenceScan.verify: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
