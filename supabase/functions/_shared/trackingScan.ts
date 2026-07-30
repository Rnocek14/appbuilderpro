// supabase/functions/_shared/trackingScan.ts
// What third-party code this page loads onto a visitor, and whether ANY consent mechanism sits in
// front of it. This is the lens with the sharpest consequence attached, and the one an owner almost
// never knows the answer to: a pixel is invisible on the rendered page, it was usually installed
// once by a marketing contractor, and it keeps running for years after everybody forgot it existed.
// Reading the list back to an owner is persuasive precisely because it isn't an opinion — it's their
// own markup.
//
// WHAT THIS DELIBERATELY DOES NOT DO:
//  - It does not decide whether the site complies with anything. Not GDPR, not CCPA, not the
//    wiretapping theories currently aimed at session-replay vendors. We don't know what jurisdiction
//    the visitor is in, what the business discloses elsewhere, or what the vendor collects
//    server-side. Every string this module emits is an OBSERVATION, never a verdict. Rule of the
//    house: we say "no consent mechanism was detected alongside 3 tracking scripts", never "you are
//    breaking the law".
//  - It does not claim a script fired BEFORE the visitor consented. That is a TIMING question, and
//    timing is unknowable from static bytes — it needs a real browser and a network waterfall. A CMP
//    that blocks tags correctly and one that fires everything on load look identical from here. Said
//    out loud in `limits`.
//  - It does not follow the tag manager. GTM/Tealium fetch their payload at runtime; whatever they
//    inject is invisible to a static read. The tool list is therefore a FLOOR, never a ceiling. Also
//    said out loud in `limits`.
//  - It does not judge the tools. Analytics is not a sin. The finding is about the missing consent
//    control next to them, and about the owner not knowing what's on their own page.
//
// HONESTY: every name in the inventory traces to a signature really present in the bytes handed to
// us. No signature, no name, no finding. An empty inventory means "we did not see one", NOT "there
// isn't one" — which is exactly why absence never becomes a claim.
//
// Where names overlap with techFingerprint.ts (`ga`, `gtm`, `meta_pixel`) they are spelled the same
// on purpose, so a caller can join the two views without a translation table.
//
// Runs in Deno (fetch-url) and under tsx (trackingScan.verify.ts) — the contract is the only import.

import {
  type Finding,
  type ScanResult,
  attr,
  elements,
  snippet,
  stripNonContent,
} from './scanTypes.ts';

/** The raw detected inventory, exported so the caller can store it next to the findings. */
export interface TrackingInventory {
  /** Ad/analytics pixels, in table order so the list is stable across runs. */
  trackers: string[];
  /** Session-recording tools, kept separate: these record the visitor, not just count them. */
  sessionReplay: string[];
  /** First consent-management platform matched, or null when none was seen. */
  consentPlatform: string | null;
}

// ─── Signature tables ────────────────────────────────────────────────────────────────────────────
// Every regex is anchored on something a vendor actually ships: a CDN host, a script filename, or
// the global function their snippet defines. NEVER on a brand word alone — a plumber linking to
// their Facebook page, or an "as seen on TikTok" badge, must not read as a pixel. That is the
// single most likely false positive in this whole module and the tables are shaped to refuse it.
// No /g flags anywhere: these constants are reused across calls and a sticky lastIndex would make
// the scanner non-deterministic.

