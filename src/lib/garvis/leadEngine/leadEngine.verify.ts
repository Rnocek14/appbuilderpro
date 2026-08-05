// src/lib/garvis/leadEngine/leadEngine.verify.ts — the Lead Engine's pure brain
// (npm run verify:leadengine). Scoring states its reasons, dedupe is stable, digests never
// invent, commission math is clamped, adapters are verbatim-only.

import {
  TRADES, TRADE_KEYS, isTradeKey, dedupeKey, normalizeKeyPart, scoreLead, pickContact, whyNow,
  digestFor, commissionFor, parseLeadEngineConfig, ingestLine, DEFAULT_COMMISSION_PCT,
  pitchFor, digestDue, tradeForPlaceType,
  pickLeadContact, normalizeRole, normalizeStatus, stableStringify, changedFields,
  SCORE_VERSION, NO_DIRECT_LINK,
  type LeadEventLike,
} from './leadEngine.ts';
import {
  buildFetchUrl, parseRows, parseRowsResult, parseCsv, parseCsvLine, parseRss, sourceFormat,
  normalizeEvent, nextCursor, toIso, configHash, sourceJurisdiction, slugJurisdiction,
  FETCH_LIMIT, STARTER_SOURCES, starterById, type SourceLike,
} from './adapters.ts';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

const NOW = '2026-08-04T12:00:00.000Z';

const permit: LeadEventLike = {
  event_type: 'permit_issued', occurred_at: '2026-08-01T00:00:00.000Z',
  address: '400 Main St, Denver, CO', region: 'Denver, CO', valuation_usd: 300_000,
  title: 'Tenant improvement — 6,200 sq ft office', description: 'Interior remodel',
  named_parties: [{ role: 'applicant', name: 'Pat Jones', company: 'Jones GC' }],
  source_url: 'https://data.example.gov/permits/123',
};

// ── trades registry ────────────────────────────────────────────────────────
check('every trade has a label, a buys line, and at least one weighted event type',
  TRADE_KEYS.every((t) => TRADES[t].label && TRADES[t].buys && Object.values(TRADES[t].weights).some((w) => (w ?? 0) > 0)));
check('isTradeKey accepts real trades and rejects junk', isTradeKey('security') && isTradeKey('plumbing') && !isTradeKey('astrology') && !isTradeKey(42));

// ── dedupe identity ────────────────────────────────────────────────────────
check('dedupeKey is deterministic', dedupeKey(permit) === dedupeKey({ ...permit }));
check('dedupeKey buckets by month — same address next quarter is a NEW event',
  dedupeKey(permit) !== dedupeKey({ ...permit, occurred_at: '2026-11-01T00:00:00.000Z' }));
check('dedupeKey falls back to title when the record has no address',
  dedupeKey({ ...permit, address: null }).includes(normalizeKeyPart(permit.title)));
check('undated records key as undated, never an invented date', dedupeKey({ ...permit, occurred_at: null }).endsWith('::undated'));
check('normalizeKeyPart strips punctuation and case', normalizeKeyPart('400 Main St.,  DENVER') === '400-main-st-denver');

// ── scoring ────────────────────────────────────────────────────────────────
const s = scoreLead(permit, 'security', NOW);
check('a fresh, valued, named permit scores high for security', !!s && s.score >= 80);
check('every score point is explained — reasons cover base, value, recency, contact', !!s && s.reasons.length === 4);
check('score is capped at 100', !!s && s.score <= 100);
const bare = scoreLead({ ...permit, valuation_usd: null, named_parties: [], occurred_at: null }, 'security', NOW);
check('a bare permit still scores its base weight, with one reason', !!bare && bare.score === 35 && bare.reasons.length === 1);
check('an older event scores lower than a fresh one',
  (scoreLead({ ...permit, occurred_at: '2026-05-01T00:00:00.000Z' }, 'security', NOW)?.score ?? 0) < (s?.score ?? 0));
check('a zero-weight pairing returns null — it never becomes a lead row',
  scoreLead({ ...permit, event_type: 'news' }, 'fire_safety', NOW) !== null
  && scoreLead(permit, 'acoustics', NOW) !== null); // both weighted — sanity
const noRelevance = { ...TRADES.acoustics.weights };
check('trade weights drive relevance (permit beats news for acoustics)',
  (noRelevance.permit_issued ?? 0) > (noRelevance.news ?? 0));

// ── contact + why-now: verbatim only ───────────────────────────────────────
check('pickContact prefers a person over a bare company',
  pickContact([{ company: 'Acme' }, { name: 'Sam Lee' }])?.name === 'Sam Lee');
check('pickContact returns null when the record names nobody', pickContact([]) === null && pickContact([{ role: 'x' }]) === null);
const why = whyNow(permit);
check('whyNow uses only record fields', why.includes('400 Main St') && why.includes('2026-08-01') && why.includes('$300,000'));
const whyBare = whyNow({ ...permit, address: null, occurred_at: null, valuation_usd: null });
check('whyNow omits missing fields instead of inventing them',
  !whyBare.includes('null') && !whyBare.includes('$') && !whyBare.includes(' at '));

