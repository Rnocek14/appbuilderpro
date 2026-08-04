// src/pages/LeadEngine.tsx
// THE LEAD MARKETS DOOR — the named entry for the Lead Engine (docs/lead-engine-master-plan.md):
// every market, its live pulse, and the TURNKEY start: pick a city and one click creates the
// world, names it, puts it on the hourly clock, wires the permit feed, and fires the first check.
// Opening a market lands on the studio itself — this page is a directory, not another workspace.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radar, Loader2, Plus, Building2 } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Button, Card } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import { quickStartMarket } from '../lib/garvis/leadEngine/leadEngineRun';
import { STARTER_SOURCES, type StarterSource } from '../lib/garvis/leadEngine/adapters.ts';

interface MarketWorld { worldId: string; title: string; sources: number; newLeads: number; lastStatus: string | null }

export function LeadEngine() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [worlds, setWorlds] = useState<MarketWorld[] | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

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

  const start = async (preset?: StarterSource) => {
    setStarting(preset?.id ?? 'blank');
    try {
      const market = await quickStartMarket(preset ?? null);
      toast('success', preset
        ? `${market.title} is live — permit feed wired, clock on, first check running.`
        : 'Market created and on the clock — add its first source inside.');
      navigate(`/garvis/webs/${market.worldId}`);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not create it.');
      setStarting(null);
    }
  };

  const cityRow = (
    <div className="flex flex-wrap gap-2">
      {STARTER_SOURCES.map((p) => (
        <Button key={p.id} size="sm" variant="outline" loading={starting === p.id} disabled={starting !== null}
          onClick={() => void start(p)} title={`${p.label} — creates the market, wires this feed, first check runs now`}>
          <Building2 size={13} /> {p.region}
        </Button>
      ))}
      <Button size="sm" variant="ghost" loading={starting === 'blank'} disabled={starting !== null} onClick={() => void start()}>
        <Plus size={13} /> Blank market
      </Button>
    </div>
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border bg-forge-panel">
            <Radar size={20} className="text-forge-ember" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-forge-ink">Lead Markets</h1>
            <p className="text-sm text-forge-dim">Public records → ranked trade leads. Pick a city; the engine does the rest — and nothing sends without your yes.</p>
          </div>
        </div>

        <Card className="mb-6 p-4">
          <p className="mb-2 text-sm font-medium text-forge-ink">Start a market — one click, fully wired</p>
          <p className="mb-3 text-xs text-forge-dim">
            Creates the market, names it for the city, puts it on the hourly clock, connects the permit feed, and runs the first check immediately. Presets carry each portal's field names; every source stays editable inside.
          </p>
          {cityRow}
        </Card>

        {worlds === null && <p className="flex items-center gap-2 text-sm text-forge-dim"><Loader2 size={14} className="animate-spin" /> Loading…</p>}

        {worlds?.length === 0 && (
          <p className="text-sm text-forge-dim">
            No markets yet — pick a city above. Inside each market: ranked leads with their reasons and public-record links, a setup checklist that always shows the next step, the weekly digest (goes out only through your approval queue), and outcome + commission tracking.
          </p>
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
