import { describe, expect, it } from "vitest";
import { emptyUtcMap, mapFileName, parseUtcMap, stringifyUtcMap, UTCMAP_VERSION } from "../../src/shared";

describe("utcmap", () => {
  it("rejects invalid landscape settings instead of silently losing the scene appearance", () => {
    const landscape = {strokes:[],cover:[],environment:{hour:8.8,season:'summer',playing:false},water:{rippleScale:.16,rippleStrength:.14,cloudStrength:.24,foamStrength:.9}};
    expect(parseUtcMap({...emptyUtcMap(),landscape})).toBeNull();
    landscape.water.cloudStrength=.18;
    expect(parseUtcMap({...emptyUtcMap(),landscape})?.landscape).toEqual(landscape);
  });
  it("preserves forest understory and building exclusions when saving a map", () => {
    const landscape = {strokes:[],cover:[{x:129,z:125,radius:34,density:10,seed:7123,flowers:.005,grassScale:.65,broadRatio:1,palette:'forest',exclusions:[{x:125.7,z:117,radius:5.94}]}],environment:{hour:10,season:'summer',playing:false}};
    const parsed = parseUtcMap({...emptyUtcMap(),landscape});
    expect(parsed?.landscape).toEqual(landscape);
    expect(parseUtcMap(JSON.parse(stringifyUtcMap(parsed!)))?.landscape).toEqual(landscape);
    expect(parseUtcMap({...emptyUtcMap(),landscape:{...landscape,cover:[{...landscape.cover[0],palette:'unknown'}]}})).toBeNull();
  });
  it("roundtrips an empty map", () => {
    const map = emptyUtcMap();
    expect(map.v).toBe(UTCMAP_VERSION);
    expect(map.name).toBe("Untitled");
    expect(map.stamps).toEqual([]);
    expect(parseUtcMap(JSON.parse(stringifyUtcMap(map)))).toEqual(map);
  });

  it("accepts a bare version object", () => {
    expect(parseUtcMap({ v: 1 })).toEqual({ v: 1, name: "Untitled", stamps: [] });
  });

  it("roundtrips name and stamps", () => {
    const map = {
      v: 1 as const,
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
});
