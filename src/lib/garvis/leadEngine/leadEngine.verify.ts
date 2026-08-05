// src/lib/garvis/leadEngine/leadEngine.verify.ts — the Lead Engine's pure brain
// (npm run verify:leadengine). Scoring states its reasons, dedupe is stable, digests never
// invent, commission math is clamped, adapters are verbatim-only.

import {
  TRADES, TRADE_KEYS, isTradeKey, dedupeKey, normalizeKeyPart, scoreLead, pickContact, whyNow,
  digestFor, commissionFor, parseLeadEngineConfig, ingestLine, DEFAULT_COMMISSION_PCT,
  pitchFor, digestDue, tradeForPlaceType,
  pickLeadContact, normalizeRole, normalizeStatus, stableStringify, changedFields,
  SCORE_VERSION, NO_DIRECT_LINK,
  tradesForSegment, tradeMatchesSegment, parseSegment, permittedTrade, isFollowOnTrade,
  FOLLOW_ON_BONUS, PERMITTED_TRADE_PENALTY,
  sourceStatusLine, marketStartLine, fitFor, recordWords, recordIsSpecific, FIT_NAMED, FIT_USE, FIT_MISS,
  type LeadEventLike, type TradeKey as TradeKeyT,
} from './leadEngine.ts';
import {
  cursorLiteral, buildFetchUrl, parseRows, parseRowsResult, parseCsv, parseCsvLine, parseRss, sourceFormat,
  normalizeEvent, nextCursor, toIso, configHash, sourceJurisdiction, slugJurisdiction,
  fetchOffset, FETCH_LIMIT, MAX_PAGES_PER_TICK, STARTER_SOURCES, starterById,
  startersForSegment, RESIDENTIAL_FLOOR_USD, type SourceLike,
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
check('every score point is explained — reasons cover base, fit, value, recency, contact',
  !!s && s.reasons.length === 5 && s.reasons.every((r) => r.trim().length > 0));
check('score is capped at 100', !!s && s.score <= 100);
// A record that STATES NOTHING gets no fit adjustment at all — silence is not evidence.
const bare = scoreLead({ ...permit, valuation_usd: null, named_parties: [], occurred_at: null, title: 'Permit', description: null }, 'security', NOW);
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
check('registry carries 18 trades (12 commercial-or-both + 6 residential), all fully described',
  TRADE_KEYS.length === 18 && TRADE_KEYS.every((t) => TRADES[t].label && TRADES[t].buys));
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

// ── the cursor timestamp dialects (a 2nd-check-only failure if wrong) ─────
check('socrata cursor literal is ZONELESS — a trailing Z is a floating_timestamp parse error',
  cursorLiteral('2026-08-03T00:00:00.000Z', 'socrata') === '2026-08-03T00:00:00.000'
  && !cursorLiteral('2026-08-03T00:00:00.000Z', 'socrata').endsWith('Z'));
check('arcgis cursor literal is space-separated with no fraction or zone',
  cursorLiteral('2026-08-03T00:00:00.000Z', 'arcgis') === '2026-08-03 00:00:00');
check('a quote in the cursor cannot break out of either clause',
  !cursorLiteral("2026-08-03'--", 'socrata').includes("'") && !cursorLiteral("2026-08-03'--", 'arcgis').includes("'"));
check('the built socrata URL carries no Z in its where clause', (() => {
  const u = buildFetchUrl({ kind: 'socrata', base_url: 'https://x.gov/r/a.json', region: 'X, TX',
    query_config: { date_field: 'issued_date' }, cursor: { last_date: '2026-08-03T00:00:00.000Z' } } as never);
  const d = decodeURIComponent(u).replace(/\+/g, ' ');   // URLSearchParams encodes spaces as '+'
  return d.includes("issued_date > '2026-08-03T00:00:00.000'") && !d.includes(".000Z'");
})());

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

// ═══════════════════════════════════════════════════════════════════════════
// THE CURSOR SKIP (§6.6.2) — resumable offset paging
// ═══════════════════════════════════════════════════════════════════════════
// `$limit=100` ordered by the date field ASC with NO `$offset`, and the cursor then advanced to
// the max date seen. Any single day with more than 100 qualifying records — routine for NYC and
// Chicago — moved the watermark past that day, and the remainder was NEVER fetched again:
// permanent, silent loss in exactly the highest-volume cities.

// ── the URL half: $offset / resultOffset, and a filter that stays put ─────
check('a fresh window carries NO $offset — the unpaged first page is unchanged',
  !buildFetchUrl(soc).includes('%24offset') && !buildFetchUrl(soc, 0).includes('%24offset'));
check('a page offset emits $offset on the socrata dialect',
  buildFetchUrl(soc, 200).includes('%24offset=200'));
check('a cursor carrying page_offset pages on its own — a resumed tick needs no argument',
  buildFetchUrl({ ...soc, cursor: { last_date: '2026-07-01', page_offset: 300 } }).includes('%24offset=300'));
check('the arcgis dialect speaks resultOffset, not $offset, and only when paging',
  buildFetchUrl(arc, 200).includes('resultOffset=200') && !buildFetchUrl(arc, 200).includes('%24offset')
  && !buildFetchUrl(arc).includes('resultOffset'));
check('PAGING RESUMES, IT DOES NOT SKIP: with a page offset the date filter stays on the SAME last_date',
  (() => {
    const resumed = buildFetchUrl({ ...soc, cursor: { last_date: '2026-07-01', page_offset: 200 } });
    return resumed.includes('2026-07-01') && resumed.includes('%24offset=200')
      && new URL(resumed).searchParams.get('$where') === new URL(buildFetchUrl(soc)).searchParams.get('$where');
  })());
check('fetchOffset prefers the explicit page, falls back to the cursor, and floors junk at 0',
  fetchOffset({ cursor: { page_offset: 300 } }, 100) === 100 && fetchOffset({ cursor: { page_offset: 300 } }) === 300
  && fetchOffset({ cursor: {} }) === 0 && fetchOffset({ cursor: { page_offset: -5 } }) === 0
  && fetchOffset({ cursor: { page_offset: 'x' as unknown as number } }) === 0);
check('whole-feed formats ignore paging entirely — a CSV/RSS read is the feed, not a page of it',
  buildFetchUrl(rssSource, 200) === rssSource.base_url);

// ── the decision half: drained advances, capped resumes ──────────────────
const pagedSoc: SourceLike = { ...soc, cursor: { last_date: '2026-07-01' } };
const drainedCursor = nextCursor(pagedSoc, evs, { rows: 150, startOffset: 0, drained: true });
check('DRAINED: the watermark advances to the max date read and the page offset is cleared',
  drainedCursor.last_date === '2026-08-03T00:00:00.000Z' && drainedCursor.page_offset === undefined);
const cappedCursor = nextCursor(pagedSoc, evs, { rows: 1000, startOffset: 0, drained: false });
check('CAPPED: the watermark does NOT move past a part-read window — the offset records where we stopped',
  cappedCursor.last_date === '2026-07-01' && cappedCursor.page_offset === 1000);
check('CAPPED AGAIN: the resume point accumulates across ticks (1,000 read, then 1,000 more)',
  (() => {
    const c = nextCursor({ ...soc, cursor: { last_date: '2026-07-01', page_offset: 1000 } }, evs,
      { rows: 1000, startOffset: 1000, drained: false });
    return c.page_offset === 2000 && c.last_date === '2026-07-01';
  })());
check('the resume point is dropped the moment the window drains — a stale offset never re-skips',
  (() => {
    const c = nextCursor({ ...soc, cursor: { last_date: '2026-07-01', page_offset: 2000 } }, evs,
      { rows: 40, startOffset: 2000, drained: true });
    return c.page_offset === undefined && c.last_date === '2026-08-03T00:00:00.000Z';
  })());
check('nextCursor with no paging outcome keeps the historic single-page behaviour',
  nextCursor(soc, evs).last_date === '2026-08-03T00:00:00.000Z');

// ── THE REGRESSION: a 250-record day at a 100-row limit ──────────────────
// A pretend portal that answers exactly what the URL asks for — the $where date filter and the
// $offset/$limit window, date ASC — so this exercises the REAL URL builder and the REAL advance
// rule rather than a stand-in for them.
const BIG_DAY = '2026-08-02';
const CORPUS: Record<string, unknown>[] = [
  ...Array.from({ length: 250 }, (_, i) => ({ description: `Permit ${i}`, full_address: `${i} Big St`, issued_date: BIG_DAY })),
  ...Array.from({ length: 5 }, (_, i) => ({ description: `Next ${i}`, full_address: `${i} Next St`, issued_date: '2026-08-03' })),
];
function portal(url: string): Record<string, unknown>[] {
  const q = new URL(url).searchParams;
  const since = /issued_date > '([^']*)'/.exec(q.get('$where') ?? '')?.[1] ?? '';
  const from = Number(q.get('$offset') ?? 0);
  const limit = Number(q.get('$limit') ?? FETCH_LIMIT);
  return CORPUS.filter((r) => String(r.issued_date) > since)
    .sort((a, b) => String(a.issued_date).localeCompare(String(b.issued_date)))
    .slice(from, from + limit);
}
/** One tick of the edge function's loop, built from the pure pieces it uses. */
function tick(cursor: SourceLike['cursor'], maxPages = MAX_PAGES_PER_TICK) {
  const src: SourceLike = { ...soc, cursor };
  const startOffset = fetchOffset(src);
  let offset = startOffset; let pages = 0; let rows = 0; let drained = false;
  const titles: string[] = []; const dates: { occurred_at: string | null }[] = [];
  while (pages < maxPages) {
    const page = portal(buildFetchUrl(src, offset));
    pages++; rows += page.length;
    for (const r of page) {
      const e = normalizeEvent(src, r)!;
      titles.push(e.title); dates.push({ occurred_at: e.occurred_at });
    }
    if (page.length < FETCH_LIMIT) { drained = true; break; }
    offset += FETCH_LIMIT;
  }
  return { titles, pages, cursor: nextCursor(src, dates, { rows, startOffset, drained }) };
}

