// src/lib/garvis/creativeBoard.ts
// THE CREATIVE BOARD — a spatial workspace model, not a linear form. Every channel (postcards, social,
// branding/logos, …) mounts the SAME board: you make one piece, then have another idea and make
// another; they sit side-by-side so you can compare; you click one and tell it what to change to spawn
// a rendition (a child that keeps its parent, so the family lines up); you drag to organize, star the
// keepers, then export/send. This module is the pure, channel-agnostic core: the tile model, lineage,
// immutable mutators, and the non-overlapping layout math. Deterministic — verified by creativeBoard.verify.ts.
//
// The board holds generic `content` (a MailerSpec for postcards, a post mock for social, an image for a
// logo). The per-channel ADAPTER (postcardBoard.ts, …) knows how to make/rendition/render that content;
// this core never looks inside it. Ids + timestamps are supplied by the caller (the UI) so this stays pure.

/** One piece on the board. `content` is channel-specific and opaque to this core. */
export interface BoardTile<C = unknown> {
  id: string;
  prompt: string;          // the idea / instruction that made it (shown as the tile's caption)
  parentId: string | null; // a rendition points to the tile it was spun from — the lineage
  content: C;
  x: number;
  y: number;
  favorite: boolean;
  createdAt: number;       // caller-stamped (epoch ms); kept out of the pure layout math
  group?: string;          // a named sub-collection; ARCHIVE_GROUP means archived (out of the main view)
}

export interface Board<C = unknown> {
  tiles: BoardTile<C>[];
  groups?: string[];       // the owner's named groups (persisted so an empty group survives)
}

/** Reserved group meaning "archived" — kept out of every normal view but never deleted (findable). */
export const ARCHIVE_GROUP = '__archive__';
/** A board view: everything (minus archived), a named group, or the archive. */
export type BoardView = 'all' | typeof ARCHIVE_GROUP | (string & {});

/** How big a tile is and how new tiles flow — supplied by the channel adapter (postcards are 9:6, a
 *  logo is square), so the same layout math spaces any channel's cards without overlap. */
export interface BoardMetrics {
  w: number;
  h: number;
  gap: number;
  cols: number;   // how many root tiles per row before wrapping
  pad?: number;   // board inset (default 40)
}

export const emptyBoard = <C>(): Board<C> => ({ tiles: [] });

export function getTile<C>(board: Board<C>, id: string): BoardTile<C> | null {
  return board.tiles.find((t) => t.id === id) ?? null;
}

/** Every tile spun (directly) from `id`. */
export function childrenOf<C>(board: Board<C>, id: string): BoardTile<C>[] {
  return board.tiles.filter((t) => t.parentId === id);
}

/** The lineage chain root→…→tile (a rendition's ancestry), oldest first. */
export function lineageOf<C>(board: Board<C>, id: string): BoardTile<C>[] {
  const chain: BoardTile<C>[] = [];
  let cur = getTile(board, id);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur);
    cur = cur.parentId ? getTile(board, cur.parentId) : null;
  }
  return chain;
}

// ---- immutable mutators (return a new board; the UI holds board in state) ------------------

export function addTile<C>(board: Board<C>, tile: BoardTile<C>): Board<C> {
  return { ...board, tiles: [...board.tiles, tile] };
}

