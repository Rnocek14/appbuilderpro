// src/lib/garvis/siteAudit.ts
// The honest "does this business need a new website?" engine. It does NOT fake a Lighthouse score:
// every signal traces to something really observed on the fetched page (its URL scheme, whether the
// HTML declared a mobile viewport, whether there's any way to contact them, how much content there
// is, and what the copyright year says). Missing data is 'unknown', never a guess.
//
// Pure + deterministic (the reference year is injected), so it's fully testable and the same page
// always audits the same way. The impure half (fetching the page) lives in clientHuntRun.ts.

export type Severity = 'high' | 'med' | 'low';
export type Verdict = 'weak' | 'dated' | 'solid' | 'unknown';

export interface AuditSignal { id: string; label: string; severity: Severity; detail: string }

export interface SiteSignalsInput {
  url: string;
  reachable: boolean;            // did the page actually load
  title?: string | null;
  description?: string | null;   // meta description
  text?: string | null;          // visible text extracted from the page
  hasViewport?: boolean;         // <meta name="viewport"> present in the raw HTML
  hasForm?: boolean;             // a <form> or mailto: link present
  emailFound?: boolean;          // an email address was discoverable on the page
}

export interface SiteAudit {
  url: string;
  reachable: boolean;
  signals: AuditSignal[];        // what's wrong, worst-first
  strengths: string[];          // what's already good (honest positives)
  score: number | null;         // 10–100, DERIVED from the real signals (null when unreachable)
  verdict: Verdict;
  headline: string;             // one honest owner-facing line
}

const PENALTY: Record<Severity, number> = { high: 22, med: 12, low: 6 };

/** True when the URL uses https. */
function isHttps(url: string): boolean { return /^https:\/\//i.test(url.trim()); }

/** The most recent 4-digit year that reads like a copyright year, or null. */
function copyrightYear(text: string): number | null {
  let best: number | null = null;
  const re = /(?:©|&copy;|copyright)\s*(?:\d{0,4}[\s\-–]*)?(20\d{2})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) { const y = parseInt(m[1], 10); if (!best || y > best) best = y; }
  return best;
}

/** Audit a fetched page against a reference year (injected for determinism). */
export function auditSite(input: SiteSignalsInput, nowYear: number): SiteAudit {
  const url = input.url.trim();
  if (!input.reachable) {
    return {
      url, reachable: false, signals: [], strengths: [], score: null, verdict: 'unknown',
      headline: 'Couldn’t load their site — worth a manual look before pitching.',
    };
  }

  const text = (input.text || '').trim();
  const signals: AuditSignal[] = [];
  const strengths: string[] = [];

  // HTTPS — from the URL itself.
  if (isHttps(url)) strengths.push('Secure (HTTPS)');
  else signals.push({ id: 'no_https', severity: 'high', label: 'No HTTPS', detail: 'Browsers flag the site “Not secure,” which scares off visitors.' });

  // Mobile — did the HTML declare a viewport.
  if (input.hasViewport) strengths.push('Mobile-ready');
  else signals.push({ id: 'not_mobile', severity: 'high', label: 'Not mobile-friendly', detail: 'No mobile setup — it looks broken on phones, where most people visit from.' });

  // A way to contact them.
  if (input.hasForm || input.emailFound) strengths.push('Has a way to get in touch');
  else signals.push({ id: 'no_contact', severity: 'high', label: 'No clear way to contact', detail: 'No form and no visible email — interested visitors have nowhere to go.' });

  // Content depth.
  if (text.length > 0 && text.length < 600) {
    signals.push({ id: 'thin', severity: 'med', label: 'Very little content', detail: 'The page is thin — weak for trust and for showing up in Google.' });
  }

  // Copyright staleness.
  const cy = copyrightYear(text);
  if (cy != null && cy <= nowYear - 3) {
    signals.push({ id: 'stale', severity: 'med', label: `Copyright says ${cy}`, detail: `The footer year (${cy}) makes the business look abandoned.` });
  }

  // Title + description (SEO basics).
  if (input.title && input.title.trim()) strengths.push('Has a page title');
  else signals.push({ id: 'no_title', severity: 'med', label: 'Missing page title', detail: 'No <title> — Google has nothing to show in search results.' });
  if (!(input.description && input.description.trim())) {
    signals.push({ id: 'no_description', severity: 'low', label: 'No meta description', detail: 'No search-result summary — Google guesses, usually badly.' });
  }

  signals.sort((a, b) => PENALTY[b.severity] - PENALTY[a.severity]);

  const score = Math.max(10, 100 - signals.reduce((s, x) => s + PENALTY[x.severity], 0));
  const highs = signals.filter((s) => s.severity === 'high').length;
  const verdict: Verdict = highs >= 1 || signals.length >= 3 ? 'weak' : signals.length >= 1 ? 'dated' : 'solid';

  const headline =
    verdict === 'weak' ? `Weak site — ${signals[0].label.toLowerCase()}${signals.length > 1 ? ` + ${signals.length - 1} more issue${signals.length - 1 === 1 ? '' : 's'}` : ''}. A strong prospect.`
    : verdict === 'dated' ? `Dated in spots — ${signals.map((s) => s.label.toLowerCase()).join(', ')}. Worth a pitch.`
    : `Site already looks solid${strengths.length ? ` (${strengths[0].toLowerCase()})` : ''} — lower priority.`;

  return { url, reachable: true, signals, strengths, score, verdict, headline };
}

/** The issue labels an external builder (the Preview Engine) can turn into owner-facing copy. */
export function auditIssues(a: SiteAudit): string[] { return a.signals.map((s) => s.label); }
