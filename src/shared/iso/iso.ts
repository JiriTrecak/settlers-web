/**
 * Diamond iso: 16×9 tiles, height lifts Y by 2px per step.
 * Grid origin is the north corner of the map diamond.
 */
export const TILE_WIDTH = 16;
export const TILE_HEIGHT = 9;
export const HEIGHT_X = 0;
export const HEIGHT_Y = 2;

export type WorldPos = { x: number; y: number };

/** Grid → world pixels (Pixi Y-down): x' = 16x - 8y, y' = 9y - 2h. */
export function gridToWorld(x: number, y: number, height = 0): WorldPos {
  return {
    x: TILE_WIDTH * x - (TILE_WIDTH / 2) * y + HEIGHT_X * height,
    y: TILE_HEIGHT * y - HEIGHT_Y * height,
  };
}

/** Inverse of gridToWorld at height 0. Minimap frustum uses this; hover uses `pickCell`. */
export function worldToGrid(wx: number, wy: number): WorldPos {
  const y = wy / TILE_HEIGHT;
  const x = wx / TILE_WIDTH + y / 2;
  return { x, y };
}

export function pickGrid(wx: number, wy: number): { x: number; y: number } {
  const g = worldToGrid(wx, wy);
  return { x: Math.round(g.x), y: Math.round(g.y) };
}

/**
 * Cell whose height-displaced mesh triangles contain the world point.
 * Same two tris as landscapeGeometry. Frontmost (max x+y) wins on overlap.
 *
 * Height-0 inverse is only a search seed: a tile at height h is drawn `2h` px
 * up, so the flat guess sits ~`2h/9` cells north of the real cell.
 */
export function pickCell(
  wx: number,
  wy: number,
  width: number,
  height: number,
  heightAt: (x: number, y: number) => number,
): { x: number; y: number } | null {
  if (width < 2 || height < 2) return null;
  const seed = worldToGrid(wx, wy);
  const x0 = Math.round(seed.x);
  const y0 = Math.round(seed.y);
  const xMin = Math.max(0, x0 - 2);
  const yMin = Math.max(0, y0 - 2);
  const xMax = Math.min(width - 2, x0 + HEIGHT_SEARCH);
  const yMax = Math.min(height - 2, y0 + HEIGHT_SEARCH);

  let hit: { x: number; y: number } | null = null;
  let depth = -1;
  for (let cy = yMin; cy <= yMax; cy++) {
    for (let cx = xMin; cx <= xMax; cx++) {
      if (!cellContains(wx, wy, cx, cy, heightAt)) continue;
      const d = cx + cy;
      if (d >= depth) {
        hit = { x: cx, y: cy };
        depth = d;
      }
    }
  }
  return hit;
}

/** Int8 height 127 → 2*127/9 ≈ 28 cells of Y error. */
const HEIGHT_SEARCH = Math.ceil((128 * HEIGHT_Y) / TILE_HEIGHT) + 2;

function cellContains(
  wx: number,
  wy: number,
  x: number,
  y: number,
  heightAt: (x: number, y: number) => number,
): boolean {
  const a = gridToWorld(x, y, heightAt(x, y));
  const b = gridToWorld(x + 1, y, heightAt(x + 1, y));
  const c = gridToWorld(x + 1, y + 1, heightAt(x + 1, y + 1));
  const d = gridToWorld(x, y + 1, heightAt(x, y + 1));
  return pointInTri(wx, wy, a.x, a.y, d.x, d.y, c.x, c.y) || pointInTri(wx, wy, a.x, a.y, c.x, c.y, b.x, b.y);
}

function pointInTri(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): boolean {
  const v0x = cx - ax;
  const v0y = cy - ay;
  const v1x = bx - ax;
  const v1y = by - ay;
  const v2x = px - ax;
  const v2y = py - ay;
  const den = v0x * v1y - v1x * v0y;
  if (den === 0) return false;
  const u = (v2x * v1y - v1x * v2y) / den;
  const v = (v0x * v2y - v2x * v0y) / den;
  return u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6;
}
