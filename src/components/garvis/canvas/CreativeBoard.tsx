// src/components/garvis/canvas/CreativeBoard.tsx
// THE CREATIVE BOARD SHELL — the spatial workspace Riley asked for, generic over any channel. You make
// one piece, then have another idea and make another; they land side-by-side so you can compare; you
// click one and tell it what to change to spawn a rendition (a child that keeps its parent); you drag to
// organize, star the keepers, and print/export. This file owns the SPREAD (pan, drag, focus, make-bar,
// lineage, favorites, persistence); a per-channel ADAPTER supplies what a tile IS and how to make /
// rendition / render it. Postcards are the first adapter (PostcardBoard.tsx); social + branding reuse
// this shell unchanged.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Sparkles, Loader2, Star, Wand2, Maximize2, Trash2, Crosshair, Printer, X } from 'lucide-react';
import {
  emptyBoard, addTile, moveTile, removeTile, toggleFavorite, setTileContent, getTile,
  nextRootPosition, childPosition, favorites as favTiles,
  type Board, type BoardMetrics,
} from '../../../lib/garvis/creativeBoard';
import { loadBoard, saveBoard } from '../../../lib/garvis/clusterState';
import { Overlay } from '../../ui/Overlay';
import { Button } from '../../ui';
import { cn } from '../../../lib/utils';

type Toast = (k: 'success' | 'error' | 'info', m: string) => void;

export interface BoardKind { id: string; label: string; emoji: string; hint: string }

export interface FocusApi<C> {
  update: (content: C) => void;
  rendition: (instruction: string) => Promise<void>;
  favorite: () => void;
  remove: () => void;
  close: () => void;
  isFavorite: boolean;
}

export interface CreativeBoardAdapter<C> {
  storageKey: string;                 // working_state.boards[storageKey]
  title: string;
  subtitle: string;
  metrics: BoardMetrics;              // tile w/h/gap/cols
  designWidth: number;                // px the thumb is authored at, then scaled to metrics.w
  kinds: BoardKind[];                 // "make" chips
  promptPlaceholder: string;
  emptyHint: string;
  banner?: ReactNode;                 // honesty / availability line under the make bar
  captionOf: (content: C) => string;
  generate: (args: { prompt: string; kindId: string | null }) => Promise<C>;
  rendition: (args: { parent: C; instruction: string }) => Promise<C>;
  renderThumb: (content: C) => ReactNode;
  renderFocus: (content: C, api: FocusApi<C>) => ReactNode;
  renderPrint?: (content: C) => ReactNode;   // full print-size render (for Export)
  printCss?: string;                          // @page + hide rules for Export
}

