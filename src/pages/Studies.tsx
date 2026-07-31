// src/pages/Studies.tsx  (/garvis/studies)
// THE STUDY READER — where a cohort's numbers become something you can hand to an editor.
//
// Everything here is READ-ONLY and deliberately blunt about publishability. cohortStats refuses to
// produce a rate below the sample floor and refuses a version-mixed cohort outright; this page's
// job is to show those refusals as prominently as the numbers, because the fastest way to lose the
// credibility this whole pipeline is building is to quote a percentage the aggregation layer
// declined to stand behind. The publishable banner is green or it is the blockers, verbatim.
//
// The "for the editor" block is the page's real product: the frame (written before results
// existed), the headline rates with their raw n/d, and the limits — copy-ready. An editor who gets
// the limits WITH the numbers checks us once and trusts us after; one who gets numbers alone
// checks us once and doesn't.

import { useEffect, useState } from 'react';
import { useParams, NavLink } from 'react-router-dom';
import { Loader2, BookOpen, CheckCircle2, AlertTriangle, Copy, ArrowLeft } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { useToast } from '../context/ToastContext';
import { cn } from '../lib/utils';
import { listCohorts, getCohort, loadCohortStats, type Cohort } from '../lib/garvis/prospects/cohortStore';
import { statSentence, cohortMentionLine, type CohortStats } from '../lib/garvis/prospects/cohortStats';

const STATUS_CLS: Record<Cohort['status'], string> = {
  open: 'bg-forge-raised text-forge-dim border-forge-border',
  scanning: 'bg-forge-warn/15 text-forge-warn border-forge-warn/40',
  complete: 'bg-forge-ok/15 text-forge-ok border-forge-ok/40',
  abandoned: 'bg-forge-raised text-forge-dim border-forge-border',
};

/** The copy-ready block for an editor: frame, reportable rates with raw counts, limits. Built from
 *  the same statSentence the pitch uses — one wording everywhere, no drift. */
function editorSummary(cohort: Cohort, stats: CohortStats): string {
  const lines: string[] = [
    `${cohort.name}`,
    `Scope: ${cohort.frame}`,
    `Scanned: ${stats.scanned} of ${stats.members} sites in the sample loaded and were measured (scan v${stats.scanVersions.join('/') || '—'}).`,
    '',
    'Findings:',
    ...stats.stats.map((s) => statSentence(s, cohort.frameNoun)).filter((s): s is string => !!s).map((s) => `  • ${s}`),
    '',
    'What this measurement cannot see:',
    ...stats.limits.map((l) => `  · ${l}`),
  ];
  return lines.join('\n');
}

