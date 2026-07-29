// scripts/claims-walkthrough.mjs — hold the four generated prototypes to the promises they make.
//
//   npm run walkthrough:claims
//
// WHY THIS IS SEPARATE FROM probe.mjs
// probe.mjs is generic: it proves a page is not broken. That is a low bar and it is deliberately a
// low bar, because a generic prober is the only kind you can point at something that does not exist
// yet. This file is the other half — it knows what each page CLAIMS and tries to catch it lying.
//
// THE ONE THAT MATTERS
// P6 says "prove it" sums the rows in front of you and matches the headline. A prototype could fake
// that by printing a stored total. So this suite does not read P6's verdict: it scrapes every row
// value out of the DOM, sums them in Node, and compares that to the headline figure. If the page
// were theatre, an independent sum would disagree with it. That check is the difference between
// testing that a claim is DISPLAYED and testing that it is TRUE.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The one class of dishonesty a running browser CANNOT show you: a figure typed into the markup for
 * a slot the script computes. It is overwritten before first paint, so every runtime assertion
 * passes while the source carries a second, stale source of truth. This was not hypothetical — the
 * ledger shipped with $47.12 / 214 in its markup against real values of $45.63 / 45, and it took
 * reading the file to find it. So: read the file.
 */
function staticSlotsAreEmpty(file, ids) {
  const src = readFileSync(resolve('prototypes', file), 'utf8');
  const dirty = [];
  for (const id of ids) {
    const m = src.match(new RegExp(`id="${id}"[^>]*>([^<]*)<`));
    if (m && /\d/.test(m[1]) && m[1].trim() !== '0') dirty.push(`#${id}="${m[1].trim()}"`);
  }
  return dirty;
}

import { existsSync } from 'node:fs';
// Prefer an explicit CHROMIUM_PATH, then this container's pinned build, then let Playwright find
// whatever it installed (which is what happens in CI). Passing a nonexistent executablePath fails
// with a confusing "browser not found", so only pass it when it is really there.
const PINNED = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const LAUNCH = existsSync(PINNED) ? { executablePath: PINNED } : {};
let failed = 0, total = 0;
const say = console.log;
const R = (label, pass, detail = '') => {
  total++; if (!pass) failed++;
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} - ${label}${detail ? ' — ' + detail : ''}`);
};
const browser = await chromium.launch(LAUNCH);
async function open(name) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 140)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });
  await page.goto(`file://${resolve('prototypes', name)}`);
  await page.waitForTimeout(900);
  return { page, errs, body: () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ')) };
}

// ============================== P6 · The Ledger =============================================
{
  say('\nP6 · The Ledger — is the proof real, or is it printing a stored number?');
  const { page, errs, body } = await open('the-ledger.html');
  const headline = await page.locator('#total').innerText();
  const rowsClaimed = Number(await page.locator('#rowtotal').innerText());
  R('the page opens with a total and a row count', /^\$\d/.test(headline) && rowsClaimed > 0, `${headline} over ${rowsClaimed} operations`);
  const dirty = staticSlotsAreEmpty('the-ledger.html', ['total', 'rowtotal']);
  R('no stale figure is typed into the markup behind the computed ones', dirty.length === 0,
    dirty.length ? `${dirty.join(', ')} — a second source of truth no runtime test can see` : 'both slots empty in source');

  await page.click('#prove');
  await page.waitForTimeout(6000);

  // THE INDEPENDENT SUM. Scrape what is actually rendered and add it up here, in Node.
  const scraped = await page.evaluate(() => {
    const vals = [...document.querySelectorAll('.rowlist .row .v')]
      .map((e) => Number(e.textContent.replace(/[$,]/g, '')))
      .filter((n) => !Number.isNaN(n));
    return { n: vals.length, sum: vals.reduce((a, b) => a + b, 0) };
  });
  const headlineNum = Number(headline.replace(/[$,]/g, ''));
  R('every row the headline counts is actually on the page', scraped.n === rowsClaimed,
    `${scraped.n} rows rendered vs ${rowsClaimed} claimed`);
  R('THE CLAIM: an independent sum of the visible rows equals the headline',
    Math.abs(scraped.sum - headlineNum) < 0.005,
    `rows sum to $${scraped.sum.toFixed(2)}, headline says ${headline}`);
  R('the page says it matched', /matches the headline exactly/i.test(await body()));

  // The hole must survive the proof: it must not be summed as zero, and must stay named.
  const t = await body();
  R('the unmetered window is still named, not folded into the total', /unknown/i.test(t) && /not metered before/i.test(t));
  R('the hole reports what it cannot price rather than a figure', /6 sends unpriced|not recorded/i.test(t));
  R('collapsing does not change any total',
    await (async () => { await page.click('#collapse'); await page.waitForTimeout(900);
      return (await page.locator('#total').innerText()) === headline; })());
  R('no errors', errs.length === 0, errs.join(' ;; '));
  await page.close();
}

