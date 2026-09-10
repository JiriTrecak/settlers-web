import { describe, expect, it } from "vitest";
import { Game } from "../../src/sim/game/game";
import { MAX_QUEUED_ORDERS } from "../../src/sim/game/state";
import { game, placed, run, slots, worker } from "./helpers";

function until(g: Game, predicate: () => boolean, limit = 5000) {
  for (let i = 0; i < limit && !predicate(); i++) g.tick();
  expect(predicate()).toBe(true);
}
const move = (g: Game, id: number, x: number, y: number, append = false) =>
  g.command("player.1", {type: "move", actors: [id], destination: {x, y}, append});

describe("per-unit order queues", () => {
  it("visits waypoints in order and restores the same future from the middle", () => {
    const g = game(), w = worker(g), points = [{x: 232, y: 235}, {x: 240, y: 225}, {x: 230, y: 215}];
    for (const [i, p] of points.entries()) expect(move(g, w.id, p.x, p.y, i > 0).accepted).toBe(true);
    expect(w.unit!.orderQueue).toHaveLength(2);
    const restored = new Game(g.map, slots, g.registry); restored.restore(g.snapshot());
    const visited = new Set<number>();
    for (let i = 0; i < 5000 && (w.unit!.order || w.unit!.orderQueue.length); i++) {
      g.tick(); restored.tick();
      points.forEach((p, i) => {if (Math.hypot(w.x - p.x, w.y - p.y) < 1.2) visited.add(i);});
    }
    expect([...visited]).toEqual([0, 1, 2]);
    expect(w.unit!.order).toBeNull(); expect(w.unit!.orderQueue).toEqual([]);
    expect(restored.checksum()).toBe(g.checksum());
  });
  it("normal commands and Stop replace the sequence, with a bounded append limit", () => {
    const g = game(), w = worker(g);
    move(g, w.id, 230, 235);
    for (let i = 0; i < MAX_QUEUED_ORDERS; i++) expect(move(g, w.id, 235, 235, true).accepted).toBe(true);
    expect(move(g, w.id, 240, 240, true).accepted).toBe(false);
    expect(w.unit!.orderQueue).toHaveLength(MAX_QUEUED_ORDERS);
    expect(move(g, w.id, 240, 230).accepted).toBe(true);
    expect(w.unit!.orderQueue).toEqual([]);
    move(g, w.id, 235, 235, true);
    g.command("player.1", {type: "stop", actors: [w.id]});
    expect(w.unit!.order).toBeNull(); expect(w.unit!.orderQueue).toEqual([]);
  });
  it("gives each selected actor its own formation waypoints", () => {
    const g = game(), actors = g.entities.filter(e => e.owner === "player.1" && e.unit).slice(0, 3);
    for (const x of [230, 240]) expect(g.command("player.1", {type: "move", actors: actors.map(e => e.id), destination: {x, y: 235}, append: true}).accepted).toBe(true);
    expect(new Set(actors.map(e => JSON.stringify(e.unit!.orderQueue[0]))).size).toBe(3);
    g.command("player.1", {type: "stop", actors: [actors[0].id]});
    expect(actors[0].unit!.orderQueue).toHaveLength(0);
    expect(actors[1].unit!.orderQueue).toHaveLength(1);
  });
  for (const definition of ["resource.forest.tree", "building.neutral.amber-mine"]) {
    it(`finishes one ${definition} load and deposits it before the next order`, () => {
      const g = game([{...placed("source", definition, 228, 229), owner: "none"}]), w = worker(g);
      const resource = g.entities.find(e => e.placement === "source")!, hall = g.context.get(g.state.objectives["player.1"])!;
      const item = definition === "resource.forest.tree" ? "item.wood" : "item.amber", before = hall.inventory[item];
      expect(g.command("player.1", {type: "gather", actors: [w.id], target: resource.id}).accepted).toBe(true);
      move(g, w.id, 240, 238, true);
      until(g, () => w.unit!.order?.type === "move");
      expect(hall.inventory[item]).toBe(before + 10);
      expect(w.unit!.cargo).toBeNull(); expect(w.unit!.job).toBeNull();
      until(g, () => !w.unit!.order);
      expect(Math.hypot(w.x - 240, w.y - 238)).toBeLessThan(1.2);
    });
  }
  it("reserves consecutive build sites for the selected worker and pays only once", () => {
    const g = game(), w = worker(g), hall = g.context.get(g.state.objectives["player.1"])!;
    for (const [i, x] of [205, 230].entries()) {
      const r = g.command("player.1", {type: "build", actors: [w.id], definition: "building.ants.house", position: {x, y: 210}, append: i > 0});
      expect(r.accepted, r.reason).toBe(true);
    }
    const [a, b] = g.entities.filter(e => e.construction), amber = hall.inventory["item.amber"];
    expect(w.unit!.orderQueue).toEqual([{type: "construct", target: b.id}]);
    run(g, 120);
    expect(g.state.jobs.some(j => j.target === b.id)).toBe(false);
    expect(b.construction!.progress).toBe(0);
    until(g, () => !a.construction);
    until(g, () => g.state.jobs.some(j => j.target === b.id && j.worker === w.id));
    until(g, () => !b.construction);
    expect(hall.inventory["item.amber"]).toBe(amber);
  });
  it("continues after an explicit attack target is removed and skips stale pending targets", () => {
    const g = game(), a = g.entities.find(e => e.owner === "player.1" && e.definition === "unit.ants.warrior")!;
    const target = worker(g);
    expect(g.command("player.1", {type: "attack", actors: [a.id], target: target.id, force: true}).accepted).toBe(true);
    g.command("player.1", {type: "attack", actors: [a.id], target: target.id, force: true, append: true});
    move(g, a.id, 240, 238, true);
    target.hp = 0; run(g, 4);
    expect(a.unit!.order?.type).toBe("move");
    expect(a.unit!.orderQueue).toEqual([]);
  });
  it("keeps opponent queues private and pending workers unavailable for recruitment", () => {
    const g = game(), w = worker(g);
    move(g, w.id, 230, 235); move(g, w.id, 235, 235, true);
    g.observation.update();
    expect(g.view("player.1").entities.find(e => e.id === w.id)!.control!.orderQueue).toHaveLength(1);
    const enemy = g.entities.find(e => e.owner === "player.2" && e.unit)!;
    enemy.x = w.x + 2; enemy.y = w.y; g.observation.update();
    expect(g.view("player.2").entities.find(e => e.id === w.id)!.control).toBeUndefined();
    w.unit!.order = null;
    g.observation.update();
    expect(g.view("player.1").population!.available).toBe(4);
  });
});
