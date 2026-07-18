// src/pages/Working.tsx  (/garvis/working)
// WORKING FOR YOU — one read-only room answering "what is the machine doing while I'm away?".
// Before this, background work hid in five places: standing orders under Businesses, batch drains
// inside Contacts, the client hunt under Win clients, build jobs on the demoted Autopilot page,
// and Places discovery had no surface at all. This page leads with the heartbeat (if the clock is
// stale, every promise below is honestly annotated as not currently running), then lists each
// working system with its own real status line. READ-ONLY on purpose: pause/run-now/cancel live
// on the owning pages — this room observes, links out, and never duplicates a mutation path.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Bot, Compass, Send, Zap, Film, Clock } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { ClockStatus } from '../components/garvis/ClockStatus';
import { Skeleton } from '../components/ui';
import { timeAgo } from '../lib/utils';
import { listOrders } from '../lib/garvis/standingRun';
import { orderStatusLine, type StandingOrder } from '../lib/garvis/standing';
import { listBatches, batchLine, type BatchRow } from '../lib/garvis/outreachBatchRun';
import {
  loadBuildJobs, loadDiscoveryQueries, loadDiscoveredCounts, loadAutomationSummary, loadReelCounts,
  type Loaded, type BuildJobLite, type DiscoveryQueryLite, type DiscoveredCounts, type AutomationSummary, type ReelCounts,
} from '../lib/garvis/workingRun';

function Section({ icon, title, linkTo, linkLabel, children }: {
  icon: React.ReactNode; title: string; linkTo: string; linkLabel: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-forge-border bg-forge-panel/40 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-forge-dim">{icon}</span>
        <h2 className="text-sm font-medium text-forge-ink">{title}</h2>
        <Link to={linkTo} className="ml-auto text-[11px] text-forge-ember hover:underline">{linkLabel} →</Link>
      </div>
      {children}
    </section>
  );
}

const dim = 'text-xs text-forge-dim';