// ============================== P7 · The Breaker ============================================
{
  say('\nP7 · The Breaker — does it stop itself at exactly five, and is the saving real arithmetic?');
  const { page, errs, body } = await open('the-breaker.html');
  R('it starts active with a clean streak', /active/i.test(await page.locator('#state').innerText()) &&
    (await page.locator('#pn').innerText()) === '0');

  for (let i = 1; i <= 4; i++) {
    await page.click('#step'); await page.waitForTimeout(320);
  }
  R('four failures do NOT pause it', (await page.locator('#pn').innerText()) === '4' &&
    !/paused/i.test(await page.locator('#state').innerText()));
  await page.click('#step'); await page.waitForTimeout(1400);
  R('THE CLAIM: the fifth failure pauses it, unprompted', /paused itself/i.test(await page.locator('#state').innerText()));

  const txt = await body();
  const m = txt.match(/tried (\d+) more times today and spent \$([\d.]+)/i);
  R('it states what it prevented', !!m, m ? m[0] : 'no saving line');
  if (m) {
    // Verify the arithmetic independently rather than trusting the sentence.
    const meter = txt.match(/spent on fires that could not work \$([\d.]+)/i);
    const perFire = meter ? Number(meter[1]) / 5 : NaN;
    const expected = Number(m[1]) * perFire;
    R('the saving is real arithmetic, not a typed number',
      Math.abs(expected - Number(m[2])) < 0.02,
      `${m[1]} fires × $${perFire.toFixed(4)} = $${expected.toFixed(2)}, screen says $${m[2]}`);
  }
  // A paused automation must refuse to fire — the whole point.
  const before = await body();
  await page.keyboard.press(' '); await page.waitForTimeout(700);
  R('a paused automation refuses to fire', /refused|paused/i.test(await body()) &&
    !(await body()).includes('failed (6/5)'));

  await page.click('#fix'); await page.waitForTimeout(600);
  await page.click('#resume'); await page.waitForTimeout(600);
  R('resuming after a real fix clears the streak', (await page.locator('#pn').innerText()) === '0');
  await page.click('#step'); await page.waitForTimeout(700);
  R('and the next fire actually succeeds', /sent · 1 recipient/i.test(await body()));
  R('no errors', errs.length === 0, errs.join(' ;; '));
  await page.close();
}

// ============================== P8 · The Handoff ============================================
{
  say('\nP8 · The Handoff — is "nothing was deleted" structural, or just a sentence?');
  const { page, errs, body } = await open('the-handoff.html');
  const opening = await body();
  R('the deleted counter starts at zero', /deleted 0/i.test(opening));
  R('delete is stated as not offered', /delete is not offered/i.test(opening));
  R('no control anywhere offers deletion', !(await page.evaluate(() =>
    [...document.querySelectorAll('button')].some((b) => /delete|remove|destroy|wipe/i.test(b.innerText)))));

  R('the inventory cannot be produced while anything is undecided',
    await page.locator('#produce').isDisabled());
  await page.click('#accept'); await page.waitForTimeout(800);
  R('accepting the proposals unblocks it', !(await page.locator('#produce').isDisabled()));

  // Emptying a retained reason must re-block: a retention without a reason is not a retention.
  const reason = page.locator('.item.retained .reason').first();
  const kept = await reason.inputValue();
  await reason.fill(''); await page.waitForTimeout(500);
  R('THE CLAIM: a retention with no reason blocks the inventory', await page.locator('#produce').isDisabled(),
    'emptied one reason field');
  await reason.fill(kept); await page.waitForTimeout(500);

  await page.click('#produce'); await page.waitForTimeout(1500);
  const doc = await body();
  R('the inventory accounts for every one of the nine items', /9 items accounted for/i.test(doc));
  const listed = await page.evaluate(() => document.querySelectorAll('#doc .grp .r').length);
  R('and lists all nine by name', listed === 9, `${listed} rows in the document`);
  R('the document states zero deletions', /0 deleted/i.test(doc));
  R('the two blockers are still visible, not resolved away', /open since jul 19/i.test(doc) && /never delivered/i.test(doc));
  R('no errors', errs.length === 0, errs.join(' ;; '));
  await page.close();
}

