// scripts/seed-walkthrough.mjs — does the seed (P15) keep the promises its header makes?
//
//   npm run walkthrough:seed
//
// The generic prober proves "not broken". This drives prototypes/the-seed.html with SYNTHETIC
// TOUCH (CDP Input.dispatchTouchEvent on a 390×844 mobile context) and asserts the interaction
// contract in docs/dot-field-seed.md §4: a tap peeks and never opens or scrolls; a hold blooms
// with the anchor dot under the thumb; one detent per crossing; a parked or rolling thumb never
// ticks; the page turns one row per pitch past the edge and stops the frame the thumb comes back;
// a lift while travelling, a fling, a cancel, a system touchCancel or a backgrounded app opens
// nothing; a still lift opens the lit piece by name; the ordinary page still scrolls and taps.
// Repo lesson (probe-core's history: five of its first six findings were its own): a failure here
// is a claim, not a fact — read the assertion before believing it. Not a verify:* suite (needs
// Chromium); runs in .github/workflows/prototypes.yml.
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { launchOptions } from './lib/probe-core.mjs';

const OUT = tmpdir();
const FILE = process.argv[2] || 'file://' + resolve('prototypes/the-seed.html');
const browser = await chromium.launch(launchOptions(existsSync));
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

await page.goto(FILE);
await page.waitForTimeout(700);
const st = async () => page.evaluate(() => ({
  state: document.body.dataset.state, sel: document.body.dataset.sel, top: +document.body.dataset.top,
  felt: +document.body.dataset.felt, ticks: +document.body.dataset.ticks, pages: +document.body.dataset.pages,
  scroll: document.getElementById('page').scrollTop,
  lit: [...document.querySelectorAll('.tile.lit')].map(t => +t.dataset.i),
  bloomed: document.getElementById('grid').classList.contains('bloomed'),
  held: document.getElementById('seed').classList.contains('held'),
  sheet: document.getElementById('sheet').classList.contains('on'),
  sheetName: document.getElementById('sname').textContent,
  pulse: document.getElementById('pulse').textContent,
  hint: document.getElementById('hint').classList.contains('on') ? document.getElementById('hint').textContent : '',
  alt: !!document.querySelector('.tile.lit.alt'), callout: document.body.dataset.callout,
  live: document.getElementById('live').textContent, expanded: document.getElementById('seed').getAttribute('aria-expanded'),
  sizes: (document.querySelector('.tile.lit .sz') || {}).textContent || '',
}));
const seedBox = await page.locator('#seed').boundingBox();
const SX = seedBox.x + seedBox.width/2, SY = seedBox.y + seedBox.height/2;
const cdp = await ctx.newCDPSession(page);
async function touch(type, x, y){
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
}
const wait = ms => page.waitForTimeout(ms);
const collapsedClean = async () => { const s = await st(); return !s.bloomed && !s.held && s.lit.length === 0; };
const closeSheetIfOpen = async () => { if ((await st()).sheet){ await page.click('#sclose'); await wait(250); } };
const R = {};

// 1) a tap shorter than the hold — a short peek (grid + dim + hint), then it retracts; nothing opens
await touch('touchStart', SX, SY); await wait(80); await touch('touchEnd', 0, 0); await wait(150);
const afterTap = await st();
R.tapPeeks = afterTap.state === 'peek' && afterTap.lit.length === 1 && afterTap.hint === 'hold the dot' && !afterTap.sheet;
await wait(700);
const afterPeek = await st();
R.peekRetracts = afterPeek.state === 'rest' && !afterPeek.sheet && await collapsedClean();

// 2) hold — the grid blooms, one tile is lit, the anchor dot maps to row 2 / right column
await touch('touchStart', SX, SY); await wait(320);
const afterHold = await st();
R.holdBloomed = afterHold.state === 'bloom' && afterHold.lit.length === 1 && afterHold.sel === '5';
await page.screenshot({ path: join(OUT, 's1-bloom.png') });

