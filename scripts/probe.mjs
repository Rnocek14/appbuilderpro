// scripts/probe.mjs — a GENERIC behavioural prober for self-contained interactive pages.
//
//   node scripts/probe.mjs prototypes/*.html
//   node scripts/probe.mjs prototypes/minute-zero.html --verbose
//
// WHY THIS EXISTS
// The interaction lint in supabase/functions/_shared/qa.ts reads source and guesses. This runs the
// page. It is deliberately generic — it knows nothing about any particular prototype, discovers the
// controls itself, and exercises them. That is what makes it usable as the test half of a
// generate → test loop: a bespoke suite has to be written after the thing exists, this does not.
//
// WHAT IT ASSERTS (all generic, all falsifiable)
//   A  loads clean               — no console/page errors on first paint
//   B  settles                   — the page stops changing instead of churning forever
//   C  no dead controls          — every visible control produces an observable change when used
//   D  survives use              — no errors thrown while exercising anything
//   E  keyboard-reachable        — every control can be focused
//   F  reduced-motion survives   — still settles and still responds with motion off
//   G  no horizontal overflow    — at 1440, 1024 and 390 wide
//
// WHAT IT CANNOT ASSERT — read this before quoting a score.
// It cannot tell you the thing is any GOOD. It cannot judge whether a flow makes sense, whether the
// writing is honest, whether the one orchestrated move lands, or whether a person would want to use
// it. It proves a page is not broken. "Not broken" and "works" are different claims, and only the
// first one is measured here.
//
// Each control is exercised from a FRESH page load, so one interaction's side effects cannot mask
// or manufacture another's. That is slow on purpose.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const files = args.filter((a) => !a.startsWith('--'));
if (!files.length) { console.error('usage: node scripts/probe.mjs <file.html> [...]'); process.exit(2); }
import { existsSync } from 'node:fs';
// Prefer an explicit CHROMIUM_PATH, then this container's pinned build, then let Playwright find
// whatever it installed (which is what happens in CI). Passing a nonexistent executablePath fails
// with a confusing "browser not found", so only pass it when it is really there.
const PINNED = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const LAUNCH = existsSync(PINNED) ? { executablePath: PINNED } : {};

// Controls that are *supposed* to be no-ops from a resting state, so a "nothing changed" verdict
// on them would be a false accusation rather than a finding.
const EXEMPT = /^(⟲|↺|⟳|↻)$/;
const EXEMPT_LABEL = /restart|reset|reload/i;

const browser = await chromium.launch(LAUNCH);

// A signature of what a person can currently see. Compared before/after an interaction to decide
// whether the control did anything at all.
const SIGNATURE = `() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.opacity !== '0'; };
  const els = [...document.querySelectorAll('*')].filter(vis);
  return JSON.stringify({
    text: document.body.innerText.replace(/\\s+/g, ' ').trim(),
    visible: els.length,
    classes: document.documentElement.className + '|' + document.body.className,
    marks: els.filter((e) => e.tagName === 'BUTTON' || e.getAttribute('role') === 'button').length,
  });
}`;

async function newPage(file, opts = {}) {
  const ctx = await browser.newContext({
    viewport: opts.viewport || { width: 1440, height: 900 },
    reducedMotion: opts.reducedMotion ? 'reduce' : 'no-preference',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).split('\n')[0].slice(0, 120)}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 120)}`); });
  await page.goto(`file://${resolve(file)}`);
  return { page, ctx, errors };
}

/**
 * Wait until the page stops CHURNING. Deliberately blind to digits: a prototype with a real
 * stopwatch never produces two identical text snapshots, and calling that "never settled" was the
 * prober's own bug — it failed morning-brief for keeping an honest clock. Structure and words are
 * what must go quiet. Dead-control detection below uses the FULL signature, because there a changed
 * number is exactly the change we are looking for.
 */
const deTick = (sig) => sig.replace(/\d+/g, '#');
async function settle(page, maxMs = 75000) {
  let prev = '', still = 0, t = 0;
  while (t < maxMs) {
    await page.waitForTimeout(1000); t += 1000;
    const sig = deTick(await page.evaluate(`(${SIGNATURE})()`));
    if (sig === prev) { if (++still >= 4) return t; } else { still = 0; prev = sig; }
  }
  return -1;
}

