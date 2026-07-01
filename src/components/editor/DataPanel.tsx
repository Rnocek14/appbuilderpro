// src/components/editor/DataPanel.tsx
// The FableForge Cloud Console — manage the app's backend in-app (Lovable-Cloud-style), no Supabase
// dashboard needed. Tabs: Data (browse/edit/SQL) · Secrets · Auth · Storage · Functions · Backups.
// Everything proxies the db-console edge fn (Management API / SQL with the per-project token).
import { useCallback, useEffect, useState } from 'react';
import {
  Database, Play, X, Loader2, ChevronLeft, ChevronRight, TableProperties, Trash2,
  KeyRound, Users, FolderOpen, FunctionSquare, Archive, Plus,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fnError } from '../../hooks/useConnections';
import { Button, Input } from '../ui';

type Row = Record<string, unknown>;
const LIMIT = 50;
const cell = (v: unknown) => v === null ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v);

type Tab = 'data' | 'secrets' | 'auth' | 'storage' | 'functions' | 'backups';
const TABS: { id: Tab; label: string; icon: typeof Database }[] = [
  { id: 'data', label: 'Data', icon: Database },
  { id: 'secrets', label: 'Secrets', icon: KeyRound },
  { id: 'auth', label: 'Auth', icon: Users },
  { id: 'storage', label: 'Storage', icon: FolderOpen },
  { id: 'functions', label: 'Functions', icon: FunctionSquare },
  { id: 'backups', label: 'Backups', icon: Archive },
];

function Grid({ columns, rows }: { columns: string[]; rows: Row[] }) {
  if (!rows.length) return <p className="p-4 text-xs text-forge-dim">No rows.</p>;
  const cols = columns.length ? columns : Object.keys(rows[0]);
  return (
    <table className="w-full border-collapse text-[11px]">
      <thead className="sticky top-0 bg-forge-panel"><tr>{cols.map((c) => <th key={c} className="border-b border-forge-border px-2 py-1.5 text-left font-medium text-forge-dim">{c}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className="hover:bg-forge-raised/50">{cols.map((c) => <td key={c} className="max-w-xs truncate border-b border-forge-border/50 px-2 py-1 font-mono text-forge-ink/90" title={cell(r[c])}>{cell(r[c])}</td>)}</tr>)}</tbody>
    </table>
  );
}

