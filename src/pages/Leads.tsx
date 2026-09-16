// src/pages/Leads.tsx  (/garvis/leads)
// BUSINESSES TO PITCH — the list of real local businesses whose website is missing or bad, and the one
// thing to do about the next one.
//
// This screen was rewritten in plain language after the owner said, of the whole app, "it's hard to
// know what to do." The old version was not wrong, it was written in the names the RECORDS use: the
// orange button said "Scrape the web (Claude)", the filter chips said New / Built / Pitched / Won, and
// every row carried its own orange "Build the pitch" — nine primary buttons on one screen, all
// identical, next to a second orange button that did something completely different. An empty list
// rendered a row of zeros.
//
// Three things changed, and they are the rules the rest of the app is meant to follow:
//   1. Every control is named after what happens, not after the table it writes to.
//   2. One primary action visible at a time. The work to do next is a single card at the top — the
//      business whose email is waiting to be read, or failing that the best one to build. Every other
//      business is a quiet row you open. Nothing was removed; it is one click away.
//   3. The page says something useful before you touch it, including when it is empty: one sentence
//      about what you're looking at and the one button that fills it.
// Nothing about the pipeline changed — the stage is still derived (stage.ts) from the record's real
// state, so the words on screen can't drift from the truth underneath.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Users, ExternalLink, Loader2, MapPin, Globe, RefreshCw, Search, Square, Hammer, Mail, ChevronRight } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { cn, timeAgo } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { loadProspects, setProspectStatus, type Prospect } from '../lib/garvis/prospects/prospectsRun';
import { buildDemoForReview } from '../lib/garvis/prospects/reviewSend';
import { STAGE_LADDER, STAGE_META, stageRollup, signalChips, type ProspectStage } from '../lib/garvis/prospects/stage';
import { ProspectDrawer } from '../components/prospects/ProspectDrawer';

type Filter = 'all' | ProspectStage;

