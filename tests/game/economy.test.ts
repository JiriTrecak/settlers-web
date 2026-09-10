import { describe, it, expect } from "vitest";
import { game, placed, physical, run, worker } from "./helpers";
import { Game } from "../../src/sim/game/game";
import { slots } from "./helpers";

describe("declarative physical economy", () => {
  it("S01 constructs a barracks from hall stores and transforms the same settler into a warrior", () => {
    const g = game(),
      w = worker(g),
      before = physical(g, "item.wood");
    expect(
      g.command("player.1", {
        type: "build",
        actor: w.id,
        definition: "building.ants.barracks",
        position: { x: 205, y: 210 },
      }).accepted,
    ).toBe(true);
    expect(physical(g, "item.wood")).toBe(before);
    const b = g.entities.at(-1)!;
    expect(b.construction).toBeDefined();
    run(g, 1000);
    expect(b.construction).toBeUndefined();
    expect(
      g.command("player.1", {
        type: "produce",
        actor: b.id,
        definition: "unit.ants.warrior",
      }).accepted,
    ).toBe(true);
    const ids = g.entities.filter((e) => e.unit).map((e) => e.id);
    run(g, 900);
    expect(b.production?.queue).toEqual([]);
    expect(b.production?.produced).toBe(1);
    expect(ids.every(id=>!!g.context.get(id))).toBe(true);
    expect(
      g.entities.filter(
        (e) => e.owner === "player.1" && e.definition === "unit.ants.warrior",
      ),
    ).toHaveLength(3);
    const bill = g.registry
      .get(b.definition)
      .creation!.items.find((p) => p.item === "item.wood")!.amount;
    const price = g.registry.get("unit.ants.warrior").creation!.items.find(p=>p.item==="item.wood")?.amount??0;
    expect(physical(g, "item.wood")).toBe(before - bill - price);
  });
  it("S02 one unassigned settler can construct without a carrier relay", () => {
    const g = game([], (s) => {
      const r = s.rules as any;
      r.startingSetup.units = r.startingSetup.units
        .filter((u: any) => u.definition === "unit.ants.settler")
        .slice(0, 1);
    });
    const w = worker(g);
    expect(
      g.command("player.1", {
        type: "build",
        actor: w.id,
        definition: "building.ants.barracks",
        position: { x: 205, y: 210 },
      }).accepted,
    ).toBe(true);
    const b = g.entities.at(-1)!;
    run(g, 1600);
    expect(b.construction).toBeUndefined();
    expect(g.state.jobs).toHaveLength(0);
  });
  it("S04 two barracks cannot reserve one settler twice", () => {
    const g = game(
      [
        placed("a", "building.ants.barracks", 205, 210, {
          inventory: { "item.wood": 1 },
        }),
        placed("b", "building.ants.barracks", 230, 210, {
          inventory: { "item.wood": 1 },
        }),
      ],
      (s) => {
        const r = s.rules as any;
        r.startingSetup.units = r.startingSetup.units
          .filter((u: any) => u.definition === "unit.ants.settler")
          .slice(0, 1);
      },
    );
    for (const b of g.entities.filter((e) => e.production))
      g.command("player.1", {
        type: "produce",
        actor: b.id,
        definition: "unit.ants.warrior",
      });
    run(g, 450);
    expect(
      g.entities.filter(
        (e) => e.owner === "player.1" && e.definition === "unit.ants.warrior",
      ),
    ).toHaveLength(1);
    expect(
      g.entities
        .filter((e) => e.production)
        .reduce((n, b) => n + b.production!.queue.length, 0),
    ).toBe(1);
  });
  it("S07 cancels partial construction and returns its reserved cost to the hall", () => {
    const g = game(),
      w = worker(g),
      before = physical(g, "item.wood");
    g.command("player.1", {
      type: "build",
      actor: w.id,
      definition: "building.ants.barracks",
      position: { x: 205, y: 210 },
    });
    const b = g.entities.at(-1)!;
    run(g, 50);
    expect(
      g.command("player.2", { type: "cancel", actor: b.id }).accepted,
    ).toBe(false);
    expect(
      g.command("player.1", { type: "cancel", actor: b.id }).accepted,
    ).toBe(true);
    run(g, 300);
    expect(physical(g, "item.wood")).toBe(before);
    expect(g.state.jobs.some((j) => j.target === b.id)).toBe(false);
  });
  it("S09 finishes carrying a harvest before following a manual destination", () => {
    const g=game([{...placed("tree","resource.forest.tree",217,228,{amount:8}),owner:"none"}]),w=worker(g);
    const tree=g.entities.find(e=>e.placement==="tree")!;
    expect(g.command("player.1",{type:"gather",actors:[w.id],target:tree.id}).accepted).toBe(true);
    let carrier;
    for (let i = 0; i < 800 && !carrier; i++) {
      g.tick();
      carrier = g.entities.find((e) => e.unit?.cargo);
    }
    expect(carrier).toBeDefined();
    g.command("player.1", {
      type: "move",
      actors: [carrier!.id],
      destination: { x: 235, y: 235 },
    });
    expect(carrier!.unit!.pendingMove).toEqual({ x: 235, y: 235 });
    // Stop at arrival: a free worker may subsequently begin an idle stroll.
    for (let i = 0; i < 1600 && (carrier!.x !== 235 || carrier!.y !== 235); i++) g.tick();
    expect(carrier!.unit!.cargo).toBeNull();
    expect(carrier!.x).toBe(235);
    expect(carrier!.y).toBe(235);
  });
  it("S10 deployment blocked retains input, queue and identity; cancellation releases exactly once", () => {
    const g = game([
        placed("b", "building.ants.barracks", 205, 210, {
          inventory: { "item.wood": 1 },
        }),
      ]),
      b = g.entities.find((e) => e.placement === "b")!;
    g.command("player.1", {
      type: "produce",
      actor: b.id,
      definition: "unit.ants.warrior",
    });
    while (
      !b.production!.active?.worker ||
      !g.context.get(b.production!.active.worker)?.unit?.contained
    )
      g.tick();
    const id = b.production!.active!.worker!,
      original = g.context.get(id)!,
      nearest = g.spatial.nearest.bind(g.spatial);
    g.spatial.nearest = () => null;
    run(g, 500);
    expect(original.definition).toBe("unit.ants.settler");
    expect(b.inventory["item.amber"]).toBe(g.economy.price("unit.ants.warrior")["item.amber"]);
    expect(b.production!.queue).toHaveLength(1);
    g.command("player.1", {
      type: "cancel",
      actor: b.id,
      queue: b.production!.queue[0]!.id,
    });
    expect(original.unit!.release).not.toBeNull();
    const save = g.snapshot(),
      restored = new Game(g.map, slots, g.registry);
    restored.restore(save);
    expect(restored.checksum()).toBe(g.checksum());
    g.spatial.nearest = nearest;
    run(g, 4);
    expect(original.unit!.release).toBeNull();
    expect(g.entities.filter((e) => e.id === id)).toHaveLength(1);
  });
  it("S21 save during recruitment and training resumes the same future simulation", () => {
    const g = game([placed("b", "building.ants.barracks", 205, 210)]),
      b = g.entities.find((e) => e.placement === "b")!;
    g.command("player.1", {
      type: "produce",
      actor: b.id,
      definition: "unit.ants.warrior",
    });
    run(g, 60);
    const restored = new Game(g.map, slots, g.registry);
    restored.restore(g.snapshot());
    expect(restored.checksum()).toBe(g.checksum());
    for (let i = 0; i < 500; i++) {
      g.tick();
      restored.tick();
      if (i % 100 === 0) expect(restored.checksum()).toBe(g.checksum());
    }
    expect(restored.snapshot()).toEqual(g.snapshot());
  });
});
