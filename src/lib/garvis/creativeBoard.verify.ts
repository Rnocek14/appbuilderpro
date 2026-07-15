// Run: npx tsx src/lib/garvis/creativeBoard.verify.ts
// The spatial-board core is the substrate every channel board sits on, so its model + layout math get a
// dedicated suite: tiles add/patch/move/remove without losing renditions, lineage is correct, and new
// tiles + renditions land WITHOUT overlapping (the whole point of "spread out and compare").
import {
  emptyBoard, addTile, patchTile, setTileContent, moveTile, toggleFavorite, removeTile,
  getTile, childrenOf, lineageOf, favorites, nextRootPosition, childPosition, boardExtent, tidyByTime,
  addGroup, setTileGroup, viewTiles, groupsOf, ARCHIVE_GROUP,
  type Board, type BoardTile, type BoardMetrics,
} from './creativeBoard';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('creativeBoard.verify');

const M: BoardMetrics = { w: 260, h: 173, gap: 24, cols: 3, pad: 40 };
const tile = (id: string, parentId: string | null, x: number, y: number): BoardTile<string> =>
  ({ id, prompt: `p-${id}`, parentId, content: `c-${id}`, x, y, favorite: false, createdAt: 0 });

// --- model --------------------------------------------------------------------------------
{
  let b: Board<string> = emptyBoard();
  b = addTile(b, tile('a', null, 0, 0));
  b = addTile(b, tile('b', 'a', 300, 0));
  check('addTile + getTile', b.tiles.length === 2 && getTile(b, 'b')?.parentId === 'a');
  check('childrenOf', childrenOf(b, 'a').map((t) => t.id).join() === 'b');
  b = patchTile(b, 'a', { prompt: 'edited' });
  check('patchTile changes only the target', getTile(b, 'a')?.prompt === 'edited' && getTile(b, 'b')?.prompt === 'p-b');
  b = setTileContent(b, 'a', 'newc');
  check('setTileContent updates content', getTile(b, 'a')?.content === 'newc');
  b = moveTile(b, 'a', 99, 88);
  check('moveTile sets x/y', getTile(b, 'a')?.x === 99 && getTile(b, 'a')?.y === 88);
  b = toggleFavorite(b, 'b');
  check('toggleFavorite + favorites()', favorites(b).map((t) => t.id).join() === 'b');
}

// --- lineage ------------------------------------------------------------------------------
{
  let b: Board<string> = emptyBoard();
  b = addTile(b, tile('root', null, 0, 0));
  b = addTile(b, tile('child', 'root', 0, 0));
  b = addTile(b, tile('grand', 'child', 0, 0));
  check('lineageOf is root→…→tile, oldest first', lineageOf(b, 'grand').map((t) => t.id).join('>') === 'root>child>grand');
  check('lineageOf a root is just itself', lineageOf(b, 'root').map((t) => t.id).join() === 'root');
}

// --- remove keeps renditions (orphaned, never lost) ---------------------------------------
{
  let b: Board<string> = emptyBoard();
  b = addTile(b, tile('p', null, 0, 0));
  b = addTile(b, tile('c', 'p', 0, 0));
  b = removeTile(b, 'p');
  check('removeTile drops the tile but keeps its child', !getTile(b, 'p') && !!getTile(b, 'c'));
  check('orphaned child is re-parented to null, never lost', getTile(b, 'c')?.parentId === null);
}

// --- layout: roots flow in a grid, never overlapping --------------------------------------
{
  let b: Board<string> = emptyBoard();
  const placed: { x: number; y: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const pos = nextRootPosition(b, M);
    placed.push(pos);
    b = addTile(b, tile(`r${i}`, null, pos.x, pos.y));
  }
  // 3 columns → first row y equal, 4th tile wraps to a new row.
  check('root grid: first three share a row', placed[0].y === placed[1].y && placed[1].y === placed[2].y);
  check('root grid: 4th wraps to next row, back to col 0', placed[3].x === placed[0].x && placed[3].y > placed[0].y);
  // no two placed roots overlap
  const noOverlap = placed.every((a, i) => placed.every((c, j) => i === j || Math.abs(a.x - c.x) >= M.w - 1 || Math.abs(a.y - c.y) >= M.h - 1));
  check('root grid: no two tiles overlap', noOverlap);
}

// --- layout: a rendition lands beside its parent, stepping down if the spot is taken -------
{
  let b: Board<string> = emptyBoard();
  const parent = tile('p', null, 40, 40);
  b = addTile(b, parent);
  const c1 = childPosition(b, parent, M);
  check('child lands to the right of its parent', c1.x === parent.x + M.w + M.gap && c1.y === parent.y);
  b = addTile(b, tile('c1', 'p', c1.x, c1.y));
  const c2 = childPosition(b, parent, M);
  check('a second child steps down instead of overlapping the first', c2.x === c1.x && c2.y > c1.y);
  b = addTile(b, tile('c2', 'p', c2.x, c2.y));
  // Neither child overlaps anything.
  const all = b.tiles;
  const clean = all.every((a, i) => all.every((d, j) => i === j || Math.abs(a.x - d.x) >= M.w - 1 || Math.abs(a.y - d.y) >= M.h - 1));
  check('renditions never overlap parent or siblings', clean);
}

// --- extent grows with content ------------------------------------------------------------
{
  let b: Board<string> = emptyBoard();
  check('empty extent is one padded tile', boardExtent(b, M).w === M.w + 80 && boardExtent(b, M).h === M.h + 80);
  b = addTile(b, tile('a', null, 500, 400));
  check('extent covers the far tile + pad', boardExtent(b, M).w === 500 + M.w + 40 && boardExtent(b, M).h === 400 + M.h + 40);
}

