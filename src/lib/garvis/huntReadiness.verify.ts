// src/lib/garvis/huntReadiness.verify.ts — the hunt/send readiness contract (npm run verify:huntreadiness).

import { huntReadiness, readinessLine, type ReadinessInputs } from './huntReadiness';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

const ALL: ReadinessInputs = {
  appOriginSet: true, placesKeySet: true, resendKeySet: true,
  fromEmail: 'me@my.co', physicalAddress: '1 Main St, Town', outboundEnabled: true, clockArmed: true,
};
const none: ReadinessInputs = {
  appOriginSet: false, placesKeySet: false, resendKeySet: false,
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
check('the APP_ORIGIN item flags the silent-failure risk', noOrigin.items.find((i) => i.key === 'app_origin')?.fix.includes('NO pitch') === true);

// Places gates hunting but not sending.
const noPlaces = huntReadiness({ ...ALL, placesKeySet: false });
check('no Places key blocks hunting', !noPlaces.canHunt);
check('no Places key does NOT block sending an already-built pitch', noPlaces.canSend);

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
check('summary is fully-ready when everything is set', readinessLine(full).startsWith('Ready'));
check('summary names the not-ready-to-hunt state', readinessLine(empty).includes('Not ready to hunt'));
check('summary distinguishes hunt-ok-send-missing', readinessLine(huntReadiness({ ...none, placesKeySet: true, appOriginSet: true })).includes('sending is not configured'));

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} hunt-readiness check(s) failed`);
