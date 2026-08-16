import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { stoneCapacity } from "../../original_conv/map/objects";
import { isDumpedMap } from "../../src/sim/dumpedMap";
import { treeTypeAt, waveDecorations } from "../../src/sim/decorations";
import { MapGrid } from "../../src/sim/mapGrid";
import { mapViewFromGrid } from "../../src/sim/mapView";

describe("treeTypeAt", () => {
  it("matches Java MapObjectDrawer.getTreeType", () => {
    expect(treeTypeAt(0, 0)).toBe(0);
    expect(treeTypeAt(10, 20)).toBe(5);
  });
});

describe("stoneCapacity", () => {
  it("maps RES_STONE_01..13 like Java", () => {
    expect(stoneCapacity(115)).toBe(12);
    expect(stoneCapacity(127)).toBe(0);
    expect(stoneCapacity(68)).toBeNull();
  });
});

describe("waveDecorations", () => {
  it("stamps the Java 4-hex water lattice", () => {
    const grid = new MapGrid(16, 16);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) grid.setLandscape(x, y, "water8");
    }
    const waves = waveDecorations(mapViewFromGrid(grid));
    expect(waves.some((d) => d.x === 2 && d.y === 4)).toBe(true);
    expect(waves.some((d) => d.x === 6 && d.y === 4)).toBe(true);
    expect(waves.some((d) => d.x === 0 && d.y === 0)).toBe(false);
    expect(waves.some((d) => d.x === 1 && d.y === 0)).toBe(false);
    expect(waves.every((d) => d.kind === "wave")).toBe(true);
  });
});

describe("dumped T1 decorations", () => {
  const path = "assets/maps/tutorial/T1.json";
  const has = existsSync(path);

  it.skipIf(!has)("has trees and stones", async () => {
    const data: unknown = JSON.parse(await readFile(path, "utf8"));
    expect(isDumpedMap(data)).toBe(true);
    if (!isDumpedMap(data)) return;
    expect(data.trees.length).toBeGreaterThan(10);
    expect(data.stones.length).toBeGreaterThan(0);
  });
});
