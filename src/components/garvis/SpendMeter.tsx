// src/components/garvis/SpendMeter.tsx
// WHAT THIS HAS COST YOU TODAY — one line, next to the buttons that spend.
//
// The caps were always real. What was missing was any way to see them coming: you pressed a button,
// it worked, you pressed it again, and at some invisible point it stopped — with a message that told
// you to upgrade a plan that had nothing to do with it. A limit you cannot see is indistinguishable
// from a bug, which is exactly what it got mistaken for.
//
// So: the number is on the page BEFORE the press, it goes amber at four fifths, and when it is
// reached the line says which limit, when it resets, and where to change it — never "something went
// wrong". The state comes from useSpendState below, which the page holds too, so the page can also
// disable its own expensive button rather than letting someone press into a wall.

import { useCallback, useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Loader2, Wallet } from 'lucide-react';
import { cn } from '../../lib/utils';
import { loadSpendState, spendLine, spendTone, fractionUsed, limitReached, type GuardState } from '../../lib/garvis/spendLimit';

const TONE = {
  ok: { text: 'text-forge-dim', bar: 'bg-forge-ok/60', border: 'border-forge-border' },
  close: { text: 'text-forge-warn', bar: 'bg-forge-warn', border: 'border-forge-warn/40' },
  stopped: { text: 'text-forge-ember', bar: 'bg-forge-ember', border: 'border-forge-ember/50' },
} as const;

export function SpendMeter({ state, refresh, note }: {
  /** undefined while loading, null when it can't be read (then this renders nothing rather than
   *  guessing — a wrong spending figure is worse than no figure). */
  state: GuardState | null | undefined;
  refresh?: () => void;
  /** What one press of this page's button roughly does, in plain terms. Optional. */
  note?: string;
}) {
  if (state === undefined) {
    return <p className="flex items-center gap-1.5 text-[11px] text-forge-dim"><Loader2 size={11} className="animate-spin" /> Checking what you've spent today…</p>;
  }
  if (state === null) return null;

  const tone = spendTone(state);
  const t = TONE[tone];
  const stopped = limitReached(state) !== 'none';

  return (
    <div className={cn('rounded-lg border px-2.5 py-2', t.border, stopped ? 'bg-forge-ember/[0.05]' : 'bg-transparent')}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Wallet size={12} className={t.text} />
        <span className={cn('text-[11.5px]', stopped ? 'font-medium text-forge-ink' : t.text)}>{spendLine(state)}</span>
        <NavLink to="/settings#spending" className="text-[11px] text-forge-ember hover:underline">
          {stopped ? 'Change the limit' : 'Change this'}
        </NavLink>
        {refresh && (
          <button onClick={refresh} className="text-[11px] text-forge-dim hover:text-forge-ink">Recheck</button>
        )}
      </div>
      {/* The bar is the warning the sentence alone does not give: a number climbing toward a number
          reads as "getting close" long before anyone does the division in their head. */}
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-forge-raised">
        <div className={cn('h-full rounded-full transition-[width]', t.bar)} style={{ width: `${Math.round(fractionUsed(state) * 100)}%` }} />
      </div>
      {note && !stopped && <p className="mt-1 text-[10.5px] text-forge-dim/80">{note}</p>}
    </div>
  );
}

/** Load + reload the owner's spend state. `undefined` while loading, `null` when it can't be read —
 *  the two states SpendMeter deliberately draws differently. Every page that spends calls this and
 *  re-runs it after a spending action, so the number on screen is never stale by a whole session. */
export function useSpendState(): [GuardState | null | undefined, () => void] {
  const [state, setState] = useState<GuardState | null | undefined>(undefined);
  const refresh = useCallback(() => {
    void loadSpendState().then(setState).catch(() => setState(null));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return [state, refresh];
}