export function CreativeBoard<C>({ adapter, clusterId, onToast }: {
  adapter: CreativeBoardAdapter<C>; clusterId: string | null; onToast: Toast;
}) {
  const M = adapter.metrics;
  const [board, setBoard] = useState<Board<C>>(() => emptyBoard<C>());
  const [loaded, setLoaded] = useState(false);
  const [kind, setKind] = useState<string | null>(adapter.kinds[0]?.id ?? null);
  const [prompt, setPrompt] = useState('');
  const [busyAt, setBusyAt] = useState<{ x: number; y: number; label: string } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [focusId, setFocusId] = useState<string | null>(null);
  const [renditionFor, setRenditionFor] = useState<string | null>(null);
  const [renditionText, setRenditionText] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [printing, setPrinting] = useState<C[] | null>(null);

  // ---- load + persist (debounced) --------------------------------------------------------
  useEffect(() => {
    let live = true;
    void (async () => {
      if (clusterId) {
        try { const b = await loadBoard<C>(clusterId, adapter.storageKey); if (live && b) setBoard(b); } catch { /* start empty */ }
      }
      if (live) setLoaded(true);
    })();
    return () => { live = false; };
  }, [clusterId, adapter.storageKey]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!loaded || !clusterId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveBoard(clusterId, adapter.storageKey, board).catch(() => {}); }, 700);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [board, loaded, clusterId, adapter.storageKey]);

  const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `t${Date.now()}${Math.round(performance.now())}`);

  // ---- make a new piece ------------------------------------------------------------------
  const make = useCallback(async () => {
    if (busyAt) return;
    const pos = nextRootPosition(board, M);
    setBusyAt({ ...pos, label: 'Making…' });
    try {
      const content = await adapter.generate({ prompt: prompt.trim(), kindId: kind });
      setBoard((b) => addTile(b, { id: newId(), prompt: prompt.trim() || (adapter.kinds.find((k) => k.id === kind)?.label ?? ''), parentId: null, content, x: pos.x, y: pos.y, favorite: false, createdAt: Date.now() }));
      setPrompt('');
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not make that.'); }
    finally { setBusyAt(null); }
  }, [board, M, adapter, prompt, kind, busyAt, onToast]);

  // ---- spin a rendition from a tile ------------------------------------------------------
  const spin = useCallback(async (parentId: string, instruction: string) => {
    const parent = getTile(board, parentId);
    if (!parent || busyAt) return;
    const pos = childPosition(board, parent, M);
    setBusyAt({ ...pos, label: 'Spinning…' });
    try {
      const content = await adapter.rendition({ parent: parent.content, instruction: instruction.trim() });
      setBoard((b) => addTile(b, { id: newId(), prompt: instruction.trim() || 'rendition', parentId, content, x: pos.x, y: pos.y, favorite: false, createdAt: Date.now() }));
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not spin a rendition.'); }
    finally { setBusyAt(null); }
  }, [board, M, adapter, busyAt, onToast]);

  // ---- pointer: drag a tile, or pan the board -------------------------------------------
  const drag = useRef<{ mode: 'tile' | 'pan'; id?: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const onTilePointerDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    // A press on a hover control (open / rendition / star / delete) must NOT start a tile drag, or the
    // drag would swallow the button's click.
    if ((e.target as HTMLElement).closest('.cb-hover, button')) return;
    e.stopPropagation();
    const t = getTile(board, id); if (!t) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode: 'tile', id, sx: e.clientX, sy: e.clientY, ox: t.x, oy: t.y, moved: false };
  };
  const onStagePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.mode === 'tile' && d.id) setBoard((b) => moveTile(b, d.id!, d.ox + dx, d.oy + dy));
    else if (d.mode === 'pan') setPan({ x: d.ox + dx, y: d.oy + dy });
  };
  const onPointerUp = (e: React.PointerEvent, clickId?: string) => {
    const d = drag.current; drag.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (d && d.mode === 'tile' && !d.moved && clickId) setFocusId(clickId);
  };

  const shown = favOnly ? board.tiles.filter((t) => t.favorite) : board.tiles;
  const scale = M.w / adapter.designWidth;
  const focusTile = focusId ? getTile(board, focusId) : null;
  const favs = useMemo(() => favTiles(board), [board]);

  const doExport = () => {
    const pieces = (favs.length ? favs : board.tiles).map((t) => t.content);
    if (!pieces.length) { onToast('info', 'Make a piece first — then ⭐ the ones to print.'); return; }
    if (!adapter.renderPrint) { onToast('info', 'Nothing to export.'); return; }
    setPrinting(pieces);
    setTimeout(() => { window.print(); setTimeout(() => setPrinting(null), 300); }, 60);
  };

  const focusApi = (id: string): FocusApi<C> => ({
    update: (content) => setBoard((b) => setTileContent(b, id, content)),
    rendition: async (instruction) => { await spin(id, instruction); },
    favorite: () => setBoard((b) => toggleFavorite(b, id)),
    remove: () => { setBoard((b) => removeTile(b, id)); setFocusId(null); },
    close: () => setFocusId(null),
    isFavorite: !!getTile(board, id)?.favorite,
  });

  return (
    <div className="cb-root flex h-full w-full min-h-[560px] flex-col">
      <style>{CB_CSS}{adapter.printCss ?? ''}</style>

      {/* header + make bar */}
      <div className="cb-head">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-forge-ink">{adapter.title}</h3>
            <p className="truncate text-[11.5px] text-forge-dim">{adapter.subtitle}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setFavOnly((v) => !v)} className={cn('cb-tool', favOnly && 'cb-tool-on')} title="Show only starred">
              <Star size={13} className={favOnly ? 'fill-current' : ''} /> {favs.length}
            </button>
            <button onClick={() => setPan({ x: 0, y: 0 })} className="cb-tool" title="Recenter"><Crosshair size={13} /></button>
            <button onClick={doExport} className="cb-tool" title="Print the starred cards"><Printer size={13} /> Print</button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {adapter.kinds.map((k) => (
            <button key={k.id} onClick={() => setKind(k.id)} title={k.hint}
              className={cn('cb-chip', kind === k.id && 'cb-chip-on')}>{k.emoji} {k.label}</button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input value={prompt} onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void make(); }}
            placeholder={adapter.promptPlaceholder}
            className="flex-1 rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm text-forge-ink placeholder:text-forge-dim/50 focus:border-forge-ember/60 focus:outline-none" />
          <Button variant="primary" size="md" onClick={() => void make()} disabled={!!busyAt}>
            {busyAt ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Make
          </Button>
        </div>
        {adapter.banner && <div className="mt-1.5 text-[11px] text-forge-dim">{adapter.banner}</div>}
      </div>

      {/* the spread */}
      <div className="cb-stage" onPointerDown={onStagePointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        {board.tiles.length === 0 && !busyAt && (
          <div className="cb-empty">
            <Wand2 size={22} className="text-forge-ember/70" />
            <p className="mt-2 max-w-xs text-center text-[13px] text-forge-dim">{adapter.emptyHint}</p>
          </div>
        )}
        <div className="cb-plane" style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}>
          {/* lineage connectors */}
          <svg className="cb-links" width="100%" height="100%">
            {shown.map((t) => {
              const p = t.parentId ? getTile(board, t.parentId) : null;
              if (!p || (favOnly && !p.favorite)) return null;
              return <line key={`l-${t.id}`} x1={p.x + M.w} y1={p.y + M.h / 2} x2={t.x} y2={t.y + M.h / 2} className="cb-link" />;
            })}
          </svg>

          {shown.map((t) => (
            <div key={t.id} className="cb-tile" style={{ left: t.x, top: t.y, width: M.w }}
              onPointerDown={(e) => onTilePointerDown(e, t.id)} onPointerMove={onPointerMove} onPointerUp={(e) => onPointerUp(e, t.id)}>
              <div className="cb-card" style={{ width: M.w, height: M.h }}>
                <div style={{ position: 'absolute', left: 0, top: 0, width: adapter.designWidth, transformOrigin: 'top left', transform: `scale(${scale})`, pointerEvents: 'none' }}>
                  {adapter.renderThumb(t.content)}
                </div>
                {t.parentId && <span className="cb-badge">rendition</span>}
                {t.favorite && <span className="cb-fav"><Star size={12} className="fill-current" /></span>}
                <div className="cb-hover">
                  <button className="cb-mini" title="Open & edit" onClick={(e) => { e.stopPropagation(); setFocusId(t.id); }}><Maximize2 size={13} /></button>
                  <button className="cb-mini" title="Make a rendition" onClick={(e) => { e.stopPropagation(); setRenditionFor(t.id); setRenditionText(''); }}><Wand2 size={13} /></button>
                  <button className={cn('cb-mini', t.favorite && 'text-amber-300')} title="Star" onClick={(e) => { e.stopPropagation(); setBoard((b) => toggleFavorite(b, t.id)); }}><Star size={13} className={t.favorite ? 'fill-current' : ''} /></button>
                  <button className="cb-mini" title="Delete" onClick={(e) => { e.stopPropagation(); setBoard((b) => removeTile(b, t.id)); }}><Trash2 size={13} /></button>
                </div>
              </div>
              <p className="cb-cap" title={t.prompt}>{adapter.captionOf(t.content)}</p>
            </div>
          ))}

          {busyAt && (
            <div className="cb-tile" style={{ left: busyAt.x, top: busyAt.y, width: M.w }}>
              <div className="cb-card cb-ghost" style={{ width: M.w, height: M.h }}>
                <Loader2 size={18} className="animate-spin text-forge-ember" />
                <span className="mt-1.5 text-[11px] text-forge-dim">{busyAt.label}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* rendition prompt (from a tile's ⟳) */}
      {renditionFor && (
        <Overlay onClose={() => setRenditionFor(null)} z={80}>
          <div className="cb-modal" onPointerDown={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-forge-ink"><Wand2 size={15} className="text-forge-ember" /> Make a rendition</div>
            <p className="mb-2 text-[12px] text-forge-dim">Tell it what to change — a new card appears next to this one, and the original stays.</p>
            <input autoFocus value={renditionText} onChange={(e) => setRenditionText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && renditionText.trim()) { const id = renditionFor; setRenditionFor(null); void spin(id, renditionText); } }}
              placeholder="e.g. warmer sunset · call it “Just Sold” · minimal, more white space"
              className="w-full rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setRenditionFor(null)}>Cancel</Button>
              <Button variant="primary" size="sm" disabled={!renditionText.trim()} onClick={() => { const id = renditionFor; setRenditionFor(null); void spin(id, renditionText); }}><Wand2 size={13} /> Spin it</Button>
            </div>
          </div>
        </Overlay>
      )}

      {/* focus one — the adapter renders the big editable view */}
      {focusTile && (
        <Overlay onClose={() => setFocusId(null)} z={78}>
          <div className="cb-focus" onPointerDown={(e) => e.stopPropagation()}>
            <button className="cb-close" onClick={() => setFocusId(null)} title="Close"><X size={16} /></button>
            {adapter.renderFocus(focusTile.content, focusApi(focusTile.id))}
          </div>
        </Overlay>
      )}

      {/* hidden print sheet */}
      {printing && adapter.renderPrint && (
        <div className="cb-print">{printing.map((c, i) => <div key={i} className="cb-print-piece">{adapter.renderPrint!(c)}</div>)}</div>
      )}
    </div>
  );
}

const CB_CSS = `
.cb-head{padding:12px 14px;border-bottom:1px solid var(--forge-border,#3a2f25)}
.cb-tool{display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:4px 8px;border-radius:8px;border:1px solid var(--forge-border,#3a2f25);color:var(--forge-dim,#a99b90);background:transparent}
.cb-tool:hover{color:var(--forge-ink,#f0e6da);border-color:rgba(255,138,61,.5)}
.cb-tool-on{color:#f4b942;border-color:rgba(244,185,66,.5);background:rgba(244,185,66,.08)}
.cb-chip{font-size:11px;padding:4px 9px;border-radius:999px;border:1px solid var(--forge-border,#3a2f25);color:var(--forge-dim,#a99b90);background:transparent;white-space:nowrap}
.cb-chip:hover{color:var(--forge-ink,#f0e6da)}
.cb-chip-on{color:#1a0e04;background:linear-gradient(180deg,#ffb066,#ff8a3d);border-color:transparent;font-weight:600}
.cb-stage{position:relative;flex:1;overflow:hidden;background:
  radial-gradient(circle at 1px 1px, rgba(255,255,255,.05) 1px, transparent 0) 0 0/24px 24px,
  var(--forge-bg,#14100c);cursor:grab;touch-action:none}
.cb-stage:active{cursor:grabbing}
.cb-plane{position:absolute;inset:0}
.cb-links{position:absolute;inset:0;overflow:visible;pointer-events:none}
.cb-link{stroke:rgba(255,138,61,.28);stroke-width:1.5;stroke-dasharray:3 4}
.cb-tile{position:absolute;cursor:grab}
.cb-tile:active{cursor:grabbing}
.cb-card{position:relative;overflow:hidden;border-radius:12px;border:1px solid var(--forge-border,#3a2f25);box-shadow:0 6px 18px rgba(0,0,0,.35);background:#0f0b07;display:flex;align-items:center;justify-content:center;flex-direction:column;transition:box-shadow .15s,transform .15s}
.cb-tile:hover .cb-card{box-shadow:0 10px 28px rgba(0,0,0,.5);border-color:rgba(255,138,61,.45)}
.cb-ghost{gap:2px}
.cb-badge{position:absolute;top:6px;left:6px;font-size:9px;padding:1px 6px;border-radius:999px;background:rgba(255,138,61,.9);color:#1a0e04;font-weight:600}
.cb-fav{position:absolute;top:6px;right:6px;color:#f4b942}
.cb-hover{position:absolute;bottom:0;left:0;right:0;display:flex;gap:4px;justify-content:center;padding:5px;background:linear-gradient(to top,rgba(10,7,4,.92),transparent);opacity:0;transition:opacity .15s}
.cb-tile:hover .cb-hover{opacity:1}
.cb-mini{display:grid;place-items:center;height:26px;width:26px;border-radius:7px;color:#f0e6da;background:rgba(255,255,255,.1)}
.cb-mini:hover{background:rgba(255,138,61,.35)}
.cb-cap{margin-top:5px;font-size:10.5px;color:var(--forge-dim,#a99b90);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center}
.cb-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none}
.cb-modal{width:min(92vw,440px);border-radius:14px;border:1px solid var(--forge-border,#3a2f25);background:var(--forge-panel,#1c1710);padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.cb-focus{position:relative;width:min(94vw,560px);max-height:90vh;overflow:auto;border-radius:16px;border:1px solid var(--forge-border,#3a2f25);background:var(--forge-panel,#1c1710);padding:18px;box-shadow:0 24px 70px rgba(0,0,0,.55)}
.cb-close{position:absolute;top:10px;right:10px;display:grid;place-items:center;height:30px;width:30px;border-radius:8px;color:var(--forge-dim,#a99b90);background:rgba(255,255,255,.06)}
.cb-close:hover{color:var(--forge-ink,#f0e6da);background:rgba(255,255,255,.12)}
.cb-print{position:fixed;left:-99999px;top:0}
@media print{.cb-print{position:static !important;left:0 !important}}
`;
