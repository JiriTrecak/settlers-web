import { describe, expect, it } from "vitest";
import { HEX_DELTAS, isAllowedNeighbor, isRiver, isWater } from "../../src/shared/landscape/landscape";
import { MAPS, generateIsland, generateMap } from "../../src/sim/map/generateIsland";
import { seedRng } from "../../src/sim/rng/rng";

describe("generateIsland", () => {
  it("is deterministic for a seed and has ocean corners", () => {
    const a = generateIsland(48, 48, seedRng(1998));
    const b = generateIsland(48, 48, seedRng(1998));
    expect(Array.from(a.landscape)).toEqual(Array.from(b.landscape));
    expect(isWater(a.landscapeAt(0, 0))).toBe(true);
    expect(isWater(a.landscapeAt(47, 47))).toBe(true);
    const land = a.landscape.some((_, i) => !isWater(a.landscapeAt(i % 48, Math.floor(i / 48))));
    expect(land).toBe(true);
  });
});

describe("generateMap", () => {
  it("builds all three presets with land and ocean", () => {
    for (const def of MAPS) {
      const grid = generateMap({ ...def, size: 48 });
      expect(isWater(grid.landscapeAt(0, 0))).toBe(true);
      const land = [...grid.landscape].some((_, i) => !isWater(grid.landscapeAt(i % 48, Math.floor(i / 48))));
      expect(land).toBe(true);
    }
  });

  it("coast and peak are not the same map", () => {
    const coast = generateMap({ ...MAPS[0], size: 48 });
    const peak = generateMap({ ...MAPS[2], size: 48 });
    expect(Array.from(coast.landscape)).not.toEqual(Array.from(peak.landscape));
  });

  it("only uses S3-legal landscape neighbors so blend diamonds can fire", () => {
    const grid = generateMap({ ...MAPS[0], size: 48 });
    let illegal = 0;
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const a = grid.landscapeAt(x, y);
        for (const { dx, dy } of HEX_DELTAS) {
          const nx = x + dx;
          const ny = y + dy;
          if (!grid.inBounds(nx, ny)) continue;
          if (!isAllowedNeighbor(a, grid.landscapeAt(nx, ny))) illegal++;
        }
      }
    }
    expect(illegal).toBe(0);
  });

  it("carves a real river on the 96 maps", () => {
    for (const def of MAPS) {
      const grid = generateMap(def);
      let rivers = 0;
      for (let y = 0; y < grid.height; y++) {
        for (let x = 0; x < grid.width; x++) {
          if (isRiver(grid.landscapeAt(x, y))) rivers++;
        }
      }
      expect(rivers, def.id).toBeGreaterThan(12);
    }
  });
});
