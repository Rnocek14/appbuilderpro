// supabase/functions/_shared/presenceScan.ts
// The presence lens of the deep scan: what a machine can actually learn about this business by
// reading the page. Pure + deterministic — the only import is the shared contract.
//
// Why this exists: the other four lenses are about the person looking at the page. This one is about
// everything that never looks at it — the search index, the maps panel, the voice assistant, the
// model answering "who does emergency roofing near Lake Geneva and are they open right now?". Those
// readers do not squint at a hero image to work out the phone number. They read structured data,
// they read a canonical address, they read og: tags, and where those are missing they either guess
// from prose or skip the business entirely. An owner can see their own name, address and hours on
// their homepage and be genuinely surprised that nothing else can — which is what makes this lens
// persuasive: it is not a design opinion, it is a list of fields that are either declared or not.
//
// WHAT THIS DELIBERATELY DOES NOT DO:
//  - It does not claim a business is invisible to search, unranked, or missing from any index.
//    Rankings are a property of an index we cannot see, built from signals (links, a Business
//    Profile, citations across the web) that have nothing to do with this page's bytes. Every string
//    here is about what the MARKUP declares, never about where the business appears or does not.
//  - It does not verify that declared data is TRUE. A JSON-LD block can name a phone number that was
//    disconnected in 2019 and an address the business moved out of. We report that the field is
//    present and parseable, never that it is correct.
//  - It does not read microdata or RDFa. Only JSON-LD is parsed. But microdata IS detected, purely
//    so it can SUPPRESS the "no structured data" finding — telling an owner they have no
//    machine-readable identity while their itemtype markup sits in the footer would be a false
//    statement about their page, and that is the one outcome this codebase refuses. Said out loud
//    in `limits`.
//  - It does not follow the site. Identity declared on an About or Contact page is invisible from
//    here, so every finding is scoped to THIS page and the copy says "on the page", never "on the
//    site". Also in `limits`.
//  - It does not grade, score, or predict traffic.
//
// THE HONESTY RULE for this file specifically: nearly everything here is an ABSENCE, and absence is
// the easiest thing in the world to be wrong about. So the bias runs one way throughout — every
// signal that would SUPPRESS a finding is matched generously (a phone number in a JSON-LD field
// nested five levels deep, an address in a class name, a day-and-time pairing anywhere in the page
// text, a business @type we have never heard of but that is shaped like one), and every signal that
// would FIRE one is read from markup with scripts and comments already stripped. And where the page
// shows too little to judge at all — a fragment, an empty app shell — we claim NOTHING and let
// `limits` speak.
//
// Runs in Deno (fetch-url) and under tsx (presenceScan.verify.ts) — the .ts extension on the import
// is required by Deno and harmless under tsx.

import {
  type Finding,
  type ScanResult,
  attr,
  elements,
  innerText,
  openTags,
  snippet,
  stripNonContent,
} from './scanTypes.ts';

/** Every code this scanner can emit. Exported so the report layer can enumerate without string-hunting. */
export const PRES_CODES = [
  'pres.no_structured_data',
  'pres.no_localbusiness',
  'pres.no_nap',
  'pres.no_hours',
  'pres.no_canonical',
  'pres.no_open_graph',
  'pres.malformed_json_ld',
] as const;

/**
 * The machine-readable identity this page declares, as data, so the caller can store it next to the
 * findings and group on it later without re-parsing every page.
 *
 * Two of these fields are booleans over an OR, and the naming deserves a note because getting it
 * backwards would corrupt every downstream count:
 *  - `hasNap` is true when an address OR a phone number was discoverable. The finding it feeds fires
 *    only when NEITHER is, which is the case worth reporting: a business with no way at all to be
 *    matched against a directory listing.
 *  - `hasOpenGraph` is true when at least one of og:title / og:description / og:image is present.
 */
export interface PresenceFacts {
  /** `@type` values declared at the top level of each JSON-LD block (and inside `@graph`), first-seen
   *  order, deduped, verbatim as the page wrote them. Empty means none parsed — never "none exist". */
  jsonLdTypes: string[];
  /** An address OR a phone number was found, in the structured data or in the page's own text. */
  hasNap: boolean;
  /** Opening hours were found, in the structured data or as a day-and-time pairing in the text. */
  hasHours: boolean;
  /** The href of `<link rel="canonical">`, or null when there is no such tag with an address in it. */
  canonical: string | null;
  /** At least one of og:title / og:description / og:image is present with non-empty content. */
  hasOpenGraph: boolean;
}

