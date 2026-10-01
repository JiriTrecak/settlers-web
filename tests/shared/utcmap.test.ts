import { describe, expect, it } from "vitest";
import {
  emptyUtcMap,
  mapFileName,
  parseUtcMap,
  readUtcMap,
  stringifyUtcMap,
  UTCMAP_VERSION,
} from "../../src/shared";

describe("utcmap", () => {
  it("preserves forest understory and building exclusions when saving a map", () => {
    const landscape = {
      strokes: [],
      cover: [
        {
          x: 129,
          z: 125,
          radius: 34,
          density: 10,
          seed: 7123,
          flowers: 0.005,
          grassScale: 0.65,
          broadRatio: 1,
          palette: "forest",
          exclusions: [{ x: 125.7, z: 117, radius: 5.94 }],
        },
      ],
      environment: { hour: 10, playing: false },
    };
    const parsed = parseUtcMap({ ...emptyUtcMap(), landscape });
    expect(parsed?.landscape).toEqual(landscape);
    expect(
      parseUtcMap(JSON.parse(stringifyUtcMap(parsed!)))?.landscape,
    ).toEqual(landscape);
    expect(
      parseUtcMap({
        ...emptyUtcMap(),
        landscape: {
          ...landscape,
          cover: [{ ...landscape.cover[0], palette: "unknown" }],
        },
      }),
    ).toBeNull();
  });
  it("roundtrips an empty map", () => {
    const map = emptyUtcMap();
    expect(map.v).toBe(UTCMAP_VERSION);
    expect(map.name).toBe("Untitled");
    expect(map.stamps).toEqual([]);
    expect(parseUtcMap(JSON.parse(stringifyUtcMap(map)))).toEqual(map);
  });

  it("rejects old and incomplete documents", () => {
    expect(parseUtcMap({ v: 1 })).toBeNull();
  });

  it("roundtrips name and stamps", () => {
    const map = {
      ...emptyUtcMap(),
      name: "Forest Edge",
      stamps: [{ id: "a", asset: "pine", x: 3, y: 4, yaw: 0.4, scale: 1.2 }],
    };
    expect(parseUtcMap(JSON.parse(stringifyUtcMap(map)))).toEqual(map);
  });

  it("slugs the document title into a filename", () => {
    expect(mapFileName("Forest Edge")).toBe("forest-edge.utcmap");
    expect(mapFileName("  ")).toBe("untitled.utcmap");
  });

  it("rejects garbage and other versions", () => {
    expect(parseUtcMap(null)).toBeNull();
    expect(parseUtcMap("nope")).toBeNull();
    expect(parseUtcMap({ v: 2 })).toBeNull();
    expect(parseUtcMap({})).toBeNull();
    expect(parseUtcMap({ v: 1, stamps: [{ id: "a" }] })).toBeNull();
    expect(parseUtcMap({ v: 1, name: 3 })).toBeNull();
  });

  it("names the field that made a map invalid", () => {
    const error = (raw: unknown) => {
      const read = readUtcMap(raw);
      return "error" in read ? read.error : null;
    };
    expect(error({ ...emptyUtcMap(), extra: 1 })).toMatch(/extra/);
    expect(error({ ...emptyUtcMap(), name: 3 })).toMatch(/name/);
    expect(
      error({ ...emptyUtcMap(), stamps: [{ id: "a", asset: "pine" }] }),
    ).toMatch(/stamps\.0/);
    expect(
      error({
        ...emptyUtcMap(),
        landscape: { strokes: [], cover: [{ palette: "unknown" }] },
      }),
    ).toMatch(/landscape/);
    expect(error(emptyUtcMap())).toBeNull();
  });
});
