import { Check, Hammer, Lightbulb, LineChart, Sparkles, Users } from 'lucide-react';
import { Badge } from '../ui';
import { cn } from '../../lib/utils';
import type { WebCluster } from '../../lib/garvis/workwebRun';
import { workshopFor, workshopState } from '../../lib/garvis/workshops';

const GROUP_ICON = { create: Hammer, grow: Users, understand: Lightbulb, organize: LineChart } as const;

export function WorkshopHeader({ businessTitle, cluster }: { businessTitle: string; cluster: WebCluster }) {
  const workshop = workshopFor(cluster.charter);
  const state = workshopState(cluster);
  const Icon = GROUP_ICON[workshop.group];

  return (
    <section className="relative mb-5 overflow-hidden rounded-3xl border border-forge-ember/25 bg-gradient-to-br from-forge-ember/15 via-forge-panel to-forge-panel p-5 sm:p-7">
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-forge-ember/15 blur-3xl" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-forge-ember/35 bg-forge-ember/10 text-forge-ember shadow-lg shadow-black/10">
          <Icon size={25} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-forge-ember">Workshop</span>
            <Badge tone={state.tone}>{state.label}</Badge>
          </div>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-forge-ink sm:text-3xl">{workshop.name}</h1>
          <p className="mt-1 text-xs text-forge-dim">{businessTitle} · {cluster.title}</p>
          <p className="mt-4 max-w-2xl text-base font-medium leading-relaxed text-forge-ink">{workshop.outcome}</p>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-forge-dim">{workshop.description}</p>
        </div>
      </div>

      <div className="relative mt-6 grid gap-2 sm:grid-cols-3">
        {workshop.steps.map((step, i) => (
          <div
            key={step}
            className={cn(
              'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs transition-colors',
              i < state.activeStep ? 'border-forge-ok/30 bg-forge-ok/10 text-forge-ok'
                : i === state.activeStep ? 'border-forge-ember/40 bg-forge-ember/10 text-forge-ink'
                : 'border-forge-border bg-forge-bg/25 text-forge-dim',
            )}
          >
            <span className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold',
              i < state.activeStep ? 'border-forge-ok/40' : i === state.activeStep ? 'border-forge-ember/50 text-forge-ember' : 'border-forge-border',
            )}>
              {i < state.activeStep ? <Check size={12} /> : i + 1}
            </span>
            <span className="font-medium">{step}</span>
            {i === state.activeStep && <Sparkles size={12} className="ml-auto text-forge-ember" />}
          </div>
        ))}
      </div>
    </section>
  );
}