// ─── What counts as a document we can judge ──────────────────────────────────────────────────────
// Absence only means something when there was somewhere for the thing to be absent from. A bare
// fragment (`<div>hi</div>`), an error string, or an empty body is not a page whose <head> we can
// have an opinion about, and saying "this page has no canonical tag" about a snippet of markup would
// be a statement about our own input handling rather than about a business.
const DOCUMENT = /<!doctype\s+html|<html\b|<head\b|<body\b/i;
/** The mount points single-page apps leave behind when the real page is assembled in JavaScript. */
const SPA_MOUNT = /<(?:div|main|section)\b[^>]*\bid\s*=\s*["'](?:root|app|__next|__nuxt|__gatsby|q-app|svelte)["']/i;
/** Below this much visible text, an app shell has not rendered the business at all. */
const SHELL_TEXT_MIN = 200;

// ─── JSON-LD ─────────────────────────────────────────────────────────────────────────────────────

/**
 * The markup a browser would actually load.
 *
 * We can NOT use stripNonContent() to find JSON-LD: the whole point of a `<script type="application/
 * ld+json">` block is that it lives inside a script element, so stripping script bodies would delete
 * the only evidence there is. What we DO strip is HTML comments — a commented-out JSON-LD block is
 * not read by anything, and counting one as this business's structured data would be a false fact.
 */
function loadedMarkup(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, ' ');
}

interface LdBlock { raw: string; body: string }

/** Every `<script type="application/ld+json">` block in the loaded markup, in source order. */
function ldBlocks(markup: string): LdBlock[] {
  return elements(markup, 'script')
    .filter((s) => /\bld\+json\b/i.test(attr(s.attrs, 'type') ?? ''))
    .map((s) => ({ raw: s.raw, body: s.inner }));
}

/**
 * The wrappers a JSON-LD body can legitimately arrive in, removed before parsing.
 *
 * A BOM and an XHTML-era CDATA section are packaging, not malformed JSON, and a parser that choked
 * on them would report a broken block on a page whose structured data is fine. We deliberately do
 * NOT go further than this: no entity decoding, no quote fixing, no trailing-comma repair. Script
 * elements are raw-text elements, so `&quot;` inside one really is the six characters `&quot;` and a
 * search engine's parser fails on it exactly as ours does. Repairing it here would let us report
 * structured data that no other reader can actually use.
 */
function ldBody(body: string): string {
  return body
    .replace(/^\uFEFF/, '')
    .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/i, '$1')
    .trim();
}

interface LdRead {
  /** Successfully parsed roots, one per block that parsed. */
  nodes: unknown[];
  /** Blocks that exist and do not parse — the only PRESENCE-based finding this module has. */
  malformed: LdBlock[];
}

