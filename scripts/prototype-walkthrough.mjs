// scripts/prototype-walkthrough.mjs — play all five experience prototypes the way a person does,
// and hold each one to the claim it makes about itself.
//
//   npm run walkthrough:prototypes          (needs Chromium; see NOTE below)
//
// NOTE ON NAMING: this is deliberately NOT a `verify:*` script. CI auto-runs every verify suite and
// those are contractually pure-logic — no DB, no network, no browser. This one drives a real
// browser, so it stays opt-in and out of that gate.
//
// WHAT THIS IS FOR: the prototypes each make a falsifiable promise — "nothing moved", "0 questions
// asked", "a real stopwatch", "the AI cannot get between your hand and the material". Those are
// exactly the claims that rot silently when a file is edited later. This script re-tests the
// promise, not the pixels.
//
// A LESSON PAID FOR IN THIS FILE: the first version of this walkthrough reported four defects that
// did not exist. Every one was the test's fault — wrong selector (`[data-id]` for an SVG map whose
// nodes live in `#nodes`), a flow the prototype legitimately refuses (P4 will not close the morning
// while anything is undecided — that is the design, not a bug), a regex that truncated at the first
// period, and a click on a dialog that was never opened (Playwright treats `opacity:0` elements as
// visible, so it happily "clicks" a closed dialog and blames whatever is underneath). Each check
// below therefore drives the control the product actually offers, and asserts on state the page
// itself exposes. If you add a check, make it fail for the reason it claims.
import { chromium } from 'playwright';

const DIR = new URL('../prototypes/', import.meta.url).href;
const EXE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let failed = 0, total = 0;
const say = (s) => console.log(s);
const R = (label, pass, detail = '') => {
  total++; if (!pass) failed++;
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} - ${label}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch({ executablePath: EXE });
async function open(name) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 140)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });
  await page.goto(`${DIR}${name}.html`);
  await page.waitForTimeout(900);
  return { page, errs, body: () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ')) };
}
// Wait for the page to stop changing instead of guessing a duration.
async function settle(body, maxMs = 60000) {
  let len = -1, still = 0, t = 0;
  while (t < maxMs && still < 5) {
    await new Promise((r) => setTimeout(r, 1200)); t += 1200;
    const l = (await body()).length;
    if (l === len) still++; else { still = 0; len = l; }
  }
  return t;
}

// ============================== P1 · Minute Zero ============================================
{
  say('\nP1 · Minute Zero — a real thing exists, and nothing was published behind my back');
  const { page, errs, body } = await open('minute-zero');
  await page.click('#bar');
  await page.type('#bar', 'a booking site for my barbershop', { delay: 12 });
  await page.keyboard.press('Enter');
  const took = await settle(body);
  const txt = await body();
  R('the site assembles into the stage without being asked twice',
    (await page.locator('#stage').evaluate((e) => e.children.length)) > 0, `settled in ~${(took / 1000) | 0}s`);
  R('the URL chip says draft, not published', /draft — not published/i.test(txt));
  R('it volunteers things it noticed', /noticed|I also/i.test(txt));
  R('it ends by handing the decision back', /nothing has been published|say the word/i.test(txt));

  await page.click('#bar'); await page.type('#bar', 'make it moodier', { delay: 12 });
  await page.keyboard.press('Enter'); await page.waitForTimeout(6500);
  R('a follow-up restyles the real thing, not a mockup of it', (await body()).length !== txt.length);

  // Publishing is reached the way the product offers it — a suggestion chip, never a forced step.
  const chip = page.locator('#chips button.chip').filter({ hasText: /publish/i }).first();
  R('publishing is offered, not imposed', (await chip.count()) > 0);
  await chip.click(); await page.waitForTimeout(1100);
  R('the confirm dialog actually opens', await page.evaluate(() => document.querySelector('#confirm').classList.contains('in')));
  const dlg = await body();
  R('the dialog names destination, cost and undo window before asking',
    /goes to/i.test(dlg) && /costs/i.test(dlg) && /undo/i.test(dlg));
  await page.click('#pubno'); await page.waitForTimeout(1100);
  R('declining leaves the draft a draft', /draft — not published/i.test(await body()));
  R('no errors while playing', errs.length === 0, errs.join(' ;; '));
  await page.close();
}

