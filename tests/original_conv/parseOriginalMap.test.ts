import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { originalLandscapeType } from "../../original_conv/map/landscape";
import { checksumValid, parseOriginalMap } from "../../original_conv/map/parseOriginalMap";
import { toDumpedMap } from "../../original_conv/map/toNative";

describe("original landscape ids", () => {
  it("maps original landscape bytes to our types", () => {
    expect(originalLandscapeType(0)).toBe("water1");
    expect(originalLandscapeType(7)).toBe("water8");
    expect(originalLandscapeType(16)).toBe("grass");
    expect(originalLandscapeType(32)).toBe("mountain");
    expect(originalLandscapeType(48)).toBe("sand");
    expect(originalLandscapeType(96)).toBe("river1");
  });
});

describe("parse T1.MAP", () => {
  const path = "original/Map/TUTORIAL/T1.MAP";
  const has = existsSync(path);

  it.skipIf(!has)("checksums and dumps native landscape", async () => {
    const buf = await readFile(path);
    expect(checksumValid(buf)).toBe(true);
    const map = parseOriginalMap(buf);
    expect(map.width).toBeGreaterThanOrEqual(32);
    expect(map.width).toBeLessThanOrEqual(1024);
    expect(map.landscape.length).toBe(map.width * map.width);
    const dumped = toDumpedMap(map);
    expect(dumped.width).toBe(map.width);
    expect(dumped.landscape).toHaveLength(map.width * map.width);
    expect(dumped.landscape[0]).toBeTruthy();
    const kinds = new Set(dumped.landscape.filter((_, i) => i % (map.width * 8) === 0));
    expect([...kinds].some((k) => k.startsWith("water") || k === "grass" || k === "sand")).toBe(true);
  });
});
