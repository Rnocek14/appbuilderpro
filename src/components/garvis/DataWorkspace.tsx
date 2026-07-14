// src/components/garvis/DataWorkspace.tsx
// DATA & NUMBERS WORKSPACE — the analysis studio (the `data` flavor's workspace). Paste or upload a
// CSV; Garvis parses it into a typed table, computes honest per-column statistics, and lets you chart
// a real aggregation. Everything numeric is computed in pure code (data.ts) and shown WITHOUT any AI —
// the "Interpret" button is optional and narrates only the computed fact sheet, never inventing a
// figure. No chart is ever drawn from anything but a real aggregation (the no-theater law).

import { useMemo, useRef, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Table2, Upload, Loader2, ShieldAlert, BarChart3, Sparkles, Download, Check } from 'lucide-react';
import { parseCSV, describe, groupBy, dataFacts, fmtNum, analysisArtifact, type Table, type ColumnStats, type Agg } from '../../lib/garvis/data';
import { narrateData } from '../../lib/garvis/dataRun';
import { createArtifact } from '../../lib/garvis/artifacts';
import { Button } from '../ui';

const AGGS: Agg[] = ['sum', 'mean', 'count', 'min', 'max'];

export function DataWorkspace({ worldId: _worldId, clusterId, onToast }: {
  worldId: string; clusterId: string; onToast: (kind: 'success' | 'error', msg: string) => void;
}) {
  const [raw, setRaw] = useState('');
  const [table, setTable] = useState<Table | null>(null);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [name, setName] = useState('data');
  const fileInput = useRef<HTMLInputElement>(null);

  const load = (text: string, label?: string) => {
    try {
      const t = parseCSV(text);
      setTable(t); setParseErr(null); setRaw(text);
      if (label) setName(label.replace(/\.csv$/i, ''));
    } catch (e) { setTable(null); setParseErr(e instanceof Error ? e.message : 'Could not read that as CSV.'); }
  };

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => load(String(reader.result ?? ''), file.name);
    reader.onerror = () => setParseErr('Could not read the file.');
    reader.readAsText(file);
  };

  const stats = useMemo(() => (table ? describe(table) : []), [table]);

  return (
    <div className="mt-4 rounded-2xl border border-forge-border bg-forge-panel/40 p-4">
      <div className="mb-1 flex items-center gap-2">
        <Table2 size={16} className="shrink-0 text-forge-ember" />
        <h3 className="text-sm font-semibold text-forge-ink">Data workspace</h3>
      </div>
      <p className="text-xs text-forge-dim">
        Paste or upload a CSV. Every number here is <span className="text-forge-ink/80">computed from your data</span>, not guessed — charts only ever come from a real aggregation.
      </p>

      <textarea
        value={raw} onChange={(e) => setRaw(e.target.value)} rows={4}
        placeholder={'Paste CSV — first row is the header:\nregion,sales,month\nWest,1200,Jan\nEast,900,Jan'}
        className="mt-3 w-full resize-y rounded-lg border border-forge-border bg-forge-raised/30 px-3 py-2 font-mono text-xs text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/50 focus:outline-none"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button variant='primary' size='md' onClick={() => load(raw)} disabled={raw.trim().length < 3}>
          <Table2 size={14} /> Load the data
        </Button>
        <input ref={fileInput} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
        <button onClick={() => fileInput.current?.click()} className="flex items-center gap-1.5 rounded-lg border border-forge-border px-2.5 py-2 text-xs text-forge-dim hover:text-forge-ink">
          <Upload size={13} /> Upload CSV
        </button>
      </div>

      {parseErr && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-forge-warn/40 bg-forge-warn/10 px-3 py-2 text-xs text-forge-warn">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" /> {parseErr}
        </div>
      )}

      {table && (
        // Remount on a schema change so the chart's column pickers reset to valid defaults.
        <Loaded key={table.columns.map((c) => `${c.name}:${c.type}`).join('|')} table={table} stats={stats} name={name} clusterId={clusterId} onToast={onToast} />
      )}
    </div>
  );
}

