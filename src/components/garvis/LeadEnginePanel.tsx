// src/components/garvis/LeadEnginePanel.tsx
// THE LEAD MARKET — the `lead_engine` studio's workspace, organized by the operator's questions
// in order: Is it running? (one status surface) → What's new? (leads, the hero) → Who's buying?
// (one selling surface) → Setup (folded away until something needs attention). One primary action
// per state; everything outbound waits in the approval queue. Every lead links its public record.

import { useCallback, useEffect, useState } from 'react';
import { Radar, Plus, Play, Pause, ExternalLink, RefreshCw, CheckCircle2, Circle, Users, Settings2, ChevronDown, ChevronRight } from 'lucide-react';
import { Button, Input, Badge, EmptyState, Skeleton } from '../ui';
import { supabaseUrl } from '../../lib/supabase';
import {
  listSources, createSource, setSourceActive, listLeads, setLeadStatus, runIngestNow,
  queueDigest, recordOutcome, leadScoreboard, getClockOrder, enableClock, setClockActive,
  listCustomers, addCustomer, setCustomerStatus, queueSamplePitch,
  type LeadSourceRow, type LeadRow, type LeadCustomerRow,
} from '../../lib/garvis/leadEngine/leadEngineRun';
import type { StandingOrder } from '../../lib/garvis/standing';
import {
  TRADES, parseLeadEngineConfig, parseSegment, tradesForSegment,
  type TradeKey, type MarketSegment,
} from '../../lib/garvis/leadEngine/leadEngine.ts';
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

const selectCls = 'rounded-lg border border-forge-border bg-forge-panel px-2 py-2 text-xs text-forge-ink';

