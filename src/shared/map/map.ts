/** In-code map. One size, no dump files. */
export const MAP_ID = "grid";
/** Playable cells on each axis. */
export const MAP_SIZE = 256;
/** Major grid — white line every N cells. */
export const MAP_TILE = 8;
/** Coarse tile grid (Tiles mode). Two majors. */
export const MAP_BLOCK = MAP_TILE * 2;
/** Visible + stampable (foliage). Not playable. Two major tiles each side. */
export const MAP_HALO = MAP_BLOCK;
export type GridMode = "tiles" | "full";
/** Grid-only past the blue — orientation, no plate, no stamps. */
export const MAP_FRINGE = MAP_TILE * 2;

/** Halo inclusive. Fringe past blue is out. */
export function inStamp(x: number, y: number, size = MAP_SIZE): boolean {
  return x >= -MAP_HALO && y >= -MAP_HALO && x < size + MAP_HALO && y < size + MAP_HALO;
}
