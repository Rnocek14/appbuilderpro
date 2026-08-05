// src/lib/preview/exportStatic.verify.ts — the DELIVERABLE's pure half
// (npm run verify:exportstatic). This file had no verify suite at all, which is exactly how a
// bespoke published site shipped with no booking button and no way to receive a lead: the template
// path was wired, the bespoke path returned the model's document verbatim, and nothing asserted the
// two were equivalent. Bespoke is the DEFAULT path, so that gap was the common case.

import { injectBespokeRuntime, isBespokeDocument, BESPOKE_RUNTIME_MARKER } from './exportStatic.ts';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

const DOC = `<!doctype html>
<html lang="en"><head><title>Jones Electric</title></head>
<body>
  <h1>Jones Electric</h1>
  <form>
    <input type="text" name="full_name" placeholder="Your name">
    <input type="email" name="email" placeholder="Email">
    <textarea name="details"></textarea>
    <button type="submit">Request a quote</button>
  </form>
</body></html>`;

const WIRED = { previewSiteId: 'ps_123', leadSubmitUrl: 'https://x.supabase.co/functions/v1/claim-submit', bookingUrl: 'https://site.com/book/jones' };

// ── the defect itself ──────────────────────────────────────────────────────
check('THE DEFECT: a bespoke document is recognised as bespoke',
  isBespokeDocument({ html: DOC }) && !isBespokeDocument({ html: '<div>fragment</div>' })
  && !isBespokeDocument({ html: undefined }));
check('a wired bespoke document CARRIES THE BOOKING BUTTON — the scheduler the fee pays for',
  injectBespokeRuntime(DOC, WIRED).includes('https://site.com/book/jones'));
check('a wired bespoke document CAN RECEIVE A LEAD — the form posts to claim-submit',
  (() => {
    const out = injectBespokeRuntime(DOC, WIRED);
    return out.includes('claim-submit') && out.includes('"ps_123"') && out.includes('addEventListener(\'submit\'');
  })());
check('the runtime goes INSIDE the document, before </body>',
  (() => {
    const out = injectBespokeRuntime(DOC, WIRED);
    return out.indexOf('claim-submit') < out.lastIndexOf('</body>') && out.trimEnd().endsWith('</html>');
  })());

// ── it must never wire twice ───────────────────────────────────────────────
check('IDEMPOTENT — re-exporting or re-publishing never stacks two booking buttons',
  (() => {
    const once = injectBespokeRuntime(DOC, WIRED);
    const twice = injectBespokeRuntime(once, WIRED);
    return once === twice && (once.match(/pv-book-cta/g) ?? []).length === 1;
  })());
check('the marker is what makes it idempotent, and it is present',
  injectBespokeRuntime(DOC, WIRED).includes(BESPOKE_RUNTIME_MARKER));

// ── never produce a dead control ───────────────────────────────────────────
check('NO booking url ⇒ NO booking button — a disabled scheduler must never render a 404 button',
  !injectBespokeRuntime(DOC, { previewSiteId: 'p', leadSubmitUrl: 'https://x/y' }).includes('pv-book-cta'));
check('no lead config ⇒ no submit handler, rather than one posting nowhere',
  !injectBespokeRuntime(DOC, { bookingUrl: 'https://site.com/book/x' }).includes('claim-submit'));
check('a previewSiteId with no submit url wires NOTHING — half a config is not a lead path',
  injectBespokeRuntime(DOC, { previewSiteId: 'ps_1' }) === DOC);
check('nothing configured ⇒ the document is returned byte-identical',
  injectBespokeRuntime(DOC, {}) === DOC && injectBespokeRuntime(DOC) === DOC);

// ── the markup is model-written, so nothing about it can be assumed ────────
check('FIELDS ARE MAPPED BY NAME AND TYPE, NEVER BY POSITION',
  (() => {
    const js = injectBespokeRuntime(DOC, WIRED);
    // A positional read (f[0], f[1], f[2]) is what the template path used; on arbitrary
    // model-written markup it posts the message as the name.
    return js.includes('input[name*="name" i]') && js.includes('input[type="email"]')
      && js.includes('textarea') && !/f\[0\]|f\[1\]|f\[2\]/.test(js);
  })());
check('EVERY form is bound, not just one — the model may write two',
  injectBespokeRuntime(DOC, WIRED).includes("querySelectorAll('form')"));
check('a document with NO form still gets the booking button',
  (() => {
    const noForm = '<!doctype html><html><body><h1>Hi</h1></body></html>';
    const out = injectBespokeRuntime(noForm, WIRED);
    return out.includes('pv-book-cta');
  })());
check('a document with no </body> still receives the runtime rather than dropping it',
  injectBespokeRuntime('<!doctype html><html><h1>x</h1>', WIRED).includes('pv-book-cta'));
check('an empty document is passed through, not decorated',
  injectBespokeRuntime('', WIRED) === '');
check('the booking url is HTML-escaped — a quote in it cannot break out of the attribute',
  (() => {
    const out = injectBespokeRuntime(DOC, { ...WIRED, bookingUrl: 'https://x.com/b?a="><script>alert(1)</script>' });
    return !out.includes('"><script>alert(1)') && out.includes('&quot;&gt;&lt;script&gt;');
  })());
check('the submit url and site id are JSON-encoded, so a quote cannot break the script',
  injectBespokeRuntime(DOC, { previewSiteId: 'a"b', leadSubmitUrl: 'https://x/y' }).includes('"a\\"b"'));
check('the injected button sits above typical model z-index values',
  injectBespokeRuntime(DOC, WIRED).includes('z-index:2147483000'));

// ── parity with the template path: the two must promise the same thing ─────
check('PARITY: whatever the renderer promised, the bespoke document now also delivers',
  (() => {
    const out = injectBespokeRuntime(DOC, WIRED);
    const hasBooking = out.includes('Book online');
    const hasLeadPath = out.includes('claim-submit') && out.includes('previewSiteId');
    const disablesOnSend = out.includes('disabled = true');
    return hasBooking && hasLeadPath && disablesOnSend;
  })());

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} export-static check(s) failed`);
