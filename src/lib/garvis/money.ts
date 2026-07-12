// src/lib/garvis/money.ts
// THE MONEY CORE — pure (verified by money.verify.ts). Invoice arithmetic, the invoice email,
// and the CHASE LADDER: the deterministic escalation that does the asking a solo operator avoids
// (evidence: 56% of SMBs are owed money; 60% avoid confronting late payers). Every chase message
// states only real facts from the invoice — amount, number, due date — and every send still goes
// through the one approval-gated path. Escalation is honest: firm is direct, never threatening;
// final names the pause, never fake collections.

export interface LineItem { description: string; qty: number; unit_usd: number }

export interface InvoiceLike {
  number: string; title: string; to_email: string;
  line_items: LineItem[]; amount_usd: number;
  due_date: string | null;                 // YYYY-MM-DD
  payment_url: string | null;
  status: 'draft' | 'sent' | 'paid' | 'void';
  sent_at: string | null; paid_at: string | null;
  last_chase_stage: number;
}

export const invoiceTotal = (items: LineItem[]): number =>
  Math.round(items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unit_usd) || 0), 0) * 100) / 100;

const usd = (n: number) => `$${n.toFixed(2)}`;

/** Chase stages: 0 none · 1 upcoming (≤3d before due) · 2 due (0–6d past) · 3 firm (7–13d past)
 *  · 4 final (14d+ past). Only sent, unpaid, dated invoices ever chase; each stage fires once. */
export function chaseStage(inv: InvoiceLike, now: Date): number {
  if (inv.status !== 'sent' || inv.paid_at || !inv.due_date) return 0;
  const days = Math.floor((now.getTime() - new Date(`${inv.due_date}T00:00:00Z`).getTime()) / 86_400_000);
  if (days >= 14) return 4;
  if (days >= 7) return 3;
  if (days >= 0) return 2;
  if (days >= -3) return 1;
  return 0;
}

const payLine = (inv: InvoiceLike) =>
  inv.payment_url ? `Pay online here: ${inv.payment_url}` : 'Reply to this email and we can arrange payment.';

/** The invoice email itself — plain, complete, every number real. */
export function invoiceEmail(inv: InvoiceLike, fromName: string): { subject: string; body: string } {
  const items = inv.line_items.map((i) => `  • ${i.description} — ${i.qty} × ${usd(i.unit_usd)} = ${usd((i.qty || 0) * (i.unit_usd || 0))}`).join('\n');
  return {
    subject: `Invoice ${inv.number} — ${inv.title} (${usd(inv.amount_usd)})`,
    body:
      `Hi,\n\nHere's invoice ${inv.number} for ${inv.title}:\n\n${items}\n\n` +
      `Total: ${usd(inv.amount_usd)}${inv.due_date ? `\nDue: ${inv.due_date}` : ''}\n\n${payLine(inv)}\n\nThank you!\n— ${fromName}`,
  };
}

/** The chase ladder's messages — polite, escalating, factual. Stage keys match chaseStage. */
export function chaseEmail(stage: number, inv: InvoiceLike, fromName: string): { subject: string; body: string } | null {
  const amt = usd(inv.amount_usd);
  const base = `invoice ${inv.number} (${inv.title}, ${amt}${inv.due_date ? `, due ${inv.due_date}` : ''})`;
  switch (stage) {
    case 1: return {
      subject: `Heads-up: invoice ${inv.number} is due ${inv.due_date}`,
      body: `Hi,\n\nA friendly heads-up that ${base} comes due in a few days.\n\n${payLine(inv)}\n\nThanks!\n— ${fromName}`,
    };
    case 2: return {
      subject: `Invoice ${inv.number} is now due`,
      body: `Hi,\n\nJust flagging that ${base} is now due.\n\n${payLine(inv)}\n\nIf it's already on its way, ignore this — and thank you.\n— ${fromName}`,
    };
    case 3: return {
      subject: `Following up: invoice ${inv.number} is past due`,
      body: `Hi,\n\n${base.charAt(0).toUpperCase() + base.slice(1)} is now past due, and I wanted to check in directly.\n\n${payLine(inv)}\n\nIf something's wrong with the invoice or the timing, reply and tell me — happy to sort it out.\n— ${fromName}`,
    };
    case 4: return {
      subject: `Final notice: invoice ${inv.number}`,
      body: `Hi,\n\nThis is my last automatic note about ${base}, now more than two weeks past due.\n\n${payLine(inv)}\n\nIf I don't hear back, I'll pause any further work until it's settled — but one reply is all it takes to fix this.\n— ${fromName}`,
    };
    default: return null;
  }
}