export function LeadEnginePanel({ worldId, worldLabel, onToast }: {
  worldId: string; worldLabel: string; onToast: (kind: 'success' | 'error', msg: string) => void;
}) {
  const [sources, setSources] = useState<LeadSourceRow[] | null>(null);
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [board, setBoard] = useState<Awaited<ReturnType<typeof leadScoreboard>> | null>(null);
  const [clock, setClock] = useState<StandingOrder | null | undefined>(undefined); // undefined = loading
  const [customers, setCustomers] = useState<LeadCustomerRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Setup disclosure — opens itself only when something needs attention.
  const [setupOpen, setSetupOpen] = useState<boolean | null>(null); // null = follow the data
  const [adding, setAdding] = useState(false);
  const [srcName, setSrcName] = useState('');
  const [srcKind, setSrcKind] = useState<SourceKind>('socrata');
  const [srcUrl, setSrcUrl] = useState('');
  const [srcRegion, setSrcRegion] = useState('');
  const [srcConfig, setSrcConfig] = useState('');

  // Selling inputs.
  const [custName, setCustName] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custTrade, setCustTrade] = useState<TradeKey | 'all'>('all');
  const [pitchEmail, setPitchEmail] = useState('');
  const [pitchTrade, setPitchTrade] = useState<TradeKey>('security');
  const [digestTo, setDigestTo] = useState('');
  const [oneOffOpen, setOneOffOpen] = useState(false);

  // Win recording — inline in the lead's own card, never a floating form.
  const [wonFor, setWonFor] = useState<string | null>(null); // lead id
  const [wonValue, setWonValue] = useState('');
  const [wonBillTo, setWonBillTo] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [s, l, b, c, cu] = await Promise.all([listSources(worldId), listLeads(worldId), leadScoreboard(worldId), getClockOrder(worldId), listCustomers(worldId)]);
      setSources(s); setLeads(l); setBoard(b); setClock(c); setCustomers(cu); setLoadError(null);
    } catch (e) {
      // A failed load must never render as an empty market — and it must SAY WHAT BROKE.
      // "could not load" sent the operator to a browser console; the message is the diagnosis.
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [worldId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // ── THIS MARKET'S SEGMENT — the segment split ─────────────────────────────
  // Which buyer this market serves: the standing order's config is the canonical home, and the
  // market's own sources carry it as a fallback for a market whose clock was removed. Neither →
  // 'commercial', which is what every market predating segments is. Everything the operator can
  // pick a trade in is narrowed by it — offering a residential contractor "Fire & life safety"
  // would be offering a lead this market will never produce.
  const marketSegment: MarketSegment = clock
    ? parseLeadEngineConfig(clock.config).segment
    : parseSegment((sources ?? []).map((s) => (s.query_config ?? {}).segment).find((v) => v !== undefined));
  const segmentTrades = tradesForSegment(marketSegment);
  useEffect(() => {
    setPitchTrade((t) => (segmentTrades.includes(t) ? t : segmentTrades[0]));
    setCustTrade((t) => (t === 'all' || segmentTrades.includes(t) ? t : 'all'));
    // segmentTrades is derived from marketSegment alone; re-running per render would fight the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketSegment]);

  const act = async (key: string, fn: () => Promise<void>, okMsg?: string) => {
    setBusy(key);
    try { await fn(); if (okMsg) onToast('success', okMsg); await refresh(); }
    catch (e) { onToast('error', e instanceof Error ? e.message : 'That did not work.'); }
    finally { setBusy(null); }
  };

  if (loadError) {
    const missingTable = /relation .* does not exist|could not find the table/i.test(loadError);
    const missingCol = /column .* does not exist|could not find the .* column/i.test(loadError);
    return (
      <div className="mt-4 rounded-xl border border-forge-err/40 bg-forge-panel p-4 text-sm">
        <p className="font-medium text-forge-ink">The lead market could not load.</p>
        <p className="mt-1 font-mono text-xs text-forge-err">{loadError}</p>
        {(missingTable || missingCol) && (
          <div className="mt-2 space-y-1 text-xs text-forge-dim">
            <p>
              This app is talking to project{' '}
              <span className="font-mono text-forge-ink">{(/https?:\/\/([^.]+)\./.exec(supabaseUrl)?.[1]) ?? supabaseUrl}</span>
              {' '}— the schema has to exist <em>there</em>. Running the migration against a different
              project cannot fix this one.
            </p>
            <p>
              Fix: open THAT project in Supabase → SQL Editor → paste the Lead Engine migrations
              (<span className="font-mono">app_0129</span>…<span className="font-mono">app_0134</span>), then reload.
              They are additive and idempotent, so re-running is safe.
            </p>
          </div>
        )}
        <button className="mt-2 underline text-xs text-forge-dim hover:text-forge-ink" onClick={() => void refresh()}>Retry</button>
      </div>
    );
  }
  if (sources === null || leads === null) {
    return <div className="mt-4 space-y-3"><Skeleton className="h-12" /><Skeleton className="h-24" /></div>;
  }

  const fresh = leads.filter((l) => l.status === 'new');
  const clockOn = !!clock && clock.status === 'active';
  const activeSources = sources.filter((s) => s.active);
  const failingSources = sources.filter((s) => s.consecutive_failures > 0 || (!s.active && s.consecutive_failures >= 5));
  const activeCustomers = (customers ?? []).filter((c) => c.status === 'active');

  // The one setup truth: complete = the machine runs itself. Attention = open the setup drawer.
  const steps: { label: string; done: boolean; hint: string }[] = [
    { label: 'On the clock', done: clockOn, hint: 'Turn on the hourly clock in Setup below.' },
    { label: 'Source wired', done: sources.length > 0, hint: 'Add a permit portal or license board in Setup below.' },
    { label: 'First check', done: sources.some((s) => !!s.last_fetch_at), hint: 'Hit "Check now" — or wait for the next tick.' },
    { label: 'Leads arriving', done: leads.length > 0, hint: 'Leads land here as sources turn up qualifying records.' },
    { label: 'First send', done: (board?.delivered ?? 0) > 0, hint: 'Pitch a prospect or add a customer in Selling below.' },
    { label: 'Outcome recorded', done: (board?.quoted ?? 0) + (board?.won ?? 0) > 0, hint: 'Mark quoted/won/lost on delivered leads — this data is the moat.' },
  ];
  const nextStep = steps.find((s) => !s.done);
  const needsAttention = !clockOn || sources.length === 0 || failingSources.length > 0;
  const showSetup = setupOpen ?? needsAttention;

  return (
    <div className="mt-4 space-y-5">

      {/* ── STATUS — the one surface that answers "is it running?" ──────────── */}
      <div className="rounded-xl border border-forge-border bg-forge-panel p-3">
        {nextStep ? (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {steps.map((s) => (
                <span key={s.label} className={`inline-flex items-center gap-1 text-xs ${s.done ? 'text-forge-ok' : s === nextStep ? 'font-medium text-forge-ink' : 'text-forge-dim'}`}>
                  {s.done ? <CheckCircle2 size={13} /> : <Circle size={13} />}{s.label}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-forge-dim"><span className="text-forge-ember">Next:</span> {nextStep.hint}</p>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-sm text-forge-ink">
            <CheckCircle2 size={15} className="text-forge-ok" />
            <span>
              Checking {activeSources.length} source{activeSources.length === 1 ? '' : 's'} hourly{' · '}
              {fresh.length} new lead{fresh.length === 1 ? '' : 's'}{' · '}
              {activeCustomers.length} customer{activeCustomers.length === 1 ? '' : 's'} on weekly digests
            </span>
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {/* Which buyer this market serves — it decides every trade list on this screen. */}
          <Badge tone="dim">{marketSegment} market</Badge>
          {board && (board.delivered > 0 || board.won > 0) && (
            <span className="flex flex-wrap gap-2 text-xs">
              <Badge tone="dim">{board.delivered} delivered</Badge>
              <Badge tone="warn">{board.quoted} quoted</Badge>
              <Badge tone="ok">{board.won} won</Badge>
              {board.closeRatePct !== null && <Badge tone="ember">{board.closeRatePct}% close</Badge>}
              {board.commissionUsd > 0 && <Badge tone="ok">${board.commissionUsd.toLocaleString('en-US')} commission</Badge>}
            </span>
          )}
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" loading={busy === 'ingest'}
              onClick={() => act('ingest', async () => { const r = await runIngestNow(worldId); onToast('success', r.line); })}>
              <RefreshCw size={13} /> Check now
            </Button>
          </div>
        </div>
      </div>

      {/* ── LEADS — the hero: what the machine found ────────────────────────── */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-forge-ink">Leads</h3>
          {fresh.length > 0 && <Badge tone="ember">{fresh.length} new</Badge>}
        </div>
        {leads.length === 0 ? (
          <EmptyState icon={<Radar size={20} />} title="Nothing yet" body="When a source turns up a qualifying public record, it lands here — scored per trade, reasons stated, record linked." />
        ) : (
          <ul className="space-y-2">
            {leads.slice(0, 25).map((l) => (
              <li key={l.id} className="rounded-xl border border-forge-border bg-forge-panel px-3 py-2">
                <div className="flex items-center gap-2">
                  <Badge tone="ember">{TRADES[l.trade]?.label ?? l.trade} · {l.score}</Badge>
                  <Badge tone={l.status === 'won' ? 'ok' : l.status === 'lost' ? 'err' : 'dim'}>{l.status}</Badge>
                  {/* The record's OWN link, or a plain statement that there isn't one. It used to
                      fall back to the dataset endpoint, which looked like a record link and was
                      not one (capture spec §6.6). */}
                  {l.le_events?.source_url ? (
                    <a href={l.le_events.source_url} target="_blank" rel="noreferrer"
                      className="ml-auto inline-flex items-center gap-1 text-xs text-forge-dim hover:text-forge-ink">
                      record <ExternalLink size={11} />
                    </a>
                  ) : (
                    <span className="ml-auto text-xs text-forge-dim" title="This dataset publishes no per-record page.">
                      no direct link
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-forge-ink">{l.le_events?.title ?? l.why_now}</p>
                <p className="mt-0.5 text-xs text-forge-dim">
                  {l.why_now}
                  {(l.contact_name || l.contact_company) && ` ${l.contact_name ?? l.contact_company}`}
                  {l.contact_phone && ` · ${l.contact_phone}`}
                  {l.contact_email && ` · ${l.contact_email}`}
                </p>
                {(l.status === 'delivered' || l.status === 'contacted' || l.status === 'quoted') && wonFor !== l.id && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {l.status !== 'quoted' && (
                      <Button size="sm" variant="ghost" loading={busy === `q-${l.id}`}
                        onClick={() => act(`q-${l.id}`, () => recordOutcome({ lead: l, worldId, result: 'quoted' }).then(() => {}), 'Recorded: quoted.')}>
                        Quoted
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => { setWonFor(l.id); setWonValue(''); setWonBillTo(''); }}>Won…</Button>
                    <Button size="sm" variant="ghost" loading={busy === `l-${l.id}`}
                      onClick={() => act(`l-${l.id}`, () => recordOutcome({ lead: l, worldId, result: 'lost' }).then(() => {}), 'Recorded: lost.')}>
                      Lost
                    </Button>
                  </div>
                )}
                {wonFor === l.id && (
                  <div className="mt-2 rounded-lg border border-forge-ember/40 p-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input placeholder="Contract value USD (e.g. 12000)" value={wonValue} onChange={(e) => setWonValue(e.target.value)} />
                      <Input placeholder="Bill commission to (email)" value={wonBillTo} onChange={(e) => setWonBillTo(e.target.value)} />
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" loading={busy === 'won'} onClick={() => act('won', async () => {
                        const value = Number(wonValue.replace(/[$,]/g, ''));
                        const r = await recordOutcome({
                          lead: l, worldId, result: 'won',
                          contractValueUsd: Number.isFinite(value) && value > 0 ? value : null,
                          billToEmail: wonBillTo.trim() || null,
                        });
                        setWonFor(null);
                        onToast('success', r.commissionUsd ? `Won recorded — $${r.commissionUsd.toLocaleString('en-US')} commission invoice drafted.` : 'Won recorded.');
                      })}>Record win</Button>
                      <Button size="sm" variant="ghost" onClick={() => setWonFor(null)}>Cancel</Button>
                    </div>
                    <p className="mt-1 text-xs text-forge-dim">A value + billing email drafts the commission invoice; sending it stays approval-gated.</p>
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

      {/* ── SELLING — one surface: pitch prospects, manage customers ────────── */}
      <section className="rounded-xl border border-forge-border bg-forge-panel p-3">
        <div className="mb-2 flex items-center gap-2">
          <Users size={14} className="text-forge-ember" />
          <h3 className="text-sm font-semibold text-forge-ink">Selling</h3>
          {activeCustomers.length > 0 && <Badge tone="ok">{activeCustomers.length} customer{activeCustomers.length === 1 ? '' : 's'}</Badge>}
        </div>

        {/* The opener: a sample pitch built from real leads. */}
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="prospect@contractor.com" value={pitchEmail} onChange={(e) => setPitchEmail(e.target.value)} className="w-56" />
          {/* Only the trades this market's segment actually sells — see marketSegment above. */}
          <select value={pitchTrade} onChange={(e) => setPitchTrade(e.target.value as TradeKey)} className={selectCls}>
            {segmentTrades.map((t) => <option key={t} value={t}>{TRADES[t].label}</option>)}
          </select>
          <Button size="sm" loading={busy === 'pitch'}
            onClick={() => act('pitch', async () => {
              const region = sources[0]?.region ?? worldLabel;
              await queueSamplePitch({ worldId, region, toEmail: pitchEmail, trade: pitchTrade });
              setPitchEmail('');
            }, 'Sample pitch drafted — review and approve it in your Queue.')}>
            Draft sample pitch
          </Button>
        </div>
        <p className="mt-1 text-xs text-forge-dim">Embeds their trade's 2–3 best real leads, public-record links included — the sample is the proof. Waits in your Queue.</p>

        {/* Customers: their weekly digests draft automatically. */}
        {(customers ?? []).length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-forge-border pt-3">
            {(customers ?? []).map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-xs">
                <Badge tone={c.status === 'active' ? 'ok' : 'dim'}>{c.status}</Badge>
                <span className="text-forge-ink">{c.name || c.email}</span>
                <span className="text-forge-dim">{c.trade === 'all' ? 'all trades' : TRADES[c.trade as TradeKey]?.label ?? c.trade}</span>
                <span className="ml-auto text-forge-dim">{c.last_digest_at ? `digest ${c.last_digest_at.slice(0, 10)}` : 'no digest yet'}</span>
                <Button size="sm" variant="ghost" loading={busy === `cu-${c.id}`}
                  onClick={() => act(`cu-${c.id}`, () => setCustomerStatus(c.id, c.status === 'active' ? 'paused' : 'active'))}>
                  {c.status === 'active' ? <Pause size={12} /> : <Play size={12} />}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-forge-border pt-3">
          <Input placeholder="Name" value={custName} onChange={(e) => setCustName(e.target.value)} className="w-36" />
          <Input placeholder="customer@example.com" value={custEmail} onChange={(e) => setCustEmail(e.target.value)} className="w-56" />
          <select value={custTrade} onChange={(e) => setCustTrade(e.target.value as TradeKey | 'all')} className={selectCls}>
            <option value="all">All trades</option>
            {segmentTrades.map((t) => <option key={t} value={t}>{TRADES[t].label}</option>)}
          </select>
          <Button size="sm" variant="outline" loading={busy === 'add-cust'}
            onClick={() => act('add-cust', async () => {
              await addCustomer({ worldId, name: custName, email: custEmail, trade: custTrade });
              setCustName(''); setCustEmail('');
            }, 'Customer added — their digest drafts automatically every week, waiting in your Queue.')}>
            <Plus size={13} /> Add customer
          </Button>
        </div>

        {/* One-off digest — tertiary, tucked behind a text toggle. */}
        <button type="button" className="mt-3 inline-flex items-center gap-1 text-xs text-forge-dim hover:text-forge-ink"
          onClick={() => setOneOffOpen((v) => !v)}>
          {oneOffOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Send a one-off digest
        </button>
        {oneOffOpen && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Input placeholder="someone@example.com" value={digestTo} onChange={(e) => setDigestTo(e.target.value)} className="w-64" />
            <Button size="sm" variant="outline" loading={busy === 'digest'} disabled={fresh.length === 0}
              onClick={() => act('digest', async () => {
                const r = await queueDigest({ worldId, worldLabel, toEmail: digestTo });
                onToast('success', `Digest with ${r.included} lead${r.included === 1 ? '' : 's'} is waiting in your approval queue.`);
              })}>
              Queue for approval
            </Button>
            <span className="text-xs text-forge-dim">
              {fresh.length === 0 ? 'No new leads right now — a quiet week is not a digest.' : `${fresh.length} new lead${fresh.length === 1 ? '' : 's'} ranked into one email.`}
            </span>
          </div>
        )}
      </section>

      {/* ── SETUP — folded away unless something needs attention ────────────── */}
      <section className="rounded-xl border border-forge-border bg-forge-panel p-3">
        <button type="button" className="flex w-full items-center gap-2 text-left"
          onClick={() => setSetupOpen(!showSetup)}>
          <Settings2 size={14} className={failingSources.length ? 'text-forge-err' : 'text-forge-dim'} />
          <span className="text-sm font-medium text-forge-ink">Setup</span>
          <span className="text-xs text-forge-dim">
            {sources.length} source{sources.length === 1 ? '' : 's'}
            {failingSources.length > 0 ? ` · ${failingSources.length} failing` : sources.length > 0 ? ' · healthy' : ''}{' · '}
            clock {clockOn ? 'on' : clock === null ? 'off' : 'paused'}
          </span>
          <span className="ml-auto">{showSetup ? <ChevronDown size={14} className="text-forge-dim" /> : <ChevronRight size={14} className="text-forge-dim" />}</span>
        </button>

        {showSetup && (
          <div className="mt-3 space-y-3 border-t border-forge-border pt-3">
            {/* The clock */}
            <div className="flex flex-wrap items-center gap-2 text-sm text-forge-ink">
              <span>
                {clock === null ? 'Not on the clock — sources only run when you click "Check now".'
                  : clockOn ? 'On the clock — sources are checked hourly.'
                  : 'Clock paused — resume to check sources hourly.'}
              </span>
              <div className="ml-auto">
                {!clock ? (
                  <Button size="sm" loading={busy === 'clock'}
                    onClick={() => act('clock', async () => { await enableClock(worldId, worldLabel, marketSegment); }, 'On the clock — first check within the hour.')}>
                    Put it on the clock
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" loading={busy === 'clock'}
                    onClick={() => act('clock', () => setClockActive(clock.id, clock.status !== 'active'))}>
                    {clockOn ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Resume</>}
                  </Button>
                )}
              </div>
            </div>

            {/* Sources */}
            {sources.length === 0 ? (
              <p className="text-xs text-forge-dim">No sources yet — add a permit portal or license board below.</p>
            ) : (
              <ul className="space-y-2">
                {sources.map((s) => (
                  <li key={s.id} className="flex items-start gap-3 rounded-lg border border-forge-border px-3 py-2">
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

            {!adding ? (
              <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus size={13} /> Add source</Button>
            ) : (
              <div className="space-y-2 rounded-lg border border-forge-border p-3">
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
                  <option value="">Start from a preset… (the first check verifies it live)</option>
                  {STARTER_SOURCES.map((p) => <option key={p.id} value={p.id}>{p.label} — {p.region} ({p.segment})</option>)}
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
                <div className="flex gap-2">
                  <Button size="sm" loading={busy === 'add-source'} onClick={() => act('add-source', async () => {
                    let queryConfig: Record<string, unknown> | undefined;
                    if (srcConfig.trim()) {
                      try { queryConfig = JSON.parse(srcConfig) as Record<string, unknown>; }
                      catch { throw new Error('The field map must be valid JSON.'); }
                    }
                    await createSource({ worldId, name: srcName, kind: srcKind, baseUrl: srcUrl, region: srcRegion, queryConfig });
                    setAdding(false); setSrcName(''); setSrcUrl(''); setSrcRegion(''); setSrcConfig('');
                  }, 'Source added — it runs on the standing clock, or check it now.')}>Save source</Button>
                  <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