// --- tidy: re-lay tiles into a clean time-ordered grid, no overlaps ------------------------
{
  let b: Board<string> = emptyBoard();
  b = addTile(b, { id: 'old', prompt: 'p', parentId: null, content: 'c-old', x: 500, y: 500, favorite: true, createdAt: 100 });
  b = addTile(b, { id: 'mid', prompt: 'p', parentId: null, content: 'c-mid', x: 900, y: 20, favorite: false, createdAt: 200 });
  b = addTile(b, { id: 'new', prompt: 'p', parentId: 'old', content: 'c-new', x: 40, y: 900, favorite: false, createdAt: 300 });
  const t = tidyByTime(b, M, 'desc');
  check('tidy puts the newest tile at the origin', getTile(t, 'new')?.x === M.pad && getTile(t, 'new')?.y === M.pad);
  check('tidy keeps all tiles + content + favorites + lineage', t.tiles.length === 3 && !!getTile(t, 'old')?.favorite && getTile(t, 'new')?.parentId === 'old');
  const clean = t.tiles.every((a, i) => t.tiles.every((c, j) => i === j || Math.abs(a.x - c.x) >= M.w - 1 || Math.abs(a.y - c.y) >= M.h - 1));
  check('tidy grid never overlaps', clean);
  const asc = tidyByTime(b, M, 'asc');
  check('tidy asc puts the oldest tile at the origin', getTile(asc, 'old')?.x === M.pad && getTile(asc, 'old')?.y === M.pad);
}

// --- groups + archive: sub-collections that keep the main board scannable, never lose work ---
{
  let b: Board<string> = emptyBoard();
  b = addTile(b, { id: 'a', prompt: 'p', parentId: null, content: 'a', x: 0, y: 0, favorite: false, createdAt: 1 });
  b = addTile(b, { id: 'g1', prompt: 'p', parentId: null, content: 'g', x: 0, y: 0, favorite: false, createdAt: 2 });
  b = addGroup(b, 'Maple St');
  b = addGroup(b, 'Maple St');           // idempotent
  b = addGroup(b, ARCHIVE_GROUP);        // reserved — rejected
  check('addGroup adds once, rejects duplicates + the reserved archive name', groupsOf(b).join() === 'Maple St');
  b = setTileGroup(b, 'g1', 'Maple St');
  check('setTileGroup moves a tile into a group', getTile(b, 'g1')?.group === 'Maple St');
  check('view "all" shows everything; a group view shows only its tiles', viewTiles(b, 'all').length === 2 && viewTiles(b, 'Maple St').map((t) => t.id).join() === 'g1');
  b = setTileGroup(b, 'a', ARCHIVE_GROUP);
  check('archiving hides from "all" but keeps it in the Archive view (never deleted)', viewTiles(b, 'all').map((t) => t.id).join() === 'g1' && viewTiles(b, ARCHIVE_GROUP).map((t) => t.id).join() === 'a');
  b = setTileGroup(b, 'a', null);
  check('un-archiving returns it to the main space', viewTiles(b, 'all').map((t) => t.id).sort().join() === 'a,g1');
  // mutators preserve the groups list
  check('addTile / patchTile / removeTile preserve the groups list', groupsOf(addTile(b, { id: 'z', prompt: '', parentId: null, content: 'z', x: 0, y: 0, favorite: false, createdAt: 9 })).join() === 'Maple St' && groupsOf(removeTile(b, 'a')).join() === 'Maple St');
}

// --- tidy can re-lay just one view's tiles, leaving the rest put ----------------------------
{
  let b: Board<string> = emptyBoard();
  b = addTile(b, { id: 'x', prompt: 'p', parentId: null, content: 'x', x: 999, y: 999, favorite: false, createdAt: 1, group: 'G' });
  b = addTile(b, { id: 'y', prompt: 'p', parentId: null, content: 'y', x: 5, y: 5, favorite: false, createdAt: 2 });
  const t = tidyByTime(b, M, 'desc', new Set(['x']));
  check('filtered tidy re-lays only the named tiles', getTile(t, 'x')?.x === M.pad && getTile(t, 'x')?.y === M.pad && getTile(t, 'y')?.x === 5);
}

// --- layout ignores archived tiles + avoids in-flight ghosts (fluid, no collisions) --------
{
  const PAD = M.pad ?? 40;
  let b: Board<string> = emptyBoard();
  // An archived tile sitting exactly on the first grid slot must NOT block a fresh root there.
  b = addTile(b, { id: 'arch', prompt: 'p', parentId: null, content: 'a', x: PAD, y: PAD, favorite: false, createdAt: 1, group: ARCHIVE_GROUP });
  const p0 = nextRootPosition(b, M);
  check('archived tiles do not occupy the visible board', p0.x === PAD && p0.y === PAD);
  // Two concurrent "makes": the second must dodge the first's in-flight ghost, not stack on it.
  const g0 = nextRootPosition(b, M, []);
  const g1 = nextRootPosition(b, M, [g0]);
  check('a second concurrent make dodges the first in-flight ghost', !(g1.x === g0.x && g1.y === g0.y));
  // A rendition avoids an in-flight sibling ghost too.
  const parent: BoardTile<string> = { id: 'par', prompt: 'p', parentId: null, content: 'c', x: 40, y: 40, favorite: false, createdAt: 2 };
  b = addTile(b, parent);
  const c0 = childPosition(b, parent, M);
  const c1 = childPosition(b, parent, M, [c0]);
  check('a concurrent rendition dodges the in-flight sibling ghost', !(c1.x === c0.x && c1.y === c0.y));
}

console.log(`\ncreativeBoard.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} creativeBoard check(s) failed`);