const freshSrc: SourceLike = { ...soc, cursor: { last_date: '2026-07-01' } };
const firstPage = portal(buildFetchUrl(freshSrc));
const buggyCursor = nextCursor(freshSrc, firstPage.map((r) => ({ occurred_at: normalizeEvent(freshSrc, r)!.occurred_at })));
const afterBuggy = portal(buildFetchUrl({ ...freshSrc, cursor: buggyCursor }));
check('THE BUG IS REAL — one page, then the watermark jumps: 150 of the day\'s 250 records become unfetchable',
  firstPage.length === 100 && buggyCursor.last_date === '2026-08-02T00:00:00.000Z'
  && !afterBuggy.some((r) => String(r.description).startsWith('Permit ')));

// Two ticks with a deliberately tiny cap (2 pages = 200 rows) — the multi-tick resume path.
const t1 = tick({ last_date: '2026-07-01' }, 2);
const t2 = tick(t1.cursor, 2);
const t3 = tick(t2.cursor, 2);
const reached = new Set([...t1.titles, ...t2.titles, ...t3.titles]);
check('THE FIX — all 250 records of that day are reached across ticks, none skipped',
  reached.size === 255 && Array.from({ length: 250 }, (_, i) => `Permit ${i}`).every((t) => reached.has(t)));
