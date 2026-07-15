// Run: npx tsx src/lib/garvis/creativeBoard.verify.ts
// The spatial-board core is the substrate every channel board sits on, so its model + layout math get a
// dedicated suite: tiles add/patch/move/remove without losing renditions, lineage is correct, and new
// tiles + renditions land WITHOUT overlapping (the whole point of "spread out and compare").
import {
  emptyBoard, addTile, patchTile, setTileContent, moveTile, toggleFavorite, removeTile,
  getTile, childrenOf, lineageOf, favorites, nextRootPosition, childPosition, boardExtent, tidyByTime,
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
  check('tidy orders newest-first at the origin', t.tiles[0].id === 'new' && t.tiles[0].x === M.pad && t.tiles[0].y === M.pad);
  check('tidy keeps all tiles + content + favorites + lineage', t.tiles.length === 3 && !!getTile(t, 'old')?.favorite && getTile(t, 'new')?.parentId === 'old');
  const clean = t.tiles.every((a, i) => t.tiles.every((c, j) => i === j || Math.abs(a.x - c.x) >= M.w - 1 || Math.abs(a.y - c.y) >= M.h - 1));
  check('tidy grid never overlaps', clean);
  check('tidy asc orders oldest-first', tidyByTime(b, M, 'asc').tiles[0].id === 'old');
}

console.log(`\ncreativeBoard.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} creativeBoard check(s) failed`);
