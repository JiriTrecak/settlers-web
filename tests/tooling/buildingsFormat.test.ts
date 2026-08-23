import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { emptyDraft, parseBuildingsFile, serializeBuildingsFile, uniqueId, type BuildingsFile } from "../../tooling/src/economy/format";
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
    expect(roman?.blocked.length).toBeGreaterThan(10);
    expect(roman?.protected.length).toBeGreaterThan(roman?.blocked.length ?? 0);
    expect(roman?.flatten).toBe(true);
    expect(roman?.buildMarks.length).toBe(6);
    expect(roman?.job).toEqual({ type: "gather", target: "tree", radius: 30 });
    expect(roman?.worker).toBe("lumberjack");
    expect(roman?.offerStacks[0]).toMatchObject({ material: "trunk" });
    const baker = file.buildings.find((b) => b.civ === "roman" && b.id === "baker");
    expect(baker?.job).toMatchObject({ type: "convert", mode: "craft", output: "bread" });
    const house = file.buildings.find((b) => b.civ === "roman" && b.id === "small_livinghouse");
    expect(house?.job).toMatchObject({ type: "house", beds: 10 });
    const tower = file.buildings.find((b) => b.civ === "roman" && b.id === "tower");
    expect(tower?.job).toMatchObject({ type: "military", garrison: 1, occupies: true });
    const mine = file.buildings.find((b) => b.civ === "roman" && b.id === "coalmine");
    expect(mine?.flatten).toBe(false);
    expect(mine?.job).toEqual({ type: "mine", deposit: "coal" });
    const egyptian = file.buildings.find((b) => b.civ === "egyptian" && b.id === "lumberjack");
    expect(egyptian?.plank).toBe(2);
    expect(egyptian?.stone).toBe(2);
    expect(egyptian?.built).toBe("buildings/egyptian/lumberjack");
  });

  it("accepts old saves without plot arrays", () => {
    const parsed = parseBuildingsFile({
      format: "forest-empire.buildings",
      version: 1,
      buildings: [{ id: "hut", civ: "roman", name: "Hut", built: "", scaffold: "", plank: 0, stone: 0 }],
    });
    expect(parsed?.buildings[0]).toMatchObject({ blocked: [], protected: [], buildMarks: [], flatten: true });
  });

  it("keeps authored fence posts", () => {
    const parsed = parseBuildingsFile({
      format: "forest-empire.buildings",
      version: 1,
      buildings: [
        {
          id: "hut",
          civ: "roman",
          name: "Hut",
          built: "",
          scaffold: "",
          plank: 0,
          stone: 0,
          blocked: [],
          protected: [],
          buildMarks: [{ dx: -3, dy: -1 }],
          flatten: true,
        },
      ],
    });
    expect(parsed?.buildings[0]?.buildMarks).toEqual([{ dx: -3, dy: -1 }]);
  });

  it("rejects a foreign format", () => {
    expect(parseBuildingsFile({ format: "nope", version: 1, buildings: [] })).toBeNull();
    expect(parseBuildingsFile({ format: "forest-empire.buildings", version: 1, buildings: [{ id: "x" }] })).toBeNull();
  });

  it("keeps ids unique per civ", () => {
    const file: BuildingsFile = {
      format: "forest-empire.buildings",
      version: 1,
      buildings: [emptyDraft("roman", "hut"), emptyDraft("egyptian", "hut")],
    };
    expect(uniqueId(file.buildings, "roman", "hut")).toBe("hut_2");
    expect(uniqueId(file.buildings, "asian", "hut")).toBe("hut");
  });

  it("parses the committed assets/game_data file", () => {
    const raw = JSON.parse(readFileSync(new URL("../../assets/game_data/buildings.json", import.meta.url), "utf8")) as unknown;
    const parsed = parseBuildingsFile(raw);
    expect(parsed?.buildings.length).toBeGreaterThan(50);
    const lumberjack = parsed?.buildings.find((b) => b.civ === "roman" && b.id === "lumberjack");
    expect(lumberjack?.buildMarks.length).toBe(6);
    expect(lumberjack?.job.type).toBe("gather");
  });
});
