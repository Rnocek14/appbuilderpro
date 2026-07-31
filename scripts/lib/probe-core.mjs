// scripts/lib/probe-core.mjs — the generic behavioural prober, as a module.
//
// Extracted so the same implementation runs against a self-contained prototype (file://) and
// against a BUILT GENERATED APP served over http://. That was the point of writing it generically:
// the generator's own QA reads source and guesses, and this is the half that runs the thing. One
// copy, so a fix to the prober's judgement reaches both callers.
//
// WHAT IT ASSERTS — all generic, all falsifiable:
//   A loads clean · B settles · C no dead controls · D nothing throws · E keyboard-reachable
//   F reduced motion survives · G no horizontal overflow at 1440/1024/390
//
// WHAT IT CANNOT ASSERT: whether the thing is any good. It proves "not broken". Those are
// different claims and only the first is measured here.

/** A signature of what a person can currently see. */
export const SIGNATURE = `() => {
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

/** Every control a person could plausibly use right now, in DOM order. */
export const INVENTORY = `() => {
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
      // A control already in its selected state SHOULD be a no-op when clicked again. Counting that
      // as dead was a false accusation the first time this ran. (Doubled backslashes: this is a
      // template literal, so a lone \\b would be eaten as a backspace escape and never match.)
      alreadyActive: el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-pressed') === 'true'
        || /\\b(on|active|selected|sel|current)\\b/.test(typeof el.className === 'string' ? el.className : ''),
      focusable: el.tabIndex >= 0 || /^(button|a|input|textarea|select)$/.test(el.tagName.toLowerCase()),
    });
  });
  return out;
}`;

// Controls that are supposed to be no-ops from a resting state.
const EXEMPT = /^(⟲|↺|⟳|↻)$/;
const EXEMPT_LABEL = /restart|reset|reload/i;

/**
 * Churn detection is blind to digits: a page with a real stopwatch never produces two identical
 * snapshots, and calling that "never settled" was this prober's own bug. Structure and words are
 * what must go quiet — dead-control detection below uses the FULL signature, because there a
 * changed number is exactly the change being looked for.
 */
const deTick = (sig) => sig.replace(/\d+/g, '#');

export async function settle(page, maxMs = 75000) {
  let prev = '', still = 0, t = 0;
  while (t < maxMs) {
    await page.waitForTimeout(1000); t += 1000;
    const sig = deTick(await page.evaluate(`(${SIGNATURE})()`));
    if (sig === prev) { if (++still >= 4) return t; } else { still = 0; prev = sig; }
  }
  return -1;
}

/**
 * Fill every empty visible text field. A control beside an empty required input correctly does
 * nothing, and calling that dead is a false accusation — it is the app validating its input. Used
 * before condemning a control, and before judging the reduced-motion response.
 * The native setter is called directly because React listens to it, not to `.value =`.
 */
async function fillEmptyFields(page) {
  return page.evaluate(() => {
    const fields = [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]), textarea')]
      .filter((e) => e.offsetParent && !e.value);
    fields.forEach((e) => {
      const set = Object.getOwnPropertyDescriptor(e.constructor.prototype, 'value').set;
      set.call(e, 'Probe a task');
      e.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return fields.length;
  });
}

/**
 * Probe one page.
 * @param browser  a launched Playwright browser
 * @param url      file:// or http:// — anything the browser can open
 * @param opts     { settleMs }
 * @returns { name, findings: [{ ok, label, detail }] }
 */
export async function probeUrl(browser, url, opts = {}) {
  const name = opts.name || url.split('/').pop();
  const findings = [];
  const note = (ok, label, detail = '') => findings.push({ ok, label, detail });
  const settleMs = opts.settleMs || 75000;

  const newPage = async (o = {}) => {
    const ctx = await browser.newContext({
      viewport: o.viewport || { width: 1440, height: 900 },
      reducedMotion: o.reducedMotion ? 'reduce' : 'no-preference',
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).split('\n')[0].slice(0, 140)}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 140)}`); });
    page.on('requestfailed', (r) => errors.push(`request failed: ${r.url().slice(0, 90)}`));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    return { page, ctx, errors };
  };

  // ---- A. loads clean, B. settles -----------------------------------------------------------
  // A is checked AFTER settling, not right after goto. A React app that throws during render does
  // so well after domcontentloaded: checking early reported "loads without errors" on a page that
  // had rendered nothing at all because a handler referenced an undefined name.
  const first = await newPage();
  const settledIn = await settle(first.page, settleMs);
  note(first.errors.length === 0, 'A · loads and renders without errors', first.errors.join(' ;; '));
  note(settledIn >= 0, 'B · reaches a settled state', settledIn >= 0 ? `~${settledIn / 1000}s` : 'never stopped changing');

  // ---- inventory at rest, then after the primary move ----------------------------------------
  let controls = await first.page.evaluate(`(${INVENTORY})()`);
  const restingCount = controls.length;
  const primary = controls.find((c) => !c.isField && !c.alreadyActive && !EXEMPT.test(c.label) && !EXEMPT_LABEL.test(c.label) && c.label);
  if (primary) {
    await first.page.click(`[data-probe-id="${primary.id}"]`, { timeout: 8000 }).catch(() => {});
    await settle(first.page, Math.min(settleMs, 45000));
    const after = await first.page.evaluate(`(${INVENTORY})()`);
    for (const c of after) if (!controls.some((x) => x.id === c.id)) controls.push({ ...c, afterPrimary: true });
  }
  note(true, '· inventory', `${restingCount} controls at rest, ${controls.length} reachable in the first flow`);
  note(restingCount > 0, 'H · offers something to do', restingCount ? '' : 'no interactive control on the resting screen');

  // ---- E. keyboard reachability --------------------------------------------------------------
  const unfocusable = controls.filter((c) => !c.focusable && !c.isField);
  note(unfocusable.length === 0, 'E · every control is keyboard-focusable',
    unfocusable.length ? unfocusable.map((c) => `"${c.label}"`).join(', ') : '');
  await first.ctx.close();

  // ---- G. overflow, on a FRESH load per width -------------------------------------------------
  // Resizing a page laid out at 1440 reports overflow a phone user would never see.
  const overflow = [];
  for (const w of [1440, 1024, 390]) {
    const s = await newPage({ viewport: { width: w, height: 860 } });
    await settle(s.page, Math.min(settleMs, 45000));
    if (primary) {
      await s.page.evaluate(`(${INVENTORY})()`);
      await s.page.click(`[data-probe-id="${primary.id}"]`, { timeout: 8000 }).catch(() => {});
      await settle(s.page, Math.min(settleMs, 45000));
    }
    const over = await s.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 1) overflow.push(`${w}px by ${over}px`);
    await s.ctx.close();
  }
  note(overflow.length === 0, 'G · no horizontal overflow', overflow.join(', '));

  // ---- C + D. exercise each control from a FRESH load -----------------------------------------
  const dead = [], threw = [];
  const budget = controls.filter((c) => !c.alreadyActive && !EXEMPT.test(c.label) && !EXEMPT_LABEL.test(c.label)).slice(0, 14);
  for (const c of budget) {
    const s = await newPage();
    try {
      await settle(s.page, Math.min(settleMs, 45000));
      if (c.afterPrimary && primary) {
        await s.page.evaluate(`(${INVENTORY})()`);
        await s.page.click(`[data-probe-id="${primary.id}"]`, { timeout: 8000 }).catch(() => {});
        await settle(s.page, Math.min(settleMs, 45000));
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
      let unchanged = (await s.page.evaluate(`(${SIGNATURE})()`)) === before;
      // SECOND CHANCE. An "Add" button beside an empty field correctly does nothing, and calling
      // that dead is a false accusation — it is the app validating its input. So before condemning
      // a control, give it something to work with and try once more. Only a control that does
      // nothing WITH the form filled is genuinely dead.
      if (unchanged && !c.isField) {
        const filled = await fillEmptyFields(s.page);
        if (filled > 0) {
          const beforeRetry = await s.page.evaluate(`(${SIGNATURE})()`);
          await s.page.click(sel, { timeout: 8000 }).catch(() => {});
          await s.page.waitForTimeout(1800);
          unchanged = (await s.page.evaluate(`(${SIGNATURE})()`)) === beforeRetry;
        }
      }
      if (unchanged) dead.push(`${c.tag} "${c.label || '(no label)'}"`);
      if (s.errors.length > errBefore) threw.push(`${c.tag} "${c.label}" → ${s.errors[errBefore]}`);
    } catch (e) {
      threw.push(`${c.tag} "${c.label}" → probe error: ${String(e).split('\n')[0].slice(0, 80)}`);
    }
    await s.ctx.close();
  }
  // An empty budget must not read as a pass: "0 exercised · ok" is how a page that rendered
  // nothing at all gets a clean bill of health.
  note(dead.length === 0 && budget.length > 0, 'C · no dead controls',
    dead.length ? `nothing happens on: ${dead.join(', ')}`
      : budget.length ? `${budget.length} exercised`
        : 'NOTHING WAS EXERCISED — there were no controls to try');
  note(threw.length === 0, 'D · nothing throws when used', threw.join(' ;; '));

  // ---- F. reduced motion -----------------------------------------------------------------------
  {
    const s = await newPage({ reducedMotion: true });
    const rm = await settle(s.page, Math.min(settleMs, 60000));
    let responded = false;
    if (primary) {
      await s.page.evaluate(`(${INVENTORY})()`);
      let before = await s.page.evaluate(`(${SIGNATURE})()`);
      await s.page.click(`[data-probe-id="${primary.id}"]`, { timeout: 8000 }).catch(() => {});
      await s.page.waitForTimeout(2500);
      responded = (await s.page.evaluate(`(${SIGNATURE})()`)) !== before;
      if (!responded && (await fillEmptyFields(s.page)) > 0) {   // same second chance as above
        before = await s.page.evaluate(`(${SIGNATURE})()`);
        await s.page.click(`[data-probe-id="${primary.id}"]`, { timeout: 8000 }).catch(() => {});
        await s.page.waitForTimeout(1800);
        responded = (await s.page.evaluate(`(${SIGNATURE})()`)) !== before;
      }
    }
    note(rm >= 0 && (!primary || responded) && s.errors.length === 0, 'F · works with reduced motion',
      s.errors.length ? s.errors[0] : rm < 0 ? 'never settled' : responded || !primary ? '' : 'primary control did nothing');
    await s.ctx.close();
  }

  return { name, findings };
}

/** Resolve a Chromium to launch: explicit env, then this container's pinned build, then whatever
 *  Playwright installed (which is the CI case). Passing a nonexistent path fails confusingly. */
export function launchOptions(existsSync) {
  const pinned = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  return existsSync(pinned) ? { executablePath: pinned } : {};
}
