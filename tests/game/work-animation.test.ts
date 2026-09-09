import { expect, it } from "vitest";
import { game, placed, worker } from "./helpers";
it("exposes declared work poses only after arrival, and never on the harvest return trip", () => {
  const g = game([placed("workshop", "building.ants.lumberjack")]);
  const w = worker(g), b = g.entities.find(e => e.placement === "workshop")!;
  const job = {id: 999, type: "construct" as const, worker: w.id, target: b.id,
    source: null, item: null, amount: 0, phase: "work" as const, progress: 0,
    queue: null, claim: null, internal: false};
  g.state.jobs.push(job); w.unit!.job = 999;
  const pose = () => {g.observation.update(); return g.view(0).entities.find(e => e.id === w.id)!.unit!.work;};
  expect(pose()).toMatchObject({animation: "build", x: b.x, y: b.y});
  w.unit!.route = [100];
  expect(pose()).toBeUndefined();
  w.unit!.route = [];
  const tree = g.context.create({id: "tree", definition: "resource.forest.tree", owner: "none", position: {x: 206, y: 210}, rotation: 0});
  Object.assign(job, {type: "harvest", source: tree.id, item: "item.wood"});
  b.production!.active = {definition: "item.wood", queue: null, worker: w.id, progress: 1};
  expect(pose()).toMatchObject({animation: "chop", x: tree.x, y: tree.y});
  Object.assign(job, {phase: "return"});
  expect(pose()).toBeUndefined();
});
