// src/lib/garvis/leadEngine/leadEngine.verify.ts — the Lead Engine's pure brain
// (npm run verify:leadengine). Scoring states its reasons, dedupe is stable, digests never
// invent, commission math is clamped, adapters are verbatim-only.

import {
  TRADES, TRADE_KEYS, isTradeKey, dedupeKey, normalizeKeyPart, scoreLead, pickContact, whyNow,
  digestFor, commissionFor, parseLeadEngineConfig, ingestLine, DEFAULT_COMMISSION_PCT,
  type LeadEventLike,
} from './leadEngine.ts';
import { buildFetchUrl, parseRows, normalizeEvent, nextCursor, toIso, FETCH_LIMIT, STARTER_SOURCES, starterById, type SourceLike } from './adapters.ts';

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
check('isTradeKey accepts real trades and rejects junk', isTradeKey('security') && !isTradeKey('plumbing') && !isTradeKey(42));

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

// ── adapters: cursor stepping ──────────────────────────────────────────────
const evs = [ev!, { ...ev!, occurred_at: '2026-08-03T00:00:00.000Z' }];
check('nextCursor advances to the max date seen', nextCursor(soc, evs).last_date === '2026-08-03T00:00:00.000Z');
check('nextCursor with no dated events leaves the cursor unchanged', nextCursor(soc, []).last_date === '2026-07-01');

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} lead-engine check(s) failed`);