/** Every control a person could plausibly use right now, in DOM order. */
const INVENTORY = `() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.opacity !== '0' && s.pointerEvents !== 'none'; };
  const out = [];
  document.querySelectorAll('button, [role=button], a[href], input, textarea, select, [contenteditable]').forEach((el, i) => {
    if (!vis(el)) return;
    if (!el.dataset.probeId) el.dataset.probeId = 'probe-' + i;
    out.push({
      id: el.dataset.probeId,
      tag: el.tagName.toLowerCase(),
      label: (el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().slice(0, 34),
      isField: /^(input|textarea)$/.test(el.tagName.toLowerCase()) || el.isContentEditable,
      // A tab/toggle already in its selected state SHOULD do nothing when clicked again. Counting
      // that as a dead control was a false accusation against workshop-hands' active tab.
      alreadyActive: el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-pressed') === 'true'
        // NOTE the doubled backslashes: this whole block is a template literal, so a lone \\b would
        // be consumed as a backspace escape and the regex would silently never match. It did
        // exactly that on the first attempt, and the fix looked applied while changing nothing.
        || /\\b(on|active|selected|sel|current)\\b/.test(typeof el.className === 'string' ? el.className : ''),
      focusable: el.tabIndex >= 0 || /^(button|a|input|textarea|select)$/.test(el.tagName.toLowerCase()),
    });
  });
  return out;
}`;

