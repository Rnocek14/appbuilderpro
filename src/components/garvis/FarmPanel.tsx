// src/components/garvis/FarmPanel.tsx
// THE FARM — the neighborhood-prospecting surface the readiness audit found missing. A territory
// holds real households (imported from a county/PropertyRadar/Cole CSV without losing columns);
// the panel computes the standard farm-viability math (honest: unknown turnover says unknown),
// keeps a sacred do-not-mail list, and merges the world's saved postcard design into a print-ready
// run — one front + one addressed back per mailable household, suppression checked fail-closed at
// merge time. Garvis still doesn't mail anything itself: the merged run goes to a printer/vendor,
// and the batch gets logged like every other real-world act.

import { Fragment, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Loader2, MapPin, Upload, Printer, Ban, Trash2, Calculator } from 'lucide-react';
import {
  parseFarmCsv, partitionMailable, addressBlockLines, farmMath, type FarmRecipient,
} from '../../lib/garvis/farm';
import type { MailerSpec } from '../../lib/garvis/mailer';
import {
  listTerritories, createTerritory, deleteTerritory, territoryStats, importRecipients,
  listRecipients, listDoNotMail, addDoNotMail, removeDoNotMail, RECIPIENT_LOAD_CAP,
  type TerritoryRow, type TerritoryStats, type DoNotMailRow,
} from '../../lib/garvis/farmRun';
import { logMailBatch } from '../../lib/garvis/mailerRun';
import { loadWorldPostcardDesigns, type WorldPostcardDesign } from '../../lib/garvis/farmDesigns';
import { cn } from '../../lib/utils';

type Toast = (k: 'success' | 'error' | 'info', m: string) => void;

