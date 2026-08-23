import { describe, expect, it } from "vitest";
import { parseBuildingsFile, serializeBuildingsFile, uniqueId, type BuildingsFile } from "../../tooling/src/economy/format";
import { seedBuildings } from "../../tooling/src/economy/seed";

describe("buildings format", () => {
  it("round-trips a seeded library", () => {
    const seeded = seedBuildings();
    const parsed = parseBuildingsFile(JSON.parse(serializeBuildingsFile(seeded)) as unknown);
    expect(parsed).toEqual(seeded);
  });

  it("seeds all four civs and copies roman lumberjack costs", () => {
    const file = seedBuildings();
    expect(new Set(file.buildings.map((b) => b.civ)).size).toBe(4);
    const roman = file.buildings.find((b) => b.civ === "roman" && b.id === "lumberjack");
    expect(roman).toMatchObject({
      name: "Lumberjack",
      built: "buildings/roman/lumberjack",
      scaffold: "buildings/roman/lumberjack",
      plank: 2,
      stone: 2,
    });
    const egyptian = file.buildings.find((b) => b.civ === "egyptian" && b.id === "lumberjack");
    expect(egyptian?.plank).toBe(2);
    expect(egyptian?.stone).toBe(2);
    expect(egyptian?.built).toBe("buildings/egyptian/lumberjack");
  });

  it("rejects a foreign format", () => {
    expect(parseBuildingsFile({ format: "nope", version: 1, buildings: [] })).toBeNull();
    expect(parseBuildingsFile({ format: "forest-empire.buildings", version: 1, buildings: [{ id: "x" }] })).toBeNull();
  });

  it("keeps ids unique per civ", () => {
    const file: BuildingsFile = {
      format: "forest-empire.buildings",
      version: 1,
      buildings: [
        { id: "hut", civ: "roman", name: "Hut", built: "", scaffold: "", plank: 0, stone: 0 },
        { id: "hut", civ: "egyptian", name: "Hut", built: "", scaffold: "", plank: 0, stone: 0 },
      ],
    };
    expect(uniqueId(file.buildings, "roman", "hut")).toBe("hut_2");
    expect(uniqueId(file.buildings, "asian", "hut")).toBe("hut");
  });
});
