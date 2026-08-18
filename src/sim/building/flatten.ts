/**
 * Flatten math. Target height is the integer mean of the protected tiles,
 * frozen when the plan drops. A digger walks onto a cell, kneels 1s, steps
 * height ±1 toward that mean and paints `flattened` if neighbors allow.
 *
 * Already-level plots skip (construction as today). Too-steep uses the
 * original mark: `2.5 × (Σ|h−avg|)^1.5 / n` — over 127 refuses place.
 */
import { HEX_DELTAS, isAllowedNeighbor, type GridPos, type LandscapeType } from "../../shared";
import type { Rel } from "../data/types";
import type { MapGrid } from "../map/mapGrid";
import type { MarkGrid } from "../mark/mark";
import type { Rng } from "../rng/rng";

/** One digger per this many protected tiles, rounded up. */
export const TILES_PER_DIGGER = 15;

const MARK_SCALE = 2.5;
const MARK_POW = 1.5;
const MARK_MAX = 127;

export function footprint(rels: readonly Rel[], at: GridPos): GridPos[] {
  return rels.map((r) => ({ x: at.x + r.dx, y: at.y + r.dy }));
}

/** Integer mean, frozen on the hut as `flattenHeight`. */
export function averageHeight(grid: MapGrid, tiles: readonly GridPos[]): number {
  if (tiles.length === 0) return 0;
  let sum = 0;
  for (const t of tiles) sum += grid.heightAt(t.x, t.y);
  return (sum / tiles.length) | 0;
}

/** Every protected tile already shares a height — no diggers. */
export function plotLevel(grid: MapGrid, tiles: readonly GridPos[]): boolean {
  if (tiles.length === 0) return true;
  const h = grid.heightAt(tiles[0]!.x, tiles[0]!.y);
  for (const t of tiles) if (grid.heightAt(t.x, t.y) !== h) return false;
  return true;
}

export function flattenReady(grid: MapGrid, tiles: readonly GridPos[], target: number): boolean {
  for (const t of tiles) if (grid.heightAt(t.x, t.y) !== target) return false;
  return true;
}

/** Original construction-mark refuse. Slope lumberjacks are well under this. */
export function flattenTooSteep(grid: MapGrid, tiles: readonly GridPos[]): boolean {
  if (tiles.length === 0) return false;
  let sum = 0;
  for (const t of tiles) sum += grid.heightAt(t.x, t.y);
  const avg = sum / tiles.length;
  let diff = 0;
  for (const t of tiles) diff += Math.abs(grid.heightAt(t.x, t.y) - avg);
  const result = (MARK_SCALE * Math.pow(diff, MARK_POW)) / tiles.length;
  return result > MARK_MAX;
}

export function diggerCount(tileCount: number): number {
  if (tileCount <= 0) return 0;
  return Math.ceil(tileCount / TILES_PER_DIGGER);
}

/** Unmarked protected tile still off the target. Random start so diggers fan out. */
export function nextFlattenTile(
  grid: MapGrid,
  marks: MarkGrid,
  tiles: readonly GridPos[],
  target: number,
  rng: Rng,
): GridPos | null {
  if (tiles.length === 0) return null;
  const offset = rng.nextInt(tiles.length);
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[(i + offset) % tiles.length]!;
    if (marks.claimed(t.x, t.y)) continue;
    if (grid.heightAt(t.x, t.y) === target) continue;
    return t;
  }
  return null;
}

/** All in-bounds neighbors must allow `type`. Out of bounds is ignored. */
export function canChangeLandscapeTo(grid: MapGrid, x: number, y: number, type: LandscapeType): boolean {
  for (const { dx, dy } of HEX_DELTAS) {
    const nx = x + dx;
    const ny = y + dy;
    if (!grid.inBounds(nx, ny)) continue;
    if (!isAllowedNeighbor(grid.landscapeAt(nx, ny), type)) return false;
  }
  return true;
}

/** ±1 toward `target`, then flattened / flattenedDesert if neighbors allow. */
export function changeHeightTowards(grid: MapGrid, x: number, y: number, target: number): void {
  const h = grid.heightAt(x, y);
  if (h !== target) grid.setHeight(x, y, h + Math.sign(target - h));
  if (canChangeLandscapeTo(grid, x, y, "flattened")) grid.setLandscape(x, y, "flattened");
  else if (canChangeLandscapeTo(grid, x, y, "flattenedDesert")) grid.setLandscape(x, y, "flattenedDesert");
}
