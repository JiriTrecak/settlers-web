import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseOriginalMap } from "../../src/assets/map/parseOriginalMap";
import { mapDecorations, stoneCapacity, treeTypeAt, waveDecorations } from "../../src/sim/decorations";
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

describe("mapDecorations T1", () => {
  const path = "assets/maps/tutorial/T1.MAP";
  const has = existsSync(path);

  it.skipIf(!has)("reads trees and stones from the object byte", async () => {
    const map = parseOriginalMap(await readFile(path));
    expect(map.objects.length).toBe(map.width * map.width);
    const decos = mapDecorations(map);
    expect(decos.filter((d) => d.kind === "tree").length).toBeGreaterThan(10);
    expect(decos.filter((d) => d.kind === "stone").length).toBeGreaterThan(0);
  });
});
