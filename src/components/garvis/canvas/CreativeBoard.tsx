// src/components/garvis/canvas/CreativeBoard.tsx
// THE CREATIVE BOARD SHELL — the spatial workspace Riley asked for, generic over any channel. You make
// one piece, then have another idea and make another; they land side-by-side so you can compare; you
// click one and tell it what to change to spawn a rendition (a child that keeps its parent); you drag to
// organize, star the keepers, and print/export. This file owns the SPREAD (pan, drag, focus, make-bar,
// lineage, favorites, persistence); a per-channel ADAPTER supplies what a tile IS and how to make /
// rendition / render it. Postcards are the first adapter (PostcardBoard.tsx); social + branding reuse
// this shell unchanged.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Sparkles, Loader2, Star, Wand2, Maximize2, Trash2, Crosshair, Printer, X, Search, LayoutGrid, Archive, Undo2, FolderPlus, Folder, ZoomIn, ZoomOut, Maximize, CheckSquare } from 'lucide-react';
import {
  emptyBoard, addTile, moveTile, removeTile, toggleFavorite, setTileContent, getTile,
  nextRootPosition, childPosition, favorites as favTiles, tidyByTime, boardExtent,
  addGroup, setTileGroup, viewTiles, groupsOf, ARCHIVE_GROUP,
  type Board, type BoardMetrics, type BoardView,
} from '../../../lib/garvis/creativeBoard';
import { loadBoard, saveBoard } from '../../../lib/garvis/clusterState';
import { Overlay } from '../../ui/Overlay';
import { Button } from '../../ui';
import { cn } from '../../../lib/utils';

type Toast = (k: 'success' | 'error' | 'info', m: string) => void;

export interface BoardKind { id: string; label: string; emoji: string; hint: string }

export interface FocusApi<C> {
  /** The focused tile's stable id — for per-tile artifacts (e.g. a mail-run design slug). */
  id: string;
  /** Replace the tile's content, or apply a functional updater against its LATEST content — the
   *  functional form is what a slow async op (image gen) must use so it doesn't clobber edits made
   *  while it was in flight. */
  update: (content: C | ((prev: C) => C)) => void;
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
  extraControls?: ReactNode;          // channel-specific make-bar controls (e.g. a platform selector)
  captionOf: (content: C) => string;
  /** The editor's verdict for AI-written tiles — rendered as a score badge (hover = the notes). */
  qualityOf?: (content: C) => { score: number; notes: string } | null;
  generate: (args: { prompt: string; kindId: string | null }) => Promise<C>;
  rendition: (args: { parent: C; instruction: string }) => Promise<C>;
  renderThumb: (content: C) => ReactNode;
  renderFocus: (content: C, api: FocusApi<C>) => ReactNode;
  renderPrint?: (content: C) => ReactNode;   // full print-size render (for Export)
  printCss?: string;                          // @page + hide rules for Export
  searchText?: (content: C) => string;        // extra searchable text (beyond the tile's prompt)
  /** REFERENCES — the operator's real photos, logo, palette. Shown in a rail beside the work so
   *  creating never means leaving to go find what the business actually looks like. */
  references?: { label: string; url?: string | null; swatches?: string[] }[];
}

