import { describe, expect, it } from "vitest";
import { MapGrid } from "../sim/mapGrid";
import { mapViewFromGrid } from "../sim/mapView";
import { Camera } from "./camera";
import { pickGrid } from "../shared/iso";
import { TEXTURE_SIZE } from "../assets/dat/atlasPositions";
import { buildLandscapeGeometry, landscapeTriangleCount } from "./landscapeGeometry";
import { realModulo, triangleTexture } from "./landscapeUv";

describe("landscape geometry", () => {
  it("emits two triangles per cell with duplicated verts", () => {
    const grid = new MapGrid(8, 6);
    const data = buildLandscapeGeometry(mapViewFromGrid(grid));
    const tris = landscapeTriangleCount(8, 6);
    expect(tris).toBe(7 * 5 * 2);
    expect(data.indices.length / 3).toBe(tris);
    expect(data.positions.length / 2).toBe(tris * 3);
    expect(data.uvs.length / 2).toBe(tris * 3);
  });

  it("maps a solid grass cell onto the grass atlas slot", () => {
    const tex = triangleTexture("grass", "grass", "grass", true, 0, 0, 0);
    expect(tex.textureIndex).toBe(0);
    expect(tex.uvs[0]).toBeCloseTo(8 / TEXTURE_SIZE);
    expect(tex.uvs[1]).toBeCloseTo(0);
    expect(tex.uvs[2]).toBeCloseTo(0);
    expect(tex.uvs[3]).toBeCloseTo(16 / TEXTURE_SIZE);
  });

  it("picks sand/water border slots instead of a solid tile", () => {
    const tex = triangleTexture("sand", "water1", "water1", true, 0, 1, 1);
    expect(tex.textureIndex).toBe(39);
  });

  it("still blends when river frames mix on one triangle", () => {
    const tex = triangleTexture("grass", "river1", "river2", true, 0, 2, 2);
    expect(tex.textureIndex).toBeGreaterThanOrEqual(52);
    expect(tex.textureIndex).toBeLessThan(68);
  });
});

describe("realModulo", () => {
  it("matches Java remainder for negatives", () => {
    expect(realModulo(40, 128)).toBe(40);
    expect(realModulo(-8, 128)).toBe(120);
  });
});

describe("pick", () => {
  it("hits the tile whose world vertex is under the cursor", () => {
    const cam = new Camera();
    cam.zoom = 2;
    cam.panX = 40;
    cam.panY = 60;
    const cases = [
      { x: 0, y: 0 },
      { x: 3, y: 1 },
      { x: 10, y: 10 },
    ];
    for (const tile of cases) {
      const world = { x: 16 * tile.x - 8 * tile.y, y: 9 * tile.y };
      const screen = cam.worldToScreen(world.x, world.y);
      const back = cam.screenToWorld(screen.x, screen.y);
      expect(pickGrid(back.x, back.y)).toEqual(tile);
    }
  });
});