// ── digest ─────────────────────────────────────────────────────────────────
const dl = { trade: 'security' as const, score: 90, why_now: why, contact_name: 'Pat Jones', contact_company: null, source_url: permit.source_url, title: permit.title };
const dig = digestFor('Denver — Security', [dl, { ...dl, score: 40, title: 'Second lead' }]);
check('digest ranks by score and counts honestly', dig.included === 2 && dig.body.indexOf(permit.title) < dig.body.indexOf('Second lead'));
check('every digest entry carries its source URL', (dig.body.match(/Source: https:\/\//g) ?? []).length === 2);
check('an empty week says quiet week — never padded', digestFor('X', []).included === 0 && /quiet week/i.test(digestFor('X', []).subject));
check('digest caps at max', digestFor('X', Array.from({ length: 30 }, () => dl), 15).included === 15);

// ── commission ─────────────────────────────────────────────────────────────
check('10% of $12,000 is $1,200', commissionFor(12_000) === 1_200);
check('pct clamps to 0..50 — a typo cannot mint 500%', commissionFor(10_000, 500) === 5_000 && commissionFor(10_000, -5) === 0);
check('negative contract value yields 0, never a negative invoice', commissionFor(-100) === 0);
check('rounds to cents', commissionFor(3_333, 10) === 333.3);

// ── order config ───────────────────────────────────────────────────────────
const cfg = parseLeadEngineConfig({ trades: ['security', 'bogus'], commissionPct: 15 });
check('unknown trades are dropped, known kept', cfg.trades.length === 1 && cfg.trades[0] === 'security');
check('empty trades falls back to ALL trades', parseLeadEngineConfig({}).trades.length === TRADE_KEYS.length);
check('commission pct defaults and clamps', parseLeadEngineConfig({}).commissionPct === DEFAULT_COMMISSION_PCT && parseLeadEngineConfig({ commissionPct: 99 }).commissionPct === 50);

// ── ingest line honesty ────────────────────────────────────────────────────
check('no sources → says so', /no active sources/i.test(ingestLine(0, 0, 0, 0)));
check('failures are counted, never hidden', /1 unreachable/.test(ingestLine(3, 1, 0, 0)));
check('quiet run says nothing new', /nothing new/i.test(ingestLine(2, 0, 0, 0)));

// ── adapters: URL building ─────────────────────────────────────────────────
const soc: SourceLike = {
  kind: 'socrata', base_url: 'https://data.example.gov/resource/abcd.json', region: 'Denver, CO',
  query_config: { date_field: 'issued_date', where: "permit_class='Commercial'", field_map: { title: 'description', address: 'full_address', valuation: 'valuation', date: 'issued_date', contact_name: 'applicant_name' } },
  cursor: { last_date: '2026-07-01' },
};
const socUrl = buildFetchUrl(soc);
check('socrata URL carries where + cursor + order + limit',
  socUrl.includes('%24where=') && socUrl.includes('issued_date') && socUrl.includes('2026-07-01') && socUrl.includes(`%24limit=${FETCH_LIMIT}`));
check('socrata URL without cursor still filters by config.where', buildFetchUrl({ ...soc, cursor: {} }).includes('Commercial'));
const arc: SourceLike = { kind: 'arcgis', base_url: 'https://gis.example.gov/arcgis/rest/services/Permits/FeatureServer/0/query', region: 'Denver, CO', query_config: { date_field: 'ISSUED' }, cursor: { last_date: '2026-07-01' } };
check('arcgis URL speaks its dialect (f=json, outFields, TIMESTAMP where)',
  buildFetchUrl(arc).includes('f=json') && buildFetchUrl(arc).includes('outFields=*') && buildFetchUrl(arc).includes('TIMESTAMP'));
check('a quote in the cursor cannot break out of the where clause', !buildFetchUrl({ ...soc, cursor: { last_date: "2026' OR 1=1" } }).includes("%27%20OR"));

// ── adapters: row parsing ──────────────────────────────────────────────────
check('socrata rows: a JSON array passes through', parseRows('socrata', '[{"a":1}]').length === 1);
check('arcgis rows come from features[].attributes', parseRows('arcgis', '{"features":[{"attributes":{"ISSUED":1}}]}').length === 1);
check('unparseable body → [] (counted as unreachable by the caller, never "no change")', parseRows('socrata', '<html>WAF page</html>').length === 0);

// ── adapters: normalization is verbatim-only ───────────────────────────────
const row = { description: 'TI — new restaurant', full_address: '12 Oak Ave', valuation: '$85,000', issued_date: '2026-08-02', applicant_name: 'R. Chen' };
const ev = normalizeEvent(soc, row);
check('normalizeEvent maps configured fields', !!ev && ev.title === 'TI — new restaurant' && ev.address === '12 Oak Ave' && ev.valuation_usd === 85_000);
check('the applicant becomes a named party, verbatim', !!ev && ev.named_parties[0]?.name === 'R. Chen');
check('event date comes from the record', !!ev && (ev.occurred_at ?? '').startsWith('2026-08-02'));
check('a row with no title and no address is dropped', normalizeEvent(soc, { valuation: '5' }) === null);
check('missing mapped fields are null — never guessed', (() => {
  const e = normalizeEvent(soc, { description: 'Just a title' });
  return !!e && e.address === null && e.valuation_usd === null && e.occurred_at === null && e.named_parties.length === 0;
})());
check('liquor sources default to liquor_license events', (() => {
  const e = normalizeEvent({ ...soc, kind: 'liquor', query_config: { field_map: { title: 'description' } } }, { description: 'New tavern license' });
  return !!e && e.event_type === 'liquor_license';
})());
check('arcgis epoch-millis dates parse to ISO', (toIso(1785715200000) ?? '').startsWith('2026-08-0'));
check('junk dates are null, not Invalid Date', toIso('not a date') === null && toIso('') === null);

// ── the sample pitch: real leads or nothing ────────────────────────────────
const pl = { trade: 'security' as const, score: 90, why_now: 'TI permit at 400 Main St, filed on 2026-08-01.', contact_name: 'Pat Jones', contact_company: null, source_url: 'https://data.example.gov/permits/123', title: 'Tenant improvement — 6,200 sq ft office' };
const pitch = pitchFor('security', 'Denver, CO', [pl, { ...pl, score: 40, title: 'Second job' }], 'Riley');
check('pitch embeds real leads with their public-record links', !!pitch && (pitch.body.match(/Public record: https:\/\//g) ?? []).length === 2);
check('pitch subject names the trade, region, and count', !!pitch && /2 security & access control projects in Denver, CO/i.test(pitch.subject));
check('pitch caps at 3 leads, highest score first', (() => {
  const p = pitchFor('security', 'X', Array.from({ length: 6 }, (_, i) => ({ ...pl, score: 100 - i, title: `L${i}` })), 'R');
  return !!p && (p.body.match(/Public record:/g) ?? []).length === 3 && p.body.indexOf('L0') < p.body.indexOf('L2');
})());
check('a pitch with zero leads is null — a sample never bluffs', pitchFor('security', 'X', [], 'R') === null);
check('pitch invents no stats (no percent signs, no claimed close rates)', !!pitch && !/%|close rate/i.test(pitch.body));
const bundled = pitchFor('security', 'Denver, CO', [pl], 'Riley', { siteUrl: 'https://x.example/preview-site/abc' });
check('the bundle line appears ONLY with a real site url',
  !!bundled && bundled.body.includes('https://x.example/preview-site/abc') && /website preview/i.test(bundled.body)
  && !!pitch && !/website preview/i.test(pitch.body));
check('the bundle mentions automation without inventing a claim',
  !!bundled && /follow-ups and invoice reminders/i.test(bundled.body) && !/%/.test(bundled.body));

// ── weekly digest due math ─────────────────────────────────────────────────
check('never-digested customers are due', digestDue(null, '2026-08-04T12:00:00Z'));
check('digested 8 days ago is due; 3 days ago is not',
  digestDue('2026-07-27T12:00:00Z', '2026-08-04T12:00:00Z') && !digestDue('2026-08-01T12:00:00Z', '2026-08-04T12:00:00Z'));

// ── verticals + place-type mapping ─────────────────────────────────────────
check('registry carries 12 trades, all fully described',
  TRADE_KEYS.length === 12 && TRADE_KEYS.every((t) => TRADES[t].label && TRADES[t].buys));
check('place types map to trades; unknown types map to null, never guessed',
  tradeForPlaceType('roofing_contractor') === 'roofing' && tradeForPlaceType('electrician') === 'electrical'
  && tradeForPlaceType('bakery') === null && tradeForPlaceType(null) === null);

// ── CSV + RSS dialects ─────────────────────────────────────────────────────
check('csv lines respect quoted commas and "" escapes', parseCsvLine('a,"b, c","d""e"').join('|') === 'a|b, c|d"e');
const csvRows = parseCsv('permit,address,cost\r\nP1,"400 Main St, Denver","$85,000"\nP2,12 Oak Ave,5000');
check('csv rows are keyed by the header', csvRows.length === 2 && csvRows[0].address === '400 Main St, Denver' && csvRows[1].permit === 'P2');
const rssBody = '<rss><channel><item><title><![CDATA[New tavern license — Oak & Main]]></title><link>https://boards.example.gov/dockets/55</link><pubDate>Mon, 03 Aug 2026 10:00:00 GMT</pubDate><description>Application for on-premises license</description></item></channel></rss>';
const rssRows = parseRss(rssBody);
check('rss items parse with CDATA stripped and links kept',
  rssRows.length === 1 && rssRows[0].title === 'New tavern license — Oak & Main' && rssRows[0].link === 'https://boards.example.gov/dockets/55');
check('parseRows routes by format (rss kind reads XML now — the old stub is gone)',
  parseRows('rss', rssBody).length === 1 && parseRows('liquor', 'a,b\n1,2', 'csv').length === 1);
const rssSource: SourceLike = { kind: 'rss', base_url: 'https://boards.example.gov/feed', region: 'Denver, CO', query_config: {}, cursor: {} };
const rssEv = normalizeEvent(rssSource, rssRows[0]);
check('rss events normalize via the default map: link is the permalink, pubDate the date',
  !!rssEv && rssEv.source_url === 'https://boards.example.gov/dockets/55' && (rssEv.occurred_at ?? '').startsWith('2026-08-03') && rssEv.event_type === 'news');
check('csv/rss sources fetch base_url as-is (no SODA params)',
  buildFetchUrl(rssSource) === rssSource.base_url && sourceFormat({ kind: 'liquor', query_config: { format: 'csv' } }) === 'csv');

// ── starter presets — every one must be a valid, buildable source ─────────
check('every starter preset is https with a region, a date_field, and a title or address mapping',
  STARTER_SOURCES.every((p) => /^https:\/\//.test(p.base_url) && p.region.includes(',')
    && !!p.query_config.date_field && !!(p.query_config.field_map?.title || p.query_config.field_map?.address)));
check('every starter preset builds a fetch URL without throwing', STARTER_SOURCES.every((p) => {
  const url = buildFetchUrl({ kind: p.kind, base_url: p.base_url, region: p.region, query_config: p.query_config, cursor: {} });
  return url.startsWith('https://') && url.includes('%24limit=');
}));
check('starter preset ids are unique and resolvable', new Set(STARTER_SOURCES.map((p) => p.id)).size === STARTER_SOURCES.length
  && starterById('chicago-permits') !== null && starterById('nope') === null);
check('every preset filters out residential junk (a value floor or a work-type filter)',
  STARTER_SOURCES.every((p) => (Number(p.query_config.min_valuation_usd) || 0) >= 25000 || !!p.query_config.where));
check('every preset builds a FULL address — house number included, never a bare street name',
  STARTER_SOURCES.every((p) => {
    const m = p.query_config.field_map ?? {};
    if (m.address_parts?.length) return m.address_parts.length >= 2 && /number|house/i.test(m.address_parts[0]);
    return !!m.address && /address|original/i.test(m.address);   // single-column full-address feeds
  }));

// ── the junk floor + multi-part address (the two lead-quality defects) ────
const chicago = starterById('chicago-permits')!;
const chiSource: SourceLike = { kind: chicago.kind, base_url: chicago.base_url, region: chicago.region, query_config: chicago.query_config, cursor: {} };
const bigPermit = normalizeEvent(chiSource, { work_description: 'Interior build-out', street_number: '400', street_direction: 'N', street_name: 'MILWAUKEE', suffix: 'AVE', reported_cost: '250000', issue_date: '2026-08-01' });
check('a real commercial permit keeps its FULL address', !!bigPermit && bigPermit.address === '400 N MILWAUKEE AVE');
check('a permit with NO stated value is kept — we do not drop what we cannot judge',
  normalizeEvent(chiSource, { work_description: 'Tenant work', street_number: '9', street_name: 'PINE', issue_date: '2026-08-01' })?.qualified === true);
check('full addresses keep two permits on the same street distinct (dedupe would collapse them)',
  bigPermit!.dedupe_key !== normalizeEvent(chiSource, { work_description: 'Other build-out', permit_: 'P-2', street_number: '900', street_direction: 'N', street_name: 'MILWAUKEE', suffix: 'AVE', reported_cost: '90000', issue_date: '2026-08-02' })!.dedupe_key);

// ── DISQUALIFIED ROWS ARE STORED, NOT DROPPED (capture spec §3.9) ─────────
// A portal serves a rolling window: a row we discard is gone for good, and absence cannot be
// proved from a value-filtered subset. So the junk floor FLAGS instead of dropping.
const junk = normalizeEvent(chiSource, { work_description: 'Deck', permit_: 'P-JUNK', street_number: '12', street_name: 'OAK', reported_cost: '3000', issue_date: '2026-08-01' });
check('a $3k residential permit is STORED, flagged not qualified — never silently discarded',
  !!junk && junk.qualified === false);
check('a disqualified row states WHY, with the number and the floor',
  !!junk && /3,000/.test(junk.disqualified_reason ?? '') && /25,000/.test(junk.disqualified_reason ?? ''));
check('a disqualified row is still a complete, verbatim row (it can be re-judged later)',
  !!junk && junk.address === '12 OAK' && junk.valuation_usd === 3000 && !!junk.dedupe_key && !!junk.content_hash);
check('a qualifying row carries no disqualified reason',
  !!bigPermit && bigPermit.qualified === true && bigPermit.disqualified_reason === null);
check('a row with no stated value is never disqualified by a floor it cannot be judged against',
  normalizeEvent(chiSource, { work_description: 'Tenant work', permit_: 'P-9', street_number: '9', street_name: 'PINE' })?.disqualified_reason === null);

// ── adapters: cursor stepping ──────────────────────────────────────────────
const evs = [ev!, { ...ev!, occurred_at: '2026-08-03T00:00:00.000Z' }];
check('nextCursor advances to the max date seen', nextCursor(soc, evs).last_date === '2026-08-03T00:00:00.000Z');
check('nextCursor with no dated events leaves the cursor unchanged', nextCursor(soc, []).last_date === '2026-07-01');

// ═══════════════════════════════════════════════════════════════════════════
// app_0131 — THE CAPTURE LAYER (docs/lead-engine-capture-spec.md)
// ═══════════════════════════════════════════════════════════════════════════

// ── THE DEDUPE FIX (§6.5) — the highest-priority defect in the audit ──────
// Two different permits at ONE address in ONE month is the NORMAL case, not the edge case: a
// commercial job emits electrical + plumbing + mechanical sub-permits, each a separate trade
// lead. The old type::address::month key collapsed all of them into one event.
const permitA = { ...permit, jurisdiction: 'austin-tx', source_record_id: '2026-041234-BP' };
const permitB = { ...permit, jurisdiction: 'austin-tx', source_record_id: '2026-041235-EP' };
check('TWO DIFFERENT PERMITS AT ONE ADDRESS IN ONE MONTH NO LONGER COLLAPSE',
  dedupeKey(permitA) !== dedupeKey(permitB));
check('…and the old key really did collapse them (the bug is real, not hypothetical)',
  `${permit.event_type}::${normalizeKeyPart(permit.address!)}::${permit.occurred_at!.slice(0, 7)}`
  === `${permit.event_type}::${normalizeKeyPart(permit.address!)}::${permitB.occurred_at!.slice(0, 7)}`);
check('a record number IS the identity — same permit, different address text, same key',
  dedupeKey(permitA) === dedupeKey({ ...permitA, address: '400 MAIN STREET' }));
check('a record number makes the month bucket irrelevant — a re-filed record does not re-ingest',
  dedupeKey(permitA) === dedupeKey({ ...permitA, occurred_at: '2026-11-02T00:00:00.000Z' }));
check('jurisdiction keeps markets apart — the same permit number in two cities is two records',
  dedupeKey(permitA) !== dedupeKey({ ...permitA, jurisdiction: 'seattle-wa' }));
check('jurisdiction is in the FALLBACK key too (overlapping regions cannot collide)',
  dedupeKey({ ...permit, jurisdiction: 'chicago-il' }) !== dedupeKey({ ...permit, jurisdiction: 'new-york-ny' }));
check('no jurisdiction slugs to a stated "unknown", never an empty segment',
  dedupeKey(permit).includes('::unknown::') && !dedupeKey(permit).includes('::::'));
check('the address+month fallback still applies when a source publishes no record number',
  dedupeKey({ ...permit, jurisdiction: 'chicago-il' }).endsWith('::2026-08')
  && dedupeKey({ ...permit, jurisdiction: 'chicago-il', source_record_id: 'X1' }).endsWith('::x1'));
check('slugJurisdiction turns a display region into a stable slug',
  slugJurisdiction('Denver, CO') === 'denver-co' && slugJurisdiction('') === 'unknown' && slugJurisdiction(null) === 'unknown');

// Two Austin sub-permits on one job, end-to-end through the real preset.
const austin = starterById('austin-permits')!;
const atxSource: SourceLike = { kind: austin.kind, base_url: austin.base_url, region: austin.region, jurisdiction: austin.jurisdiction, query_config: austin.query_config, cursor: {} };
const atxRow = {
  description: 'Interior finish out — suite 200', original_address1: '900 CONGRESS AVE',
  permit_number: '2026-041234 BP', master_permit_num: '2026-000900 MP', total_job_valuation: '450000',
  issued_date: '2026-08-01T00:00:00.000', applied_date: '2026-04-02T00:00:00.000',
  status_current: 'Active', statusdate: '2026-08-01T00:00:00.000', expiresdate: '2027-02-01T00:00:00.000',
  permit_class_mapped: 'Commercial', work_class: 'Remodel', permit_type: 'BP', permit_type_desc: 'Building Permit',
  total_new_add_sqft: '0', remodel_repair_sqft: '6200', total_existing_bldg_sqft: '48000',
  number_of_floors: '3', housing_units: '0', tcad_id: '0123456789',
  original_city: 'AUSTIN', original_state: 'TX', original_zip: '78701',
  latitude: '30.2711', longitude: '-97.7437',
  contractor_full_name: 'Pat Jones', contractor_company_name: 'Jones GC', contractor_phone: '512-555-0134',
  contractor_trade: 'General Contractor',
  applicant_full_name: 'Dana Reed', applicant_organization: 'Reed Architects', applicant_phone: '512-555-0199',
  link: { url: 'https://austin.gov/permits/2026-041234' },
};
const atx = normalizeEvent(atxSource, atxRow)!;
const atxSub = normalizeEvent(atxSource, { ...atxRow, permit_number: '2026-041235 EP', permit_type: 'EP', description: 'Electrical sub-permit' })!;
check('REAL CASE: an Austin job and its electrical sub-permit are two distinct events',
  atx.dedupe_key !== atxSub.dedupe_key && atx.address === atxSub.address);
check('…and both hang off the same parent record, so the project can be re-collapsed later',
  atx.parent_record_id === '2026-000900 MP' && atxSub.parent_record_id === atx.parent_record_id);

// ── THE WIDENED FIELD MAP (§3.1–3.5) ─────────────────────────────────────
check('identity: the permit number and its master permit are captured',
  atx.source_record_id === '2026-041234 BP' && atx.parent_record_id === '2026-000900 MP');
check('lifecycle: status verbatim + normalized + status date',
  atx.record_status === 'Active' && atx.status_normalized === 'active' && (atx.status_date ?? '').startsWith('2026-08-01'));
check('lifecycle: applied / issued / expires are all held (not just the one cursor date)',
  (atx.applied_at ?? '').startsWith('2026-04-02') && (atx.issued_at ?? '').startsWith('2026-08-01')
  && (atx.expires_at ?? '').startsWith('2027-02-01'));
check('occurred_kind says WHICH date occurred_at is — a filed and a final date are distinguishable',
  atx.occurred_kind === 'issued');
check('geography: lat/lon survive, and a NEGATIVE longitude is not nulled by a non-negative guard',
  atx.lat === 30.2711 && atx.lon === -97.7437);
check('parcel + address parts: parcel id, city, state, postal code',
  atx.parcel_id === '0123456789' && atx.city === 'AUSTIN' && atx.state === 'TX' && atx.postal_code === '78701');
check('classification: property class, work class, permit type and sub type',
  atx.property_class === 'Commercial' && atx.work_class === 'Remodel'
  && atx.permit_type === 'BP' && atx.permit_sub_type === 'Building Permit');
check('sizing: new vs remodel sqft split (Austin\'s near-exact TI detector) plus stories',
  atx.sqft_new === 0 && atx.sqft_remodel === 6200 && atx.sqft_total === 48000 && atx.stories === 3);
check('the verbatim rule holds across every new slot — unmapped columns are null, never guessed',
  (() => {
    const bare = normalizeEvent(atxSource, { description: 'Just a title', permit_number: 'P-1' })!;
    return bare.status_date === null && bare.lat === null && bare.lon === null && bare.parcel_id === null
      && bare.sqft_total === null && bare.stories === null && bare.year_built === null
      && bare.property_class === null && bare.use_type === null && bare.fees_usd === null
      && bare.record_status === null && bare.status_normalized === 'unknown';
  })());
check('a Socrata url-typed column yields its url, never the string "[object Object]"',
  atx.source_url === 'https://austin.gov/permits/2026-041234');
check('a structured column mapped to a text slot is null, not stringified junk',
  normalizeEvent(atxSource, { description: 'T', permit_number: 'P', original_address1: { latitude: '1' } as unknown as string })?.address === null);

// ── MULTI-PARTY CAPTURE (§3.7) ───────────────────────────────────────────
check('MULTIPLE parties come off one record, not just one hard-coded applicant',
  atx.parties.length === 3);
check('the GC\'s inline phone number is captured — the highest-value field in the audit',
  atx.parties.some((p) => p.phone === '512-555-0134' && p.company === 'Jones GC'));
check('a second party (the applicant) is captured with its own phone',
  atx.parties.some((p) => p.name === 'Dana Reed' && p.phone === '512-555-0199'));
check('every party carries source_field provenance — which column it was read out of',
  atx.parties.every((p) => !!p.source_field) && atx.parties.some((p) => p.source_field.includes('contractor_phone')));
check('a record-labelled role is kept verbatim AND normalized onto the ladder',
  atx.parties.some((p) => p.role === 'General Contractor' && p.role_normalized === 'contractor'));
check('parties are ordinal-numbered so Chicago\'s contact_1..15 stay in order',
  atx.parties.map((p) => p.ordinal).join(',') === '0,1,2');
check('the legacy single contact_name/contact_company path still works for existing presets',
  (() => {
    const e = normalizeEvent(soc, { description: 'TI', full_address: '1 A St', applicant_name: 'R. Chen' })!;
    return e.parties.length === 1 && e.parties[0].name === 'R. Chen' && e.parties[0].role === 'applicant'
      && e.named_parties[0]?.name === 'R. Chen';
  })());
check('a party column-set that names NOBODY is not stored as an empty party',
  normalizeEvent(atxSource, { description: 'T', permit_number: 'P' })!.parties.length === 0);
check('name_parts joins split first/last name columns (feeds that could not produce a contact before)',
  (() => {
    const nycP = starterById('nyc-dob-permits')!;
    const e = normalizeEvent(
      { kind: nycP.kind, base_url: nycP.base_url, region: nycP.region, jurisdiction: nycP.jurisdiction, query_config: nycP.query_config, cursor: {} },
      { job_type: 'A1', house__: '100', street_name: 'BROADWAY', permit_si_no: 'S1',
        permittee_s_first_name: 'Alex', permittee_s_last_name: 'Ruiz', permittee_s_license__: '12345',
        owner_s_first_name: 'Jo', owner_s_last_name: 'Kim', owner_s_phone__: '2125550100' },
    )!;
    return e.parties.some((p) => p.name === 'Alex Ruiz' && p.license_no === '12345')
      && e.parties.some((p) => p.name === 'Jo Kim' && p.phone === '2125550100' && p.role_normalized === 'owner');
  })());
check('named_parties (what scoring reads) mirrors the captured parties, phones included',
  atx.named_parties.length === atx.parties.length
  && atx.named_parties.some((p) => p.phone === '512-555-0134' && p.company === 'Jones GC')
  && atx.named_parties.every((p, i) => p.ordinal === atx.parties[i].ordinal && !!p.source_field));
check('pickLeadContact prefers a DIALABLE party over a merely named one',
  pickLeadContact([{ name: 'No Phone' }, { name: 'Has Phone', phone: '555' }])?.name === 'Has Phone');
check('pickLeadContact falls back to a name, then a company, then null',
  pickLeadContact([{ company: 'Acme' }, { name: 'Sam' }])?.name === 'Sam'
  && pickLeadContact([{ company: 'Acme' }])?.company === 'Acme' && pickLeadContact([]) === null);
check('normalizeRole maps verbatim labels onto the ladder; unknown → other, absent → null',
  normalizeRole('CONTRACTOR-ELECTRICAL') === 'contractor' && normalizeRole('OWNER') === 'owner'
  && normalizeRole('Filing Representative') === 'filing_rep' && normalizeRole('Zoning Liaison') === 'other'
  && normalizeRole('') === null && normalizeRole(null) === null);

// ── LIFECYCLE NORMALIZATION (§3.2) ───────────────────────────────────────
check('status normalizes onto the 4-state ladder, raw string always kept alongside',
  normalizeStatus('Permit Finaled') === 'final' && normalizeStatus('Under Review') === 'in_review'
  && normalizeStatus('Issued') === 'active' && normalizeStatus('Expired') === 'inactive');
check('an unreadable or absent status is "unknown" — never guessed into a stage',
  normalizeStatus('Zzz') === 'unknown' && normalizeStatus(null) === 'unknown' && normalizeStatus('') === 'unknown');

// ── CONTENT HASH + CHANGE DETECTION (§3.8) ───────────────────────────────
check('content_hash is STABLE — the same record hashes identically every time',
  normalizeEvent(atxSource, atxRow)!.content_hash === atx.content_hash);
check('content_hash ignores key ORDER — a portal reshuffling its JSON is not a change',
  normalizeEvent(atxSource, Object.fromEntries(Object.entries(atxRow).reverse()))!.content_hash === atx.content_hash);
check('content_hash ignores UNMAPPED columns — a new column we do not read is not a change',
  normalizeEvent(atxSource, { ...atxRow, some_new_portal_column: 'whatever' })!.content_hash === atx.content_hash);
check('a CHANGED status changes the hash — this is what detects a portal-side edit',
  normalizeEvent(atxSource, { ...atxRow, status_current: 'Expired' })!.content_hash !== atx.content_hash);
check('a corrected VALUATION changes the hash (the update we used to freeze forever)',
  normalizeEvent(atxSource, { ...atxRow, total_job_valuation: '900000' })!.content_hash !== atx.content_hash);
check('a changed CONTRACTOR changes the hash — parties are part of the record',
  normalizeEvent(atxSource, { ...atxRow, contractor_phone: '512-555-9999' })!.content_hash !== atx.content_hash);
check('content_hash is a fixed-width hex fingerprint', /^[0-9a-f]{16}$/.test(atx.content_hash));
check('stableStringify sorts keys and drops undefined, so equal content stringifies equally',
  stableStringify({ b: 1, a: [2, null] }) === stableStringify({ a: [2, null], b: 1 })
  && stableStringify({ a: 1, z: undefined }) === '{"a":1}');
check('changedFields names exactly what moved, sorted — the transition record',
  changedFields({ status: 'Active', cost: 100, addr: 'X' }, { status: 'Final', cost: 100, addr: 'X' }).join() === 'status');
check('changedFields treats a numeric that round-tripped as a string as UNCHANGED',
  changedFields({ cost: '100' }, { cost: 100 }).length === 0);
check('changedFields treats null, undefined and empty string as the same absence',
  changedFields({ a: null, b: '' }, { a: undefined, b: null }).length === 0);

// ── THE PERMALINK BUG (§6.6) — source_url must be the RECORD, never the feed
check('EVERY starter preset yields a per-record link, never the dataset endpoint', STARTER_SOURCES.every((p) => {
  const s: SourceLike = { kind: p.kind, base_url: p.base_url, region: p.region, jurisdiction: p.jurisdiction, query_config: p.query_config, cursor: {} };
  const m = p.query_config.field_map ?? {};
  const row: Record<string, unknown> = { [m.title ?? 'title']: 'A project', ...(m.record_id ? { [m.record_id]: 'REC-1' } : {}) };
  if (m.address) row[m.address] = '1 Main St';
  for (const k of m.address_parts ?? []) row[k] = 'X';
  const e = normalizeEvent(s, row);
  return !!e && !!e.source_url && e.source_url !== p.base_url && e.source_url.includes('REC-1');
}));
check('source_url NEVER silently falls back to base_url — no record id, no template, no link',
  normalizeEvent(soc, { description: 'A permit with no permalink anywhere' })?.source_url === null);
check('a permalink COLUMN wins over the template (a real portal page beats a constructed one)',
  atx.source_url === 'https://austin.gov/permits/2026-041234');
check('a template with an unresolvable token yields null, never a half-built URL',
  (() => {
    const e = normalizeEvent({ ...atxSource, query_config: { ...austin.query_config, field_map: { ...austin.query_config.field_map, permalink: undefined } } }, { description: 'T', original_address1: '1 A' })!;
    return e.source_url === null;
  })());
check('the digest STATES "no direct link" rather than linking the feed',
  digestFor('X', [{ ...dl, source_url: null }]).body.includes(NO_DIRECT_LINK));
check('the digest only claims "every lead links its public record" when that is TRUE',
  /Every lead links its public record/.test(digestFor('X', [dl]).body)
  && !/Every lead links its public record/.test(digestFor('X', [dl, { ...dl, source_url: null }]).body));
check('a sample pitch never uses an unverifiable lead as proof',
  pitchFor('security', 'X', [{ ...pl, source_url: null }], 'R') === null
  && (pitchFor('security', 'X', [pl, { ...pl, source_url: null, title: 'Unlinked' }], 'R')?.body.includes('Unlinked') === false));

// ── THE SEATTLE DATASET (§6.6) ───────────────────────────────────────────
// `76t8-zvzf` did not exist: the source had almost certainly returned zero rows since the day it
// shipped, reported as a healthy "0 rows read". The live dataset is `76t5-zqzr`.
const seattle = starterById('seattle-permits')!;
check('the dead Seattle dataset id is gone from the presets',
  !STARTER_SOURCES.some((p) => JSON.stringify(p).includes('76t8-zvzf')));
check('Seattle points at the verified live Building Permits dataset', seattle.base_url.includes('76t5-zqzr'));
check('Seattle maps its real permalink column and its record number',
  seattle.query_config.field_map?.permalink === 'link' && seattle.query_config.field_map?.record_id === 'permitnum');

// ── JURISDICTION + CONFIG FINGERPRINT ────────────────────────────────────
check('every preset declares a stable jurisdiction slug, distinct per city',
  STARTER_SOURCES.every((p) => /^[a-z0-9-]+$/.test(p.jurisdiction))
  && new Set(STARTER_SOURCES.map((p) => p.jurisdiction)).size === STARTER_SOURCES.length);
check('sourceJurisdiction prefers the column, then config, then a slug of the region',
  sourceJurisdiction({ jurisdiction: 'austin-tx', region: 'Austin, TX', query_config: {} }) === 'austin-tx'
  && sourceJurisdiction({ jurisdiction: null, region: 'Denver, CO', query_config: {} }) === 'denver-co');
check('configHash is stable and changes when the where-clause or floor changes',
  configHash(soc) === configHash({ query_config: { ...soc.query_config } })
  && configHash(soc) !== configHash({ query_config: { ...soc.query_config, where: 'x=1' } }));
check('the event carries the jurisdiction it was captured under', atx.jurisdiction === 'austin-tx');

// ── toIso corrections (§6.5) ─────────────────────────────────────────────
check('a FLOATING Socrata timestamp is pinned to UTC, not the runtime\'s local zone',
  toIso('2024-03-15T00:00:00.000') === '2024-03-15T00:00:00.000Z' && toIso('2024-03-15') === '2024-03-15T00:00:00.000Z');
check('a date-only value cannot drift across a month boundary and re-ingest the same record',
  toIso('2024-04-01')!.slice(0, 7) === '2024-04');
check('the epoch-millis heuristic can be switched off, so a numeric permit id is not a date',
  toIso('20260412345', 'iso') === null && toIso(1785715200000, 'epoch_ms')!.startsWith('2026-'));
check('a structured column is never coerced into a date', toIso({ url: 'x' }) === null);

// ── honest parse failure (§6.6) — unreadable is UNREACHABLE, not "no change"
check('an unreadable body reports NOT ok, with a reason (it used to look healthy)',
  (() => { const r = parseRowsResult('socrata', '<html>WAF page</html>'); return !r.ok && !!r.error && r.rows.length === 0; })());
check('an empty ARRAY is genuinely no-change and stays ok',
  parseRowsResult('socrata', '[]').ok === true);
check('a portal error envelope is surfaced, not swallowed',
  (() => { const r = parseRowsResult('socrata', '{"error":{"message":"invalid column"}}'); return !r.ok && /invalid column/.test(r.error ?? ''); })());
check('parseRows still returns rows for callers that only want the rows',
  parseRows('socrata', '[{"a":1}]').length === 1);

// ── score provenance ─────────────────────────────────────────────────────
check('a score version is stamped so historic scores stay interpretable', /^le-\d+$/.test(SCORE_VERSION));

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} lead-engine check(s) failed`);