export function patchTile<C>(board: Board<C>, id: string, patch: Partial<BoardTile<C>>): Board<C> {
  return { ...board, tiles: board.tiles.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
}

/** Update just a tile's channel content (an edit in the focus view). */
export function setTileContent<C>(board: Board<C>, id: string, content: C): Board<C> {
  return patchTile(board, id, { content });
}

export function moveTile<C>(board: Board<C>, id: string, x: number, y: number): Board<C> {
  return patchTile(board, id, { x, y });
}

export function toggleFavorite<C>(board: Board<C>, id: string): Board<C> {
  const t = getTile(board, id);
  return t ? patchTile(board, id, { favorite: !t.favorite }) : board;
}

/** Remove a tile. Its renditions are kept but re-parented to null (orphaned, never lost). */
export function removeTile<C>(board: Board<C>, id: string): Board<C> {
  return {
    ...board,
    tiles: board.tiles
      .filter((t) => t.id !== id)
      .map((t) => (t.parentId === id ? { ...t, parentId: null } : t)),
  };
}

export function favorites<C>(board: Board<C>): BoardTile<C>[] {
  return board.tiles.filter((t) => t.favorite);
}

// ---- groups + archive: keep the main board from drowning, never lose anything --------------

export function groupsOf<C>(board: Board<C>): string[] {
  return board.groups ?? [];
}

/** Create a named group (idempotent; the reserved archive name is rejected). */
export function addGroup<C>(board: Board<C>, name: string): Board<C> {
  const n = name.trim();
  if (!n || n === ARCHIVE_GROUP || (board.groups ?? []).includes(n)) return board;
  return { ...board, groups: [...(board.groups ?? []), n] };
}

/** Move a tile to a group (null → back to the main, ungrouped space; ARCHIVE_GROUP → archived). */
export function setTileGroup<C>(board: Board<C>, id: string, group: string | null): Board<C> {
  return patchTile(board, id, { group: group ?? undefined });
}

/** The tiles a view shows: 'all' = everything except archived; ARCHIVE_GROUP = only archived; a group
 *  name = only that group. So nothing is ever deleted — archived work is just one view away. */
export function viewTiles<C>(board: Board<C>, view: BoardView): BoardTile<C>[] {
  if (view === ARCHIVE_GROUP) return board.tiles.filter((t) => t.group === ARCHIVE_GROUP);
  if (view === 'all') return board.tiles.filter((t) => t.group !== ARCHIVE_GROUP);
  return board.tiles.filter((t) => t.group === view);
}

// ---- layout: where a new tile lands so nothing overlaps -------------------------------------

const PAD = (m: BoardMetrics) => m.pad ?? 40;

/** Grid slot for the next ROOT tile (a fresh "make", not a rendition) — flows left→right, wrapping.
 *  Occupancy-aware: skips any slot already covered by a tile (e.g. after deletes or renditions), so a
 *  fresh card never lands on top of an existing one. Archived tiles don't count (they're out of the
 *  visible board), and `extra` boxes (in-flight "making…" ghosts) DO — so firing several at once spreads
 *  them out instead of stacking. */
export function nextRootPosition<C>(board: Board<C>, m: BoardMetrics, extra: { x: number; y: number }[] = []): { x: number; y: number } {
  const cols = Math.max(1, m.cols);
  const active = board.tiles.filter((t) => t.group !== ARCHIVE_GROUP);
  const occ = [...active.map((t) => ({ x: t.x, y: t.y })), ...extra];
  let idx = active.filter((t) => t.parentId === null).length;
  for (let guard = 0; guard < 400; guard++, idx++) {
    const x = PAD(m) + (idx % cols) * (m.w + m.gap);
    const y = PAD(m) + Math.floor(idx / cols) * (m.h + m.gap);
    if (!occ.some((o) => overlaps(x, y, o.x, o.y, m))) return { x, y };
  }
  return { x: PAD(m), y: PAD(m) };
}

/** Overlap test: do two w×h boxes at these top-lefts intersect (with a little slack)? */
function overlaps(ax: number, ay: number, bx: number, by: number, m: BoardMetrics): boolean {
  return Math.abs(ax - bx) < m.w - 1 && Math.abs(ay - by) < m.h - 1;
}

/** Where a rendition of `parent` lands: just to its right (the family reads left→right); if that spot
 *  is taken, step down until it's clear, so a lineage stacks neatly beside its parent. Archived tiles are
 *  ignored; `extra` boxes (in-flight ghosts) are avoided so concurrent renditions don't collide. */
export function childPosition<C>(board: Board<C>, parent: BoardTile<C>, m: BoardMetrics, extra: { x: number; y: number }[] = []): { x: number; y: number } {
  const active = board.tiles.filter((t) => t.group !== ARCHIVE_GROUP);
  const occ = [...active.map((t) => ({ x: t.x, y: t.y })), ...extra];
  const x = parent.x + m.w + m.gap;
  let y = parent.y;
  let guard = 0;
  while (occ.some((o) => overlaps(x, y, o.x, o.y, m)) && guard < 200) {
    y += m.h + m.gap;
    guard++;
  }
  return { x, y };
}

/** Re-lay every tile into a clean grid ordered by time (newest first by default) — the "tidy" action,
 *  so a board that's grown to hundreds of generations snaps back to a scannable, time-sorted grid.
 *  Flattens lineage layout by design (a tidy grid, not families); content + favorites are preserved. */
export function tidyByTime<C>(board: Board<C>, m: BoardMetrics, order: 'desc' | 'asc' = 'desc', onlyIds?: Set<string> | null): Board<C> {
  const cols = Math.max(1, m.cols);
  const pad = PAD(m);
  const target = onlyIds ? board.tiles.filter((t) => onlyIds.has(t.id)) : board.tiles;
  const sorted = [...target].sort((a, b) => (order === 'desc' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt));
  const pos = new Map(sorted.map((t, i) => [t.id, { x: pad + (i % cols) * (m.w + m.gap), y: pad + Math.floor(i / cols) * (m.h + m.gap) }]));
  const tiles = board.tiles.map((t) => (pos.has(t.id) ? { ...t, ...pos.get(t.id)! } : t));
  return { ...board, tiles };
}

/** The board's content bounds (for centering / scroll extents), padded. */
export function boardExtent<C>(board: Board<C>, m: BoardMetrics): { w: number; h: number } {
  if (board.tiles.length === 0) return { w: m.w + PAD(m) * 2, h: m.h + PAD(m) * 2 };
  const maxX = Math.max(...board.tiles.map((t) => t.x + m.w));
  const maxY = Math.max(...board.tiles.map((t) => t.y + m.h));
  return { w: maxX + PAD(m), h: maxY + PAD(m) };
}
