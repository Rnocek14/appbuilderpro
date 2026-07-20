import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Hammer, Lightbulb, LineChart, Plus, Search, Sparkles, Users,
} from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Button, EmptyState, Skeleton } from '../components/ui';
import { WorkshopCard, type WorkshopInstance } from '../components/garvis/WorkshopCard';
import { useToast } from '../context/ToastContext';
import { cn } from '../lib/utils';
import { listWebs, loadWeb } from '../lib/garvis/workwebRun';
import {
  WORKSHOP_GROUPS, workshopFor, workshopSearchText, workshopState,
  type WorkshopGroup,
} from '../lib/garvis/workshops';

type Filter = 'all' | WorkshopGroup;

const GROUP_ICON = { create: Hammer, grow: Users, understand: Lightbulb, organize: LineChart } as const;

export default function Workshops({ previewInstances }: { previewInstances?: WorkshopInstance[] } = {}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [instances, setInstances] = useState<WorkshopInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (previewInstances) {
      setInstances(previewInstances);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const summaries = await listWebs();
      const webs = await Promise.all(summaries.map((summary) => loadWeb(summary.worldId)));
      const next = webs.flatMap((web) => web
        ? web.clusters
          .filter((cluster) => !!cluster.charter)
          .map((cluster) => ({ worldId: web.worldId, businessTitle: web.title, cluster }))
        : []);
      setInstances(next);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not open your workshops.');
    } finally {
      setLoading(false);
    }
  }, [toast, previewInstances]);

  useEffect(() => { void load(); }, [load]);

  const sorted = useMemo(() => [...instances].sort((a, b) => {
    const as = workshopState(a.cluster);
    const bs = workshopState(b.cluster);
    const weight = (tone: typeof as.tone) => tone === 'warn' ? 0 : tone === 'ember' ? 1 : tone === 'ok' ? 2 : 3;
    return weight(as.tone) - weight(bs.tone)
      || a.businessTitle.localeCompare(b.businessTitle)
      || a.cluster.title.localeCompare(b.cluster.title);
  }), [instances]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((instance) => {
      const workshop = workshopFor(instance.cluster.charter);
      return (filter === 'all' || workshop.group === filter)
        && (!q || workshopSearchText(workshop, instance.cluster.title, instance.businessTitle).includes(q));
    });
  }, [sorted, filter, query]);

  const counts = useMemo(() => {
    const states = instances.map((x) => workshopState(x.cluster));
    return {
      active: states.filter((x) => x.tone === 'ember').length,
      review: states.filter((x) => x.tone === 'warn').length,
      ready: states.filter((x) => x.tone === 'dim').length,
    };
  }, [instances]);

  const open = (instance: WorkshopInstance) => {
    navigate(`/garvis/webs/${instance.worldId}?area=${encodeURIComponent(instance.cluster.slug)}&workshop=1`);
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-9">
        <header className="relative overflow-hidden rounded-3xl border border-forge-border bg-gradient-to-br from-forge-ember/15 via-forge-panel to-forge-panel px-5 py-7 sm:px-8 sm:py-9">
          <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-forge-ember/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-forge-violet/10 blur-3xl" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-forge-ember">
                <Sparkles size={16} />
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em]">Garvis Workshops</span>
              </div>
              <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-forge-ink sm:text-4xl">What do you want to make today?</h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-forge-dim sm:text-base">
                Pick one outcome and enter a focused room. Garvis brings the right tools, business context, saved work, and next step with you.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Stat value={counts.active} label="in progress" tone="ember" />
              <Stat value={counts.review} label="to review" tone="warn" />
              <Stat value={counts.ready} label="ready" tone="dim" />
              <Button variant="outline" onClick={() => navigate('/garvis/webs')}><Plus size={14} /> Add a business</Button>
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Workshop types">
          {WORKSHOP_GROUPS.map((group) => {
            const Icon = GROUP_ICON[group.id];
            const selected = filter === group.id;
            const count = instances.filter((x) => workshopFor(x.cluster.charter).group === group.id).length;
            return (
              <button
                key={group.id}
                onClick={() => setFilter(selected ? 'all' : group.id)}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition duration-150',
                  selected ? 'border-forge-ember/55 bg-forge-ember/10 shadow-lg shadow-black/10' : 'border-forge-border bg-forge-panel/60 hover:border-forge-ember/35 hover:bg-forge-raised/60',
                )}
              >
                <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl border', selected ? 'border-forge-ember/35 bg-forge-ember/10 text-forge-ember' : 'border-forge-border text-forge-dim')}>
                  <Icon size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-forge-ink">{group.label}</span>
                  <span className="block truncate text-[11px] text-forge-dim">{group.prompt}</span>
                </span>
                <span className="text-xs tabular-nums text-forge-dim">{count}</span>
              </button>
            );
          })}
        </section>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-forge-dim" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a workshop, business, or thing you want to make…"
              className="w-full rounded-xl border border-forge-border bg-forge-panel py-2.5 pl-9 pr-3 text-sm text-forge-ink outline-none placeholder:text-forge-dim/60 focus:border-forge-ember/55"
            />
          </div>
          <button
            onClick={() => { setFilter('all'); setQuery(''); }}
            className={cn('rounded-lg px-3 py-2 text-xs transition-colors', filter === 'all' && !query ? 'text-forge-dim/50' : 'text-forge-dim hover:text-forge-ink')}
            disabled={filter === 'all' && !query}
          >Show everything</button>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-forge-ink">
              {filter === 'all' ? 'Your workshops' : `${WORKSHOP_GROUPS.find((x) => x.id === filter)?.label} workshops`}
            </h2>
            <p className="mt-0.5 text-xs text-forge-dim">{visible.length} focused room{visible.length === 1 ? '' : 's'} across your businesses</p>
          </div>
        </div>

        {loading ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => <WorkshopSkeleton key={i} />)}
          </div>
        ) : instances.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<Hammer size={22} />}
              title="Your first workshop starts with a business"
              body="Create a business from a ready-made template or describe what you are working on. Garvis will assemble the useful workshops around that objective."
              action={<Button onClick={() => navigate('/garvis/webs')}>Create the first business <ArrowRight size={14} /></Button>}
            />
          </div>
        ) : visible.length === 0 ? (
          <div className="mt-4">
            <EmptyState icon={<Search size={20} />} title="No workshop matches that" body="Try a broader phrase or show every workshop." action={<Button variant="outline" onClick={() => { setFilter('all'); setQuery(''); }}>Clear filters</Button>} />
          </div>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((instance) => (
              <WorkshopCard
                key={`${instance.worldId}:${instance.cluster.id}`}
                instance={instance}
                onOpen={() => open(instance)}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone: 'ember' | 'warn' | 'dim' }) {
  return (
    <div className={cn(
      'rounded-xl border bg-forge-bg/25 px-3 py-2 text-center',
      tone === 'ember' ? 'border-forge-ember/30' : tone === 'warn' ? 'border-forge-warn/30' : 'border-forge-border',
    )}>
      <p className={cn('font-display text-lg font-semibold tabular-nums', tone === 'ember' ? 'text-forge-ember' : tone === 'warn' ? 'text-forge-warn' : 'text-forge-ink')}>{value}</p>
      <p className="text-[10px] text-forge-dim">{label}</p>
    </div>
  );
}

function WorkshopSkeleton() {
  return (
    <div className="min-h-[300px] rounded-2xl border border-forge-border bg-forge-panel p-5">
      <div className="flex gap-3"><Skeleton className="h-11 w-11 rounded-xl" /><div className="flex-1"><Skeleton className="h-3 w-24" /><Skeleton className="mt-2 h-5 w-40" /></div></div>
      <Skeleton className="mt-6 h-4 w-5/6" /><Skeleton className="mt-2 h-3 w-full" /><Skeleton className="mt-2 h-3 w-4/5" />
      <Skeleton className="mt-7 h-8 w-full rounded-xl" /><Skeleton className="mt-8 h-4 w-1/2" />
    </div>
  );
}