export function FarmPanel({ worldId, onToast }: { worldId: string; onToast: Toast }) {
  const [territories, setTerritories] = useState<TerritoryRow[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [stats, setStats] = useState<TerritoryStats | null>(null);
  const [dnm, setDnm] = useState<DoNotMailRow[]>([]);
  const [designs, setDesigns] = useState<WorldPostcardDesign[]>([]);
  const [busy, setBusy] = useState(false);

  const [newName, setNewName] = useState('');
  const [csvText, setCsvText] = useState('');
  const [search, setSearch] = useState('');
  const [recipients, setRecipients] = useState<FarmRecipient[] | null>(null);

  // Farm math inputs — homes defaults to the real recipient count; turnover is HER MLS number.
  const [homesStr, setHomesStr] = useState('');
  const [soldStr, setSoldStr] = useState('');
  const [pieceStr, setPieceStr] = useState('0.55');
  const [dropsStr, setDropsStr] = useState('12');
  const [gciStr, setGciStr] = useState('');

  const [designIx, setDesignIx] = useState(0);
  const [absOnly, setAbsOnly] = useState(false);
  const [merge, setMerge] = useState<{ spec: MailerSpec; qr: string | null; mailable: FarmRecipient[]; suppressed: number } | null>(null);

  const territory = territories?.find((t) => t.id === sel) ?? null;

  useEffect(() => {
    let live = true;
    void listTerritories(worldId).then((t) => { if (live) { setTerritories(t); setSel((s) => s ?? t[0]?.id ?? null); } })
      .catch((e) => onToast('error', e instanceof Error ? e.message : 'Could not load territories (is app_0063 applied?)'));
    void listDoNotMail().then((d) => { if (live) setDnm(d); }).catch(() => {});
    void loadWorldPostcardDesigns(worldId).then((d) => { if (live) setDesigns(d); }).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId]);

  useEffect(() => {
    if (!sel) { setStats(null); setRecipients(null); return; }
    let live = true;
    setRecipients(null);
    void territoryStats(sel).then((s) => { if (live) { setStats(s); setHomesStr(String(s.recipients || '')); } }).catch(() => setStats(null));
    return () => { live = false; };
  }, [sel]);

  const parsed = useMemo(() => (csvText.trim() ? parseFarmCsv(csvText) : null), [csvText]);
  const dnmKeys = useMemo(() => new Set(dnm.map((d) => d.household_key)), [dnm]);

  const math = useMemo(() => farmMath({
    homes: parseInt(homesStr, 10) || 0,
    pieceCostUsd: parseFloat(pieceStr) || 0,
    dropsPerYear: parseInt(dropsStr, 10) || 0,
    soldLast12: soldStr.trim() === '' ? null : Math.max(0, parseInt(soldStr, 10) || 0),
    avgGciUsd: gciStr.trim() === '' ? null : Math.max(0, parseFloat(gciStr) || 0),
  }), [homesStr, pieceStr, dropsStr, soldStr, gciStr]);

  const doCreate = async () => {
    try {
      setBusy(true);
      const t = await createTerritory({ worldId, name: newName });
      setTerritories((ts) => [t, ...(ts ?? [])]); setSel(t.id); setNewName('');
      onToast('success', `Territory "${t.name}" created — import its list to make it real.`);
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not create the territory.'); }
    finally { setBusy(false); }
  };

  const doDelete = async (t: TerritoryRow) => {
    if (!window.confirm(`Delete "${t.name}" and its imported addresses? The do-not-mail list is kept.`)) return;
    try {
      await deleteTerritory(t.id);
      setTerritories((ts) => (ts ?? []).filter((x) => x.id !== t.id));
      if (sel === t.id) setSel(null);
      onToast('info', `Deleted "${t.name}".`);
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not delete.'); }
  };

  const doImport = async () => {
    if (!sel || !parsed || parsed.recipients.length === 0) return;
    try {
      setBusy(true);
      const res = await importRecipients({ territoryId: sel, worldId, recipients: parsed.recipients });
      const bits = [`${res.inserted} added`];
      if (res.skippedExisting > 0) bits.push(`${res.skippedExisting} already on file`);
      if (parsed.duplicatesInFile > 0) bits.push(`${parsed.duplicatesInFile} in-file duplicates collapsed`);
      if (parsed.rejected.length > 0) bits.push(`${parsed.rejected.length} rows rejected`);
      onToast('success', `Import done: ${bits.join(', ')}. ${res.total} households on file.`);
      setCsvText('');
      const s = await territoryStats(sel); setStats(s); setHomesStr(String(s.recipients || ''));
      setRecipients(null);
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Import failed.'); }
    finally { setBusy(false); }
  };

  const ensureRecipients = async (): Promise<FarmRecipient[]> => {
    if (recipients) return recipients;
    if (!sel) return [];
    const r = await listRecipients(sel);
    setRecipients(r);
    if (stats && stats.recipients > RECIPIENT_LOAD_CAP) {
      onToast('info', `Working with the first ${RECIPIENT_LOAD_CAP.toLocaleString()} of ${stats.recipients.toLocaleString()} households.`);
    }
    return r;
  };

  const doSearch = async (q: string) => { setSearch(q); if (q.trim().length >= 2) await ensureRecipients(); };

  const searchHits = useMemo(() => {
    if (!recipients || search.trim().length < 2) return [];
    const q = search.trim().toLowerCase();
    return recipients.filter((r) =>
      r.fullName.toLowerCase().includes(q) || r.situs.address1.toLowerCase().includes(q)).slice(0, 6);
  }, [recipients, search]);

  const doSuppress = async (r: FarmRecipient) => {
    try {
      await addDoNotMail({ householdKey: r.householdKey, addressLabel: `${r.situs.address1}, ${r.situs.city}`.replace(/, $/, '') });
      setDnm(await listDoNotMail());
      onToast('success', `${r.situs.address1} will never be mailed again.`);
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not suppress.'); }
  };

  const doUnsuppress = async (row: DoNotMailRow) => {
    try { await removeDoNotMail(row.id); setDnm((d) => d.filter((x) => x.id !== row.id)); onToast('info', 'Removed from do-not-mail.'); }
    catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not remove.'); }
  };

  const doMerge = async () => {
    const design = designs[designIx];
    if (!sel || !design) return;
    try {
      setBusy(true);
      const all = await ensureRecipients();
      const pool = absOnly ? all.filter((r) => r.isAbsentee) : all;
      const part = partitionMailable(pool, dnmKeys);
      if (part.mailable.length === 0) {
        onToast('error', pool.length === 0
          ? (absOnly ? 'No absentee owners on file in this territory.' : 'No households on file — import a list first.')
          : `Nothing mailable: all ${pool.length} were suppressed (do-not-mail or incomplete addresses).`);
        return;
      }
      const url = design.spec.back.qrUrl ?? design.spec.back.linkUrl;
      const qr = url ? await QRCode.toDataURL(url, { margin: 1, width: 240, errorCorrectionLevel: 'M' }).catch(() => null) : null;
      setMerge({ spec: design.spec, qr, mailable: part.mailable, suppressed: part.suppressed.length });
      onToast('info', `Merged ${part.mailable.length} cards${part.suppressed.length ? ` (${part.suppressed.length} suppressed)` : ''} — opening print…`);
      window.setTimeout(() => window.print(), 500);
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Merge failed.'); }
    finally { setBusy(false); }
  };

  const doLogBatch = async () => {
    if (!merge || !territory) return;
    try {
      setBusy(true);
      await logMailBatch({
        worldId, clusterId: null, artifactSlug: designs[designIx]?.slug ?? null,
        title: `${territory.name} — ${designs[designIx]?.title ?? 'postcard'}`,
        pieceCount: merge.mailable.length, status: 'printed',
        notes: merge.suppressed > 0 ? `merged run; ${merge.suppressed} suppressed` : 'merged run',
        territoryId: territory.id,
      });
      onToast('success', `Logged ${merge.mailable.length} pieces as printed. Log them mailed from the mail log when they drop.`);
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not log the batch.'); }
    finally { setBusy(false); }
  };

  if (!territories) return <div className="mt-4 flex items-center gap-2 text-sm text-forge-dim"><Loader2 size={14} className="animate-spin" /> Loading the farm…</div>;

  return (
    <div className="mt-4 space-y-4">
      {/* Territories */}
      <div className="rounded-xl border border-forge-border bg-forge-raised/30 p-3">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-forge-ink"><MapPin size={14} className="text-forge-ember" /> Farm territories</h4>
        <p className="mt-0.5 text-[11px] text-forge-dim">A territory is a neighborhood you work by mail. Import its households from a county/PropertyRadar/Cole CSV — every column is kept.</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {territories.map((t) => (
            <span key={t.id} className="inline-flex items-center">
              <button onClick={() => setSel(t.id)}
                className={cn('rounded-l-lg border px-2.5 py-1 text-xs', sel === t.id ? 'border-forge-ember/60 bg-forge-ember/10 text-forge-ink' : 'border-forge-border text-forge-dim hover:text-forge-ink')}>
                {t.name}
              </button>
              <button onClick={() => void doDelete(t)} title="Delete territory"
                className={cn('rounded-r-lg border border-l-0 px-1.5 py-1 text-forge-dim hover:text-forge-warn', sel === t.id ? 'border-forge-ember/60' : 'border-forge-border')}>
                <Trash2 size={11} />
              </button>
            </span>
          ))}
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Maple Grove"
            onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) void doCreate(); }}
            className="w-36 rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1 text-xs text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none" />
          <button onClick={() => void doCreate()} disabled={busy || !newName.trim()}
            className="rounded-lg border border-forge-border px-2.5 py-1 text-[11px] text-forge-dim hover:text-forge-ink disabled:opacity-50">Add</button>
        </div>
        {stats && territory && (
          <p className="mt-2 text-[11px] text-forge-dim">
            <span className="text-forge-ink">{stats.recipients.toLocaleString()}</span> households on file in {territory.name}
            {stats.recipients > 0 && <> · <span className="text-forge-ink">{stats.absentee.toLocaleString()}</span> absentee-owned</>}
            {dnm.length > 0 && <> · {dnm.length} on do-not-mail</>}
          </p>
        )}
      </div>

      {territory && (
        <>
          {/* Import */}
          <div className="rounded-xl border border-forge-border bg-forge-raised/30 p-3">
            <h4 className="flex items-center gap-1.5 text-sm font-semibold text-forge-ink"><Upload size={14} className="text-forge-ember" /> Import households into {territory.name}</h4>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="cursor-pointer rounded-lg border border-forge-border px-2.5 py-1 text-[11px] text-forge-dim hover:text-forge-ink">
                Choose CSV…
                <input type="file" accept=".csv,text/csv" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.text().then(setCsvText); e.target.value = ''; }} />
              </label>
              <span className="text-[11px] text-forge-dim">or paste below</span>
            </div>
            <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={3}
              placeholder={'Owner Name,Property Address,Property City,Property State,Property Zip,Mailing Address,…'}
              className="mt-2 w-full rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 font-mono text-[11px] text-forge-ink placeholder:text-forge-dim/50 focus:border-forge-ember/60 focus:outline-none" />
            {parsed && (
              <div className="mt-2 space-y-1 text-[11px]">
                <p className="text-forge-dim">
                  <span className="text-forge-ink">{parsed.recipients.length}</span> households ready
                  {parsed.duplicatesInFile > 0 && <> · {parsed.duplicatesInFile} in-file duplicates collapsed</>}
                  {parsed.rejected.length > 0 && <> · <span className="text-forge-warn">{parsed.rejected.length} rejected</span> ({parsed.rejected.slice(0, 3).map((r) => `line ${r.line}: ${r.reason}`).join('; ')}{parsed.rejected.length > 3 ? '…' : ''})</>}
                </p>
                {!parsed.mailingDataPresent && parsed.recipients.length > 0 && (
                  <p className="text-forge-warn">This file has no mailing-address columns — absentee owners can't be detected from it (unknowable, not zero).</p>
                )}
                <button onClick={() => void doImport()} disabled={busy || parsed.recipients.length === 0}
                  className="rounded-lg bg-ember-gradient px-3 py-1.5 text-xs font-medium text-[#1A0E04] disabled:opacity-50">
                  {busy ? 'Importing…' : `Import ${parsed.recipients.length} households`}
                </button>
              </div>
            )}
          </div>

          {/* Farm math */}
          <div className="rounded-xl border border-forge-border bg-forge-raised/30 p-3">
            <h4 className="flex items-center gap-1.5 text-sm font-semibold text-forge-ink"><Calculator size={14} className="text-forge-ember" /> Is this farm worth it?</h4>
            <div className="mt-2 flex flex-wrap items-end gap-2 text-[11px] text-forge-dim">
              {[
                { label: 'Homes', v: homesStr, set: setHomesStr, w: 'w-20' },
                { label: 'Sold last 12 mo (MLS)', v: soldStr, set: setSoldStr, w: 'w-28' },
                { label: '$/piece all-in', v: pieceStr, set: setPieceStr, w: 'w-20' },
                { label: 'Drops/yr', v: dropsStr, set: setDropsStr, w: 'w-16' },
                { label: 'Avg GCI $ (optional)', v: gciStr, set: setGciStr, w: 'w-24' },
              ].map((f) => (
                <label key={f.label} className="flex flex-col gap-0.5">
                  <span className="uppercase tracking-wide">{f.label}</span>
                  <input value={f.v} onChange={(e) => f.set(e.target.value)} inputMode="decimal"
                    className={cn(f.w, 'rounded-lg border border-forge-border bg-forge-bg px-2 py-1 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none')} />
                </label>
              ))}
            </div>
            <p className={cn('mt-2 text-xs',
              math.verdict === 'strong' || math.verdict === 'viable' ? 'text-forge-ok'
                : math.verdict === 'dont' ? 'text-forge-warn' : 'text-forge-dim')}>
              {math.line}
            </p>
          </div>

          {/* Do-not-mail */}
          <div className="rounded-xl border border-forge-border bg-forge-raised/30 p-3">
            <h4 className="flex items-center gap-1.5 text-sm font-semibold text-forge-ink"><Ban size={14} className="text-forge-ember" /> Do-not-mail</h4>
            <p className="mt-0.5 text-[11px] text-forge-dim">A neighbor who says "stop mailing me" goes here — checked fail-closed at every merge, never reset.</p>
            <input value={search} onChange={(e) => void doSearch(e.target.value)} placeholder="Search households by name or street…"
              className="mt-2 w-full rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1 text-xs text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none" />
            {searchHits.length > 0 && (
              <ul className="mt-1.5 space-y-1">
                {searchHits.map((r) => (
                  <li key={r.householdKey} className="flex items-center justify-between text-[11px]">
                    <span className="truncate text-forge-ink/80">{r.fullName || 'Current Resident'} · {r.situs.address1}, {r.situs.city}</span>
                    {dnmKeys.has(r.householdKey)
                      ? <span className="text-forge-dim">already suppressed</span>
                      : <button onClick={() => void doSuppress(r)} className="rounded border border-forge-border px-1.5 py-0.5 text-forge-dim hover:text-forge-warn">never mail</button>}
                  </li>
                ))}
              </ul>
            )}
            {dnm.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-forge-border pt-2">
                {dnm.slice(0, 8).map((d) => (
                  <li key={d.id} className="flex items-center justify-between text-[11px] text-forge-dim">
                    <span className="truncate">{d.address_label || d.household_key}</span>
                    <button onClick={() => void doUnsuppress(d)} className="hover:text-forge-ink">remove</button>
                  </li>
                ))}
                {dnm.length > 8 && <li className="text-[11px] text-forge-dim">…and {dnm.length - 8} more</li>}
              </ul>
            )}
          </div>

          {/* Merge + print */}
          <div className="rounded-xl border border-forge-border bg-forge-raised/30 p-3">
            <h4 className="flex items-center gap-1.5 text-sm font-semibold text-forge-ink"><Printer size={14} className="text-forge-ember" /> Print an addressed run</h4>
            {designs.length === 0 ? (
              <p className="mt-1 text-[11px] text-forge-dim">No saved postcard design in this world yet — open the Direct mail studio, design a card, and press Save. The merge prints one addressed card per household from it.</p>
            ) : (
              <>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select value={designIx} onChange={(e) => setDesignIx(Number(e.target.value))}
                    className="rounded-lg border border-forge-border bg-forge-bg px-2 py-1 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none">
                    {designs.map((d, i) => <option key={d.slug} value={i}>{d.title}</option>)}
                  </select>
                  <label className="flex items-center gap-1.5 text-[11px] text-forge-dim">
                    <input type="checkbox" checked={absOnly} onChange={(e) => setAbsOnly(e.target.checked)} className="accent-[#FF8A3D]" />
                    absentee owners only{stats && stats.absentee === 0 ? ' (none on file)' : ''}
                  </label>
                  <button onClick={() => void doMerge()} disabled={busy}
                    className="flex items-center gap-1.5 rounded-lg bg-ember-gradient px-3 py-1.5 text-xs font-medium text-[#1A0E04] disabled:opacity-50">
                    <Printer size={13} /> Merge &amp; print
                  </button>
                </div>
                {merge && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-forge-dim">
                    <span>Last run: <span className="text-forge-ink">{merge.mailable.length}</span> cards{merge.suppressed > 0 ? `, ${merge.suppressed} suppressed` : ''}.</span>
                    <button onClick={() => window.print()} className="rounded border border-forge-border px-1.5 py-0.5 hover:text-forge-ink">print again</button>
                    <button onClick={() => void doLogBatch()} disabled={busy} className="rounded border border-forge-ember/50 px-1.5 py-0.5 text-forge-ember hover:bg-forge-ember/10 disabled:opacity-50">log as printed batch</button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* Print-only merged run: front + addressed back per mailable household, true 6.25×9.25 bleed. */}
      {merge && <MergeRun spec={merge.spec} qr={merge.qr} recipients={merge.mailable} />}
    </div>
  );
}

function MergeRun({ spec, qr, recipients }: { spec: MailerSpec; qr: string | null; recipients: FarmRecipient[] }) {
  return (
    <div className="farm-merge" aria-hidden="true">
      <style>{`
        .farm-merge { display: none; }
        @media print {
          body * { visibility: hidden !important; }
          .farm-merge { display: block !important; position: absolute; left: 0; top: 0; }
          .farm-merge, .farm-merge * { visibility: visible !important; }
          @page { size: 9.25in 6.25in; margin: 0; }
          .farm-page { page-break-after: always; }
        }
      `}</style>
      {recipients.map((r) => {
        const lines = addressBlockLines(r);
        if (!lines) return null; // partitionMailable guarantees these; belt and suspenders
        return (
          <Fragment key={r.householdKey}>
            {/* FRONT */}
            <div className="farm-page" style={{ width: '9.25in', height: '6.25in', position: 'relative', overflow: 'hidden', background: '#000' }}>
              {spec.front.imageUrl && (
                <img src={spec.front.imageUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0.45in', paddingTop: '1.2in', background: 'linear-gradient(to top, rgba(0,0,0,.82), transparent)' }}>
                {spec.front.kicker && <div style={{ color: spec.accent, fontSize: '13pt', letterSpacing: '.12em', textTransform: 'uppercase' }}>{spec.front.kicker}</div>}
                <div style={{ color: '#fff', fontSize: '30pt', fontWeight: 700, lineHeight: 1.15 }}>{spec.front.headline}</div>
              </div>
            </div>
            {/* BACK — addressed */}
            <div className="farm-page" style={{ width: '9.25in', height: '6.25in', position: 'relative', background: '#fff', color: '#171717', display: 'flex' }}>
              <div style={{ width: '50%', padding: '0.45in', display: 'flex', flexDirection: 'column' }}>
                <div style={{ color: spec.accent, fontSize: '19pt', fontWeight: 700, lineHeight: 1.2 }}>{spec.back.headline}</div>
                <div style={{ marginTop: '0.18in', fontSize: '11.5pt', lineHeight: 1.45, whiteSpace: 'pre-line', color: '#404040' }}>{spec.back.body}</div>
                <div style={{ marginTop: 'auto' }}>
                  <div style={{ fontSize: '13pt', fontWeight: 600 }}>{spec.back.cta}</div>
                  <div style={{ marginTop: '0.08in', fontSize: '9.5pt', color: '#737373' }}>{spec.back.contactLine}</div>
                  {spec.back.complianceLine && <div style={{ marginTop: '0.05in', fontSize: '8pt', color: '#a3a3a3' }}>{spec.back.complianceLine}</div>}
                </div>
              </div>
              <div style={{ width: '50%', padding: '0.45in', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                {qr ? <img src={qr} alt="" style={{ width: '1.5in', height: '1.5in' }} /> : <div />}
                {/* Address block — inside the USPS 4in × 2.375in zone; postage corner stays clear. */}
                <div style={{ width: '3.6in', minHeight: '1.5in', textAlign: 'left', fontSize: '11.5pt', lineHeight: 1.5, paddingRight: '1.2in' }}>
                  {lines.map((l) => <div key={l}>{l}</div>)}
                </div>
              </div>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
