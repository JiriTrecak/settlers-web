import { describe, expect, it } from "vitest";
import { game, placed, run, slots } from "./helpers";
import { Game } from "../../src/sim/game/game";
import { commandCard } from "../../src/presentation/commands";

const workers = (g: Game) => g.entities.filter(e => e.owner === "player.1" && g.registry.get(e.definition).behaviors.work);
function build(g: Game, actors: number[], x: number, y: number) {
  const result = g.command("player.1", {type: "build", actors, definition: "building.ants.house", position: {x, y}});
  expect(result.accepted, result.reason).toBe(true);
  return {building: g.entities.at(-1)!, builder: result.actors[0]};
}

describe("selected construction workers", () => {
  it("uses selection order, then the next non-builder, then redirects the first", () => {
    const g = game(), [first, second] = workers(g).slice(0, 2).reverse();
    const selection = [first.id, second.id];
    const binding = commandCard(g.view("player.1"), selection, "player.1", g.registry)
      .find(b => b.type === "build" && b.targetDefinition === "building.ants.house")!;
    expect(binding.actors).toEqual(selection);
    const a = build(g, selection, 205, 210);
    const b = build(g, selection, 230, 210);
    expect(a.builder).toBe(first.id);
    expect(b.builder).toBe(second.id);
    g.tick();
    expect(g.state.jobs.find(j => j.target === a.building.id)?.worker).toBe(first.id);
    expect(g.state.jobs.find(j => j.target === b.building.id)?.worker).toBe(second.id);
    const c = build(g, selection, 205, 235);
    expect(c.builder).toBe(first.id);
    g.tick();
    expect(g.state.jobs.find(j => j.worker === first.id)?.target).toBe(c.building.id);
    expect(g.state.jobs.find(j => j.worker === second.id)?.target).toBe(b.building.id);
  });

  it("redirects a lone selected builder and preserves their new order across saves", () => {
    const g = game(), w = workers(g).at(-1)!;
    const a = build(g, [w.id], 205, 210);
    run(g, 4);
    const b = build(g, [w.id], 230, 210);
    expect(w.unit!.order).toEqual({type: "construct", target: b.building.id});
    const restored = new Game(g.map, slots, g.registry);
    restored.restore(g.snapshot());
    for (let i = 0; i < 500; i++) { g.tick(); restored.tick(); }
    expect(restored.checksum()).toBe(g.checksum());
    expect(g.state.jobs.some(j => j.worker === w.id && j.target === a.building.id)).toBe(false);
    expect(b.building.construction?.progress ?? 1).toBeGreaterThan(0);
  });

  it("keeps the selected carrier reserved until their harvest reaches the hall", () => {
    const g = game([{...placed("tree", "resource.forest.tree", 217, 228), owner: "none"}]);
    const w = workers(g).at(-1)!, tree = g.entities.find(e => e.placement === "tree")!;
    g.command("player.1", {type: "gather", actors: [w.id], target: tree.id});
    for (let i = 0; i < 1200 && !w.unit!.cargo; i++) g.tick();
    expect(w.unit!.cargo?.amount).toBe(10);
    const {building} = build(g, [w.id], 205, 210);
    g.tick();
    expect(g.state.jobs.some(j => j.type === "construct" && j.target === building.id)).toBe(false);
    for (let i = 0; i < 800 && !g.state.jobs.some(j => j.type === "construct" && j.worker === w.id); i++) g.tick();
    expect(w.unit!.cargo).toBeNull();
    expect(g.state.jobs.find(j => j.type === "construct" && j.target === building.id)?.worker).toBe(w.id);
  });
});
