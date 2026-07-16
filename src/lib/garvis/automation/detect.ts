// src/lib/garvis/automation/detect.ts
// AUTOMATION DETECTION — open detection, bounded execution.
//
// Given an audit we already ran (its vertical, the raw checks, the siteAudit signals, and the scraped
// page text), derive `manual_process:*` / `platform:*` signals that are GROUNDED IN OBSERVED FACTS,
// then resolve them against the capability registry. A signal is only emitted when we actually observed
// the thing (missing data → no signal, never a guess). A proposal is only produced when a registry
// capability that we can actually deliver matches it; a matched need we can't yet deliver becomes a
// roadmap GAP, not a promise. Pure + deterministic (verified by detect.verify.ts) — no model call.

import type { Vertical } from '../verticals';
import type { ProspectAuditRow, TechFingerprint } from '../clientHuntRun';
import { CAPABILITIES, isDeliverable, type SignalKind } from './registry';

export interface DetectedSignal {
  id: string;              // e.g. 'manual_process:manual_intake'
  kind: SignalKind;
  label: string;           // human-readable
  evidence: string;        // WHAT was observed that grounds it (the honesty anchor)
}

export interface AutomationProposal {
  capabilityId: string;
  title: string;
  pitch: string;
  rail: string;
  monthlyPrice: string;
  consentBasis: string;
  complianceNote?: string;
  status: 'ga' | 'beta';   // never 'not_built' — those are gaps, below
  matchedSignal: string;   // the signal id that grounds this proposal
}

export interface DetectionGap {
  signalId: string;
  reason: string;          // why nothing is proposed (not built yet / nothing maps yet)
}

export interface DetectionResult {
  signals: DetectedSignal[];
  proposals: AutomationProposal[];
  gaps: DetectionGap[];
}

/** A source-agnostic view of an audit, so detection works on saved rows and on live audits alike. */
export interface AuditView {
  vertical: Vertical | null;
  checks: { viewport?: boolean; form?: boolean; email?: boolean; https?: boolean };
  siteSignalIds: string[];              // ids from siteAudit (e.g. 'no_contact')
  text: string | null;                  // scraped page text, if we kept it
  tech: Partial<TechFingerprint> | null; // tech fingerprint, when we have one (empty {} = not computed)
}

export function auditViewFromRow(r: ProspectAuditRow): AuditView {
  return {
    vertical: (r.vertical as Vertical | null) ?? null,
    checks: (r.checks ?? {}) as AuditView['checks'],
    siteSignalIds: (r.signals ?? []).map((s) => s.id),
    text: r.text_snippet ?? null,
    tech: r.tech ?? null,
  };
}

/** True once fetch-url has actually run a fingerprint (old rows default to {} — unknown, not empty). */
function techComputed(tech: Partial<TechFingerprint> | null): tech is TechFingerprint {
  return !!tech && Object.keys(tech).length > 0;
}

// DIY site builders where the owner clearly built it themselves (a strong rebuild + automation lead).
const DIY_BUILDERS = new Set(['wix', 'squarespace', 'godaddy', 'weebly']);

// "Call us to book / for a quote" — presence means the funnel runs through a phone by hand.
const PHONE_FUNNEL = /(call (us )?(to|for|and)?\s?(book|schedule|make an appointment)|call (us )?(for|to get) (a )?(free )?(quote|estimate|pricing|appointment)|call today|give us a call)/i;
// Verticals where booking/scheduling is core to how they make money.
const BOOKING_VERTICALS: Vertical[] = ['health', 'home_services', 'events', 'food'];

