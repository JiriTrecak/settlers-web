import { expect, it } from "vitest";
import { game, placed, worker } from "./helpers";

function setup(withWorks = true) {
  return game([
    {...placed("root", "building.neutral.corrupted-root", 228, 229), owner: "none"},
    ...(withWorks ? [placed("works", "building.ants.rootworks", 235, 220)] : []),
  ]);
}

it("does not substitute the Mound for a specialized drop-off", () => {
  const g = setup(false), w = worker(g), root = g.entities.find(e => e.placement === "root")!;
  g.command(w.owner, {type: "gather", actors: [w.id], target: root.id});
  for (let i = 0; i < 300; i++) g.tick();
  expect(w.unit!.job).toBeNull(); expect(w.unit!.cargo).toBeNull();
  expect(root.resource!.amount).toBe(3000);
});

it("delivers ten Root to Rootworks, credits the colony, and retains earned currency after its destruction", () => {
  const g = setup(), w = worker(g), root = g.entities.find(e => e.placement === "root")!;
  const works = g.entities.find(e => e.placement === "works")!, mound = g.context.get(g.state.objectives[w.owner])!;
  g.command(w.owner, {type: "gather", actors: [w.id], target: root.id});
  g.tick();
  expect(g.state.jobs.find(j => j.worker === w.id)?.target).toBe(works.id);
  for (let i = 0; i < 1800 && !mound.inventory["item.root"]; i++) g.tick();
  expect(mound.inventory["item.root"]).toBe(10);
  expect(works.inventory["item.root"] ?? 0).toBe(0);
  expect(g.economy.available(mound, "item.root")).toBe(10);
  g.economy.remove(works);
  expect(mound.inventory["item.root"]).toBe(10);
});

it("admits only five assigned Root gatherers and saves their shared resource state", () => {
  const g = setup(), root = g.entities.find(e => e.placement === "root")!;
  g.context.create(placed("extra", "unit.ants.settler", 210, 210));
  const workers = g.entities.filter(e => e.owner === "player.1" && g.registry.get(e.definition).behaviors.work);
  const result = g.command("player.1", {type: "gather", actors: workers.map(e => e.id), target: root.id});
  expect(result.actors).toHaveLength(5);
  expect(workers.filter(w => w.unit!.order?.type === "gather")).toHaveLength(5);
  g.tick();
  expect(g.view("player.1").entities.find(e => e.id === root.id)?.gathering).toEqual({workers: 5, capacity: 5});
  const restored = setup(); restored.restore(g.snapshot());
  for (let i = 0; i < 300; i++) {g.tick(); restored.tick();}
  expect(restored.snapshot()).toEqual(g.snapshot());
});

it("carries the final partial load without creating more Root than the deposit holds", () => {
  const g = setup(), root = g.entities.find(e => e.placement === "root")!, w = worker(g);
  root.resource!.amount = 7;
  const mound = g.context.get(g.state.objectives[w.owner])!;
  g.command(w.owner, {type: "gather", actors: [w.id], target: root.id});
  for (let i = 0; i < 1800 && !mound.inventory["item.root"]; i++) g.tick();
  expect(mound.inventory["item.root"]).toBe(7);
  expect(root.resource!.amount).toBe(0);
  for (let i = 0; i < 200; i++) g.tick();
  expect(mound.inventory["item.root"]).toBe(7);
});