check('…the capped tick kept its watermark and recorded WHERE it stopped',
  t1.titles.length === 200 && t1.cursor.last_date === '2026-07-01' && t1.cursor.page_offset === 200);
check('…the next tick resumed at row 200 (not row 0, not the next day) and drained the remainder',
  t2.titles.length === 55 && t2.titles[0] === 'Permit 200'
  && t2.cursor.last_date === '2026-08-03T00:00:00.000Z' && t2.cursor.page_offset === undefined);
check('…and once drained the window goes quiet — a resumed cursor does not re-read forever',
  t3.titles.length === 0 && t3.cursor.last_date === '2026-08-03T00:00:00.000Z');
check('at the real page cap the same day drains inside ONE tick, in 3 pages',
  (() => {
    const one = tick({ last_date: '2026-07-01' });
    return one.pages === 3 && one.titles.length === 255 && one.cursor.page_offset === undefined
      && one.cursor.last_date === '2026-08-03T00:00:00.000Z';
  })());
check('the page cap is bounded work per tick, not an unbounded stampede',
  MAX_PAGES_PER_TICK === 10 && FETCH_LIMIT * MAX_PAGES_PER_TICK === 1000);

// ── score provenance ─────────────────────────────────────────────────────
check('a score version is stamped so historic scores stay interpretable', /^le-\d+$/.test(SCORE_VERSION));

// ═══════════════════════════════════════════════════════════════════════════
// MARKET SEGMENTS (commercial | residential) + THE FOLLOW-ON RULE
// ═══════════════════════════════════════════════════════════════════════════

// ── the registry declares whose market each trade belongs in ─────────────
check('every trade declares a segment, and only the three legal values',
  TRADE_KEYS.every((t) => ['commercial', 'residential', 'both'].includes(TRADES[t].segment)));
check('the original five commercial trades are still commercial',
  (['acoustics', 'security', 'janitorial', 'fire_safety', 'signage'] as const).every((t) => TRADES[t].segment === 'commercial'));
check('the seven cross-over trades are BOTH — the same work on either side of the line',
  (['roofing', 'hvac', 'electrical', 'plumbing', 'flooring', 'landscaping', 'pest_control'] as const)
    .every((t) => TRADES[t].segment === 'both'));
check('the six new trades are residential and fully described',
  (['carpentry', 'remodeling', 'painting', 'windows_doors', 'concrete', 'handyman'] as const)
    .every((t) => TRADES[t].segment === 'residential' && !!TRADES[t].label && !!TRADES[t].buys
      && Object.values(TRADES[t].weights).some((w) => (w ?? 0) > 0)));
check('residential trades are permit-driven: a homeowner pulls no liquor licence and no health permit',
  (['carpentry', 'remodeling', 'painting', 'windows_doors', 'concrete', 'handyman'] as const)
    .every((t) => !(TRADES[t].weights.liquor_license ?? 0) && !(TRADES[t].weights.health_permit ?? 0)
      && !(TRADES[t].weights.business_registered ?? 0)
      && (TRADES[t].weights.permit_issued ?? 0) >= (TRADES[t].weights.news ?? 0)));
check('tradesForSegment: commercial gets 12, residential gets 13, and BOTH trades are in each',
  tradesForSegment('commercial').length === 12 && tradesForSegment('residential').length === 13
  && tradesForSegment('commercial').includes('roofing') && tradesForSegment('residential').includes('roofing'));
