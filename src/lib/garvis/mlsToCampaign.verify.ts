// src/lib/garvis/mlsToCampaign.verify.ts — run: npx tsx src/lib/garvis/mlsToCampaign.verify.ts
// Proves the MLS→composer seam is honest: fills come from the row (close price for sold cards,
// list price otherwise), missing facts stay '' holes (never $0 / never invented), and the
// choice list offers only listings that fit the campaign type, newest first, capped.

import { fmtPrice, streetOf, listingFill, listingChoices, choiceLabel } from './mlsToCampaign';
import { composeCampaign } from './campaignCore';
import type { MlsRow } from './mlsStats';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) { pass++; } else { fail++; console.error(`✗ ${name}`); } };

const row = (over: Partial<MlsRow>): MlsRow => ({
  listing_key: 'K1', status: 'Active', list_price: 1_150_000, close_price: null,
  address1: '123 Shore Dr, Lake Geneva, WI 53147', city: 'Lake Geneva', zip: '53147',
  property_type: 'Residential', beds: 4, baths: 3, sqft: 2800,
  list_date: '2026-07-01', close_date: null, dom: 12, ...over,
});
const NOW = '2026-07-31T12:00:00Z';

// ---- price formatting: real numbers format, gaps stay gaps ----
ok('fmtPrice formats with commas', fmtPrice(1_150_000) === '$1,150,000');
ok('fmtPrice rounds cents away', fmtPrice(449_999.6) === '$450,000');
ok('fmtPrice: null → empty (a hole, not $0)', fmtPrice(null) === '' && fmtPrice(0) === '' && fmtPrice(-5) === '');
ok('streetOf trims the city/state tail', streetOf('123 Shore Dr, Lake Geneva, WI 53147') === '123 Shore Dr');
ok('streetOf passes a bare street through', streetOf('9 Oak St') === '9 Oak St');

// ---- fill mapping ----
const listedFill = listingFill(row({}), 'just_listed');
ok('listed fill: address as the feed said it', listedFill.address === '123 Shore Dr, Lake Geneva, WI 53147');
ok('listed fill: list price quoted', listedFill.price === '$1,150,000');
ok('listed fill: area from city, beds/baths as strings', listedFill.area === 'Lake Geneva' && listedFill.beds === '4' && listedFill.baths === '3');
ok('half-bath decimal survives as typed', listingFill(row({ baths: 2.5 }), 'just_listed').baths === '2.5');
const soldFill = listingFill(row({ status: 'Closed', close_price: 1_095_000, close_date: '2026-06-15' }), 'just_sold');
ok('sold fill: CLOSE price wins over list price', soldFill.price === '$1,095,000');
ok('sold fill without a close price falls back to list', listingFill(row({ status: 'Closed', close_date: '2026-06-15' }), 'just_sold').price === '$1,150,000');
ok('missing beds/price stay empty holes', (() => {
  const f = listingFill(row({ beds: null, list_price: null }), 'just_listed');
  return f.beds === '' && f.price === '';
})());

// ---- the fill flows into the composer with no invention ----
const set = composeCampaign({ type: 'just_listed', agentName: 'Mary', area: listedFill.area,
  address: listedFill.address, price: listedFill.price, beds: listedFill.beds, baths: listedFill.baths,
  highlight: 'Private pier', photoUrl: 'https://example.com/h.jpg' });
ok('composer: fill produces a priced, fitting front headline', set.postcard.front.headline.includes('$1,150,000') && set.postcard.front.headline.length <= 48);
ok('composer: back states the fill facts', set.postcard.back.body.includes('Offered at $1,150,000') && set.postcard.back.body.includes('4 bd · 3 ba'));

// ---- choices: only what fits the campaign, newest first, capped ----
const rows: MlsRow[] = [
  row({ listing_key: 'A1', list_date: '2026-07-20' }),
  row({ listing_key: 'A2', list_date: '2026-05-02' }),
  row({ listing_key: 'P1', status: 'Pending', list_date: '2026-07-25' }),
  row({ listing_key: 'S1', status: 'Closed', close_date: '2026-06-15', close_price: 900_000 }),
  row({ listing_key: 'S2', status: 'Sold', close_date: '2026-01-10', close_price: 700_000 }),
  row({ listing_key: 'S3', status: 'Closed', close_date: '2024-03-01', close_price: 600_000 }), // stale
];
const forListed = listingChoices(rows, 'just_listed', NOW);
ok('just_listed offers only Active, newest list first', forListed.map((r) => r.listing_key).join() === 'A1,A2');
ok('open_house offers the same actives', listingChoices(rows, 'open_house', NOW).map((r) => r.listing_key).join() === 'A1,A2');
const forSold = listingChoices(rows, 'just_sold', NOW);
ok('just_sold offers last-12-month closes, newest close first', forSold.map((r) => r.listing_key).join() === 'S1,S2');
ok('a 2-year-old close never shows on a Just Sold card', !forSold.some((r) => r.listing_key === 'S3'));
ok('find_sellers (not about one property) offers nothing', listingChoices(rows, 'find_sellers', NOW).length === 0);
ok('generic campaigns offer nothing', listingChoices(rows, 'announce', NOW).length === 0);
ok('cap holds', listingChoices([...Array(30)].map((_, i) => row({ listing_key: `K${i}` })), 'just_listed', NOW).length === 12);

// ---- chip labels ----
ok('label: street + the price this card would quote', choiceLabel(row({}), 'just_listed') === '123 Shore Dr · $1,150,000');
ok('label: sold card quotes the close price', choiceLabel(row({ close_price: 900_000 }), 'just_sold') === '123 Shore Dr · $900,000');
ok('label: priceless listing shows street alone, never $0', choiceLabel(row({ list_price: null }), 'just_listed') === '123 Shore Dr');

console.log(`\nmlsToCampaign.verify: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
