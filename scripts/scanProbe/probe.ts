// scripts/scanProbe/probe.ts — LOOK AT WHAT THE SCAN ACTUALLY SAYS (npm run scan:probe).
//
// The verify suites prove each detector against inputs written to exercise it. That is necessary and
// it is not sufficient: a scanner can pass 400 targeted assertions and still be unusable, because the
// question that decides whether this is safe to send is not "does each rule work?" but
//
//     "point it at a whole realistic page — what comes out, and would I stand behind all of it?"
//
// So this prints the full finding set for a page and you read it. It asserts nothing. It is a
// looking-glass, not a test, and it is deliberately not wired into the verify sweep.
//
// Usage:
//   npm run scan:probe                      # the three bundled reference pages
//   npm run scan:probe -- path/to/page.html # any saved HTML — a real prospect's page, ideally
//
// THE BUNDLED PAGES are hand-built to match the three shapes this pipeline actually meets on Main
// Street, and they carry real platform signatures (GoDaddy's wsimg.com CDN, Wix's parastorage
// bundle, Cookiebot, Clarity, Acuity's *.as.me booking domain):
//
//   godaddy-plumber.html  a DIY site-builder page. Mostly fine, some real gaps.
//   legacy-roofer.html    a hand-coded 2011 table-layout page. Should light up.
//   modern-medspa.html    A WELL-BUILT SITE, AND THE MOST IMPORTANT OF THE THREE. It is loaded with
//                         the traps that a careless scanner fires on and a careful one does not:
//                         an input named by aria-labelledby, a decorative image with alt="" and
//                         role="presentation", a <label> wrapped around its textarea, a hidden
//                         input, a submit button whose name comes from text beside an aria-hidden
//                         SVG, a correct h1→h2→h3→h2 heading order, a skip link, a titled iframe,
//                         a tel: link, a privacy-policy link, and a consent platform loaded
//                         alongside its trackers. Every one of those SHOULD produce silence.
//                         If this page starts reporting a pile of findings, the scanners have
//                         become too eager and will embarrass you on exactly the prospects worth
//                         having. Two findings is the expected result: a Wix form with no action
//                         (correctly 'needs_review' — Wix wires it in JS) and Microsoft Clarity,
//                         which really is session-replay.
//
// A false finding emailed to a real business is the worst outcome this system can produce, so the
// reading you are doing here is: is every line TRUE, and is the confidence honest? Anything you
// cannot defend on a phone call is a bug, even when the rule that produced it is technically right.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { scanAccessibility } from '../../supabase/functions/_shared/a11yScan.ts';
import { scanMobile } from '../../supabase/functions/_shared/mobileScan.ts';
import { scanConversion, bookingPlatform } from '../../supabase/functions/_shared/conversionScan.ts';
import { scanTracking, trackingInventory } from '../../supabase/functions/_shared/trackingScan.ts';
import { fingerprintTech } from '../../supabase/functions/_shared/techFingerprint.ts';

const PAGES_DIR = join(import.meta.dirname ?? 'scripts/scanProbe', 'pages');

const args = process.argv.slice(2);
const files = args.length
  ? args
  : readdirSync(PAGES_DIR).filter((f) => f.endsWith('.html')).sort().map((f) => join(PAGES_DIR, f));

for (const file of files) {
  let html: string;
  try { html = readFileSync(file, 'utf8'); }
  catch (e) { console.error(`\n!! could not read ${file}: ${(e as Error).message}`); continue; }

  const results = [scanAccessibility(html), scanMobile(html), scanConversion(html), scanTracking(html)];
  const findings = results.flatMap((r) => r.findings);
  const inv = trackingInventory(html);
  const tech = fingerprintTech(html);

  console.log(`\n${'═'.repeat(78)}`);
  console.log(`${file}   ${(html.length / 1024).toFixed(0)}kb`);
  console.log(`platform=${tech.builder ?? '—'}  booking=${bookingPlatform(html) ?? '—'}  ` +
    `trackers=${[...inv.trackers, ...inv.sessionReplay].join(',') || '—'}  consent=${inv.consentPlatform ?? 'NONE'}`);
  console.log(`${'─'.repeat(78)}`);

  if (!findings.length) {
    console.log('  (no findings)');
  } else {
    for (const f of findings) {
      console.log(`  [${f.severity.padEnd(4)}|${f.confidence.padEnd(12)}] ${f.code}${f.count ? ` ×${f.count}` : ''}` +
        `${f.wcag ? `  wcag ${f.wcag}` : ''}`);
      console.log(`         ${f.detail}`);
      if (f.evidence) console.log(`         evidence: ${f.evidence.slice(0, 110)}`);
    }
  }

  // The limits are not decoration and they are not optional — they ship with every result and any
  // report built on this is expected to show them. Printing them here keeps them in front of the
  // person deciding whether the findings above are safe to put in an email.
  const limits = [...new Set(results.flatMap((r) => r.limits))];
  console.log(`\n  what this scan could NOT see (${limits.length}):`);
  for (const l of limits) console.log(`   · ${l}`);
}
