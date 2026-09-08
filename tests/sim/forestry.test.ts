import { describe, it, expect } from "vitest";
import { Settlement } from "../../src/sim/settlement/settlement";
import {
  stockpileLayout,
  ITEM_HEIGHT,
} from "../../src/shared/settlement/stockpile";
import type { UtcMap, Slot } from "../../src/shared";
const slots: Slot[] = [
  { player: 0, kind: "human" },
  { player: 1, kind: "human" },
];
const map: UtcMap = {
  v: 1,
  waterLevel: -1, name: "Forestry",
  playerStarts: [
    { player: 1, x: 218, z: 218 },
    { player: 2, x: 38, z: 38 },
  ],
  stamps: [{ id: "tree", asset: "pine-chunky", x: 198.5, y: 217.5 }],
};
describe("forestry economy and main fort", () => {
  it("starts with exactly one non-buildable fort per player and ends when it falls", () => {
    const s = new Settlement(map, slots),
      fort = s.buildings.find((b) => b.owner === 0)!;
    expect(s.buildings.map((b) => b.kind)).toEqual(["fort", "fort"]);
    expect(s.command(0, { type: "build", kind: "fort", x: 230, z: 218 })).toBe(
      false,
    );
    expect(s.damageBuilding(fort.id, 999)).toBe(true);
    expect(s.outcome).toBeNull();
    expect(fort.health).toBe(1);
    expect(s.damageBuilding(fort.id, 1)).toBe(true);
    expect(s.outcome).toEqual({ winner: 1, defeated: [0] });
    const checksum = s.checksum();
    s.tick(100);
    expect(s.checksum()).toBe(checksum);
    expect(s.command(0, { type: "build", kind: "house", x: 230, z: 218 })).toBe(
      false,
    );
  });
  it("carries logs through the sawmill, delivers planks, and replants harvested trees", () => {
    const s = new Settlement(map, slots);
    expect(
      s.command(0, { type: "build", kind: "lumberjack", x: 204, z: 218 }),
    ).toBe(true);
    expect(
      s.command(0, { type: "build", kind: "sawmill", x: 218, z: 233 }),
    ).toBe(true);
    expect(
      s.command(0, { type: "build", kind: "forester", x: 231, z: 218 }),
    ).toBe(true);
    let logs = false,
      planks = false,
      regrowing = false,
      regrown = false;
    for (let t = 1; t <= 16000; t++) {
      s.tick(t);
      logs ||= s.buildings.some((b) => b.inventory.log > 0);
      planks ||= s.buildings.some((b) => b.inventory.plank > 0);
      regrowing ||= s.resources[0]!.growth > 0;
      regrown ||=
        regrowing && s.resources[0]!.growth === 0 && s.resources[0]!.amount > 0;
      expect(
        s.buildings.every(
          (b) => b.inventory.log + b.inventory.plank + b.inventory.stone <= 16,
        ),
      ).toBe(true);
    }
    expect(logs && planks && regrowing && regrown).toBe(true);
    expect(s.colonies[0]!.stock.wood).toBeGreaterThan(20);
    expect(s.workers.some((w) => w.role === "sawyer")).toBe(true);
    expect(s.workers.some((w) => w.role === "forester")).toBe(true);
  });
  it("caps rendered inventory at 16 with no floating gaps or blocked entrance lane", () => {
    for (const stock of [
      { log: 40, plank: 0, stone: 0 },
      { log: 0, plank: 40, stone: 30 },
      { log: 0, plank: 0, stone: 16 },
    ]) {
      const pile = stockpileLayout(stock, 4);
      expect(pile).toHaveLength(16);
      const heights = new Map<string, number>();
      for (const item of pile) {
        const key = `${item.x},${item.z}`;
        expect(item.y).toBeCloseTo(heights.get(key) ?? 0, 10);
        heights.set(key, item.y + ITEM_HEIGHT[item.kind]);
        expect(Math.abs(item.x)).toBeGreaterThan(1);
      }
    }
    expect(stockpileLayout({ log: 0, plank: 0, stone: 0 }, 3)).toEqual([]);
    expect(stockpileLayout({ log: 2, plank: 1, stone: 0 }, 3)).toHaveLength(3);
  });
});
