// src/pages/Leads.tsx  (/garvis/leads)
// THE PROSPECT POOL — the accumulating list of real businesses the daily hunt has discovered
// (Google Places), deduped by place + website, never purged. This is the "huge list over time":
// every lead the hunt found lands here permanently. 'new' = waiting to be built into a demo,
// 'built' = already turned into a demo/pitch, 'skipped' = passed over. No-website businesses are the
// strongest "build you a site" prospects and are flagged as such.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, ExternalLink, Loader2, MapPin, Globe, RefreshCw, Search, Square } from 'lucide-react';
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
  const [noSiteOnly, setNoSiteOnly] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeMsg, setScrapeMsg] = useState<string | null>(null);
  const stopRef = useRef(false);

  const load = useCallback(async () => {
    setBusy(true);
    const { data, error } = await supabase.from('discovered_businesses')
      .select('id, company_name, city, state, website, has_website, keyword, status, created_at')
      .order('has_website', { ascending: true })   // no-website (the best sell targets) first
      .order('created_at', { ascending: false }).limit(500);
    setBusy(false);
    if (error) { setRows('error'); return; }
    setRows((data ?? []) as Lead[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  // SCRAPE EVERYTHING: loop the Claude web-search engine (every business type × every metro). Claude
  // finds real businesses AND judges their site quality, persisting each grounded find into the pool —
  // no Google Places, no Cloud setup. Each combo is a metered Claude call, so batches stay small and
  // the loop pauses after a bounded run (press again to keep filling). Live progress each batch.
  const MAX_ITERS = 60;   // ~120 combos/press — bounds unattended spend; resume by pressing again.
  const scrape = async () => {
    setScraping(true); stopRef.current = false; setScrapeMsg('Searching the web…');
    let added = 0; let combos = 0; let i = 0;
    try {
      for (; i < MAX_ITERS && !stopRef.current; i++) {
        const { data, error } = await supabase.functions.invoke('discover-run', { body: { batch: 2, source: 'claude' } });
        const d = data as { ok?: boolean; combosRun?: number; newLeads?: number; poolTotal?: number; noWebsite?: number; freshCombosLeft?: number; apiError?: string; error?: string } | null;
        if (error || !d?.ok) { setScrapeMsg(d?.error ?? 'Discovery call failed — check ANTHROPIC_API_KEY in Supabase secrets.'); break; }
        if (d.apiError) { setScrapeMsg(`Search rejected (${d.apiError.slice(0, 90)}) — check ANTHROPIC_API_KEY, then resume.`); break; }
        added += d.newLeads ?? 0; combos += d.combosRun ?? 0;
        setScrapeMsg(`+${added} new · ${d.poolTotal ?? 0} in pool · ${d.noWebsite ?? 0} need a website · ${combos} areas searched`);
        if ((d.freshCombosLeft ?? 0) === 0 && (d.newLeads ?? 0) === 0) { setScrapeMsg(`Swept the whole grid — ${d.poolTotal ?? 0} in pool, ${d.noWebsite ?? 0} need a website.`); break; }
      }
      if (i >= MAX_ITERS && !stopRef.current) setScrapeMsg(`Paused after ${combos} areas (+${added} new). Press “Scrape everything” to keep filling.`);
    } catch (e) { setScrapeMsg(e instanceof Error ? e.message : 'Discovery failed.'); }
    setScraping(false);
    await load();
  };

  const all = rows === null || rows === 'error' ? [] : rows;
  const counts = { all: all.length, new: 0, built: 0, skipped: 0 } as Record<Tab, number>;
  for (const r of all) if (r.status in counts) counts[r.status as Tab]++;
  const noSiteCount = all.filter((r) => !r.has_website).length;
  let visible = tab === 'all' ? all : all.filter((r) => r.status === tab);
  if (noSiteOnly) visible = visible.filter((r) => !r.has_website);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border bg-forge-panel">
            <Users size={20} className="text-forge-ember" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-forge-ink">Prospect pool</h1>
            <p className="text-sm text-forge-dim">Every local business, scraped and kept — deduped, never purged. The ones with <span className="font-medium text-forge-ember">no website</span> are your best sell targets and sort first.</p>
          </div>
          <button onClick={() => void load()} disabled={busy} title="Refresh"
            className="rounded-lg border border-forge-border p-2 text-forge-dim transition-colors hover:text-forge-ink disabled:opacity-50">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          </button>
        </div>

        {/* SCRAPE EVERYTHING — fill the pool from the whole (every-business × every-metro) grid. */}
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-forge-border bg-forge-panel/40 p-3">
          {scraping ? (
            <button onClick={() => { stopRef.current = true; }}
              className="inline-flex items-center gap-2 rounded-lg border border-forge-border px-3.5 py-2 text-sm font-medium text-forge-ink hover:border-forge-err/60 hover:text-forge-err">
              <Square size={14} /> Stop
            </button>
          ) : (
            <button onClick={() => void scrape()}
              className="inline-flex items-center gap-2 rounded-lg bg-forge-ember px-3.5 py-2 text-sm font-semibold text-forge-bg shadow transition-transform hover:-translate-y-0.5">
              <Search size={14} /> Scrape everything
            </button>
          )}
          <span className="min-w-0 flex-1 text-xs text-forge-dim">
            {scraping && <Loader2 size={12} className="mr-1.5 inline animate-spin" />}
            {scrapeMsg ?? 'Claude searches the web for real businesses across every major US metro and judges each one’s website — no Google setup. Leave it running; it fills the pool.'}
          </span>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-1">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn('rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                tab === t ? 'bg-forge-ember/10 text-forge-ember' : 'text-forge-dim hover:bg-forge-raised hover:text-forge-ink')}>
              {t}<span className="ml-1 text-[10px] text-forge-dim">({counts[t]})</span>
            </button>
          ))}
          <button onClick={() => setNoSiteOnly((v) => !v)}
            className={cn('ml-auto rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              noSiteOnly ? 'bg-forge-ember/15 text-forge-ember' : 'text-forge-dim hover:bg-forge-raised hover:text-forge-ink')}>
            No website only<span className="ml-1 text-[10px]">({noSiteCount})</span>
          </button>
        </div>

        {rows === null ? (
          <p className="flex items-center gap-2 text-sm text-forge-dim"><Loader2 size={14} className="animate-spin" /> Loading the pool…</p>
        ) : rows === 'error' ? (
          <p className="text-sm text-forge-dim">Couldn’t load the pool — the discovery migration may not be applied yet.</p>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-forge-border bg-forge-panel/40 p-8 text-center">
            <p className="text-sm font-medium text-forge-ink">{all.length === 0 ? 'No prospects yet' : `Nothing ${tab}`}</p>
            <p className="mt-1 text-xs text-forge-dim">{all.length === 0
              ? 'Press “Scrape everything” above — Claude searches the web for real businesses and fills this pool, no Google setup needed.'
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
