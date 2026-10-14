import { expect, it } from "vitest";
import { commandCard, queueCard } from "../../src/presentation/commands";
import { game, placed, run, worker } from "./helpers";

const carapace = "research.carapace", tools = "research.tools", harness = "research.harness";
const setup = () => game([
  placed("warrior", "unit.test.warrior", 196, 239),
  placed("forge", "building.test.house", 220, 220),
  placed("forge-two", "building.test.house", 230, 220),
  {...placed("tree", "resource.test.forest-tree", 205, 215), owner: "none"},
], draft => {
  const house = (draft.definitions as any[]).find(d => d.id === "building.test.house");
  house.behaviors.research = {outputs: [carapace, tools, harness], queueCapacity: 3};
  (draft.rules as any).repairTicks = 100000;
  const base = {name: "Reinforced Carapace", description: "Stronger armor and health.", icon: "icon.test.fort", priority: 100,
    items: [{item: "item.test.amber", amount: 50}], workTicks: 20};
  (draft.rules as any).research = {
    ...(draft.rules as any).research,
    [carapace]: {...base, effects: [{units: ["unit.test.warrior"], maxHp: 150, armor: 2}]},
    [tools]: {...base, name: "Serrated Tools", effects: [{units: ["unit.test.settler"], treeWorkRate: 2}]},
    [harness]: {...base, name: "Campaign Harness", effects: [{units: ["unit.test.marshal"], maxHp: 200}]},
  };
});
const forge = (g: ReturnType<typeof setup>, name = "forge") => g.entities.find(e => e.placement === name)!;
const enqueue = (g: ReturnType<typeof setup>, id: string, name = "forge") =>
  g.command("player.1", {type: "research", actor: forge(g, name).id, research: id});

it("pays atomically, rejects cross-forge duplicates, and refunds a queued task only once", () => {
  const g = setup(), m = g.context.get(g.state.objectives["player.1"])!;
  const before = g.state.wallets[m.owner]["item.test.amber"];
  expect(enqueue(g, carapace).accepted).toBe(true);
  expect(enqueue(g, carapace, "forge-two").accepted).toBe(false);
  expect(enqueue(g, tools).accepted).toBe(true);
  expect(g.state.wallets[m.owner]["item.test.amber"]).toBe(before - 100);
  const card = commandCard(g.view("player.1"), [forge(g, "forge-two").id], "player.1", g.registry);
  expect(card.find(c => c.id === `research:${carapace}`)).toMatchObject({enabled: false, reason: "Research already queued"});
  const cancel = queueCard(g.view("player.1"), forge(g).id, "player.1", g.registry)[1].cancel!;
  expect(g.command("player.1", cancel).accepted).toBe(true);
  expect(g.command("player.1", cancel).accepted).toBe(false);
  expect(g.state.wallets[m.owner]["item.test.amber"]).toBe(before - 50);
  g.state.wallets[m.owner]["item.test.amber"] = 0;
  expect(enqueue(g, tools).accepted).toBe(false);
  expect(forge(g).research!.queue).toHaveLength(1);
});

it("adds health capacity without healing wounds and applies to future units and saves", () => {
  const g = setup(), warrior = g.entities.find(e => e.owner === "player.1" && e.definition === "unit.test.warrior")!;
  const base = g.context.stats(warrior); warrior.hp! -= 50;
  enqueue(g, carapace); run(g, 10);
  const restored = setup(); restored.restore(g.snapshot());
  run(g, 10); run(restored, 10);
  expect(restored.snapshot()).toEqual(g.snapshot());
  expect(g.context.stats(warrior)).toMatchObject({maxHp: base.maxHp + 150, armor: base.armor + 2});
  expect(warrior.hp).toBe(base.maxHp + 100);
  expect(g.state.accounting.consumed["item.test.amber"]).toBe(50);
  const future = g.context.create(placed("future", "unit.test.warrior", 240, 240));
  expect(future.hp).toBe(base.maxHp + 150);
  expect(enqueue(g, carapace).accepted).toBe(false);
  g.economy.remove(forge(g));
  expect(g.context.stats(warrior).maxHp).toBe(base.maxHp + 150);
  expect(g.view("player.2").research?.["player.1"]).toBeUndefined();
  setup().restore(g.snapshot());
});

