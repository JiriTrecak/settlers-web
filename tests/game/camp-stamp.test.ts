import { describe, it, expect } from "vitest";
import { content } from "../../src/content/builtin";
import { campCompositions } from "../../src/content/campCompositions";
import { emptyUtcMap } from "../../src/shared";
import { deleteCamp, placeCamp } from "../../src/editor/world/entityAuthoring";

/** Editor camp stamps: one composition → all members plus a single camp record. */
describe("camp stamps", () => {
  it.each(campCompositions.map((c) => [c.id]))("stamps %s as one camp on distinct cells", (id) => {
    const c = campCompositions.find((k) => k.id === id)!,
      map = placeCamp(emptyUtcMap(), { composition: id, position: { x: 100, y: 100 }, rotation: 90 });
    const total = Object.values(c.members).reduce((a, b) => a + b, 0);
    expect(map.camps).toHaveLength(1);
    expect(map.entities).toHaveLength(total);
    expect(map.camps[0]!.members).toEqual(map.entities.map((e) => e.id));
    expect(new Set(map.entities.map((e) => `${e.position.x},${e.position.y}`)).size).toBe(total);
    for (const e of map.entities) {
      expect(e.owner).toBe("none");
      expect(content.get(e.definition).behaviors.campDefense).toBeTruthy();
      expect(Math.hypot(e.position.x - 100, e.position.y - 100)).toBeLessThan(10);
    }
    const leader = content.get(map.entities[0]!.definition).level ?? 1;
    expect(map.entities.every((e) => (content.get(e.definition).level ?? 1) <= leader)).toBe(true);
    expect(map.entities[0]!.position).toEqual({ x: 100, y: 100 });
  });

  it("replaces a camp stamped with the same id and deletes it with its members", () => {
    let map = placeCamp(emptyUtcMap(), { composition: "hungry-weblings", position: { x: 60, y: 60 }, id: "camp/den" });
    map = placeCamp(map, { composition: "rotwood-court", position: { x: 80, y: 60 }, id: "camp/den", legendary: true });
    expect(map.camps.map((c) => [c.id, c.lootPool, c.legendary])).toEqual([["camp/den", "loot.camp.legendary", true]]);
    expect(map.entities).toHaveLength(6);
    expect(map.entities.every((e) => e.id.startsWith("camp.den."))).toBe(true);
    expect(deleteCamp(map, "camp/den")).toMatchObject({ entities: [], camps: [] });
  });

  it("breaks level ties by HP so the camp's chief stands at home", () => {
    const map = placeCamp(emptyUtcMap(), { composition: "bog-toad-hunters", position: { x: 50, y: 50 } });
    expect(map.entities[0]).toMatchObject({ definition: "unit.neutral.young-toad", position: { x: 50, y: 50 } });
  });

  it("maps difficulty to the camp loot tier", () => {
    const loot = (composition: string) =>
      placeCamp(emptyUtcMap(), { composition, position: { x: 50, y: 50 } }).camps[0]!.lootPool;
    expect([loot("dewdrop-sprites"), loot("hornet-raiders"), loot("hollow-stag")]).toEqual([
      "loot.camp.easy",
      "loot.camp.medium",
      "loot.camp.hard",
    ]);
  });
});
