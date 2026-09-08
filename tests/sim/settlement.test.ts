import { describe, expect, it } from "vitest";
import { World } from "../../src/sim/world/world";
import { Settlement } from "../../src/sim/settlement/settlement";
import { Navigation } from "../../src/sim/settlement/navigation";
import { type UtcMap, type Slot, type Action } from "../../src/shared";
const slots: Slot[] = [
  { player: 0, kind: "human" },
  { player: 1, kind: "human" },
];
const map: UtcMap = {
  v: 1,
  waterLevel: -1, name: "Economy test",
  playerStarts: [
    { player: 1, x: 218, z: 218 },
    { player: 2, x: 38, z: 38 },
  ],
  stamps: [
    { id: "tree-0", asset: "pine-chunky", x: 199.5, y: 217.5 },
    { id: "tree-1", asset: "pine-chunky", x: 200.5, y: 216.5 },
    { id: "stone", asset: "rock-rounded-cool", x: 205.5, y: 229.5 },
  ],
};
describe("settlement simulation", () => {
  it("marks rival tower ties contested and forbids construction across the border", () => {
    const sim = new Settlement(
      {
        v: 1,
        waterLevel: -1, name: "Border",
        stamps: [],
        playerStarts: [
          { player: 1, x: 100, z: 128 },
          { player: 2, x: 156, z: 128 },
        ],
      },
      slots,
    );
    expect(sim.territory[128 * 256 + 127]).toBe(0);
    expect(sim.territory[128 * 256 + 128]).toBe(-2);
    expect(sim.territory[128 * 256 + 129]).toBe(1);
    expect(
      sim.command(0, { type: "build", kind: "tower", x: 126, z: 128 }),
    ).toBe(false);
    expect(sim.colonies[0]!.stock).toEqual({ wood: 40, stone: 30 });
  });
  it("two lumberjacks stop at stockpile capacity without duplicating harvested goods", () => {
    const sim = new Settlement(map, slots);
    expect(
      sim.command(0, { type: "build", kind: "lumberjack", x: 208, z: 218 }),
    ).toBe(true);
    expect(
      sim.command(0, { type: "build", kind: "lumberjack", x: 218, z: 230 }),
    ).toBe(true);
    for (let t = 1; t <= 6000; t++) sim.tick(t);
    const stored = sim.buildings.reduce((n, b) => n + b.inventory.log, 0),
      remaining = sim.resources
        .filter((n) => n.kind === "wood")
        .reduce((n, r) => n + r.amount, 0),
      cargo = sim.workers
        .filter((w) => w.role === "lumberjack")
        .reduce((n, w) => n + w.quantity, 0);
    expect(stored).toBe(32);
    expect(stored + remaining + cargo).toBe(48);
    expect(sim.buildings.every((b) => b.inventory.log <= 16)).toBe(true);
    expect(sim.colonies[0]!.stock.wood).toBe(28);
  });

  it("constructs with carried material, assigns a lumberjack, and deposits logs into the hut stockpile", () => {
    const sim = new Settlement(map, slots);
    expect(
      sim.command(0, { type: "build", kind: "lumberjack", x: 208, z: 218 }),
    ).toBe(true);
    expect(sim.colonies[0]!.stock).toEqual({ wood: 34, stone: 28 });
    let cargo = false;
    for (let t = 1; t <= 3000; t++) {
      sim.tick(t);
      cargo ||= sim.workers.some((w) => w.role === "carrier" && w.quantity > 0);
    }
    expect(cargo).toBe(true);
    expect(sim.buildings.find((b) => b.kind === "lumberjack")?.complete).toBe(
      true,
    );
    expect(sim.workers.some((w) => w.role === "lumberjack")).toBe(true);
    expect(sim.colonies[0]!.stock.wood).toBe(34);
    expect(
      sim.buildings.find((b) => b.kind === "lumberjack")!.inventory.log,
    ).toBeGreaterThan(0);
  });
  it("refunds in-flight materials exactly once, and rejects foreign cancellation", () => {
    const sim = new Settlement(map, slots);
    sim.command(0, { type: "build", kind: "house", x: 208, z: 218 });
    const site = sim.buildings.find((b) => b.kind === "house")!;
    for (let t = 1; t < 100; t++) sim.tick(t);
    expect(sim.command(1, { type: "cancel-building", id: site.id })).toBe(
      false,
    );
    expect(sim.command(0, { type: "cancel-building", id: site.id })).toBe(true);
    expect(sim.colonies[0]!.stock).toEqual({ wood: 40, stone: 30 });
    expect(sim.command(0, { type: "cancel-building", id: site.id })).toBe(
      false,
    );
  });
  it("rejects foreign land, overlaps, malformed commands and overspending", () => {
    const sim = new Settlement(map, slots),
      stock = { ...sim.colonies[0]!.stock };
    for (const a of [
      { type: "build", kind: "house", x: 38, z: 38 },
      { type: "build", kind: "house", x: 218, z: 218 },
      { type: "build", kind: "house", x: NaN, z: 218 },
      { type: "build", kind: "unknown", x: 208, z: 218 },
    ])
      expect(sim.command(0, a as Action)).toBe(false);
    expect(sim.colonies[0]!.stock).toEqual(stock);
    sim.colonies[0]!.stock.wood = 0;
    expect(
      sim.command(0, { type: "build", kind: "house", x: 208, z: 218 }),
    ).toBe(false);
  });
  it("expands territory only after tower construction completes", () => {
    const sim = new Settlement(map, slots),
      cell = 218 * 256 + 165;
    expect(sim.territory[cell]).toBe(-1);
    expect(
      sim.command(0, { type: "build", kind: "tower", x: 190, z: 218 }),
    ).toBe(true);
    expect(sim.territory[cell]).toBe(-1);
    for (let t = 1; t < 3000; t++) sim.tick(t);
    expect(sim.territory[cell]).toBe(0);
  });
  it("replays packet arrival permutations to the same full state", () => {
    const a = new World({ slots, seed: 7, map }),
      b = new World({ slots, seed: 7, map });
    const commands = [
      { type: "build", kind: "lumberjack", x: 208, z: 218 },
      { type: "build", kind: "stonemason", x: 218, z: 230 },
    ] as const;
    commands.forEach((c, i) => a.enqueue(c, 2, { player: 0, seq: i }));
    [...commands]
      .reverse()
      .forEach((c, i) => b.enqueue(c, 2, { player: 0, seq: 1 - i }));
    for (let t = 0; t < 2500; t++) {
      a.tick();
      b.tick();
      if (t % 200 === 0) expect(a.checksum()).toBe(b.checksum());
    }
    expect(a.checksum()).toBe(b.checksum());
    expect(a.settlement!.colonies[0]!.stock.stone).toBeGreaterThan(26);
    b.settlement!.workers[0]!.timer++;
    expect(a.checksum()).not.toBe(b.checksum());
  });
  it("uses stable cardinal paths around obstacles", () => {
    const nav = new Navigation(5, (_a, b) => ![7, 12, 17].includes(b)),
      path = nav.path(10, 14)!;
    expect(path).toEqual(nav.path(10, 14));
    expect(path).not.toContain(12);
    let prior = 10;
    for (const next of path) {
      expect(
        Math.abs((next % 5) - (prior % 5)) +
          Math.abs(Math.floor(next / 5) - Math.floor(prior / 5)),
      ).toBe(1);
      prior = next;
    }
    expect(prior).toBe(14);
  });
});
