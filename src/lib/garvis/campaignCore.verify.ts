// src/lib/garvis/campaignCore.verify.ts — run: npx tsx src/lib/garvis/campaignCore.verify.ts
// Proves the one-form→whole-set composer is honest: real data flows through, missing facts become
// visible holes + warnings (never invented), listing photos ride the card, and prospecting cards
// carry no property.

import { composeCampaign, CAMPAIGN_TYPES, GENERIC_CAMPAIGNS, campaignsFor, metaFor, type CampaignInput } from './campaignCore';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) { pass++; } else { fail++; console.error(`✗ ${name}`); } };

const brand = { palette: ['#123456'], fonts: [], compliance_line: 'Equal Housing Opportunity' };

// ---- just_listed, fully filled ----
const listed = composeCampaign({
  type: 'just_listed', agentName: 'Jane Doe', agentPhone: '555-0100',
  address: '123 Maple St', price: '$450,000', beds: '4', baths: '3',
  area: 'Lake Geneva', highlight: 'Remodeled kitchen, big backyard',
  brand, photoUrl: 'https://example.com/home.jpg', photoAlt: '123 Maple St', link: 'https://jane.example/123maple',
} as CampaignInput);

ok('listed: headline names address + price', listed.headline.includes('123 Maple St') && listed.headline.includes('$450,000'));
ok('listed: postcard carries the real photo', listed.postcard.front.imageUrl === 'https://example.com/home.jpg');
ok('listed: front headline is the campaign headline', listed.postcard.front.headline.includes('123 Maple St'));
ok('listed: 3 social posts', listed.socialPosts.length === 3);
ok('listed: a social post mentions the address', listed.socialPosts.some((p) => p.caption.includes('123 Maple St')));
ok('listed: a social post carries the price', listed.socialPosts.some((p) => p.caption.includes('$450,000')));
ok('listed: email subject names the listing', listed.email.subject.includes('123 Maple St'));
ok('listed: email signs with the agent', listed.email.body.includes('Jane Doe') && listed.email.body.includes('555-0100'));
ok('listed: brand compliance line reaches the card back', listed.postcard.back.complianceLine === 'Equal Housing Opportunity');
ok('listed: no warnings when fully filled', listed.warnings.length === 0);
ok('listed: no [EDIT] holes when fully filled', !JSON.stringify(listed).includes('[EDIT'));

// ---- just_listed, missing everything → honest holes + warnings, never invented ----
const bare = composeCampaign({ type: 'just_listed' } as CampaignInput);
ok('bare: warns about the missing address', bare.warnings.some((w) => /address/i.test(w)));
ok('bare: warns about the missing price', bare.warnings.some((w) => /price/i.test(w)));
ok('bare: warns about the missing photo', bare.warnings.some((w) => /photo/i.test(w)));
ok('bare: never invents a fake address/price', !bare.headline.match(/\d+\s+\w+\s+(St|Ave|Rd)/) && !/\$\d/.test(bare.headline));
ok('bare: surfaces an [EDIT] hole somewhere', JSON.stringify(bare).includes('[EDIT'));

// ---- find_sellers: a brand/lifestyle card, NO property photo ----
const farm = composeCampaign({
  type: 'find_sellers', agentName: 'Jane Doe', area: 'Lake Geneva', brand,
} as CampaignInput);
ok('farm: no property photo on the card (brand piece)', farm.postcard.front.imageUrl === null);
ok('farm: headline speaks to sellers in the area', /sell/i.test(farm.headline) && farm.headline.includes('Lake Geneva'));
ok('farm: social posts talk to the neighborhood', farm.socialPosts.every((p) => p.caption.includes('Lake Geneva')));
ok('farm: email subject is a value-estimate hook', /worth/i.test(farm.email.subject));
ok('farm: does NOT claim a specific address', !/\d+\s+\w+\s+(St|Ave|Rd)/.test(JSON.stringify(farm)));

// ---- just_sold + open_house exist and produce a full set ----
for (const type of ['just_sold', 'open_house'] as const) {
  const s = composeCampaign({ type, address: '9 Oak', area: 'Lake Geneva', openWhen: 'Sat 1–3pm', agentName: 'Jane' } as CampaignInput);
  ok(`${type}: has postcard + 3 social + email`, !!s.postcard && s.socialPosts.length === 3 && !!s.email.subject);
}

// ---- price is a STRING, never math (honesty): unusual string flows through verbatim ----
const oddPrice = composeCampaign({ type: 'just_listed', address: '1 A St', price: 'call for price', agentName: 'J' } as CampaignInput);
ok('price string passes through verbatim (no math)', oddPrice.headline.includes('call for price'));

// ---- the type catalog is coherent ----
ok('CAMPAIGN_TYPES has 4 entries', CAMPAIGN_TYPES.length === 4);
ok('only find_sellers skips the photo requirement', CAMPAIGN_TYPES.filter((t) => !t.needsPhoto).map((t) => t.id).join() === 'find_sellers');

// ---- GENERIC kit: works for any business ----
ok('GENERIC_CAMPAIGNS has 4 entries', GENERIC_CAMPAIGNS.length === 4);
ok('campaignsFor(false) → generic, (true) → real estate', campaignsFor(false) === GENERIC_CAMPAIGNS && campaignsFor(true) === CAMPAIGN_TYPES);
ok('metaFor resolves both kits', metaFor('announce')?.label === 'Announce something' && metaFor('just_listed')?.label === 'Just Listed');

const bakery = composeCampaign({
  type: 'announce', businessName: 'Sweet Buns Bakery',
  subject: 'Fresh sourdough every morning', details: 'Now baking daily from 7am', highlight: 'Naturally leavened, small-batch',
  agentName: 'Sam', agentPhone: '555-0199', brand,
} as CampaignInput);
ok('generic announce: headline is the subject', bakery.headline.includes('Fresh sourdough'));
ok('generic announce: 3 social posts', bakery.socialPosts.length === 3);
ok('generic announce: a post names the business', bakery.socialPosts.some((p) => p.caption.includes('Sweet Buns Bakery')));
ok('generic announce: a post carries the details', bakery.socialPosts.some((p) => p.caption.includes('Now baking daily')));
ok('generic announce: email subject is the subject', bakery.email.subject.includes('Fresh sourdough'));
ok('generic announce: email signs off', bakery.email.body.includes('Sam') && bakery.email.body.includes('555-0199'));
ok('generic announce: no property/address claim', !/\d+\s+\w+\s+(St|Ave|Rd)/.test(JSON.stringify(bakery)));
ok('generic announce: no [EDIT] when filled', !JSON.stringify(bakery).includes('[EDIT'));

for (const type of ['promo', 'event', 'reach'] as const) {
  const s = composeCampaign({ type, businessName: 'Acme Co', subject: 'Big news', details: 'This weekend', highlight: 'Save 20%', agentName: 'Pat' } as CampaignInput);
  ok(`generic ${type}: full set`, !!s.postcard && s.socialPosts.length === 3 && !!s.email.subject);
}

const emptyGeneric = composeCampaign({ type: 'announce' } as CampaignInput);
ok('generic empty: warns to say what you\'re announcing', emptyGeneric.warnings.some((w) => /announc/i.test(w)));
ok('generic empty: surfaces an [EDIT] hole', JSON.stringify(emptyGeneric).includes('[EDIT'));

console.log(`\ncampaignCore.verify: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
