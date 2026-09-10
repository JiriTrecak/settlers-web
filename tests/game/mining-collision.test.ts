import { expect, it } from "vitest";
import { fixed } from "../../src/sim/game/motion";
import { game, placed, worker } from "./helpers";

it("amber assignments pass through units in planning and motion, but still respect solid terrain", () => {
  const g = game([{...placed("mine", "building.neutral.amber-mine", 228, 229), owner: "none"}]);
  const w = worker(g), mine = g.entities.find(e => e.placement === "mine")!;
  const blocker = g.entities.find(e => e.owner === w.owner && e.definition === "unit.ants.warrior")!;
  expect(g.command(w.owner, {type: "gather", actors: [w.id], target: mine.id}).accepted).toBe(true);
  w.x = 100; w.y = 100; blocker.x = 101; blocker.y = 100;
  expect(g.spatial.free(blocker, w.id)).toBe(true);
  expect(g.spatial.unitSegmentClear(fixed(w), fixed({x: 102, y: 100}), w.id)).toBe(true);
  expect(g.spatial.route(w, {x: 102, y: 100})).toBe(true);
  expect(w.unit!.route).toEqual([g.spatial.cell({x: 102, y: 100})]);
  for (let i = 0; i < 30; i++) g.context.move();
  expect(w.x).toBe(102);
  g.spatial.occupied[g.spatial.cell({x: 103, y: 100})] = 999;
  expect(g.spatial.clearSegment(fixed(w), fixed({x: 104, y: 100}))).toBe(false);
  g.command(w.owner, {type: "move", actors: [w.id], destination: {x: 100, y: 100}});
  expect(g.spatial.free(blocker, w.id)).toBe(false);
  expect(g.spatial.unitSegmentClear(fixed(w), fixed({x: 100, y: 100}), w.id)).toBe(false);
});

it("wood gatherers retain unit collisions; a queued mine order does not grant passing early", () => {
  const g = game([
    {...placed("mine", "building.neutral.amber-mine", 228, 229), owner: "none"},
    {...placed("tree", "resource.forest.tree", 228, 235), owner: "none"},
  ]), w = worker(g);
  const tree = g.entities.find(e => e.placement === "tree")!, mine = g.entities.find(e => e.placement === "mine")!;
  const blocker = g.entities.find(e => e.owner === w.owner && e.definition === "unit.ants.warrior")!;
  g.command(w.owner, {type: "gather", actors: [w.id], target: tree.id});
  g.command(w.owner, {type: "gather", actors: [w.id], target: mine.id, append: true});
  expect(g.spatial.free(blocker, w.id)).toBe(false);
});