// ============================== P9 · The Return =============================================
{
  say('\nP9 · The Return — does the gap stay a gap under pressure?');
  const { page, errs, body } = await open('the-return.html');
  const opening = await body();
  R('it opens by naming what it cannot account for', /cannot|the other 4/i.test(opening));
  R('the tally distinguishes known from unknown days', /days accounted for 5 of 9/i.test(opening));

  // Open every day, including the four with no observations.
  await page.click('#openall'); await page.waitForTimeout(1800);
  const all = await body();
  const gapDays = await page.evaluate(() => document.querySelectorAll('.day.gap').length);
  R('four days are marked as gaps', gapDays === 4, `${gapDays} gap days`);
  R('THE CLAIM: an unobserved day renders as unknown, never as zero',
    /no observation exists/i.test(all) && /zero activity/i.test(all) && /zero knowledge/i.test(all));

  // The hard one: no fabricated rows may appear inside a gap day.
  const fabricated = await page.evaluate(() =>
    [...document.querySelectorAll('.day.gap .rowlist .r')].length);
  R('no row is ever rendered for a day with no observation', fabricated === 0,
    fabricated ? `${fabricated} fabricated rows found` : 'zero rows inside gap days');

  // And no time-stamped claim may exist in the gap window.
  const gapText = await page.evaluate(() =>
    [...document.querySelectorAll('.day.gap')].map((d) => d.innerText).join(' '));
  R('nothing in the gap carries a timestamp implying activity', !/\b\d{2}:\d{2}\b/.test(gapText));

  await page.click('#gapbtn'); await page.waitForTimeout(2000);
  const focused = await body();
  R('the gap view says what did not run', /never fired|did not run/i.test(focused));
  R('and states explicitly that it did not estimate', /not going to guess|did not do|estimate/i.test(focused));
  R('the closing line refuses to split the difference', /nothing on this screen splits the difference/i.test(focused));
  R('no errors', errs.length === 0, errs.join(' ;; '));
  await page.close();
}

// ============================== P10 · The Fleet =============================================
{
  say('\nP10 · The Fleet — is a served client really invisible, and does the screen stay flat?');
  const { page, errs, body } = await open('the-fleet.html');
  const opening = await body();
  R('it opens by stating how many need something vs how many do not', /of your 10 clients need something/i.test(opening));

  const rows = await page.locator('.exc').count();
  R('only the exceptions are rendered', rows === 3, `${rows} exception rows`);

  // THE CLAIM: no healthy client's name may appear anywhere in the exception area.
  const excText = await page.evaluate(() => document.querySelector('#excs').innerText);
  const quietNames = ['Riverside Dental', 'Fern & Frond', 'Petal & Stem', "Marco's", 'Copper Kettle', 'Northgate', 'Salt & Cedar'];
  const leaked = quietNames.filter((n) => excText.includes(n));
  R('THE CLAIM: no well-served client appears in the exception area', leaked.length === 0,
    leaked.length ? `leaked: ${leaked.join(', ')}` : '7 quiet clients, none named');

  // Evidence must be on tap, and must be real rows rather than a restatement.
  await page.locator('.evbtn').first().click(); await page.waitForTimeout(700);
  const evRows = await page.locator('.exc.open .evlist .r').count();
  R('every claim opens into timestamped rows', evRows >= 3, `${evRows} rows behind the first exception`);

  // The load-bearing one: signing another client must not grow the screen.
  const before = await page.locator('.exc').count();
  await page.click('#add'); await page.waitForTimeout(1200);
  const after = await page.locator('.exc').count();
  const totalNow = await body();
  R('THE CLAIM: signing an eleventh client adds no row', before === after, `${before} rows before, ${after} after`);
  R('but the client count really did go up', /11 clients/i.test(totalNow));

  // Resolving one must remove it entirely, not grey it out.
  await page.click('#resolve'); await page.waitForTimeout(1200);
  const resolved = await page.locator('.exc').count();
  R('a fixed problem leaves the screen rather than turning green', resolved === after - 1, `${resolved} rows left`);
  R('and nothing on screen still says that site is down',
    !/unreachable/i.test(await page.evaluate(() => document.querySelector('#excs').innerText)));
  R('no errors', errs.length === 0, errs.join(' ;; '));
  await page.close();
}

