// src/pages/Leads.tsx  (/garvis/leads)
// THE PROSPECT PIPELINE — the accumulating pool of real businesses the hunt discovered, laid out as a
// pipeline you move left→right: New → Built → Pitched → Won (Skipped off to the side). Each prospect's
// stage is DERIVED (stage.ts) from its status + demo + any booked sale, so the board is always honest.
// Click any row to open the detail drawer — everything about that one prospect, and the next action.
// No-website businesses are the strongest "build you a site" prospects and sort first.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Users, ExternalLink, Loader2, MapPin, Globe, RefreshCw, Search, Square, Send, Check, ChevronRight } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { cn, timeAgo } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { loadProspects, setProspectStatus, type Prospect } from '../lib/garvis/prospects/prospectsRun';
import { STAGE_LADDER, STAGE_META, stageRollup, canBuildAndSend, signalChips, type ProspectStage } from '../lib/garvis/prospects/stage';
import { ProspectDrawer } from '../components/prospects/ProspectDrawer';

// Per-row send state: idle → sending (~30-60s) → sent (green) | error (honest message).
type SendState = { phase: 'sending' } | { phase: 'sent'; note?: string } | { phase: 'error'; msg: string };

type Filter = 'all' | ProspectStage;

export default function Leads() {
  const [rows, setRows] = useState<Prospect[] | null | 'error'>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState(false);
  const [noSiteOnly, setNoSiteOnly] = useState(false);
  const [repliedOnly, setRepliedOnly] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeMsg, setScrapeMsg] = useState<string | null>(null);
  const [sends, setSends] = useState<Record<string, SendState>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const stopRef = useRef(false);

  const load = useCallback(async () => {
    setBusy(true);
    try { setRows(await loadProspects()); }
    catch { setRows('error'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // SCRAPE EVERYTHING: loop the Claude web-search engine (every business type × every metro). Claude
  // finds real businesses AND judges their site quality, persisting each grounded find — no Google
  // Places setup. Each combo is a metered Claude call, so batches stay small and the loop pauses after a
  // bounded run (press again to keep filling). Live progress each batch.
  const MAX_ITERS = 60;
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
      if (i >= MAX_ITERS && !stopRef.current) setScrapeMsg(`Paused after ${combos} areas (+${added} new). Press “Scrape the web” to keep filling.`);
    } catch (e) { setScrapeMsg(e instanceof Error ? e.message : 'Discovery failed.'); }
    setScraping(false);
    await load();
  };

  // ONE CLICK = a real site + a real pitch, out the door. The button hands the prospect to the
  // standing-worker, which scrapes their site, builds the demo, and — because we asked to send —
  // approves and fires the email now (send-email still enforces every safety gate). ~30-60s.
  const buildAndSend = async (id: string) => {
    setSends((s) => ({ ...s, [id]: { phase: 'sending' } }));
    try {
      const { data, error } = await supabase.functions.invoke('standing-worker', { body: { pitch_lead_id: id } });
      const d = data as { ok?: boolean; sent?: boolean; error?: string } | null;
      if (error || !d?.ok) setSends((s) => ({ ...s, [id]: { phase: 'error', msg: d?.error ?? 'Build failed — try again.' } }));
      else if (d.sent === false) setSends((s) => ({ ...s, [id]: { phase: 'sent', note: d.error ?? 'Demo built — no email found to send to.' } }));
      else setSends((s) => ({ ...s, [id]: { phase: 'sent' } }));
    } catch (e) {
      setSends((s) => ({ ...s, [id]: { phase: 'error', msg: e instanceof Error ? e.message : 'Build failed.' } }));
    }
    await load();
  };

  const skipToggle = async (p: Prospect) => {
    const next = p.stage === 'skipped' ? 'new' : 'skipped';
    try { await setProspectStatus(p.id, next); await load(); }
    catch { /* best-effort; a failed skip just leaves the row where it was */ }
  };

  const all = rows === null || rows === 'error' ? [] : rows;
  const roll = stageRollup(all.map((r) => r.stage));
  const noSiteCount = all.filter((r) => !r.has_website).length;
  const repliedCount = all.filter((r) => r.replied).length;

  let visible = filter === 'all' ? all : all.filter((r) => r.stage === filter);
  if (noSiteOnly) visible = visible.filter((r) => !r.has_website);
  if (repliedOnly) visible = visible.filter((r) => r.replied);

  const selected = selectedId && rows !== null && rows !== 'error' ? all.find((r) => r.id === selectedId) ?? null : null;

  // The pipeline chips: All + the 4 ladder stages + Skipped. Each shows its live count.
  const chips: { key: Filter; label: string; count: number; dot?: string; color?: string }[] = [
    { key: 'all', label: 'All', count: all.length },
    ...STAGE_LADDER.map((s) => ({ key: s as Filter, label: STAGE_META[s].label, count: roll[s], dot: STAGE_META[s].dot, color: STAGE_META[s].color })),
    { key: 'skipped' as Filter, label: 'Skipped', count: roll.skipped, dot: STAGE_META.skipped.dot, color: STAGE_META.skipped.color },
  ];

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border bg-forge-panel">
            <Users size={20} className="text-forge-ember" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-forge-ink">Prospects</h1>
            <p className="text-sm text-forge-dim">Your pipeline of real local businesses. Click any one to open it; hit <span className="font-medium text-forge-ember">Build&nbsp;&amp;&nbsp;send</span> to make the demo and pitch in one click. <span className="font-medium text-forge-ember">No-website</span> businesses sort first.</p>
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
              <Search size={14} /> Scrape the web (Claude)
            </button>
          )}
          <span className="min-w-0 flex-1 text-xs text-forge-dim">
            {scraping && <Loader2 size={12} className="mr-1.5 inline animate-spin" />}
            {scrapeMsg ?? 'Claude searches the web for real businesses across every major US metro and judges each one’s website — no Google setup. Leave it running; it fills the pipeline below.'}
          </span>
        </div>

        {/* PIPELINE BAR */}
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <button key={c.key} onClick={() => setFilter(c.key)}
              className={cn('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                filter === c.key ? 'bg-forge-ember/10 text-forge-ember ring-1 ring-forge-ember/30' : 'text-forge-dim hover:bg-forge-raised hover:text-forge-ink')}>
              {c.dot && <span className={cn('h-1.5 w-1.5 rounded-full', c.dot)} />}
              {c.label}<span className="text-[10px] text-forge-dim">({c.count})</span>
            </button>
          ))}
          {repliedCount > 0 && (
            <button onClick={() => setRepliedOnly((v) => !v)}
              className={cn('ml-auto rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                repliedOnly ? 'bg-forge-ok/15 text-forge-ok' : 'text-forge-ok/80 hover:bg-forge-raised')}>
              Replied<span className="ml-1 text-[10px]">({repliedCount})</span>
            </button>
          )}
          <button onClick={() => setNoSiteOnly((v) => !v)}
            className={cn('rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
              repliedCount > 0 ? '' : 'ml-auto',
              noSiteOnly ? 'bg-forge-warn/15 text-forge-warn' : 'text-forge-dim hover:bg-forge-raised hover:text-forge-ink')}>
            No website only<span className="ml-1 text-[10px]">({noSiteCount})</span>
          </button>
        </div>

        {rows === null ? (
          <p className="flex items-center gap-2 text-sm text-forge-dim"><Loader2 size={14} className="animate-spin" /> Loading the pipeline…</p>
        ) : rows === 'error' ? (
          <p className="text-sm text-forge-dim">Couldn’t load the pool — the discovery migration may not be applied yet.</p>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-forge-border bg-forge-panel/40 p-8 text-center">
            <p className="text-sm font-medium text-forge-ink">{all.length === 0 ? 'No prospects yet' : `Nothing ${filter === 'all' ? 'here' : STAGE_META[filter as ProspectStage]?.label.toLowerCase()}`}</p>
            <p className="mt-1 text-xs text-forge-dim">{all.length === 0
              ? 'Press “Scrape the web” above — Claude searches for real businesses and fills this pipeline, no Google setup needed.'
              : 'Try another stage.'}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {visible.map((r) => {
              const send = sends[r.id];
              const meta = STAGE_META[r.stage];
              const canBuild = canBuildAndSend(r.stage);
              return (
              <li key={r.id}
                className="group flex cursor-pointer items-center gap-3 rounded-xl border border-forge-border bg-forge-panel/40 p-3 transition-colors hover:border-forge-ember/40"
                onClick={() => setSelectedId(r.id)}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', meta.dot)} title={meta.label} />
                    <span className="truncate text-sm font-medium text-forge-ink">{r.company_name}</span>
                    <span className={cn('text-[11px] font-medium', meta.color)}>{meta.label}</span>
                    {!r.has_website && <span className="rounded border border-forge-warn/40 bg-forge-warn/10 px-1.5 py-0.5 text-[10px] font-medium text-forge-warn">no website</span>}
                    {r.keyword && <span className="text-[11px] text-forge-dim">{r.keyword}</span>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-forge-dim">
                    {(r.city || r.state) && <span className="inline-flex items-center gap-1"><MapPin size={11} /> {[r.city, r.state].filter(Boolean).join(', ')}</span>}
                    {r.website && (
                      <a href={r.website} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-forge-dim hover:text-forge-ember">
                        <Globe size={11} /> {r.website.replace(/^https?:\/\//, '').replace(/\/$/, '')} <ExternalLink size={9} />
                      </a>
                    )}
                    <span className="text-forge-dim/60">found {timeAgo(r.created_at)}</span>
                  </div>
                  {/* Post-send signals — what happened after the pitch went out. Quiet until there's activity. */}
                  {(() => {
                    const chips = signalChips(r);
                    return chips.length ? (
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {chips.map((c, i) => (
                          <span key={i} className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium',
                            c.tone === 'ok' ? 'bg-forge-ok/10 text-forge-ok' : 'bg-forge-heat/10 text-forge-heat')}>{c.label}</span>
                        ))}
                      </div>
                    ) : null;
                  })()}
                  {send?.phase === 'error' && <p className="mt-1 text-[11px] text-forge-err">{send.msg}</p>}
                  {send?.phase === 'sent' && send.note && <p className="mt-1 text-[11px] text-forge-dim">{send.note}</p>}
                </div>
                {/* Quick action lives on the row for the buildable stages; everything else opens the drawer. */}
                {canBuild ? (
                  send?.phase === 'sent' && !send.note ? (
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-forge-ok/40 px-3 py-2 text-xs font-semibold text-forge-ok"><Check size={14} /> Sent</span>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); void buildAndSend(r.id); }} disabled={send?.phase === 'sending'}
                      title="Build a demo site and email the pitch now"
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-forge-ember px-3 py-2 text-xs font-semibold text-forge-bg shadow transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60">
                      {send?.phase === 'sending' ? <><Loader2 size={14} className="animate-spin" /> Building…</> : <><Send size={14} /> {r.previewSlug ? 'Send again' : 'Build & send'}</>}
                    </button>
                  )
                ) : (
                  <ChevronRight size={16} className="shrink-0 text-forge-dim/50 transition-colors group-hover:text-forge-ember" />
                )}
              </li>
              );
            })}
          </ul>
        )}
      </div>

      {selected && (
        <ProspectDrawer
          prospect={selected}
          onRefresh={load}
          onSkipToggle={(p) => void skipToggle(p)}
          onClose={() => setSelectedId(null)}
        />
      )}
    </AppShell>
  );
}
