/**
 * Occupying-building influence disk. Axial distance so the six neighbors of
 * the center sit at ~1; radius 40 is a finished tower.
 *
 * `forEachTile` is the fill used to stamp land. `contains` is the closed disk
 * (squared distance). They can disagree by a tile on the rim — occupy uses fill.
 */
export const TOWER_RADIUS = 40;

/** Slightly under √3/2 so d((0,0),(1,1)) is almost 1. */
export const Y_SCALE = Math.fround(Math.fround(Math.fround(Math.sqrt(3)) / 2) * Math.fround(0.999999));

export type CircleRect = { xMin: number; yMin: number; xMax: number; yMax: number };

export function squaredDistance(dx: number, dy: number): number {
  const y2 = Math.fround(Y_SCALE * Y_SCALE);
  return Math.fround(Math.fround(0.25 + y2) * (dy * dy) + (dx * dx) - dx * dy);
}

export function distanceSquared(x1: number, y1: number, x2: number, y2: number): number {
  return squaredDistance(x1 - x2, y1 - y2);
}

export function circleContains(cx: number, cy: number, radius: number, x: number, y: number): boolean {
  const r = Math.fround(radius);
  return squaredDistance(x - cx, y - cy) <= Math.fround(r * r);
}

/** AABB that contains every fill tile. */
export function circleBounds(cx: number, cy: number, radius: number): CircleRect {
  const r = Math.fround(radius);
  const yRadius = (r / Y_SCALE + 1) | 0;
  const halfLineWidth = (r * 1.2) | 0;
  return {
    xMin: cx - halfLineWidth,
    yMin: cy - yRadius,
    xMax: cx + halfLineWidth,
    yMax: cy + yRadius,
  };
}

/**
 * Visit every tile in the disk, in scanline order. Out of bounds is the
 * caller's problem — occupy clips to the map.
 */
export function forEachCircleTile(cx: number, cy: number, radius: number, visit: (x: number, y: number) => void): void {
  const r = Math.fround(radius);
  let yOff = -((r / Y_SCALE) | 0);
  let half = halfLineWidth(r, yOff);
  let xOff = -half;
  const maxY = Math.ceil(r / Y_SCALE) | 0;
  while (yOff < maxY) {
    visit((Math.ceil(0.5 * yOff + xOff) | 0) + cx, yOff + cy);
    xOff += 1;
    if (xOff > half) {
      yOff += 1;
      half = halfLineWidth(r, yOff);
      xOff = -half;
    }
  }
}

/** Rim tiles: in the disk, not in radius-1. */
export function forEachCircleBorder(cx: number, cy: number, radius: number, visit: (x: number, y: number) => void): void {
  const r = Math.fround(radius);
  forEachCircleTile(cx, cy, r, (x, y) => {
    const prev = halfLineWidth(r, y - cy - 1);
    const next = halfLineWidth(r, y - cy + 1);
    const xDist = Math.abs(-x - 0.5 * (cy - y) + cx);
    if (!(xDist < prev && xDist < next)) visit(x, y);
  });
}

function halfLineWidth(radius: number, relativeY: number): number {
  const yScale = Y_SCALE;
  const inside = radius * radius - relativeY * yScale * relativeY * yScale;
  if (!(inside > 0)) return 0;
  const maximum = Math.sqrt(inside);
  if (relativeY % 2 === 0) return Math.floor(maximum);
  return Math.floor(maximum + 0.5) - 0.5;
}