export function CreativeBoard<C>({ adapter, clusterId, onToast, reloadNonce = 0 }: {
  adapter: CreativeBoardAdapter<C>; clusterId: string | null; onToast: Toast;
  /** Bump to re-run hydration when something OUTSIDE this component wrote to the board server-side
   *  (e.g. the standing-worker's run-now idea drop) — the id-deduped merge folds the new tiles in
   *  without losing client-only ones, and the next debounced save persists the union. */
  reloadNonce?: number;
}) {
  const M = adapter.metrics;
  const [board, setBoard] = useState<Board<C>>(() => emptyBoard<C>());
  // Persist ONLY after the DB load for the CURRENT clusterId has resolved — never before, or a debounced
  // save can clobber (or duplicate) already-saved tiles when the cluster id resolves late (null → real).
  const hydratedFor = useRef<string | null>(null);
  const [kind, setKind] = useState<string | null>(adapter.kinds[0]?.id ?? null);
  const [prompt, setPrompt] = useState('');
  // Several pieces can generate AT ONCE (make one, then another) — each is an in-flight ghost, and the
  // ref mirrors the list so rapid-fire makes read the latest occupancy synchronously (no stacking).
  const [busy, setBusy] = useState<{ id: string; x: number; y: number; label: string }[]>([]);
  const busyRef = useRef<{ id: string; x: number; y: number; label: string }[]>([]);
  const boardRef = useRef(board); boardRef.current = board;
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [renditionFor, setRenditionFor] = useState<string | null>(null);
  const [renditionText, setRenditionText] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<BoardView>('all');
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupText, setNewGroupText] = useState('');
  const [newGroupTileId, setNewGroupTileId] = useState<string | null>(null);
  const [newGroupBulk, setNewGroupBulk] = useState(false);   // the new group is for the current multi-selection
  const [refsOpen, setRefsOpen] = useState(true);            // the references rail (real photos + brand)
  const [printing, setPrinting] = useState<C[] | null>(null);

  // ---- load + persist (debounced) --------------------------------------------------------
  useEffect(() => {
    let live = true;
    void (async () => {
      if (clusterId) {
        try {
          const b = await loadBoard<C>(clusterId, adapter.storageKey);
          // MERGE, don't clobber: keep any tiles the user made before this async load (or before the
          // cluster id resolved), but NEVER duplicate a tile the load already returned (id-deduped).
          if (live && b) setBoard((cur) => {
            if (!cur.tiles.length) return b;
            const have = new Set(b.tiles.map((t) => t.id));
            const extra = cur.tiles.filter((t) => !have.has(t.id));
            return extra.length ? { ...b, tiles: [...b.tiles, ...extra] } : b;
          });
        } catch { /* start empty */ }
        // Only NOW is this cluster hydrated — this is the gate that lets saves begin. Setting it after
        // the merge means a board change from the merge itself triggers the first (correct) save.
        if (live) hydratedFor.current = clusterId;
      }
    })();
    return () => { live = false; };
  }, [clusterId, adapter.storageKey, reloadNonce]);

  // Keep the latest save target so the unmount flush can persist a still-pending change.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSave = useRef<{ clusterId: string | null; key: string; board: Board<C> }>({ clusterId, key: adapter.storageKey, board });
  latestSave.current = { clusterId, key: adapter.storageKey, board };
  useEffect(() => {
    if (!clusterId || hydratedFor.current !== clusterId) return;   // never persist a not-yet-hydrated cluster
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { saveTimer.current = null; void saveBoard(clusterId, adapter.storageKey, board).catch(() => {}); }, 700);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [board, clusterId, adapter.storageKey]);
  // Flush a still-pending debounced save when the board overlay closes/unmounts, so a last-second edit
  // (a filled [EDIT] hole, a star, a drag) isn't silently dropped by the cleanup's clearTimeout — but
  // only for a cluster that actually hydrated, so we never flush a pre-load board over saved work.
  useEffect(() => () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current); saveTimer.current = null;
      const s = latestSave.current;
      if (s.clusterId && hydratedFor.current === s.clusterId) void saveBoard(s.clusterId, s.key, s.board).catch(() => {});
    }
  }, []);

  const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `t${Date.now()}${Math.round(performance.now())}`);

  const MAX_CONCURRENT = 6;
  const addGhost = (g: { id: string; x: number; y: number; label: string }) => { busyRef.current = [...busyRef.current, g]; setBusy(busyRef.current); };
  const dropGhost = (id: string) => { busyRef.current = busyRef.current.filter((x) => x.id !== id); setBusy(busyRef.current); };
  const ghostBoxes = () => busyRef.current.map((g) => ({ x: g.x, y: g.y }));

  // ---- make a new piece — non-blocking, several can run at once ---------------------------
  const make = useCallback(async () => {
    if (busyRef.current.length >= MAX_CONCURRENT) { onToast('info', 'A few are already generating — give them a second.'); return; }
    const p = prompt.trim();
    const gid = newId();
    const pos = nextRootPosition(boardRef.current, M, ghostBoxes());   // dodge existing tiles AND in-flight ghosts
    addGhost({ id: gid, x: pos.x, y: pos.y, label: 'Making…' });
    setPrompt('');               // clear immediately so the next idea can be typed while this one renders
    setFavOnly(false);           // the new (unstarred) card must be visible, not hidden by the ⭐ filter
    try {
      const content = await adapter.generate({ prompt: p, kindId: kind });
      const group = view !== 'all' && view !== ARCHIVE_GROUP ? view : undefined;   // joins the group in view, never the archive
      setBoard((b) => addTile(b, { id: newId(), prompt: p || (adapter.kinds.find((k) => k.id === kind)?.label ?? ''), parentId: null, content, x: pos.x, y: pos.y, favorite: false, createdAt: Date.now(), group }));
      if (view === ARCHIVE_GROUP) setView('all');
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not make that.'); }
    finally { dropGhost(gid); }
  }, [M, adapter, prompt, kind, view, onToast]);

  // ---- spin a rendition from a tile — also non-blocking ----------------------------------
  const spin = useCallback(async (parentId: string, instruction: string) => {
    const parent = getTile(boardRef.current, parentId);
    if (!parent) return;
    if (busyRef.current.length >= MAX_CONCURRENT) { onToast('info', 'A few are already generating — give them a second.'); return; }
    const gid = newId();
    const pos = childPosition(boardRef.current, parent, M, ghostBoxes());
    addGhost({ id: gid, x: pos.x, y: pos.y, label: 'Spinning…' });
    setFavOnly(false);
    try {
      const content = await adapter.rendition({ parent: parent.content, instruction: instruction.trim() });
      setBoard((b) => addTile(b, { id: newId(), prompt: instruction.trim() || 'rendition', parentId, content, x: pos.x, y: pos.y, favorite: false, createdAt: Date.now(), group: parent.group }));
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not spin a rendition.'); }
    finally { dropGhost(gid); }
  }, [M, adapter, onToast]);

  // ---- zoom + fit-to-view ----------------------------------------------------------------
  const clampZoom = (z: number) => Math.min(1.6, Math.max(0.35, z));
  const zoomBy = (factor: number) => setZoom((z) => clampZoom(z * factor));
  const fit = useCallback(() => {
    const el = stageRef.current; if (!el) return;
    const ext = boardExtent(board, M);
    const z = clampZoom(Math.min(el.clientWidth / ext.w, el.clientHeight / ext.h, 1));
    setZoom(z); setPan({ x: 0, y: 0 });
  }, [board, M]);
  const recenter = () => { setPan({ x: 0, y: 0 }); setZoom(1); };
  // Wheel zooms toward the cursor (non-passive so we can preventDefault the page from scrolling).
  useEffect(() => {
    const el = stageRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      setZoom((z) => {
        const nz = clampZoom(z * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
        setPan((p) => ({ x: cx - (cx - p.x) * (nz / z), y: cy - (cy - p.y) * (nz / z) }));
        return nz;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ---- the inspector dock is non-modal, so it provides its own Esc-to-close. Capture-phase +
  // stopPropagation so Esc closes the DOCK first, never the whole board workspace behind it. ----
  useEffect(() => {
    if (!focusId) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setFocusId(null); } };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [focusId]);
  // When the dock opens, make sure the focused card sits in the still-visible half of the stage —
  // the inspector must never cover the very card being edited.
  useEffect(() => {
    if (!focusId || !stageRef.current) return;
    const t = getTile(boardRef.current, focusId); if (!t) return;
    const W = stageRef.current.clientWidth;
    const dockW = Math.min(480, W * 0.5);
    setZoom((z) => {
      setPan((p) => {
        const sx = t.x * z + p.x;                                  // tile's on-screen x
        const visible = W - dockW;
        if (sx > visible - M.w * z - 24 || sx < 0) return { ...p, x: Math.max(0, (visible - M.w * z) / 2) - t.x * z };
        return p;
      });
      return z;
    });
  }, [focusId, M.w]);

  // ---- multi-select for bulk organize (shift/⌘-click a tile) -----------------------------
  const toggleSelect = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const bulkGroup = (g: string | null) => { setBoard((b) => { let nb = b; selected.forEach((id) => { nb = setTileGroup(nb, id, g); }); return nb; }); setSelected(new Set()); };

  // ---- pointer: drag a tile, or pan the board -------------------------------------------
  const drag = useRef<{ mode: 'tile' | 'pan'; id?: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const onTilePointerDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    // A press on a hover control (open / rendition / star / delete) must NOT start a tile drag, or the
    // drag would swallow the button's click.
    if ((e.target as HTMLElement).closest('.cb-hover, button')) { e.stopPropagation(); return; }
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
    // A tile's coords are in board space; a screen drag of dx maps to dx/zoom on the board.
    if (d.mode === 'tile' && d.id) setBoard((b) => moveTile(b, d.id!, d.ox + dx / zoom, d.oy + dy / zoom));
    else if (d.mode === 'pan') setPan({ x: d.ox + dx, y: d.oy + dy });
  };
  const onPointerUp = (e: React.PointerEvent, clickId?: string) => {
    const d = drag.current; drag.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (d && d.mode === 'tile' && !d.moved && clickId) {
      // shift / ⌘ / ctrl-click toggles selection for bulk organize; a plain click opens the focus view.
      if (e.shiftKey || e.metaKey || e.ctrlKey) toggleSelect(clickId);
      else setFocusId(clickId);
    }
  };

  const q = search.trim().toLowerCase();
  const viewBase = viewTiles(board, view);
  const base = favOnly ? viewBase.filter((t) => t.favorite) : viewBase;
  const shown = q ? base.filter((t) => `${t.prompt} ${adapter.searchText ? adapter.searchText(t.content) : ''}`.toLowerCase().includes(q)) : base;
  const scale = M.w / adapter.designWidth;
  const focusTile = focusId ? getTile(board, focusId) : null;
  const favs = useMemo(() => favTiles(board), [board]);
  const groups = groupsOf(board);

  const submitNewGroup = () => {
    const name = newGroupText.trim();
    if (!name) return;
    const tileId = newGroupTileId;
    const bulkIds = newGroupBulk ? [...selected] : [];
    setBoard((b) => {
      let nb = addGroup(b, name);
      if (tileId) nb = setTileGroup(nb, tileId, name);
      bulkIds.forEach((id) => { nb = setTileGroup(nb, id, name); });
      return nb;
    });
    if (newGroupBulk) setSelected(new Set());
    if (!tileId && !newGroupBulk) setView(name);   // a fresh empty group jumps you into it
    setNewGroupOpen(false); setNewGroupTileId(null); setNewGroupBulk(false);
  };

  const doExport = () => {
    const pieces = (favs.length ? favs : board.tiles).map((t) => t.content);
    if (!pieces.length) { onToast('info', 'Make a piece first — then ⭐ the ones to print.'); return; }
    if (!adapter.renderPrint) { onToast('info', 'Nothing to export.'); return; }
    setPrinting(pieces);
    // give the print pieces (incl. their async-rendered QR data URLs) a beat to paint before printing.
    setTimeout(() => { window.print(); setTimeout(() => setPrinting(null), 300); }, 350);
  };

  const focusApi = (id: string): FocusApi<C> => ({
    id,
    update: (arg) => setBoard((b) => {
      const t = getTile(b, id);
      if (!t) return b;
      const next = typeof arg === 'function' ? (arg as (p: C) => C)(t.content) : arg;
      return setTileContent(b, id, next);
    }),
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
            <span className="cb-searchwrap"><Search size={12} className="text-forge-dim" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="cb-search" /></span>
            <button onClick={() => setFavOnly((v) => !v)} className={cn('cb-tool', favOnly && 'cb-tool-on')} title="Show only starred">
              <Star size={13} className={favOnly ? 'fill-current' : ''} /> {favs.length}
            </button>
            <button onClick={() => { setBoard((b) => tidyByTime(b, M, 'desc', new Set(viewTiles(b, view).map((t) => t.id)))); setPan({ x: 0, y: 0 }); setZoom(1); }} className="cb-tool" title="Tidy — arrange this view newest first"><LayoutGrid size={13} /> Tidy</button>
            <button onClick={() => zoomBy(1 / 1.15)} className="cb-tool" title="Zoom out"><ZoomOut size={13} /></button>
            <button onClick={fit} className="cb-tool" title="Fit everything in view"><Maximize size={13} /></button>
            <button onClick={() => zoomBy(1.15)} className="cb-tool" title="Zoom in"><ZoomIn size={13} /></button>
            <button onClick={recenter} className="cb-tool" title="Recenter · 100%"><Crosshair size={13} /></button>
            {adapter.renderPrint && <button onClick={doExport} className="cb-tool" title="Print the starred cards"><Printer size={13} /> Print</button>}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {adapter.kinds.map((k) => (
            <button key={k.id} onClick={() => setKind(k.id)} title={k.hint}
              className={cn('cb-chip', kind === k.id && 'cb-chip-on')}>{k.emoji} {k.label}</button>
          ))}
        </div>
        {adapter.extraControls && <div className="mt-2">{adapter.extraControls}</div>}
        <div className="mt-2 flex items-center gap-2">
          <input value={prompt} onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void make(); }}
            placeholder={adapter.promptPlaceholder}
            className="flex-1 rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm text-forge-ink placeholder:text-forge-dim/50 focus:border-forge-ember/60 focus:outline-none" />
          <Button variant="primary" size="md" onClick={() => void make()}>
            {busy.length ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Make
          </Button>
        </div>
        {adapter.banner && <div className="mt-1.5 text-[11px] text-forge-dim">{adapter.banner}</div>}
      </div>

      {/* groups — sub-collections + the archive, so the main board never drowns and nothing is lost */}
      <div className="cb-groups">
        <button onClick={() => setView('all')} className={cn('cb-gchip', view === 'all' && 'cb-gchip-on')}>All · {viewTiles(board, 'all').length}</button>
        {groups.map((g) => (
          <button key={g} onClick={() => setView(g)} className={cn('cb-gchip', view === g && 'cb-gchip-on')}><Folder size={11} /> {g} · {board.tiles.filter((t) => t.group === g).length}</button>
        ))}
        <button onClick={() => { setNewGroupTileId(null); setNewGroupText(''); setNewGroupOpen(true); }} className="cb-gchip" title="New group"><FolderPlus size={12} /> New group</button>
        <span className="mx-1 h-3.5 w-px bg-forge-border" />
        <button onClick={() => setView(ARCHIVE_GROUP)} className={cn('cb-gchip', view === ARCHIVE_GROUP && 'cb-gchip-on')} title="Archived — hidden from the working board, never deleted"><Archive size={11} /> Archived · {viewTiles(board, ARCHIVE_GROUP).length}</button>
      </div>

      {/* the spread */}
      <div ref={stageRef} className="cb-stage" onPointerDown={onStagePointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        {shown.length === 0 && busy.length === 0 && (
          <div className="cb-empty">
            <Wand2 size={22} className="text-forge-ember/70" />
            <p className="mt-2 max-w-xs text-center text-[13px] text-forge-dim">{adapter.emptyHint}</p>
          </div>
        )}
        {/* When the references rail is open, the whole plane shifts right by its width — the rail must
            never sit ON TOP of cards (the first column would become unclickable). */}
        <div className="cb-plane" style={{ transform: `translate(${pan.x + (refsOpen && (adapter.references?.length ?? 0) > 0 ? 158 : 0)}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'top left' }}>
          {/* lineage connectors */}
          <svg className="cb-links" width="100%" height="100%">
            {shown.map((t) => {
              const p = t.parentId ? getTile(board, t.parentId) : null;
              if (!p || (favOnly && !p.favorite)) return null;
              return <line key={`l-${t.id}`} x1={p.x + M.w} y1={p.y + M.h / 2} x2={t.x} y2={t.y + M.h / 2} className="cb-link" />;
            })}
          </svg>

          {shown.map((t) => (
            <div key={t.id} className={cn('cb-tile', selected.has(t.id) && 'cb-tile-sel')} style={{ left: t.x, top: t.y, width: M.w }}
              onPointerDown={(e) => onTilePointerDown(e, t.id)} onPointerMove={onPointerMove} onPointerUp={(e) => onPointerUp(e, t.id)}>
              <div className="cb-card" style={{ width: M.w, height: M.h }}>
                <div style={{ position: 'absolute', left: 0, top: 0, width: adapter.designWidth, transformOrigin: 'top left', transform: `scale(${scale})`, pointerEvents: 'none' }}>
                  {adapter.renderThumb(t.content)}
                </div>
                {t.parentId && <span className="cb-badge">rendition</span>}
                {(() => { const q = adapter.qualityOf?.(t.content); return q
                  ? <span className={cn('cb-q', q.score >= 8 && 'cb-q-good')} title={`Editor: ${q.notes}`}>✓ {q.score}</span>
                  : null; })()}
                {t.favorite && <span className="cb-fav"><Star size={12} className="fill-current" /></span>}
                <div className="cb-hover">
                  <button className="cb-mini" title="Open & edit" onClick={(e) => { e.stopPropagation(); setFocusId(t.id); }}><Maximize2 size={13} /></button>
                  <button className="cb-mini" title="Make a rendition" onClick={(e) => { e.stopPropagation(); setRenditionFor(t.id); setRenditionText(''); }}><Wand2 size={13} /></button>
                  <button className={cn('cb-mini', t.favorite && 'text-amber-300')} title="Star" onClick={(e) => { e.stopPropagation(); setBoard((b) => toggleFavorite(b, t.id)); }}><Star size={13} className={t.favorite ? 'fill-current' : ''} /></button>
                  <button className="cb-mini" title={t.group === ARCHIVE_GROUP ? 'Restore' : 'Archive'} onClick={(e) => { e.stopPropagation(); setBoard((b) => setTileGroup(b, t.id, t.group === ARCHIVE_GROUP ? null : ARCHIVE_GROUP)); }}>{t.group === ARCHIVE_GROUP ? <Undo2 size={13} /> : <Archive size={13} />}</button>
                  <button className="cb-mini" title="Delete" onClick={(e) => { e.stopPropagation(); setBoard((b) => removeTile(b, t.id)); }}><Trash2 size={13} /></button>
                </div>
              </div>
              <p className="cb-cap" title={t.prompt}>{adapter.captionOf(t.content)}</p>
            </div>
          ))}

          {busy.map((g) => (
            <div key={g.id} className="cb-tile" style={{ left: g.x, top: g.y, width: M.w }}>
              <div className="cb-card cb-ghost" style={{ width: M.w, height: M.h }}>
                <Loader2 size={18} className="animate-spin text-forge-ember" />
                <span className="mt-1.5 text-[11px] text-forge-dim">{g.label}</span>
              </div>
            </div>
          ))}
        </div>

        {/* bulk organize — appears when you shift/⌘-click tiles; acts on the whole selection at once */}
        {selected.size > 0 && (
          <div className="cb-bulk" onPointerDown={(e) => e.stopPropagation()}>
            <span className="cb-bulk-n"><CheckSquare size={13} /> {selected.size} selected</span>
            <span className="cb-bulk-lbl">Move to</span>
            <button className="cb-gchip" onClick={() => bulkGroup(null)}>Main</button>
            {groups.map((g) => <button key={g} className="cb-gchip" onClick={() => bulkGroup(g)}><Folder size={11} /> {g}</button>)}
            <button className="cb-gchip" onClick={() => { setNewGroupTileId(null); setNewGroupText(''); setNewGroupBulk(true); setNewGroupOpen(true); }}><FolderPlus size={11} /> New</button>
            <span className="mx-1 h-3.5 w-px bg-forge-border" />
            <button className="cb-gchip" onClick={() => bulkGroup(ARCHIVE_GROUP)}><Archive size={11} /> Archive</button>
            <button className="cb-gchip" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        )}

        {/* THE REFERENCES RAIL — your real photos, logo, and palette live BESIDE the work, so creating
            never means leaving the board to remember what the business actually looks like. */}
        {(adapter.references?.length ?? 0) > 0 && (
          <div className="cb-refs" onPointerDown={(e) => e.stopPropagation()}>
            <button className="cb-refs-tab" onClick={() => setRefsOpen((v) => !v)} title={refsOpen ? 'Hide references' : 'References — your real photos & brand'}>
              {refsOpen ? '‹' : '🖼'}
            </button>
            {refsOpen && (
              <div className="cb-refs-body">
                <span className="cb-org-label">References</span>
                {adapter.references!.map((r, i) => (
                  <div key={i} className="cb-ref">
                    {r.url && <img src={r.url} alt={r.label} loading="lazy" />}
                    {r.swatches && r.swatches.length > 0 && (
                      <div className="cb-ref-sw">{r.swatches.map((c, j) => <span key={j} style={{ background: c }} title={c} />)}</div>
                    )}
                    <span className="cb-ref-lbl" title={r.label}>{r.label}</span>
                  </div>
                ))}
                <p className="cb-refs-note">Your real materials — what the cards are made from.</p>
              </div>
            )}
          </div>
        )}

        {/* THE INSPECTOR DOCK — the editor lives IN the board, not in a modal over it. The spread stays
            visible and pannable beside it, so editing one card never hides the others you're comparing
            against (the whole point of a spatial lab). Esc or ✕ closes; the focused card auto-pans into
            the visible half so the dock never covers the very thing being edited. */}
        {focusTile && (
          <div className="cb-dock" onPointerDown={(e) => e.stopPropagation()}>
            <button className="cb-close" onClick={() => setFocusId(null)} title="Close (Esc)"><X size={16} /></button>
            {adapter.renderFocus(focusTile.content, focusApi(focusTile.id))}
            {/* shell-provided: file this piece into a group, or archive it */}
            <div className="cb-organize">
              <span className="cb-org-label">Group</span>
              <button onClick={() => setBoard((b) => setTileGroup(b, focusTile.id, null))} className={cn('cb-gchip', !focusTile.group && 'cb-gchip-on')}>Main</button>
              {groups.map((g) => (
                <button key={g} onClick={() => setBoard((b) => setTileGroup(b, focusTile.id, g))} className={cn('cb-gchip', focusTile.group === g && 'cb-gchip-on')}><Folder size={11} /> {g}</button>
              ))}
              <button onClick={() => { setNewGroupTileId(focusTile.id); setNewGroupText(''); setNewGroupOpen(true); }} className="cb-gchip"><FolderPlus size={11} /> New</button>
              <span className="mx-1 h-3.5 w-px bg-forge-border" />
              <button onClick={() => setBoard((b) => setTileGroup(b, focusTile.id, focusTile.group === ARCHIVE_GROUP ? null : ARCHIVE_GROUP))} className="cb-gchip">
                {focusTile.group === ARCHIVE_GROUP ? <><Undo2 size={11} /> Restore</> : <><Archive size={11} /> Archive</>}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* rendition prompt (from a tile's ⟳) */}
      {renditionFor && (
        <Overlay onClose={() => setRenditionFor(null)} z={80}>
          <div className="cb-modal" onPointerDown={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-forge-ink"><Wand2 size={15} className="text-forge-ember" /> Make a rendition</div>
            <p className="mb-2 text-[12px] text-forge-dim">Tell it what to change — a new card appears next to this one, and the original stays.</p>
            <input autoFocus value={renditionText} onChange={(e) => setRenditionText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && renditionText.trim()) { const id = renditionFor; setRenditionFor(null); void spin(id, renditionText); } }}
              placeholder="e.g. warmer sunset · punchier headline · minimal, more white space"
              className="w-full rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setRenditionFor(null)}>Cancel</Button>
              <Button variant="primary" size="sm" disabled={!renditionText.trim()} onClick={() => { const id = renditionFor; setRenditionFor(null); void spin(id, renditionText); }}><Wand2 size={13} /> Spin it</Button>
            </div>
          </div>
        </Overlay>
      )}

      {/* new group */}
      {newGroupOpen && (
        <Overlay onClose={() => { setNewGroupOpen(false); setNewGroupTileId(null); setNewGroupBulk(false); }} z={82}>
          <div className="cb-modal" onPointerDown={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-forge-ink"><FolderPlus size={15} className="text-forge-ember" /> New group{newGroupBulk && selected.size > 0 ? ` · ${selected.size} selected` : ''}</div>
            <p className="mb-2 text-[12px] text-forge-dim">Name a sub-collection (a listing, a campaign) so the board stays organized as it grows.</p>
            <input autoFocus value={newGroupText} onChange={(e) => setNewGroupText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitNewGroup(); }}
              placeholder="e.g. 123 Maple St · Spring campaign"
              className="w-full rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setNewGroupOpen(false); setNewGroupTileId(null); setNewGroupBulk(false); }}>Cancel</Button>
              <Button variant="primary" size="sm" disabled={!newGroupText.trim()} onClick={submitNewGroup}><FolderPlus size={13} /> Create</Button>
            </div>
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
.cb-head{padding:12px 14px;border-bottom:1px solid rgb(var(--forge-border,38 43 58))}
.cb-tool{display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:4px 8px;border-radius:8px;border:1px solid rgb(var(--forge-border,38 43 58));color:rgb(var(--forge-dim,139 144 160));background:transparent}
.cb-tool:hover{color:rgb(var(--forge-ink,232 230 225));border-color:rgba(255,138,61,.5)}
.cb-tool-on{color:#f4b942;border-color:rgba(244,185,66,.5);background:rgba(244,185,66,.08)}
.cb-searchwrap{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:8px;border:1px solid rgb(var(--forge-border,38 43 58))}
.cb-search{background:transparent;border:none;outline:none;color:rgb(var(--forge-ink,232 230 225));font-size:11px;width:96px}
.cb-search::placeholder{color:rgb(var(--forge-dim,139 144 160))}
.cb-chip{font-size:11px;padding:4px 9px;border-radius:999px;border:1px solid rgb(var(--forge-border,38 43 58));color:rgb(var(--forge-dim,139 144 160));background:transparent;white-space:nowrap}
.cb-chip:hover{color:rgb(var(--forge-ink,232 230 225))}
.cb-chip-on{color:#1a0e04;background:linear-gradient(180deg,#ffb066,#ff8a3d);border-color:transparent;font-weight:600}
.cb-groups{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:7px 14px;border-bottom:1px solid rgb(var(--forge-border,38 43 58));background:rgb(var(--forge-panel,18 21 29))}
.cb-gchip{display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:3px 9px;border-radius:8px;border:1px solid rgb(var(--forge-border,38 43 58));color:rgb(var(--forge-dim,139 144 160));background:transparent;white-space:nowrap}
.cb-gchip:hover{color:rgb(var(--forge-ink,232 230 225));border-color:rgba(255,138,61,.5)}
.cb-gchip-on{color:#1a0e04;background:linear-gradient(180deg,#ffb066,#ff8a3d);border-color:transparent;font-weight:600}
.cb-organize{margin-top:14px;display:flex;flex-wrap:wrap;align-items:center;gap:6px;border-top:1px solid rgb(var(--forge-border,38 43 58));padding-top:12px}
.cb-org-label{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:rgb(var(--forge-dim,139 144 160))}
.cb-stage{position:relative;flex:1;overflow:hidden;background:
  radial-gradient(circle at 1px 1px, rgba(255,255,255,.05) 1px, transparent 0) 0 0/24px 24px,
  rgb(var(--forge-bg,12 14 19));cursor:grab;touch-action:none}
.cb-stage:active{cursor:grabbing}
.cb-plane{position:absolute;inset:0}
.cb-links{position:absolute;inset:0;overflow:visible;pointer-events:none}
.cb-link{stroke:rgba(255,138,61,.28);stroke-width:1.5;stroke-dasharray:3 4}
.cb-tile{position:absolute;cursor:grab}
.cb-tile:active{cursor:grabbing}
.cb-card{position:relative;overflow:hidden;border-radius:12px;border:1px solid rgb(var(--forge-border,38 43 58));box-shadow:0 6px 18px rgba(0,0,0,.35);background:#0f0b07;display:flex;align-items:center;justify-content:center;flex-direction:column;transition:box-shadow .15s,transform .15s}
.cb-tile:hover .cb-card{box-shadow:0 10px 28px rgba(0,0,0,.5);border-color:rgba(255,138,61,.45)}
.cb-tile-sel .cb-card{outline:2px solid rgb(var(--forge-ember,255 138 61));outline-offset:2px;border-color:transparent}
.cb-bulk{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);display:flex;flex-wrap:wrap;align-items:center;gap:6px;max-width:calc(100% - 24px);padding:7px 10px;border-radius:12px;border:1px solid rgb(var(--forge-border,38 43 58));background:rgba(28,23,16,.96);box-shadow:0 14px 40px rgba(0,0,0,.5);z-index:5}
.cb-bulk-n{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;color:rgb(var(--forge-ink,232 230 225))}
.cb-bulk-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:rgb(var(--forge-dim,139 144 160));margin-left:4px}
.cb-ghost{gap:2px}
.cb-badge{position:absolute;top:6px;left:6px;font-size:9px;padding:1px 6px;border-radius:999px;background:rgba(255,138,61,.9);color:#1a0e04;font-weight:600}
.cb-fav{position:absolute;top:6px;right:6px;color:#f4b942}
.cb-hover{position:absolute;bottom:0;left:0;right:0;display:flex;gap:4px;justify-content:center;padding:5px;background:linear-gradient(to top,rgba(10,7,4,.92),transparent);opacity:0;transition:opacity .15s}
.cb-tile:hover .cb-hover{opacity:1}
.cb-mini{display:grid;place-items:center;height:26px;width:26px;border-radius:7px;color:#f0e6da;background:rgba(255,255,255,.1)}
.cb-mini:hover{background:rgba(255,138,61,.35)}
.cb-cap{margin-top:5px;font-size:10.5px;color:rgb(var(--forge-dim,139 144 160));max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center}
.cb-q{position:absolute;right:6px;bottom:6px;z-index:3;font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;background:rgba(0,0,0,.55);color:rgb(var(--forge-dim,139 144 160));border:1px solid rgb(var(--forge-border,38 43 58));cursor:help}
.cb-q-good{color:#4ade80;border-color:rgba(74,222,128,.4)}
.cb-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none}
.cb-modal{width:min(92vw,440px);border-radius:14px;border:1px solid rgb(var(--forge-border,38 43 58));background:rgb(var(--forge-panel,18 21 29));padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.cb-refs{position:absolute;left:0;top:0;bottom:0;z-index:5;display:flex;align-items:flex-start;pointer-events:none}
.cb-refs-tab{pointer-events:auto;margin:8px 0 0 8px;height:30px;width:30px;border-radius:8px;display:grid;place-items:center;font-size:13px;color:rgb(var(--forge-ink,232 230 225));background:rgba(255,255,255,.08);border:1px solid rgb(var(--forge-border,38 43 58));order:2}
.cb-refs-tab:hover{border-color:rgba(255,138,61,.5)}
.cb-refs-body{pointer-events:auto;width:150px;max-height:100%;overflow:auto;display:flex;flex-direction:column;gap:9px;padding:10px;background:rgba(28,23,16,.94);border-right:1px solid rgb(var(--forge-border,38 43 58));order:1}
.cb-ref img{width:100%;border-radius:8px;display:block;border:1px solid rgba(255,255,255,.08)}
.cb-ref-lbl{display:block;margin-top:3px;font-size:10px;color:rgb(var(--forge-dim,139 144 160));overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cb-ref-sw{display:flex;gap:4px;flex-wrap:wrap}
.cb-ref-sw span{width:20px;height:20px;border-radius:6px;border:1px solid rgba(255,255,255,.15)}
.cb-refs-note{font-size:10px;line-height:1.4;color:rgb(var(--forge-dim,139 144 160))}
.cb-dock{position:absolute;top:0;right:0;bottom:0;width:min(480px,50%);overflow:auto;border-left:1px solid rgb(var(--forge-border,38 43 58));background:rgb(var(--forge-panel,18 21 29));padding:18px;box-shadow:-18px 0 44px rgba(0,0,0,.4);z-index:6;cursor:default;animation:cbDockIn .18s ease-out}
@keyframes cbDockIn{from{transform:translateX(24px);opacity:.4}to{transform:translateX(0);opacity:1}}
@media (prefers-reduced-motion: reduce){.cb-dock{animation:none}}
.cb-close{position:absolute;top:10px;right:10px;display:grid;place-items:center;height:30px;width:30px;border-radius:8px;color:rgb(var(--forge-dim,139 144 160));background:rgba(255,255,255,.06)}
.cb-close:hover{color:rgb(var(--forge-ink,232 230 225));background:rgba(255,255,255,.12)}
.cb-print{position:fixed;left:-99999px;top:0}
@media print{.cb-print{position:static !important;left:0 !important}}
`;
