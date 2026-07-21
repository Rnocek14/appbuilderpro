import {
  ArrowRight, CheckCircle2, Hammer, Lightbulb, LineChart, Sparkles, Users,
} from 'lucide-react';
import { Badge } from '../ui';
import { cn } from '../../lib/utils';
import type { WebCluster } from '../../lib/garvis/workwebRun';
import { workshopFor, workshopState } from '../../lib/garvis/workshops';

export interface WorkshopInstance {
  worldId: string;
  businessTitle: string;
  cluster: WebCluster;
}

const GROUP_ICON = {
  create: Hammer,
  grow: Users,
  understand: Lightbulb,
  organize: LineChart,
} as const;

const TONE = {
  ember: {
    border: 'border-forge-ember/30 hover:border-forge-ember/65',
    wash: 'from-forge-ember/15 via-forge-panel/70 to-forge-panel',
    icon: 'border-forge-ember/30 bg-forge-ember/10 text-forge-ember',
    glow: 'bg-forge-ember/20',
  },
  violet: {
    border: 'border-forge-violet/30 hover:border-forge-violet/65',
    wash: 'from-forge-violet/15 via-forge-panel/70 to-forge-panel',
    icon: 'border-forge-violet/30 bg-forge-violet/10 text-forge-violet',
    glow: 'bg-forge-violet/20',
  },
  ok: {
    border: 'border-forge-ok/25 hover:border-forge-ok/60',
    wash: 'from-forge-ok/10 via-forge-panel/70 to-forge-panel',
    icon: 'border-forge-ok/30 bg-forge-ok/10 text-forge-ok',
    glow: 'bg-forge-ok/15',
  },
  blue: {
    border: 'border-sky-400/25 hover:border-sky-400/55',
    wash: 'from-sky-400/10 via-forge-panel/70 to-forge-panel',
    icon: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
    glow: 'bg-sky-400/15',
  },
} as const;

export function WorkshopCard({ instance, onOpen }: { instance: WorkshopInstance; onOpen: () => void }) {
  const { cluster } = instance;
  const workshop = workshopFor(cluster.charter);
  const state = workshopState(cluster);
  const Icon = GROUP_ICON[workshop.group];
  const tone = TONE[workshop.tone];
  const cta = state.tone === 'warn' ? 'Review now' : cluster.earnedArtifacts > 0 ? 'Continue workshop' : 'Enter workshop';

  return (
    <button
      onClick={onOpen}
      className={cn(
        'group relative flex min-h-[300px] w-full flex-col overflow-hidden rounded-2xl border bg-gradient-to-br p-5 text-left shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-xl focus-visible:-translate-y-1',
        tone.border, tone.wash,
      )}
    >
      <span className={cn('pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full blur-3xl transition-opacity group-hover:opacity-100', tone.glow)} />

      <div className="relative flex items-start gap-3">
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border', tone.icon)}>
          <Icon size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-forge-dim">{workshop.kicker}</p>
          <h2 className="mt-1 truncate font-display text-lg font-semibold text-forge-ink">{workshop.name}</h2>
          <p className="mt-0.5 truncate text-xs text-forge-dim">{instance.businessTitle} · {cluster.title}</p>
        </div>
        <Badge tone={state.tone}>{state.label}</Badge>
      </div>

      <p className="relative mt-5 text-[15px] font-medium leading-snug text-forge-ink">{workshop.outcome}</p>
      <p className="relative mt-2 line-clamp-3 text-sm leading-relaxed text-forge-dim">{workshop.description}</p>

      <div className="relative mt-5 flex items-center gap-1.5" aria-label={`Workshop rhythm: ${workshop.steps.join(', ')}`}>
        {workshop.steps.map((step, i) => (
          <div key={step} className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[9px] font-semibold',
              i < state.activeStep ? 'border-forge-ok/40 bg-forge-ok/10 text-forge-ok'
                : i === state.activeStep ? 'border-forge-ember/50 bg-forge-ember/10 text-forge-ember'
                : 'border-forge-border text-forge-dim/60',
            )}>
              {i < state.activeStep ? <CheckCircle2 size={11} /> : i + 1}
            </span>
            {i < workshop.steps.length - 1 && <span className={cn('h-px min-w-2 flex-1', i < state.activeStep ? 'bg-forge-ok/35' : 'bg-forge-border')} />}
          </div>
        ))}
      </div>
      <div className="relative mt-1 grid grid-cols-3 gap-2 text-[10px] text-forge-dim/80">
        {workshop.steps.map((step) => <span key={step} className="truncate">{step}</span>)}
      </div>

      <div className="relative mt-auto flex items-end justify-between gap-3 pt-5">
        <div>
          <p className="text-xs font-medium text-forge-ink">{state.detail}</p>
          {cluster.playbookArtifacts > 0 && cluster.earnedArtifacts === 0 && (
            <p className="mt-0.5 flex items-center gap-1 text-[10px] text-forge-dim"><Sparkles size={10} /> Expert starting material included</p>
          )}
        </div>
        <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-forge-ember">
          {cta} <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
        </span>
      </div>
    </button>
  );
}
