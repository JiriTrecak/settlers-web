/**
 * Cached view disk for one radius. Inner tiles are refIndex 0 (full sight);
 * the padding ring is 1, 2, … so each empty inner bucket knocks 10 off.
 */
import { FOG_PADDING, MAX_VIEW_DISTANCE } from "./constants";
import { forEachCircleTile, squaredDistance } from "../../shared";

export type ViewTile = { dx: number; dy: number; refIndex: number };

const cache: (ViewTile[] | undefined)[] = [];

/** `viewDistance` is the building/unit look radius before padding. */
export function viewCircle(viewDistance: number): readonly ViewTile[] {
  const radius = Math.min(Math.max(0, viewDistance | 0), MAX_VIEW_DISTANCE - 1);
  const hit = cache[radius];
  if (hit) return hit;
  const inner = radius + FOG_PADDING / 2;
  const innerSq = inner * inner;
  const tiles: ViewTile[] = [];
  forEachCircleTile(0, 0, inner + FOG_PADDING, (dx, dy) => {
    const sq = squaredDistance(dx, dy);
    let refIndex = 0;
    if (sq >= innerSq) refIndex = (Math.sqrt(sq) - inner) | 0;
    tiles.push({ dx, dy, refIndex });
  });
  cache[radius] = tiles;
  return tiles;
}
