// src/pages/WinClients.tsx
// THE FRONT DOOR for the agency loop: pick a niche + town → Garvis finds real businesses (Google
// results, never invented) → looks at each one's site and honestly says how weak it is → you pick
// who → it builds them a preview site + drafts the pitch, which lands in the Queue for your approval
// (review-each-batch; nothing emails a real business without your OK). Deploy + monthly SEO retainer
// come after a "yes" — this is the top of the funnel, made into one legible screen.

import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Search, Loader2, Globe, ExternalLink, Sparkles, CheckCircle2, AlertTriangle, ArrowRight, Info, Radar, Square, CalendarClock, Pause, Play, Power } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import { findBusinesses, scrapeAndAudit, recordProspectAudit, findContactEmail, sweepNation, type FoundBusiness, type DiscoveryEngine } from '../lib/garvis/clientHuntRun';
import { US_CITIES, US_STATES, citiesFor, type SweepScope } from '../lib/garvis/usCities';
import { sweepCostLine } from '../lib/garvis/nationalSweepCore';
import { huntSummary, type HuntConfig } from '../lib/garvis/clientHuntSchedule';
import { deriveSignals, proposeFromSignals } from '../lib/garvis/automation/detect';
import { automationUpsellParagraph } from '../lib/garvis/clientHuntBuild';
import { detectVertical } from '../lib/garvis/verticals';
import { listOrders, createClientHuntOrder, setOrderStatus, deleteOrder, runOrderNow } from '../lib/garvis/standingRun';
import { orderStatusLine, type StandingOrder } from '../lib/garvis/standing';
import { noWebsiteAudit, type Verdict } from '../lib/garvis/siteAudit';
import { parseTownList } from '../lib/garvis/prospects/areaSweepCore';
import { ConstellationWeb } from '../components/garvis/canvas/ConstellationWeb';
import { Button } from '../components/ui';
import type { WebNode, WebGroupDef } from '../lib/garvis/webLayout';
import { ProspectCanvas } from '../components/garvis/canvas/ProspectCanvas';
import { SavedAudits } from '../components/garvis/SavedAudits';
import { profileFromScrape } from '../lib/preview/scrapeProfile';
import { queuePitch } from '../lib/garvis/outreach';
import { HuntReadiness } from '../components/garvis/HuntReadiness';
import { SpendMeter, useSpendState } from '../components/garvis/SpendMeter';
import { isLimitFailure, limitReached } from '../lib/garvis/spendLimit';
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
  const navigate = useNavigate();
  const [niche, setNiche] = useState('');
  const [area, setArea] = useState('');
  // Which backend answers a search. Auto = Places when the server has a key, Claude scout when it
  // doesn't — so discovery works with either key configured. Forcing 'claude' is the free-of-Google
  // path; it returns fewer, citation-grounded finds and no Google ratings.
  const [engine, setEngine] = useState<DiscoveryEngine>('auto');
  const [scanUrl, setScanUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scope, setScope] = useState('top50');
  const [sweeping, setSweeping] = useState(false);
  const [sweepProg, setSweepProg] = useState<{ done: number; total: number; found: number; failed: number; city: string } | null>(null);
  const stopSweep = useRef(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [finding, setFinding] = useState(false);
  const [searched, setSearched] = useState(false);
  const [view, setView] = useState<'list' | 'web'>('list');
  const [selected, setSelected] = useState<number | null>(null);
  // Daily automatic hunt (a standing order) — set once, then Garvis sweeps fresh markets every day.
  // Hands-off by default: no niche needed — it hunts every kind of local business.
  const [hunt, setHunt] = useState<StandingOrder | null>(null);
  const [searchesPerDay, setSearchesPerDay] = useState(20);
  const [demoQuota, setDemoQuota] = useState(5);
  const [savingHunt, setSavingHunt] = useState(false);
  const [runningHunt, setRunningHunt] = useState(false);
  const emsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
  const [spend, refreshSpend] = useSpendState();
  // A limit already reached means every button here would fail. Say so and switch them off rather
  // than letting a press bounce off a wall nobody could see.
  const spendStopped = !!spend && limitReached(spend) !== 'none';
  /** A refusal by the spending limit is not a malfunction, so it never wears the word "failed". */
  const reportFailure = (e: unknown) => {
    const m = emsg(e);
    toast(isLimitFailure(m) ? 'info' : 'error', m);
  };

  // Load any existing daily hunt so the panel shows its live state instead of the setup form.
  useEffect(() => {
    void listOrders().then((os) => setHunt(os.find((o) => o.kind === 'client_hunt') ?? null)).catch(() => {});
  }, []);

  const find = async () => {
    setFinding(true); setSearched(true); setRows([]);
    try {
      const found = await findBusinesses(niche, area, undefined, engine);
      setRows(found);
      // Look at each site and audit it honestly (small concurrency pool so we don't hammer).
      let i = 0;
      const worker = async () => {
        while (i < found.length) {
          const idx = i++;
          const b = found[idx];
          if (!b.url) {
            // No website is a FINDING, not a reason to skip. These rows used to stay blank forever
            // — no verdict, not even the "checking site…" spinner — which read as a broken scrape
            // when it was actually the best prospect in the list.
            setRows((r) => r.map((x, j) => (j === idx ? { ...x, audit: noWebsiteAudit() } : x)));
            continue;
          }
          const { audit, scrape } = await scrapeAndAudit(b.url);
          setRows((r) => r.map((x, j) => (j === idx ? { ...x, audit } : x)));
          // Keep the audit we just paid for (Phase 0) — best-effort, never blocks the UI.
          void recordProspectAudit({ url: b.url, audit, scrape, source: 'find', businessName: b.name, niche, area });
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      setRows((r) => [...r].sort((a, b) => (VERDICT_RANK[a.audit?.verdict ?? 'unknown'] - VERDICT_RANK[b.audit?.verdict ?? 'unknown'])));
    } catch (e) { reportFailure(e); }
    finally { setFinding(false); refreshSpend(); }
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
      // AUTOMATION SEARCH → PITCH (interactive path): ground the "we can fix X on autopilot" lines
      // in the audit we already ran during Find. No observed signals → no upsell lines, ever.
      let pitch = res.row!.pitch;
      if (b.audit) {
        const view = {
          vertical: detectVertical([niche, bizName, industry].filter(Boolean).join(' ')),
          checks: {}, siteSignalIds: b.audit.signals.map((s) => s.id), text: null, tech: null,
        };
        const sigs = deriveSignals(view);
        const { proposals } = proposeFromSignals(sigs, view.vertical);
        pitch += automationUpsellParagraph(proposals.map((p) => ({
          title: p.title, pitch: p.pitch, monthlyPrice: p.monthlyPrice,
          evidence: sigs.find((s) => s.id === p.matchedSignal)?.evidence ?? '',
        })));
      }
      // The scrape already found a published email; fall back to a dedicated contact scan.
      const email = res.profile?.email ?? (b.url ? await findContactEmail(b.url) : null);
      let queued = false;
      if (email) {
        try {
          await queuePitch({
            previewSiteId: res.row!.id, businessProfileId: res.row!.profile_id ?? null,
            businessName: bizName, industry, pitch, previewUrl: res.previewUrl!, toEmail: email,
          });
          queued = true;
        } catch (e) { reportFailure(e); }
      }
      setRows((r) => r.map((x, j) => (j === idx ? { ...x, built: { previewUrl: res.previewUrl!, queued, email } } : x)));
      toast('success', queued
        ? `Built ${bizName} a demo from their real site + queued the pitch — review it in the Queue.`
        : `Built ${bizName} a demo from their real site. No public email found — add one in the Queue to send.`);
    } catch (e) { reportFailure(e); }
    finally {
      setRows((r) => r.map((x, j) => (j === idx ? { ...x, building: false } : x)));
      refreshSpend();   // building a site is the most expensive single press here
    }
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
      setRows((r) => [{ name: host, url: href, snippet: '', audit, rating: null, ratingCount: null }, ...r]);
      void recordProspectAudit({ url: href, audit, scrape, source: 'scan', businessName: host, niche, area });
      setScanUrl('');
      toast('success', `Scanned ${host} — ${audit.reachable ? 'audited. Press Build to make their demo.' : 'couldn’t load it; worth a manual look.'}`);
    } catch (e) { reportFailure(e); }
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
    if (!n) { toast('error', 'Type a kind of business first — e.g. roofers, dentists, plumbers.'); return; }
    const cities = scopeCities();
    // THE BIGGEST SPENDER IN THE APP, and it used to start on one click with no statement of size —
    // up to a thousand paid searches. The daily limit would have stopped it partway, which is a
    // refund nobody wants and a run that looks broken. Say the number, get a yes.
    if (cities.length > 25 && !window.confirm(
      `This searches ${cities.length} cities, one paid search each, and can take a while.\n\n`
      + `It stops by itself if it reaches your spending limit. Go ahead?`)) return;
    stopSweep.current = false;
    setSweeping(true); setSearched(true); setRows([]); setSweepProg({ done: 0, total: cities.length, found: 0, failed: 0, city: '' });
    const MAX_ROWS = 400;
    try {
      const res = await sweepNation(n, cities, {
        concurrency: 3,
        onFound: (b) => setRows((r) => (r.length >= MAX_ROWS ? r : [...r, { name: b.name, url: b.url, snippet: b.snippet, audit: null, rating: b.rating, ratingCount: b.ratingCount }])),
        onProgress: (p) => setSweepProg(p),
        shouldStop: () => stopSweep.current,
      });
      const where = cities.length === US_CITIES.length ? 'the country' : scope.startsWith('top') ? `the top ${scope.slice(3)} markets` : scope;
      // Honest reporting: a search that FAILED never poses as "found 0" — say why. And a run that
      // stopped at the spending limit is reported as having stopped, not as having failed: it did
      // exactly what it was told to do, and calling that an error is what makes a working limit
      // look like a broken app.
      const stoppedByLimit = isLimitFailure(res.lastError);
      if (stoppedByLimit) {
        toast('info', `${res.lastError} Found ${res.found.length} before it stopped — they're in the list below.`);
      } else if (res.failed > 0 && res.found.length === 0) {
        toast('error', `Nothing could be searched (${res.failed} of ${cities.length} cities): ${res.lastError ?? 'no reason given'}`);
      } else if (res.failed > 0) {
        toast('info', `Searched ${where} — found ${res.found.length} different ${n}, though ${res.failed} cit${res.failed === 1 ? 'y' : 'ies'} couldn't be searched (${res.lastError ?? 'no reason given'}).`);
      } else {
        toast('success', `Searched ${where} — found ${res.found.length} different ${n}. Build the weak ones a site; nothing is emailed until you approve it.`);
      }
    } catch (e) { reportFailure(e); }
    finally { setSweeping(false); refreshSpend(); }
  };

  // AREA STUDY SWEEP — the Area field as a town list. Distinct from the nationwide sweep in the two
  // ways that matter: it fans TRADE SYNONYMS (one phrase undercounts a county), and it AUDITS AND
  // PERSISTS every find while filing the run into a scan cohort — so the study data ("41% of the N
  // sites we scanned…") accrues as a side effect of prospecting instead of being a separate chore.
  // Every row is persisted the moment it lands; stopping early yields a smaller study, never a lost one.
  const sweepAreaStudy = async () => {
    const n = niche.trim();
    const towns = parseTownList(area);
    if (!n || towns.length < 2) { toast('error', 'Enter a niche and a comma-separated town list first.'); return; }
    const { data: sess } = await supabase.auth.getUser();
    const uid = sess.user?.id;
    if (!uid) { toast('error', 'Sign in first.'); return; }
    const areaLabel = window.prompt('Name this study area (appears in the report and the pitch line):', `${towns[0]} area`)?.trim();
    if (!areaLabel) return;
    stopSweep.current = false;
    setSweeping(true); setSearched(true); setRows([]);
    setSweepProg({ done: 0, total: 0, found: 0, failed: 0, city: '' });
    try {
      const { sweepArea } = await import('../lib/garvis/prospects/areaSweep');
      const res = await sweepArea({
        ownerId: uid, niche: n, areaLabel, towns, engine, concurrency: 2,
        onFound: (b) => setRows((r) => (r.length >= 400 ? r : [...r, b])),
        // Audits attach to the same row objects during the audit phase — refresh refs so badges appear.
        onProgress: (p) => { setSweepProg({ done: p.queriesDone, total: p.queriesTotal, found: p.found, failed: p.failed, city: p.current }); setRows((r) => [...r]); },
        shouldStop: () => stopSweep.current,
      });
      if (res.failed > 0 && res.found.length === 0) {
        toast('error', `The sweep couldn’t search: ${res.lastError ?? 'unknown error'}`);
      } else {
        toast('success', `Swept ${areaLabel} — ${res.found.length} unique ${n}, ${res.audited} audited and recorded` +
          `${res.cohort ? `, filed into study “${res.cohort.name}”` : ' (study table not installed — leads still saved)'}.`);
      }
    } catch (e) { reportFailure(e); }
    finally { setSweeping(false); }
  };

  // The unattended twin of sweepAreaStudy: same plan, but handed to the heartbeat. One toast, done —
  // progress lives on the standing order's last_result line and the finished study on /garvis/studies.
  const startServerStudy = async () => {
    const n = niche.trim();
    const towns = parseTownList(area);
    if (!n || towns.length < 2) { toast('error', 'Enter a niche and a comma-separated town list first.'); return; }
    const areaLabel = window.prompt('Name this study area (appears in the report and the pitch line):', `${towns[0]} area`)?.trim();
    if (!areaLabel) return;
    try {
      const { createAreaStudyOrder } = await import('../lib/garvis/standingRun');
      await createAreaStudyOrder({ niche: n, areaLabel, towns });
      toast('success', `Study queued: ${n} across ${towns.length} towns. The server works a slice every ~15 minutes — safe to close this tab. Results land in Studies.`);
    } catch (e) { reportFailure(e); }
  };

  // The chosen scope as a SweepScope (for the daily hunt config + its summary preview).
  const scopeToSweep = (): SweepScope =>
    scope === 'all' ? { mode: 'topN', n: US_CITIES.length }
      : scope.startsWith('top') ? { mode: 'topN', n: parseInt(scope.slice(3), 10) || 50 }
      : { mode: 'state', state: scope };
  // No niche typed → hunt EVERY kind of local business (hands-off). Typing one narrows it.
  const huntNiches = (): string[] => (niche.trim() ? [niche.trim()] : []);
  const huntCfgPreview: HuntConfig = { niches: huntNiches(), scope: scopeToSweep(), searchesPerDay, demoQuota };

  // Turn the scope (and any typed niche) into a DAILY AUTOMATIC order. From then on Garvis sweeps
  // fresh markets each day, builds demos, and queues pitches for your approval — no URLs to paste,
  // and no niche required (it hunts everything by default).
  const startHunt = async () => {
    setSavingHunt(true);
    try {
      const order = await createClientHuntOrder({ niches: huntNiches(), scope: scopeToSweep(), searchesPerDay, demoQuota });
      setHunt(order);
      toast('success', niche.trim()
        ? `Daily hunt on for "${niche.trim()}". Garvis will sweep fresh markets every day and queue pitches for your approval.`
        : 'Daily hunt on for every kind of local business. Garvis will sweep fresh markets every day and queue pitches for your approval.');
    } catch (e) { reportFailure(e); }
    finally { setSavingHunt(false); }
  };
  const toggleHunt = async () => {
    if (!hunt) return;
    const next = hunt.status === 'active' ? 'paused' : 'active';
    try { await setOrderStatus(hunt.id, next); setHunt({ ...hunt, status: next }); }
    catch (e) { reportFailure(e); }
  };
  const stopHunt = async () => {
    if (!hunt) return;
    try { await deleteOrder(hunt.id); setHunt(null); toast('info', 'Daily hunt turned off.'); }
    catch (e) { reportFailure(e); }
  };
  // Run the hunt RIGHT NOW (owner-scoped forced run in the worker) — same-day proof it works,
  // and the panel's honest result line refreshes from the run it just did.
  const runHuntNow = async () => {
    if (!hunt) return;
    setRunningHunt(true);
    try {
      await runOrderNow(hunt.id);
      const os = await listOrders();
      setHunt(os.find((o) => o.id === hunt.id) ?? hunt);
      toast('success', 'Hunt ran — the result line below is from this run. Demos + pitches land in your Queue.');
    } catch (e) { reportFailure(e); }
    finally { setRunningHunt(false); }
  };

  const weakCount = rows.filter((r) => r.audit?.verdict === 'weak').length;
  // The same rows as a web: clustered by verdict, orb size = opportunity (weaker site → bigger orb).
  const webNodes: WebNode[] = rows.map((b, i) => {
    const v = b.audit?.verdict ?? 'unknown';
    const score = b.audit?.score ?? null;
    const metric = v === 'unknown' ? 30 : Math.max(6, 100 - (score ?? 50));
    return { id: String(i), label: b.name, group: v, metric, badge: score ?? '?' };
  });

  // The hub used to be the first thing this page showed: a 520px orb diagram with "Find / Sites
  // built / Pitches / Clients" and "none yet" under three of them, standing between the owner and
  // every control on the page. A picture of zeros is not a landing screen. The counts that mattered
  // are now a line of text above the work, and the work opens immediately.
  const builtCount = rows.filter((r) => r.built).length;
  const queuedCount = rows.filter((r) => r.built?.queued).length;

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-1 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-forge-ember/15 text-forge-ember"><Globe size={18} /></span>
          <h1 className="text-xl font-semibold text-forge-ink">Search a town or trade</h1>
        </div>
        <p className="mb-4 max-w-2xl text-sm text-forge-dim">
          Pick a kind of business and a place, and we look for real ones there and check how good each
          of their websites is. Build any of them a better one — the email lands in your Queue for you
          to read. Nothing sends on its own.
        </p>

        {/* Ready-to-search light: right where you're about to search, so a missing key or the
            silent app-address blocker is visible before you wonder why nothing happened. */}
        <div className="mb-4"><HuntReadiness /></div>

        {/* And what it has cost you today, in the same place, for the same reason: a limit you can
            see coming is a limit; a limit you cannot is a bug report. */}
        <div className="mb-4 max-w-md"><SpendMeter state={spend} refresh={refreshSpend}
          note="Each search costs a little. Searching every city costs one search per city." /></div>

        {/* ── THE ONE SEARCH ─────────────────────────────────────────────────
            One row, one orange button. Everything that used to sit beside it —
            the nationwide sweep, the town-list study, the URL scan, the daily
            automatic hunt — is still here, one disclosure away. */}
        <div className="rounded-2xl border border-forge-border bg-forge-panel/40 p-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="Kind of business — e.g. roofers, dentists, plumbers"
              aria-label="Kind of business"
              onKeyDown={(e) => { if (e.key === 'Enter') void find(); }}
              className="flex-1 rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none" />
            <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Town or area — e.g. Lake Geneva, WI"
              aria-label="Town or area"
              onKeyDown={(e) => { if (e.key === 'Enter') void find(); }}
              className="flex-1 rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none" />
            <Button variant="primary" size="md" onClick={() => void find()} disabled={finding || !niche.trim() || spendStopped}>
              {finding ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Search
            </Button>
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-forge-dim">
            <Info size={12} className="mt-px shrink-0" /> Only businesses that really exist — we never
            invent one — and the website check reads their actual page, so the verdict is real too.
          </p>

          {/* ── the other ways to search, folded away ─────────────────────── */}
          <details className="mt-3 border-t border-forge-border/60 pt-2">
            <summary className="cursor-pointer list-none text-xs text-forge-dim transition-colors hover:text-forge-ink">
              <span className="underline decoration-dotted underline-offset-2">Other ways to search</span>
            </summary>
            <div className="mt-3 space-y-3">
              {/* One site you already know about. */}
              <div className="flex flex-col gap-2 sm:flex-row">
                <input value={scanUrl} onChange={(e) => setScanUrl(e.target.value)} placeholder="A website you already know about — e.g. joesroofing.com"
                  aria-label="A website you already know about"
                  onKeyDown={(e) => { if (e.key === 'Enter') void scanOne(); }}
                  className="flex-1 rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none" />
                <Button variant="outline" size="md" onClick={() => void scanOne()} disabled={scanning || !scanUrl.trim() || spendStopped}>
                  {scanning ? <Loader2 size={15} className="animate-spin" /> : <Globe size={15} />} Check this one site
                </Button>
              </div>

              {/* The whole country, or one state. */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="How much of the country to search"
                  className="rounded-lg border border-forge-border bg-forge-bg px-2.5 py-2 text-sm text-forge-ink focus:border-forge-ember/60 focus:outline-none">
                  <option value="top25">The 25 biggest cities</option>
                  <option value="top50">The 50 biggest cities</option>
                  <option value="top100">The 100 biggest cities</option>
                  <option value="all">Every city we know ({US_CITIES.length})</option>
                  <optgroup label="One state only">
                    {US_STATES.map((st) => <option key={st} value={st}>{st}</option>)}
                  </optgroup>
                </select>
                {sweeping ? (
                  <Button variant="outline" size="md" onClick={() => { stopSweep.current = true; }}>
                    <Square size={13} /> Stop searching
                  </Button>
                ) : (
                  <Button variant="outline" size="md" onClick={() => void sweepNationwide()} disabled={!niche.trim() || spendStopped}>
                    <Radar size={15} /> Search all those cities
                  </Button>
                )}
                {sweepProg && (
                  <span className="text-[11px] text-forge-dim">
                    {sweeping && <Loader2 size={11} className="mr-1 inline animate-spin" />}
                    {sweepProg.done} of {sweepProg.total} cities · {sweepProg.found} found
                    {sweepProg.failed > 0 && <span className="text-forge-err"> · {sweepProg.failed} couldn’t be searched</span>}
                    {sweepProg.city ? ` · ${sweepProg.city}` : ''}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-forge-dim">
                Searching all of them costs {sweepCostLine(citiesFor(scopeToSweep()).length)}
              </p>

              {/* A list of towns becomes a study — the raw material of the "yours was one of N we
                  looked at" line. Only offered once the box actually holds a list. */}
              {parseTownList(area).length >= 2 && !sweeping && (
                <div className="flex flex-col gap-2 rounded-lg border border-forge-border/60 bg-forge-bg/40 p-2.5 sm:flex-row sm:items-center">
                  <span className="min-w-0 flex-1 text-[11.5px] text-forge-dim">
                    You listed {parseTownList(area).length} towns. We can go through every one, check
                    every business we find, and keep the whole thing as a study you can quote in a pitch.
                  </span>
                  <Button variant="outline" size="sm" onClick={() => void sweepAreaStudy()} disabled={!niche.trim()}>
                    <Radar size={14} /> Do it now, in this tab
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void startServerStudy()} disabled={!niche.trim()}
                    title="A slice every 15 minutes until it's done. Safe to close this tab.">
                    <CalendarClock size={14} /> Do it in the background
                  </Button>
                </div>
              )}

              {/* ── have it search on its own, every day ───────────────────── */}
              <div className="rounded-xl border border-forge-border bg-forge-bg/40 p-3">
                {hunt ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-forge-ink">
                        <CalendarClock size={14} className="text-forge-ember" /> {hunt.label}
                        <span className={cn('rounded-full border px-1.5 py-0.5 text-[10px]', hunt.status === 'active' ? 'border-forge-ok/40 bg-forge-ok/15 text-forge-ok' : 'border-forge-border bg-forge-raised text-forge-dim')}>
                          {hunt.status === 'active' ? 'searching every day' : 'paused'}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[11.5px] text-forge-dim">{orderStatusLine(hunt)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => void runHuntNow()} disabled={runningHunt || hunt.status !== 'active'}>
                        {runningHunt ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Do today’s now
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void toggleHunt()}>
                        {hunt.status === 'active' ? <><Pause size={13} /> Pause it</> : <><Play size={13} /> Start it again</>}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void stopHunt()}><Power size={13} /> Turn it off</Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-medium text-forge-ink"><CalendarClock size={14} className="text-forge-ember" /> Have it search every day without you</div>
                    <p className="mt-0.5 text-[11.5px] text-forge-dim">{huntSummary(huntCfgPreview)}</p>
                    {!niche.trim() && (
                      <p className="mt-0.5 text-[10.5px] text-forge-ok/90">✓ You don’t have to pick a kind of business — it looks at every sort of local one, including the ones with <em>no website at all</em>, which are the easiest to sell. Type one above to narrow it.</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1 text-[11px] text-forge-dim">Searches a day
                        <input type="number" min={1} max={40} value={searchesPerDay} onChange={(e) => setSearchesPerDay(Math.max(1, Math.min(40, parseInt(e.target.value, 10) || 1)))}
                          className="w-16 rounded-md border border-forge-border bg-forge-bg px-2 py-1 text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
                      </label>
                      <label className="flex items-center gap-1 text-[11px] text-forge-dim">Sites built a day
                        <input type="number" min={1} max={25} value={demoQuota} onChange={(e) => setDemoQuota(Math.max(1, Math.min(25, parseInt(e.target.value, 10) || 1)))}
                          className="w-16 rounded-md border border-forge-border bg-forge-bg px-2 py-1 text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
                      </label>
                      <Button variant="outline" size="sm" onClick={() => void startHunt()} disabled={savingHunt}>
                        {savingHunt ? <Loader2 size={13} className="animate-spin" /> : <CalendarClock size={13} />} Start searching daily
                      </Button>
                    </div>
                    <p className="mt-1.5 flex items-start gap-1 text-[10.5px] text-forge-dim/80"><Info size={11} className="mt-px shrink-0" /> Real businesses with a phone and an address, never the same one twice, and it stops on a town once there is nothing new there. Every site it builds and every email it writes waits in your Queue — nothing sends on its own.</p>
                  </div>
                )}
              </div>

              {/* Who does the looking. Auto is right for almost everyone; the choice is here for
                  the case where one of the two is down or you want to avoid Google entirely. */}
              <label className="flex flex-wrap items-center gap-2 text-[11px] text-forge-dim">
                Who does the searching
                <select value={engine} onChange={(e) => setEngine(e.target.value as DiscoveryEngine)}
                  aria-label="Who does the searching"
                  className="rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none">
                  <option value="auto">Whichever is set up (recommended)</option>
                  <option value="places">Google’s business listings</option>
                  <option value="claude">Claude, searching the open web</option>
                </select>
              </label>
            </div>
          </details>
        </div>

        {/* ── RESULTS ────────────────────────────────────────────────────── */}
        {searched ? (
          <div className="mt-5">
            {finding && !rows.length ? (
              <div className="flex items-center gap-2 py-8 text-sm text-forge-dim"><Loader2 size={15} className="animate-spin" /> Looking…</div>
            ) : !rows.length ? (
              <div className="rounded-xl border border-forge-border bg-forge-panel/40 p-6 text-center text-sm text-forge-dim">Nothing came back for that. Try a broader kind of business, or a nearby town.</div>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between text-xs text-forge-dim">
                  <span>
                    {rows.length} found{weakCount > 0 && <span className="text-forge-ember"> · {weakCount} with a weak website</span>}
                    {builtCount > 0 && <span> · {builtCount} built</span>}
                    {queuedCount > 0 && <span className="text-forge-ok"> · {queuedCount} waiting in your Queue</span>}
                  </span>
                  <span className="inline-flex overflow-hidden rounded-lg border border-forge-border">
                    <button onClick={() => setView('list')} className={cn('px-2.5 py-1', view === 'list' ? 'bg-forge-ember/15 text-forge-ember' : 'text-forge-dim hover:text-forge-ink')}>As a list</button>
                    <button onClick={() => setView('web')} className={cn('px-2.5 py-1', view === 'web' ? 'bg-forge-ember/15 text-forge-ember' : 'text-forge-dim hover:text-forge-ink')}>As a picture</button>
                  </span>
                </div>
                {view === 'web' ? (
                  <ConstellationWeb nodes={webNodes} groups={WEB_GROUPS} height="440px"
                    title="The bigger the circle, the worse their website — tap one to open it" onOpen={(id) => setSelected(Number(id))} />
                ) : (
                <div className="space-y-2.5">
                  {rows.map((b, i) => (
                    <div key={`${b.url ?? b.name}-${i}`} className="rounded-xl border border-forge-border bg-forge-panel/40 p-3.5">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <button onClick={() => setSelected(i)} aria-label={`Open ${b.name}`} className="truncate text-sm font-semibold text-forge-ink hover:text-forge-ember">{b.name}</button>
                            {b.audit && <span className={cn('rounded-full border px-2 py-0.5 text-[10.5px] font-medium', VERDICT_STYLE[b.audit.verdict].cls)}>{VERDICT_STYLE[b.audit.verdict].label}{b.audit.score != null ? ` · ${b.audit.score}` : ''}</span>}
                            {!b.audit && b.url && <span className="inline-flex items-center gap-1 text-[11px] text-forge-dim"><Loader2 size={11} className="animate-spin" /> looking at their site…</span>}
                            {/* Google's own rating. Places returns it on every search and we were paying
                                for it and discarding it — it is the fastest read on whether a business
                                is worth the call. Display-at-use only (Places ToS): never persisted. */}
                            {b.rating != null && (
                              <span className="text-[10.5px] text-forge-dim" title={b.ratingCount != null ? `${b.ratingCount} Google review${b.ratingCount === 1 ? '' : 's'}` : 'Google rating'}>
                                ★ {b.rating.toFixed(1)}{b.ratingCount != null ? ` (${b.ratingCount})` : ''}
                              </span>
                            )}
                          </div>
                          {b.url
                            ? <a href={b.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 truncate text-[11px] text-forge-dim hover:text-forge-ember">{b.url.replace(/^https?:\/\//, '')} <ExternalLink size={10} /></a>
                            : <span className="text-[11px] text-forge-ember">no website at all</span>}
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
                            <div className="flex flex-col items-end gap-1">
                              <a href={b.built.previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-forge-border px-2.5 py-1.5 text-xs text-forge-ink hover:border-forge-ember/50">Open the site we built <ExternalLink size={11} /></a>
                              <div className={cn('text-[10.5px]', b.built.queued ? 'text-forge-ok' : 'text-forge-warn')}>{b.built.queued ? <span className="inline-flex items-center gap-1"><CheckCircle2 size={11} /> email waiting in your Queue</span> : 'built — we couldn’t find an email for them'}</div>
                              {/* When they say yes → carry name + email straight into the billing book (no re-typing). */}
                              <NavLink to={`/garvis/client-billing?business=${encodeURIComponent(b.name)}&email=${encodeURIComponent(b.built.email ?? '')}&tier=website_automation`}
                                className="inline-flex items-center gap-1 text-[11px] text-forge-ember hover:underline">
                                They became a client <ArrowRight size={11} />
                              </NavLink>
                            </div>
                          ) : (
                            <Button variant="primary" size="sm" aria-label={`Build a website for ${b.name}`} onClick={() => void build(i)} disabled={b.building || !b.url || spendStopped}>
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
                    Read the emails waiting in your Queue <ArrowRight size={14} />
                  </NavLink>
                )}
              </>
            )}
          </div>
        ) : (
          /* Nothing searched yet. "Type something above to start" is the defect this whole pass is
             about, so this says the one useful thing instead: there is an easier door, and here is
             everything you have already checked. */
          <p className="mt-5 text-sm text-forge-dim">
            You don’t have to search to get started —{' '}
            <NavLink to="/garvis/leads" className="text-forge-ember hover:underline">Businesses to pitch</NavLink>{' '}
            fills a list for you at the press of one button. Come here when you want one particular
            trade in one particular town.
          </p>
        )}

        {/* Every website we have ever checked is kept — the accumulating prospect intelligence
            (app_0072). Below the work, because it is a record, not a next step. */}
        <div className="mt-6"><SavedAudits /></div>
      </div>

      {/* tap a business → its own panel: their site, the new site, the email, the contact */}
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