it("leaves fallen heroes dead when researching, then applies the bonus on revival", () => {
  const g = setup();
  const hero = g.entities.find(e => e.owner === "player.1" && e.definition === "unit.test.marshal")!;
  const max = g.context.stats(hero).maxHp;
  g.context.remove(hero); g.revival.retain(hero);
  enqueue(g, harness); run(g, 20);
  expect(hero.hp).toBe(0); expect(hero.fallen).toBe(true);
  expect(g.context.stats(hero).maxHp).toBe(max + 200);
  const sanctuary = g.context.create(placed("altar", "building.test.sanctuary", 240, 240));
  expect(g.revival.enqueue(sanctuary, hero.id)).toBeNull();
  run(g, g.registry.get(sanctuary.definition).behaviors.revival!.workTicks + 1);
  expect(hero.fallen).toBeUndefined(); expect(hero.hp).toBe(max + 200);
});

it("treeWorkRate research halves the extraction time of one load without depleting the whole tree", () => {
  const g = setup(); enqueue(g, tools); run(g, 20);
  const w = worker(g), tree = g.entities.find(e => e.placement === "tree")!;
  g.command(w.owner, {type: "gather", actors: [w.id], target: tree.id});
  let start: number | undefined;
  for (let i = 0; i < 1200 && !w.unit!.cargo; i++) {
    g.tick();
    if (g.state.jobs.some(j => j.worker === w.id && j.phase === 'work') && start === undefined) start = g.state.tick;
  }
  const harvest = g.registry.get("item.test.wood").creation!, treeYield = g.registry.get(tree.definition).yield!;
  if (harvest.method !== "harvest") throw Error("Wood must be a harvested item");
  expect(g.state.tick - start! + 1).toBe(harvest.workTicks / 2);
  expect(w.unit!.cargo).toEqual({item: "item.test.wood", amount: harvest.amount});
  expect(tree.resource!.amount).toBe(treeYield - harvest.amount!); expect(tree.resource!.felling!.fallTick).toBeNull();
});

it("rejects duplicate, unknown and impossible-progress saved research", () => {
  const g = setup(); enqueue(g, carapace);
  const duplicate = g.snapshot(); duplicate.state.entities.find(e => e.placement === "forge-two")!.research!.queue.push({id: carapace, progress: 0});
  expect(() => setup().restore(duplicate)).toThrow(/research queue/);
  const progress = g.snapshot(); progress.state.entities.find(e => e.placement === "forge")!.research!.queue[0].progress = 20;
  expect(() => setup().restore(progress)).toThrow(/research queue/);
  const unknown = g.snapshot(); unknown.state.research["player.1"] = ["research.nonexistent"];
  expect(() => setup().restore(unknown)).toThrow(/colony research/);
});

it("loses unfinished research when its forge is destroyed and permits a new purchase", () => {
  const g = setup(); enqueue(g, carapace); run(g, 5);
  g.economy.remove(forge(g));
  expect(g.state.accounting.lost["item.test.amber"]).toBe(50);
  expect(g.state.research["player.1"]).toBeUndefined();
  expect(enqueue(g, carapace, "forge-two").accepted).toBe(true);
});

it("refunds research without any surviving Hall and reports its escrow separately from available funds", () => {
  const g = setup(), before = g.economy.balance('player.1', 'item.test.amber');
  expect(enqueue(g, carapace).accepted).toBe(true);
  expect(g.view('player.1').goods!.find(r => r.item === 'item.test.amber')).toMatchObject({
    stored: before, reserved: 50, available: before - 50,
  });
  g.economy.remove(g.context.get(g.state.objectives['player.1'])!);
  expect(g.research.cancel(forge(g), carapace)).toBeNull();
  expect(g.economy.balance('player.1', 'item.test.amber')).toBe(before);
  expect(g.research.cancel(forge(g), carapace)).toBe('Research is not queued here');
  expect(g.economy.balance('player.1', 'item.test.amber')).toBe(before);
});