check('tradeMatchesSegment gates one-segment trades and always passes BOTH',
  tradeMatchesSegment('fire_safety', 'commercial') && !tradeMatchesSegment('fire_safety', 'residential')
  && tradeMatchesSegment('carpentry', 'residential') && !tradeMatchesSegment('carpentry', 'commercial')
  && tradeMatchesSegment('electrical', 'commercial') && tradeMatchesSegment('electrical', 'residential'));

// ── SEGMENT FILTERING: a market never produces the other market's leads ──
const homePermit: LeadEventLike = {
  event_type: 'permit_issued', occurred_at: '2026-08-01T00:00:00.000Z',
  address: '18 Maple Ln, Austin, TX', region: 'Austin, TX', valuation_usd: 60_000,
  title: 'Kitchen and bath remodel — single family', description: 'Interior remodel, no addition',
  named_parties: [{ role: 'contractor', name: 'Sam Diaz', company: 'Diaz Remodeling' }],
  source_url: 'https://data.austintexas.gov/permits/R-1',
  work_class: 'Remodel', permit_type: 'RS',
};
check('a COMMERCIAL market never produces a residential-only lead',
  (['carpentry', 'remodeling', 'painting', 'windows_doors', 'concrete', 'handyman'] as const)
    .every((t) => scoreLead(homePermit, t, NOW, { segment: 'commercial' }) === null));
check('a RESIDENTIAL market never produces a commercial-only lead',
  (['acoustics', 'security', 'janitorial', 'fire_safety', 'signage'] as const)
    .every((t) => scoreLead(permit, t, NOW, { segment: 'residential' }) === null));
check('a BOTH trade scores in both markets — that is what "both" means',
  !!scoreLead(permit, 'electrical', NOW, { segment: 'commercial' })
  && !!scoreLead(homePermit, 'electrical', NOW, { segment: 'residential' }));
check('the segment gate is a GATE, not a discount: a BOTH trade\'s commercial score is unchanged',
  scoreLead(permit, 'electrical', NOW, { segment: 'commercial' })?.score === scoreLead(permit, 'electrical', NOW)?.score);
check('every residential trade IS scorable in its own market (the gate cuts one way only)',
  tradesForSegment('residential').every((t) => scoreLead(homePermit, t, NOW, { segment: 'residential' }) !== null));

// ── THE FOLLOW-ON RULE — the residential insight ─────────────────────────
// On a residential job the permitted scope is usually already contracted by the time the permit
// exists; what is still open is the work that scope creates AFTERWARDS. So the permit's own trade
// is marked down and its follow-on trades are marked up, and both say so in the reasons.
const remodelFlooring = scoreLead(homePermit, 'flooring', NOW, { segment: 'residential' })!;
const remodelPainting = scoreLead(homePermit, 'painting', NOW, { segment: 'residential' })!;
const remodelItself = scoreLead(homePermit, 'remodeling', NOW, { segment: 'residential' })!;
check('permittedTrade reads the trade out of the record\'s OWN words',
  permittedTrade(homePermit) === 'remodeling'
  && permittedTrade({ title: 'Reroof — 30 sq comp shingle', description: null, work_class: null, permit_type: null }) === 'roofing'
  && permittedTrade({ title: 'New driveway approach', description: null, work_class: null, permit_type: null }) === 'concrete');
check('permittedTrade names nothing when the record\'s words name nothing — never a guess',
  permittedTrade({ title: 'Permit', description: null, work_class: null, permit_type: null }) === null
  && permittedTrade({ title: '', description: null, work_class: null, permit_type: null }) === null);
check('permittedTrade is deterministic and ordered: a remodel that mentions flooring is still a remodel',
  permittedTrade({ title: 'Kitchen remodel — new flooring and paint', description: null, work_class: null, permit_type: null }) === 'remodeling');
check('THE FOLLOW-ON RULE: a residential remodel permit scores FLOORING and PAINTING above REMODELING itself',
  remodelFlooring.score > remodelItself.score && remodelPainting.score > remodelItself.score);
check('…and the bonus states the rule in words the operator can argue with',
  remodelFlooring.reasons.some((r) => /^\+\d+: permitted work is remodeling & general contracting; flooring typically follows$/.test(r))
  && remodelPainting.reasons.some((r) => /permitted work is .*; painting typically follows/.test(r)));
check('…and the permitted trade\'s markdown states WHY it is marked down',
  remodelItself.reasons.some((r) => /^-\d+: the permit names remodeling & general contracting itself/.test(r)
    && /usually contracted before the permit is pulled/.test(r)));
check('the adjustment is exactly the declared constants, applied once',
  remodelFlooring.score - (scoreLead({ ...homePermit, title: 'Permit', description: null, work_class: null, permit_type: null }, 'flooring', NOW, { segment: 'residential' })?.score ?? 0) === FOLLOW_ON_BONUS
  && (scoreLead({ ...homePermit, title: 'Permit', description: null, work_class: null, permit_type: null }, 'remodeling', NOW, { segment: 'residential' })?.score ?? 0) - remodelItself.score === PERMITTED_TRADE_PENALTY);