export default function Working() {
  const [orders, setOrders] = useState<StandingOrder[] | null>(null);
  const [batches, setBatches] = useState<BatchRow[] | null>(null);
  const [jobs, setJobs] = useState<Loaded<BuildJobLite> | null>(null);
  const [queries, setQueries] = useState<Loaded<DiscoveryQueryLite> | null>(null);
  const [discovered, setDiscovered] = useState<DiscoveredCounts | null>(null);
  const [autos, setAutos] = useState<AutomationSummary | null>(null);
  const [reels, setReels] = useState<ReelCounts | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      // Every section is independent and fail-soft — one broken table never blanks the room.
      const [o, b, j, q, d, a, r] = await Promise.all([
        listOrders().catch(() => [] as StandingOrder[]),
        listBatches(8).catch(() => [] as BatchRow[]),
        loadBuildJobs(), loadDiscoveryQueries(), loadDiscoveredCounts(), loadAutomationSummary(), loadReelCounts(),
      ]);
      if (!live) return;
      setOrders(o); setBatches(b); setJobs(j); setQueries(q); setDiscovered(d); setAutos(a); setReels(r);
      setReady(true);
    })();
    return () => { live = false; };
  }, []);

  const activeBatches = (batches ?? []).filter((b) => b.status === 'queued' || b.status === 'draining');
  const doneBatches = (batches ?? []).filter((b) => b.status === 'done' || b.status === 'canceled').slice(0, 3);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-1 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-forge-ember/15 text-forge-ember"><Activity size={18} /></span>
          <h1 className="text-xl font-semibold text-forge-ink">Working for you</h1>
        </div>
        <p className="mb-4 text-sm text-forge-dim">
          Everything the clock runs while you’re away — watches, hunts, drains, and builds, each with its
          real status. Actions live on their own pages; this room just tells the truth.
        </p>

        {/* The heartbeat first: if the clock is stale, every promise below is honestly suspect. */}
        <div className="mb-4"><ClockStatus /></div>

        {!ready ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
        ) : (
          <div className="space-y-3">
            <Section icon={<Clock size={15} />} title="Standing orders" linkTo="/garvis/webs" linkLabel="Manage in Businesses">
              {(orders ?? []).length === 0 ? (
                <p className={dim}>No standing orders yet — watches, digests, hunts, and auto-ideas will appear here once created.</p>
              ) : (
                <ul className="space-y-1.5">
                  {(orders ?? []).map((o) => (
                    <li key={o.id} className="text-xs">
                      <span className="text-forge-ink">{o.label}</span>
                      <span className="ml-2 text-forge-dim">{orderStatusLine(o)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section icon={<Zap size={15} />} title="Automations" linkTo="/garvis/automations" linkLabel="Manage rules">
              {autos === null ? (
                <p className={dim}>Not set up on this install yet.</p>
              ) : autos.active + autos.paused === 0 ? (
                <p className={dim}>No rules yet. Recall reminders, review requests, and seasonal nudges run per-customer once created.</p>
              ) : (
                <p className={dim}>
                  <span className="text-forge-ink">{autos.active} active</span>
                  {autos.paused > 0 && ` · ${autos.paused} paused`} — the clock checks every rule each tick;
                  due sends land in your Queue for approval.
                </p>
              )}
            </Section>

            <Section icon={<Send size={15} />} title="Bulk sends" linkTo="/garvis/contacts" linkLabel="Batches live in Contacts">
              {activeBatches.length === 0 && doneBatches.length === 0 ? (
                <p className={dim}>No batches yet — a batch drains under your daily cap after you approve it once.</p>
              ) : (
                <ul className="space-y-1.5">
                  {[...activeBatches, ...doneBatches].map((b) => (
                    <li key={b.id} className="text-xs">
                      <span className="text-forge-ink">“{b.subject}”</span>
                      <span className="ml-2 text-forge-dim">{batchLine(b)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section icon={<Compass size={15} />} title="Client discovery" linkTo="/garvis/clients" linkLabel="Win clients">
              {discovered === null && (!queries || 'missing' in queries || 'failed' in queries) ? (
                <p className={dim}>The daily hunt isn’t set up yet — start it from Win clients and prospects accumulate here.</p>
              ) : (
                <>
                  {discovered && (
                    <p className={dim}>
                      Prospect pool: <span className="text-forge-ink">{discovered.new} new</span>
                      {discovered.built > 0 && ` · ${discovered.built} built into demos`}
                      {discovered.skipped > 0 && ` · ${discovered.skipped} skipped`}
                    </p>
                  )}
                  {queries && 'rows' in queries && queries.rows.length > 0 && (
                    <ul className="mt-1.5 space-y-1">
                      {queries.rows.map((q) => (
                        <li key={q.id} className="text-[11px] text-forge-dim">
                          “{q.query_text}” — {q.exhausted ? 'exhausted' : q.last_run_at ? `last run ${timeAgo(q.last_run_at)}, +${q.last_inserted} then (${q.total_inserted} total)` : 'not run yet'}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </Section>

            <Section icon={<Bot size={15} />} title="App builds" linkTo="/autopilot" linkLabel="Autopilot">
              {!jobs || 'missing' in jobs ? (
                <p className={dim}>The build system isn’t provisioned on this install.</p>
              ) : 'failed' in jobs ? (
                <p className={dim}>Couldn’t load builds — this is a load error, not “nothing running”.</p>
              ) : jobs.rows.length === 0 ? (
                <p className={dim}>No builds in flight.</p>
              ) : (
                <ul className="space-y-1.5">
                  {jobs.rows.map((j) => (
                    <li key={j.id} className="text-xs">
                      <span className="text-forge-ink">{j.name ?? 'Build'}</span>
                      <span className="ml-2 text-forge-dim">
                        {j.status}{j.phase ? ` · ${j.phase}` : ''}{j.pause_reason ? ` — ${j.pause_reason}` : ''} · started {timeAgo(j.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section icon={<Film size={15} />} title="Video renders" linkTo="/garvis/home" linkLabel="Canvas">
              {reels === null ? (
                <p className={dim}>The render pipeline isn’t set up on this install.</p>
              ) : reels.total === 0 ? (
                <p className={dim}>No renders yet — the reel render worker isn’t running anything.</p>
              ) : (
                <p className={dim}>
                  {reels.active > 0
                    ? <><span className="text-forge-ink">{reels.active} rendering now</span> · {reels.total} total</>
                    : `${reels.total} reel job${reels.total === 1 ? '' : 's'} on record — none rendering right now.`}
                </p>
              )}
            </Section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
