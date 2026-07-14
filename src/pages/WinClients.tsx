// src/pages/WinClients.tsx
// THE FRONT DOOR for the agency loop: pick a niche + town → Garvis finds real businesses (Google
// results, never invented) → looks at each one's site and honestly says how weak it is → you pick
// who → it builds them a preview site + drafts the pitch, which lands in the Queue for your approval
// (review-each-batch; nothing emails a real business without your OK). Deploy + monthly SEO retainer
// come after a "yes" — this is the top of the funnel, made into one legible screen.

import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Search, Loader2, Globe, ExternalLink, Sparkles, CheckCircle2, AlertTriangle, ArrowRight, Info } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { useToast } from '../context/ToastContext';
import { findBusinesses, auditBusiness, findContactEmail, type FoundBusiness } from '../lib/garvis/clientHuntRun';
import { auditIssues, type Verdict } from '../lib/garvis/siteAudit';
import { ConstellationWeb } from '../components/garvis/canvas/ConstellationWeb';
import type { WebNode, WebGroupDef } from '../lib/garvis/webLayout';
import { ingestBusinessProfile } from '../lib/preview/engine';
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
  const [rows, setRows] = useState<Row[]>([]);
  const [finding, setFinding] = useState(false);
  const [searched, setSearched] = useState(false);
  const [view, setView] = useState<'list' | 'web'>('list');
  const [selected, setSelected] = useState<number | null>(null);
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
          const audit = await auditBusiness(b.url);
          setRows((r) => r.map((x, j) => (j === idx ? { ...x, audit } : x)));
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      setRows((r) => [...r].sort((a, b) => (VERDICT_RANK[a.audit?.verdict ?? 'unknown'] - VERDICT_RANK[b.audit?.verdict ?? 'unknown'])));
    } catch (e) { toast('error', emsg(e)); }
    finally { setFinding(false); }
  };

  const build = async (idx: number) => {
    const b = rows[idx];
    setRows((r) => r.map((x, j) => (j === idx ? { ...x, building: true } : x)));
    try {
      const industry = niche.trim() || 'Local business';
      const res = await ingestBusinessProfile({
        business_name: b.name, industry, services: [industry],
        location: area.trim() || undefined, website: b.url || undefined, description: b.snippet || undefined,
        current_website_score: b.audit?.score ?? undefined,
        issues: b.audit ? auditIssues(b.audit) : undefined,
      });
      if (!res.ok) { toast('error', res.errors.join(' ')); return; }
      // Find a public email and draft the pitch into the Queue (approval-gated; nothing sends).
      const email = b.url ? await findContactEmail(b.url) : null;
      let queued = false;
      if (email) {
        try {
          await queuePitch({
            previewSiteId: res.row.id, businessProfileId: res.row.profile_id ?? null,
            businessName: b.name, industry, pitch: res.row.pitch, previewUrl: res.previewUrl, toEmail: email,
          });
          queued = true;
        } catch (e) { toast('error', emsg(e)); }
      }
      setRows((r) => r.map((x, j) => (j === idx ? { ...x, built: { previewUrl: res.previewUrl, queued, email } } : x)));
      toast('success', queued
        ? `Built ${b.name} a site + queued the pitch — review it in the Queue.`
        : `Built ${b.name} a site. No public email found — add one in the Queue to send.`);
    } catch (e) { toast('error', emsg(e)); }
    finally { setRows((r) => r.map((x, j) => (j === idx ? { ...x, building: false } : x))); }
  };

  const weakCount = rows.filter((r) => r.audit?.verdict === 'weak').length;
  // The same rows as a web: clustered by verdict, orb size = opportunity (weaker site → bigger orb).
  const webNodes: WebNode[] = rows.map((b, i) => {
    const v = b.audit?.verdict ?? 'unknown';
    const score = b.audit?.score ?? null;
    const metric = v === 'unknown' ? 30 : Math.max(6, 100 - (score ?? 50));
    return { id: String(i), label: b.name, group: v, metric, badge: score ?? '?' };
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-6">
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
            <button onClick={() => void find()} disabled={finding || !niche.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-ember-gradient px-4 py-2 text-sm font-medium text-[#1A0E04] disabled:opacity-60">
              {finding ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Find businesses
            </button>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-forge-dim"><Info size={12} /> Real Google results only — Garvis never invents a business, and the site check reads their real page (no faked scores).</p>
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
                      title="Bigger orb = weaker site = more opportunity" onOpen={(id) => setSelected(Number(id))} />
                    {selected != null && rows[selected] && <FocusedProspect b={rows[selected]} building={!!rows[selected].building} onBuild={() => void build(selected)} onClose={() => setSelected(null)} />}
                  </>
                ) : (
                <div className="space-y-2.5">
                  {rows.map((b, i) => (
                    <div key={`${b.url ?? b.name}-${i}`} className="rounded-xl border border-forge-border bg-forge-panel/40 p-3.5">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-semibold text-forge-ink">{b.name}</span>
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
                            <button onClick={() => void build(i)} disabled={b.building || !b.url}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-ember-gradient px-3 py-2 text-xs font-medium text-[#1A0E04] disabled:opacity-50">
                              {b.building ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Build their site
                            </button>
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
    </AppShell>
  );
}

/** The focused card shown when you tap an orb in the web — the business, its real weaknesses, and
 *  the one action (build them a site). Mirrors a list row so the two views feel like one thing. */
function FocusedProspect({ b, building, onBuild, onClose }: { b: Row; building: boolean; onBuild: () => void; onClose: () => void }) {
  return (
    <div className="mt-3 rounded-xl border border-forge-ember/40 bg-forge-panel/60 p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-forge-ink">{b.name}</span>
            {b.audit && <span className={cn('rounded-full border px-2 py-0.5 text-[10.5px] font-medium', VERDICT_STYLE[b.audit.verdict].cls)}>{VERDICT_STYLE[b.audit.verdict].label}{b.audit.score != null ? ` · ${b.audit.score}` : ''}</span>}
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
        </div>
        <div className="shrink-0 text-right">
          {b.built ? (
            <>
              <a href={b.built.previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-forge-border px-2.5 py-1.5 text-xs text-forge-ink hover:border-forge-ember/50">Open site <ExternalLink size={11} /></a>
              <div className={cn('mt-1 text-[10.5px]', b.built.queued ? 'text-forge-ok' : 'text-forge-warn')}>{b.built.queued ? <span className="inline-flex items-center gap-1"><CheckCircle2 size={11} /> pitch in Queue</span> : 'built · no email found'}</div>
            </>
          ) : (
            <button onClick={onBuild} disabled={building || !b.url} className="inline-flex items-center gap-1.5 rounded-lg bg-ember-gradient px-3 py-2 text-xs font-medium text-[#1A0E04] disabled:opacity-50">
              {building ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Build their site
            </button>
          )}
          <button onClick={onClose} className="mt-1 block text-[10.5px] text-forge-dim hover:text-forge-ink">close</button>
        </div>
      </div>
    </div>
  );
}
