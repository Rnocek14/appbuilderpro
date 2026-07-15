// src/lib/garvis/automation/detect.verify.ts — run: npx tsx src/lib/garvis/automation/detect.verify.ts
// Proves the honesty invariants of automation detection:
//   * a signal is only emitted when the thing was actually observed (missing data → no signal);
//   * a 'not_built' capability is NEVER proposed (bounded execution) — it surfaces as a gap instead;
//   * every proposal traces back to a signal that grounds it;
//   * detection is pure/deterministic.

import { detect, deriveSignals, type AuditView } from './detect';
import { CAPABILITIES, isDeliverable } from './registry';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) { pass++; } else { fail++; console.error(`✗ ${name}`); } };

// ---- a weak site with no way to make contact → manual intake → the GA lead-follow-up proposal ----
const weak: AuditView = {
  vertical: 'home_services', checks: { https: false, viewport: false, form: false, email: false },
  siteSignalIds: ['no_https', 'not_mobile', 'no_contact'],
  text: 'Joe’s Roofing. Call us for a free quote today! Serving the area since 2005.',
  tech: null,
};
const rWeak = detect(weak);
ok('weak: emits manual_intake', rWeak.signals.some((s) => s.id === 'manual_process:manual_intake'));
ok('weak: emits phone_only_booking from "call us for a free quote"', rWeak.signals.some((s) => s.id === 'manual_process:phone_only_booking'));
ok('weak: proposes lead_followup (GA)', rWeak.proposals.some((p) => p.capabilityId === 'lead_followup'));
ok('weak: every proposal traces to an emitted signal', rWeak.proposals.every((p) => rWeak.signals.some((s) => s.id === p.matchedSignal)));

// ---- HONESTY INVARIANT: no proposal is ever a 'not_built' capability, on ANY input ----
const notBuiltIds = new Set(CAPABILITIES.filter((c) => !isDeliverable(c)).map((c) => c.id));
ok('never proposes a not_built capability (weak)', rWeak.proposals.every((p) => !notBuiltIds.has(p.capabilityId)));

// phone-only booking → the online_booking / missed_call capabilities are not_built → GAPS, not proposals
ok('weak: phone_only surfaces a gap for not-built booking', rWeak.gaps.length > 0);
ok('weak: every proposal is GA or beta (never not_built)', rWeak.proposals.every((p) => p.status === 'ga' || p.status === 'beta'));

// ---- a health site with no online-booking language → the platform gap, honestly ----
const dental: AuditView = {
  vertical: 'health', checks: { https: true, viewport: true, form: true, email: true },
  siteSignalIds: [], text: 'Smile Dental. We offer cleanings and whitening. Our friendly team is here for you.',
  tech: null,
};
const rDental = detect(dental);
ok('dental: emits no_online_booking (booking vertical, no booking words)', rDental.signals.some((s) => s.id === 'platform:no_online_booking'));
ok('dental: does NOT emit manual_intake (has form + email)', !rDental.signals.some((s) => s.id === 'manual_process:manual_intake'));
ok('dental: online_booking is a gap, not a proposal', rDental.proposals.every((p) => p.capabilityId !== 'online_booking'));

// ---- a site that DOES let you book online → no booking gap asserted ----
const booked: AuditView = {
  vertical: 'health', checks: { https: true, viewport: true, form: true, email: true },
  siteSignalIds: [], text: 'Book online now for your next visit — schedule an appointment in seconds.', tech: null,
};
ok('booked: no false no_online_booking signal', !deriveSignals(booked).some((s) => s.id === 'platform:no_online_booking'));

// ---- unknown data → no fabricated signal: no text means we can't assert a booking gap ----
const noText: AuditView = { vertical: 'health', checks: { form: true, email: true }, siteSignalIds: [], text: null, tech: null };
ok('no text: no booking gap asserted (unknown, not a guess)', !deriveSignals(noText).some((s) => s.id === 'platform:no_online_booking'));

// ---- a solid, contactable site → no manual-intake signal ----
const solid: AuditView = {
  vertical: 'services', checks: { https: true, viewport: true, form: true, email: true },
  siteSignalIds: [], text: 'We are a law firm. Email us or use the form. Plenty of detail about our services here.', tech: null,
};
ok('solid: no manual_intake', !deriveSignals(solid).some((s) => s.id === 'manual_process:manual_intake'));

// ---- TECH FINGERPRINT: hard signals beat the text guess, and stay honest ----
// A DIY dental site with a real booking widget + a pixel → booking is NOT a gap; no DIY/analytics flags avoided.
const techBooked: AuditView = {
  vertical: 'health', checks: { https: true, viewport: true, form: true, email: true }, siteSignalIds: [],
  text: 'Smile Dental — no booking words here at all', // text alone would (wrongly) suggest no booking
  tech: { builder: 'wordpress', diyBuilder: false, booking: 'calendly', analytics: ['ga'], chat: null, ecommerce: null },
};
const rTechBooked = detect(techBooked);
ok('tech: booking widget present → NO no_online_booking signal (hard beats text)', !rTechBooked.signals.some((s) => s.id === 'platform:no_online_booking'));
ok('tech: analytics present → no no_analytics signal', !rTechBooked.signals.some((s) => s.id === 'platform:no_analytics'));
ok('tech: wordpress → not flagged DIY', !rTechBooked.signals.some((s) => s.id === 'stack:diy_builder'));

// A DIY Wix HVAC site, no booking, no pixel → hard booking gap + no_analytics + diy_builder, all as gaps.
const techWix: AuditView = {
  vertical: 'home_services', checks: { https: true, viewport: true, form: true, email: true }, siteSignalIds: [],
  text: 'ACME HVAC. We keep you comfortable.',
  tech: { builder: 'wix', diyBuilder: true, booking: null, analytics: [], chat: null, ecommerce: null },
};
const rWix = detect(techWix);
ok('tech: no booking widget on booking vertical → no_online_booking', rWix.signals.some((s) => s.id === 'platform:no_online_booking'));
ok('tech: no pixel → no_analytics signal', rWix.signals.some((s) => s.id === 'platform:no_analytics'));
ok('tech: wix → diy_builder signal', rWix.signals.some((s) => s.id === 'stack:diy_builder'));
ok('tech: diy_builder surfaces an informative gap (rebuild lead)', rWix.gaps.some((g) => g.signalId === 'stack:diy_builder' && /rebuild/i.test(g.reason)));
ok('tech: still never proposes a not_built capability', rWix.proposals.every((p) => !notBuiltIds.has(p.capabilityId)));

// ---- determinism ----
ok('deterministic: identical output', JSON.stringify(detect(weak)) === JSON.stringify(detect(weak)));

console.log(`${fail === 0 ? '✓' : '✗'} detect.verify: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
