// scripts/scanProbe/live.ts — FETCH REAL PAGES AND SCAN THEM (npm run scan:live).
//
// probe.ts reads HTML off disk. This fetches it first, so the loop from "a business exists" to
// "here is what we would say about them" is one command:
//
//   npm run scan:live                          # the bundled real Lake Geneva targets
//   npm run scan:live -- https://example.com/  # any URL
//   npm run scan:live -- --keep                # also save the HTML, so you can re-probe it offline
//                                              # after changing a detector, without re-fetching
//
// WHY THIS IS A SEPARATE FILE FROM probe.ts: probe is hermetic and deterministic — same bytes, same
// output, forever. This one depends on the internet, on what a site served today, and on whether a
// WAF felt like answering. Those are different reliability contracts and mixing them would make the
// deterministic one look flaky. Fetching failures here are reported per-URL and never abort the run.
//
// THE FETCH IS DELIBERATELY HONEST ABOUT ITSELF. It presents a real browser User-Agent because that
// is what the pipeline's own fetch-url does, and for the same stated reason: small-business sites sit
// behind WAFs that 403 a bot-ish agent, which silently downgrades a real, readable site to "no
// website" — a false fact about a real business. We only ever GET public pages. Redirects are
// followed, the body is capped, and a slow host is abandoned rather than hanging the run.
//
// A NOTE ON WHAT YOU ARE LOOKING AT. A live page is the only input that can tell you whether this is
// safe to send, because it is the only one nobody wrote to make a point. The bundled fixtures were
// authored — by me — to exercise the detectors, and a scanner graded solely against its author's
// idea of a hard case is grading its own homework. Read every finding against View Source on the
// real page. Anything you could not defend on a phone call is a bug, whatever the rule says.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deepScan, scanFacts } from '../../supabase/functions/_shared/deepScan.ts';
import { fingerprintTech } from '../../supabase/functions/_shared/techFingerprint.ts';
import { selectPitchFindings, findingSentence } from '../../src/lib/garvis/prospects/pitchFindings.ts';

// Real businesses, found by search rather than invented, so the first run is against pages nobody
// authored to make a scanner look good. Replace freely — the point is real markup, not these ones.
const DEFAULT_TARGETS = [
  'https://lakegenevaplumbing.com/',
  'https://masterserviceslg.com/',
  'https://www.olearyplumbingandheating.com/lake-geneva-plumber/',
];

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const MAX_BODY = 1_500_000;   // same cap fetch-url uses — a scan reads a page, not a payload
const TIMEOUT_MS = 25_000;

const rawArgs = process.argv.slice(2);
const keep = rawArgs.includes('--keep');
const urls = rawArgs.filter((a) => !a.startsWith('--'));
const targets = urls.length ? urls : DEFAULT_TARGETS;

const outDir = join(import.meta.dirname ?? 'scripts/scanProbe', 'fetched');
if (keep) mkdirSync(outDir, { recursive: true });

/** Fetch one page as a browser would. Returns null (with a printed reason) rather than throwing —
 *  one unreachable host must never end the run, and "unreachable" is itself worth seeing. */
async function fetchPage(url: string): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      // A 403 here is ambiguous and the two readings lead somewhere very different: the site's WAF
      // refused a scraper (interesting — a real prospect we cannot read), or an egress proxy refused
      // the request before it ever left the machine (not about the site at all). Saying "HTTP 403"
      // alone invites the first reading, and a run where EVERY host 403s is almost always the second.
      const proxyish = res.status === 403 || res.status === 407;
      console.error(`\n!! ${url} → HTTP ${res.status}${proxyish ? '  (site WAF, or a blocking egress proxy — see the note below if every target does this)' : ''}`);
      return null;
    }
    const html = (await res.text()).slice(0, MAX_BODY);
    return { html, finalUrl: res.url || url };
  } catch (e) {
    const msg = (e as Error).message;
    // The most likely failure in a locked-down environment, called out by name so it is not
    // mistaken for a bug in the scanner or a dead business.
    const hint = /proxy|CONNECT|403|fetch failed/i.test(msg)
      ? '  (network egress appears to be blocked here — run this where the machine can reach the open web)'
      : '';
    console.error(`\n!! ${url} → ${msg}${hint}`);
    return null;
  }
}

function slugify(u: string): string {
  return u.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60);
}

async function main(): Promise<void> {
  let scanned = 0;

  for (const target of targets) {
    const got = await fetchPage(target);
    if (!got) continue;
    scanned++;

    const { html, finalUrl } = got;
    if (keep) {
      const path = join(outDir, `${slugify(finalUrl)}.html`);
      writeFileSync(path, html);
      console.log(`\n(saved ${path})`);
    }

    const scan = deepScan(html);
    const facts = scanFacts(html);
    const tech = fingerprintTech(html);

    console.log(`\n${'═'.repeat(78)}`);
    console.log(`${finalUrl}   ${(html.length / 1024).toFixed(0)}kb   scan v${scan.version}`);
    console.log(`platform=${tech.builder ?? '—'}  booking=${facts.booking ?? '—'}  ` +
      `trackers=${[...facts.tracking.trackers, ...facts.tracking.sessionReplay].join(',') || '—'}  ` +
      `consent=${facts.tracking.consentPlatform ?? 'NONE'}  schema=${facts.presence.jsonLdTypes.join(',') || '—'}`);
    console.log(`findings=${scan.findings.length}  a11y instances=${scan.a11yInstances}  ` +
      `by category: ${Object.entries(scan.counts).filter(([, n]) => n).map(([k, n]) => `${k}:${n}`).join(' ') || '—'}`);
    console.log('─'.repeat(78));

    if (!scan.findings.length) {
      console.log('  (no findings)');
    } else {
      for (const f of scan.findings) {
        console.log(`  [${f.severity.padEnd(4)}|${f.confidence.padEnd(12)}] ${f.code}${f.count ? ` ×${f.count}` : ''}` +
          `${f.wcag ? `  wcag ${f.wcag}` : ''}`);
        console.log(`         ${f.detail}`);
        if (f.evidence) console.log(`         evidence: ${f.evidence.slice(0, 110)}`);
      }
    }

    // THE ONLY LINES THAT WOULD ACTUALLY REACH THIS BUSINESS. Everything above is the internal
    // report; this is the email. Read it as the owner would, with their site open in another tab.
    const picks = selectPitchFindings(scan.findings);
    console.log(`\n  the PITCH would say (${picks.length}):`);
    if (!picks.length) console.log('   · nothing qualifies to lead — no pitch would be sent to this business');
    for (const p of picks) console.log(`   ${p.role === 'lead' ? '▸' : '·'} ${findingSentence(p.finding)}`);
  }

  console.log(`\n${'═'.repeat(78)}`);
  console.log(`scanned ${scanned}/${targets.length} target${targets.length === 1 ? '' : 's'}`);
  if (scanned === 0) {
    console.log('Nothing was fetched.');
    console.log('');
    console.log('If EVERY target failed the same way — especially 403/407 — this is almost certainly');
    console.log('the network, not the sites: an egress proxy refused the requests before they left');
    console.log('this machine. A real site\'s WAF blocking you looks different: some hosts answer and');
    console.log('some do not. Two ways forward:');
    console.log('  · run this same command from a machine with open web access, or');
    console.log('  · open the pages in a browser, File > Save As the HTML, and scan them offline:');
    console.log('      npm run scan:probe -- path/to/page.html');
  } else if (keep) {
    console.log(`HTML saved under ${outDir} — re-scan it offline with:`);
    console.log(`  npm run scan:probe -- ${outDir}/*.html`);
  }
}

main();
