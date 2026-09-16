// src/lib/garvis/huntReadiness.verify.ts — the hunt/send readiness contract (npm run verify:huntreadiness).

import { huntReadiness, readinessLine, type ReadinessInputs } from './huntReadiness';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

const ALL: ReadinessInputs = {
  appOriginSet: true, aiKeySet: true, placesKeySet: true, resendKeySet: true,
  fromEmail: 'me@my.co', physicalAddress: '1 Main St, Town', outboundEnabled: true, clockArmed: true,
};
const none: ReadinessInputs = {
  appOriginSet: false, aiKeySet: false, placesKeySet: false, resendKeySet: false,
  fromEmail: null, physicalAddress: null, outboundEnabled: false, clockArmed: false,
};

const full = huntReadiness(ALL);
check('all prerequisites met → every gate open', full.canHunt && full.canSend && full.canAutoHunt);
check('all items pass when fully configured', full.items.every((i) => i.ok));

const empty = huntReadiness(none);
check('nothing configured → every gate closed', !empty.canHunt && !empty.canSend && !empty.canAutoHunt);
check('every item reports a concrete fix', empty.items.every((i) => i.fix.length > 20));

// APP_ORIGIN is the silent blocker: unset ⇒ can't hunt AND can't send, even with everything else.
const noOrigin = huntReadiness({ ...ALL, appOriginSet: false });
check('APP_ORIGIN unset blocks hunting (broken demo links)', !noOrigin.canHunt);
check('APP_ORIGIN unset blocks sending too', !noOrigin.canSend);
check('the app-address item flags the silent-failure risk', noOrigin.items.find((i) => i.key === 'app_origin')?.fix.includes('NO email') === true);

// ── WHAT COUNTS AS BEING ABLE TO SEARCH ────────────────────────────────────
// This panel used to require a Google Places key to hunt at all. That stopped being true when
// Claude discovery landed: discover-run finds real businesses with nothing but the Claude key, and
// the Start page correctly calls Places optional. The light was telling a fully-working account it
// was not ready. Either finder is enough, and neither is required for sending.
const claudeOnly = huntReadiness({ ...ALL, placesKeySet: false });
check('a Claude key alone is enough to search', claudeOnly.canHunt);
check('Google’s key alone is also enough to search', huntReadiness({ ...ALL, aiKeySet: false }).canHunt);
const noFinder = huntReadiness({ ...ALL, aiKeySet: false, placesKeySet: false });
check('nothing to search with blocks searching', !noFinder.canHunt);
check('nothing to search with does NOT block sending an already-built email', noFinder.canSend);
check('the finder item names Claude as the one that is needed', noFinder.items.find((i) => i.key === 'finder')?.fix.includes('Claude') === true);

// Every fix has to name a place in this app, not an environment variable — the whole point of the
// rewrite. A fix that says GOOGLE_PLACES_API_KEY is a fix only a developer can act on.
check('no fix instructs the owner to set an environment variable', huntReadiness(none).items.every((i) => !/[A-Z][A-Z0-9]+_[A-Z0-9_]+/.test(i.fix)));
check('every fix names a screen in this app', huntReadiness(none).items.every((i) => /Start here|Settings/.test(i.fix)));

// CAN-SPAM address gates sending, not hunting.
const noAddr = huntReadiness({ ...ALL, physicalAddress: '  ' });
check('blank mailing address blocks sending', !noAddr.canSend);
check('blank mailing address does not block hunting', noAddr.canHunt);

// Kill switch off blocks sending only.
const switchedOff = huntReadiness({ ...ALL, outboundEnabled: false });
check('kill switch off blocks sending', !switchedOff.canSend);
check('kill switch off leaves hunting intact', switchedOff.canHunt);

// Clock gates ONLY the automatic daily hunt — on-demand hunt/send still work.
const noClock = huntReadiness({ ...ALL, clockArmed: false });
check('unarmed clock blocks only the auto daily hunt', noClock.canHunt && noClock.canSend && !noClock.canAutoHunt);

// The summary line reflects the real state.
check('summary says everything is set up when it is', /everything is set up/i.test(readinessLine(full)));
// The summary is the one line most owners will read. It has to be a sentence, not a status token.
check('every summary is a plain sentence, not a status word',
  [full, empty, huntReadiness({ ...ALL, clockArmed: false })].every((x) => readinessLine(x).split(/\s+/).length >= 8));
check('summary names the not-set-up-yet state and where to go', readinessLine(empty).includes('Start here'));
check('summary distinguishes can-search-but-cannot-send', readinessLine(huntReadiness({ ...none, aiKeySet: true, appOriginSet: true })).includes('nothing can be emailed yet'));

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} hunt-readiness check(s) failed`);
