import { describe, it, expect } from "vitest";
import { content } from "../../src/content/builtin";
import { CAMP_LOOT, campCompositions } from "../../src/content/campCompositions";
import { emptyUtcMap } from "../../src/shared";
import { deleteCamp, placeCamp } from "../../src/editor/world/entityAuthoring";

/** Editor camp stamps: one composition → all members plus a single camp record.
 * ENGINE-COUPLED content validation: placeCamp reads the shipped compositions (content/neutral-camps.json) and the global
 * shipped content, so these tests iterate every shipped composition generically instead of naming any of them. */
const strength = (definition: string) => {
  const d = content.get(definition);
  return [d.level ?? 1, d.body?.maxHp ?? 0] as const;
};
const memberCount = (id: string) => Object.values(campCompositions.find((c) => c.id === id)!.members).reduce((a, b) => a + b, 0);
describe("camp stamps", () => {
  it.each(campCompositions.map((c) => [c.id]))("stamps %s as one camp on distinct cells with the strongest member at home", (id) => {
    const c = campCompositions.find((k) => k.id === id)!,
      map = placeCamp(emptyUtcMap(), { composition: id, position: { x: 100, y: 100 }, rotation: 90 });
    const total = memberCount(id);
    expect(map.camps).toHaveLength(1);
    expect(map.entities).toHaveLength(total);
    expect(map.camps[0]!.members).toEqual(map.entities.map((e) => e.id));
    // Difficulty selects the loot tier.
    expect(map.camps[0]!.lootPool).toBe(CAMP_LOOT[c.difficulty]);
    expect(new Set(map.entities.map((e) => `${e.position.x},${e.position.y}`)).size).toBe(total);
    for (const e of map.entities) {
      expect(e.owner).toBe("none");
      expect(content.get(e.definition).behaviors.campDefense).toBeTruthy();
      expect(Math.hypot(e.position.x - 100, e.position.y - 100)).toBeLessThan(10);
    }
    // The chief is the strongest member: highest level, ties broken by HP.
    const [level, hp] = strength(map.entities[0]!.definition);
    for (const e of map.entities) {
      const [l, h] = strength(e.definition);
      expect(l < level || (l === level && h <= hp)).toBe(true);
    }
    expect(map.entities[0]!.position).toEqual({ x: 100, y: 100 });
  });

  it("replaces a camp stamped with the same id and deletes it with its members", () => {
    const [first, second = first] = campCompositions.map((c) => c.id);
    let map = placeCamp(emptyUtcMap(), { composition: first!, position: { x: 60, y: 60 }, id: "camp/den" });
    map = placeCamp(map, { composition: second!, position: { x: 80, y: 60 }, id: "camp/den", legendary: true });
    expect(map.camps.map((c) => [c.id, c.legendary])).toEqual([["camp/den", true]]);
    expect(map.camps[0]!.lootPool).not.toBe(CAMP_LOOT[campCompositions.find((c) => c.id === second)!.difficulty]);
    expect(map.entities).toHaveLength(memberCount(second!));
    expect(map.entities.every((e) => e.id.startsWith("camp.den."))).toBe(true);
    expect(deleteCamp(map, "camp/den")).toMatchObject({ entities: [], camps: [] });
  });
});