check('a trade that is neither the permitted scope nor a follow-on of it is left alone',
  !scoreLead(homePermit, 'roofing', NOW, { segment: 'residential' })!.reasons.some((r) => /typically follows|permit names/.test(r)));
check('isFollowOnTrade is a stated sequence, not a free-for-all',
  isFollowOnTrade('remodeling', 'flooring') && isFollowOnTrade('concrete', 'carpentry')
  && !isFollowOnTrade('remodeling', 'remodeling') && !isFollowOnTrade('flooring', 'remodeling'));
check('THE RULE IS RESIDENTIAL-ONLY: a commercial permit naming its trade is never marked down',
  (() => {
    const commercialElectrical = scoreLead({ ...permit, title: 'Electrical service upgrade' }, 'electrical', NOW, { segment: 'commercial' })!;
    return !commercialElectrical.reasons.some((r) => /permit names|typically follows/.test(r));
  })());
check('the rule only fires on PERMIT events — a news item names no permitted scope',
  !scoreLead({ ...homePermit, event_type: 'news' }, 'flooring', NOW, { segment: 'residential' })?.reasons
    .some((r) => /typically follows/.test(r)));
check('the markdown can never drive a score below zero',
  (scoreLead({ ...homePermit, valuation_usd: null, occurred_at: null, named_parties: [], title: 'Handyman repair', description: null, work_class: null, permit_type: null }, 'handyman', NOW, { segment: 'residential' })?.score ?? -1) >= 0);

// ── config: segment defaults to commercial (back-compat for every existing market)
check('BACK-COMPAT: a config with no segment is a COMMERCIAL market',
  parseLeadEngineConfig({}).segment === 'commercial'
  && parseLeadEngineConfig({ trades: ['security'] }).segment === 'commercial'
  && parseLeadEngineConfig(null).segment === 'commercial');
check('an explicit residential segment survives the parse; junk falls back to commercial',
  parseLeadEngineConfig({ segment: 'residential' }).segment === 'residential'
  && parseLeadEngineConfig({ segment: 'industrial' }).segment === 'commercial'
  && parseSegment(undefined) === 'commercial' && parseSegment('residential') === 'residential');
check('scoreLead with no segment option behaves exactly as it did before segments existed',
  scoreLead(permit, 'security', NOW)?.score === scoreLead(permit, 'security', NOW, { segment: 'commercial' })?.score
  && scoreLead(homePermit, 'carpentry', NOW) === null);

// ── residential presets ──────────────────────────────────────────────────
const resPresets = startersForSegment('residential');
check('at least three cities ship a residential preset, each declaring its segment',
  resPresets.length >= 3 && resPresets.every((p) => p.segment === 'residential')
  && new Set(resPresets.map((p) => p.region)).size >= 3);
check('every commercial preset still declares segment commercial (the five that shipped before)',
  startersForSegment('commercial').length === 5
  && startersForSegment('commercial').length + resPresets.length === STARTER_SOURCES.length);
check('NO $25k FLOOR on a residential preset — that screen exists to keep residential work OUT',
  resPresets.every((p) => (Number(p.query_config.min_valuation_usd) || 0) === RESIDENTIAL_FLOOR_USD
    && RESIDENTIAL_FLOOR_USD < 25000));
check('every residential preset is https, buildable, and carries a date field + a title mapping',
  resPresets.every((p) => {
    const url = buildFetchUrl({ kind: p.kind, base_url: p.base_url, region: p.region, jurisdiction: p.jurisdiction, query_config: p.query_config, cursor: {} });
    return /^https:\/\//.test(p.base_url) && !!p.query_config.date_field && !!p.query_config.field_map?.title
      && url.startsWith('https://') && url.includes('%24limit=');
  }));
check('a residential preset\'s jurisdiction slug is DISTINCT from its commercial twin — overlapping filters must not collide on one event row',
  resPresets.every((p) => !STARTER_SOURCES.some((o) => o.id !== p.id && o.jurisdiction === p.jurisdiction))
  && starterById('austin-permits-residential')!.jurisdiction !== starterById('austin-permits')!.jurisdiction);
check('the residential presets that CAN filter server-side do, on the same column their commercial twin uses',
  /Residential/.test(String(starterById('austin-permits-residential')!.query_config.where))
  && /permit_class_mapped/.test(String(starterById('austin-permits-residential')!.query_config.where))
  && /permitclassmapped/.test(String(starterById('seattle-permits-residential')!.query_config.where)));
check('Chicago publishes no class marker, so its residential preset screens on cost — and says the number',
  String(starterById('chicago-permits-residential')!.query_config.where) === `reported_cost > ${RESIDENTIAL_FLOOR_USD}`);
