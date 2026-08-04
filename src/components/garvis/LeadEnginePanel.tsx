// src/components/garvis/LeadEnginePanel.tsx
// THE LEAD MARKET — the `lead_engine` studio's workspace. Sources (permit portals, license
// boards, registries) checked on the standing clock; new events scored into ranked leads with
// STATED reasons; the weekly digest queued as ONE pending approval through the one send path;
// outcomes recorded against real records — a won outcome with a value mints a commission invoice
// in the Money loop. Every lead links its public record. Nothing here sends anything.

import { useCallback, useEffect, useState } from 'react';
import { Radar, Plus, Play, Pause, Send, ExternalLink, RefreshCw, Clock } from 'lucide-react';
import { Button, Input, Badge, EmptyState, Skeleton } from '../ui';
import {
  listSources, createSource, setSourceActive, listLeads, setLeadStatus, runIngestNow,
  queueDigest, recordOutcome, leadScoreboard, getClockOrder, enableClock, setClockActive,
  type LeadSourceRow, type LeadRow,
} from '../../lib/garvis/leadEngine/leadEngineRun';
import type { StandingOrder } from '../../lib/garvis/standing';
import { TRADES } from '../../lib/garvis/leadEngine/leadEngine.ts';
import { STARTER_SOURCES, starterById, type SourceKind } from '../../lib/garvis/leadEngine/adapters.ts';

const SOURCE_KINDS: { value: SourceKind; label: string }[] = [
  { value: 'socrata', label: 'Permit portal (Socrata JSON)' },
  { value: 'arcgis', label: 'Permit portal (ArcGIS REST)' },
  { value: 'accela', label: 'Permit portal (Accela JSON)' },
  { value: 'liquor', label: 'Liquor licenses' },
  { value: 'health', label: 'Health permits' },
  { value: 'sos', label: 'Business registrations' },
  { value: 'rss', label: 'News / RSS' },
];