// ============================== P11 · The Request ===========================================
{
  say('\nP11 · The Request — does the state machine actually refuse, or just look strict?');
  const { page, errs, body } = await open('the-request.html');
  R('it starts at received', /state received/i.test(await body()));

  // THE CLAIM 1: you cannot skip a step.
  await page.locator('button[data-to]').nth(1).click();   // the "skip to …" verb
  await page.waitForTimeout(700);
  const refusal = await body();
  R('THE CLAIM: skipping a step is refused, with the missing step named',
    /cannot go from/i.test(refusal) && /the step between them is/i.test(refusal));
  R('the refusal is itself recorded in history, not swallowed',
    await page.evaluate(() => document.querySelectorAll('.hrow.refused').length) === 1);

  // Walk the legal road to deployed.
  for (let i = 0; i < 5; i++) { await page.locator('button.primary[data-to]').first().click(); await page.waitForTimeout(320); }
  const deployed = await body();
  R('the legal road advances one step at a time', /state deployed/i.test(deployed), (deployed.match(/state \w+/i) || [''])[0]);

  // THE CLAIM 2: a deployed change can never be declined.
  await page.click('button[data-to="declined"]'); await page.waitForTimeout(700);
  const declineRefusal = await body();
  R('THE CLAIM: a deployed change cannot be declined', /cannot decline something you have published/i.test(declineRefusal));
  R('it is still deployed afterwards, not moved', /state deployed/i.test(await body()));

  // History must be append-only: entries only ever grow, including the refusals.
  const beforeCount = await page.evaluate(() => document.querySelectorAll('.hrow').length);
  for (let i = 0; i < 3; i++) { await page.locator('button.primary[data-to]').first().click(); await page.waitForTimeout(300); }
  const afterCount = await page.evaluate(() => document.querySelectorAll('.hrow').length);
  R('history only ever grows', afterCount > beforeCount, `${beforeCount} → ${afterCount} entries`);
  R('both refusals are still in the record after the request closes',
    await page.evaluate(() => document.querySelectorAll('.hrow.refused').length) === 2);
  R('it reaches closed', /state closed/i.test(await body()));
  await page.waitForTimeout(1200);   // the closing line lands after the last transition settles
  const close = (await body()).match(/(\d+) steps, (\d+) recorded, none of them editable/i);
  R('the closing line exists and counts the real history', !!close, close ? close[0] : 'absent');
  if (close) {
    // Both figures must be derived, not typed: 8 transitions on the road, and the kept entries
    // are total history minus the two refusals.
    const kept = await page.evaluate(() => document.querySelectorAll('.hrow:not(.refused)').length);
    R('...and both of its numbers match what is actually on the page',
      Number(close[1]) === 8 && Number(close[2]) === kept, `says ${close[1]}/${close[2]}, page has 8/${kept}`);
  }
  R('no errors', errs.length === 0, errs.join(' ;; '));
  await page.close();
}

// ============================== P12 · The Report ============================================
{
  say('\nP12 · The Report — do the holes survive, and does it refuse to fill them?');
  const { page, errs, body } = await open('the-report.html');
  const opening = await body();
  R('it separates measured sources from unknown ones', /measured 5/i.test(opening) && /unknown 2/i.test(opening));

  // THE CLAIM 1: an absent source contributes no number anywhere.
  const paper = await page.evaluate(() => document.querySelector('#paper').innerText);
  R('THE CLAIM: neither unknown source is given a figure',
    !/\b\d+\s*(sms|replies|visitors|visits)\b/i.test(paper) && /not metered before/i.test(paper) && /no analytics connected/i.test(paper));
  R('the unknowns are listed under their own heading', /what this report does not know/i.test(paper));
  R('and it states they were not counted as zero', /none of them was counted as zero/i.test(paper));

  // THE CLAIM 2: a measured zero is stated AS a zero, and distinguished from an unknown.
  R('THE CLAIM: an empty source reads as a measured zero, not a gap', /measured zero, not a gap/i.test(paper));

  // THE CLAIM 3: too few observations refuses a percentage.
  R('THE CLAIM: one observation refuses to become a success rate',
    /not enough to quote a success rate/i.test(paper) && !/100%|0% success/i.test(paper));
  R('while a well-observed source is happy to be stated', /checked the site/i.test(paper) && /30/.test(paper));

  // Filling the gaps must be refused, in words, with a reason.
  await page.click('#fill'); await page.waitForTimeout(800);
  const refused = await body();
  R('THE CLAIM: estimating the unknowns is refused', /^(?!.*estimated).*/s.test(refused) && /\bNo\./.test(refused));
  R('the refusal explains what it would cost', /unverifiable/i.test(refused));
  R('the report is unchanged by the attempt',
    (await page.evaluate(() => document.querySelector('#paper').innerText)) === paper);

  // Sending is gated on approval, and approval is reversible.
  R('send is blocked before approval', await page.locator('#send').isDisabled());
  await page.click('#approve'); await page.waitForTimeout(500);
  R('approving unblocks sending', !(await page.locator('#send').isDisabled()));
  await page.click('#approve'); await page.waitForTimeout(500);
  R('withdrawing approval blocks it again', await page.locator('#send').isDisabled());
  await page.click('#approve'); await page.waitForTimeout(400);
  await page.click('#send'); await page.waitForTimeout(800);
  R('it sends with both unknowns still in it', /sent · with both unknowns still in it/i.test(await body()));
  R('no errors', errs.length === 0, errs.join(' ;; '));
  await page.close();
}

await browser.close();
console.log(`\nclaims walkthrough: ${total - failed} passed, ${failed} failed (of ${total})`);
if (failed) { console.error('A generated prototype does not keep a promise it makes on screen.'); process.exit(1); }
