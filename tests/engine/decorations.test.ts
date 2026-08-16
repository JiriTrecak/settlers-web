import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { stoneCapacity } from "../../original_conv/map/objects";
import type { LandscapeType } from "../../src/shared/landscape/landscape";
import { decorationsFromDumpedMap, isDumpedMap } from "../../src/sim/map/dumpedMap";
import { treeSheetAt, waveDecorations } from "../../src/sim/decorations/decorations";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { mapViewFromGrid } from "../../src/sim/map/mapView";

describe("treeSheetAt", () => {
  it("scatters tree looks from coordinates", () => {
    expect(treeSheetAt(0, 0)).toBe(0);
    expect(treeSheetAt(10, 20)).toBe(5);
  });
});

describe("stoneCapacity", () => {
  it("maps stone object ids 115..127 to capacity 12..0", () => {
    expect(stoneCapacity(115)).toBe(12);
    expect(stoneCapacity(127)).toBe(0);
    expect(stoneCapacity(68)).toBeNull();
  });
});

describe("waveDecorations", () => {
  it("stamps waves on the 4-hex water lattice", () => {
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

describe("decorationsFromDumpedMap", () => {
  it("fills tree sheet when the dump omitted it", () => {
    const map = {
      width: 2,
      heights: [0, 0, 0, 0],
      landscape: ["grass", "grass", "grass", "grass"] satisfies LandscapeType[],
      trees: [{ x: 10, y: 20 }],
      stones: [],
    };
    const trees = decorationsFromDumpedMap(map).filter((d) => d.kind === "tree");
    expect(trees[0]).toMatchObject({ kind: "tree", x: 10, y: 20, sheet: 5 });
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
    const trees = decorationsFromDumpedMap(data).filter((d) => d.kind === "tree");
    expect(trees.every((d) => d.kind === "tree" && d.sheet >= 0 && d.sheet < 7)).toBe(true);
  });
});
