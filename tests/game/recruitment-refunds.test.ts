import { describe, expect, it } from "vitest";
import { game, placed, run, slots } from "./helpers";
import { Game } from "../../src/sim/game/game";

function setup() {
  const g = game([placed("supply", "building.ants.house", 245, 240), placed("b", "building.ants.barracks")]);
  const b = g.entities.find(e => e.placement === "b")!;
  const hall = g.context.get(g.state.objectives["player.1"])!;
  const initial = {...g.state.wallets[hall.owner]};
  const recruit = (definition: string) => g.command("player.1", {type: "produce", actor: b.id, definition});
  const cancel = (queue: number) => g.command("player.1", {type: "cancel", actor: b.id, queue});
  return {g, b, hall, initial, recruit, cancel};
}

describe("recruitment payment and refunds", () => {
  it.each([0, 1])("refunds the exact bill from queue slot %i without charging the next entry", index => {
    const {g, b, hall, initial, recruit, cancel} = setup();
    const definitions = ["unit.ants.warrior", "unit.ants.archer"];
    for (const definition of definitions) expect(recruit(definition).accepted).toBe(true);
    const id = b.production!.queue[index].id;
    expect(cancel(id).accepted).toBe(true);
    const expected = {...initial};
    for (const p of g.registry.get(definitions[1 - index]).creation!.items) expected[p.item] -= p.amount;
    expect(g.state.wallets[hall.owner]).toEqual(expected);
    run(g, 3);
    expect(g.state.wallets[hall.owner]).toEqual(expected);
    expect(cancel(id).accepted).toBe(false);
    expect(g.state.wallets[hall.owner]).toEqual(expected);
    const restored = new Game(g.map, slots, g.registry);
    restored.restore(g.snapshot());
    expect(restored.checksum()).toBe(g.checksum());
  });

  it("returns currency and supply without changing any worker when cancelled during training", () => {
    const {g,b,hall,initial,recruit,cancel}=setup();
    const workers=g.entities.filter(e=>e.definition==='unit.ants.settler').map(e=>e.id);
    recruit('unit.ants.archer');run(g,10);
    expect(b.production!.active).toMatchObject({worker:null,progress:10});
    expect(cancel(b.production!.queue[0].id).accepted).toBe(true);
    expect(g.state.wallets[hall.owner]).toEqual(initial);
    expect(g.entities.filter(e=>e.definition==='unit.ants.settler').map(e=>e.id)).toEqual(workers);
    expect(b.inventory).toEqual({});expect(b.production!.active).toBeNull();
  });

  it("rejects unaffordable recruitment without a partial charge or queue entry", () => {
    const {g, b, hall, recruit} = setup();
    g.state.wallets[hall.owner] = {"item.amber": 100, "item.wood": 10};
    const before = g.snapshot().state;
    expect(recruit("unit.ants.archer").accepted).toBe(false);
    expect(g.state.wallets[hall.owner]).toEqual({"item.amber": 100, "item.wood": 10});
    expect(b.production!.queue).toEqual([]);
    expect(g.state.nextQueue).toBe(before.nextQueue);
  });
});
