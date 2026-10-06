// Rally targets, rally-facing deployment, any-side drop-off and escape from interpenetrating bodies.
import { expect, it } from "vitest";
import { fixed } from "../../src/sim/game/motion";
import { game, placed, run, worker } from "./helpers";

function setup(extra: ReturnType<typeof placed>[] = []) {
  const g = game([placed("mound", "building.ants.house", 245, 240), ...extra]);
  const hall = g.context.get(g.state.objectives["player.1"])!;
  g.state.wallets[hall.owner] = {"item.amber": 10000, "item.wood": 10000, "item.root": 1000};
  return {g, hall};
}
const overlapping = (g: ReturnType<typeof game>, id: number) => {
  const e = g.context.get(id)!, at = e.unit!.position ?? fixed(e);
  return !g.spatial.unitSegmentClear(at, at, id);
};

it("deploys on the side facing the rally and never stacks consecutive spawns", () => {
  const {g, hall} = setup(), actor = {definition: "unit.ants.warrior"};
  const east = {x: hall.x + 20, y: hall.y}, west = {x: hall.x - 20, y: hall.y};
  const first = g.spatial.deployment(hall, east, actor)!;
  expect(first.x).toBeGreaterThan(hall.x);
  expect(g.spatial.deployment(hall, west, actor)!.x).toBeLessThan(hall.x);
  const spawned = [first];
  for (let i = 0; i < 6; i++) {
    const at = g.spatial.deployment(hall, east, actor)!;
    const unit = g.context.create({id: "", definition: actor.definition, position: at, rotation: 0, owner: "player.1"});
    expect(overlapping(g, unit.id)).toBe(false);
    spawned.push(at);
  }
  expect(spawned.every((p) => p.x > hall.x)).toBe(true);
});

it("delivers cargo at the building side nearest the carrier instead of the door", () => {
  const {g, hall} = setup(), w = worker(g);
  Object.assign(w.unit!, {order: null, orderQueue: [], job: null, route: [], goal: null, position: null, cargo: {item: "item.wood", amount: 5}});
  w.x = hall.x - 14; w.y = hall.y;
  g.economy.reroute(w);
  expect(w.unit!.job).not.toBeNull();
  expect(g.spatial.point(w.unit!.goal!).x).toBeLessThan(hall.x);
});

it("rallies harvesters onto a tree, which a trained settler gathers straight away", () => {
  const {g, hall} = setup([{...placed("tree", "resource.forest.tree", 0, 0), owner: "none"}]);
  const tree = g.entities.find((e) => e.placement === "tree")!;
  tree.x = hall.x + 9; tree.y = hall.y + 1; g.spatial.rebuild();
  expect(g.command("player.1", {type: "rally", actor: hall.id, destination: null, target: tree.id}).accepted).toBe(true);
  expect(hall.production!.rally).toMatchObject({x: tree.x, y: tree.y, target: tree.id});
  expect(g.command("player.1", {type: "produce", actor: hall.id, definition: "unit.ants.settler"}).accepted).toBe(true);
  const before = g.entities.length;
  for (let i = 0; i < 600 && g.entities.length === before; i++) g.tick();
  const settler = g.entities.at(-1)!;
  expect(settler.definition).toBe("unit.ants.settler");
  expect(settler.unit!.order).toMatchObject({type: "gather", target: tree.id});
  expect(settler.x).toBeGreaterThan(hall.x);
});

it("lets stacked bodies separate instead of freezing in collision", () => {
  const {g} = setup([placed("a", "unit.ants.warrior", 200, 200), placed("b", "unit.ants.warrior", 200, 200)]);
  const [a, b] = ["a", "b"].map((id) => g.entities.find((e) => e.placement === id)!);
  a.x = b.x = 200; a.y = b.y = 200; a.unit!.position = {x: 200000, y: 200000}; b.unit!.position = {x: 200150, y: 200000};
  expect(overlapping(g, a.id)).toBe(true);
  // Moving away from the overlapped body is legal; moving through it is not.
  expect(g.spatial.unitSegmentClear(a.unit!.position, {x: 199000, y: 200000}, a.id)).toBe(true);
  expect(g.spatial.unitSegmentClear(a.unit!.position, {x: 201000, y: 200000}, a.id)).toBe(false);
  run(g, 80);
  expect(overlapping(g, a.id) || overlapping(g, b.id)).toBe(false);
});