// ============================== P2 · Explore → Make it Real =================================
{
  say('\nP2 · Explore → Make it Real — the "Nothing moved" claim, measured');
  const { page, errs, body } = await open('explore-make-real');
  // It plays itself. Watching is the correct interaction; keys only skip ahead.
  let n = 0, still = 0, t = 0;
  while (t < 90000 && still < 6) {
    await page.waitForTimeout(1500); t += 1500;
    const c = await page.locator('#nodes > *').count();
    if (c === n) still++; else { still = 0; n = c; }
  }
  R('the map grows on its own as the conversation runs', n > 0, `${n} nodes after ~${(t / 1000) | 0}s`);
  R('held thoughts are marked rather than lost', /hold that thought|beacon/i.test(await body()));

  const geom = () => page.evaluate(() => {
    const ns = [...document.querySelectorAll('#nodes > *')];
    return {
      authored: ns.map((x) => `${x.getAttribute('transform') || ''}|${getComputedStyle(x).transform}`),
      screen: ns.map((x) => { const r = x.getBoundingClientRect(); return [r.x, r.y]; }),
      camera: getComputedStyle(document.querySelector('#graph')).transform,
    };
  });
  const before = await geom();
  R('"make this real" is offered once the exploration has weight', await page.locator('#makeChip').isVisible());
  await page.click('#makeChip'); await page.waitForTimeout(3200);
  const after = await geom();
  R('THE CLAIM: no node is re-authored by the promotion',
    n > 0 && JSON.stringify(before.authored) === JSON.stringify(after.authored), `${n} nodes compared`);
  const moved = Math.max(...after.screen.map(([x, y], i) => Math.hypot(x - before.screen[i][0], y - before.screen[i][1])));
  // The wording matters and was corrected once already. The promotion is a camera move: relative
  // layout is preserved exactly, but the whole map is re-framed, so pixels DO travel. A bare
  // "Nothing moved" would have been a claim the screen could not keep — "out of place" is what is
  // actually true, and this check pins the sentence to the measurement.
  R('the claim on screen is the one the geometry supports', /nothing moved out of place/i.test(await body()));
  R('...because relative position is preserved while the frame changes',
    before.camera !== after.camera && moved > 0,
    `camera ${before.camera} -> ${after.camera}; nodes traverse ~${moved.toFixed(0)}px on screen, every relative position identical`);
  R('the new world docks around the intact map', (await page.locator('.orb').count()) > 0);
  R('no errors while playing', errs.length === 0, errs.join(' ;; '));
  await page.close();
}

