export type SpatialPoint = {x: number; y: number};
export type Footprint = {width: number; depth: number};
export type Bounds = {minX: number; minY: number; maxX: number; maxY: number};

/** Navigation samples are integer centers, with edges at n ± 0.5. */
export const NAV_CELL_SIZE = 1;
/** Fixed engine conversion: four navigation cells per competitive building cell C. */
export const BUILDING_CELL_SIZE = 4 * NAV_CELL_SIZE;
export const GRID_ORIGIN = -NAV_CELL_SIZE / 2;

export function rotatedFootprint(footprint: Footprint = {width: 1, depth: 1}, rotation = 0): Footprint {
  return Math.round(rotation / 90) % 2 !== 0
    ? {width: footprint.depth, depth: footprint.width} : footprint;
}

/** Physical edges, shared by drawing, collision and placement. Max edges are exclusive. */
export function footprintBounds(position: SpatialPoint, footprint?: Footprint, rotation = 0): Bounds {
  const {width, depth} = rotatedFootprint(footprint, rotation);
  return {minX: position.x - width / 2, minY: position.y - depth / 2,
    maxX: position.x + width / 2, maxY: position.y + depth / 2};
}

/** Snap edges, rather than centers: even and odd footprints occupy exactly their declared cells.
 * `step` is a lattice spacing, not a gameplay scale. Construction uses BUILDING_CELL_SIZE;
 * navigation-sized resource footprints use NAV_CELL_SIZE. */
export function snapFootprint(position: SpatialPoint, footprint: Footprint, rotation = 0, step = BUILDING_CELL_SIZE): SpatialPoint {
  const {width, depth} = rotatedFootprint(footprint, rotation);
  const snap = (center: number, extent: number) =>
    GRID_ORIGIN + Math.round((center - extent / 2 - GRID_ORIGIN) / step) * step + extent / 2;
  return {x: snap(position.x, width), y: snap(position.y, depth)};
}

export function footprintAligned(position: SpatialPoint, footprint: Footprint, rotation = 0, step = BUILDING_CELL_SIZE): boolean {
  const b = footprintBounds(position, footprint, rotation);
  return [b.minX, b.minY, b.maxX, b.maxY].every(edge => Number.isInteger((edge - GRID_ORIGIN) / step));
}

/** Inclusive raster centers whose cells have positive overlap with the physical rectangle.
 * Arbitrary centers are conservatively covered; no fractional array indices escape this boundary. */
export function footprintCellBounds(position: SpatialPoint, footprint?: Footprint, rotation = 0): Bounds {
  const b = footprintBounds(position, footprint, rotation);
  return {minX: Math.floor(b.minX - .5) + 1, minY: Math.floor(b.minY - .5) + 1,
    maxX: Math.ceil(b.maxX + .5) - 1, maxY: Math.ceil(b.maxY + .5) - 1};
}

export function footprintCells(position: SpatialPoint, footprint?: Footprint, rotation = 0): SpatialPoint[] {
  const b = footprintCellBounds(position, footprint, rotation), cells: SpatialPoint[] = [];
  for (let y = b.minY; y <= b.maxY; y++) for (let x = b.minX; x <= b.maxX; x++) cells.push({x, y});
  return cells;
}

/** Static navigation sweeps a conservative square around an actor (clearSweep).
 * Foundation placement must preserve that footprint, including corners. The
 * lower edge of a raster cell belongs to that cell; its upper edge does not. */
export function navigationBodyOverlapsBounds(center: SpatialPoint, radius: number, bounds: Bounds): boolean {
  return center.x + radius >= bounds.minX && center.x - radius < bounds.maxX &&
    center.y + radius >= bounds.minY && center.y - radius < bounds.maxY;
}
