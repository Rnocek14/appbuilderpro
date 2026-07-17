// src/lib/garvis/automation/report.ts
// Impure half of the monthly automation report: one bounded loader over the ledger tables.
// The line/format math lives in reportCore.ts (pure, verified).

import { supabase } from '../../supabase';
import { monthStartIso, type AutomationMonth } from './reportCore';

export { automationMonthLine, monthStartIso, type AutomationMonth } from './reportCore';

/** Load this month's numbers for the signed-in owner. Best-effort: an un-migrated table yields
 *  zeros (an honest "nothing recorded"), never an error that breaks the page. */
export async function loadAutomationMonth(): Promise<AutomationMonth> {
  const zero: AutomationMonth = { fires: 0, queued: 0, approved: 0, sent: 0, opened: 0 };
  try {
    const since = monthStartIso();
    const { data: fires } = await supabase.from('trigger_fires')
      .select('id, approval_id').gte('created_at', since).limit(2000);
    const fireRows = (fires ?? []) as { id: string; approval_id: string | null }[];
    const approvalIds = fireRows.map((f) => f.approval_id).filter((x): x is string => !!x);

    let approved = 0;
    if (approvalIds.length) {
      const { data: aps } = await supabase.from('approvals')
        .select('id, status').in('id', approvalIds.slice(0, 500));
      approved = ((aps ?? []) as { status: string }[]).filter((a) => a.status === 'approved').length;
    }

    const { data: camps } = await supabase.from('outreach_campaigns')
      .select('id').eq('kind', 'automation').gte('created_at', since).limit(1000);
    const campIds = ((camps ?? []) as { id: string }[]).map((c) => c.id);
    let sent = 0, opened = 0;
    if (campIds.length) {
      const { data: msgs } = await supabase.from('outreach_messages')
        .select('status, opened_at').in('campaign_id', campIds.slice(0, 500));
      const rows = (msgs ?? []) as { status: string; opened_at: string | null }[];
      sent = rows.filter((m) => m.status === 'sent').length;
      opened = rows.filter((m) => m.opened_at).length;
    }
    return { fires: fireRows.length, queued: approvalIds.length, approved, sent, opened };
  } catch {
    return zero;
  }
}
