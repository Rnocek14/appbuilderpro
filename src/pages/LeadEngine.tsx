// src/pages/LeadEngine.tsx
// THE LEAD MARKETS DOOR — the named entry for the Lead Engine (docs/lead-engine-master-plan.md):
// every world with a lead-market studio, its live pulse (sources, new leads, last check), and the
// one-click start when there are none. Opening a world lands on the studio itself — this page is
// a directory, not another workspace. SHIPPED DARK: routed but not in the nav until the pilot
// gate passes (the master plan's Phase 2).

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radar, Loader2, Plus } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Button, Card } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import { instantiateWeb } from '../lib/garvis/workwebRun';

interface MarketWorld { worldId: string; title: string; sources: number; newLeads: number; lastStatus: string | null }

export function LeadEngine() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [worlds, setWorlds] = useState<MarketWorld[] | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      // Lead markets = worlds holding a lead_engine studio area.
      const { data: clusters } = await supabase.from('knowledge_clusters')
        .select('world_id, knowledge_worlds!inner(id, title)')
        .contains('charter', { archetype: 'studio', flavor: 'lead_engine' })
        .limit(50);
      const byWorld = new Map<string, MarketWorld>();
      for (const c of (clusters ?? []) as unknown as { world_id: string; knowledge_worlds: { id: string; title: string } }[]) {
        if (c.world_id && !byWorld.has(c.world_id)) {
          byWorld.set(c.world_id, { worldId: c.world_id, title: c.knowledge_worlds?.title ?? 'Untitled', sources: 0, newLeads: 0, lastStatus: null });
        }
      }
      if (byWorld.size) {
        const ids = [...byWorld.keys()];
        const [{ data: srcs }, { data: leads }] = await Promise.all([
          supabase.from('le_sources').select('world_id, active, last_status, last_fetch_at').in('world_id', ids).limit(200),
          supabase.from('le_leads').select('world_id, status').in('world_id', ids).eq('status', 'new').limit(500),
        ]);
        for (const s of (srcs ?? []) as { world_id: string; active: boolean; last_status: string | null; last_fetch_at: string | null }[]) {
          const w = byWorld.get(s.world_id);
          if (!w) continue;
          if (s.active) w.sources++;
          if (s.last_fetch_at && s.last_status) w.lastStatus = s.last_status;
        }
        for (const l of (leads ?? []) as { world_id: string }[]) {
          const w = byWorld.get(l.world_id);
          if (w) w.newLeads++;
        }
      }
      if (live) setWorlds([...byWorld.values()]);
    })().catch(() => { if (live) setWorlds([]); });
    return () => { live = false; };
  }, []);

  const startOne = async () => {
    setCreating(true);
    try {
      const web = await instantiateWeb('lead-market');
      toast('success', 'Lead market created — wire up its first source inside.');
      navigate(`/garvis/webs/${web.worldId}`);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not create it.');
      setCreating(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border bg-forge-panel">
            <Radar size={20} className="text-forge-ember" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-forge-ink">Lead Markets</h1>
            <p className="text-sm text-forge-dim">Public records → ranked trade leads. One market per metro; the clock checks the sources, you approve every send.</p>
          </div>
          <div className="ml-auto">
            <Button onClick={() => void startOne()} loading={creating}>
              <Plus size={14} /> Start a market
            </Button>
          </div>
        </div>

        {worlds === null && <p className="flex items-center gap-2 text-sm text-forge-dim"><Loader2 size={14} className="animate-spin" /> Loading…</p>}

        {worlds?.length === 0 && (
          <Card className="p-6 text-center">
            <p className="text-sm font-medium text-forge-ink">No lead market yet.</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-forge-dim">
              One click sets up the engine: permit portals and license boards checked on the standing clock, new events scored into ranked leads per trade (reasons stated, every lead linking its public record), a weekly digest that goes out only through your approval queue, and outcome + commission tracking against real rows.
            </p>
            <div className="mt-4">
              <Button onClick={() => void startOne()} loading={creating}><Plus size={14} /> Start a market</Button>
            </div>
          </Card>
        )}

        <div className="space-y-3">
          {worlds?.map((w) => (
            <button key={w.worldId} type="button" className="block w-full text-left" onClick={() => navigate(`/garvis/webs/${w.worldId}`)}>
              <Card interactive className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-forge-ink">{w.title}</p>
                    <p className="mt-0.5 text-xs text-forge-dim">
                      {w.sources} active source{w.sources === 1 ? '' : 's'} · {w.newLeads} new lead{w.newLeads === 1 ? '' : 's'}
                      {w.lastStatus && <> · {w.lastStatus}</>}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-forge-ember">open the market →</span>
                </div>
              </Card>
            </button>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

export default LeadEngine;
