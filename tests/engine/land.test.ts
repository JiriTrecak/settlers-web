import { describe, expect, it } from "vitest";
import {
  TOWER_RADIUS,
  Y_SCALE,
  circleBounds,
  forEachCircleTile,
  squaredDistance,
} from "../../src/shared/shape/mapCircle";
import { LandGrid, UNOWNED } from "../../src/sim/land/land";

function tilesOf(cx: number, cy: number, radius: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  forEachCircleTile(cx, cy, radius, (x, y) => out.push({ x, y }));
  return out;
}

describe("mapCircle", () => {
  it("puts the six neighbors of the origin at distance ~1", () => {
    expect(squaredDistance(1, 1)).toBeCloseTo(1, 3);
    expect(Y_SCALE).toBeCloseTo(Math.sqrt(3) / 2, 3);
  });

  it("fill of radius 40 includes ±40 on the east-west axis, not ±41", () => {
    expect(TOWER_RADIUS).toBe(40);
    const tiles = tilesOf(100, 100, TOWER_RADIUS);
    expect(tiles).toContainEqual({ x: 140, y: 100 });
    expect(tiles).toContainEqual({ x: 60, y: 100 });
    expect(tiles).not.toContainEqual({ x: 141, y: 100 });
    expect(tiles).not.toContainEqual({ x: 59, y: 100 });
    expect(tiles).toContainEqual({ x: 100, y: 100 });
  });

  it("AABB contains every fill tile", () => {
    const b = circleBounds(100, 100, TOWER_RADIUS);
    forEachCircleTile(100, 100, TOWER_RADIUS, (x, y) => {
      expect(x).toBeGreaterThanOrEqual(b.xMin);
      expect(x).toBeLessThanOrEqual(b.xMax);
      expect(y).toBeGreaterThanOrEqual(b.yMin);
      expect(y).toBeLessThanOrEqual(b.yMax);
    });
  });
});

describe("land", () => {
  it("stamps a tower disk and extends on overlap", () => {
    const land = new LandGrid(200, 200);
    land.occupy({ x: 50, y: 100 }, 0);
    expect(land.playerAt(50, 100)).toBe(0);
    expect(land.playerAt(90, 100)).toBe(0);
    expect(land.playerAt(91, 100)).toBe(UNOWNED);
    expect(land.towerCountAt(50, 100)).toBe(1);

    land.occupy({ x: 70, y: 100 }, 0);
    expect(land.playerAt(70, 100)).toBe(0);
    expect(land.playerAt(110, 100)).toBe(0);
    expect(land.towerCountAt(60, 100)).toBeGreaterThan(1);
    expect(land.towerCountAt(70, 100)).toBeGreaterThan(1);
  });

  it("does not steal tiles another player already enforces, except the ground cell", () => {
    const land = new LandGrid(200, 200);
    land.occupy({ x: 50, y: 100 }, 0);
    expect(land.playerAt(70, 100)).toBe(0);
    expect(land.towerCountAt(70, 100)).toBeGreaterThan(0);

    land.occupy({ x: 70, y: 100 }, 1);
    expect(land.playerAt(70, 100)).toBe(1);
    expect(land.playerAt(50, 100)).toBe(0);
    expect(land.playerAt(51, 100)).toBe(0);
  });

  it("clips the disk to the map", () => {
    const land = new LandGrid(10, 10);
    land.occupy({ x: 0, y: 0 }, 0);
    let owned = 0;
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) if (land.playerAt(x, y) === 0) owned += 1;
    }
    expect(owned).toBe(100);
    expect(tilesOf(0, 0, TOWER_RADIUS).length).toBeGreaterThan(100);
    expect(land.playerAt(-1, 0)).toBe(UNOWNED);
  });

  it("marks the rim as border, not the interior", () => {
    const land = new LandGrid(200, 200);
    land.occupy({ x: 50, y: 100 }, 0);
    expect(land.isBorder(50, 100)).toBe(false);
    expect(land.isBorder(90, 100)).toBe(true);
    expect(land.isBorder(91, 100)).toBe(false);
  });

  it("owns is open until the first disk, then same-player only", () => {
    const land = new LandGrid(20, 20);
    expect(land.owns(5, 5, 0)).toBe(true);
    land.occupy({ x: 5, y: 5 }, 0, 3);
    expect(land.owns(5, 5, 0)).toBe(true);
    expect(land.owns(19, 19, 0)).toBe(false);
    expect(land.owns(5, 5, 1)).toBe(false);
  });

  it("release drops a disk and keeps overlapping same-player land", () => {
    const land = new LandGrid(200, 200);
    land.occupy({ x: 50, y: 100 }, 0);
    land.occupy({ x: 70, y: 100 }, 0);
    expect(land.playerAt(110, 100)).toBe(0);
    land.release({ x: 70, y: 100 });
    expect(land.playerAt(50, 100)).toBe(0);
    expect(land.playerAt(90, 100)).toBe(0);
    expect(land.playerAt(110, 100)).toBe(UNOWNED);
    land.release({ x: 50, y: 100 });
    expect(land.playerAt(50, 100)).toBe(UNOWNED);
    expect(land.hasLand()).toBe(false);
  });
});