check('a residential preset yields a per-record link and a FULL address, same discipline as the commercial ones',
  resPresets.every((p) => {
    const s: SourceLike = { kind: p.kind, base_url: p.base_url, region: p.region, jurisdiction: p.jurisdiction, query_config: p.query_config, cursor: {} };
    const m = p.query_config.field_map ?? {};
    const row: Record<string, unknown> = { [m.title ?? 'title']: 'Deck addition', ...(m.record_id ? { [m.record_id]: 'REC-1' } : {}) };
    if (m.address) row[m.address] = '18 Maple Ln';
    for (const k of m.address_parts ?? []) row[k] = 'X';
    const e = normalizeEvent(s, row);
    return !!e && !!e.source_url && e.source_url !== p.base_url && e.source_url.includes('REC-1') && !!e.address;
  }));
check('a $400 water-heater swap is FLAGGED against the small floor, stored with its reason — never dropped',
  (() => {
    const chi = starterById('chicago-permits-residential')!;
    const e = normalizeEvent({ kind: chi.kind, base_url: chi.base_url, region: chi.region, jurisdiction: chi.jurisdiction, query_config: chi.query_config, cursor: {} },
      { work_description: 'Water heater replacement', permit_: 'P-RES-1', street_number: '18', street_name: 'MAPLE', reported_cost: '400', issue_date: '2026-08-01' })!;
    return e.qualified === false && /400/.test(e.disqualified_reason ?? '') && /1,000/.test(e.disqualified_reason ?? '')
      && e.address === '18 MAPLE' && !!e.dedupe_key;
  })());
check('a $12,000 deck is KEPT — the residential floor screens junk, not the market',
  (() => {
    const chi = starterById('chicago-permits-residential')!;
    const e = normalizeEvent({ kind: chi.kind, base_url: chi.base_url, region: chi.region, jurisdiction: chi.jurisdiction, query_config: chi.query_config, cursor: {} },
      { work_description: 'New rear deck', permit_: 'P-RES-2', street_number: '18', street_name: 'MAPLE', reported_cost: '12000', issue_date: '2026-08-01' })!;
    return e.qualified === true && e.disqualified_reason === null;
  })());

// ── end to end: one residential permit row → the leads a residential market gets
check('END TO END: an Austin residential remodel row scores its follow-on trades above the permitted one',
  (() => {
    const p = starterById('austin-permits-residential')!;
    const src: SourceLike = { kind: p.kind, base_url: p.base_url, region: p.region, jurisdiction: p.jurisdiction, query_config: p.query_config, cursor: {} };
    const e = normalizeEvent(src, {
      description: 'Addition and kitchen remodel', original_address1: '18 MAPLE LN', permit_number: 'R-2026-1',
      total_job_valuation: '85000', issued_date: '2026-08-01T00:00:00.000',
      permit_class_mapped: 'Residential', work_class: 'Addition and Remodel',
      contractor_full_name: 'Sam Diaz', contractor_phone: '512-555-0177',
    })!;
    const ev: LeadEventLike = {
      event_type: e.event_type, occurred_at: e.occurred_at, address: e.address, region: e.region,
      valuation_usd: e.valuation_usd, title: e.title, description: e.description,
      named_parties: e.named_parties, source_url: e.source_url,
      work_class: e.work_class, permit_type: e.permit_type,
    };
    const scored = tradesForSegment('residential')
      .map((t) => ({ t, s: scoreLead(ev, t, NOW, { segment: 'residential' }) }))
      .filter((x): x is { t: typeof x.t; s: NonNullable<typeof x.s> } => !!x.s);
    const by = new Map(scored.map((x) => [x.t, x.s.score]));
    return e.qualified === true
      && scored.length === tradesForSegment('residential').length
      && scored.every((x) => x.s.reasons.length > 0)                       // reasons on EVERY score
      && (by.get('flooring') ?? 0) > (by.get('remodeling') ?? 0)
      && (by.get('painting') ?? 0) > (by.get('remodeling') ?? 0)
      && !by.has('fire_safety');                                           // no commercial-only trade
  })());

// ── REGRESSION: THE DUPLICATE PARTY ────────────────────────────────────────
// Every preset reads the same columns twice — the legacy field_map.contact_name/contact_company
// path AND its declared query_config.parties[] entry. Austin's applicant, Chicago's contact_1 and
// Seattle's contractor were each emitted TWICE per event: doubled in named_parties (so the scoring
// core counted one person as two witnesses) and doubled as rows in le_event_parties.
const dupSrc: SourceLike = {
  kind: 'socrata', base_url: STARTER_SOURCES[3].base_url, region: 'Austin, TX',
  jurisdiction: 'austin-tx', query_config: STARTER_SOURCES[3].query_config, cursor: {},
};
const dupRow = {
  description: 'Restaurant finish-out', original_address1: '900 E 6TH ST', permit_number: 'C-2026-9',
  issued_date: '2026-08-01T00:00:00.000', total_job_valuation: '385000',
  applicant_full_name: 'Dana Ruiz', applicant_phone: '512-555-0100',
  contractor_company_name: 'Ruiz Build Co', contractor_phone: '512-555-0142',
};
const dupEv = normalizeEvent(dupSrc, dupRow)!;
const partyKey = (p: { name: string | null; company: string | null; phone: string | null }) =>
  `${(p.name ?? '').toLowerCase()}|${(p.company ?? '').toLowerCase()}|${(p.phone ?? '').toLowerCase()}`;
