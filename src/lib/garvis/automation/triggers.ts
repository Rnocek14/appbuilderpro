// src/lib/garvis/automation/triggers.ts
// THE TRIGGER ENGINE — pure scheduling core (verified by triggers.verify.ts). No clock, no I/O: the
// caller supplies `now` and the fire ledger, so the same inputs always produce the same plan. This is
// the mechanic every sector pack needs — "fire once, N days after an event on this customer's record."
//
// The two hard, must-be-right properties this owns:
//   1. WINDOW GUARD — a trigger fires only for customers whose due date was reached RECENTLY
//      (windowDays). Turning a trigger on must never retroactively blast every customer who became due
//      months ago. Due-too-long-ago is skipped, not sent.
//   2. ONCE-ONLY — a (customer, due date) pair fires at most once. The DB has a unique index too, but
//      the plan already excludes anything in the ledger so we don't even enqueue a duplicate.
//
// Nothing here sends. The runner (next step) turns each DueFire into an approval-gated send through the
// existing one send path; the human still owns the trigger out.

export type AnchorField = 'last_service_at' | 'last_visit_at' | 'purchase_at' | 'next_due_at';

export interface TriggerDef {
  id: string;
  anchorField: AnchorField;
  offsetDays: number;        // fire this many days after the anchor date
  windowDays: number;        // only fire if it became due within this many days (no backlog blasting)
  status: 'active' | 'paused';
}

export interface CustomerRec {
  id: string;
  email: string | null;
  name?: string | null;
  anchors: Partial<Record<AnchorField, string | null>>;  // ISO dates (date-only or full ISO)
}

export interface DueFire {
  customerId: string;
  email: string;
  firedFor: string;          // the due date (yyyy-mm-dd) this fire satisfies — the ledger key
}

const DAY = 24 * 60 * 60 * 1000;

/** Parse a date-only ('2026-01-15') or full ISO string to epoch ms at UTC midnight, or null. */
function parseDay(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isFinite(t) ? t : null;
}

function toDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The ledger key for a (customer, due date) fire — kept in one place so runner + engine agree. */
export function fireKey(customerId: string, firedFor: string): string {
  return `${customerId}|${firedFor}`;
}

/** The date this trigger is due for a customer = anchor + offset, or null when the anchor is missing. */
export function dueDateFor(t: TriggerDef, c: CustomerRec): string | null {
  const a = parseDay(c.anchors[t.anchorField]);
  if (a == null) return null;
  return toDay(a + t.offsetDays * DAY);
}

/** Is this customer due to fire now, and for which due date? Every guard is honest and observable:
 *  active trigger, a real email, an anchor present, the due date reached but not staler than the
 *  window, and not already fired for that due date. */
export function isCustomerDue(
  t: TriggerDef, c: CustomerRec, alreadyFired: Set<string>, nowIso: string,
): { due: boolean; firedFor?: string } {
  if (t.status !== 'active') return { due: false };
  if (!c.email) return { due: false };
  const dueIso = dueDateFor(t, c);
  if (!dueIso) return { due: false };
  const now = Date.parse(nowIso);
  const due = Date.parse(`${dueIso}T00:00:00Z`);
  if (!Number.isFinite(now)) return { due: false };
  if (due > now) return { due: false };                          // not due yet
  if (now - due > t.windowDays * DAY) return { due: false };      // became due too long ago — no backfill blast
  if (alreadyFired.has(fireKey(c.id, dueIso))) return { due: false }; // already fired for this due date
  return { due: true, firedFor: dueIso };
}

/** The plan: every customer due to fire now (already-fired excluded). Pure — caller supplies now +
 *  the ledger keys (from trigger_fires). The runner enqueues one approval-gated send per DueFire. */
export function dueFires(
  t: TriggerDef, customers: CustomerRec[], firedKeys: string[], nowIso: string,
): DueFire[] {
  const fired = new Set(firedKeys);
  const out: DueFire[] = [];
  for (const c of customers) {
    const r = isCustomerDue(t, c, fired, nowIso);
    if (r.due && r.firedFor && c.email) out.push({ customerId: c.id, email: c.email, firedFor: r.firedFor });
  }
  return out;
}

/** Render an owner-authored template with a couple of safe fields. No invented data — a missing field
 *  renders empty. Whatever this produces is still approval-gated before it can send. */
export function renderTemplate(tpl: string, c: CustomerRec): string {
  const first = (c.name ?? '').trim().split(/\s+/)[0] ?? '';
  return (tpl ?? '')
    .replace(/\{first_name\}/g, first)
    .replace(/\{name\}/g, (c.name ?? '').trim());
}

export interface ParsedCustomer {
  email: string; name: string | null;
  last_service_at: string | null; last_visit_at: string | null;
  purchase_at: string | null; next_due_at: string | null;
}

/** Parse a pasted CSV (header: name,email,last_service_at,last_visit_at,purchase_at,next_due_at).
 *  Tolerant — only the columns present are used; a row needs a valid email or it's skipped. Pure. */
export function parseCustomerCsv(text: string): ParsedCustomer[] {
  const lines = (text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const head = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idx = (k: string) => head.indexOf(k);
  const iEmail = idx('email'), iName = idx('name');
  const iLs = idx('last_service_at'), iLv = idx('last_visit_at'), iPu = idx('purchase_at'), iNd = idx('next_due_at');
  const cell = (c: string[], i: number) => (i >= 0 ? (c[i] ?? '').trim() || null : null);
  const out: ParsedCustomer[] = [];
  for (const line of lines.slice(1)) {
    const c = line.split(',').map((x) => x.trim());
    const email = iEmail >= 0 ? (c[iEmail] ?? '') : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) continue;
    out.push({
      email, name: cell(c, iName),
      last_service_at: cell(c, iLs), last_visit_at: cell(c, iLv),
      purchase_at: cell(c, iPu), next_due_at: cell(c, iNd),
    });
  }
  return out;
}
