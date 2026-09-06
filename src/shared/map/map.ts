/** In-code map. One size, no dump files. */
export const MAP_ID = "grid";
/** Playable cells on each axis. */
export const MAP_SIZE = 256;
/** Major grid — white line every N cells. */
export const MAP_TILE = 8;
/** Visible, not playable. Two major tiles each side. */
export const MAP_HALO = MAP_TILE * 2;
/** Extra grid past the halo so the fringe isn't a hard cut. */
export const MAP_FRINGE = MAP_TILE * 2;