// 3) scrub up two rows slowly (dwell on each) — one detent per row, pulse grows
const sels = [afterHold.sel];
for (const dy of [-32, -64]){ await touch('touchMove', SX, SY + dy); await wait(380); sels.push((await st()).sel); }
// park between two dots — no flicker (sample selection 8× over 400ms)
await touch('touchMove', SX, SY - 48); const parked = new Set();
for (let i = 0; i < 8; i++){ await wait(50); parked.add((await st()).sel); }
// roll a parked thumb by ±2px — the park lock must swallow it
const ticksBeforeRoll = (await st()).ticks;
for (let i = 0; i < 10; i++){ await touch('touchMove', SX + (i % 2 ? 2 : -2), SY - 48 + (i % 3 ? 1 : -1)); await wait(30); }
const ticksAfterRoll = (await st()).ticks;
// left column
await touch('touchMove', SX - 34, SY - 64); await wait(380); sels.push((await st()).sel);
const afterScrub = await st();
R.scrub = sels.join('>') === '5>3>1>0';
R.parkedNoFlicker = parked.size === 1;
R.rollNoTick = ticksAfterRoll === ticksBeforeRoll;
R.ticksCounted = afterScrub.ticks >= 3;
R.felt = afterScrub.felt >= 2;
await page.screenshot({ path: join(OUT, 's2-scrub.png') });

// 4) push past the bottom row and hold — the page turns a row at a time; pull back — it stops
await touch('touchMove', SX, SY + 32); await wait(120);
await touch('touchMove', SX, SY + 60); await wait(900);
const afterPage = await st();
await page.screenshot({ path: join(OUT, 's3-paged.png') });
await touch('touchMove', SX, SY); await wait(300); const stopA = await st(); await wait(400); const stopB = await st();
R.paged = afterPage.top >= 3 && afterPage.pages === afterPage.top && afterPage.scroll > 400;
R.pageStopped = stopA.top === stopB.top;

// 5) distance ratchet: from inside the grid, cross the edge then one more pitch → exactly two rows
const topBefore = (await st()).top;
await touch('touchMove', SX, SY + 60); await wait(40);           // enter the band: +1
await touch('touchMove', SX, SY + 60 + 32); await wait(40);      // one more pitch: +2
const topRatchet = (await st()).top;
await touch('touchMove', SX, SY); await wait(300);
R.ratchet = topRatchet - topBefore === 2;

// 6) lift while travelling (in the paging band) — collapses, opens nothing
await touch('touchMove', SX, SY + 60); await wait(60);
await touch('touchEnd', 0, 0); await wait(300);
const afterBandLift = await st();
R.bandLiftNoSheet = !afterBandLift.sheet && afterBandLift.state === 'rest' && await collapsedClean();

// 7) let go: drag far off → no selection; come back inside → it re-arms; lift → opens
await touch('touchStart', SX, SY); await wait(320);
await touch('touchMove', SX - 110, SY - 40); await wait(150); const letGo = await st();
await touch('touchMove', SX, SY - 32); await wait(200); const rearmed = await st();
await touch('touchEnd', 0, 0); await wait(400); const afterRearmLift = await st();
R.letGoNoLit = letGo.lit.length === 0 && letGo.hint === 'let go';
R.rearmSelects = rearmed.lit.length === 1;
R.rearmLiftOpens = afterRearmLift.sheet;
await closeSheetIfOpen();
// …and let go then lift → nothing opens
await touch('touchStart', SX, SY); await wait(320);
await touch('touchMove', SX - 110, SY - 40); await wait(100);
await touch('touchEnd', 0, 0); await wait(300);
const afterCancel = await st();
R.cancelNoSheet = !afterCancel.sheet && afterCancel.state === 'rest' && await collapsedClean();

