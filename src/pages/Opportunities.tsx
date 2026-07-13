import { Lightbulb, Search, Play, Bookmark, X, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { useOpportunities } from '../hooks/useOpportunities';
import { useToast } from '../context/ToastContext';
import { Badge, Button, Card, EmptyState, Spinner } from '../components/ui';
import { timeAgo } from '../lib/utils';
import type { GarvisOpportunity, OpportunityType } from '../types';

const TYPE_TONE: Record<OpportunityType, 'ok' | 'ember' | 'warn' | 'dim'> = {
  synergy: 'ok', expansion: 'ember', consolidation: 'warn', risk: 'warn', quick_win: 'ok', positioning: 'ember',
};
const TYPE_LABEL: Record<OpportunityType, string> = {
  synergy: 'Synergy', expansion: 'Expansion', consolidation: 'Consolidation', risk: 'Risk', quick_win: 'Quick win', positioning: 'Positioning',
};

export default function Opportunities() {
  const { active, loading, scanning, scan, save, dismiss, convertToMission } = useOpportunities();
  const { toast } = useToast();

  const onScan = async () => {
    try { const r = await scan(); toast(r.found > 0 ? 'success' : 'info', r.found > 0 ? `Garvis found ${r.found} new opportunit${r.found === 1 ? 'y' : 'ies'}.` : 'No new opportunities right now.'); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Scan failed.'); }
  };
  const onRun = async (o: GarvisOpportunity) => {
    try { const id = await convertToMission(o); if (id) toast('success', 'Turned into a mission — open Missions to run it.'); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Could not convert.'); }
  };

  const live = active.filter((o) => o.status !== 'converted');
  const converted = active.filter((o) => o.status === 'converted');

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Lightbulb size={20} className="text-forge-ember" />
          <div>
            <h1 className="font-display text-xl font-semibold">Opportunities</h1>
            <p className="text-sm text-forge-dim">What Garvis noticed across your portfolio — without being asked.</p>
          </div>
          <Button className="ml-auto" onClick={onScan} loading={scanning}><Search size={14} /> Scan now</Button>
        </div>

        {loading ? (
          <div className="py-16 text-center"><Spinner label="Loading…" /></div>
        ) : live.length === 0 && converted.length === 0 ? (
          <EmptyState icon={<Lightbulb size={28} />} title="Nothing spotted yet" body="Hit “Scan now” and Garvis will reason over your whole portfolio for cross-app synergies, expansion plays, overlaps, and risks." />
        ) : (
          <div className="space-y-3">
            {live.map((o) => (
              <Card key={o.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={TYPE_TONE[o.type]}>{TYPE_LABEL[o.type]}</Badge>
                  <span className="font-display text-sm font-semibold text-forge-ink">{o.title}</span>
                  {o.status === 'saved' && <Badge tone="dim">saved</Badge>}
                  {/* No bare "confidence 0.85": that number is the model's own hunch, not a
                      measurement (deep scan, no-invented-numbers). It stays an internal ordering
                      hint only — never displayed as a metric. */}
                  <span className="ml-auto text-[10px] text-forge-dim/60">{timeAgo(o.created_at)}</span>
                </div>
                {o.related_apps.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {o.related_apps.map((a) => <span key={a} className="rounded border border-forge-border px-1.5 py-0.5 text-[10px] text-forge-dim">{a}</span>)}
                  </div>
                )}
                {o.rationale && <p className="mt-2 text-xs text-forge-dim">{o.rationale}</p>}
                {o.suggested_move && <p className="mt-1.5 text-xs text-forge-ember"><span className="font-medium">Move:</span> {o.suggested_move}</p>}
                <div className="mt-3 flex items-center gap-2">
                  <Button onClick={() => onRun(o)}><Play size={13} /> Run it</Button>
                  {o.status !== 'saved' && <Button variant="ghost" onClick={() => save(o.id)} title="Save for later"><Bookmark size={13} /> Save</Button>}
                  <Button variant="ghost" onClick={() => dismiss(o.id)} title="Dismiss"><X size={13} /> Dismiss</Button>
                </div>
              </Card>
            ))}

            {converted.length > 0 && (
              <div className="pt-2">
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-forge-dim">Converted to missions</p>
                {converted.map((o) => (
                  <div key={o.id} className="flex items-center gap-2 rounded border border-forge-border p-2.5">
                    <Badge tone={TYPE_TONE[o.type]}>{TYPE_LABEL[o.type]}</Badge>
                    <span className="min-w-0 flex-1 truncate text-xs text-forge-dim">{o.title}</span>
                    <Link to="/garvis/missions" className="inline-flex items-center gap-1 text-[11px] text-forge-ember hover:underline">Missions <ArrowUpRight size={11} /></Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