export default function Leads() {
  const [rows, setRows] = useState<Prospect[] | null | 'error'>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState(false);
  const [noSiteOnly, setNoSiteOnly] = useState(false);
  const [repliedOnly, setRepliedOnly] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildMsg, setBuildMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const stopRef = useRef(false);

  const load = useCallback(async () => {
    setBusy(true);
    try { setRows(await loadProspects()); }
    catch { setRows('error'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // FIND BUSINESSES. Claude searches the web across business types and towns, judges each one's website,
  // and saves the real ones here — no Google account to set up. Each round is a metered call, so the loop
  // runs in small batches and pauses after a bounded run; pressing the button again keeps going.
  const MAX_ROUNDS = 60;
  const findBusinesses = async () => {
    setSearching(true); stopRef.current = false; setSearchMsg('Looking for businesses…');
    let added = 0; let areas = 0; let i = 0;
    try {
      for (; i < MAX_ROUNDS && !stopRef.current; i++) {
        const { data, error } = await supabase.functions.invoke('discover-run', { body: { batch: 2, source: 'claude' } });
        const d = data as { ok?: boolean; combosRun?: number; newLeads?: number; poolTotal?: number; noWebsite?: number; freshCombosLeft?: number; apiError?: string; error?: string } | null;
        if (error || !d?.ok) {
          setSearchMsg(d?.error ?? 'The search could not run. Open “Start here” and add your Claude key — that key is what does the searching.');
          break;
        }
        if (d.apiError) {
          setSearchMsg(`The search was refused: ${d.apiError.slice(0, 90)}. Check your Claude key under “Start here”, then press Find businesses again.`);
          break;
        }
        added += d.newLeads ?? 0; areas += d.combosRun ?? 0;
        setSearchMsg(`Found ${added} new so far — ${d.noWebsite ?? 0} of your ${d.poolTotal ?? 0} have no website at all.`);
        if ((d.freshCombosLeft ?? 0) === 0 && (d.newLeads ?? 0) === 0) {
          setSearchMsg(`We've been through every town we know. ${d.poolTotal ?? 0} businesses in your list, ${d.noWebsite ?? 0} with no website.`);
          break;
        }
      }
      if (i >= MAX_ROUNDS && !stopRef.current) setSearchMsg(`Paused after searching ${areas} areas and finding ${added}. Press Find businesses again to keep going.`);
    } catch (e) { setSearchMsg(e instanceof Error ? e.message : 'The search stopped unexpectedly.'); }
    setSearching(false);
    await load();
  };

  // BUILD, THEN LET A HUMAN READ IT. This used to build the demo AND fire a real cold email to a real
  // business in the same press — it minted the approval and approved it itself, while the reviewable
  // path was hidden behind clicking the business's NAME instead of the button beside it. Now it builds
  // and QUEUES, then opens the business so reading the email is the path of least resistance. Sending
  // is a separate, deliberate press.
  const buildFor = async (p: Prospect) => {
    setBuilding(true); setBuildMsg(null);
    try {
      const r = await buildDemoForReview(p.id);
      if (!r.ok) setBuildMsg({ tone: 'err', text: r.error ?? `We couldn't build a site for ${p.company_name}. Try again.` });
      else if (!r.built) setBuildMsg({ tone: 'ok', text: r.error ?? `${p.company_name}'s site is built, but we couldn't find a public email address for them.` });
      else setSelectedId(p.id);   // the email is waiting — open it
    } catch (e) {
      setBuildMsg({ tone: 'err', text: e instanceof Error ? e.message : `We couldn't build a site for ${p.company_name}.` });
    }
    setBuilding(false);
    await load();
  };

  const skipToggle = async (p: Prospect) => {
    const next = p.stage === 'skipped' ? 'new' : 'skipped';
    try { await setProspectStatus(p.id, next); await load(); }
    catch { /* best-effort; a failed skip just leaves the row where it was */ }
  };

  const all = useMemo(() => (rows === null || rows === 'error' ? [] : rows), [rows]);
  const roll = stageRollup(all.map((r) => r.stage));
  const noSiteCount = all.filter((r) => !r.has_website).length;
  const repliedCount = all.filter((r) => r.replied).length;

  // THE ONE THING TO DO NEXT, picked here rather than left to whatever the list happens to sort first —
  // the card makes a claim about why this business ("the easiest kind to sell"), so it has to earn it.
  // Order: whoever wrote back (a person is waiting on you), then a business whose site is already built
  // and whose email is sitting unread (finishing beats starting another), then an unstarted business
  // with no website at all, then any unstarted business.
  const nextUp = useMemo(() => {
    const live = all.filter((r) => r.stage !== 'skipped');
    return live.find((r) => r.replied)
      ?? live.find((r) => r.stage === 'built')
      ?? live.find((r) => r.stage === 'new' && !r.has_website)
      ?? live.find((r) => r.stage === 'new')
      ?? null;
  }, [all]);

  let visible = filter === 'all' ? all : all.filter((r) => r.stage === filter);
  if (noSiteOnly) visible = visible.filter((r) => !r.has_website);
  if (repliedOnly) visible = visible.filter((r) => r.replied);

  const selected = selectedId ? all.find((r) => r.id === selectedId) ?? null : null;

  const chips: { key: Filter; label: string; count: number; dot?: string }[] = [
    { key: 'all', label: 'All', count: all.length },
    ...STAGE_LADDER.map((s) => ({ key: s as Filter, label: STAGE_META[s].label, count: roll[s], dot: STAGE_META[s].dot })),
    { key: 'skipped' as Filter, label: STAGE_META.skipped.label, count: roll.skipped, dot: STAGE_META.skipped.dot },
  ];
  const filtered = filter !== 'all' || noSiteOnly || repliedOnly;
  const clearFilters = () => { setFilter('all'); setNoSiteOnly(false); setRepliedOnly(false); };

  // The one button that fills the list. It is the page's primary action while the list is empty, and a
  // quiet one once there is work on screen — so there is never more than one orange thing to look at.
  const findButton = (primary: boolean) => (
    searching ? (
      <button onClick={() => { stopRef.current = true; }}
        className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-forge-border px-3.5 py-2 text-sm font-medium text-forge-ink transition-colors hover:border-forge-err/60 hover:text-forge-err">
        <Square size={14} /> Stop searching
      </button>
    ) : (
      <button onClick={() => void findBusinesses()}
        className={cn('inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-transform hover:-translate-y-0.5',
          primary ? 'bg-forge-ember text-forge-bg shadow' : 'border border-forge-border text-forge-ink hover:border-forge-ember/50')}>
        <Search size={14} /> Find businesses
      </button>
    )
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-forge-border bg-forge-panel">
            <Users size={20} className="text-forge-ember" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-forge-ink">Businesses to pitch</h1>
            <p className="text-sm text-forge-dim">
              Real local businesses with no website, or a bad one. Build one of them a website, read the
              email we write to go with it, then send it. Nothing leaves this app until you press send.
            </p>
          </div>
          <button onClick={() => void load()} disabled={busy} title="Refresh this list" aria-label="Refresh this list"
            className="shrink-0 rounded-lg border border-forge-border p-2 text-forge-dim transition-colors hover:text-forge-ink disabled:opacity-50">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          </button>
        </div>

        {/* ── DO THIS NEXT ─────────────────────────────────────────────────────
            The whole screen in one card: who, why them, and the single button. */}
        {rows === null ? (
          <p className="flex items-center gap-2 text-sm text-forge-dim"><Loader2 size={14} className="animate-spin" /> Loading your businesses…</p>
        ) : rows === 'error' ? (
          <div className="rounded-2xl border border-forge-border bg-forge-panel/40 p-6">
            <p className="text-sm font-medium text-forge-ink">We couldn't load your list.</p>
            <p className="mt-1 text-[13px] text-forge-dim">The database tables this page needs aren't set up yet. Finish the steps on <a href="/garvis/start" className="font-medium text-forge-ember hover:underline">Start here</a> and come back.</p>
          </div>
        ) : all.length === 0 ? (
          <div className="rounded-2xl border border-forge-border bg-forge-panel/40 p-6">
            <p className="text-sm font-medium text-forge-ink">You haven't found any businesses yet.</p>
            <p className="mt-1 max-w-xl text-[13px] text-forge-dim">
              Press the button and we search the web for real local businesses whose website is bad or
              missing — the easiest people to sell a website to. It takes a minute or two and fills the
              list below. There's nothing to set up first.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {findButton(true)}
              {searchMsg && (
                <span className="min-w-0 flex-1 text-xs text-forge-dim">
                  {searching && <Loader2 size={12} className="mr-1.5 inline animate-spin" />}{searchMsg}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-forge-ember/30 bg-forge-panel/40 p-4">
            <div className="text-[11px] font-medium uppercase tracking-wide text-forge-dim">Do this next</div>
            {nextUp ? (
              <>
                <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
                  <span className="text-base font-semibold text-forge-ink">{nextUp.company_name}</span>
                  {(nextUp.city || nextUp.state) && <span className="text-[12px] text-forge-dim">{[nextUp.city, nextUp.state].filter(Boolean).join(', ')}</span>}
                  {!nextUp.has_website && <span className="rounded border border-forge-warn/40 bg-forge-warn/10 px-1.5 py-0.5 text-[10px] font-medium text-forge-warn">no website</span>}
                </div>
                <p className="mt-1 text-[13px] text-forge-dim">
                  {nextUp.replied
                    ? 'They wrote back. Open them and read it.'
                    : nextUp.stage === 'built'
                      ? "Their website is built and there's an email waiting for you to read. Nothing was sent."
                      : nextUp.has_website
                        ? "We'll build them a better website, then write the email that shows it to them."
                        : "They have no website at all. We'll build them one, then write the email that shows it to them."}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {nextUp.replied || nextUp.stage === 'built' ? (
                    <button onClick={() => setSelectedId(nextUp.id)}
                      className="inline-flex items-center gap-2 rounded-lg bg-forge-ember px-3.5 py-2 text-sm font-semibold text-forge-bg shadow transition-transform hover:-translate-y-0.5">
                      <Mail size={15} /> Read what we wrote
                    </button>
                  ) : (
                    <button onClick={() => void buildFor(nextUp)} disabled={building}
                      className="inline-flex items-center gap-2 rounded-lg bg-forge-ember px-3.5 py-2 text-sm font-semibold text-forge-bg shadow transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60">
                      {building
                        ? <><Loader2 size={15} className="animate-spin" /> Building their website…</>
                        : <><Hammer size={15} /> Build their site and write the email</>}
                    </button>
                  )}
                  {findButton(false)}
                </div>
              </>
            ) : (
              <>
                <p className="mt-1.5 text-[13px] text-forge-dim">
                  Nothing is waiting on you — every business below has either been emailed or passed over.
                  Find some more and there'll be something here again.
                </p>
                <div className="mt-3">{findButton(true)}</div>
              </>
            )}
            {(buildMsg || searchMsg) && (
              <p className={cn('mt-2 text-xs', buildMsg?.tone === 'err' ? 'text-forge-err' : 'text-forge-dim')}>
                {searching && <Loader2 size={12} className="mr-1.5 inline animate-spin" />}
                {buildMsg?.text ?? searchMsg}
              </p>
            )}
          </div>
        )}

        {/* HOW THIS WORKS — closed by default. Nothing is hidden, it's one click away. */}
        {all.length > 0 && (
          <details className="group mt-3">
            <summary className="cursor-pointer list-none text-xs text-forge-dim transition-colors hover:text-forge-ink">
              <span className="underline decoration-dotted underline-offset-2">Where do these businesses come from?</span>
            </summary>
            <p className="mt-2 max-w-xl rounded-xl border border-forge-border bg-forge-panel/30 p-3 text-[12px] leading-relaxed text-forge-dim">
              Claude searches the open web for real businesses, town by town and trade by trade, and looks
              at each one's website to judge whether it's bad or missing. The ones worth pitching are saved
              here. You don't need a Google account or any other service — your Claude key does all of it.
              Press <span className="font-medium text-forge-ink">Find businesses</span> as often as you like;
              it picks up where it left off and never saves the same business twice.
            </p>
          </details>
        )}

        {/* ── THE LIST ─────────────────────────────────────────────────────── */}
        {all.length > 0 && (
          <>
            <div className="mb-3 mt-6 flex flex-wrap items-center gap-1.5">
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
                  Only ones who wrote back<span className="ml-1 text-[10px]">({repliedCount})</span>
                </button>
              )}
              <button onClick={() => setNoSiteOnly((v) => !v)}
                className={cn('rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                  repliedCount > 0 ? '' : 'ml-auto',
                  noSiteOnly ? 'bg-forge-warn/15 text-forge-warn' : 'text-forge-dim hover:bg-forge-raised hover:text-forge-ink')}>
                Only ones with no website<span className="ml-1 text-[10px]">({noSiteCount})</span>
              </button>
            </div>

            {visible.length === 0 ? (
              <div className="rounded-2xl border border-forge-border bg-forge-panel/40 p-6 text-center">
                <p className="text-sm font-medium text-forge-ink">Nothing matches what you picked.</p>
                <p className="mt-1 text-xs text-forge-dim">You have {all.length} {all.length === 1 ? 'business' : 'businesses'} in total.</p>
                {filtered && (
                  <button onClick={clearFilters}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-forge-border px-3 py-1.5 text-xs font-medium text-forge-ink transition-colors hover:border-forge-ember/50">
                    Show all {all.length}
                  </button>
                )}
              </div>
            ) : (
              <ul className="space-y-2">
                {visible.map((r) => {
                  const meta = STAGE_META[r.stage];
                  const activity = signalChips(r);
                  return (
                    // A real button element, stretched over the whole row, is what makes the row
                    // keyboard-reachable without swallowing the links inside it — those sit above it
                    // and keep their own focus stop. The old row was a clickable list item wearing
                    // role="button", which worked, but nested two links inside a control.
                    <li key={r.id} className="group relative rounded-xl border border-forge-border bg-forge-panel/40 p-3 transition-colors focus-within:border-forge-ember/60 hover:border-forge-ember/40">
                      <button onClick={() => setSelectedId(r.id)} aria-label={`Open ${r.company_name}`}
                        className="absolute inset-0 z-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-forge-ember/50" />
                      <div className="pointer-events-none relative z-[1] flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cn('h-2 w-2 shrink-0 rounded-full', meta.dot)} />
                            <span className="truncate text-sm font-medium text-forge-ink">{r.company_name}</span>
                            <span className={cn('text-[11px] font-medium', meta.color)}>{meta.label}</span>
                            {!r.has_website && <span className="rounded border border-forge-warn/40 bg-forge-warn/10 px-1.5 py-0.5 text-[10px] font-medium text-forge-warn">no website</span>}
                            {r.keyword && <span className="text-[11px] text-forge-dim">{r.keyword}</span>}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-forge-dim">
                            {(r.city || r.state) && <span className="inline-flex items-center gap-1"><MapPin size={11} /> {[r.city, r.state].filter(Boolean).join(', ')}</span>}
                            {r.website && (
                              <a href={r.website} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}
                                className="pointer-events-auto inline-flex items-center gap-1 text-forge-dim hover:text-forge-ember">
                                <Globe size={11} /> {r.website.replace(/^https?:\/\//, '').replace(/\/$/, '')} <ExternalLink size={9} />
                              </a>
                            )}
                            <span className="text-forge-dim/60">found {timeAgo(r.created_at)}</span>
                          </div>
                          {activity.length > 0 && (
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              {activity.map((c, i) => (
                                <span key={i} className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium',
                                  c.tone === 'ok' ? 'bg-forge-ok/10 text-forge-ok' : 'bg-forge-heat/10 text-forge-heat')}>{c.label}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        {r.previewSlug && (
                          <a href={`/preview-site/${r.previewSlug}`} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}
                            className="pointer-events-auto inline-flex shrink-0 items-center gap-1 rounded-lg border border-forge-border px-2 py-1.5 text-[11px] text-forge-dim transition-colors hover:text-forge-ink">
                            <ExternalLink size={12} /> See their new site
                          </a>
                        )}
                        <ChevronRight size={16} className="shrink-0 text-forge-dim/50 transition-colors group-hover:text-forge-ember" />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
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