// 8) fling and lift — nothing opens
await touch('touchStart', SX, SY); await wait(320);
for (let i = 1; i <= 5; i++){ await touch('touchMove', SX, SY - i*30); }   // 150px in a burst
await touch('touchEnd', 0, 0); await wait(300); const afterFling = await st();
R.flingNoSheet = !afterFling.sheet && await collapsedClean();
await closeSheetIfOpen();

// 9) a drag before the hold delay blooms at once (the expert path)
await touch('touchStart', SX, SY); await wait(20);
await touch('touchMove', SX, SY - 12); await wait(60);            // 80ms total < HOLD_MS
const earlyBloom = await st();
R.moveBlooms = earlyBloom.state === 'bloom';
// 9b) a lift within ARM_MS of the bloom opens nothing — it becomes a peek, which then retracts
await touch('touchEnd', 0, 0); await wait(150);
const afterArmLift = await st();
await wait(700);
R.armNoSheet = !afterArmLift.sheet && afterArmLift.state === 'peek' && (await st()).state === 'rest' && await collapsedClean();
await closeSheetIfOpen();

// 10) hold, move one dot, lift still — the sheet opens on the lit piece
await touch('touchStart', SX, SY); await wait(320);
await touch('touchMove', SX, SY - 32); await wait(300);
const before = await st();
const litName = before.lit.length ? await page.evaluate(i => document.querySelectorAll('.tile')[i].querySelector('.nm').textContent, before.lit[0]) : '';
R.secondaryView = before.alt === true && before.callout === '0' && /–|only|size/.test(before.sizes);
R.liveOnDwell = before.live.includes(litName) && before.live.includes('sizes');
await touch('touchEnd', 0, 0); await wait(500);
const afterLift = await st();
await page.screenshot({ path: join(OUT, 's4-sheet.png') });
R.liftOpens = afterLift.sheet && afterLift.sheetName === litName && litName !== '';
await closeSheetIfOpen();

// 10b) the tile under the thumb gets the callout chip beside the plate
await touch('touchStart', SX, SY); await wait(320);
await touch('touchMove', SX, SY + 32); await wait(120);
R.occlusionCallout = (await st()).callout === '1';
await touch('touchMove', SX - 110, SY - 40); await wait(80); await touch('touchEnd', 0, 0); await wait(300);

// 11) the ordinary page still works: swipe scrolls, tapping a tile opens; bloom on an unaligned scroll snaps to a row
const scroll0 = (await st()).scroll;
await touch('touchStart', 120, 600); for (let y = 600; y >= 300; y -= 30){ await touch('touchMove', 120, y); await wait(16); }
await touch('touchEnd', 0, 0); await wait(600);
const scrolledBy = (await st()).scroll - scroll0;
R.pageScrolls = scrolledBy > 150;
await page.locator('.tile').nth(2).click(); await wait(300); R.tileTapOpens = (await st()).sheet;
await closeSheetIfOpen();
await page.evaluate(() => { document.getElementById('page').scrollTop = 250; });   // deliberately between rows
await wait(100);
await touch('touchStart', SX, SY); await wait(500);
const snapped = await st();
const rowH = await page.evaluate(() => { const t = document.querySelectorAll('.tile'); return t[2].getBoundingClientRect().top - t[0].getBoundingClientRect().top; });
R.bloomSnapsToRow = Math.abs(snapped.scroll - snapped.top * rowH) < 2;
await touch('touchMove', SX - 110, SY - 40); await wait(80); await touch('touchEnd', 0, 0); await wait(300);

// 11b) a tap on an unaligned page peeks WITHOUT moving the page
await page.evaluate(() => { document.getElementById('page').scrollTop = 250; }); await wait(100);
await touch('touchStart', SX, SY); await wait(60); await touch('touchEnd', 0, 0); await wait(150);
const peekUnaligned = await st();
R.peekNeverScrolls = peekUnaligned.state === 'peek' && peekUnaligned.scroll === 250;
await wait(700);

