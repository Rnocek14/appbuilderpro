import { useState } from 'react';
import { Boxes, Github, ExternalLink, Plus, Sparkles, TrendingUp, Rocket, Hammer } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { usePortfolio } from '../hooks/usePortfolio';
import { useToast } from '../context/ToastContext';
import { Badge, Button, Card, EmptyState, Spinner, StatCard } from '../components/ui';
import { formatUsd, timeAgo } from '../lib/utils';
import type { AppStage } from '../types';

const STAGE_TONE: Record<AppStage, 'dim' | 'ember' | 'ok' | 'warn'> = {
  idea: 'dim',
  building: 'ember',
  launched: 'ok',
  growing: 'ok',
  paused: 'warn',
  archived: 'dim',
};

export default function Garvis() {
  const { apps, loading, seeding, seedPortfolio, addApp, rollup } = usePortfolio();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);

  const onSeed = async () => {
    try {
      const n = await seedPortfolio();
      toast('success', n ? `Seeded ${n} products into your portfolio.` : 'Portfolio already populated.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Seeding failed.');
    }
  };

  const onAdd = async () => {
    const name = window.prompt('Product name?')?.trim();
    if (!name) return;
    setAdding(true);
    try {
      await addApp(name);
      toast('success', `Added “${name}”.`);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not add product.');
    } finally {
      setAdding(false);
    }
  };

  const askGarvis = () => {
    // INTEGRATION: cross-portfolio reasoning (Week 4) — an edge function that reads app_metrics +
    // recent agent_runs and returns ranked recommendations, then writes an agent_run(kind:'recommend').
    toast('info', 'Portfolio reasoning lands in Week 4 — first we need metrics flowing into app_metrics.');
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Boxes size={20} className="text-forge-ember" />
          <div>
            <h1 className="font-display text-xl font-semibold">Garvis</h1>
            <p className="text-sm text-forge-dim">Your portfolio control plane — every product, in one place.</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" onClick={askGarvis}><Sparkles size={14} /> What should I work on today?</Button>
            <Button onClick={onAdd} loading={adding}><Plus size={15} /> Add product</Button>
          </div>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-4">
          <StatCard label="Products" value={String(rollup.total)} hint="Active in portfolio" />
          <StatCard label="Live" value={String(rollup.live)} hint="Launched or growing" />
          <StatCard label="Building" value={String(rollup.building)} hint="In active development" />
          <StatCard label="Portfolio MRR" value={formatUsd(rollup.mrr)} hint="Sum of known revenue" />
        </div>

        {loading ? (
          <div className="py-20 text-center"><Spinner label="Loading portfolio…" /></div>
        ) : apps.length === 0 ? (
          <EmptyState
            icon={<Boxes size={28} />}
            title="No products yet"
            body="Seed the repos already on your GitHub, or add a product by hand. This is the layer that turns your scattered apps into one managed portfolio."
            action={<Button onClick={onSeed} loading={seeding}><Github size={15} /> Seed my repos</Button>}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {apps.map((a) => (
              <Card key={a.id} className="group relative flex flex-col p-4 transition-colors hover:border-forge-ember/40">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate font-display text-sm font-semibold">{a.name}</span>
                  <Badge tone={STAGE_TONE[a.stage]}>{a.stage}</Badge>
                </div>
                <p className="mt-1.5 line-clamp-3 min-h-[3rem] text-xs text-forge-dim">{a.description ?? 'No description yet.'}</p>

                {a.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {a.tags.map((t) => (
                      <span key={t} className="rounded border border-forge-border px-1.5 py-0.5 text-[10px] text-forge-dim">{t}</span>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex items-center gap-3 border-t border-forge-border pt-3 text-[11px] text-forge-dim">
                  {Number(a.monthly_revenue) > 0 && (
                    <span className="inline-flex items-center gap-1"><TrendingUp size={12} /> {formatUsd(Number(a.monthly_revenue))}/mo</span>
                  )}
                  <span className="ml-auto">{timeAgo(a.updated_at)}</span>
                </div>

                <div className="mt-2 flex items-center gap-3 text-xs">
                  {a.repo_url && (
                    <a href={a.repo_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-forge-dim hover:text-forge-ink">
                      <Github size={13} /> Repo
                    </a>
                  )}
                  {a.deploy_url
                    ? <a href={a.deploy_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-forge-ember hover:underline"><Rocket size={13} /> Live</a>
                    : <span className="inline-flex items-center gap-1 text-forge-dim/60"><Hammer size={13} /> Not deployed</span>}
                  {a.repo_url && (
                    <a href={a.repo_url} target="_blank" rel="noreferrer" className="ml-auto text-forge-dim hover:text-forge-ink"><ExternalLink size={13} /></a>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