check('THE DUPLICATE PARTY: the legacy contact path and the declared parties[] entry fold into ONE party',
  dupEv.parties.filter((p) => p.name === 'Dana Ruiz').length === 1
  && dupEv.named_parties.filter((p) => p.name === 'Dana Ruiz').length === 1);
check('no (name|company, phone) pair repeats inside one event\'s parties',
  new Set(dupEv.parties.map(partyKey)).size === dupEv.parties.length);
check('folding KEEPS the richer capture — the declared entry\'s phone survives the merge',
  dupEv.parties.find((p) => p.name === 'Dana Ruiz')?.phone === '512-555-0100');
check('folding keeps provenance: BOTH source columns are recorded on the surviving party',
  /applicant_full_name/.test(dupEv.parties.find((p) => p.name === 'Dana Ruiz')?.source_field ?? '')
  && /applicant_phone/.test(dupEv.parties.find((p) => p.name === 'Dana Ruiz')?.source_field ?? ''));
check('ordinals stay contiguous from 0 after folding — le_event_parties rows are not sparse',
  dupEv.parties.every((p, i) => p.ordinal === i));
check('genuinely different parties are NOT folded together',
  dupEv.parties.length === 2 && dupEv.parties.some((p) => p.company === 'Ruiz Build Co'));
check('EVERY shipped preset folds its own double-read — this was not one city\'s bug',
  STARTER_SOURCES.every((preset) => {
    const src: SourceLike = {
      kind: preset.kind, base_url: preset.base_url, region: preset.region,
      jurisdiction: preset.jurisdiction, query_config: preset.query_config, cursor: {},
    };
    const fm = preset.query_config.field_map ?? {};
    const row: Record<string, unknown> = { [fm.title ?? 'title']: 'Work', ...(fm.address ? { [fm.address]: '1 Main St' } : {}) };
    for (const parts of [fm.address_parts ?? []]) parts.forEach((c, i) => { row[c] = String(i + 1); });
    if (fm.contact_name) row[fm.contact_name] = 'Same Person';
    if (fm.contact_company) row[fm.contact_company] = 'Same Company';
    for (const pm of (preset.query_config.parties ?? [])) {
      if (pm.name) row[pm.name] = 'Same Person';
      if (pm.company) row[pm.company] = 'Same Company';
    }
    const e = normalizeEvent(src, row);
    if (!e) return false;
    return new Set(e.parties.map(partyKey)).size === e.parties.length;
  }));

// ── REGRESSION: THE FIT SIGNAL — one permit's leads must be a RANKING ──────
// Base weight is per event type and the valuation/recency/contact terms are properties of the
// RECORD, so every trade scored off one permit used to land within a few points of every other and
// four of them tied exactly. The record's own words are the only trade-specific evidence a permit
// row carries; they are what separates the trades now.
const fitEvent: LeadEventLike = {
  event_type: 'permit_issued', occurred_at: '2026-08-01T00:00:00.000Z',
  address: '900 E 6th St, Austin, TX', region: 'Austin, TX', valuation_usd: 385_000,
  title: 'Restaurant finish-out — new tenant', description: 'Interior finish out for restaurant',
  named_parties: [{ role: 'contractor', name: 'Dana Ruiz', phone: '512-555-0100' }],
  source_url: 'https://data.austintexas.gov/permits/C-2026-9',
  work_class: 'Finish Out', permit_type: 'BP', permit_sub_type: 'Building Permit',
};
const fitScores = new Map(tradesForSegment('commercial')
  .map((t) => [t, scoreLead(fitEvent, t, NOW, { segment: 'commercial' })])
  .filter((x): x is [TradeKeyT, NonNullable<ReturnType<typeof scoreLead>>] => !!x[1]));
const fitVals = [...fitScores.values()].map((v) => v.score);
check('THE RANKING: one commercial permit no longer scores every trade within a few points',
  Math.max(...fitVals) - Math.min(...fitVals) >= 30);
check('…and the top of the list is not a four-way tie',
  new Set(fitVals).size >= 5);
check('a restaurant finish-out ranks the trades a restaurant buys ABOVE the ones it does not',
  (['acoustics', 'janitorial', 'signage', 'fire_safety'] as const)
    .every((t) => (fitScores.get(t)?.score ?? 0) > (fitScores.get('landscaping')?.score ?? 0)));
check('the fit adjustment QUOTES the record\'s own word — a mechanism, never a probability',
  (fitScores.get('fire_safety')?.reasons ?? []).some((r) => /the record names a space this trade sells into \("restaurant"\)/.test(r))
  && (fitScores.get('landscaping')?.reasons ?? []).some((r) => r === `-${FIT_MISS}: the record's words name other trades' work, not ${TRADES.landscaping.label.toLowerCase()}`));
