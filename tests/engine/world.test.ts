import { describe, expect, it } from "vitest";
import { emptyUtcMap } from "../../src/shared/map/utcmap";
import { World } from "../../src/sim/world/world";
const slots = [
  { player: 0, kind: "human" as const },
  { player: 1, kind: "ai" as const },
];
describe("map-backed match", () => {
  it("requires one declared start for every participant and rejects duplicate slots", () => {
    const map = emptyUtcMap();
    expect(() => new World({ map, slots: slots.slice(0, 1), seed: 1 })).toThrow(
      /starts/,
    );
    expect(
      () => new World({ map, slots: [slots[0]!, slots[0]!], seed: 1 }),
    ).toThrow(/starts/);
    const world = new World({ map, slots, seed: 1 });
    expect(world.slots).toEqual(slots);
    for (const start of map.playerStarts) {
      const fort = world.settlement.entities.find(
        (e) => e.placement === start.mainFort,
      )!;
      expect({ x: fort.x, y: fort.y }).toEqual({ x: start.x, y: start.z });
    }
  });
  it("participant order does not change allocation or future simulation", () => {
    const map = emptyUtcMap();
    const a = new World({ map, slots, seed: 7 }),
      b = new World({ map, slots: [...slots].reverse(), seed: 7 });
    expect(a.checksum()).toBe(b.checksum());
    for (let i = 0; i < 10; i++) {
      a.tick();
      b.tick();
    }
    expect(a.checksum()).toBe(b.checksum());
  });
  it("a changed team is a different match and cannot load its state", () => {
    const map = emptyUtcMap();
    const a = new World({ map, slots, seed: 7 });
    const b = new World({
      map,
      slots: slots.map((s) => ({ ...s, team: 0 })),
      seed: 7,
    });
    expect(a.checksum()).not.toBe(b.checksum());
    expect(() => b.restore(a.snapshot())).toThrow(/world save/);
  });
});