export default function Studies() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [cohorts, setCohorts] = useState<Cohort[] | null>(null);
  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [stats, setStats] = useState<CohortStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { void listCohorts().then(setCohorts).catch(() => setCohorts([])); }, []);
  useEffect(() => {
    if (!id) { setCohort(null); setStats(null); return; }
    setLoading(true);
    void (async () => {
      const [c, s] = await Promise.all([getCohort(id), loadCohortStats(id)]);
      setCohort(c); setStats(s); setLoading(false);
    })().catch(() => setLoading(false));
  }, [id]);

  const copy = (text: string) => { void navigator.clipboard.writeText(text).then(() => toast('success', 'Copied.')); };

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-5 flex items-center gap-2.5">
          <BookOpen size={18} className="text-forge-ember" />
          <h1 className="text-lg font-semibold text-forge-ink">Studies</h1>
          <span className="text-xs text-forge-dim">what a sweep measured, and whether it may be published</span>
        </div>

        {!id && (
          // ---- the shelf ----
          cohorts === null ? <Loader2 size={18} className="animate-spin text-forge-dim" />
          : cohorts.length === 0 ? (
            <div className="rounded-xl border border-forge-border bg-forge-panel/40 p-6 text-sm text-forge-dim">
              No studies yet. Run a town-list sweep on <NavLink to="/garvis/clients" className="text-forge-ember hover:underline">Win Clients</NavLink> —
              every area sweep files itself here automatically.
            </div>
          ) : (
            <div className="space-y-2">
              {cohorts.map((c) => (
                <NavLink key={c.id} to={`/garvis/studies/${c.id}`}
                  className="flex items-center justify-between rounded-xl border border-forge-border bg-forge-panel/40 px-4 py-3 hover:border-forge-ember/50">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-forge-ink">{c.name}</div>
                    <div className="truncate text-[11px] text-forge-dim">{c.area}</div>
                  </div>
                  <span className={cn('ml-3 shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-medium', STATUS_CLS[c.status])}>{c.status}</span>
                </NavLink>
              ))}
            </div>
          )
        )}

        {id && (
          loading ? <Loader2 size={18} className="animate-spin text-forge-dim" />
          : !cohort ? <div className="text-sm text-forge-dim">Study not found.</div>
          : (
            <div className="space-y-4">
              <NavLink to="/garvis/studies" className="inline-flex items-center gap-1 text-xs text-forge-dim hover:text-forge-ember"><ArrowLeft size={12} /> all studies</NavLink>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-forge-ink">{cohort.name}</h2>
                  <span className={cn('rounded-full border px-2 py-0.5 text-[10.5px] font-medium', STATUS_CLS[cohort.status])}>{cohort.status}</span>
                </div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-forge-dim">{cohort.frame}</p>
              </div>

              {!stats ? (
                <div className="rounded-xl border border-forge-border bg-forge-panel/40 p-4 text-sm text-forge-dim">No members recorded yet.</div>
              ) : (
                <>
                  {/* Publishability, before any number: green, or the blockers verbatim. */}
                  {stats.publishable ? (
                    <div className="flex items-start gap-2 rounded-xl border border-forge-ok/40 bg-forge-ok/10 p-3.5 text-[12.5px] text-forge-ok">
                      <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
                      <div>
                        Publishable — {stats.scanned} of {stats.members} sites scanned, one detection version.
                        {(() => { const m = cohortMentionLine({ stats, frame: cohort.frameNoun, area: cohort.area }); return m ? <div className="mt-1 text-forge-ink">Pitch line: “{m}”</div> : null; })()}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 rounded-xl border border-forge-warn/40 bg-forge-warn/10 p-3.5 text-[12.5px] text-forge-warn">
                      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                      <div>
                        <div className="font-medium">Not publishable yet</div>
                        {stats.blockers.map((b, i) => <div key={i} className="mt-1">{b}</div>)}
                      </div>
                    </div>
                  )}

                  {/* The numbers, each with its raw n/d — no percentage travels without its arithmetic. */}
                  <div className="overflow-x-auto rounded-xl border border-forge-border">
                    <table className="w-full text-left text-[12.5px]">
                      <thead className="bg-forge-raised text-[10.5px] uppercase tracking-wide text-forge-dim">
                        <tr><th className="px-3 py-2">Finding</th><th className="px-3 py-2">Share</th><th className="px-3 py-2">Counted</th><th className="px-3 py-2">Incl. unconfirmed</th></tr>
                      </thead>
                      <tbody>
                        {stats.stats.map((s) => (
                          <tr key={s.code} className="border-t border-forge-border text-forge-ink">
                            <td className="px-3 py-2">{s.title}<span className="ml-1.5 text-[10px] text-forge-dim">{s.code}</span></td>
                            <td className="px-3 py-2 font-medium">{s.pct === null ? <span className="text-forge-dim">not enough data</span> : `${s.pct}%`}</td>
                            <td className="px-3 py-2 text-forge-dim">{s.n} / {s.denominator}</td>
                            <td className="px-3 py-2 text-forge-dim">{s.nIncludingUnconfirmed}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Trade slices, when the cohort spans trades — same refusal rules per slice. */}
                  {stats.slices.length > 1 && (
                    <div className="space-y-1.5">
                      {stats.slices.map((sl) => (
                        <div key={sl.trade} className="rounded-lg border border-forge-border bg-forge-panel/40 px-3 py-2 text-[12px] text-forge-dim">
                          <span className="font-medium text-forge-ink">{sl.trade}</span> · {sl.denominator} scanned
                          {!sl.reportable && ' · below the slice floor — not reportable on its own'}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* The editor block: the page's actual product. */}
                  <div className="rounded-xl border border-forge-border bg-forge-panel/40 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-forge-ink">For the editor — frame, findings, limits, one block</span>
                      <button onClick={() => copy(editorSummary(cohort, stats))}
                        className="inline-flex items-center gap-1 rounded-lg border border-forge-border px-2 py-1 text-[11px] text-forge-dim hover:border-forge-ember/50 hover:text-forge-ember">
                        <Copy size={11} /> Copy
                      </button>
                    </div>
                    <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-[11.5px] leading-relaxed text-forge-dim">{editorSummary(cohort, stats)}</pre>
                  </div>
                </>
              )}
            </div>
          )
        )}
      </div>
    </AppShell>
  );
}