async function probe(file) {
  const name = file.split('/').pop();
  const findings = [];
  const note = (ok, label, detail = '') => findings.push({ ok, label, detail });

  // ---- A. loads clean, B. settles -----------------------------------------------------------
  let { page, ctx, errors } = await newPage(file);
  const loadErrors = [...errors];
  note(loadErrors.length === 0, 'A · loads without errors', loadErrors.join(' ;; '));
  const settledIn = await settle(page);
  note(settledIn >= 0, 'B · reaches a settled state', settledIn >= 0 ? `~${settledIn / 1000}s` : 'never stopped changing');

  // ---- inventory at rest, then after the primary move ----------------------------------------
  let controls = await page.evaluate(`(${INVENTORY})()`);
  const restingCount = controls.length;
  const primary = controls.find((c) => !c.isField && !c.alreadyActive && !EXEMPT.test(c.label) && !EXEMPT_LABEL.test(c.label) && c.label);
  if (primary) {
    await page.click(`[data-probe-id="${primary.id}"]`, { timeout: 8000 }).catch(() => {});
    await settle(page, 45000);
    const after = await page.evaluate(`(${INVENTORY})()`);
    for (const c of after) if (!controls.some((x) => x.id === c.id)) controls.push({ ...c, afterPrimary: true });
  }
  note(true, `· inventory`, `${restingCount} controls at rest, ${controls.length} reachable in the first flow`);

  // ---- E. keyboard reachability ---------------------------------------------------------------
  const unfocusable = controls.filter((c) => !c.focusable && !c.isField);
  note(unfocusable.length === 0, 'E · every control is keyboard-focusable',
    unfocusable.length ? unfocusable.map((c) => `"${c.label}"`).join(', ') : '');

  // ---- G. no horizontal overflow at three widths ----------------------------------------------
  // Each width gets a FRESH load and its own settle. Resizing a page that already laid itself out
  // at 1440 reports overflow that a phone user would never see — that artifact produced a phantom
  // finding against explore-make-real, which is clean when actually loaded at 390.
  const overflow = [];
  for (const w of [1440, 1024, 390]) {
    const s2 = await newPage(file, { viewport: { width: w, height: 860 } });
    await settle(s2.page, 45000);
    if (primary) { await s2.page.evaluate(`(${INVENTORY})()`);
      await s2.page.click(`[data-probe-id="${primary.id}"]`, { timeout: 8000 }).catch(() => {});
      await settle(s2.page, 45000); }
    const over = await s2.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 1) overflow.push(`${w}px by ${over}px`);
    await s2.ctx.close();
  }
  note(overflow.length === 0, 'G · no horizontal overflow', overflow.length ? `body scrolls sideways at ${overflow.join(', ')}` : '');
  await ctx.close();

  // ---- C + D. exercise each control from a FRESH load ------------------------------------------
  const dead = [], threw = [];
  const budget = controls.filter((c) => !c.alreadyActive && !EXEMPT.test(c.label) && !EXEMPT_LABEL.test(c.label)).slice(0, 14);
  for (const c of budget) {
    const s = await newPage(file);
    try {
      await settle(s.page, 45000);
      // Re-walk the same path if this control only exists after the primary move.
      if (c.afterPrimary && primary) {
        await s.page.evaluate(`(${INVENTORY})()`);
        await s.page.click(`[data-probe-id="${primary.id}"]`, { timeout: 8000 }).catch(() => {});
        await settle(s.page, 45000);
      }
      await s.page.evaluate(`(${INVENTORY})()`);
      const sel = `[data-probe-id="${c.id}"]`;
      if (!(await s.page.locator(sel).count())) { await s.ctx.close(); continue; }
      const before = await s.page.evaluate(`(${SIGNATURE})()`);
      const errBefore = s.errors.length;
      if (c.isField) {
        await s.page.fill(sel, 'a booking site for my barbershop').catch(() => {});
        await s.page.press(sel, 'Enter').catch(() => {});
      } else {
        await s.page.click(sel, { timeout: 8000 }).catch(() => {});
      }
      await s.page.waitForTimeout(2200);
      const after = await s.page.evaluate(`(${SIGNATURE})()`);
      if (after === before) dead.push(`${c.tag} "${c.label || '(no label)'}"`);
      if (s.errors.length > errBefore) threw.push(`${c.tag} "${c.label}" → ${s.errors[errBefore]}`);
    } catch (e) {
      threw.push(`${c.tag} "${c.label}" → probe error: ${String(e).split('\n')[0].slice(0, 80)}`);
    }
    await s.ctx.close();
  }
  note(dead.length === 0, 'C · no dead controls', dead.length ? `nothing happens on: ${dead.join(', ')}` : `${budget.length} exercised`);
  note(threw.length === 0, 'D · nothing throws when used', threw.join(' ;; '));

  // ---- F. reduced motion ------------------------------------------------------------------------
  {
    const s = await newPage(file, { reducedMotion: true });
    const rmSettled = await settle(s.page, 60000);
    let responded = false;
    if (primary) {
      await s.page.evaluate(`(${INVENTORY})()`);
      const before = await s.page.evaluate(`(${SIGNATURE})()`);
      await s.page.click(`[data-probe-id="${primary.id}"]`, { timeout: 8000 }).catch(() => {});
      await s.page.waitForTimeout(2500);
      responded = (await s.page.evaluate(`(${SIGNATURE})()`)) !== before;
    }
    note(rmSettled >= 0 && (!primary || responded) && s.errors.length === 0,
      'F · works with reduced motion',
      s.errors.length ? s.errors[0] : rmSettled < 0 ? 'never settled' : responded || !primary ? '' : 'primary control did nothing');
    await s.ctx.close();
  }

  return { name, findings };
}

const results = [];
for (const f of files) {
  process.stdout.write(`probing ${f} … `);
  const r = await probe(f);
  const failed = r.findings.filter((x) => !x.ok).length;
  console.log(failed ? `${failed} problem(s)` : 'clean');
  results.push(r);
}
await browser.close();

console.log('\n' + '='.repeat(78));
let totalFail = 0;
for (const r of results) {
  const fails = r.findings.filter((f) => !f.ok);
  totalFail += fails.length;
  console.log(`\n${r.name}  —  ${fails.length ? `${fails.length} PROBLEM(S)` : 'no problems found'}`);
  for (const f of r.findings) {
    if (f.label.startsWith('·')) { if (VERBOSE) console.log(`     ${f.label} ${f.detail}`); continue; }
    if (!f.ok || VERBOSE) console.log(`  ${f.ok ? 'ok  ' : 'FAIL'} ${f.label}${f.detail ? ' — ' + f.detail : ''}`);
  }
}
console.log(`\n${'='.repeat(78)}\n${results.length} page(s) probed · ${totalFail} problem(s) total`);
console.log('Reminder: this proves "not broken", which is not the same claim as "good".');
process.exit(totalFail ? 1 : 0);
