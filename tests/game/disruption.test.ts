import { describe, it, expect } from "vitest";
import { game, placed, physical, run, worker, slots } from "./helpers";
import { Game } from "../../src/sim/game/game";

describe("work disruption and capacity", () => {
  it("S05 protects a nearly full queue-head bill from tail demand", () => {
    const g = game([placed("b", "building.ants.barracks")], (s) => {
        const b = s.definitions.find(
          (d: any) => d.id === "building.ants.barracks",
        ) as any;
        b.behaviors.storage.accepts.push("item.stone");
        const w = s.definitions.find(
          (d: any) => d.id === "unit.ants.warrior",
        ) as any;
        w.creation.items = [
          { item: "item.plank", amount: 7 },
          { item: "item.stone", amount: 7 },
        ];
        w.creation.workTicks = 4;
      }),
      b = g.entities.find((e) => e.placement === "b")!;
    g.command("player.1", {
      type: "produce",
      actor: b.id,
      definition: "unit.ants.warrior",
    });
    g.command("player.1", {
      type: "produce",
      actor: b.id,
      definition: "unit.ants.archer",
    });
    run(g, 1100);
    expect(b.production!.produced).toBe(2);
    expect(b.production!.queue).toEqual([]);
  });
  it("S06 a full input store can consume a bill and commit its output in the same cycle", () => {
    const g = game([
        placed("mill", "building.ants.sawmill", 205, 210, {
          inventory: { "item.log": 16 },
        }),
      ]),
      b = g.entities.find((e) => e.placement === "mill")!;
    run(g, 250);
    expect(b.production!.produced).toBeGreaterThan(0);
    expect(g.state.accounting.produced["item.plank"]).toBeGreaterThan(0);
    expect(
      g.entities
        .filter((e) => e.production)
        .every(
          (e) =>
            Object.values(e.inventory).reduce((a, b) => a + b, 0) <=
            g.registry.get(e.definition).behaviors.storage!.capacity,
        ),
    ).toBe(true);
  });
  it("S08 source destruction removes stale claims and records physical loss", () => {
    const g = game([
        placed("store", "building.ants.fort", 235, 235, {
          inventory: { "item.plank": 20, "item.stone": 10 },
        }),
      ]),
      w = worker(g),
      fort = g.entities.find((e) => e.placement === "store")!;
    const primary = g.context.get(g.state.objectives["player.1"])!;
    primary.inventory = {};
    expect(
      g.command("player.1", {
        type: "build",
        actor: w.id,
        definition: "building.ants.house",
        position: { x: 205, y: 210 },
      }).accepted,
    ).toBe(true);
    g.economy.remove(fort);
    run(g, 20);
    expect(g.state.claims.some((c) => c.source === fort.id)).toBe(false);
    expect(g.state.accounting.lost["item.plank"]).toBe(20);
    expect(physical(g, "item.plank")).toBe(40);
  });
  it("S12 harvest reservations prevent two workplaces duplicating the last resource unit", () => {
    const g = game([
      placed("a", "building.ants.lumberjack", 205, 210),
      placed("b", "building.ants.lumberjack", 219, 200),
      {
        ...placed("tree", "resource.forest.tree", 207, 200, { amount: 1 }),
        owner: "none",
      },
    ]);
    run(g, 700);
    expect(g.state.accounting.produced["item.log"]).toBe(1);
    expect(physical(g, "item.log")).toBe(1);
    expect(
      g.entities.find((e) => e.placement === "tree")!.resource!.amount,
    ).toBe(0);
  });
  it("S13 planting survives restore and occupied growing sites delay maturity", () => {
    const g = game([
        placed("f", "building.ants.forester", 205, 210),
        {
          ...placed("tree", "resource.forest.tree", 200, 205, { amount: 0 }),
          owner: "none",
        },
      ]),
      tree = g.entities.find((e) => e.placement === "tree")!;
    for (let n = 0; n < 500 && tree.resource!.growingUntil === null; n++)
      g.tick();
    expect(tree.resource!.growingUntil).not.toBeNull();
    const restored = new Game(g.map, slots, g.registry);
    restored.restore(g.snapshot());
    expect(restored.checksum()).toBe(g.checksum());
    const w = worker(g);
    w.x = tree.x;
    w.y = tree.y;
    w.unit!.order = null;
    w.unit!.route = [];
    w.unit!.goal = null;
    tree.resource!.growingUntil = g.state.tick + 1;
    g.tick();
    expect(tree.resource!.amount).toBe(0);
    w.x += 1;
    g.tick();
    expect(tree.resource!.amount).toBe(g.registry.get(tree.definition).yield);
  });
  it("rejects corrupt snapshots before changing live state", () => {
    const g = game(),
      before = g.checksum(),
      save = g.snapshot();
    save.knowledge[1]!.owner = "player.7";
    expect(() => g.restore(save)).toThrow();
    expect(g.checksum()).toBe(before);
    const bad = g.snapshot();
    bad.state.entities.find((e) => e.unit)!.unit!.job = 999;
    expect(() => g.restore(bad)).toThrow();
    expect(g.checksum()).toBe(before);
  });
  it("dead staff can be replaced and the resulting snapshot remains valid", () => {
    const g = game([
        placed("mill", "building.ants.sawmill", 205, 210, {
          inventory: { "item.log": 3 },
        }),
      ]),
      b = g.entities.find((e) => e.placement === "mill")!;
    g.tick();
    const staff = g.context.get(b.production!.staff)!;
    expect(staff).toBeDefined();
    staff.hp = 0;
    g.economy.remove(staff);
    g.tick();
    const saved = g.snapshot(),
      r = new Game(g.map, slots, g.registry);
    expect(() => r.restore(saved)).not.toThrow();
  });
});
