import type {Rules,AuthoredDefinition} from "../../src/content/schema";
import { describe, it, expect } from "vitest";
import { game, placed, physical, run, worker, slots } from "./helpers";
import { Game } from "../../src/sim/game/game";

// Automatic forester work with explicit custom regrowth content (planting lifecycle lives in forester-lifecycle).
function regrowth(draft:Parameters<NonNullable<Parameters<typeof game>[1]>>[0]) {
 const defs=draft.definitions as AuthoredDefinition[],tree=defs.find(d=>d.id==='resource.test.forest-tree')!;
 tree.regrowthTicks=1600;tree.creation={method:'plant',items:[],workTicks:80};
 defs.find(d=>d.id==='building.test.forester')!.behaviors!.production={mode:'automatic',outputs:[tree.id],workerSlots:1,workRadius:28,jobName:'Forester'};
}
describe("work disruption and capacity", () => {
  it("S05 protects a nearly full queue-head bill from tail demand", () => {
    const g = game([placed("supply", "building.test.house", 245, 240), placed("b", "building.test.barracks")], (s) => {
        const b = s.definitions.find(
          (d: any) => d.id === "building.test.barracks",
        ) as any;
        b.behaviors.storage.capacity=16;
        b.behaviors.production.outputs=["unit.test.warrior","unit.test.archer"];
        (s.rules as Rules).ai.composition=(s.rules as Rules).ai.composition.filter(c=>b.behaviors.production.outputs.includes(c.definition));
        const a = s.definitions.find((d:any) => d.id === "unit.test.archer") as any;
        a.creation.items=[{item:"item.test.wood",amount:5},{item:"item.test.amber",amount:10}];
        const w = s.definitions.find(
          (d: any) => d.id === "unit.test.warrior",
        ) as any;
        w.creation.items = [
          { item: "item.test.wood", amount: 7 },
          { item: "item.test.amber", amount: 7 },
        ];
        w.creation.workTicks = 4;
      }),
      b = g.entities.find((e) => e.placement === "b")!;
    g.command("player.1", {
      type: "produce",
      actor: b.id,
      definition: "unit.test.warrior",
    });
    g.command("player.1", {
      type: "produce",
      actor: b.id,
      definition: "unit.test.archer",
    });
    run(g, 1100);
    expect(b.production!.produced).toBe(2);
    expect(b.production!.queue).toEqual([]);
  });
  it("S08 hall destruction preserves the wallet and funded construction", () => {
    const g = game([
        placed("store", "building.test.fort", 235, 235, {
          inventory: { "item.test.wood": 32, "item.test.amber": 100 },
        }),
      ]),
      w = worker(g),
      fort = g.entities.find((e) => e.placement === "store")!;
    g.state.wallets["player.1"] = {"item.test.wood": 32, "item.test.amber": 100};
    expect(
      g.command("player.1", {
        type: "build",
        actors: [w.id],
        definition: "building.test.house",
        position: { x: 199.5, y: 239.5 },
      }).accepted,
    ).toBe(true);
    g.economy.remove(fort);
    run(g, 20);
    expect(g.state.jobs.some((j) => j.source === fort.id)).toBe(false);
    expect(g.state.accounting.lost["item.test.wood"] ?? 0).toBe(0);
    const cost = g.registry.get("building.test.house").creation!.items.find(i => i.item === "item.test.wood")!.amount;
    expect(g.state.wallets["player.1"]["item.test.wood"]).toBe(32 - cost);
    expect(physical(g, "item.test.wood")).toBe(g.registry.rules.startingSetup.inventory["item.test.wood"]+32);
  });
  it("S12 harvest reservations prevent two gatherers duplicating the last resource unit", () => {
    const g = game([
      {
        ...placed("tree", "resource.test.forest-tree", 207, 200, { amount: 1 }),
        owner: "none",
      },
    ]);
    const tree = g.entities.find(e=>e.placement==='tree')!;
    for (const w of g.entities.filter(e=>e.owner==='player.1'&&e.unit&&g.registry.get(e.definition).behaviors.work))
      g.command('player.1',{type:'gather',actors:[w.id],target:tree.id});
    run(g, 700);
    expect(g.state.accounting.produced["item.test.wood"]).toBe(1);
    expect(physical(g, "item.test.wood")).toBe(2*g.registry.rules.startingSetup.inventory["item.test.wood"]+1);
    expect(
      g.entities.find((e) => e.placement === "tree")!.resource!.amount,
    ).toBe(0);
  });
  it("rejects corrupt snapshots before changing live state", () => {
    const g = game(),
      before = g.checksum(),
      save = g.snapshot();
    save.knowledge[1]!.owner = "player.7";
    expect(() => g.restore(save)).toThrow();
    expect(g.checksum()).toBe(before);
    const bad = g.snapshot();
    bad.state.entities.find((e) => e.unit)!.unit!.job = 999;
    expect(() => g.restore(bad)).toThrow();
    expect(g.checksum()).toBe(before);
  });
  it("dead staff can be replaced and the resulting snapshot remains valid", () => {
    const g = game([placed("mill", "building.test.forester",193.5,237.5), {...placed("tree", "resource.test.forest-tree", 200, 220, {amount:0}),owner:"none"}],regrowth),
      b = g.entities.find((e) => e.placement === "mill")!;
    g.tick();
    const staff = g.context.get(b.production!.staff)!;
    expect(staff).toBeDefined();
    staff.hp = 0;
    g.economy.remove(staff);
    g.tick();
    const saved = g.snapshot(),
      r = new Game(g.map, slots, g.registry);
    expect(() => r.restore(saved)).not.toThrow();
  });
});