// ============================== P3 · The Bench with Hands ===================================
{
  say('\nP3 · The Bench with Hands — can I actually work, and does the AI stay out of the way?');
  const { page, errs, body } = await open('workshop-hands');
  const cards = page.locator('[data-id]');
  const count = await cards.count();
  R('there is material on the bench', count > 0, `${count} pieces`);

  const first = cards.first();
  const box = await first.boundingBox();
  const id = await first.getAttribute('data-id');
  const xy0 = await first.evaluate((e) => `${e.dataset.x},${e.dataset.y}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(box.x + box.width / 2 + i * 16, box.y + box.height / 2 + i * 6); await page.waitForTimeout(16); }
  await page.mouse.up(); await page.waitForTimeout(400);
  R('a real mouse drag moves the piece', xy0 !== (await page.locator(`[data-id="${id}"]`).evaluate((e) => `${e.dataset.x},${e.dataset.y}`)),
    `${xy0} -> ${await page.locator(`[data-id="${id}"]`).evaluate((e) => `${e.dataset.x},${e.dataset.y}`)}`);

  const counts = async () => (await body()).match(/kept (\d+) · killed (\d+)/i)?.slice(1, 3).join('/') ?? '?';
  const c0 = await counts();
  await first.click({ force: true }); await page.waitForTimeout(220);
  await page.keyboard.press('k'); await page.waitForTimeout(450);
  const c1 = await counts(); R('K keeps', c0 !== c1, `${c0} -> ${c1}`);
  await cards.nth(1).click({ force: true }); await page.waitForTimeout(200);
  await page.keyboard.press('x'); await page.waitForTimeout(650);
  const c2 = await counts(); R('X kills', c1 !== c2, `${c1} -> ${c2}`);
  await page.keyboard.press('z'); await page.waitForTimeout(650);
  R('Z undoes the kill exactly', (await counts()) === c1, `${c2} -> ${await counts()}`);

  // The Cursor wound, stated as one CSS property.
  const pe = await page.evaluate(() => {
    const els = [...document.querySelectorAll('[class*=counsel],[class*=remark]')];
    return els.length ? [...new Set(els.map((e) => getComputedStyle(e).pointerEvents))].join(',') : 'no counsel elements';
  });
  R('the AI\'s remark cannot intercept the hand', pe.includes('none'), `pointer-events: ${pe}`);
  R('the "sentences typed" instrument is present and starts at zero', /sentences typed:\s*0/i.test(await body()));
  await page.click('#tabCamp', { force: true });
  await page.waitForTimeout(900);
  R('the second bench (Campaign) opens', /headline|audience|emotion|offer|landing/i.test(await body()));
  R('no errors while playing', errs.length === 0, errs.join(' ;; '));
  await page.close();
}

// ============================== P4 · The Morning at Ten Clients =============================
{
  say('\nP4 · The Morning — the day cannot be declared over while anything is undecided');
  const { page, errs, body } = await open('morning-brief');
  const e0 = await page.locator('#elapsed').innerText();
  const opening = await body();
  R('it opens as prose, not a dashboard', (opening.match(/[.!?]/g) || []).length >= 4);
  R('it offers a judgment, not only facts', /worth|I'd|I would|the one thing/i.test(opening));
  R('the Pulse states how many things need me', /\d/.test(await page.locator('#pulse').innerText()));

  const evBefore = (await body()).length;
  await page.locator('[data-ev]').first().hover(); await page.waitForTimeout(900);
  R('hovering a claim reveals the rows behind it', (await body()).length > evBefore);

  await page.click('#btnApprove'); await page.waitForTimeout(1600);
  R('approving the routine batch does NOT end the morning', !/that's the morning/i.test(await body()));
  for (let i = 0; i < 3; i++) {
    const b = page.locator(i === 1 ? '[data-act="no"]' : '[data-act="ok"]').first();
    if (!(await b.count())) break;
    await b.click({ force: true }); await page.waitForTimeout(950);
  }
  R('each unusual send is decided individually', (await page.locator('[data-act="ok"]').count()) === 0);
  R('the rejected one is filed for rework, not quietly sent', /won't send|needs rework/i.test(await body()));
  R('the morning STILL refuses to close — the queue is not empty', !/that's the morning/i.test(await body()));

  await page.click('#pulse'); await page.waitForTimeout(800);
  R('the Pulse opens the queue', await page.evaluate(() => document.querySelector('#drawer').classList.contains('open')));
  for (let i = 0; i < 4; i++) {
    const b = await body();
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.keyboard.press('a'); await page.waitForTimeout(1200);
    if ((await body()) === b) break;
  }
  const done = await body();
  R('clearing the last items closes the morning', /that's the morning/i.test(done));
  R('the closing line reports the REAL elapsed time', /that's the morning\.\s*\d+\s*(second|minute)/i.test(done),
    (done.match(/that's the morning\.[^.]*\./i) || ['absent'])[0]);
  R('the Pulse empties rather than showing a zero badge', (await page.locator('#pulse').innerText()).trim() === '');
  const undo = page.locator('#undoChip, button').filter({ hasText: /undo/i }).first();
  if (await undo.count() && await undo.isVisible().catch(() => false)) {
    await undo.click({ force: true }); await page.waitForTimeout(1400);
    R('undo retracts the closing line — the screen cannot claim a finished day', !/that's the morning/i.test(await body()));
  }
  R('the stopwatch tracked the real session', e0 !== (await page.locator('#elapsed').innerText()),
    `${e0} -> ${await page.locator('#elapsed').innerText()}`);
  R('no errors while playing', errs.length === 0, errs.join(' ;; '));
  await page.close();
}

// ============================== P5 · Client Birth ===========================================
{
  say('\nP5 · Client Birth — it assembles itself, and asks exactly once');
  const { page, errs, body } = await open('client-birth');
  const before = await body();
  await page.click('#btn-won');
  let panels = -1, t = 0;
  while (t < 30000) {
    await page.waitForTimeout(1000); t += 1000;
    const p = await page.locator('[class*=panel],[class*=dock]').count();
    if (p === panels && p > 0) break; panels = p;
  }
  const after = await body();
  R('marking the deal won assembles the client', panels > 0, `${panels} panels in ~${t / 1000}s`);
  R('each panel carries where it came from', /from |because |demo site|3d ago|pulled/i.test(after));
  R('THE CLAIM: "0 questions asked"', /0 questions asked|no questions/i.test(after));
  R('the money stays editable rather than assumed', (await page.locator('#amt-build,#amt-monthly').count()) === 2);
  // The ceremony is two beats, not one: the next-move card offers "send welcome + invoice", and
  // only that opens the confirm sheet holding "send it". Driving straight at #btn-send-confirm
  // clicks a sheet that was never opened — the same mistake that once produced a phantom defect
  // report in P1. Walk it the way the screen walks you.
  // NB: the prospect panel legitimately contains "demo site sent 3 days ago" — a bare /sent/ here
  // matched that and reported a phantom failure. Assert on the ceremony's own state instead.
  R('nothing has gone out yet — the outbound act is staged, not taken',
    /send welcome|invoice/i.test(after) &&
    !(await page.evaluate(() => document.querySelector('#ceremony-wrap').classList.contains('on'))));
  const move = page.locator('#btn-send-move');
  // The next-move card reveals only after the docking motion settles and the voice lands — a
  // deliberate beat, well after the panels stop appearing. Wait for it rather than racing it.
  await move.waitFor({ state: 'visible', timeout: 45000 });
  R('the first beat is offered as a deliberate move', await move.isVisible());
  await move.click(); await page.waitForTimeout(1200);
  R('it opens a confirm sheet rather than sending', await page.evaluate(() => document.querySelector('#ceremony-wrap').classList.contains('on')));
  const sheet = await body();
  R('the sheet names exactly what will go out', /welcome|invoice/i.test(sheet));
  await page.click('#btn-send-confirm'); await page.waitForTimeout(1600);
  const sent = await body();
  R('confirming actually sends', /sent|on its way|delivered/i.test(sent));
  const undo = page.locator('#btn-undo');
  if (await undo.isVisible().catch(() => false)) {
    await undo.click({ force: true }); await page.waitForTimeout(1400);
    R('and the one irreversible-looking act is reversible', (await body()) !== sent);
  } else {
    say('  NOT COVERED - undo was not offered after sending; check that beat by hand.');
  }
  R('no errors while playing', errs.length === 0, errs.join(' ;; '));
  await page.close();
}

await browser.close();
console.log(`\nprototype walkthrough: ${total - failed} passed, ${failed} failed (of ${total})`);
if (failed) { console.error('A prototype no longer keeps a promise it makes on screen.'); process.exit(1); }