function Loaded({ table, stats, name, clusterId, onToast }: {
  table: Table; stats: ColumnStats[]; name: string; clusterId: string; onToast: (kind: 'success' | 'error', msg: string) => void;
}) {
  const numericCols = table.columns.filter((c) => c.type === 'number').map((c) => c.name);
  const groupCols = table.columns.filter((c) => c.type !== 'number').map((c) => c.name);

  return (
    <div className="mt-4 space-y-4">
      <p className="text-[11px] uppercase tracking-wide text-forge-dim">{table.rows.length} rows × {table.columns.length} columns</p>

      {/* The table itself */}
      <div className="overflow-x-auto rounded-lg border border-forge-border">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-forge-raised/40">
              {table.columns.map((c) => (
                <th key={c.name} className="whitespace-nowrap border-b border-forge-border px-2.5 py-1.5 text-left font-medium text-forge-ink">
                  {c.name} <span className="ml-1 text-[9px] uppercase tracking-wide text-forge-dim/70">{c.type}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.slice(0, 12).map((r, ri) => (
              <tr key={ri} className="odd:bg-forge-panel/20">
                {r.map((cell, ci) => (
                  <td key={ci} className={`whitespace-nowrap border-b border-forge-border/40 px-2.5 py-1 ${table.columns[ci].type === 'number' ? 'text-right tabular-nums text-forge-ink' : 'text-forge-dim'}`}>
                    {cell === null ? <span className="text-forge-dim/40">—</span> : typeof cell === 'number' ? fmtNum(cell) : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {table.rows.length > 12 && <p className="border-t border-forge-border/40 px-2.5 py-1 text-[10px] text-forge-dim/70">showing 12 of {table.rows.length} rows</p>}
      </div>

      {/* Per-column statistics — the honest summary */}
      <div>
        <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-forge-dim">Summary</h4>
        <div className="grid gap-2 sm:grid-cols-2">
          {stats.map((s) => <StatBlock key={s.name} s={s} />)}
        </div>
      </div>

      {/* Chart — only from a real aggregation */}
      <ChartBuilder table={table} numericCols={numericCols} groupCols={groupCols} />

      {/* Optional grounded interpretation + save */}
      <Interpret table={table} name={name} stats={stats} clusterId={clusterId} onToast={onToast} />
    </div>
  );
}

function StatBlock({ s }: { s: ColumnStats }) {
  return (
    <div className="rounded-lg border border-forge-border bg-forge-raised/20 px-3 py-2">
      <div className="flex items-center gap-1.5">
        <span className="truncate text-xs font-medium text-forge-ink">{s.name}</span>
        <span className="text-[9px] uppercase tracking-wide text-forge-dim/70">{s.kind}</span>
        {s.missing > 0 && <span className="ml-auto text-[10px] text-forge-warn">{s.missing} missing</span>}
      </div>
      {s.kind === 'number' && (
        <div className="mt-1 grid grid-cols-3 gap-x-2 gap-y-0.5 text-[11px] tabular-nums text-forge-dim">
          <span>sum {fmtNum(s.sum)}</span><span>mean {fmtNum(s.mean)}</span><span>med {fmtNum(s.median)}</span>
          <span>min {fmtNum(s.min)}</span><span>max {fmtNum(s.max)}</span><span>σ {fmtNum(s.stddev)}</span>
        </div>
      )}
      {s.kind === 'text' && (
        <div className="mt-1 text-[11px] text-forge-dim">
          {s.distinct} distinct{s.top.length > 0 && <span> · top: {s.top.slice(0, 3).map((t) => `${t.value} (${t.count})`).join(', ')}</span>}
        </div>
      )}
      {s.kind === 'date' && (
        <div className="mt-1 text-[11px] tabular-nums text-forge-dim">{s.count} values · {s.min || '?'} → {s.max || '?'}</div>
      )}
    </div>
  );
}

function ChartBuilder({ table, numericCols, groupCols }: { table: Table; numericCols: string[]; groupCols: string[] }) {
  const [by, setBy] = useState(groupCols[0] ?? '');
  const [val, setVal] = useState(numericCols[0] ?? '');
  const [agg, setAgg] = useState<Agg>(numericCols.length ? 'sum' : 'count');

  // All hooks run unconditionally (data is [] when there's nothing to group); the guard follows.
  const effectiveAgg: Agg = numericCols.length === 0 ? 'count' : agg;
  const data = useMemo(() => groupBy(table, by, effectiveAgg === 'count' ? by : val, effectiveAgg).slice(0, 20).map((g) => ({ key: g.key, value: Math.round(g.value * 100) / 100 })), [table, by, val, effectiveAgg]);

  if (groupCols.length === 0) {
    return <p className="rounded-lg border border-forge-border bg-forge-raised/20 px-3 py-2 text-xs text-forge-dim">No category or date column to group by — this table is all numbers. The summary above is its honest read.</p>;
  }

  return (
    <div>
      <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-forge-dim"><BarChart3 size={13} /> Chart</h4>
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
        <Select label="Group by" value={by} onChange={setBy} options={groupCols} />
        {numericCols.length > 0 && (
          <>
            <Select label="Aggregate" value={effectiveAgg} onChange={(v) => setAgg(v as Agg)} options={AGGS} />
            {effectiveAgg !== 'count' && <Select label="of" value={val} onChange={setVal} options={numericCols} />}
          </>
        )}
      </div>
      {data.length > 0 ? (
        <div className="h-64 rounded-lg border border-forge-border bg-forge-raised/10 p-2">
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#262B3A" vertical={false} />
              <XAxis dataKey="key" stroke="#8B90A0" fontSize={10} tickLine={false} interval={0} angle={data.length > 8 ? -30 : 0} textAnchor={data.length > 8 ? 'end' : 'middle'} height={data.length > 8 ? 50 : 24} />
              <YAxis stroke="#8B90A0" fontSize={10} tickLine={false} tickFormatter={(v) => fmtNum(v)} width={52} />
              <Tooltip
                contentStyle={{ background: '#1A1E29', border: '1px solid #262B3A', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => [fmtNum(v), `${effectiveAgg}${effectiveAgg !== 'count' ? ` ${val}` : ''}`]}
                cursor={{ fill: 'rgba(255,138,61,0.08)' }}
              />
              <Bar dataKey="value" fill="#FF8A3D" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="rounded-lg border border-forge-border bg-forge-raised/20 px-3 py-2 text-xs text-forge-dim">Nothing to plot for this combination.</p>
      )}
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="flex items-center gap-1 text-forge-dim">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded border border-forge-border bg-forge-raised/40 px-1.5 py-1 text-forge-ink focus:border-forge-ember/50 focus:outline-none">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function Interpret({ table, name, stats, clusterId, onToast }: {
  table: Table; name: string; stats: ColumnStats[]; clusterId: string; onToast: (kind: 'success' | 'error', msg: string) => void;
}) {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const facts = useMemo(() => dataFacts(table, stats), [table, stats]);

  const run = async () => {
    if (busy) return;
    setBusy(true); setNarrative(null); setSaved(false);
    try {
      const a = await narrateData({ table, question: question.trim() || undefined });
      setNarrative(a.narrative || '(no reading returned — the summary above stands on its own.)');
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'The interpretation call failed.'); }
    finally { setBusy(false); }
  };

  const dlFacts = () => {
    const blob = new Blob([`# ${name} — summary\n\n${facts}${narrative ? `\n\n## Reading\n\n${narrative}` : ''}\n`], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${name || 'data'}-summary.md`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const save = async () => {
    try {
      const art = analysisArtifact(name, facts, narrative ?? '');
      await createArtifact({ clusterId, slug: art.id, kind: 'doc', title: art.title, detail: art.detail, source: 'garvis' });
      setSaved(true); onToast('success', 'Saved to the shelf.');
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not save.'); }
  };

  return (
    <div className="rounded-lg border border-forge-border bg-forge-raised/10 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={question} onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void run(); }}
          placeholder="Ask about the numbers — or leave blank for what stands out"
          className="min-w-0 flex-1 rounded-lg border border-forge-border bg-forge-raised/30 px-3 py-1.5 text-sm text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/50 focus:outline-none"
        />
        <button onClick={() => void run()} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-forge-ember/50 bg-forge-ember/10 px-3 py-1.5 text-xs font-medium text-forge-ember disabled:opacity-50">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Interpret
        </button>
      </div>
      {narrative && (
        <>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-forge-ink">{narrative}</p>
          <p className="mt-1 text-[10px] text-forge-dim/70">Grounded only in the computed summary above — no figure here was invented by the model.</p>
        </>
      )}
      <div className="mt-2 flex items-center gap-1.5">
        <button onClick={dlFacts} className="flex items-center gap-1 rounded-lg border border-forge-border px-2.5 py-1 text-xs text-forge-dim hover:text-forge-ink"><Download size={12} /> summary.md</button>
        <button onClick={() => void save()} disabled={saved} className="flex items-center gap-1 rounded-lg border border-forge-border px-2.5 py-1 text-xs text-forge-dim hover:text-forge-ink disabled:opacity-50">{saved ? <Check size={12} className="text-forge-ok" /> : null} {saved ? 'Saved' : 'Save to shelf'}</button>
      </div>
    </div>
  );
}
