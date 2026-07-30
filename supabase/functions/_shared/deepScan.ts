// supabase/functions/_shared/deepScan.ts
// THE COMPOSER — runs every sub-scanner over one page's raw HTML and returns one honest DeepScan.
//
// Why this layer exists: siteAudit.ts answers "does this business need a new website?" from six
// static heuristics, and that verdict is fine for triage but says nothing a serious prospect will
// pay to hear. The five sub-scanners underneath this file each look at one lens — accessibility
// barriers, trackers running with no consent mechanism, whether the page works on a phone, whether
// there is any path to book or contact, and whether the business has a machine-readable identity —
// and every one of them reports only what is really in the markup.
//
// This module is deliberately thin. It owns exactly three things the sub-scanners must not each
// decide for themselves:
//   1. ORDER — findings come back worst-first, so the pitch leads with the strongest true thing.
//   2. LIMITS — every scanner's blind spots are unioned and deduped, and the whole-scan caveat is
//      appended. The limits travel WITH the result so no caller can quietly drop them.
//   3. VERSION — SCAN_VERSION is stamped on the result. A finding recorded under 1.0.0 must never
//      be silently compared against one recorded under 1.1.0; that is how a "trend" becomes a lie.
//
// HONESTY, restated at the composition boundary: this is an automated screen of ONE page's static
// HTML. It cannot establish conformance, compliance, or the absence of a problem. `limits` says so
// in plain words, and callers that render a report are expected to show them. Nothing in this file
// may summarise a scan as a pass, a grade, or a clean bill of health.
//
// Pure + deterministic. Runs in Deno (fetch-url) and under tsx (deepScan.verify.ts).

import {
  SCAN_VERSION,
  type DeepScan,
  type Finding,
  type ScanCategory,
  type ScanResult,
} from './scanTypes.ts';
import { scanAccessibility } from './a11yScan.ts';
import { scanTracking, trackingInventory, type TrackingInventory } from './trackingScan.ts';
import { scanMobile } from './mobileScan.ts';
import { scanConversion, bookingPlatform } from './conversionScan.ts';
import { scanPresence, presenceFacts, type PresenceFacts } from './presenceScan.ts';

/** Worst-first ordering. Severity dominates; confidence breaks ties so a thing we are SURE of
 *  outranks an equally-severe thing we merely suspect — the pitch should lead with what we can
 *  state plainly. Category is the final tiebreak purely to keep the order deterministic. */
const SEVERITY_RANK: Record<Finding['severity'], number> = { high: 0, med: 1, low: 2 };
const CONFIDENCE_RANK: Record<Finding['confidence'], number> = { detected: 0, likely: 1, needs_review: 2 };
const CATEGORY_RANK: Record<ScanCategory, number> = {
  accessibility: 0, conversion: 1, tracking: 2, mobile: 3, presence: 4,
};

export function rankFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) =>
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence] ||
    CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category] ||
    a.code.localeCompare(b.code));
}

/** The caveat that rides on EVERY deep scan, no matter which sub-scanners fired. It is appended
 *  last so it reads as the closing statement of the limits list. */
export const WHOLE_SCAN_LIMITS: string[] = [
  'This is an automated screen of a single page’s HTML source. It is not an audit, and it cannot certify compliance or conformance with any standard or law.',
  'Findings marked “likely” or “needs review” should be confirmed by a person before being relied on.',
  'The absence of a finding is not evidence that a problem does not exist — only that this scan did not detect one.',
];

/** The extra facts worth storing on the audit row alongside the findings themselves, so the
 *  index/report layer can group without re-parsing every page. */
export interface ScanFacts {
  tracking: TrackingInventory;
  presence: PresenceFacts;
  booking: string | null;
}

function dedupeLimits(lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const line of list) {
      const key = line.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

function countByCategory(findings: Finding[]): Record<ScanCategory, number> {
  const counts: Record<ScanCategory, number> = {
    accessibility: 0, tracking: 0, mobile: 0, conversion: 0, presence: 0,
  };
  for (const f of findings) counts[f.category]++;
  return counts;
}

/** Total accessibility BARRIER INSTANCES, not finding types — 14 images with no alt text is 14
 *  instances of one finding. This is the number that is comparable to a published figure like
 *  WebAIM's "average errors per page", so it must be counted the same way: sum the counts, and
 *  treat a finding with no count as a single instance. */
export function accessibilityInstances(findings: Finding[]): number {
  return findings
    .filter((f) => f.category === 'accessibility')
    .reduce((n, f) => n + (typeof f.count === 'number' && f.count > 0 ? f.count : 1), 0);
}

/** Run every sub-scanner over one page. Empty/garbage input yields an empty scan, never a guess. */
export function deepScan(html: string): DeepScan {
  const src = typeof html === 'string' ? html : '';
  const results: ScanResult[] = [
    scanAccessibility(src),
    scanTracking(src),
    scanMobile(src),
    scanConversion(src),
    scanPresence(src),
  ];
  const findings = rankFindings(results.flatMap((r) => r.findings));
  return {
    version: SCAN_VERSION,
    findings,
    limits: dedupeLimits([...results.map((r) => r.limits), WHOLE_SCAN_LIMITS]),
    counts: countByCategory(findings),
    a11yInstances: accessibilityInstances(findings),
  };
}

/** The storable facts, gathered in one pass so callers don't re-run the detectors. */
export function scanFacts(html: string): ScanFacts {
  const src = typeof html === 'string' ? html : '';
  return {
    tracking: trackingInventory(src),
    presence: presenceFacts(src),
    booking: bookingPlatform(src),
  };
}
