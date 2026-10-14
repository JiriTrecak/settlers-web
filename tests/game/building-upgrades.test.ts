import { expect, it } from "vitest";
import { commandCard } from "../../src/presentation/commands";
import { game, run, placed } from "./helpers";

const setup = () => game([placed("supply","building.test.house",245,240)], draft => {
  (draft.rules as any).repairTicks = 100000;
  const fort = (draft.definitions as any[]).find(d => d.id === "building.test.fort");
  const great = (draft.definitions as any[]).find(d => d.id === "building.test.great-mound");
  fort.upgrade = {target: great.id, items: [{item: "item.test.amber", amount: 100}, {item: "item.test.wood", amount: 50}], workTicks: 520};
});
const mound = (g: ReturnType<typeof setup>) => g.context.get(g.state.objectives["player.1"])!;
const start = (g: ReturnType<typeof setup>) => g.command("player.1", {type: "upgrade", actor: mound(g).id});

it("pays once, pauses training, preserves identity and damage, and survives save/restore", () => {
  const g = setup(), m = mound(g), original = structuredClone(g.state.wallets[m.owner]), id = m.id;
  expect(g.command("player.1",{type:"produce",actor:m.id,definition:"unit.test.settler"}).accepted).toBe(true);
  m.hp! -= 200;
  run(g, 1);
  expect(start(g).accepted).toBe(true);
  const workerCost = g.registry.get('unit.test.settler').creation!.items.find(p => p.item === 'item.test.amber')!.amount;
  expect(g.state.wallets[m.owner]["item.test.amber"]).toBe(original["item.test.amber"] - 100 - workerCost);
  expect(start(g).accepted).toBe(false);
  const count = g.entities.filter(e => e.owner === "player.1" && e.unit).length;
  run(g, 500);
  expect(g.entities.filter(e => e.owner === "player.1" && e.unit)).toHaveLength(count);
  expect(m.upgrade?.progress).toBe(500);
  expect(commandCard(g.view("player.1"), [id], "player.1", g.registry).find(c => c.type === "cancelUpgrade")?.description).toContain("96%");
  const restored = setup(); restored.restore(g.snapshot());
  run(g, 20); run(restored, 20);
  expect(restored.snapshot()).toEqual(g.snapshot());
  // The upgraded Hall keeps the damage taken: full target health minus 200.
  expect(mound(g)).toMatchObject({id, definition: "building.test.great-mound", hp: g.registry.get("building.test.great-mound").body!.maxHp - 200});
  expect(m.upgrade).toBeUndefined();
  const complete = setup(); complete.restore(g.snapshot());
  run(g, g.registry.get("unit.test.settler").creation!.workTicks);
  expect(g.entities.filter(e => e.owner === "player.1" && e.unit).length).toBeGreaterThan(count);
});

it("refunds a canceled upgrade exactly once to the colony account", () => {
  const g = setup(), m = mound(g), inventory = structuredClone(g.state.wallets[m.owner]);
  expect(start(g).accepted).toBe(true); run(g, 10);
  expect(g.command("player.1", {type: "cancelUpgrade", actor: m.id}).accepted).toBe(true);
  expect(g.state.wallets[m.owner]).toEqual(inventory);
  expect(g.command("player.1", {type: "cancelUpgrade", actor: m.id}).accepted).toBe(false);
  expect(g.state.wallets[m.owner]).toEqual(inventory);
  expect(m.definition).toBe("building.test.fort");
});

it("rejects impossible saved upgrade targets and completed progress", () => {
  const g = setup(); start(g);
  for (const change of [{target: "building.test.house"}, {progress: 520}]) {
    const save = g.snapshot();
    Object.assign(save.state.entities.find(e => e.id === mound(g).id)!.upgrade!, change);
    expect(() => setup().restore(save)).toThrow(/Invalid saved building upgrade/);
  }
});

it("does not partially pay an unaffordable upgrade or refund a destroyed project", () => {
  const g = setup(), m = mound(g);
  g.state.wallets[m.owner]["item.test.wood"] = 0;
  const before = structuredClone(g.state.wallets[m.owner]);
  expect(start(g).accepted).toBe(false);
  expect(g.state.wallets[m.owner]).toEqual(before);
  expect(m.upgrade).toBeUndefined();
  g.state.wallets[m.owner]["item.test.wood"] = 100;
  expect(start(g).accepted).toBe(true);
  const other = g.entities.find(e => e.owner === "player.2" && e.production)!;
  const otherStock = structuredClone(g.state.wallets[other.owner]);
  g.economy.remove(m);
  expect(g.context.get(m.id)).toBeUndefined();
  expect(g.state.wallets[other.owner]).toEqual(otherStock);
  expect(g.command("player.1", {type: "cancelUpgrade", actor: m.id}).accepted).toBe(false);
});