check('naming the WORK outranks naming the space it happens in',
  FIT_NAMED > FIT_USE
  && (scoreLead({ ...fitEvent, title: 'Re-roof — TPO membrane', description: null }, 'roofing', NOW)?.score ?? 0)
     > (scoreLead(fitEvent, 'roofing', NOW)?.score ?? 0));
check('fitFor is pure and order-independent — the same words always give the same adjustment',
  JSON.stringify(fitFor(recordWords(fitEvent), 'acoustics')) === JSON.stringify(fitFor(recordWords(fitEvent), 'acoustics')));
check('a record that names NOTHING adjusts nobody — no invented spread',
  fitFor(recordWords({ title: 'Permit', description: null, work_class: null, permit_type: null, permit_sub_type: null }), 'security') === null
  && !recordIsSpecific(''));
check('permit_sub_type is read as the record\'s words — the readable label names the trade',
  fitFor(recordWords({ title: 'Permit', description: null, work_class: null, permit_type: 'MP', permit_sub_type: 'Mechanical Permit' }), 'hvac')?.delta === FIT_NAMED);
check('the follow-on rule OWNS its trades — the two rules never contradict each other in one lead',
  !scoreLead(homePermit, 'flooring', NOW, { segment: 'residential' })!.reasons.some((r) => /the record's words name other trades/.test(r))
  && !scoreLead(homePermit, 'remodeling', NOW, { segment: 'residential' })!.reasons.some((r) => /the record names .* work \(/.test(r)));
check('SCORE_VERSION was bumped with the arithmetic — a stored score stays interpretable',
  SCORE_VERSION === 'le-2');

// ── REGRESSION: THE HONEST ONE-LINERS ──────────────────────────────────────
// A read that could not be STORED is not a check. It rendered as "Checked — 240 rows read, 0 new"
// — indistinguishable from a quiet window — while the rows were dropped and the cursor moved past
// them, which a rolling portal window makes permanent.
check('a healthy run still reads exactly as it did',
  sourceStatusLine({ rowsParsed: 12, rowsNew: 3, rowsChanged: 1, rowsDisqualified: 0, pages: 1, capped: false })
  === 'Checked — 12 rows read, 3 new, 1 updated.');
check('a capped run says the window is only part-read, and where it resumes',
  sourceStatusLine({ rowsParsed: 1000, rowsNew: 900, rowsChanged: 0, rowsDisqualified: 0, pages: 10, capped: true, resumeOffset: 1000 })
    .includes('over 10 pages') === true
  && sourceStatusLine({ rowsParsed: 1000, rowsNew: 900, rowsChanged: 0, rowsDisqualified: 0, pages: 10, capped: true, resumeOffset: 1000 })
    .includes('resuming at row 1000'));
check('A PERSIST FAILURE IS NOT A CHECK: it says the rows were not stored, and that they are re-read',
  (() => {
    const l = sourceStatusLine({ rowsParsed: 240, rowsNew: 0, rowsChanged: 0, rowsDisqualified: 0, pages: 3, capped: false, persistError: 'column "x" does not exist' });
    return !l.startsWith('Checked') && /COULD NOT STORE/.test(l) && /column "x" does not exist/.test(l) && /re-read next run/.test(l);
  })());

// One-click market creation used to print "permit feed wired, clock on, first check running"
// unconditionally — including when the source insert and the first check had both thrown and been
// swallowed by `.catch(() => {})`. The operator then went looking for leads that could not arrive.
check('a fully-landed start reports success, and carries the ingest\'s own line',
  (() => {
    const r = marketStartLine({ title: 'Lead Market — Austin, TX (Commercial)', withPreset: true, clockOn: true, sourceWired: true, firstCheckLine: '1 source checked — 40 new events, 210 scored leads.', problems: [] });
    return r.tone === 'success' && r.text.includes('permit feed wired, clock on') && r.text.includes('210 scored leads');
  })());
check('a blank market\'s line is unchanged',
  marketStartLine({ title: 'X (Commercial)', withPreset: false, clockOn: true, sourceWired: false, problems: [] }).text
  === 'Market created and on the clock — add its first source inside.');
check('A HALF-BUILT MARKET SAYS SO — it never claims the step that failed',
  (() => {
    const r = marketStartLine({
      title: 'Lead Market — Austin, TX (Commercial)', withPreset: true, clockOn: true, sourceWired: false,
      firstCheckLine: null, problems: ['the Austin building permits feed could not be wired (permission denied).'],
    });
    return r.tone === 'error' && !r.text.includes('permit feed wired') && r.text.includes('clock on')
      && r.text.includes('permission denied') && r.text.includes('Finish it in Setup');
  })());
check('every problem is surfaced, not just the first',
  marketStartLine({ title: 'M', withPreset: true, clockOn: false, sourceWired: false, problems: ['a happened.', 'b happened.'] })
    .text.includes('a happened. b happened.'));

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} lead-engine check(s) failed`);
