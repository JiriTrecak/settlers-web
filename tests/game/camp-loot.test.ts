import { describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/registry";
import type { Rules } from "../../src/content/schema";
import { emptyUtcMap } from "../../src/shared/map/utcmap";
import { Game } from "../../src/sim/game/game";
import { placed, slots, source } from "./helpers";

function setup() {
  const data = source();
  (data.rules as Rules).lootPools = { "loot.test": {rolls: 2, entries: [
    {item: "item.plank", weight: 3}, {item: "item.amber", weight: 1},
  ]} };
  const map = {...emptyUtcMap(), entities: [
    {...placed("wolf.1", "unit.neutral.wolf", 100, 100), owner: "none" as const},
    {...placed("wolf.2", "unit.neutral.wolf", 102, 100), owner: "none" as const},
  ], camps: [{id: "den", members: ["wolf.1", "wolf.2"], home: {x:100,y:100},
    aggroRange: 8, leash: 18, aggression: "players" as const, lootPool:"loot.test"}]};
  return new Game(map, slots, new ContentRegistry(data));
}
const kill = (g: Game, placement: string) => {
  const entity = g.entities.find(e => e.placement === placement)!;
  entity.hp = 0;
  const items = g.campLoot.onDeath(entity);
  g.economy.remove(entity);
  return items;
};

describe("camp completion rewards", () => {
  it("waits for the final defender and survives save/restore without rolling twice", () => {
    const g = setup();
    expect(kill(g, "wolf.1")).toEqual([]);
    const saved = g.snapshot();
    const drops = kill(g, "wolf.2");
    expect(drops).toHaveLength(2);
    expect(new Set(drops.map(e=>`${e.x},${e.y}`)).size).toBe(2);
    expect((drops[0].x-drops[1].x)**2+(drops[0].y-drops[1].y)**2).toBeGreaterThanOrEqual(4);
    expect(drops.every(e => e.owner === "none" && e.item?.quantity === 1)).toBe(true);
    const restored = setup(); restored.restore(saved);
    expect(kill(restored,"wolf.2")).toEqual(drops);
    expect(restored.state.random).toBe(g.state.random);
    const complete = setup(); complete.restore(g.snapshot());
    const dead = {...g.entities[0], hp:0, unit: {...g.context.freshUnit(),camp:"den"}};
    expect(complete.campLoot.onDeath(dead)).toEqual([]);
  });
  it("rejects dangling loot references and forged reward state", () => {
    const g = setup();
    expect(() => new Game({...g.map, camps:g.map.camps.map(c=>({...c,lootPool:"loot.missing"}))},slots,g.registry)).toThrow(/unknown loot pool/);
    const saved = g.snapshot(); saved.state.clearedCamps.push("den");
    expect(()=>g.restore(saved)).toThrow(/camp rewards/);
    const data = source(); (data.rules as Rules).lootPools={"loot.invalid":{rolls:1,entries:[{item:"unit.ants.warrior",weight:1}]}};
    expect(()=>new ContentRegistry(data)).toThrow(/expected item/);
  });
});