function readLd(markup: string): LdRead {
  const nodes: unknown[] = [];
  const malformed: LdBlock[] = [];
  for (const b of ldBlocks(markup)) {
    const body = ldBody(b.body);
    // An empty block declares nothing, and calling it "malformed" would overstate what we saw: a
    // template that rendered no data is not the same thing as broken JSON, and the owner-facing
    // sentence ("the effort was spent, but nothing can read it") would not be true of it.
    if (!body) continue;
    try {
      nodes.push(JSON.parse(body));
    } catch {
      malformed.push(b);
    }
  }
  return { nodes, malformed };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Bounds. Real JSON-LD is a handful of shallow nodes; these caps exist so a hostile or generated
// document cannot turn a scan into an unbounded walk. They are constants, so the result stays
// deterministic for any given input.
const MAX_TYPES = 40;
const MAX_GRAPH_DEPTH = 4;
const MAX_WALK_DEPTH = 20;
const MAX_WALK_NODES = 2000;

function pushTypes(node: Record<string, unknown>, out: string[]): void {
  const raw = node['@type'];
  for (const v of Array.isArray(raw) ? raw : [raw]) {
    if (typeof v !== 'string') continue;
    const name = v.trim();
    if (!name || out.length >= MAX_TYPES || out.includes(name)) continue;
    out.push(name);
  }
}

/**
 * The `@type` values a page DECLARES, which is a different question from "what types appear
 * anywhere in the tree".
 *
 * Three shapes are real and all three are handled: one object, a top-level array of objects, and the
 * `@graph` array that every WordPress SEO plugin emits. We stop there on purpose. Recursing into
 * arbitrary properties would fill this list with `PostalAddress`, `ImageObject` and `ContactPoint` —
 * the plumbing of other nodes, not entities the page is claiming to be — and a stored fact that
 * reads "this page declares PostalAddress" is worse than useless to whoever reads it later.
 *
 * The LocalBusiness suppression check below is the opposite case and walks the whole tree; see there.
 */
function collectTypes(node: unknown, out: string[], depth: number): void {
  if (depth > MAX_GRAPH_DEPTH) return;
  if (Array.isArray(node)) {
    for (const n of node) collectTypes(n, out, depth);
    return;
  }
  if (!isObj(node)) return;
  pushTypes(node, out);
  if (node['@graph'] !== undefined) collectTypes(node['@graph'], out, depth + 1);
}

/** Visit every object in a parsed JSON-LD tree, within bounds. Used only for suppression checks. */
function walk(node: unknown, visit: (o: Record<string, unknown>) => void, depth: number, budget: { n: number }): void {
  if (depth > MAX_WALK_DEPTH || budget.n <= 0) return;
  if (Array.isArray(node)) {
    for (const n of node) walk(n, visit, depth + 1, budget);
    return;
  }
  if (!isObj(node)) return;
  budget.n--;
  visit(node);
  for (const key of Object.keys(node)) walk(node[key], visit, depth + 1, budget);
}

/** True when a JSON-LD value carries an actual value somewhere inside it, rather than an empty shell. */
function hasContent(v: unknown, depth = 0): boolean {
  if (depth > 4) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return true;
  if (Array.isArray(v)) return v.some((x) => hasContent(x, depth + 1));
  if (isObj(v)) return Object.keys(v).some((k) => k !== '@type' && hasContent(v[k], depth + 1));
  return false;
}

// ─── Business types ──────────────────────────────────────────────────────────────────────────────
// LocalBusiness and the subtypes a small business actually uses, plus Organization and its subtypes.
//
// This list is deliberately GENEROUS, and generosity here is free: every entry can only SUPPRESS
// pres.no_localbusiness, so a loose list makes us quieter, never wronger. The expensive mistake is
// the other direction — telling a dentist their structured data does not identify a business when
// they marked themselves up as a `Dentist` we forgot to list.
//
// Stored lowercase and matched lowercase, because `@type` casing in the wild is not reliable.
const BUSINESS_TYPES = new Set<string>([
  // The roots.
  'localbusiness', 'organization', 'corporation', 'ngo', 'cooperative', 'consortium',
  'onlinebusiness', 'onlinestore', 'professionalservice',
  // Automotive.
  'automotivebusiness', 'autobodyshop', 'autodealer', 'autopartsstore', 'autorental', 'autorepair',
  'autowash', 'gasstation', 'motorcycledealer', 'motorcyclerepair',
  // Home + construction — the trades this product sells to most.
  'homeandconstructionbusiness', 'electrician', 'generalcontractor', 'hvacbusiness', 'housepainter',
  'locksmith', 'movingcompany', 'plumber', 'roofingcontractor',
  // Not in the schema.org vocabulary but common in the wild, and named in this scanner's own spec.
  // Matching them can only make us quieter about a page whose owner plainly meant "this is a business".
  'roofer', 'landscaper', 'contractor',
  // Food + drink.
  'foodestablishment', 'bakery', 'barorpub', 'brewery', 'cafeorcoffeeshop', 'distillery',
  'fastfoodrestaurant', 'icecreamshop', 'restaurant', 'winery',
  // Health, beauty, medical.
  'healthandbeautybusiness', 'beautysalon', 'dayspa', 'hairsalon', 'healthclub', 'nailsalon',
  'tattooparlor', 'medicalbusiness', 'medicalclinic', 'medicalorganization', 'dentist', 'pharmacy',
  'physician', 'optician', 'veterinarycare', 'physiotherapy', 'chiropractic', 'psychological',
  'diagnosticlab', 'dermatology', 'optometric',
  // Money + law.
  'financialservice', 'accountingservice', 'automatedteller', 'bankorcreditunion', 'insuranceagency',
  'legalservice', 'attorney', 'notary',
  // Retail.
  'store', 'bikestore', 'bookstore', 'clothingstore', 'computerstore', 'conveniencestore',
  'departmentstore', 'electronicsstore', 'florist', 'furniturestore', 'gardenstore', 'grocerystore',
  'hardwarestore', 'hobbyshop', 'homegoodsstore', 'jewelrystore', 'liquorstore', 'mensclothingstore',
  'mobilephonestore', 'movierentalstore', 'musicstore', 'officeequipmentstore', 'outletstore',
  'pawnshop', 'petstore', 'shoestore', 'sportinggoodsstore', 'tireshop', 'toystore', 'wholesalestore',
  'shoppingcenter',
  // Lodging + travel.
  'lodgingbusiness', 'bedandbreakfast', 'campground', 'hostel', 'hotel', 'motel', 'resort',
  'travelagency', 'touristinformationcenter',
  // Sport + leisure.
  'sportsactivitylocation', 'bowlingalley', 'exercisegym', 'golfcourse', 'publicswimmingpool',
  'skiresort', 'sportsclub', 'stadiumorarena', 'tenniscomplex',
  // Entertainment.
  'entertainmentbusiness', 'adultentertainment', 'amusementpark', 'artgallery', 'casino',
  'comedyclub', 'movietheater', 'nightclub', 'radiostation', 'televisionstation',
  // Everything else that is plainly a going concern.
  'animalshelter', 'archiveorganization', 'childcare', 'drycleaningorlaundry', 'emergencyservice',
  'employmentagency', 'firestation', 'governmentoffice', 'governmentorganization', 'hospital',
  'internetcafe', 'library', 'librarysystem', 'newsmediaorganization', 'performinggroup',
  'policestation', 'postoffice', 'realestateagent', 'recyclingcenter', 'researchorganization',
  'searchrescueorganization', 'selfstorage', 'sportsorganization', 'sportsteam', 'workersunion',
  'airline', 'educationalorganization', 'school', 'collegeoruniversity', 'preschool',
  'elementaryschool', 'highschool', 'middleschool',
]);

/**
 * A qualified subtype we have never heard of but that is shaped like a business — `PoolCleaning
 * Service`, `WindowContractor`, `BridalShop`. Suppression only, same as the list above.
 *
 * The length test is what keeps this honest: a suffix must be a SUFFIX, not the whole name. A page
 * whose only structured data is a bare `Service` node has described a service, not a business, and
 * that is a case the finding should still be allowed to speak about. `Store` and `Organization`
 * stand alone perfectly well as business types, so they are on the explicit list above instead.
 */
const BUSINESS_SUFFIX = /(?:Business|Store|Shop|Restaurant|Contractor|Salon|Clinic|Agency|Dealer|Service|Organization|Practice)$/;

/** `https://schema.org/Plumber`, `schema:Plumber` and `Plumber` are the same claim. */
function localTypeName(t: string): string {
  const bare = t.trim()
    .replace(/^https?:\/\/(?:www\.)?schema\.org\/?/i, '')
    .replace(/^schema:/i, '');
  return (bare.split(/[#/]/).pop() ?? bare).trim();
}

function isBusinessType(t: string): boolean {
  const name = localTypeName(t);
  if (!name) return false;
  if (BUSINESS_TYPES.has(name.toLowerCase())) return true;
  const m = BUSINESS_SUFFIX.exec(name);
  return m !== null && name.length > m[0].length;
}

// ─── Name, address, phone ────────────────────────────────────────────────────────────────────────

/**
 * A `tel:` sitting in a LINK POSITION anywhere in the loaded markup — including the JSON nav blobs
 * that DIY builders ship their header and footer as, which a static read only ever sees as script
 * text. Spelled exactly as conversionScan.ts spells it, on purpose: the two lenses must not disagree
 * about whether this page has a phone number on it.
 */
const LINKED_TEL = /(?:href|url|link)["']?\s*[=:]\s*["']?\s*tel:/i;

/** A phone number written as text. Same pattern the conversion lens uses, so the two agree. */
const TEXT_PHONE = /(?:\+?\d{1,3}[\s.\-]?)?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}\b/;

/** A street line: a number, up to a few words, then a thoroughfare word. */
const STREET_ADDRESS =
  /\b\d{1,6}[a-z]?\s+(?:[A-Za-z0-9.'&-]+\s+){0,4}(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|circle|cir|place|pl|plaza|parkway|pkwy|highway|hwy|route|rte|way|terrace|ter|trail|trl|square|sq)\b\.?/i;
/** A suite/unit line, which only ever appears next to a real address. */
const SUITE_LINE = /\b(?:suite|ste\.?|unit|apt\.?|building|bldg\.?)\s*#?\s*[a-z]?\d+/i;
/** Post codes. US "WI 53147", UK "SW1A 1AA", Canadian "K1A 0B1" — case-sensitive by design, so a
 *  lowercase word followed by digits ("since 1998") cannot be read as a postal code. */
const POSTAL_US = /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/;
const POSTAL_UK = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/;
const POSTAL_CA = /\b[A-Z]\d[A-Z]\s*\d[A-Z]\d\b/;
/** An address marked up as one, in microdata or in the class/id vocabulary every theme uses. */
const ADDRESS_MARKUP =
  /itemprop\s*=\s*["'](?:address|streetAddress|postalCode|addressLocality|addressRegion)["']|(?:id|class)\s*=\s*["'][^"']*\b(?:address|adr|street-address|postal-code|locality)\b/i;

// ─── Opening hours ───────────────────────────────────────────────────────────────────────────────
// A day name adjacent to a time, in either order, is the shape hours take in prose. Both halves are
// required: "Monday" on its own is a blog post date and "8am" on its own is an event start.
const DAY = '(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues|tue|weds|wed|thurs|thur|thu|fri|sat|sun)';
const TIME = '(?:\\d{1,2}(?::\\d{2})?\\s*(?:a\\.?m\\.?|p\\.?m\\.?)|(?:[01]?\\d|2[0-3]):[0-5]\\d)';
// 30 characters of slack covers "Mon-Fri 8am", "Monday through Friday, 9:00" and "Open Sundays from
// 11am" without reaching across a sentence into an unrelated number.
const HOURS_DAY_TIME = new RegExp(`\\b${DAY}\\b.{0,30}?${TIME}`, 'i');
const HOURS_TIME_DAY = new RegExp(`${TIME}.{0,30}?\\b${DAY}\\b`, 'i');
/** schema.org's own shorthand, which plenty of sites also print verbatim: `Mo-Fr 08:00-17:00`.
 *  Case-sensitive so "we 12:30" in a sentence cannot match. */
const HOURS_SCHEMA_TEXT = /\b(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*[-–,]\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))*\s+\d{1,2}:\d{2}/;
/** Always open. Deliberately not a bare /24 hours/ — "we respond within 24 hours" is a promise about
 *  callbacks that appears on half the trades sites on the internet, and it is not an opening hour. */
const ALWAYS_OPEN = /\b24\s*[/\\]\s*7\b|\bopen\s+24\s*(?:hours|hrs)\b|\b24\s*(?:hours|hrs)\s+a\s+day\b|\bopen\s+around\s+the\s+clock\b/i;
/** Hours marked up as hours, in microdata or the usual class vocabulary. */
const HOURS_MARKUP = /itemprop\s*=\s*["']opening(?:Hours|HoursSpecification)["']|(?:id|class)\s*=\s*["'][^"']*\b(?:hours|opening-hours|business-hours|store-hours)\b/i;

// ─── Structured data we can see but do not read ──────────────────────────────────────────────────
// Microdata and RDFa are real machine-readable identity. We do not parse them — but we must never
// tell a business that nothing on their page is machine-readable while this markup is sitting in it.
const MICRODATA_TYPE = /\bitemtype\s*=\s*["'][^"']*schema\.org/i;
const RDFA_VOCAB = /\bvocab\s*=\s*["'][^"']*schema\.org/i;

// ─── Head tags ───────────────────────────────────────────────────────────────────────────────────
//
// Unlike JSON-LD, these two live in real markup, so they are read from the RENDERED markup with
// script bodies gone: a `<link rel="canonical">` sitting inside a JS template literal on a
// documentation page is not this page's canonical address, and storing it as one would be a false
// fact about the business.
//
// But a DIY builder that manages its own <head> in JavaScript really does write these tags at
// runtime, and telling that owner "there is no canonical tag on your page" would be false in the
// other direction. So the same discipline mobileScan.ts applies to a script-borne viewport applies
// here: a tag seen ONLY inside a script body buys SILENCE plus a sentence in `limits`, never a
// finding — because from static bytes we cannot tell a builder writing the tag from a snippet that
// merely mentions it.
//
// A tag seen only inside an HTML COMMENT is a different case and is NOT given that benefit: comments
// are stripped from `markup` before this check, so a commented-out canonical reads as absent — which
// it is. Nothing loads it, nothing runs it, and no reader anywhere sees it.

const OG_KEYS = ['og:title', 'og:description', 'og:image'] as const;
/** Twitter's card tags. Not Open Graph, and not reported as such — but a page that has them DOES
 *  render as a card when shared, so their presence stops us from saying otherwise. See below. */
const TWITTER_CARD = /(?:property|name)\s*=\s*["']twitter:(?:card|title|description|image)["']/i;
/** A canonical declaration in either the HTML form (`rel="canonical"`) or the JSON form a builder's
 *  head config uses (`"rel":"canonical"`). Suppression + explanation only, never a finding. */
const CANONICAL_ANYWHERE = /\brel\s*["']?\s*[:=]\s*["']?\s*canonical\b/i;
/** An og: key in either form. Same job: suppression + explanation only. */
const OG_ANYWHERE = /\bog:(?:title|description|image)\b/i;

/** The content of a `<meta>` whose property/name is exactly `key`, or null. Empty content is null:
 *  `<meta property="og:title" content="">` gives a sharing card nothing to print. */
function metaContent(rendered: string, key: string): string | null {
  for (const t of openTags(rendered, 'meta')) {
    const name = (attr(t.attrs, 'property') ?? attr(t.attrs, 'name') ?? '').trim().toLowerCase();
    if (name !== key) continue;
    const content = (attr(t.attrs, 'content') ?? '').trim();
    if (content) return content;
  }
  return null;
}

/**
 * The canonical address this page declares, or null.
 *
 * A canonical tag with an empty href is treated as absent, because that is how it behaves: a search
 * engine given `href=""` has been told nothing and falls back to the request URL. One rule, so the
 * stored fact and the finding can never disagree with each other.
 */
function canonicalHref(rendered: string): string | null {
  for (const t of openTags(rendered, 'link')) {
    const rel = attr(t.attrs, 'rel') ?? '';
    if (!/(?:^|\s)canonical(?:\s|$)/i.test(rel.trim())) continue;
    const href = (attr(t.attrs, 'href') ?? '').trim();
    if (href) return href;
  }
  return null;
}

// ─── The single read ─────────────────────────────────────────────────────────────────────────────

interface Read {
  facts: PresenceFacts;
  /** Parsed JSON-LD roots — empty when nothing parsed, which is not the same as nothing existing. */
  nodes: unknown[];
  malformed: LdBlock[];
  /** A recognised business/organization type appears ANYWHERE in the parsed tree. */
  businessType: boolean;
  /** Microdata or RDFa is present; we cannot read it, so we must not claim it is not there. */
  otherStructuredData: boolean;
  /** Twitter card tags are present, so "this link shares as a bare URL" would not be true. */
  twitterCard: boolean;
  /** A canonical declaration lives only inside a script body — unknowable, never a finding. */
  canonicalScripted: boolean;
  /** An og: declaration lives only inside a script body — unknowable, never a finding. */
  ogScripted: boolean;
  /** The page is a real document, so its <head> is a thing we can have an opinion about. */
  isDocument: boolean;
  /** Too little rendered to read an identity out of — a fragment, or an unfilled app shell. */
  blind: boolean;
}

/** The visible text of the body, or of the whole fragment when there is no <body> pair. */
function visibleText(clean: string): string {
  const body = innerText(clean, 'body');
  if (body !== null) return body;
  return clean.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Everything this module knows about one page, computed once.
 *
 * Both exports run through here so a stored fact and a shipped finding can never be computed two
 * different ways and drift apart.
 */
function read(html: string): Read {
  const raw = typeof html === 'string' ? html : '';
  // `clean` is what a visitor can really see: script bodies, style bodies and comments gone. `markup`
  // keeps script bodies, because JSON-LD lives in one — but drops comments, because commented-out
  // markup is not loaded by anything.
  const clean = stripNonContent(raw);
  const markup = loadedMarkup(raw);
  const text = visibleText(clean);

  const { nodes, malformed } = readLd(markup);

  const jsonLdTypes: string[] = [];
  for (const node of nodes) collectTypes(node, jsonLdTypes, 0);

  // The suppression walk. Unlike the declared-types list above, this looks at EVERY object in the
  // tree, because a LocalBusiness can legitimately hang off a property — Yoast's `publisher`, a
  // `provider` on a Service node, a `worksFor` on a Person. Reporting "none of it identifies a
  // business" over one of those would be false, and false is the one thing we cannot be.
  let businessType = false;
  let ldAddress = false;
  let ldPhone = false;
  let ldHours = false;
  for (const node of nodes) {
    walk(node, (o) => {
      const t = o['@type'];
      for (const v of Array.isArray(t) ? t : [t]) {
        if (typeof v === 'string' && isBusinessType(v)) businessType = true;
      }
      for (const key of Object.keys(o)) {
        const k = key.toLowerCase();
        if (!hasContent(o[key])) continue;
        if (k === 'address' || k === 'streetaddress' || k === 'addresslocality' || k === 'postalcode' || k === 'hasmap') ldAddress = true;
        if (k === 'telephone' || k === 'phone') ldPhone = true;
        if (k === 'openinghours' || k === 'openinghoursspecification') ldHours = true;
      }
    }, 0, { n: MAX_WALK_NODES });
  }

  // An <address> element with real text in it. Read through elements() so an empty `<address></address>`
  // left behind by a template cannot stand in for a real one.
  const addressEl = elements(clean, 'address').some(
    (e) => e.inner.replace(/<[^>]*>/g, ' ').trim().length > 0,
  );

  const hasPhone = ldPhone || LINKED_TEL.test(markup) || TEXT_PHONE.test(text);
  const hasAddress = ldAddress || addressEl || ADDRESS_MARKUP.test(clean) ||
    STREET_ADDRESS.test(text) || SUITE_LINE.test(text) ||
    POSTAL_US.test(text) || POSTAL_UK.test(text) || POSTAL_CA.test(text);

  const hasHours = ldHours || HOURS_MARKUP.test(clean) || ALWAYS_OPEN.test(text) ||
    HOURS_SCHEMA_TEXT.test(text) || HOURS_DAY_TIME.test(text) || HOURS_TIME_DAY.test(text);

  // Head tags come from the RENDERED markup; a declaration surviving only in `markup` is one that
  // lives inside a script body, which buys silence rather than a finding. See the section comment.
  const canonical = canonicalHref(clean);
  const hasOpenGraph = OG_KEYS.some((k) => metaContent(clean, k) !== null);

  const isDocument = DOCUMENT.test(clean);
  const blind = !isDocument ||
    (SPA_MOUNT.test(clean) && text.length < SHELL_TEXT_MIN) ||
    text.length === 0;

  return {
    facts: { jsonLdTypes, hasNap: hasPhone || hasAddress, hasHours, canonical, hasOpenGraph },
    nodes,
    malformed,
    businessType,
    otherStructuredData: MICRODATA_TYPE.test(clean) || RDFA_VOCAB.test(clean),
    twitterCard: TWITTER_CARD.test(clean),
    // "Off-stage" means the declaration survives in `markup` but not in `clean` — i.e. it lives in a
    // script/style/noscript body. A declaration that IS in the rendered markup but carries nothing
    // usable (`content=""`, `href=""`) is not off-stage: we can see it perfectly well, and what we
    // can see is that it gives a reader nothing. That case keeps its finding.
    canonicalScripted: canonical === null && CANONICAL_ANYWHERE.test(markup) && !CANONICAL_ANYWHERE.test(clean),
    ogScripted: !hasOpenGraph && OG_ANYWHERE.test(markup) && !OG_ANYWHERE.test(clean),
    isDocument,
    blind,
  };
}

/**
 * The machine-readable identity this page declares, as data.
 * Pure and deterministic. Empty or garbage input claims nothing: no types, no NAP, no hours.
 */
export function presenceFacts(html: string): PresenceFacts {
  return read(html).facts;
}

// Keeps the owner-facing prose grammatical at a count of one. A finding that reads "1 block are not
// valid JSON" makes a true statement look automated, and an automated-looking true statement gets
// deleted just as fast as a false one.
const s = (n: number) => (n === 1 ? '' : 's');
const v = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** How many declared types to name in owner-facing copy before it stops being readable. */
const TYPES_IN_DETAIL = 6;

/** `a, b and c` — a readable list for detail copy. Order is source order, so it is stable. */
function listOf(names: string[]): string {
  const l = names.slice(0, TYPES_IN_DETAIL);
  if (l.length <= 1) return l[0] ?? '';
  return `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}`;
}

// The limits ship with every result, including an empty one. They are not findings — they are the
// standing statement of what a static read of one page cannot see, so nobody downstream mistakes a
// quiet result for a business that is easy to find.
const LIMITS: string[] = [
  'Structured data served by JavaScript after load is not visible to this scan. Search engines that render a page can see JSON-LD injected by a tag manager or a framework at runtime; this reads only the HTML the server sent, so a site that adds its markup that way looks empty here.',
  'This scan reads one page only, so identity declared on an About or Contact page is not counted. An address, phone number, opening hours or business schema living elsewhere on the same site is invisible from here.',
  'Only JSON-LD is parsed. Microdata (itemscope/itemtype) and RDFa are detected well enough to keep this scan quiet about them, but their contents are not read, so nothing declared that way is counted in the facts reported here.',
  'A canonical address or a social preview tag set in the HTTP response headers, or written into the <head> by JavaScript, is not visible to a read of the served HTML.',
  'Whether the details found here are CORRECT is not checked. A phone number, address or set of hours can be present, parseable and years out of date; this scan reports only that the field is there.',
  'An address or phone number set inside an image, or drawn by a script, cannot be read from markup — a person looking at the page may well see one where this scan found none.',
];

// The two sentences that replace a finding when a head tag exists in the bytes but only inside a
// script body. They are pushed onto the result's own limits, so the reason for the silence travels
// with the scan instead of living only in this file's comments.
const CANONICAL_OFFSTAGE_LIMIT =
  'A canonical declaration appears in this page\'s scripts but not in its rendered markup. That is either a site builder writing the tag into the <head> at runtime or a snippet that merely mentions one, and the two are indistinguishable from the HTML source, so no finding was raised either way.';
const OG_OFFSTAGE_LIMIT =
  'An og: declaration appears in this page\'s scripts but not in its rendered markup. That is either a site builder writing the social preview tags at runtime or a snippet that merely mentions them, and the two are indistinguishable from the HTML source, so no finding was raised either way.';

/**
 * Scan one page's HTML for the machine-readable identity a search engine or an assistant can read.
 *
 * Pure and deterministic. Empty, garbage or app-shell input claims nothing: zero findings, standing
 * limits unchanged — because "we found no structured data" and "this business has no structured
 * data" are different sentences, and only one of them is ever true from one page's bytes.
 */
export function scanPresence(html: string): ScanResult {
  const r = read(html);
  const findings: Finding[] = [];
  const limits = [...LIMITS];

  // ── A block that exists and cannot be read ─────────────────────────────────────────────────────
  // The only PRESENCE-based finding in this module, and the only one never gated by the blindness
  // check: the broken block is really there in the bytes, and that is true whatever else the page
  // does or does not render.
  if (r.malformed.length > 0) {
    const n = r.malformed.length;
    findings.push({
      code: 'pres.malformed_json_ld',
      category: 'presence',
      severity: 'med',
      confidence: 'detected',
      title: `${n} structured-data block${s(n)} on the page cannot be parsed`,
      detail:
        `${n} <script type="application/ld+json"> block${s(n)} on the page ${v(n, 'is', 'are')} not valid JSON. ` +
        `A reader that cannot parse the block skips it entirely, so whatever ${v(n, 'it names', 'they name')} — the ` +
        'business, its address, its hours — is not received at all. The markup is there and the work of adding it ' +
        'was done; nothing can read the result.',
      count: n,
      evidence: snippet(r.malformed[0].raw),
    });
  }

  // ── No machine-readable identity at all ────────────────────────────────────────────────────────
  // Suppressed by microdata/RDFa: we do not read those, and a business whose identity is marked up
  // that way would be told something false about their own page. `limits` carries the explanation.
  if (!r.blind && r.nodes.length === 0 && !r.otherStructuredData) {
    findings.push({
      code: 'pres.no_structured_data',
      category: 'presence',
      severity: 'med',
      // 'detected': the absence of a parseable ld+json block from the served HTML is unambiguous in
      // the bytes. What that absence MEANS for a renderer that runs the page's JavaScript is a
      // different question, and it is answered in `limits` rather than hedged into the confidence.
      confidence: 'detected',
      title: 'No structured data on the page',
      detail:
        'No parseable JSON-LD block (<script type="application/ld+json">) was found in this page\'s HTML, so ' +
        'search engines and AI assistants have no machine-readable record of who this business is, what it does, ' +
        'or where it is. Everything they show about the business has to be inferred from the page text, and what ' +
        'they infer is not something the business gets to correct.',
    });
  }

  // ── Structured data that never says "this is a business" ───────────────────────────────────────
  // Only reachable when something really parsed, so the types quoted in the detail are the page's
  // own words back to it.
  if (!r.blind && r.nodes.length > 0 && !r.businessType && !r.otherStructuredData) {
    const declared = r.facts.jsonLdTypes;
    findings.push({
      code: 'pres.no_localbusiness',
      category: 'presence',
      severity: 'med',
      confidence: 'detected',
      title: 'Structured data is present, but none of it identifies a business',
      detail:
        (declared.length
          ? `The page's structured data declares ${listOf(declared)}${declared.length > TYPES_IN_DETAIL ? ' and others' : ''}, and none of those is `
          : 'The page\'s structured data carries no @type at all, so none of it is ') +
        'LocalBusiness, one of its recognised subtypes, or Organization. Nothing machine-readable on the page says ' +
        'this is a business, what kind it is, or where it operates — which is the part a search engine or an ' +
        'assistant reads before putting somewhere on a map or into a "who does this near me" answer.',
      evidence: declared.length ? snippet(declared.join(', ')) : undefined,
    });
  }

  // ── Nothing to match the business on ───────────────────────────────────────────────────────────
  if (!r.blind && !r.facts.hasNap) {
    findings.push({
      code: 'pres.no_nap',
      category: 'presence',
      severity: 'high',
      // 'likely', never 'detected'. This is the finding with the most ways to be quietly wrong — a
      // number set in the header image, an address a script writes in after load — so it says
      // "found none" and not "there is none", and the detail admits the gap out loud.
      confidence: 'likely',
      title: 'No address or phone number found on the page',
      detail:
        'Neither a postal address nor a phone number was found in this page\'s text, its links or its structured ' +
        'data. Name, address and phone are the three fields directories, map panels and assistants match a business ' +
        'on, and with none of them on the page there is nothing to match against. A number or address set inside an ' +
        'image, or written in by a script after load, would not be visible to this scan.',
    });
  }

  // ── Nothing that answers "are they open?" ──────────────────────────────────────────────────────
  if (!r.blind && !r.facts.hasHours) {
    findings.push({
      code: 'pres.no_hours',
      category: 'presence',
      severity: 'low',
      // 'likely': hours in prose take a hundred shapes and hours drawn into an image take none we
      // can read. A page that lists them somewhere we did not recognise is a real possibility.
      confidence: 'likely',
      title: 'No opening hours found on the page',
      detail:
        'No opening hours were found in the page\'s structured data, and no day-and-time pairing (something in the ' +
        'shape of "Mon-Fri 8am-5pm") was found in the page text. "Are they open now?" is one of the most common ' +
        'things a person asks a phone or an assistant, and this page gives it nothing to answer with. Hours set ' +
        'inside an image cannot be read from markup.',
    });
  }

  // ── No canonical address ───────────────────────────────────────────────────────────────────────
  // Gated on being a real document, not on the blindness check: a <head> is served even for an app
  // shell, and this tag is either in it or it is not.
  if (r.isDocument && r.facts.canonical === null && r.canonicalScripted) {
    limits.push(CANONICAL_OFFSTAGE_LIMIT);
  } else if (r.isDocument && r.facts.canonical === null) {
    findings.push({
      code: 'pres.no_canonical',
      category: 'presence',
      severity: 'low',
      confidence: 'detected',
      title: 'No canonical link tag on the page',
      detail:
        'The page has no <link rel="canonical"> carrying an address. The same page is usually reachable at several ' +
        'URLs — with and without www, http and https, with campaign parameters on the end — and a canonical tag is ' +
        'how a search engine is told which one is the real address. Without it, they choose for themselves and the ' +
        'credit for the page can end up split across the copies.',
    });
  }

  // ── Nothing for a shared link to render with ───────────────────────────────────────────────────
  // Twitter card tags suppress this. They are not Open Graph and are not reported as Open Graph —
  // but the sentence this finding puts in front of an owner is "your link shares as a bare URL",
  // and on a page carrying twitter:card that sentence is simply not true.
  if (r.isDocument && !r.facts.hasOpenGraph && !r.twitterCard && r.ogScripted) {
    limits.push(OG_OFFSTAGE_LIMIT);
  } else if (r.isDocument && !r.facts.hasOpenGraph && !r.twitterCard) {
    findings.push({
      code: 'pres.no_open_graph',
      category: 'presence',
      severity: 'low',
      confidence: 'detected',
      title: 'No social preview tags — a shared link shows as a bare address',
      detail:
        'No og:title, og:description or og:image meta tag was found on the page. When the address is pasted into ' +
        'Facebook, LinkedIn, WhatsApp, iMessage or Slack there is nothing for the preview to use, so the link ' +
        'appears as a raw URL rather than a titled card with a picture — including every time a happy customer ' +
        'shares it.',
    });
  }

  return { findings, limits };
}
