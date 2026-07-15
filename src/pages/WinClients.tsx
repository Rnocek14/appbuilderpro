// src/pages/WinClients.tsx
// THE FRONT DOOR for the agency loop: pick a niche + town → Garvis finds real businesses (Google
// results, never invented) → looks at each one's site and honestly says how weak it is → you pick
// who → it builds them a preview site + drafts the pitch, which lands in the Queue for your approval
// (review-each-batch; nothing emails a real business without your OK). Deploy + monthly SEO retainer
// come after a "yes" — this is the top of the funnel, made into one legible screen.

import { useState, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { Search, Loader2, Globe, ExternalLink, Sparkles, CheckCircle2, AlertTriangle, ArrowRight, Info, Radar, Square } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { useToast } from '../context/ToastContext';
import { findBusinesses, scrapeAndAudit, recordProspectAudit, findContactEmail, sweepNation, type FoundBusiness } from '../lib/garvis/clientHuntRun';
import { US_CITIES, US_STATES, citiesFor } from '../lib/garvis/usCities';
import { sweepCostLine } from '../lib/garvis/nationalSweepCore';
import { type Verdict } from '../lib/garvis/siteAudit';
import { ConstellationWeb } from '../components/garvis/canvas/ConstellationWeb';
import { Button } from '../components/ui';
import type { WebNode, WebGroupDef } from '../lib/garvis/webLayout';
import { ProspectCanvas } from '../components/garvis/canvas/ProspectCanvas';
import { CanvasScene, type CanvasNode } from '../components/garvis/canvas/CanvasScene';
import { profileFromScrape } from '../lib/preview/scrapeProfile';
import { queuePitch } from '../lib/garvis/outreach';
import { cn } from '../lib/utils';

type Row = FoundBusiness & { built?: { previewUrl: string; queued: boolean; email: string | null }; building?: boolean };

const VERDICT_RANK: Record<Verdict, number> = { weak: 0, dated: 1, unknown: 2, solid: 3 };
const WEB_GROUPS: WebGroupDef[] = [
  { key: 'weak', label: 'Weak sites', color: '#FF8A3D' },
  { key: 'dated', label: 'Dated', color: '#E7B45A' },
  { key: 'solid', label: 'Already solid', color: '#5FC08A' },
  { key: 'unknown', label: 'Couldn’t load', color: '#8A8076' },
];
const VERDICT_STYLE: Record<Verdict, { label: string; cls: string }> = {
  weak: { label: 'Weak site', cls: 'bg-forge-ember/15 text-forge-ember border-forge-ember/40' },
  dated: { label: 'Dated', cls: 'bg-forge-warn/15 text-forge-warn border-forge-warn/40' },
  solid: { label: 'Already solid', cls: 'bg-forge-ok/15 text-forge-ok border-forge-ok/40' },
  unknown: { label: 'Couldn’t load', cls: 'bg-forge-raised text-forge-dim border-forge-border' },
};

export default function WinClients() {
  const { toast } = useToast();
  const [niche, setNiche] = useState('');
  const [area, setArea] = useState('');
  const [scanUrl, setScanUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scope, setScope] = useState('top50');
  const [sweeping, setSweeping] = useState(false);
  const [sweepProg, setSweepProg] = useState<{ done: number; total: number; found: number; city: string } | null>(null);
  const stopSweep = useRef(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [finding, setFinding] = useState(false);
  const [searched, setSearched] = useState(false);
  const [view, setView] = useState<'list' | 'web'>('list');
  const [selected, setSelected] = useState<number | null>(null);
  const [stage, setStage] = useState<'hub' | 'find'>('hub'); // enter on the pipeline canvas
  const emsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

  const find = async () => {
    setFinding(true); setSearched(true); setRows([]);
    try {
      const found = await findBusinesses(niche, area);
      setRows(found);
      // Look at each site and audit it honestly (small concurrency pool so we don't hammer).
      let i = 0;
      const worker = async () => {
        while (i < found.length) {
          const idx = i++;
          const b = found[idx];
          if (!b.url) { continue; }
          const { audit, scrape } = await scrapeAndAudit(b.url);
          setRows((r) => r.map((x, j) => (j === idx ? { ...x, audit } : x)));
          // Keep the audit we just paid for (Phase 0) — best-effort, never blocks the UI.
          void recordProspectAudit({ url: b.url, audit, scrape, source: 'find', businessName: b.name, niche, area });
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      setRows((r) => [...r].sort((a, b) => (VERDICT_RANK[a.audit?.verdict ?? 'unknown'] - VERDICT_RANK[b.audit?.verdict ?? 'unknown'])));
    } catch (e) { toast('error', emsg(e)); }
    finally { setFinding(false); }
  };

  const build = async (idx: number) => {
    const b = rows[idx];
    if (!b.url) { toast('error', 'No website to scan for this one.'); return; }
    setRows((r) => r.map((x, j) => (j === idx ? { ...x, building: true } : x)));
    try {
      // DEEP SCRAPE: read their real site — services, their own photos, hours, published email — and
      // build the demo from THAT (not just their name + niche), so the pitch shows a real rebuild.
      const res = await profileFromScrape(b.url);
      if (!res.ok) { toast('error', (res.errors ?? ['Couldn’t build from that site.']).join(' ')); return; }
      const bizName = res.profile?.business_name || b.name;
      const industry = res.profile?.industry || niche.trim() || 'Local business';
      // The scrape already found a published email; fall back to a dedicated contact scan.
      const email = res.profile?.email ?? (b.url ? await findContactEmail(b.url) : null);
      let queued = false;
      if (email) {
        try {
          await queuePitch({
            previewSiteId: res.row!.id, businessProfileId: res.row!.profile_id ?? null,
            businessName: bizName, industry, pitch: res.row!.pitch, previewUrl: res.previewUrl!, toEmail: email,
          });
          queued = true;
        } catch (e) { toast('error', emsg(e)); }
      }
      setRows((r) => r.map((x, j) => (j === idx ? { ...x, built: { previewUrl: res.previewUrl!, queued, email } } : x)));
      toast('success', queued
        ? `Built ${bizName} a demo from their real site + queued the pitch — review it in the Queue.`
        : `Built ${bizName} a demo from their real site. No public email found — add one in the Queue to send.`);
    } catch (e) { toast('error', emsg(e)); }
    finally { setRows((r) => r.map((x, j) => (j === idx ? { ...x, building: false } : x))); }
  };

  // Scan ONE known URL directly (paste a prospect you already have) — audits it and drops it into the
  // list so you can Build the demo from it, same as a discovered business.
  const scanOne = async () => {
    const raw = scanUrl.trim();
    if (!raw) return;
    let host: string; let href: string;
    try { const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); host = u.hostname.replace(/^www\./, ''); href = u.toString(); }
    catch { toast('error', 'That doesn’t look like a website URL.'); return; }
    setScanning(true); setSearched(true);
    try {
      const { audit, scrape } = await scrapeAndAudit(href);
      setRows((r) => [{ name: host, url: href, snippet: '', audit }, ...r]);
      void recordProspectAudit({ url: href, audit, scrape, source: 'scan', businessName: host, niche, area });
      setScanUrl('');
      toast('success', `Scanned ${host} — ${audit.reachable ? 'audited. Press Build to make their demo.' : 'couldn’t load it; worth a manual look.'}`);
    } catch (e) { toast('error', emsg(e)); }
    finally { setScanning(false); }
  };

  // Resolve the chosen scope to the cities to sweep.
  const scopeCities = () => {
    if (scope === 'all') return US_CITIES;
    if (scope.startsWith('top')) return citiesFor({ mode: 'topN', n: parseInt(scope.slice(3), 10) || 50 });
    return citiesFor({ mode: 'state', state: scope });
  };

  // NATIONAL SWEEP — fan the niche search across the chosen cities. Discovery only: streams unique
  // businesses into the list (capped so the page stays snappy); Build audits + rebuilds on demand.
  const sweepNationwide = async () => {
    const n = niche.trim();
    if (!n) { toast('error', 'Enter a niche first — e.g. roofers, dentists, plumbers.'); return; }
    const cities = scopeCities();
    stopSweep.current = false;
    setSweeping(true); setSearched(true); setRows([]); setSweepProg({ done: 0, total: cities.length, found: 0, city: '' });
    const MAX_ROWS = 400;
    try {
      const all = await sweepNation(n, cities, {
        concurrency: 3,
        onFound: (b) => setRows((r) => (r.length >= MAX_ROWS ? r : [...r, { name: b.name, url: b.url, snippet: b.snippet, audit: null }])),
        onProgress: (p) => setSweepProg(p),
        shouldStop: () => stopSweep.current,
      });
      toast('success', `Swept ${cities.length === US_CITIES.length ? 'the country' : scope.startsWith('top') ? `the top ${scope.slice(3)} markets` : scope} — found ${all.length} unique ${n}. Build the strong prospects; nothing is emailed until you approve it.`);
    } catch (e) { toast('error', emsg(e)); }
    finally { setSweeping(false); }
  };

  const weakCount = rows.filter((r) => r.audit?.verdict === 'weak').length;
  // The same rows as a web: clustered by verdict, orb size = opportunity (weaker site → bigger orb).
  const webNodes: WebNode[] = rows.map((b, i) => {
    const v = b.audit?.verdict ?? 'unknown';
    const score = b.audit?.score ?? null;
    const metric = v === 'unknown' ? 30 : Math.max(6, 100 - (score ?? 50));
    return { id: String(i), label: b.name, group: v, metric, badge: score ?? '?' };
  });

  // Pipeline stage counts (this session) — honest zeros until you've done the work.
  const builtCount = rows.filter((r) => r.built).length;
  const queuedCount = rows.filter((r) => r.built?.queued).length;
  const pipeCenter = {
    kicker: 'Win clients',
    title: searched && (niche.trim() || area.trim()) ? [niche.trim(), area.trim()].filter(Boolean).join(' · ') : 'Win new clients',
    sub: searched ? `${rows.length} found` : 'find businesses to pitch',
  };
  const pipeNodes: CanvasNode[] = [
    { key: 'find', emoji: '🔎', label: 'Find', sub: searched ? `${rows.length} found` : 'start here' },
    { key: 'built', emoji: '✨', label: 'Sites built', sub: builtCount ? `${builtCount} ready` : 'none yet', count: builtCount, dim: builtCount === 0 },
    { key: 'pitch', emoji: '✉️', label: 'Pitches', sub: queuedCount ? `${queuedCount} in Queue` : 'none yet', count: queuedCount, accent: 'violet', dim: queuedCount === 0 },
    { key: 'clients', emoji: '🤝', label: 'Clients', sub: 'deploy · soon', dim: true },
  ];
  const onHub = (k: string) => {
    if (k === 'clients') { toast('info', 'Deploy + the monthly retainer are next — that turns a “yes” into their real live site.'); return; }
    setStage('find'); // find / sites built / pitches all open the results, where each row shows its state
  };

  return (
    <AppShell>
      {stage === 'hub' ? (
        <div className="mx-auto max-w-4xl px-4 py-6">
          <div className="mb-1 flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-forge-ember/15 text-forge-ember"><Globe size={18} /></span>
            <h1 className="text-xl font-semibold text-forge-ink">Win new clients</h1>
          </div>
          <p className="mb-4 text-sm text-forge-dim">Your pipeline — tap a stage to work it. Nothing sends without your approval.</p>
          <CanvasScene center={pipeCenter} nodes={pipeNodes} onOpen={onHub} height="min(66vh,520px)" />
        </div>
      ) : (
      <div className="mx-auto max-w-4xl px-4 py-6">
        <button onClick={() => setStage('hub')} className="mb-3 inline-flex items-center gap-1 text-xs text-forge-dim hover:text-forge-ember">← Pipeline</button>
        <div className="mb-1 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-forge-ember/15 text-forge-ember"><Globe size={18} /></span>
          <h1 className="text-xl font-semibold text-forge-ink">Win new clients</h1>
        </div>
        <p className="mb-5 text-sm text-forge-dim">
          Find local businesses, see whose website is weak, and build them a fresh one — the pitch lands in your Queue to approve before anything sends.
        </p>

        {/* Find bar */}
        <div className="rounded-2xl border border-forge-border bg-forge-panel/40 p-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="Niche — e.g. roofers, dentists, plumbers"
              onKeyDown={(e) => { if (e.key === 'Enter') void find(); }}
              className="flex-1 rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none" />
            <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Town or area — e.g. Lake Geneva, WI"
              onKeyDown={(e) => { if (e.key === 'Enter') void find(); }}
              className="flex-1 rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none" />
            <Button variant="primary" size="md" onClick={() => void find()} disabled={finding || !niche.trim()}>
              {finding ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Find businesses
            </Button>
          </div>
          {/* Or scan a prospect you already have — paste their site and Garvis reads it, audits it, and
              (on Build) rebuilds it from their own real content + photos. */}
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input value={scanUrl} onChange={(e) => setScanUrl(e.target.value)} placeholder="Or paste a site to scan — e.g. joesroofing.com"
              onKeyDown={(e) => { if (e.key === 'Enter') void scanOne(); }}
              className="flex-1 rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none" />
            <Button variant="outline" size="md" onClick={() => void scanOne()} disabled={scanning || !scanUrl.trim()}>
              {scanning ? <Loader2 size={15} className="animate-spin" /> : <Globe size={15} />} Scan a URL
            </Button>
          </div>
          {/* Go national: fan the niche search across the country (or a state). Discovery only —
              one Google search per city, deduped nationwide, streamed in. */}
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="flex items-center gap-1.5 text-xs font-medium text-forge-ink"><Radar size={13} className="text-forge-ember" /> Or sweep the nation</span>
            <select value={scope} onChange={(e) => setScope(e.target.value)}
              className="rounded-lg border border-forge-border bg-forge-bg px-2.5 py-2 text-sm text-forge-ink focus:border-forge-ember/60 focus:outline-none">
              <option value="top25">Top 25 markets</option>
              <option value="top50">Top 50 markets</option>
              <option value="top100">Top 100 markets</option>
              <option value="all">All {US_CITIES.length} cities</option>
              <optgroup label="By state">
                {US_STATES.map((st) => <option key={st} value={st}>{st}</option>)}
              </optgroup>
            </select>
            {sweeping ? (
              <Button variant="outline" size="md" onClick={() => { stopSweep.current = true; }}>
                <Square size={13} /> Stop
              </Button>
            ) : (
              <Button variant="primary" size="md" onClick={() => void sweepNationwide()} disabled={!niche.trim()}>
                <Radar size={15} /> Sweep the nation
              </Button>
            )}
            {sweepProg && (
              <span className="text-[11px] text-forge-dim">
                {sweeping && <Loader2 size={11} className="mr-1 inline animate-spin" />}
                {sweepProg.done}/{sweepProg.total} cities · {sweepProg.found} found{sweepProg.city ? ` · ${sweepProg.city}` : ''}
              </span>
            )}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-forge-dim"><Info size={12} /> Real Google results only — Garvis never invents a business, and the site check reads their real page (no faked scores). A national sweep runs {sweepCostLine(citiesFor(scope === 'all' ? { mode: 'topN', n: US_CITIES.length } : scope.startsWith('top') ? { mode: 'topN', n: parseInt(scope.slice(3), 10) || 50 } : { mode: 'state', state: scope }).length)} Build reads their real content + photos; nothing emails until you approve it in the Queue.</p>
        </div>

        {/* Results */}
        {searched && (
          <div className="mt-5">
            {finding && !rows.length ? (
              <div className="flex items-center gap-2 py-8 text-sm text-forge-dim"><Loader2 size={15} className="animate-spin" /> Searching…</div>
            ) : !rows.length ? (
              <div className="rounded-xl border border-forge-border bg-forge-panel/40 p-6 text-center text-sm text-forge-dim">No businesses came back for that search. Try a broader niche or a nearby town.</div>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between text-xs text-forge-dim">
                  <span>{rows.length} found{weakCount > 0 && <span className="text-forge-ember"> · {weakCount} with weak sites</span>}</span>
                  <span className="inline-flex overflow-hidden rounded-lg border border-forge-border">
                    <button onClick={() => setView('list')} className={cn('px-2.5 py-1', view === 'list' ? 'bg-forge-ember/15 text-forge-ember' : 'text-forge-dim hover:text-forge-ink')}>List</button>
                    <button onClick={() => setView('web')} className={cn('px-2.5 py-1', view === 'web' ? 'bg-forge-ember/15 text-forge-ember' : 'text-forge-dim hover:text-forge-ink')}>Web</button>
                  </span>
                </div>
                {view === 'web' ? (
                  <>
                    <ConstellationWeb nodes={webNodes} groups={WEB_GROUPS} height="440px"
                      title="Bigger orb = weaker site = more opportunity · tap one to open its web" onOpen={(id) => setSelected(Number(id))} />
                  </>
                ) : (
                <div className="space-y-2.5">
                  {rows.map((b, i) => (
                    <div key={`${b.url ?? b.name}-${i}`} className="rounded-xl border border-forge-border bg-forge-panel/40 p-3.5">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <button onClick={() => setSelected(i)} className="truncate text-sm font-semibold text-forge-ink hover:text-forge-ember" title="Open this business's web">{b.name}</button>
                            {b.audit && <span className={cn('rounded-full border px-2 py-0.5 text-[10.5px] font-medium', VERDICT_STYLE[b.audit.verdict].cls)}>{VERDICT_STYLE[b.audit.verdict].label}{b.audit.score != null ? ` · ${b.audit.score}` : ''}</span>}
                            {!b.audit && b.url && <span className="inline-flex items-center gap-1 text-[11px] text-forge-dim"><Loader2 size={11} className="animate-spin" /> checking site…</span>}
                          </div>
                          {b.url && <a href={b.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 truncate text-[11px] text-forge-dim hover:text-forge-ember">{b.url.replace(/^https?:\/\//, '')} <ExternalLink size={10} /></a>}
                          {b.audit && b.audit.signals.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {b.audit.signals.map((s) => (
                                <span key={s.id} className="inline-flex items-center gap-1 rounded-md bg-forge-raised px-1.5 py-0.5 text-[10.5px] text-forge-dim" title={s.detail}>
                                  <AlertTriangle size={9} className={s.severity === 'high' ? 'text-forge-ember' : 'text-forge-warn'} /> {s.label}
                                </span>
                              ))}
                            </div>
                          )}
                          {!b.audit && b.snippet && <p className="mt-1 line-clamp-2 text-[11.5px] text-forge-dim/80">{b.snippet}</p>}
                        </div>
                        <div className="shrink-0">
                          {b.built ? (
                            <div className="text-right">
                              <a href={b.built.previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-forge-border px-2.5 py-1.5 text-xs text-forge-ink hover:border-forge-ember/50">Open site <ExternalLink size={11} /></a>
                              <div className={cn('mt-1 text-[10.5px]', b.built.queued ? 'text-forge-ok' : 'text-forge-warn')}>{b.built.queued ? <span className="inline-flex items-center gap-1"><CheckCircle2 size={11} /> pitch in Queue</span> : 'built · no email found'}</div>
                            </div>
                          ) : (
                            <Button variant="primary" size="sm" onClick={() => void build(i)} disabled={b.building || !b.url}>
                              {b.building ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Build their site
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                )}
                {rows.some((r) => r.built?.queued) && (
                  <NavLink to="/garvis/queue" className="mt-4 inline-flex items-center gap-1.5 text-sm text-forge-ember hover:underline">
                    Review your pitches in the Queue <ArrowRight size={14} />
                  </NavLink>
                )}
              </>
            )}
          </div>
        )}

        {!searched && (
          <div className="mt-5 rounded-xl border border-dashed border-forge-border bg-forge-panel/20 p-6 text-center text-sm text-forge-dim">
            Type a niche and a town above to start. Garvis finds real businesses, checks each site, and shows you who’s worth pitching.
          </div>
        )}
      </div>
      )}

      {/* tap a prospect → its own web (canvas): their site, the new site, the pitch, contact */}
      {selected != null && rows[selected] && (
        <ProspectCanvas
          data={{ name: rows[selected].name, url: rows[selected].url, audit: rows[selected].audit, built: rows[selected].built ?? null }}
          building={!!rows[selected].building}
          onBuild={() => void build(selected)}
          onClose={() => setSelected(null)}
        />
      )}
    </AppShell>
  );
}

