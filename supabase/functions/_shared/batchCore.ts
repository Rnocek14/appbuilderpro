// supabase/functions/_shared/batchCore.ts
// ONE implementation of the bulk-send batch core, shared by the standing worker (drain) and the
// client (compose + progress) — the adsWatchCore/standingCore precedent. Pure: no Deno, no DOM,
// no Supabase. Verified by src/lib/garvis/outreachBatch.verify.ts.
//
// A batch is ONE human approval over a SNAPSHOTTED recipient list; the clock drains it by pushing
// every recipient through THE ONE SEND PATH (send-email), which re-checks every safety gate —
// suppression, contact status, kill switch, daily cap — per recipient at send time. This core only
// composes and tracks; it never sends. Honesty rules: obviously-unsendable contacts are excluded
// UP FRONT with named reasons (the operator sees the real reachable count before approving), and
// merge tokens the template can't resolve are a refusal at compose time, never silently emptied.

export interface BatchRecipient {
  contactId: string | null;
  email: string;
  name: string;
  state: 'pending' | 'sent' | 'skipped';
  reason?: string;
}

export interface ContactLike {
  id: string;
  email: string | null;
  full_name: string | null;
  email_status: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const BAD_STATUS = new Set(['unsubscribed', 'bounced', 'invalid', 'complained']);

/** Compose the snapshot. Pre-excludes what send-email would certainly block — so the count the
 *  owner approves is the honest reachable count — and dedupes by address (first occurrence wins). */
export function composeBatchRecipients(contacts: ContactLike[]): {
  recipients: BatchRecipient[];
  excluded: { email: string; reason: string }[];
} {
  const recipients: BatchRecipient[] = [];
  const excluded: { email: string; reason: string }[] = [];
  const seen = new Set<string>();
  for (const c of contacts) {
    const email = (c.email ?? '').trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) { excluded.push({ email: email || '(blank)', reason: 'no valid email' }); continue; }
    const st = (c.email_status ?? '').toLowerCase();
    if (BAD_STATUS.has(st)) { excluded.push({ email, reason: `email_status ${st}` }); continue; }
    if (seen.has(email)) { excluded.push({ email, reason: 'duplicate address' }); continue; }
    seen.add(email);
    recipients.push({ contactId: c.id, email, name: (c.full_name ?? '').trim(), state: 'pending' });
  }
  return { recipients, excluded };
}

/** The only merge tokens a batch supports. Anything else is refused at compose time. */
export const TEMPLATE_TOKENS = ['name', 'first_name'] as const;

export function unknownTokens(template: string): string[] {
  const found = new Set<string>();
  for (const m of template.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) {
    if (!(TEMPLATE_TOKENS as readonly string[]).includes(m[1])) found.add(m[1]);
  }
  return [...found];
}

/** Merge a recipient into the template. A missing name falls back to "there" — a greeting
 *  convention, never a guessed name. */
export function mergeTemplate(template: string, name: string): string {
  const full = name.trim() || 'there';
  const first = full === 'there' ? 'there' : full.split(/\s+/)[0];
  return template
    .replace(/\{\{\s*name\s*\}\}/g, full)
    .replace(/\{\{\s*first_name\s*\}\}/g, first);
}

export function batchProgress(recipients: BatchRecipient[]): { pending: number; sent: number; skipped: number } {
  let pending = 0, sent = 0, skipped = 0;
  for (const r of recipients) {
    if (r.state === 'pending') pending++;
    else if (r.state === 'sent') sent++;
    else skipped++;
  }
  return { pending, sent, skipped };
}

/** Indices of the next up-to-`max` pending recipients — the drain slice for one clock tick. */
export function pickNextPending(recipients: BatchRecipient[], max: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < recipients.length && out.length < max; i++) {
    if (recipients[i].state === 'pending') out.push(i);
  }
  return out;
}
