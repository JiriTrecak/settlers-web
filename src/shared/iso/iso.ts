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

/** Inverse of gridToWorld at height 0. Pick ignores height so hills don't steal clicks. */
export function worldToGrid(wx: number, wy: number): WorldPos {
  const y = wy / TILE_HEIGHT;
  const x = wx / TILE_WIDTH + y / 2;
  return { x, y };
}

export function pickGrid(wx: number, wy: number): { x: number; y: number } {
  const g = worldToGrid(wx, wy);
  return { x: Math.round(g.x), y: Math.round(g.y) };
}
