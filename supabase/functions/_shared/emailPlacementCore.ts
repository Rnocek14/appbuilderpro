// supabase/functions/_shared/emailPlacementCore.ts
// INBOX PLACEMENT — pure core (verified by src/lib/garvis/emailPlacement.verify.ts), shared by
// the flow editor (live findings while the operator writes), send-email (the one fail-closed
// gate), and the standing-worker's flow sweep (the sunset rule).
//
// The model, stated plainly: mailbox providers file mail by SHAPE and by HISTORY.
//  - SHAPE: designed HTML, images, many links, promo phrasing, caps and exclamation marks are the
//    Promotions-tab fingerprint; a short personal note with at most a link or two lands in
//    Primary. We LINT for shape and tell the operator exactly what reads as a promotion — the
//    operator decides; nothing here rewrites their words.
//  - HISTORY: sending to people who never engage is the strongest spam signal a domain can emit.
//    We STOP enrolling contacts who have ignored enough consecutive sends (the sunset rule) —
//    continuing to mail them buys nothing and taxes deliverability for everyone else.
//  - One thing is refused outright: link shorteners. Filters treat them as cloaked destinations;
//    there is no legitimate reason for one in our mail, so send-email fail-closes on them the
//    same way it fail-closes on unfilled placeholders.
//
// Severity model mirrors runtimeQa: 'error' = measurably hurts placement, fix before sending;
// 'advisory' = shape signal worth knowing, never a block.

export interface PlacementFinding {
  code: string;
  severity: 'error' | 'advisory';
  detail: string;
}

/** Consecutive ignored deliveries before a contact is asleep to us. */
export const SUNSET_MIN_SENDS = 5;

/** Cloaked-destination domains — filters junk these on sight. */
export const SHORTENER_DOMAINS = [
  'bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'ow.ly', 'is.gd', 'buff.ly',
  'rebrand.ly', 'cutt.ly', 'shorturl.at', 'tiny.cc', 'rb.gy',
];

