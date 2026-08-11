// src/lib/preview/automationMenu.verify.ts — assertions for the pick-what-you-want menu core.
// Run: npx tsx src/lib/preview/automationMenu.verify.ts

import { menuForIndustry, selectionTotal, totalLabel, startingAtLabel, picksSummary } from './automationMenu';
import { parseMonthlyRange, cheapestMonthlyLow, upsellPriceLine, automationUpsellParagraph, automationUpsellHtml, type PitchUpsell } from '../garvis/clientHuntBuild';
import { CAPABILITIES } from '../garvis/automation/registry';

let passed = 0;
function check(name: string, cond: boolean) {
  if (!cond) { console.error(`✗ ${name}`); process.exit(1); }
  passed++; console.log(`✓ ${name}`);
}

// ── the price parser (the arithmetic every surface shares) ─────────────────
check('parse: en-dash registry label', JSON.stringify(parseMonthlyRange('$300–600/mo')) === '{"low":300,"high":600}');
check('parse: hyphen + second dollar sign', JSON.stringify(parseMonthlyRange('$1,000-$2,500/mo')) === '{"low":1000,"high":2500}');
check('parse: garbage → null, never NaN arithmetic', parseMonthlyRange('call us') === null && parseMonthlyRange('$0–100/mo') === null);
check('parse: inverted range refused', parseMonthlyRange('$600–300/mo') === null);
check('cheapest: min of parseable lows', cheapestMonthlyLow(['$300–600/mo', '$200–400/mo', 'bespoke']) === 200);
check('cheapest: nothing parseable → null', cheapestMonthlyLow(['bespoke', '']) === null);

// Every registry price label must parse — the menu's totals and the email's anchor depend on it.
// A new capability with a creative price format fails HERE, not silently in a prospect's browser.
check('registry: every capability price label parses',
  CAPABILITIES.every((c) => parseMonthlyRange(c.monthlyPrice) !== null));

// ── the email's price presentation (the "looks expensive" fix) ─────────────
const UPSELLS: PitchUpsell[] = [
  { title: 'Lead follow-up & intake', pitch: 'Every enquiry is captured.', monthlyPrice: '$300–600/mo', evidence: 'The page says "Call us".' },
  { title: 'Self-serve online booking', pitch: 'Let customers book themselves.', monthlyPrice: '$300–500/mo', evidence: 'Booking runs through a phone call.' },
];
const para = automationUpsellParagraph(UPSELLS);
const html = automationUpsellHtml(UPSELLS);
check('email: NO per-line price ranges (the bill-stack read)', !/\(from \$/.test(para) && !/\(from \$/.test(html));
check('email: exactly one price mention — the cheapest entry anchor',
  (para.match(/\$\d/g) ?? []).length === 1 && para.includes('start at $300/mo'));
check('email: agency + independence in the price line',
  para.includes('you pick only the ones you want') && para.includes('works fine without any of them'));
check('email html: anchor line rides under the list, escaped', html.includes('start at $300/mo'));
check('email: zero upsells → empty string, never a price line alone',
  automationUpsellParagraph([]) === '' && automationUpsellHtml([]) === '');
check('email: unparseable prices → sentence stands without invented number',
  !upsellPriceLine([{ ...UPSELLS[0], monthlyPrice: 'bespoke' }]).includes('$'));

// ── the demo-page menu ─────────────────────────────────────────────────────
const plumber = menuForIndustry('Plumbing & Sewer');
check('menu: a home-services vertical gets a real menu', plumber.length >= 4);
check('menu: not_built never appears (appointment reminders only if deliverable)',
  plumber.every((i) => CAPABILITIES.find((c) => c.id === i.id)?.status !== 'not_built'));
check('menu: sorted cheapest-first (easiest yes opens the list)',
  plumber.every((i, n) => n === 0 || (plumber[n - 1].low ?? Infinity) <= (i.low ?? Infinity)));
check('menu: every item carries its honest range label', plumber.every((i) => /\/mo$/.test(i.priceLabel)));
check('menu: unknown industry still yields the any-vertical menu', menuForIndustry('???').length >= 1);

// ── totalling ──────────────────────────────────────────────────────────────
const two = plumber.slice(0, 2).map((i) => i.id);
const t = selectionTotal(plumber, two);
check('total: sums both ends of picked ranges',
  t != null && t.low === (plumber[0].low ?? 0) + (plumber[1].low ?? 0) && t.high === (plumber[0].high ?? 0) + (plumber[1].high ?? 0));
check('total: empty picks → null → empty label', selectionTotal(plumber, []) === null && totalLabel(null) === '');
check('total label: reads as one range', /^\$\d+–\d+\/mo$/.test(totalLabel(t)));
check('starting-at: cheapest low across the menu', startingAtLabel(plumber) === `from $${plumber[0].low}/mo`);

// ── the picks → message summary (what the operator reads) ──────────────────
const sum = picksSummary(plumber, two, 'We answer the phone ourselves right now.');
check('summary: names picks with their ranges + estimated total',
  sum.startsWith('[Add-on picks]') && sum.includes(plumber[0].title) && sum.includes('est. $'));
check('summary: the typed note rides along', sum.endsWith('We answer the phone ourselves right now.'));
check('summary: no picks → just the note (no empty header)',
  picksSummary(plumber, [], 'hi') === 'hi' && picksSummary(plumber, []) === '');

console.log(`\nautomationMenu: all ${passed} checks passed`);
