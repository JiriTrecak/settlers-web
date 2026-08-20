import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { originalLandscapeType } from "../../original_conv/map/landscape";
import { checksumValid, parseOriginalMap, type ParsedOriginalMap } from "../../original_conv/map/parseOriginalMap";
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
    expect(dumped.starts).toEqual(map.players.map((p) => ({ x: p.startX, y: p.startY })));
    expect(dumped.starts!.length).toBeGreaterThan(0);
    const s = dumped.starts![0]!;
    expect(s.x).toBeGreaterThanOrEqual(0);
    expect(s.x).toBeLessThan(map.width);
    expect(s.y).toBeGreaterThanOrEqual(0);
    expect(s.y).toBeLessThan(map.width);
    const kinds = new Set(dumped.landscape.filter((_, i) => i % (map.width * 8) === 0));
    expect([...kinds].some((k) => k.startsWith("water") || k === "grass" || k === "sand")).toBe(true);
    expect(dumped.resources).toBeDefined();
  });
});

describe("toDumpedMap", () => {
  it("copies player-info start tiles", () => {
    const parsed: ParsedOriginalMap = {
      checksum: 0,
      version: 0x0a,
      width: 2,
      singlePlayer: true,
      players: [
        { name: "a", startX: 12, startY: 34, nation: 0 },
        { name: "b", startX: 56, startY: 78, nation: 1 },
      ],
      quest: "",
      landscape: new Uint8Array(4),
      heights: new Uint8Array(4),
      objects: new Uint8Array(4),
      resources: new Uint8Array(4),
    };
    expect(toDumpedMap(parsed).starts).toEqual([
      { x: 12, y: 34 },
      { x: 56, y: 78 },
    ]);
  });

  it("decodes packed resource cells into dump entries", () => {
    const parsed: ParsedOriginalMap = {
      checksum: 0,
      version: 0x0a,
      width: 2,
      singlePlayer: true,
      players: [],
      quest: "",
      landscape: new Uint8Array(4),
      heights: new Uint8Array(4),
      objects: new Uint8Array(4),
      resources: new Uint8Array([0x1f, 0, 0, 0x21]),
    };
    expect(toDumpedMap(parsed).resources).toEqual([
      { x: 0, y: 0, type: "coal", amount: 50 },
      { x: 1, y: 1, type: "iron", amount: 8 },
    ]);
  });
});
