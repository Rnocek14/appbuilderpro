// src/lib/garvis/clients/connections.verify.ts — the per-client connections brain (npm run verify:clientconnections).

import {
  CONNECTORS, CONNECTOR_META, connectorForChannel, requiredConnectors, seedForTier,
  deriveStatus, automationReady, connectionRollup, type ConnectorId, type ConnectionStatus,
} from './connections';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

// ── catalog ──────────────────────────────────────────────────────────────
check('catalog has all nine connectors', CONNECTORS.length === 9);
check('meta index resolves every connector', CONNECTORS.every((c) => CONNECTOR_META[c.id] === c));
check('unbuilt connectors are google_business, calendar, esign', CONNECTORS.filter((c) => !c.built).map((c) => c.id).sort().join(',') === 'calendar,esign,google_business');

// ── channel → sender connector ───────────────────────────────────────────
check('email channel → email_sender', connectorForChannel('email') === 'email_sender');
check('sms channel → sms_number', connectorForChannel('sms') === 'sms_number');

// ── requiredConnectors ───────────────────────────────────────────────────
check('missed-call needs the voice line, whatever the channel', requiredConnectors('missed_call_text_back', 'sms').join() === 'voice_number');
check('online booking needs the booking page', requiredConnectors('online_booking').join() === 'booking');
check('an email reminder needs the email sender', requiredConnectors('hygiene_recall', 'email').join() === 'email_sender');
check('an SMS reminder needs the text number', requiredConnectors('hygiene_recall', 'sms').join() === 'sms_number');
check('review_request defaults to email sender', requiredConnectors('review_request').join() === 'email_sender');

// ── seedForTier ──────────────────────────────────────────────────────────
const siteSeed = seedForTier('website');
const autoSeed = seedForTier('website_automation');
const needed = (rows: { connector: ConnectorId; status: ConnectionStatus }[]) =>
  rows.filter((r) => r.status === 'needed').map((r) => r.connector).sort().join(',');
check('every connector gets a seed row (website)', siteSeed.length === CONNECTORS.length);
check('website tier needs domain+email+payments', needed(siteSeed) === 'domain,email_sender,payments');
check('automation tier also needs sms+voice+booking', needed(autoSeed) === 'booking,domain,email_sender,payments,sms_number,voice_number');
check('an unbuilt connector never seeds as needed', autoSeed.filter((r) => ['google_business', 'calendar', 'esign'].includes(r.connector)).every((r) => r.status === 'not_needed'));

// ── deriveStatus ─────────────────────────────────────────────────────────
check('sms_number connects when the client has a number', deriveStatus('sms_number', { smsNumber: true }, 'needed') === 'connected');
check('sms_number stays needed with no number', deriveStatus('sms_number', {}, 'needed') === 'needed');
check('voice needs BOTH a config and enabled', deriveStatus('voice_number', { voiceNumber: true, voiceEnabled: false }, 'needed') === 'needed');
check('voice connects when configured AND enabled', deriveStatus('voice_number', { voiceNumber: true, voiceEnabled: true }, 'needed') === 'connected');
check('booking needs the page enabled', deriveStatus('booking', { booking: true, bookingEnabled: false }, 'needed') === 'needed');
check('payments connects on a stripe sub', deriveStatus('payments', { payments: true }, 'needed') === 'connected');
check("a human's 'not_needed' is never auto-overwritten", deriveStatus('sms_number', { smsNumber: true }, 'not_needed') === 'not_needed');
check("a manual 'pending' is preserved", deriveStatus('domain', { domain: true }, 'pending') === 'pending');
check("an 'error' is preserved for the operator to see", deriveStatus('email_sender', { emailSender: true }, 'error') === 'error');
check('a connected connector drops back to needed if evidence disappears', deriveStatus('domain', {}, 'connected') === 'needed');
check('unbuilt connectors never derive connected', deriveStatus('google_business', {}, 'needed') === 'needed');

// ── automationReady ──────────────────────────────────────────────────────
check('missed-call ready when the voice line is connected',
  automationReady('missed_call_text_back', 'email', { voice_number: 'connected' }).ready);
check('missed-call NOT ready and reports the missing line',
  automationReady('missed_call_text_back', 'email', { voice_number: 'needed' }).missing.join() === 'voice_number');
check('an SMS reminder is blocked until the text number is connected',
  !automationReady('hygiene_recall', 'sms', { sms_number: 'needed' }).ready);
check('a required connector with no row at all counts as missing',
  automationReady('online_booking', 'email', {}).missing.join() === 'booking');

// ── connectionRollup ─────────────────────────────────────────────────────
const rollup = connectionRollup([
  { connector: 'domain', status: 'connected' },
  { connector: 'email_sender', status: 'connected' },
  { connector: 'sms_number', status: 'needed' },
  { connector: 'voice_number', status: 'error' },
  { connector: 'google_business', status: 'not_needed' },
]);
check('rollup counts connected', rollup.connected === 2);
check('rollup counts needed+error as still-to-do, excludes not_needed', rollup.needed === 2);
check('rollup total excludes not_needed', rollup.total === 4);

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} connections check(s) failed`);