export function LeadEnginePanel({ worldId, worldLabel, onToast }: {
  worldId: string; worldLabel: string; onToast: (kind: 'success' | 'error', msg: string) => void;
}) {
  const [sources, setSources] = useState<LeadSourceRow[] | null>(null);
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [board, setBoard] = useState<Awaited<ReturnType<typeof leadScoreboard>> | null>(null);
  const [clock, setClock] = useState<StandingOrder | null | undefined>(undefined); // undefined = loading
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // Add-source form (kept deliberately small; query_config JSON is the advanced field).
  const [adding, setAdding] = useState(false);
  const [srcName, setSrcName] = useState('');
  const [srcKind, setSrcKind] = useState<SourceKind>('socrata');
  const [srcUrl, setSrcUrl] = useState('');
  const [srcRegion, setSrcRegion] = useState('');
  const [srcConfig, setSrcConfig] = useState('');

  // Digest + outcome inputs.
  const [digestTo, setDigestTo] = useState('');
  const [wonFor, setWonFor] = useState<LeadRow | null>(null);
  const [wonValue, setWonValue] = useState('');
  const [wonBillTo, setWonBillTo] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [s, l, b, c] = await Promise.all([listSources(worldId), listLeads(worldId), leadScoreboard(worldId), getClockOrder(worldId)]);
      setSources(s); setLeads(l); setBoard(b); setClock(c); setLoadFailed(false);
    } catch {
      setLoadFailed(true); // a failed load must never render as an empty market
    }
  }, [worldId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const act = async (key: string, fn: () => Promise<void>, okMsg?: string) => {
    setBusy(key);
    try { await fn(); if (okMsg) onToast('success', okMsg); await refresh(); }
    catch (e) { onToast('error', e instanceof Error ? e.message : 'That did not work.'); }
    finally { setBusy(null); }
  };

  const addSource = () => act('add-source', async () => {
    let queryConfig: Record<string, unknown> | undefined;
    if (srcConfig.trim()) {
      try { queryConfig = JSON.parse(srcConfig) as Record<string, unknown>; }
      catch { throw new Error('The field map must be valid JSON.'); }
    }
    await createSource({ worldId, name: srcName, kind: srcKind, baseUrl: srcUrl, region: srcRegion, queryConfig });
    setAdding(false); setSrcName(''); setSrcUrl(''); setSrcRegion(''); setSrcConfig('');
  }, 'Source added — it runs on the standing clock, or check it now.');

  const fresh = (leads ?? []).filter((l) => l.status === 'new');

  if (loadFailed) {
    return (
      <div className="mt-4 rounded-xl border border-forge-err/40 bg-forge-panel p-4 text-sm text-forge-dim">
        The lead market could not load. <button className="underline" onClick={() => void refresh()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-5">
      {/* The clock — is this market checking itself? (One lead_engine standing order per world.) */}
      {clock !== undefined && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-forge-border bg-forge-panel px-3 py-2">
          <Clock size={14} className={clock && clock.status === 'active' ? 'text-forge-ok' : 'text-forge-dim'} />
          <span className="text-sm text-forge-ink">
            {clock === null ? 'Not on the clock — sources only run when you click "Check now".'
              : clock.status === 'active' ? 'On the clock — sources are checked hourly by the standing worker.'
              : 'Clock paused — resume to check sources hourly.'}
          </span>
          <div className="ml-auto">
            {clock === null ? (
              <Button size="sm" loading={busy === 'clock'}
                onClick={() => act('clock', async () => { await enableClock(worldId, worldLabel); }, 'On the clock — first check within the hour.')}>
                Put it on the clock
              </Button>
            ) : (
              <Button size="sm" variant="ghost" loading={busy === 'clock'}
                onClick={() => act('clock', () => setClockActive(clock.id, clock.status !== 'active'))}>
                {clock.status === 'active' ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Resume</>}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Scoreboard — counted from real rows, never composed. */}
      {board && (
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge tone="dim">{board.delivered} delivered</Badge>
          <Badge tone="warn">{board.quoted} quoted</Badge>
          <Badge tone="ok">{board.won} won</Badge>
          {board.closeRatePct !== null && <Badge tone="ember">{board.closeRatePct}% close</Badge>}
          {board.commissionUsd > 0 && <Badge tone="ok">${board.commissionUsd.toLocaleString('en-US')} commission</Badge>}
        </div>
      )}

      {/* Sources */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <Radar size={15} className="text-forge-ember" />
          <h3 className="text-sm font-semibold text-forge-ink">Sources</h3>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" loading={busy === 'ingest'}
              onClick={() => act('ingest', async () => { const r = await runIngestNow(worldId); onToast('success', r.line); })}>
              <RefreshCw size={13} /> Check now
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}><Plus size={13} /> Add source</Button>
          </div>
        </div>
        {adding && (
          <div className="mb-3 space-y-2 rounded-xl border border-forge-border bg-forge-panel p-3">
            <select
              defaultValue=""
              onChange={(e) => {
                const p = starterById(e.target.value);
                if (!p) return;
                setSrcName(p.label); setSrcKind(p.kind); setSrcUrl(p.base_url);
                setSrcRegion(p.region); setSrcConfig(JSON.stringify(p.query_config));
              }}
              className="w-full rounded-lg border border-forge-border bg-forge-panel px-3 py-2 text-sm text-forge-ink"
            >
              <option value="">Start from a preset… (well-known public datasets — the first check verifies them live)</option>
              {STARTER_SOURCES.map((p) => <option key={p.id} value={p.id}>{p.label} — {p.region}</option>)}
            </select>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input placeholder='Name — e.g. "Denver building permits"' value={srcName} onChange={(e) => setSrcName(e.target.value)} />
              <select value={srcKind} onChange={(e) => setSrcKind(e.target.value as SourceKind)}
                className="rounded-lg border border-forge-border bg-forge-panel px-3 py-2 text-sm text-forge-ink">
                {SOURCE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
              <Input placeholder="https://data.example.gov/resource/xxxx.json" value={srcUrl} onChange={(e) => setSrcUrl(e.target.value)} />
              <Input placeholder='Region — e.g. "Denver, CO"' value={srcRegion} onChange={(e) => setSrcRegion(e.target.value)} />
            </div>
            <textarea
              value={srcConfig} onChange={(e) => setSrcConfig(e.target.value)} rows={3}
              placeholder='Field map (JSON, optional) — e.g. {"date_field":"issued_date","field_map":{"title":"description","address":"full_address","valuation":"valuation","contact_name":"applicant_name"}}'
              className="w-full rounded-lg border border-forge-border bg-forge-panel px-3 py-2 font-mono text-xs text-forge-ink placeholder:text-forge-dim"
            />
            <Button size="sm" loading={busy === 'add-source'} onClick={addSource}>Save source</Button>
          </div>
        )}
        {sources === null ? <Skeleton className="h-16" /> : sources.length === 0 ? (
          <EmptyState icon={<Radar size={20} />} title="No sources yet" body="Wire up a permit portal or license board — the standing clock checks it and scores what's new." />
        ) : (
          <ul className="space-y-2">
            {sources.map((s) => (
              <li key={s.id} className="flex items-start gap-3 rounded-xl border border-forge-border bg-forge-panel px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-forge-ink">{s.name}</span>
                    <Badge tone={s.active ? 'ok' : 'dim'}>{s.active ? 'active' : 'paused'}</Badge>
                    <span className="text-xs text-forge-dim">{s.region}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-forge-dim">{s.last_status ?? 'Hasn’t run yet — it will on the next tick.'}</p>
                </div>
                <Button size="sm" variant="ghost" loading={busy === `src-${s.id}`}
                  onClick={() => act(`src-${s.id}`, () => setSourceActive(s.id, !s.active))}>
                  {s.active ? <Pause size={13} /> : <Play size={13} />}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Leads */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-forge-ink">Ranked leads</h3>
          {fresh.length > 0 && <Badge tone="ember">{fresh.length} new</Badge>}
        </div>
        {leads === null ? <Skeleton className="h-24" /> : leads.length === 0 ? (
          <EmptyState icon={<Radar size={20} />} title="No leads yet" body="When a source turns up a qualifying public record, it lands here scored per trade — with its reasons." />
        ) : (
          <ul className="space-y-2">
            {leads.slice(0, 25).map((l) => (
              <li key={l.id} className="rounded-xl border border-forge-border bg-forge-panel px-3 py-2">
                <div className="flex items-center gap-2">
                  <Badge tone="ember">{TRADES[l.trade]?.label ?? l.trade} · {l.score}</Badge>
                  <Badge tone={l.status === 'won' ? 'ok' : l.status === 'lost' ? 'err' : 'dim'}>{l.status}</Badge>
                  {l.le_events?.source_url && (
                    <a href={l.le_events.source_url} target="_blank" rel="noreferrer"
                      className="ml-auto inline-flex items-center gap-1 text-xs text-forge-dim hover:text-forge-ink">
                      record <ExternalLink size={11} />
                    </a>
                  )}
                </div>
                <p className="mt-1 text-sm text-forge-ink">{l.le_events?.title ?? l.why_now}</p>
                <p className="mt-0.5 text-xs text-forge-dim">{l.why_now}{l.contact_name || l.contact_company ? ` Named: ${l.contact_name ?? l.contact_company}.` : ''}</p>
                {(l.status === 'delivered' || l.status === 'contacted' || l.status === 'quoted') && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {l.status !== 'quoted' && (
                      <Button size="sm" variant="ghost" loading={busy === `q-${l.id}`}
                        onClick={() => act(`q-${l.id}`, () => recordOutcome({ lead: l, worldId, result: 'quoted' }).then(() => {}), 'Recorded: quoted.')}>
                        Quoted
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => { setWonFor(l); setWonValue(''); setWonBillTo(digestTo); }}>Won…</Button>
                    <Button size="sm" variant="ghost" loading={busy === `l-${l.id}`}
                      onClick={() => act(`l-${l.id}`, () => recordOutcome({ lead: l, worldId, result: 'lost' }).then(() => {}), 'Recorded: lost.')}>
                      Lost
                    </Button>
                  </div>
                )}
                {l.status === 'new' && (
                  <div className="mt-2">
                    <Button size="sm" variant="ghost" loading={busy === `s-${l.id}`}
                      onClick={() => act(`s-${l.id}`, () => setLeadStatus(l.id, 'skipped'))}>
                      Skip
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Won → commission (inline, only when recording a win) */}
      {wonFor && (
        <div className="rounded-xl border border-forge-ember/40 bg-forge-panel p-3">
          <p className="text-sm text-forge-ink">Record the win — a contract value + billing email mints the commission invoice (draft; sending stays approval-gated).</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <Input placeholder="Contract value USD (e.g. 12000)" value={wonValue} onChange={(e) => setWonValue(e.target.value)} />
            <Input placeholder="Bill commission to (email)" value={wonBillTo} onChange={(e) => setWonBillTo(e.target.value)} />
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" loading={busy === 'won'} onClick={() => act('won', async () => {
              const value = Number(wonValue.replace(/[$,]/g, ''));
              const r = await recordOutcome({
                lead: wonFor, worldId, result: 'won',
                contractValueUsd: Number.isFinite(value) && value > 0 ? value : null,
                billToEmail: wonBillTo.trim() || null,
              });
              setWonFor(null);
              onToast('success', r.commissionUsd ? `Won recorded — $${r.commissionUsd.toLocaleString('en-US')} commission invoice drafted.` : 'Won recorded.');
            })}>Record win</Button>
            <Button size="sm" variant="ghost" onClick={() => setWonFor(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Digest — ONE pending approval through the one send path. */}
      <section className="rounded-xl border border-forge-border bg-forge-panel p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Send size={14} className="text-forge-ember" />
          <span className="text-sm font-medium text-forge-ink">Queue the digest</span>
          <Input placeholder="customer@example.com" value={digestTo} onChange={(e) => setDigestTo(e.target.value)} className="w-64" />
          <Button size="sm" loading={busy === 'digest'} disabled={fresh.length === 0}
            onClick={() => act('digest', async () => {
              const r = await queueDigest({ worldId, worldLabel, toEmail: digestTo });
              onToast('success', `Digest with ${r.included} lead${r.included === 1 ? '' : 's'} is waiting in your approval queue.`);
            })}>
            Queue for approval
          </Button>
        </div>
        <p className="mt-1 text-xs text-forge-dim">
          {fresh.length === 0
            ? 'No new leads right now — a quiet week is not a digest.'
            : `${fresh.length} new lead${fresh.length === 1 ? '' : 's'} would be ranked into one email. Nothing sends until you approve it in the Queue.`}
        </p>
      </section>
    </div>
  );
}