// 11c) the system takes the touch mid-dwell (touchCancel) — nothing opens, everything lets go
await touch('touchStart', SX, SY); await wait(320); await touch('touchMove', SX, SY - 32); await wait(200);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await wait(300);
const afterSysCancel = await st();
R.cancelNeverOpens = !afterSysCancel.sheet && afterSysCancel.state === 'rest' && await collapsedClean();

// 11d) a slow tap (blooms, lifts before the arm window) still peeks and opens nothing
await touch('touchStart', SX, SY); await wait(230); await touch('touchEnd', 0, 0); await wait(120);
const slowTap = await st();
R.slowTapPeeks = slowTap.state === 'peek' && !slowTap.sheet;
await wait(700);

// 11e) the host scrolled by other means under a bloom — the map is stale, so it lets go
await touch('touchStart', SX, SY); await wait(320);
await page.evaluate(() => { document.getElementById('page').scrollTop += 90; }); await wait(200);
const foreignScroll = await st();
R.foreignScrollLetsGo = foreignScroll.state === 'rest' && !foreignScroll.bloomed;
await touch('touchEnd', 0, 0); await wait(200); await closeSheetIfOpen();

// 11f) backgrounding mid-gesture lets go without opening
await touch('touchStart', SX, SY); await wait(320); await touch('touchMove', SX, SY - 32); await wait(200);
await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
await wait(200); const hidden = await st();
await page.evaluate(() => { delete document.visibilityState; });
await touch('touchEnd', 0, 0); await wait(200);
R.backgroundLetsGo = hidden.state === 'rest' && !hidden.sheet && await collapsedClean();
await closeSheetIfOpen();

// 11g) assistive tech: a synthesized click (detail 0) enters the sticky grid; Escape leaves it
await page.evaluate(() => document.getElementById('seed').click()); await wait(200);
const atBloom = await st();
await page.keyboard.press('Escape'); await wait(200);
R.assistiveClickBlooms = atBloom.state === 'bloom' && atBloom.expanded === 'true' && (await st()).expanded === 'false';

// 12) keyboard: Enter blooms, ArrowUp moves, Enter opens, Esc closes the sheet
await page.focus('#seed'); await page.keyboard.press('Enter'); await wait(200); const kbBloom = await st();
await page.keyboard.press('ArrowUp'); await wait(100); const kbMove = await st();
await page.keyboard.press('Enter'); await wait(300); const kbOpen = await st();
await page.keyboard.press('Escape'); await wait(200); const kbClosed = await st();
R.keyboard = kbBloom.state === 'bloom' && kbMove.sel !== kbBloom.sel && kbOpen.sheet && kbClosed.state === 'rest';

// 13) the seed falls silent after TAP_HINT_MAX taps
for (let i = 0; i < 3; i++){ await touch('touchStart', SX, SY); await wait(60); await touch('touchEnd', 0, 0); await wait(80); }
await wait(2000);
await touch('touchStart', SX, SY); await wait(60); await touch('touchEnd', 0, 0); await wait(120);
R.tapHintFallsSilent = (await st()).hint === '';

// 14) restart resets
await page.click('#restart'); await wait(200); const reset = await st();
R.reset = reset.pulse === 'felt 0 · 40' && reset.scroll === 0 && reset.ticks === 0;
R.noErrors = errors.length === 0;

const fails = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
console.log(JSON.stringify({ pass: Object.keys(R).length - fails.length, of: Object.keys(R).length, fails, errors,
  detail: { sels, parked: [...parked], ticksBeforeRoll, ticksAfterRoll, pagedRows: afterPage.top, pagedScroll: afterPage.scroll,
    pages: afterPage.pages, ratchetDelta: topRatchet - topBefore, litName, liftName: afterLift.sheetName, scrolledBy,
    snapScroll: snapped.scroll, snapTop: snapped.top, rowH } }, null, 2));
await browser.close();
console.log(fails.length ? `seed walkthrough: ${fails.length} claim(s) failed — ${fails.join(', ')}` : 'seed walkthrough: every claim held');
process.exit(fails.length ? 1 : 0);
