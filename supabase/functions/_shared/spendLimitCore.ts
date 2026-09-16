// supabase/functions/_shared/spendLimitCore.ts
// WHAT THE SPENDING LIMIT SAYS. Pure; verified by spendLimitCore.verify.ts; re-exported to the client
// through src/lib/garvis/spendLimit.ts so the edge function that refuses and the screen that explains
// the refusal cannot word it differently.
//
// WHY THIS EXISTS. The caps themselves were already real (app_0127: a per-owner daily and monthly
// dollar cap plus a kill switch, enforced inside checkCredits, which every AI-spending function goes
// through). What was missing was the truth reaching the operator:
//
//   · SpendCapError subclasses InsufficientCreditsError so that no call site had to change. Two
//     places then caught the parent and threw the child's message away, answering "Out of credits —
//     Upgrade or wait for your monthly refill" to someone who had simply reached the daily limit
//     they set themselves. Upgrading would not have helped. Waiting for a monthly refill would not
//     have helped. The one thing that would have — raising their own number, or waiting for
//     midnight — was the one thing the message did not say.
//   · The screen never said what had been spent, so the wall arrived with no warning at all.
//
// So every sentence here names the real remedy, and every one of them says, in some form, that
// nothing is broken. A limit doing its job must never read like a fault.

/** Which wall a state is against, if any. 'none' means there is nothing stopping a call. */
export type LimitKind = 'kill_switch' | 'daily_cap' | 'monthly_cap' | 'out_of_credits' | 'none';

/** The guard as `spend_guard_state` reports it, in ordinary field names. */
export interface GuardState {
  kill: boolean;
  dailyCap: number;
  monthlyCap: number;
  spentToday: number;
  spentMonth: number;
}

/** Tolerate the raw jsonb the RPC returns (snake_case, numbers arriving as strings). Anything
 *  missing reads as zero rather than as unlimited — an unreadable guard must never look permissive. */
export function parseGuard(raw: unknown): GuardState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown): number => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    kill: r.kill === true,
    dailyCap: num(r.daily_cap),
    monthlyCap: num(r.monthly_cap),
    spentToday: num(r.spent_today),
    spentMonth: num(r.spent_month),
  };
}

const money = (n: number): string => `$${n.toFixed(2)}`;

/** Which wall this state is against. The switch beats the caps: if it is off, that is the reason,
 *  and telling someone about a cap they have not reached would send them to the wrong control. */
export function limitReached(g: GuardState): LimitKind {
  if (g.kill) return 'kill_switch';
  if (g.dailyCap > 0 && g.spentToday >= g.dailyCap) return 'daily_cap';
  if (g.monthlyCap > 0 && g.spentMonth >= g.monthlyCap) return 'monthly_cap';
  return 'none';
}

/** The sentence for a wall. Names what happened, what undoes it, and that nothing is broken —
 *  which is the whole point: a limit working correctly must not read like a malfunction. */
export function limitMessage(kind: LimitKind, g?: GuardState): string {
  switch (kind) {
    case 'kill_switch':
      return 'Nothing is broken — you switched AI spending off. Nothing will run until you switch it back on, under "What this is allowed to spend" in Settings.';
    case 'daily_cap':
      return `Nothing is broken — that is today's spending limit reached${g ? ` (${money(g.spentToday)} of the ${money(g.dailyCap)} a day you allow)` : ''}. It starts fresh at midnight UTC. Raise the limit in Settings if you want to keep going now.`;
    case 'monthly_cap':
      return `Nothing is broken — that is this month's spending limit reached${g ? ` (${money(g.spentMonth)} of the ${money(g.monthlyCap)} a month you allow)` : ''}. It starts fresh on the 1st. Raise the limit in Settings if you want to keep going now.`;
    case 'out_of_credits':
      return 'Nothing is broken — this account is out of credits for the month. They refill on your plan\'s renewal date, or you can upgrade for more.';
    case 'none':
      return '';
  }
}

/** Read a failure sentence back to the reason behind it, so a screen can show the right control
 *  next to it. The verify suite round-trips every kind through limitMessage and back, so these
 *  patterns cannot drift away from the sentences they are meant to recognise.
 *
 *  It also catches the older hand-written wordings still in the record (a paused standing order's
 *  stored note, say) rather than only the ones this module writes today. */
export function classifyFailure(message: string | null | undefined): LimitKind {
  if (!message) return 'none';
  const m = message.toLowerCase();
  if (/switched ai spending off|kill switch/.test(m)) return 'kill_switch';
  if (/today's spending limit|daily spend cap/.test(m)) return 'daily_cap';
  if (/this month's spending limit|monthly spend cap/.test(m)) return 'monthly_cap';
  if (/out of credits/.test(m)) return 'out_of_credits';
  return 'none';
}

/** True when a failure is a limit doing its job rather than something going wrong. The distinction
 *  decides whether a screen says "here is your limit" or "here is what failed". */
export function isLimitFailure(message: string | null | undefined): boolean {
  return classifyFailure(message) !== 'none';
}

export type SpendTone = 'ok' | 'close' | 'stopped';

/** How close the day is to its limit. 'close' starts at four fifths, which is early enough to be a
 *  warning and late enough not to nag. */
export function spendTone(g: GuardState): SpendTone {
  if (limitReached(g) !== 'none') return 'stopped';
  if (g.dailyCap > 0 && g.spentToday / g.dailyCap >= 0.8) return 'close';
  if (g.monthlyCap > 0 && g.spentMonth / g.monthlyCap >= 0.8) return 'close';
  return 'ok';
}

/** 0–1 of the daily allowance used, for a bar. Clamped, and 0 when there is no cap to measure against. */
export function fractionUsed(g: GuardState): number {
  if (g.dailyCap <= 0) return 0;
  return Math.max(0, Math.min(1, g.spentToday / g.dailyCap));
}

/** The line shown BEFORE anything is pressed, so the wall is never a surprise. Always states both
 *  numbers: a total with nothing to measure it against tells you nothing about whether to worry. */
export function spendLine(g: GuardState): string {
  const kind = limitReached(g);
  if (kind === 'kill_switch') return 'AI spending is switched off — nothing will run.';
  if (kind === 'daily_cap') return `Today's limit is used up — ${money(g.spentToday)} of ${money(g.dailyCap)}. It starts fresh at midnight UTC.`;
  if (kind === 'monthly_cap') return `This month's limit is used up — ${money(g.spentMonth)} of ${money(g.monthlyCap)}. It starts fresh on the 1st.`;
  return `Spent today: ${money(g.spentToday)} of the ${money(g.dailyCap)} you allow. This month: ${money(g.spentMonth)} of ${money(g.monthlyCap)}.`;
}