/** Derive grounded manual-process / platform signals from what we actually observed. */
export function deriveSignals(v: AuditView): DetectedSignal[] {
  const out: DetectedSignal[] = [];
  const text = (v.text ?? '').trim();

  // No clear way to get in touch → enquiries are fielded by hand.
  const noContact = v.siteSignalIds.includes('no_contact') || (v.checks.form === false && v.checks.email === false);
  if (noContact) {
    out.push({
      id: 'manual_process:manual_intake', kind: 'manual_process', label: 'Manual enquiry intake',
      evidence: 'No contact form and no visible email on the page — enquiries have nowhere to land automatically.',
    });
  }

  // "Call us to book / for a quote" literally on the page.
  const phoneMatch = text ? PHONE_FUNNEL.exec(text) : null;
  if (phoneMatch) {
    out.push({
      id: 'manual_process:phone_only_booking', kind: 'manual_process', label: 'Phone-only booking',
      evidence: `The page says “${phoneMatch[0].trim().slice(0, 60)}” — booking runs through a phone call.`,
    });
  }

  const tech = v.tech;
  const hasTech = techComputed(tech);

  // No online booking — asserted ONLY from the HARD tech signal (a fingerprinted page with no
  // scheduling widget). We deliberately do NOT infer "no booking" from the absence of a keyword in body
  // text: a missing phrase is not an observed absence, and the honesty rule forbids asserting from
  // missing data (the keyword list would never be exhaustive, so it would fabricate false gaps).
  const bookingVertical = v.vertical != null && BOOKING_VERTICALS.includes(v.vertical);
  if (bookingVertical && hasTech && !tech.booking) {
    out.push({
      id: 'platform:no_online_booking', kind: 'platform', label: 'No online booking',
      evidence: 'No booking or scheduling widget found in the page code — customers can’t self-schedule.',
    });
  }

  // Flying blind — no analytics or ad pixel installed (only assertable once we've fingerprinted).
  if (hasTech && (tech.analytics ?? []).length === 0) {
    out.push({
      id: 'platform:no_analytics', kind: 'platform', label: 'No analytics or ad pixel',
      evidence: 'No analytics or ad pixel found in the page code — they can’t measure what their site does.',
    });
  }

  // Owner-built DIY site (Wix/Squarespace/GoDaddy/Weebly) — a strong rebuild + automation lead.
  if (hasTech && tech.builder && DIY_BUILDERS.has(tech.builder)) {
    out.push({
      id: 'stack:diy_builder', kind: 'stack', label: `DIY site (${tech.builder})`,
      evidence: `Built on ${tech.builder} — a self-serve builder, so the owner likely runs the business by hand.`,
    });
  }

  return out;
}

/** Resolve grounded signals against the registry: deliverable matches become proposals; matched needs
 *  we can't yet deliver become gaps. Every proposal traces back to the signal that grounds it. */
export function proposeFromSignals(signals: DetectedSignal[], vertical: Vertical | null): { proposals: AutomationProposal[]; gaps: DetectionGap[] } {
  const proposals: AutomationProposal[] = [];
  const seen = new Set<string>();
  const covered = new Set<string>();       // signal ids that produced at least one proposal

  for (const sig of signals) {
    for (const cap of CAPABILITIES) {
      if (!cap.matchesSignals.includes(sig.id)) continue;
      if (!(cap.verticals.includes('any') || (vertical != null && cap.verticals.includes(vertical)))) continue;
      if (!isDeliverable(cap)) continue;   // bounded execution: never propose 'not_built'
      if (seen.has(cap.id)) { covered.add(sig.id); continue; }
      seen.add(cap.id);
      covered.add(sig.id);
      proposals.push({
        capabilityId: cap.id, title: cap.title, pitch: cap.pitch, rail: cap.rail,
        monthlyPrice: cap.monthlyPrice, consentBasis: cap.consentBasis,
        complianceNote: cap.complianceNote, status: cap.status as 'ga' | 'beta', matchedSignal: sig.id,
      });
    }
  }

  // Gaps: a real, observed need with nothing deliverable behind it yet (the roadmap / bespoke queue).
  const gaps: DetectionGap[] = [];
  for (const sig of signals) {
    if (covered.has(sig.id)) continue;
    const hint = GAP_HINTS[sig.id];
    const notBuilt = CAPABILITIES.find((c) => c.matchesSignals.includes(sig.id) && !isDeliverable(c) &&
      (c.verticals.includes('any') || (vertical != null && c.verticals.includes(vertical))));
    gaps.push({
      signalId: sig.id,
      reason: hint
        ? hint
        : notBuilt ? `“${notBuilt.title}” would fit — not built yet.` : 'No capability maps to this yet — logged for the roadmap.',
    });
  }
  return { proposals, gaps };
}

// Signals that carry a meaning but no automation capability — surfaced as informative gaps, not promises.
const GAP_HINTS: Record<string, string> = {
  'platform:no_analytics': 'Analytics / conversion-tracking setup — a one-time win, not built yet.',
  'stack:diy_builder': 'Strong website-rebuild lead (owner-built DIY site).',
};

export function detect(view: AuditView): DetectionResult {
  const signals = deriveSignals(view);
  const { proposals, gaps } = proposeFromSignals(signals, view.vertical);
  return { signals, proposals, gaps };
}

export function detectFromRow(row: ProspectAuditRow): DetectionResult {
  return detect(auditViewFromRow(row));
}
