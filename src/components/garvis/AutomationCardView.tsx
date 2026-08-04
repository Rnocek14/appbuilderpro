// src/components/garvis/AutomationCardView.tsx
// The ONE renderer for automation cards (automationCards.ts) — every automated thing in the app
// explains itself with this same shape, per the trust-calibration research: the autonomy rung is
// the dominant, stable element; the SOP is numbered and medium-detail (drill into logs elsewhere);
// the Never line and kill switch are always visible. Purpose → Process → Boundary, in that order.

import type { AutomationCard } from '../../lib/garvis/automationCards';
import { RUNG_LABEL } from '../../lib/garvis/automationCards';
import { cn } from '../../lib/utils';

export function RungChip({ rung, className }: { rung: AutomationCard['rung']; className?: string }) {
  return (
    <span className={cn(
      'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium',
      rung === 'runs' ? 'border-forge-cyan/50 text-forge-cyan'
        : rung === 'drafts' ? 'border-forge-ember/50 text-forge-ember'
        : 'border-forge-border text-forge-dim',
      className,
    )}>
      {RUNG_LABEL[rung]}
    </span>
  );
}

/** The expanded card body — mount inside any expander/popover. */
export function AutomationCardView({ card }: { card: AutomationCard }) {
  return (
    <div className="space-y-2 rounded-xl border border-forge-border bg-forge-bg/60 p-3 text-left">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold text-forge-ink">{card.name}</p>
        <RungChip rung={card.rung} />
        <span className="text-[10px] text-forge-dim">{card.when}</span>
      </div>
      <p className="text-[11px] text-forge-ink">{card.does}</p>
      <p className="text-[11px] text-forge-dim"><span className="text-forge-ink/80">Replaces:</span> {card.replaces}</p>
      <ol className="space-y-0.5 text-[11px] text-forge-dim">
        {card.sop.map((s, i) => (
          <li key={i} className={cn(/your approval|waits? |wait for you|passed your approval/i.test(s) && 'text-forge-ember/90')}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>
      <p className="text-[11px] text-forge-dim"><span className="text-forge-ink/80">Yours:</span> {card.human}</p>
      <p className="text-[11px] text-forge-dim"><span className="text-forge-ink/80">{card.never.split(' ')[0]}</span> {card.never.split(' ').slice(1).join(' ')}</p>
      <p className="text-[10px] text-forge-dim/80">Off switch: {card.killSwitch} · runs via {card.doneBy}</p>
    </div>
  );
}
