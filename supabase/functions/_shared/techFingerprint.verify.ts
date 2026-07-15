// supabase/functions/_shared/techFingerprint.verify.ts
// run: npx tsx supabase/functions/_shared/techFingerprint.verify.ts
// Proves the fingerprint only claims what the markup shows, and stays honest on empty input.

import { fingerprintTech } from './techFingerprint.ts';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) { pass++; } else { fail++; console.error(`✗ ${name}`); } };

// A DIY Wix site with a Calendly widget and a Meta pixel, no analytics beyond that.
const wix = fingerprintTech(`
  <html><head><link href="https://static.wixstatic.com/x.css">
  <script src="https://assets.calendly.com/assets/external/widget.js"></script>
  <script>!function(f){fbq('init','123')}(window)</script></head><body>Book online</body></html>`);
ok('wix: builder detected', wix.builder === 'wix');
ok('wix: flagged DIY builder', wix.diyBuilder === true);
ok('wix: calendly booking detected', wix.booking === 'calendly');
ok('wix: meta pixel detected', wix.analytics.includes('meta_pixel'));

// A WordPress site — a real CMS, NOT flagged as a DIY self-serve builder.
const wp = fingerprintTech(`<html><head><link rel="stylesheet" href="/wp-content/themes/x/style.css"></head><body>Hi</body></html>`);
ok('wordpress: builder detected', wp.builder === 'wordpress');
ok('wordpress: NOT flagged DIY', wp.diyBuilder === false);

// A Shopify store: ecommerce + builder both surface from the CDN signature.
const shop = fingerprintTech(`<html><head><script src="https://cdn.shopify.com/s/files/x.js"></script></head></html>`);
ok('shopify: ecommerce detected', shop.ecommerce === 'shopify');

// A plain hand-built page with a Google Analytics tag and Intercom chat, nothing else.
const plain = fingerprintTech(`
  <html><head><script async src="https://www.googletagmanager.com/gtag/js?id=G-XX"></script>
  <script src="https://widget.intercom.io/widget/abc"></script></head><body>Call us for a quote</body></html>`);
ok('plain: ga detected', plain.analytics.includes('ga'));
ok('plain: intercom chat detected', plain.chat === 'intercom');
ok('plain: no builder claimed (none present)', plain.builder === null);
ok('plain: no booking claimed (none present)', plain.booking === null);

// HONESTY: empty input claims nothing.
const empty = fingerprintTech('');
ok('empty: builder null', empty.builder === null);
ok('empty: booking null', empty.booking === null);
ok('empty: analytics empty', empty.analytics.length === 0);
ok('empty: not DIY', empty.diyBuilder === false);

// Determinism.
ok('deterministic', JSON.stringify(fingerprintTech(plain ? 'x' : 'x')) === JSON.stringify(fingerprintTech('x')));

console.log(`${fail === 0 ? '✓' : '✗'} techFingerprint.verify: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
