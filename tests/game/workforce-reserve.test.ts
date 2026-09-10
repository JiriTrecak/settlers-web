import { describe, expect, it } from "vitest";
import { workforceReserve } from "../../src/presentation/workforce";
import { workerPopulation } from "../../src/sim/game/population";
import { game, placed, run } from "./helpers";

describe("military reserve counter", () => {
  it("excludes assigned gatherers and fills the displayed reserve as workers spawn", () => {
    const g = game([{...placed("mine", "building.neutral.amber-mine", 220, 205), owner: "none"}]);
    const mine = g.entities.find(e => e.placement === "mine")!;
    const workers = g.entities.filter(e => e.owner === "player.1" && g.registry.get(e.definition).behaviors.work);
    const reserve = () => workforceReserve(workerPopulation(g.entities, "player.1", g.registry));
    expect(g.command("player.1", {type: "gather", actors: workers.map(w => w.id), target: mine.id}).accepted).toBe(true);
    expect(reserve()).toEqual({available: 0, replenishing: 3, allocation: 3});
    run(g, 480);
    expect(reserve()).toEqual({available: 1, replenishing: 2, allocation: 3});
    run(g, 960);
    expect(reserve()).toEqual({available: 3, replenishing: 0, allocation: 3});
  });

  it("takes a builder out of the reserve without taking away a future birth", () => {
    const g = game();
    const w = g.entities.find(e => e.owner === "player.1" && g.registry.get(e.definition).behaviors.work)!;
    expect(g.command("player.1", {type: "build", actors: [w.id], definition: "building.ants.house", position: {x: 205, y: 210}}).accepted).toBe(true);
    expect(workforceReserve(workerPopulation(g.entities, "player.1", g.registry)))
      .toEqual({available: 4, replenishing: 3, allocation: 7});
  });

  it("keeps surviving available workers after a house is lost without promising more births", () => {
    const g = game([placed("house", "building.ants.house")]);
    run(g, 3200);
    g.economy.remove(g.entities.find(e => e.placement === "house")!);
    const population = workerPopulation(g.entities, "player.1", g.registry);
    expect(population).toEqual({workers: 11, available: 11, capacity: 8});
    expect(workforceReserve(population)).toEqual({available: 11, replenishing: 0, allocation: 11});
  });
});
