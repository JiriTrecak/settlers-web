import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { checksumValid, parseOriginalMap } from "./parseOriginalMap";
import { originalLandscapeType } from "./landscape";
import { originalMapToGrid } from "../../sim/originalMap";

describe("original landscape ids", () => {
  it("maps water/grass/mountain like Java OriginalLandscape", () => {
    expect(originalLandscapeType(0)).toBe("water1");
    expect(originalLandscapeType(7)).toBe("water8");
    expect(originalLandscapeType(16)).toBe("grass");
    expect(originalLandscapeType(32)).toBe("mountain");
    expect(originalLandscapeType(48)).toBe("sand");
    expect(originalLandscapeType(96)).toBe("river1");
  });
});

describe("parse T1.MAP", () => {
  const path = "MAP/TUTORIAL/T1.MAP";
  const has = existsSync(path);

  it.skipIf(!has)("checksums and reads a square landscape", async () => {
    const buf = await readFile(path);
    expect(checksumValid(buf)).toBe(true);
    const map = parseOriginalMap(buf);
    expect(map.width).toBeGreaterThanOrEqual(32);
    expect(map.width).toBeLessThanOrEqual(1024);
    expect(map.landscape.length).toBe(map.width * map.width);
    expect(map.heights.length).toBe(map.width * map.width);
    const grid = originalMapToGrid(map);
    expect(grid.width).toBe(map.width);
    expect(grid.landscapeAt(0, 0)).toBeTruthy();
    const kinds = new Set<string>();
    for (let y = 0; y < map.width; y += 8) {
      for (let x = 0; x < map.width; x += 8) kinds.add(grid.landscapeAt(x, y));
    }
    expect([...kinds].some((k) => k.startsWith("water") || k === "grass" || k === "sand")).toBe(true);
  });
});
