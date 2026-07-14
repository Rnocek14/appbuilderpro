// src/components/garvis/MarketDataPanel.tsx
// THE MARKET, FROM REAL ROWS. Connect a RESO Web API feed (credentials sealed server-side), sync,
// and every stat on this panel is computed from synced listings by the pure core — median close,
// DOM, months of supply, sold-by-zip (which feeds the Farm's turnover math). No feed = an honest
// setup card. Thin data = "not enough data", stated. Nothing here is ever typed in by the model.

import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Loader2, RefreshCw, Link2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { marketStats, soldLast12ByZip, statsLine, type MlsRow } from '../../lib/garvis/mlsStats';
import { cn } from '../../lib/utils';
import { Button } from '../ui';

type Toast = (k: 'success' | 'error' | 'info', m: string) => void;

async function invokeMls<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T & { error?: string }>('mls-sync', { body });
  if (error) throw new Error(error.message);
  if ((data as { error?: string } | null)?.error) throw new Error((data as { error?: string }).error);
  return data as T;
}

export function MarketDataPanel({ onToast }: { onToast: Toast }) {
  const [status, setStatus] = useState<{ connected: boolean; host: string | null; rows: number } | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<MlsRow[] | null>(null);
  const [zip, setZip] = useState('');

  const refreshStatus = async () => {
    try { setStatus(await invokeMls({ action: 'status' })); }
    catch { setStatus(null); }
  };
  const loadRows = async () => {
    const { data, error } = await supabase.from('mls_listings')
      .select('listing_key, status, list_price, close_price, address1, city, zip, property_type, beds, baths, sqft, list_date, close_date, dom')
      .order('modified_at', { ascending: false }).limit(5000);
    if (error) throw new Error(error.message);
    setRows((data ?? []) as MlsRow[]);
  };

  useEffect(() => {
    void refreshStatus();
    void loadRows().catch(() => setRows([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nowIso = useMemo(() => new Date().toISOString(), []);
  const filtered = useMemo(() => {
    if (!rows) return [];
    const z = zip.trim().slice(0, 5);
    return z ? rows.filter((r) => r.zip.startsWith(z)) : rows;
  }, [rows, zip]);
  const stats = useMemo(() => (filtered.length ? marketStats(filtered, nowIso) : null), [filtered, nowIso]);
  const zipSold = useMemo(() => (rows && zip.trim().length === 5 ? soldLast12ByZip(rows, zip, nowIso) : null), [rows, zip, nowIso]);

  const doSave = async () => {
    try {
      setBusy(true);
      const res = await invokeMls<{ note?: string }>({ action: 'save', base_url: baseUrl, token });
      onToast('success', res.note ?? 'Feed saved.');
      setToken('');
      await refreshStatus();
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not save the feed.'); }
    finally { setBusy(false); }
  };

  const doSync = async () => {
    try {
      setBusy(true);
      const res = await invokeMls<{ note?: string }>({ action: 'sync' });
      onToast('success', res.note ?? 'Synced.');
      await Promise.all([refreshStatus(), loadRows()]);
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Sync failed.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-4 rounded-xl border border-forge-border bg-forge-raised/30 p-3">
      <h4 className="flex items-center gap-1.5 text-sm font-semibold text-forge-ink">
        <BarChart3 size={14} className="text-forge-ember" /> Market data (from your MLS feed)
      </h4>

      {status?.connected ? (
        <>
          <p className="mt-0.5 text-[11px] text-forge-dim">
            Feed: <span className="text-forge-ink">{status.host}</span> · {status.rows.toLocaleString()} listings on file.
            Every number below is computed from these rows — never remembered.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button variant='primary' size='sm' onClick={() => void doSync()} disabled={busy}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Sync now
            </Button>
            <input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="Filter by ZIP…" inputMode="numeric"
              className="w-28 rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1 text-xs text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none" />
          </div>

          {rows === null ? (
            <p className="mt-2 text-[11px] text-forge-dim">Loading listings…</p>
          ) : filtered.length === 0 ? (
            <p className="mt-2 text-[11px] text-forge-dim">
              {rows.length === 0 ? 'No listings synced yet — press Sync now.' : `No listings match ZIP ${zip}.`}
            </p>
          ) : stats && (
            <div className="mt-2 space-y-1">
              <p className="text-xs text-forge-ink">{statsLine(stats)}</p>
              {stats.medianPricePerSqft != null && (
                <p className="text-[11px] text-forge-dim">median $/sqft: ${stats.medianPricePerSqft.toLocaleString()}</p>
              )}
              {zipSold != null && (
                <p className="text-[11px] text-forge-cyan">
                  ZIP {zip.trim().slice(0, 5)}: {zipSold} sold in 12 months — that's the "sold last 12 mo" number the Farm's turnover math asks for.
                </p>
              )}
              {stats.notes.length > 0 && (
                <ul className="text-[11px] text-forge-warn">
                  {stats.notes.map((n) => <li key={n}>{n}</li>)}
                </ul>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="mt-1">
          <p className="text-[11px] text-forge-dim">
            No MLS feed connected. If your MLS (or a vendor like Trestle, Bridge, Spark, or MLS Grid)
            gives you a <span className="text-forge-ink">RESO Web API</span> endpoint + bearer token,
            paste them here — the token is stored server-side and never returned to the browser.
            Until then this panel stays honestly empty; it never shows sample data.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.yourmls.com/reso/odata"
              className="w-64 rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1 text-xs text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none" />
            <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Bearer token" type="password"
              className="w-48 rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1 text-xs text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none" />
            <button onClick={() => void doSave()} disabled={busy || !baseUrl.trim() || !token.trim()}
              className={cn('flex items-center gap-1.5 rounded-lg border border-forge-border px-2.5 py-1 text-xs text-forge-ink hover:border-forge-ember/50 disabled:opacity-50')}>
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />} Verify &amp; save feed
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