export function DataPanel({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('data');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // data tab
  const [tables, setTables] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [grid, setGrid] = useState<{ columns: string[]; rows: Row[] }>({ columns: [], rows: [] });
  const [offset, setOffset] = useState(0);
  const [sql, setSql] = useState('');
  const [editing, setEditing] = useState<{ row: number; col: string } | null>(null);
  const [draft, setDraft] = useState('');
  // other tabs
  const [secrets, setSecrets] = useState<{ name: string }[]>([]);
  const [newSecretName, setNewSecretName] = useState('');
  const [newSecretVal, setNewSecretVal] = useState('');
  const [users, setUsers] = useState<Row[]>([]);
  const [buckets, setBuckets] = useState<Row[]>([]);
  const [activeBucket, setActiveBucket] = useState<string | null>(null);
  const [objects, setObjects] = useState<Row[]>([]);
  const [functions, setFunctions] = useState<Row[]>([]);
  const [backups, setBackups] = useState<Row[]>([]);

  const invoke = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke<Record<string, unknown> & { error?: string }>('db-console', { body: { projectId, ...body } });
    if (error) throw new Error(await fnError(error));
    if (data?.error) throw new Error(data.error as string);
    return data ?? {};
  }, [projectId]);

  const guard = useCallback(async (fn: () => Promise<void>) => {
    setLoading(true); setErr('');
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : 'Failed.'); } finally { setLoading(false); }
  }, []);

  // Load each tab's data when it becomes active.
  useEffect(() => {
    void guard(async () => {
      if (tab === 'data' && !tables.length) { const d = await invoke({ action: 'tables' }); setTables((d.tables as string[]) ?? []); }
      else if (tab === 'secrets') { const d = await invoke({ action: 'secrets_list' }); setSecrets((d.secrets as { name: string }[]) ?? []); }
      else if (tab === 'auth') { const d = await invoke({ action: 'auth_users' }); setUsers((d.rows as Row[]) ?? []); }
      else if (tab === 'storage') { const d = await invoke({ action: 'storage_buckets' }); setBuckets((d.rows as Row[]) ?? []); }
      else if (tab === 'functions') { const d = await invoke({ action: 'functions_list' }); setFunctions((d.functions as Row[]) ?? []); }
      else if (tab === 'backups') { const d = await invoke({ action: 'backups_list' }); const b = d.backups as { backups?: Row[] } | Row[] | undefined; setBackups(Array.isArray(b) ? b : (b?.backups ?? [])); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // --- data tab ---
  const pkCol = grid.columns.includes('id') ? 'id' : null;
  const loadRows = async (table: string, off: number) => guard(async () => {
    const d = await invoke({ action: 'rows', table, offset: off, limit: LIMIT });
    setGrid({ columns: (d.columns as string[]) ?? [], rows: (d.rows as Row[]) ?? [] }); setActive(table); setOffset(off); setSql('');
  });
  const runQuery = async () => { if (!sql.trim()) return; await guard(async () => { const d = await invoke({ action: 'query', sql }); setGrid({ columns: (d.columns as string[]) ?? [], rows: (d.rows as Row[]) ?? [] }); setActive(null); }); };
  const saveCell = async (rowIdx: number, col: string) => {
    setEditing(null);
    if (!pkCol || !active || String(grid.rows[rowIdx][col] ?? '') === draft) return;
    await guard(async () => { await invoke({ action: 'update', table: active, pk: pkCol, pkValue: grid.rows[rowIdx][pkCol], set: { [col]: draft === '' ? null : draft } }); await loadRows(active, offset); });
  };
  const deleteRow = async (rowIdx: number) => { if (!pkCol || !active) return; await guard(async () => { await invoke({ action: 'delete', table: active, pk: pkCol, pkValue: grid.rows[rowIdx][pkCol] }); await loadRows(active, offset); }); };

  // --- secrets tab ---
  const addSecret = async () => { if (!newSecretName.trim() || !newSecretVal.trim()) return; await guard(async () => { await invoke({ action: 'secret_set', name: newSecretName.trim(), secretValue: newSecretVal.trim() }); setNewSecretName(''); setNewSecretVal(''); const d = await invoke({ action: 'secrets_list' }); setSecrets((d.secrets as { name: string }[]) ?? []); }); };
  const delSecret = async (nm: string) => guard(async () => { await invoke({ action: 'secret_delete', name: nm }); const d = await invoke({ action: 'secrets_list' }); setSecrets((d.secrets as { name: string }[]) ?? []); });

  const openBucket = async (b: string) => guard(async () => { const d = await invoke({ action: 'storage_objects', bucket: b }); setObjects((d.rows as Row[]) ?? []); setActiveBucket(b); });

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-forge-panel">
      <div className="flex items-center gap-2 border-b border-forge-border px-4 py-2.5">
        <Database size={15} className="text-forge-ember" />
        <span className="text-sm font-medium text-forge-ink">Cloud</span>
        <span className="text-[11px] text-forge-dim">manage your app's backend</span>
        <button onClick={onClose} className="ml-auto rounded-lg p-1 text-forge-dim hover:text-forge-ink" aria-label="Close"><X size={16} /></button>
      </div>

      {/* tab bar */}
      <div className="flex items-center gap-1 border-b border-forge-border px-2 py-1.5">
        {TABS.map((t) => {
          const I = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ${tab === t.id ? 'bg-forge-raised text-forge-ember' : 'text-forge-dim hover:bg-forge-raised hover:text-forge-ink'}`}>
              <I size={13} /> {t.label}
            </button>
          );
        })}
        {loading && <Loader2 size={13} className="ml-2 animate-spin text-forge-dim" />}
      </div>

      {err && <div className="m-3 rounded-lg border border-forge-err/40 bg-forge-err/10 px-3 py-2 text-xs text-forge-err">{err}</div>}

      {/* ---------- DATA ---------- */}
      {tab === 'data' && (
        <div className="flex min-h-0 flex-1">
          <div className="w-52 shrink-0 overflow-y-auto panel-scroll border-r border-forge-border p-2">
            <div className="mb-1 px-1 text-[10px] uppercase tracking-wide text-forge-dim">Tables</div>
            {tables.length === 0 && !loading ? <p className="px-1 text-[11px] text-forge-dim/70">No tables.</p> : null}
            {tables.map((t) => (
              <button key={t} onClick={() => loadRows(t, 0)} className={`flex w-full items-center gap-1.5 truncate rounded px-2 py-1 text-left text-xs ${active === t ? 'bg-forge-raised text-forge-ember' : 'text-forge-dim hover:bg-forge-raised hover:text-forge-ink'}`}>
                <TableProperties size={12} className="shrink-0" /><span className="truncate">{t}</span>
              </button>
            ))}
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-auto panel-scroll">
              {grid.columns.length > 0 ? (
                <table className="w-full border-collapse text-[11px]">
                  <thead className="sticky top-0 bg-forge-panel"><tr>{grid.columns.map((c) => <th key={c} className="border-b border-forge-border px-2 py-1.5 text-left font-medium text-forge-dim">{c}</th>)}{pkCol && active && <th className="w-8 border-b border-forge-border" />}</tr></thead>
                  <tbody>
                    {grid.rows.map((r, i) => (
                      <tr key={i} className="group hover:bg-forge-raised/50">
                        {grid.columns.map((c) => (
                          <td key={c} className="max-w-xs truncate border-b border-forge-border/50 px-2 py-1 font-mono text-forge-ink/90"
                            title={pkCol && active ? 'click to edit' : cell(r[c])}
                            onClick={() => { if (pkCol && active) { setEditing({ row: i, col: c }); setDraft(r[c] === null ? '' : typeof r[c] === 'object' ? JSON.stringify(r[c]) : String(r[c])); } }}>
                            {editing && editing.row === i && editing.col === c
                              ? <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => saveCell(i, c)} onKeyDown={(e) => { if (e.key === 'Enter') saveCell(i, c); if (e.key === 'Escape') setEditing(null); }} className="w-full rounded bg-forge-raised px-1 text-forge-ink outline-none ring-1 ring-forge-ember/50" />
                              : cell(r[c])}
                          </td>
                        ))}
                        {pkCol && active && <td className="border-b border-forge-border/50 px-1 text-center"><button onClick={() => deleteRow(i)} title="Delete row" className="text-forge-dim/40 hover:text-forge-err group-hover:text-forge-dim"><Trash2 size={11} /></button></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : !loading ? <p className="p-4 text-xs text-forge-dim">Pick a table or run a query.</p> : null}
            </div>
            {active && (
              <div className="flex items-center gap-2 border-t border-forge-border px-3 py-1.5 text-[11px] text-forge-dim">
                <span>{active} · rows {offset + 1}–{offset + grid.rows.length}</span>
                <div className="ml-auto flex gap-1">
                  <button disabled={offset === 0 || loading} onClick={() => loadRows(active, Math.max(0, offset - LIMIT))} className="rounded p-1 hover:text-forge-ink disabled:opacity-40"><ChevronLeft size={14} /></button>
                  <button disabled={grid.rows.length < LIMIT || loading} onClick={() => loadRows(active, offset + LIMIT)} className="rounded p-1 hover:text-forge-ink disabled:opacity-40"><ChevronRight size={14} /></button>
                </div>
              </div>
            )}
            <div className="border-t border-forge-border p-2">
              <div className="flex items-start gap-2">
                <textarea value={sql} onChange={(e) => setSql(e.target.value)} placeholder="Run SQL — e.g. select * from profiles limit 10;" spellCheck={false} className="h-16 flex-1 resize-none rounded-lg border border-forge-border bg-forge-panel px-2 py-1.5 font-mono text-[11px] text-forge-ink outline-none placeholder:text-forge-dim/50" />
                <Button size="sm" loading={loading} disabled={!sql.trim()} onClick={runQuery}><Play size={12} /> Run</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------- SECRETS ---------- */}
      {tab === 'secrets' && (
        <div className="min-h-0 flex-1 overflow-auto panel-scroll p-4">
          <p className="mb-3 text-[11px] text-forge-dim">Backend secrets your edge functions use (Stripe, Resend, OpenAI…). Values are write-only — set, rotate, or remove them here.</p>
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <Input className="w-48" placeholder="NAME" value={newSecretName} onChange={(e) => setNewSecretName(e.target.value.toUpperCase())} />
            <Input className="w-64" type="password" placeholder="value" value={newSecretVal} onChange={(e) => setNewSecretVal(e.target.value)} />
            <Button size="sm" loading={loading} disabled={!newSecretName.trim() || !newSecretVal.trim()} onClick={addSecret}><Plus size={13} /> Add / update</Button>
          </div>
          <div className="space-y-1">
            {secrets.filter((s) => !s.name.startsWith('SUPABASE_')).map((s) => (
              <div key={s.name} className="flex items-center gap-2 rounded-lg border border-forge-border px-3 py-1.5 text-xs">
                <KeyRound size={12} className="text-forge-dim" /><span className="font-mono text-forge-ink">{s.name}</span>
                <button onClick={() => delSecret(s.name)} className="ml-auto text-forge-dim/50 hover:text-forge-err" title="Delete"><Trash2 size={12} /></button>
              </div>
            ))}
            {secrets.length === 0 && !loading && <p className="text-xs text-forge-dim">No secrets set.</p>}
          </div>
        </div>
      )}

      {/* ---------- AUTH ---------- */}
      {tab === 'auth' && (
        <div className="min-h-0 flex-1 overflow-auto panel-scroll">
          <p className="p-3 pb-1 text-[11px] text-forge-dim">Users who signed up to this app ({users.length}).</p>
          <Grid columns={users.length ? Object.keys(users[0]) : []} rows={users} />
        </div>
      )}

      {/* ---------- STORAGE ---------- */}
      {tab === 'storage' && (
        <div className="flex min-h-0 flex-1">
          <div className="w-52 shrink-0 overflow-y-auto panel-scroll border-r border-forge-border p-2">
            <div className="mb-1 px-1 text-[10px] uppercase tracking-wide text-forge-dim">Buckets</div>
            {buckets.map((b) => { const nm = String(b.name); return (
              <button key={nm} onClick={() => openBucket(nm)} className={`flex w-full items-center gap-1.5 truncate rounded px-2 py-1 text-left text-xs ${activeBucket === nm ? 'bg-forge-raised text-forge-ember' : 'text-forge-dim hover:bg-forge-raised hover:text-forge-ink'}`}>
                <FolderOpen size={12} /><span className="truncate">{nm}</span>{b.public ? <span className="ml-auto text-[9px] text-emerald-400">public</span> : null}
              </button>
            ); })}
            {buckets.length === 0 && !loading && <p className="px-1 text-[11px] text-forge-dim/70">No buckets.</p>}
          </div>
          <div className="min-h-0 flex-1 overflow-auto panel-scroll">
            {activeBucket ? <Grid columns={objects.length ? Object.keys(objects[0]) : []} rows={objects} /> : <p className="p-4 text-xs text-forge-dim">Pick a bucket to list its files.</p>}
          </div>
        </div>
      )}

      {/* ---------- FUNCTIONS ---------- */}
      {tab === 'functions' && (
        <div className="min-h-0 flex-1 overflow-auto panel-scroll p-3">
          <p className="mb-2 text-[11px] text-forge-dim">Edge functions deployed to this app ({functions.length}).</p>
          <div className="space-y-1">
            {functions.map((f, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-forge-border px-3 py-1.5 text-xs">
                <FunctionSquare size={12} className="text-forge-ember" /><span className="font-mono text-forge-ink">{String(f.slug)}</span>
                <span className="text-forge-dim">v{String(f.version)}</span>
                <span className={`ml-auto text-[10px] ${f.status === 'ACTIVE' ? 'text-emerald-400' : 'text-forge-dim'}`}>{String(f.status)}</span>
              </div>
            ))}
            {functions.length === 0 && !loading && <p className="text-xs text-forge-dim">No edge functions.</p>}
          </div>
        </div>
      )}

      {/* ---------- BACKUPS ---------- */}
      {tab === 'backups' && (
        <div className="min-h-0 flex-1 overflow-auto panel-scroll p-3">
          <p className="mb-2 text-[11px] text-forge-dim">Database backups ({backups.length}).</p>
          <Grid columns={backups.length ? Object.keys(backups[0]) : []} rows={backups} />
          {backups.length === 0 && !loading && <p className="text-xs text-forge-dim">No backups yet (daily backups require a paid Supabase plan).</p>}
        </div>
      )}
    </div>
  );
}
