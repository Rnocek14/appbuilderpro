// src/pages/Leads.tsx  (/garvis/leads)
// THE PROSPECT POOL — the accumulating list of real businesses the daily hunt has discovered
// (Google Places), deduped by place + website, never purged. This is the "huge list over time":
// every lead the hunt found lands here permanently. 'new' = waiting to be built into a demo,
// 'built' = already turned into a demo/pitch, 'skipped' = passed over. No-website businesses are the
// strongest "build you a site" prospects and are flagged as such.

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, ExternalLink, Loader2, MapPin, Globe, RefreshCw } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Badge } from '../components/ui';
import { cn, timeAgo } from '../lib/utils';
import { supabase } from '../lib/supabase';

interface Lead {
  id: string; company_name: string; city: string | null; state: string | null;
  website: string | null; has_website: boolean; keyword: string | null; status: string; created_at: string;
}

const TABS = ['all', 'new', 'built', 'skipped'] as const;
type Tab = typeof TABS[number];
const STATUS_TONE: Record<string, 'ember' | 'ok' | 'dim'> = { new: 'ember', built: 'ok', skipped: 'dim' };

export default function Leads() {
  const [rows, setRows] = useState<Lead[] | null | 'error'>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    const { data, error } = await supabase.from('discovered_businesses')
      .select('id, company_name, city, state, website, has_website, keyword, status, created_at')
      .order('created_at', { ascending: false }).limit(500);
    setBusy(false);
    if (error) { setRows('error'); return; }
    setRows((data ?? []) as Lead[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const all = rows === null || rows === 'error' ? [] : rows;
  const counts = { all: all.length, new: 0, built: 0, skipped: 0 } as Record<Tab, number>;
  for (const r of all) if (r.status in counts) counts[r.status as Tab]++;
  const visible = tab === 'all' ? all : all.filter((r) => r.status === tab);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border bg-forge-panel">
            <Users size={20} className="text-forge-ember" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-forge-ink">Prospect pool</h1>
            <p className="text-sm text-forge-dim">Every business the daily hunt has found — deduped, kept forever. It grows each run. Build demos for these on <Link to="/garvis/clients" className="text-forge-ember hover:underline">Win clients</Link>.</p>
          </div>
          <button onClick={() => void load()} disabled={busy} title="Refresh"
            className="rounded-lg border border-forge-border p-2 text-forge-dim transition-colors hover:text-forge-ink disabled:opacity-50">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          </button>
        </div>

        <div className="mb-4 flex items-center gap-1">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn('rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                tab === t ? 'bg-forge-ember/10 text-forge-ember' : 'text-forge-dim hover:bg-forge-raised hover:text-forge-ink')}>
              {t}<span className="ml-1 text-[10px] text-forge-dim">({counts[t]})</span>
            </button>
          ))}
        </div>

        {rows === null ? (
          <p className="flex items-center gap-2 text-sm text-forge-dim"><Loader2 size={14} className="animate-spin" /> Loading the pool…</p>
        ) : rows === 'error' ? (
          <p className="text-sm text-forge-dim">Couldn’t load the pool — the discovery migration may not be applied yet.</p>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-forge-border bg-forge-panel/40 p-8 text-center">
            <p className="text-sm font-medium text-forge-ink">{all.length === 0 ? 'No prospects yet' : `Nothing ${tab}`}</p>
            <p className="mt-1 text-xs text-forge-dim">{all.length === 0
              ? 'Start the daily hunt on Win clients — as it runs, real businesses accumulate here. If it’s configured but empty, check the Places key on the Health page.'
              : 'Try another tab.'}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {visible.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl border border-forge-border bg-forge-panel/40 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-forge-ink">{r.company_name}</span>
                    <Badge tone={STATUS_TONE[r.status] ?? 'dim'}>{r.status}</Badge>
                    {!r.has_website && <Badge tone="warn">no website</Badge>}
                    {r.keyword && <span className="text-[11px] text-forge-dim">{r.keyword}</span>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-forge-dim">
                    {(r.city || r.state) && <span className="inline-flex items-center gap-1"><MapPin size={11} /> {[r.city, r.state].filter(Boolean).join(', ')}</span>}
                    {r.website && (
                      <a href={r.website} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-forge-dim hover:text-forge-ember">
                        <Globe size={11} /> {r.website.replace(/^https?:\/\//, '').replace(/\/$/, '')} <ExternalLink size={9} />
                      </a>
                    )}
                    <span className="text-forge-dim/60">found {timeAgo(r.created_at)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
