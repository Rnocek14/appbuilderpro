// src/lib/garvis/automation/reportCore.ts
// PURE half of the monthly automation report (no imports — verified by report.verify.ts).
// Numbers are counted from ledger rows, never composed; a quiet month says "quiet month".

export interface AutomationMonth {
  fires: number;      // trigger fires claimed this month
  queued: number;     // approvals created (pending or later)
  approved: number;   // approvals the owner said yes to
  sent: number;       // automation messages actually sent
  opened: number;     // of those, opened at least once (app_0081)
}

/** The one-line report. Honest zeros — never invents value. */
export function automationMonthLine(m: AutomationMonth): string {
  if (m.fires === 0) return 'Quiet month so far — no automations came due.';
  const parts = [`${m.fires} automation${m.fires === 1 ? '' : 's'} fired`, `${m.approved}/${m.queued} approved`];
  if (m.sent > 0) parts.push(`${m.sent} sent${m.opened > 0 ? ` · ${m.opened} opened` : ''}`);
  return `This month: ${parts.join(' · ')}. Every send was approved by you.`;
}

/** First instant of the current month (UTC) — the report window. */
export function monthStartIso(nowIso?: string): string {
  const d = new Date(nowIso ?? Date.now());
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}