const TRACKERS: [string, RegExp][] = [
  // `facebook[-_]pixel` matches the slug the WordPress/Shopify integrations enqueue
  // (id="facebook-pixel-js"). It deliberately does NOT match the English words "Facebook Pixel",
  // which appear in plenty of honest privacy-policy prose.
  ['meta_pixel', /connect\.facebook\.net|fbevents\.js|\bfbq\s*\(|facebook[-_]pixel/i],
  ['ga', /googletagmanager\.com\/gtag|google-analytics\.com\/(analytics|ga|collect|gtm)|\bgtag\s*\(|\b_gaq\b/i],
  // The tag manager is listed as a tool in its own right because it IS a third-party script the page
  // loads — and because its presence is the reason `limits` warns the list is a floor.
  ['gtm', /googletagmanager\.com\/gtm\.js|['"]GTM-[A-Z0-9]{4,}['"]/],
  ['google_ads', /googleadservices\.com|googleads\.g\.doubleclick\.net|\/pagead\/conversion|google_conversion_id|['"]AW-\d{6,}/i],
  ['tiktok', /analytics\.tiktok\.com|\bttq\.(load|track|page|instance)\s*\(/i],
  ['linkedin', /snap\.licdn\.com|\b_linkedin_partner_id\b/i],
  ['twitter_x', /static\.ads-twitter\.com|analytics\.twitter\.com|\btwq\s*\(/i],
  ['pinterest', /\bpintrk\s*\(|s\.pinimg\.com\/ct\//i],
  ['snap', /sc-static\.net\/scevent|\bsnaptr\s*\(/i],
  ['reddit', /redditstatic\.com\/ads|\brdt\s*\(\s*['"]init/i],
  ['bing', /bat\.bing\.com|\buetq\b/i],
];

// Session replay is split out because it is a different kind of thing. A pixel counts a visit; these
// record the visit — pointer path, clicks, scrolling, and whatever was typed into a form unless the
// vendor's masking was configured. That difference is what the finding explains, in those words.
const SESSION_REPLAY: [string, RegExp][] = [
  ['hotjar', /static\.hotjar\.com|\bhjid\s*:|\bwindow\.hj\b/i],
  ['clarity', /clarity\.ms|\bclarity\s*\(\s*['"]/i],
  ['fullstory', /fullstory\.com\/s\/fs\.js|edge\.fullstory\.com|\bFS\.identify\b/i],
  ['logrocket', /cdn\.lr-ingest\.|logrocket\.(com|io)|\bLogRocket\.init\b/i],
  ['mouseflow', /mouseflow\.com|\b_mfq\b/i],
  ['smartlook', /smartlook\.com|\bsmartlook\s*\(/i],
  ['luckyorange', /luckyorange\.(com|net)/i],
  ['inspectlet', /inspectlet\.com|\b__insp\b/i],
];

// Consent platforms. Matching here is deliberately GENEROUS — every extra match SUPPRESSES a
// finding, so a loose pattern here can only ever make us quieter, never wronger. Brand words are
// therefore allowed in this table where they'd be banned in the tracker table above. First match
// wins; the generic library and the hand-rolled banner sit last so a named platform is preferred.
const CONSENT: [string, RegExp][] = [
  ['onetrust', /cdn\.cookielaw\.org|otSDKStub|\bOneTrust\b|\boptanon\b/i],
  ['cookiebot', /consent\.cookiebot\.com|\bcookiebot\b|\bCybotCookiebotDialog\b/i],
  ['osano', /osano\.com|\bosano\b/i],
  ['termly', /termly\.io|\btermly\b/i],
  ['cookieyes', /cookieyes\.com|\bcky-consent\b|\bcookieyes\b/i],
  ['complianz', /\bcomplianz\b|\bcmplz-/i],
  ['iubenda', /iubenda\.com|\biubenda\b/i],
  ['usercentrics', /usercentrics\.(eu|com)|\busercentrics\b/i],
  ['quantcast', /quantcast\.mgr|choice\.quantcast\.com|quantcast\.com\/choice/i],
  ['didomi', /didomi\.io|\bdidomi\b/i],
  ['klaro', /klaro(\.js|-config|\.min)|\bklaro\b/i],
  ['cookie_script', /cookie-script\.com|\bcookiescript\b/i],
  ['borlabs', /borlabs[-_]?cookie/i],
  ['civic', /cookiecontrol|civiccomputing/i],
  // The IAB TCF API is defined by every certified CMP — a strong generic signal that SOME consent
  // framework is present even when the vendor's own name never appears in the HTML.
  ['iab_tcf', /\b__tcfapi\b|\b__cmp\b/i],
  ['cookieconsent', /cookieconsent|cookie-consent|cookie_consent/i],
];

/**
 * A hand-rolled banner: no library, just a div and a button. It is still a consent mechanism, and
 * calling it absent would be a false statement about the page. Both halves are required — a cookie
 * *phrase* on its own is just prose (a privacy policy says "we use cookies" too), so we insist on
 * something that looks like a control or a banner container next to it.
 */
const BANNER_CONTAINER = /(?:id|class)\s*=\s*["'][^"']*cookie[-_ ]?(banner|consent|notice|bar|popup|law|policy[-_]?bar)/i;
const BANNER_CONTROL = /(accept|allow|agree)[\s\-_]*(?:to\s*)?(?:all[\s\-_]*)?cookies?\b/i;

/** Human-readable names, used only in owner-facing `title`/`detail` text. */
const LABELS: Record<string, string> = {
  meta_pixel: 'Meta (Facebook) pixel',
  ga: 'Google Analytics',
  gtm: 'Google Tag Manager',
  google_ads: 'Google Ads conversion tracking',
  tiktok: 'TikTok pixel',
  linkedin: 'LinkedIn Insight tag',
  twitter_x: 'X (Twitter) ads pixel',
  pinterest: 'Pinterest tag',
  snap: 'Snapchat pixel',
  reddit: 'Reddit pixel',
  bing: 'Microsoft/Bing UET tag',
  hotjar: 'Hotjar',
  clarity: 'Microsoft Clarity',
  fullstory: 'FullStory',
  logrocket: 'LogRocket',
  mouseflow: 'Mouseflow',
  smartlook: 'Smartlook',
  luckyorange: 'Lucky Orange',
  inspectlet: 'Inspectlet',
};

/** Owner-facing name for a detected id, falling back to the id itself so nothing renders blank. */
function label(name: string): string {
  return LABELS[name] ?? name;
}

/** `a, b and c` — a readable list for detail copy. Order comes from the tables, so it's stable. */
function listOf(names: string[]): string {
  const l = names.map(label);
  if (l.length <= 1) return l[0] ?? '';
  return `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}`;
}

/**
 * The markup a browser would actually execute.
 *
 * We can NOT run stripNonContent() here the way the content scanners do: tracker snippets live
 * inside <script>, so stripping script bodies would delete the only evidence there is. What we do
 * strip is HTML comments — a commented-out pixel does not load, and reporting one would be exactly
 * the false positive that gets a real business told a false thing about itself.
 *
 * <noscript> is kept on purpose: the Meta pixel's standard install puts an <img src="facebook.com/tr">
 * fallback in there, and for a visitor without JS that image request really does fire.
 */
function loadedMarkup(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, ' ');
}

/** Names matched from a table, in table order, plus a snippet of the first hit as proof. */
function detect(markup: string, table: [string, RegExp][]): { names: string[]; evidence?: string } {
  const names: string[] = [];
  let evidence: string | undefined;
  for (const [name, re] of table) {
    const m = re.exec(markup);
    if (!m) continue;
    names.push(name);
    if (evidence === undefined) {
      const start = Math.max(0, m.index - 40);
      evidence = snippet(markup.slice(start, m.index + m[0].length + 60));
    }
  }
  return { names, evidence };
}

/** First consent signature matched, or null. Generic banner check runs last, as the weakest signal. */
function detectConsent(markup: string): string | null {
  for (const [name, re] of CONSENT) if (re.test(markup)) return name;
  if (BANNER_CONTAINER.test(markup) || BANNER_CONTROL.test(markup)) return 'generic_cookie_banner';
  return null;
}

/**
 * Is a privacy policy linked from this page?
 *
 * Answered generously, and on purpose. The finding this feeds ("no privacy policy link found")
 * is only wrong in one direction that matters — telling an owner they have no policy when the link
 * is sitting in their footer. So we accept the signal from three places:
 *   1. a real <a> in the page CONTENT whose href or link text reads like a privacy policy,
 *   2. any privacy-ish href anywhere in the raw markup, because DIY builders routinely ship their
 *      footer nav as a JS config blob that a static read sees only as script text,
 *   3. the same for a menu label sitting in that blob.
 * A page that genuinely has no policy anywhere matches none of the three.
 */
const PRIVACY_HREF = /(?:href|url|link)\s*[=:]\s*["'][^"']*privacy/i;
// A path segment or a slug — `/privacy`, `privacy-policy`, `privacy_notice`. Deliberately NOT the
// bare word: "we respect your privacy" is a sentence, not a policy, and treating it as one would
// silence the finding on half the pages that most need it.
const PRIVACY_PATH = /\/privacy(?:[-_/?#."']|$)|\bprivacy[-_](policy|notice|statement)\b/i;
const PRIVACY_TEXT = /privacy\s*(policy|notice|statement|&(amp;)?\s*(cookie|terms))/i;

function hasPrivacyLink(html: string): boolean {
  // 1. Real anchors, read from stripped content so a URL inside a <script> string can't stand in
  //    for a link a visitor could actually click.
  const content = stripNonContent(html);
  for (const a of elements(content, 'a')) {
    const href = attr(a.attrs, 'href') ?? '';
    if (/privacy/i.test(href)) return true;
    const text = a.inner.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (PRIVACY_TEXT.test(text)) return true;
  }
  // 2 + 3. The false-positive guard: anything privacy-shaped anywhere in the page, including the
  //    script-borne nav config. Suppressing a finding on a weaker signal is the safe direction.
  const markup = loadedMarkup(html);
  return PRIVACY_HREF.test(markup) || PRIVACY_PATH.test(markup) || PRIVACY_TEXT.test(markup);
}

/** What this page loads, as data. Same input always yields the same inventory. */
export function trackingInventory(html: string): TrackingInventory {
  const markup = loadedMarkup(html || '');
  return {
    trackers: detect(markup, TRACKERS).names,
    sessionReplay: detect(markup, SESSION_REPLAY).names,
    consentPlatform: detectConsent(markup),
  };
}

// The limits ship with every result, including an empty one. They are not findings — they are the
// standing statement of what a static read of one page cannot see, so nobody downstream mistakes a
// quiet result for a clean bill of health.
const LIMITS: string[] = [
  'Consent TIMING cannot be determined from static HTML: whether any of these scripts runs before a visitor accepts, or only after, requires loading the page in a real browser and watching the network. A consent tool that blocks tags correctly and one that fires everything on load look identical here.',
  'Tag managers (Google Tag Manager, Tealium and similar) fetch and inject their tags at runtime, so any tracker delivered that way is invisible to this scan. The list of tools found is a floor, not a ceiling.',
  'Consent tools are matched against a list of known platforms plus a generic cookie-banner signature; a custom-built banner that matches none of those, or one injected by JavaScript after load, would not be seen.',
  'This is an observation of what this page\'s own HTML loads and links to, not a legal assessment. No claim is made about any law, regulation, jurisdiction, or the obligations of this business.',
];

/**
 * Scan one page's HTML for third-party tracking and the presence of a consent mechanism.
 * Pure and deterministic. Empty or garbage input claims nothing: zero findings, limits unchanged.
 */
export function scanTracking(html: string): ScanResult {
  const src = html || '';
  const markup = loadedMarkup(src);

  const tracked = detect(markup, TRACKERS);
  const replay = detect(markup, SESSION_REPLAY);
  const consent = detectConsent(markup);

  const findings: Finding[] = [];
  const total = tracked.names.length + replay.names.length;
  const allTools = [...tracked.names, ...replay.names];

  // No consent mechanism next to tools that are running. Confidence is 'likely', never 'detected':
  // the tools are unambiguous but the ABSENCE of a consent tool is an absence, and a rendered page
  // can inject a banner we never saw. We stop at the observation; the reader draws their own line.
  if (total > 0 && consent === null) {
    findings.push({
      code: 'track.no_consent_mechanism',
      category: 'tracking',
      severity: 'high',
      confidence: 'likely',
      title: `No consent mechanism detected alongside ${total} tracking tool${total === 1 ? '' : 's'}`,
      detail: `The page loads ${listOf(allTools)}. No cookie-consent or preference tool from the common platforms, and no cookie banner, was found in the HTML. This is what the markup shows, not a legal assessment.`,
      count: total,
      evidence: tracked.evidence ?? replay.evidence,
    });
  }

  // Session replay, reported whether or not a consent tool exists — the owner usually does not know
  // this is running at all. The detail says plainly what the tool does; it does not say what that
  // means for them.
  if (replay.names.length > 0) {
    findings.push({
      code: 'track.session_replay',
      category: 'tracking',
      severity: 'high',
      confidence: 'detected',
      title: `Session-recording tool detected: ${listOf(replay.names)}`,
      detail: `${listOf(replay.names)} ${replay.names.length === 1 ? 'is' : 'are'} loaded on this page. Tools of this kind record what a visitor does — pointer movement, clicks, scrolling, and often text typed into form fields unless those fields are explicitly masked — and the recording is stored by the vendor for playback.`,
      count: replay.names.length,
      evidence: replay.evidence,
    });
  }

  // Volume. Four distinct vendors on one small-business page is almost always sediment: nobody chose
  // that stack, it accumulated. Counted on distinct trackers only, exactly as the count says.
  if (tracked.names.length >= 4) {
    findings.push({
      code: 'track.many_trackers',
      category: 'tracking',
      severity: 'med',
      confidence: 'detected',
      // "ad and analytics" on purpose: this count excludes the session-replay tools, which get
      // their own finding. A title saying "tools" would contradict the number next to it.
      title: `${tracked.names.length} separate ad and analytics trackers loading on one page`,
      detail: `Distinct third-party tracking scripts detected: ${listOf(tracked.names)}. Each is a separate vendor the page hands visitor data to, and a separate script the browser has to fetch before the page settles.`,
      count: tracked.names.length,
      evidence: tracked.evidence,
    });
  }

  // Tracking present, no policy linked. Session-replay tools count as tracking here even though the
  // spec's shorthand says "trackers" — a page recording its visitors with no policy in sight is the
  // exact case this finding exists for, and excluding it on a technicality would be dishonest.
  if (total > 0 && !hasPrivacyLink(src)) {
    findings.push({
      code: 'track.no_privacy_policy',
      category: 'tracking',
      severity: 'med',
      confidence: 'likely',
      title: 'No privacy policy link found on the page',
      detail: `Tracking scripts were detected (${listOf(allTools)}) but no link on this page has an address or wording that reads like a privacy policy. A policy linked only from another page, or added by JavaScript after load, would not be visible to this scan.`,
      evidence: tracked.evidence ?? replay.evidence,
    });
  }

  return { findings, limits: [...LIMITS] };
}
