// src/lib/garvis/email/senderDomain.verify.ts — per-brand sending-domain core (npm run verify:senderdomain).

import {
  normalizeSenderDomain, coerceStatus, parseResendDomain, domainConnState, isDeliveryReady,
  summarizeRecords, statusLabel, fromAddressFor,
} from './senderDomain';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

// ── normalize ────────────────────────────────────────────────────────────
check('strips scheme + path to a bare host', normalizeSenderDomain('https://Mail.Acme.com/x') === 'mail.acme.com');
check('rejects junk', normalizeSenderDomain('not a domain') === null && normalizeSenderDomain('') === null);

// ── status coercion (never a false verified) ─────────────────────────────
check('known status passes through', coerceStatus('verified') === 'verified');
check('unknown status becomes pending, never verified', coerceStatus('weird') === 'pending' && coerceStatus(undefined) === 'pending');
check('coercion is case-insensitive', coerceStatus('VERIFIED') === 'verified');

// ── parse Resend payload ─────────────────────────────────────────────────
const resp = {
  id: 'dom_123', name: 'acme.com', status: 'pending',
  records: [
    { record: 'SPF', name: 'send', type: 'MX', value: 'feedback-smtp.us-east-1.amazonses.com', ttl: 'Auto', status: 'verified', priority: 10 },
    { record: 'DKIM', name: 'resend._domainkey', type: 'TXT', value: 'p=MIGf...', status: 'pending' },
  ],
};
const parsed = parseResendDomain(resp);
check('parse pulls provider id + status', parsed.providerDomainId === 'dom_123' && parsed.status === 'pending');
check('parse keeps records with type upper-cased', parsed.records.length === 2 && parsed.records[0].type === 'MX' && parsed.records[0].priority === 10);
check('parse tolerates a missing records array', parseResendDomain({ id: 'd', status: 'not_started' }).records.length === 0);
check('parse tolerates an empty payload without throwing', parseResendDomain(null).providerDomainId === null && parseResendDomain(undefined).status === 'pending');

// ── conn state + delivery-ready ──────────────────────────────────────────
check('verified → connected + delivery ready', domainConnState('verified') === 'connected' && isDeliveryReady('verified'));
check('pending/not_started → pending, not ready', domainConnState('pending') === 'pending' && domainConnState('not_started') === 'pending' && !isDeliveryReady('pending'));
check('failure + temporary_failure → error', domainConnState('failure') === 'error' && domainConnState('temporary_failure') === 'error');

// ── record summary ───────────────────────────────────────────────────────
const sum = summarizeRecords(parsed.records);
check('summary counts verified vs pending', sum.total === 2 && sum.verified === 1 && sum.pending === 1);
check('a record with no status counts as pending', summarizeRecords([{ name: 'x', type: 'TXT', value: 'v' }]).verified === 0);

// ── labels + from-address ────────────────────────────────────────────────
check('every status has a human label', (['not_started', 'pending', 'verified', 'failure', 'temporary_failure'] as const).every((s) => statusLabel(s).length > 0));
check('from-address builds hello@domain by default', fromAddressFor('acme.com') === 'hello@acme.com');
check('from-address honors a clean local part', fromAddressFor('acme.com', 'Bookings') === 'bookings@acme.com');
check('a junk local part falls back to hello', fromAddressFor('acme.com', '!!!') === 'hello@acme.com');

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} sender-domain check(s) failed`);
