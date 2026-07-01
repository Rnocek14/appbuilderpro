import { Link } from 'react-router-dom';
import { Activity, RefreshCw, Lightbulb, AlertTriangle, Sparkles, Zap } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { useObservability } from '../hooks/useObservability';
import { Badge, Button, Card, Spinner, StatCard } from '../components/ui';
import { formatUsd, timeAgo } from '../lib/utils';
import type { FeedItem } from '../lib/garvis/observability';

const DOT: Record<FeedItem['tone'], string> = { ok: 'bg-emerald-500', ember: 'bg-forge-ember', warn: 'bg-red-500', dim: 'bg-forge-dim/40' };
const KIND_LABEL: Record<FeedItem['kind'], string> = { mission: 'mission', opportunity: 'opportunity', recommend: 'recommendation', analyze: 'triage', content: 'marketing', outcome: 'outcome' };

export default function MissionControl() {
  const { data, loading, refresh } = useObservability();

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Activity size={20} className="text-forge-ember" />
          <div>
            <h1 className="font-display text-xl font-semibold">Mission Control</h1>
            <p className="text-sm text-forge-dim">What Garvis is doing, what it found, and what it spent.</p>
          </div>
          <Button variant="ghost" className="ml-auto" onClick={refresh}><RefreshCw size={14} /> Refresh</Button>
        </div>

        {loading ? (
          <div className="py-16 text-center"><Spinner label="Gathering…" /></div>
        ) : (
          <>
            {data.running > 0 && (
              <div className="mb-4 rounded-lg border border-forge-ember/30 bg-forge-ember/5 px-3 py-2">
                <Spinner label={`Garvis is working — ${data.running} active task${data.running === 1 ? '' : 's'} running or queued.`} />
              </div>
            )}

            <div className="mb-4 grid gap-3 sm:grid-cols-4">
              <StatCard label="Opportunities" value={String(data.today.opportunities)} hint="Found today" />
              <StatCard label="Missions done" value={String(data.today.missionsCompleted)} hint="Today" />
              <StatCard label="Recommendations" value={String(data.today.recommendations)} hint="Today" />
              <StatCard label="AI spend" value={formatUsd(data.today.spendUsd)} hint="Today" />
            </div>

            <Card className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-1 p-3 text-xs text-forge-dim">
              <span><span className="text-forge-ink">Spend</span> — today {formatUsd(data.spend.today)} · 7-day {formatUsd(data.spend.week)} · all-time {formatUsd(data.spend.total)}</span>
              {data.staleCount > 0 && (
                <Link to="/garvis" className="inline-flex items-center gap-1 text-forge-ember hover:underline">
                  <AlertTriangle size={12} /> {data.staleCount} stale commitment{data.staleCount === 1 ? '' : 's'}
                </Link>
              )}
            </Card>

            <div className="mb-6 grid gap-3 sm:grid-cols-3">
              <Card className="p-3">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-forge-dim"><Lightbulb size={12} className="text-forge-ember" /> Top opportunity</div>
                {data.topOpportunity
                  ? <Link to="/garvis/opportunities" className="block"><p className="text-sm font-medium text-forge-ink hover:text-forge-ember">{data.topOpportunity.title}</p>{data.topOpportunity.suggested_move && <p className="mt-1 line-clamp-2 text-[11px] text-forge-dim">{data.topOpportunity.suggested_move}</p>}</Link>
                  : <p className="text-xs text-forge-dim/60">None yet — run a scan.</p>}
              </Card>
              <Card className="p-3">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-forge-dim"><AlertTriangle size={12} className="text-red-500" /> Top risk</div>
                {data.topRisk
                  ? <Link to="/garvis/opportunities" className="block"><p className="text-sm font-medium text-forge-ink hover:text-forge-ember">{data.topRisk.title}</p>{data.topRisk.rationale && <p className="mt-1 line-clamp-2 text-[11px] text-forge-dim">{data.topRisk.rationale}</p>}</Link>
                  : <p className="text-xs text-forge-dim/60">Nothing flagged.</p>}
              </Card>
              <Card className="p-3">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-forge-dim"><Sparkles size={12} className="text-forge-ember" /> Top recommendation</div>
                {data.topRecommendation
                  ? <Link to="/garvis" className="block text-sm font-medium text-forge-ink hover:text-forge-ember">{data.topRecommendation}</Link>
                  : <p className="text-xs text-forge-dim/60">Ask Garvis what to work on.</p>}
              </Card>
            </div>

            <Card className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <Zap size={15} className="text-forge-ember" />
                <h2 className="font-display text-sm font-semibold">Activity</h2>
              </div>
              {data.feed.length === 0 ? (
                <p className="text-xs text-forge-dim/60">Nothing yet. Talk to Garvis in Command to get started.</p>
              ) : (
                <div className="space-y-1.5">
                  {data.feed.map((f) => (
                    <div key={f.id} className="flex items-center gap-2.5 border-b border-forge-border/50 py-1.5 last:border-0">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[f.tone]}`} />
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-forge-dim/60">{KIND_LABEL[f.kind]}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-forge-ink">{f.title}</span>
                      <span className="shrink-0 text-[10px] text-forge-dim/60">{timeAgo(f.ts)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
