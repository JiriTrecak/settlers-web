import { expect, it } from "vitest";
import { commandCard } from "../../src/presentation/commands";
import { game, run } from "./helpers";

const setup = () => game([], draft => {
  (draft.rules as any).repairTicks = 100000;
  const fort = (draft.definitions as any[]).find(d => d.id === "building.ants.fort");
  const great = (draft.definitions as any[]).find(d => d.id === "building.ants.great-mound");
  fort.upgrade = {target: great.id, items: [{item: "item.amber", amount: 100}, {item: "item.wood", amount: 50}], workTicks: 520};
});
const mound = (g: ReturnType<typeof setup>) => g.context.get(g.state.objectives["player.1"])!;
const start = (g: ReturnType<typeof setup>) => g.command("player.1", {type: "upgrade", actor: mound(g).id});

it("pays once, pauses births, preserves identity and damage, and survives save/restore", () => {
  const g = setup(), m = mound(g), original = structuredClone(m.inventory), id = m.id;
  m.hp! -= 200;
  run(g, 1);
  expect(start(g).accepted).toBe(true);
  expect(m.inventory["item.amber"]).toBe(original["item.amber"] - 100);
  expect(start(g).accepted).toBe(false);
  const count = g.entities.filter(e => e.owner === "player.1" && e.unit).length;
  run(g, 500);
  expect(g.entities.filter(e => e.owner === "player.1" && e.unit)).toHaveLength(count);
  expect(m.upgrade?.progress).toBe(500);
  expect(commandCard(g.view("player.1"), [id], "player.1", g.registry).find(c => c.type === "cancelUpgrade")?.description).toContain("96%");
  const restored = setup(); restored.restore(g.snapshot());
  run(g, 20); run(restored, 20);
  expect(restored.snapshot()).toEqual(g.snapshot());
  expect(mound(g)).toMatchObject({id, definition: "building.ants.great-mound", hp: 2200});
  expect(m.upgrade).toBeUndefined();
  const complete = setup(); complete.restore(g.snapshot());
  run(g, 480);
  expect(g.entities.filter(e => e.owner === "player.1" && e.unit).length).toBeGreaterThan(count);
});

it("refunds a canceled upgrade exactly once to the colony account", () => {
  const g = setup(), m = mound(g), inventory = structuredClone(m.inventory);
  expect(start(g).accepted).toBe(true); run(g, 10);
  expect(g.command("player.1", {type: "cancelUpgrade", actor: m.id}).accepted).toBe(true);
  expect(m.inventory).toEqual(inventory);
  expect(g.command("player.1", {type: "cancelUpgrade", actor: m.id}).accepted).toBe(false);
  expect(m.inventory).toEqual(inventory);
  expect(m.definition).toBe("building.ants.fort");
});

it("rejects impossible saved upgrade targets and completed progress", () => {
  const g = setup(); start(g);
  for (const change of [{target: "building.ants.house"}, {progress: 520}]) {
    const save = g.snapshot();
    Object.assign(save.state.entities.find(e => e.id === mound(g).id)!.upgrade!, change);
    expect(() => setup().restore(save)).toThrow(/Invalid saved building upgrade/);
  }
});

it("does not partially pay an unaffordable upgrade or refund a destroyed project", () => {
  const g = setup(), m = mound(g);
  m.inventory["item.wood"] = 0;
  const before = structuredClone(m.inventory);
  expect(start(g).accepted).toBe(false);
  expect(m.inventory).toEqual(before);
  expect(m.upgrade).toBeUndefined();
  m.inventory["item.wood"] = 100;
  expect(start(g).accepted).toBe(true);
  const other = g.entities.find(e => e.owner === "player.2" && e.production)!;
  const otherStock = structuredClone(other.inventory);
  g.economy.remove(m);
  expect(g.context.get(m.id)).toBeUndefined();
  expect(other.inventory).toEqual(otherStock);
  expect(g.command("player.1", {type: "cancelUpgrade", actor: m.id}).accepted).toBe(false);
});