// Promo-fingerprint phrases. Word-boundary matched, case-insensitive. Deliberately NOT included:
// "cash offer" (ordinary real-estate speech), "new listing", prices like "$520k" (a personal
// market note is our best-converting shape and must never lint dirty).
const TRIGGER_PHRASES: { re: RegExp; label: string }[] = [
  { re: /\bfree\b(?!\s*to\b)/i, label: 'free' },              // "feel free to reply" stays clean
  { re: /\blimited[- ]time\b/i, label: 'limited time' },
  { re: /\bact now\b/i, label: 'act now' },
  { re: /\bclick here\b/i, label: 'click here' },
  { re: /\bbuy now\b/i, label: 'buy now' },
  { re: /\bdon'?t miss\b/i, label: "don't miss" },
  { re: /\bexclusive (?:offer|deal)\b/i, label: 'exclusive offer' },
  { re: /\bno obligation\b/i, label: 'no obligation' },
  { re: /\brisk[- ]free\b/i, label: 'risk-free' },
  { re: /\bguarantee[ds]?\b/i, label: 'guarantee' },
  { re: /\bwinner\b/i, label: 'winner' },
  { re: /\bcongratulations\b/i, label: 'congratulations' },
  { re: /\burgent\b/i, label: 'urgent' },
  { re: /\blast chance\b/i, label: 'last chance' },
  { re: /\boffer expires\b/i, label: 'offer expires' },
  { re: /\bsave big\b/i, label: 'save big' },
  { re: /\blowest price\b/i, label: 'lowest price' },
  { re: /\bspecial promotion\b/i, label: 'special promotion' },
  { re: /\bdiscount\b/i, label: 'discount' },
  { re: /\d+\s*%\s*off\b/i, label: '% off' },
];

// Real-estate acronyms that are legitimately upper-case in a subject line.
const CAPS_OK = new Set(['MLS', 'FSBO', 'HOA', 'LLC', 'USA', 'PS']);

const URL_RE = /https?:\/\/[^\s"'<>)]+/gi;

/** Every shortened link in the text (host-matched, subdomains included). Empty = clean. */
export function findShortenedLinks(text: string): string[] {
  const hits: string[] = [];
  for (const url of text.match(URL_RE) ?? []) {
    let host = '';
    try { host = new URL(url).hostname.toLowerCase(); } catch { continue; }
    if (SHORTENER_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) hits.push(url);
  }
  return hits;
}

/**
 * Lint one draft for Promotions/junk shape. Runs on the draft BEFORE the CAN-SPAM footer is
 * appended (the footer's unsubscribe link is required by law and never counts against the draft).
 */
export function placementLint(subject: string, bodyText: string, bodyHtml = ''): PlacementFinding[] {
  const findings: PlacementFinding[] = [];
  const composed = `${subject}\n${bodyText}\n${bodyHtml}`;

  const short = findShortenedLinks(composed);
  if (short.length) {
    findings.push({
      code: 'promo.link_shortener', severity: 'error',
      detail: `${short[0]} — shortened links read as cloaked destinations and get mail junked; use the full URL.`,
    });
  }

  const hits = TRIGGER_PHRASES.filter((p) => p.re.test(composed)).map((p) => p.label);
  if (hits.length) {
    findings.push({
      code: 'promo.trigger_phrases', severity: hits.length >= 3 ? 'error' : 'advisory',
      detail: `promotional phrasing (${hits.slice(0, 4).join(', ')}${hits.length > 4 ? ', …' : ''}) — this is the language filters and the Promotions tab key on.`,
    });
  }

  const subjNoUrl = subject.replace(URL_RE, '');
  const letters = subjNoUrl.replace(/[^a-zA-Z]/g, '');
  const upper = subjNoUrl.replace(/[^A-Z]/g, '');
  if (letters.length >= 8 && upper.length / letters.length > 0.4) {
    findings.push({
      code: 'promo.caps_subject', severity: 'error',
      detail: 'the subject is mostly capital letters — shouting is a classic junk signal.',
    });
  } else {
    const capsWord = (subjNoUrl.match(/\b[A-Z]{4,}\b/g) ?? []).find((w) => !CAPS_OK.has(w));
    if (capsWord) {
      findings.push({
        code: 'promo.caps_subject', severity: 'advisory',
        detail: `"${capsWord}" in the subject is all-caps — lower-case reads personal.`,
      });
    }
  }

  const bangs = (composed.match(/!/g) ?? []).length;
  if (/!{2,}/.test(composed) || /\${3,}/.test(composed)) {
    findings.push({
      code: 'promo.spammy_punctuation', severity: 'error',
      detail: 'repeated ! or $ — the oldest junk fingerprint there is.',
    });
  } else if (subject.includes('!')) {
    findings.push({
      code: 'promo.exclamations', severity: 'advisory',
      detail: 'an exclamation mark in the subject leans promotional.',
    });
  } else if (bangs >= 3) {
    findings.push({
      code: 'promo.exclamations', severity: 'advisory',
      detail: `${bangs} exclamation marks — personal notes rarely need any.`,
    });
  }

  const urls = new Set((composed.match(URL_RE) ?? []).map((u) => u.trim()));
  if (urls.size > 4) {
    findings.push({
      code: 'promo.link_count', severity: 'error',
      detail: `${urls.size} links — link-dense mail is newsletter shape; a personal note carries one.`,
    });
  } else if (urls.size > 2) {
    findings.push({
      code: 'promo.link_count', severity: 'advisory',
      detail: `${urls.size} links — fewer links, better placement.`,
    });
  }

  const imgs = (bodyHtml.match(/<img\b/gi) ?? []).length;
  if (imgs >= 3) {
    findings.push({
      code: 'promo.image_heavy', severity: 'error',
      detail: `${imgs} images — image-heavy mail is filed as a promotion before anyone reads it.`,
    });
  } else if (imgs >= 1) {
    findings.push({
      code: 'promo.image_heavy', severity: 'advisory',
      detail: 'images push mail toward Promotions — plain text lands in Primary.',
    });
  }

  if (/<table\b|<center\b/i.test(bodyHtml) || (bodyHtml.match(/style=/gi) ?? []).length > 5) {
    findings.push({
      code: 'promo.html_designed', severity: 'advisory',
      detail: 'designed-template HTML — Gmail files this shape under Promotions; write it like a note from a person.',
    });
  }

  if (subject.length > 65) {
    findings.push({
      code: 'promo.subject_long', severity: 'advisory',
      detail: `${subject.length}-character subject — long subjects read as marketing; under ~50 reads personal.`,
    });
  }

  return findings;
}

/** The one-line count for a lint result — counts, never adjectives. Empty when clean. */
export function placementLine(findings: PlacementFinding[]): string {
  if (!findings.length) return '';
  const errors = findings.filter((f) => f.severity === 'error').length;
  const adv = findings.length - errors;
  const parts: string[] = [];
  if (errors) parts.push(`${errors} to fix`);
  if (adv) parts.push(`${adv} advisor${adv === 1 ? 'y' : 'ies'}`);
  return `Inbox placement: ${parts.join(', ')}`;
}

/** Event-row shape the sweep already reads (structurally identical to emailFlowsCore.EventRow). */
export interface PlacementEventRow { contact_id: string | null; kind: string }

/**
 * THE SUNSET RULE: contacts who were delivered SUNSET_MIN_SENDS+ emails in the window and never
 * opened, clicked, or replied to ANY of them are asleep to us — enrolling them again is the spam
 * signal providers punish hardest. Computed from the same real event rows the segment uses;
 * scoped honestly to that window (a contact who engaged long before the window may sunset — a
 * fresh engagement wakes them right back up).
 */
export function sunsetContacts(rows: PlacementEventRow[], minSends = SUNSET_MIN_SENDS): Set<string> {
  const tally = new Map<string, { delivered: number; engaged: number }>();
  for (const r of rows) {
    if (!r.contact_id) continue;
    const t = tally.get(r.contact_id) ?? { delivered: 0, engaged: 0 };
    if (r.kind === 'delivered') t.delivered++;
    else if (r.kind === 'opened' || r.kind === 'clicked' || r.kind === 'replied') t.engaged++;
    tally.set(r.contact_id, t);
  }
  const asleep = new Set<string>();
  for (const [id, t] of tally) {
    if (t.delivered >= minSends && t.engaged === 0) asleep.add(id);
  }
  return asleep;
}
