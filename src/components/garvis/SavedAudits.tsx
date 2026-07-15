// src/components/garvis/SavedAudits.tsx
// The accumulating prospect-intelligence view: every honest audit we've run and KEPT (app_0072).
// Read-only. This is the first visible slice of the cross-business data asset — revisit a prospect,
// filter by how weak their site is or what vertical they're in, and export the list. It stays quiet
// until there's something saved (and if the table isn't migrated yet, listProspectAudits returns []).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Database, RefreshCw, Download, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { listProspectAudits, type ProspectAuditRow } from '../../lib/garvis/clientHuntRun';
import { type Verdict } from '../../lib/garvis/siteAudit';
import { cn } from '../../lib/utils';

const VERDICTS: (Verdict | 'all')[] = ['all', 'weak', 'dated', 'solid', 'unknown'];
const V_LABEL: Record<string, string> = { all: 'All', weak: 'Weak', dated: 'Dated', solid: 'Solid', unknown: 'Couldn’t load' };
const V_CLS: Record<Verdict, string> = { weak: 'text-forge-ember', dated: 'text-forge-warn', solid: 'text-forge-ok', unknown: 'text-forge-dim' };

/** RFC-4180-ish CSV: quote any field containing a comma, quote, or newline. */
function toCsv(rows: ProspectAuditRow[]): string {
  const head = ['business', 'host', 'url', 'verdict', 'score', 'vertical', 'source', 'issues', 'last_audited_at'];
  const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = rows.map((r) => [
    r.business_name ?? '', r.host ?? '', r.url, r.verdict, r.score ?? '', r.vertical ?? '', r.source,
    (r.signals ?? []).map((s) => s.label).join('; '), r.last_audited_at,
  ].map(esc).join(','));
  return [head.join(','), ...lines].join('\n');
}

export function SavedAudits() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ProspectAuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | 'all'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await listProspectAudits({ limit: 500 })); setLoaded(true); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => (verdict === 'all' ? rows : rows.filter((r) => r.verdict === verdict)), [rows, verdict]);

  const exportCsv = () => {
    const blob = new Blob([toCsv(shown)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `prospect-audits-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  // Nothing saved yet (or the table isn't migrated) — stay out of the way entirely, no error.
  if (loaded && rows.length === 0) return null;

  return (
    <div className="mt-3 rounded-2xl border border-forge-border bg-forge-panel/30">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
        {open ? <ChevronDown size={15} className="text-forge-dim" /> : <ChevronRight size={15} className="text-forge-dim" />}
        <Database size={14} className="text-forge-ember" />
        <span className="text-sm font-medium text-forge-ink">Saved audits</span>
        <span className="rounded-full bg-forge-raised px-2 py-0.5 text-[11px] text-forge-dim">{rows.length}</span>
        <span className="ml-auto hidden text-[11px] text-forge-dim sm:inline">your accumulating prospect intelligence</span>
      </button>
      {open && (
        <div className="border-t border-forge-border px-3 py-3">
          <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
            {VERDICTS.map((v) => (
              <button key={v} onClick={() => setVerdict(v)}
                className={cn('rounded-full border px-2.5 py-1 text-[11px]', verdict === v ? 'border-forge-ember/50 bg-forge-ember/15 text-forge-ember' : 'border-forge-border text-forge-dim hover:text-forge-ink')}>
                {V_LABEL[v]}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-1.5">
              <button onClick={() => void load()} disabled={loading}
                className="inline-flex items-center gap-1 rounded-lg border border-forge-border px-2 py-1 text-[11px] text-forge-dim hover:text-forge-ink">
                {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Refresh
              </button>
              <button onClick={exportCsv} disabled={!shown.length}
                className="inline-flex items-center gap-1 rounded-lg border border-forge-border px-2 py-1 text-[11px] text-forge-dim hover:text-forge-ink disabled:opacity-50">
                <Download size={11} /> CSV
              </button>
            </div>
          </div>
          {shown.length === 0 ? (
            <p className="py-4 text-center text-[12px] text-forge-dim">No {verdict !== 'all' ? V_LABEL[verdict].toLowerCase() : ''} audits saved yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-[12.5px]">
                <thead>
                  <tr className="text-[10.5px] uppercase tracking-wide text-forge-dim">
                    <th className="py-1.5 pr-3 font-medium">Business</th>
                    <th className="py-1.5 pr-3 font-medium">Verdict</th>
                    <th className="py-1.5 pr-3 font-medium">Score</th>
                    <th className="py-1.5 pr-3 font-medium">Vertical</th>
                    <th className="py-1.5 pr-3 font-medium">Issues</th>
                    <th className="py-1.5 font-medium">Last checked</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id} className="border-t border-forge-border/60">
                      <td className="py-1.5 pr-3">
                        <div className="font-medium text-forge-ink">{r.business_name || r.host || r.url}</div>
                        <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-forge-dim hover:text-forge-ember">
                          {r.host || r.url.replace(/^https?:\/\//, '')} <ExternalLink size={9} />
                        </a>
                      </td>
                      <td className={cn('py-1.5 pr-3 font-medium', V_CLS[r.verdict])}>{V_LABEL[r.verdict]}</td>
                      <td className="py-1.5 pr-3 tabular-nums text-forge-dim">{r.score ?? '—'}</td>
                      <td className="py-1.5 pr-3 text-forge-dim">{r.vertical ?? '—'}</td>
                      <td className="py-1.5 pr-3 text-forge-dim">{(r.signals ?? []).length}</td>
                      <td className="py-1.5 text-forge-dim">{new Date(r.last_audited_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
