/** Java DrawConstants.DISTANCE_X / DISTANCE_Y / height displacement. */

export const TILE_WIDTH = 16;
export const TILE_HEIGHT = 9;
export const HEIGHT_X = 0;
export const HEIGHT_Y = 2;

export type WorldPos = { x: number; y: number };

/**
 * Grid → world pixels (Pixi Y-down).
 * Java stores map x/y/height in the VBO and multiplies by the height matrix in the shader.
 * Same diamond: x' = 16x - 8y, y' = 9y - 2h  (Y flipped vs GL-up).
 */
export function gridToWorld(x: number, y: number, height = 0): WorldPos {
  return {
    x: TILE_WIDTH * x - (TILE_WIDTH / 2) * y + HEIGHT_X * height,
    y: TILE_HEIGHT * y - HEIGHT_Y * height,
  };
}

/** Inverse of gridToWorld at height 0. Java pick also ignores height. */
export function worldToGrid(wx: number, wy: number): WorldPos {
  const y = wy / TILE_HEIGHT;
  const x = wx / TILE_WIDTH + y / 2;
  return { x, y };
}

export function pickGrid(wx: number, wy: number): { x: number; y: number } {
  const g = worldToGrid(wx, wy);
  return { x: Math.round(g.x), y: Math.round(g.y) };
}
