// supabase/functions/_shared/techFingerprint.ts
// Read the tech a business runs from the RAW HTML of their own page — the single best qualifier for
// both a rebuild and an automation pitch. Pure + deterministic (no imports, no I/O): the fetch-url
// edge function computes this from the bytes it already has, before the HTML is stripped for text.
//
// HONESTY: every field traces to a real signature really present in the markup. A signature we don't
// find is null / [] (unknown), never a guess. We only claim what the page's own code shows.
//
// Runs in Deno (fetch-url) and under tsx (techFingerprint.verify.ts) — keep it dependency-free.

export interface TechFingerprint {
  builder: string | null;     // site platform, e.g. 'wix' | 'squarespace' | 'godaddy' | 'wordpress'
  diyBuilder: boolean;        // true when builder is a self-serve site builder (owner built it themselves)
  booking: string | null;     // scheduling/booking widget, e.g. 'calendly' | 'jobber' | 'opentable'
  analytics: string[];        // measurement/ad pixels, e.g. ['ga', 'meta_pixel']
  chat: string | null;        // live-chat widget, e.g. 'intercom' | 'podium'
  ecommerce: string | null;   // storefront, e.g. 'shopify' | 'woocommerce'
}

// First match wins. Order the specific before the generic.
const BUILDERS: [string, RegExp, boolean][] = [
  // [name, signature, isDiySelfServeBuilder]
  ['wix', /static\.wixstatic\.com|wix\.com\/|_wixCss|X-Wix-/i, true],
  ['squarespace', /squarespace\.com|static1\.squarespace|Squarespace\.Constants/i, true],
  ['godaddy', /\bwsimg\.com|websitebuilder\.godaddy|godaddy\.com\/websites/i, true],
  ['weebly', /weebly\.com|editmysite\.com/i, true],
  ['webflow', /assets\.website-files\.com|webflow\.(com|io)/i, false],
  ['shopify', /cdn\.shopify\.com|\.myshopify\.com/i, false],
  ['wordpress', /wp-content\/|wp-includes\/|\/wp-json/i, false],
];

const BOOKING: [string, RegExp][] = [
  ['calendly', /calendly\.com/i],
  ['acuity', /acuityscheduling\.com|squarespace-scheduling/i],
  ['jobber', /getjobber\.com|clienthub\.getjobber/i],
  ['housecall', /housecallpro\.com/i],
  ['square', /squareup\.com\/appointments|square\.site\/book/i],
  ['setmore', /setmore\.com/i],
  ['mindbody', /mindbodyonline\.com/i],
  ['opentable', /opentable\.com\/(reserve|widget|restref)/i],
  ['resy', /resy\.com/i],
  ['booksy', /booksy\.com/i],
];

const ANALYTICS: [string, RegExp][] = [
  ['ga', /googletagmanager\.com\/gtag|google-analytics\.com\/(analytics|ga)|gtag\(/i],
  ['gtm', /googletagmanager\.com\/gtm\.js|['"]GTM-[A-Z0-9]+['"]/],
  ['meta_pixel', /connect\.facebook\.net\/.*fbevents|fbq\(\s*['"]init/i],
];

const CHAT: [string, RegExp][] = [
  ['intercom', /widget\.intercom\.io|intercomcdn\.com/i],
  ['drift', /js\.driftt\.com|drift\.com\/anchor/i],
  ['tawk', /embed\.tawk\.to/i],
  ['podium', /widget\.podium\.com|podium\.com\/widget/i],
  ['tidio', /code\.tidio\.co/i],
  ['crisp', /client\.crisp\.chat/i],
];

const ECOMMERCE: [string, RegExp][] = [
  ['shopify', /cdn\.shopify\.com|\.myshopify\.com/i],
  ['woocommerce', /woocommerce|wc-ajax/i],
  ['bigcommerce', /bigcommerce\.com/i],
  ['squarespace_commerce', /squarespace\.com\/commerce/i],
];

function firstMatch(html: string, table: [string, RegExp][]): string | null {
  for (const [name, re] of table) if (re.test(html)) return name;
  return null;
}

/** Fingerprint the tech stack from a page's raw HTML. Empty/short input → all-null (honest unknown). */
export function fingerprintTech(html: string): TechFingerprint {
  const h = html || '';
  let builder: string | null = null;
  let diy = false;
  for (const [name, re, isDiy] of BUILDERS) {
    if (re.test(h)) { builder = name; diy = isDiy; break; }
  }
  const analytics: string[] = [];
  for (const [name, re] of ANALYTICS) if (re.test(h)) analytics.push(name);

  return {
    builder,
    diyBuilder: diy,
    booking: firstMatch(h, BOOKING),
    analytics,
    chat: firstMatch(h, CHAT),
    ecommerce: firstMatch(h, ECOMMERCE),
  };
}
