import { describe, it, expect } from "vitest";
import { Game } from "../../src/sim/game/game";
import { content } from "../../src/content/builtin";
import { workerPopulation } from "../../src/sim/game/population";
import { commandCard, costs } from "../../src/presentation/commands";
import { putEntity } from "../../src/editor/world/entityAuthoring";
import { emptyUtcMap } from "../../src/shared/map/utcmap";
import { game, placed, run, slots, worker } from "./helpers";

const population = (g: Game, owner = "player.1") =>
  workerPopulation(g.entities, owner, g.registry);
const neutral = (id: string, definition: string, x: number, y: number) => ({
  ...placed(id, definition, x, y),
  owner: "none" as const,
});
const mine = () => neutral("mine", "building.neutral.amber-mine", 220, 205);

describe("renewable colony population", () => {
  it("starts with five workers and replenishes to eight at one birth every twelve seconds", () => {
    const g = game();
    expect(population(g)).toMatchObject({ workers: 5, capacity: 8 });
    run(g, 479);
    expect(population(g).workers).toBe(5);
    g.tick();
    expect(population(g).workers).toBe(6);
    run(g, 480);
    expect(population(g).workers).toBe(7);
    run(g, 480);
    expect(population(g).workers).toBe(8);
    run(g, 1000);
    expect(population(g).workers).toBe(8);
    expect(g.view("player.1").population).toMatchObject({
      workers: 8,
      capacity: 8,
    });
    expect(
      g.entities.filter(
        (e) =>
          e.owner === "player.1" &&
          g.registry.get(e.definition).selectionClass === "army",
      ),
    ).toHaveLength(3);
  });
  it("houses contribute three capacity and their own twenty-second birth cadence; neither is a lifetime limit", () => {
    const g = game([placed("house", "building.ants.house")]),
      house = g.entities.find((e) => e.placement === "house")!;
    expect(population(g).capacity).toBe(11);
    run(g, 799);
    expect(house.production!.produced).toBe(0);
    g.tick();
    expect(house.production!.produced).toBe(1);
    run(g, 2400);
    expect(population(g).workers).toBe(11);
    const hall = g.context.get(g.state.objectives["player.1"])!;
    g.economy.pause(hall, true);
    for (let i = 0; i < 4; i++) g.economy.remove(worker(g));
    run(g, 3200);
    expect(population(g).workers).toBe(11);
    expect(house.production!.produced).toBeGreaterThan(3);
  });
  it("building losses lower capacity without killing workers; save/load preserves birth timing", () => {
    const g = game([placed("house", "building.ants.house")]);
    run(g, 3200);
    g.economy.remove(g.entities.find((e) => e.placement === "house")!);
    expect(population(g)).toMatchObject({ workers: 11, capacity: 8 });
    run(g, 500);
    expect(population(g).workers).toBe(11);
    for (let i = 0; i < 4; i++) g.economy.remove(worker(g));
    run(g, 200);
    const restored = new Game(g.map, slots, g.registry);
    restored.restore(g.snapshot());
    run(g, 279);
    run(restored, 279);
    expect(population(g).workers).toBe(7);
    g.tick();
    restored.tick();
    expect(population(g).workers).toBe(8);
    expect(restored.snapshot()).toEqual(g.snapshot());
  });
  it("simultaneous producers respect colony capacity and players have independent pools", () => {
    const g = game([
      placed("a", "building.ants.house", 205, 210),
      placed("b", "building.ants.house", 237, 215),
    ]);
    run(g, 6000);
    expect(population(g).workers).toBe(14);
    expect(population(g, "player.2")).toMatchObject({
      workers: 8,
      capacity: 8,
    });
  });
});

describe("direct gathering and protected recruitment", () => {
  it("makes mines neutral selectable buildings with ten persistent gathering places", () => {
    const g = game([
      mine(),
      ...Array.from({ length: 7 }, (_, i) =>
        placed(`extra.${i}`, "unit.ants.settler", 212 + i, 233),
      ),
    ]);
    const m = g.entities.find((e) => e.placement === "mine")!,
      workers = g.entities.filter(
        (e) =>
          e.owner === "player.1" && g.registry.get(e.definition).behaviors.work,
      );
    expect(g.registry.get(m.definition).kind).toBe("building");
    expect(commandCard(g.view(0), [m.id], "player.1", g.registry)).toEqual([]);
    const accepted = g.command("player.1", {
      type: "gather",
      actors: workers.map((w) => w.id),
      target: m.id,
    });
    expect(accepted.actors).toHaveLength(10);
    g.observation.update();
    expect(g.view(0).entities.find((e) => e.id === m.id)!.gathering).toEqual({
      workers: 10,
      capacity: 10,
    });
    run(g, 650);
    expect(
      g.view(0).entities.find((e) => e.id === m.id)!.gathering!.workers,
    ).toBe(10);
    // Returning a load does not free a place. Explicitly ending an assignment does.
    const assigned = workers.find((w) => w.unit!.order?.type === "gather")!;
    g.command("player.1", { type: "stop", actors: [assigned.id] });
    for (
      let i = 0;
      i < 1600 && (assigned.unit!.cargo || assigned.unit!.job);
      i++
    )
      g.tick();
    expect(assigned.unit!.cargo).toBeNull();
    const spare = workers.find((w) => !accepted.actors.includes(w.id))!;
    expect(
      g.command("player.1", {
        type: "gather",
        actors: [spare.id],
        target: m.id,
      }).accepted,
    ).toBe(true);
  });
  it("reserves the new mine while a retargeted worker finishes its previous load", () => {
    const g = game([
      mine(),
      neutral("next", "building.neutral.amber-mine", 205, 210),
      ...Array.from({ length: 7 }, (_, i) =>
        placed(`extra.${i}`, "unit.ants.settler", 212 + i, 233),
      ),
    ]);
    const first = g.entities.find((e) => e.placement === "mine")!;
    const next = g.entities.find((e) => e.placement === "next")!;
    const workers = g.entities.filter(
      (e) =>
        e.owner === "player.1" && g.registry.get(e.definition).behaviors.work,
    );
    const carrier = workers[0];
    expect(
      g.command("player.1", {
        type: "gather",
        actors: [carrier.id],
        target: first.id,
      }).accepted,
    ).toBe(true);
    for (let i = 0; i < 800 && !carrier.unit!.cargo; i++) g.tick();
    expect(carrier.unit!.cargo?.amount).toBeGreaterThan(0);
    const changed = g.command("player.1", {
      type: "gather",
      actors: workers.map((w) => w.id),
      target: next.id,
    });
    expect(changed.actors).toHaveLength(10);
    expect(changed.actors).toContain(carrier.id);
    g.observation.update();
    expect(
      g.view(0).entities.find((e) => e.id === next.id)!.gathering!.workers,
    ).toBe(10);
    expect(
      g.view(0).entities.find((e) => e.id === first.id)!.gathering!.workers,
    ).toBe(1);
  });
  it("never takes economic workers, even while they are walking, carrying, or waiting", () => {
    const g = game([mine(), placed("b", "building.ants.barracks", 205, 210)]),
      m = g.entities.find((e) => e.placement === "mine")!,
      b = g.entities.find((e) => e.placement === "b")!;
    const workers = g.entities.filter(
      (e) =>
        e.owner === "player.1" && g.registry.get(e.definition).behaviors.work,
    );
    g.command("player.1", {
      type: "gather",
      actors: workers.map((w) => w.id),
      target: m.id,
    });
    g.command("player.1", {
      type: "produce",
      actor: b.id,
      definition: "unit.ants.archer",
    });
    run(g, 400);
    expect(b.production!.active).toBeNull();
    expect(b.production!.status).toMatch(/available worker/);
    expect(
      workers.every(
        (w) =>
          w.definition === "unit.ants.settler" &&
          w.unit!.order?.type === "gather",
      ),
    ).toBe(true);
    // The first newly born ant may fill the pending order. Original miners stay assigned.
    run(g, 600);
    expect(b.production!.produced).toBe(1);
    expect(workers.every((w) => w.definition === "unit.ants.settler")).toBe(
      true,
    );
  });
  it("turns the arriving worker into an archer in one second, charges amber and wood, then replenishes population", () => {
    const g = game([placed("b", "building.ants.barracks", 205, 210)]),
      b = g.entities.find((e) => e.placement === "b")!;
    g.command("player.1", {
      type: "produce",
      actor: b.id,
      definition: "unit.ants.archer",
    });
    for (let i = 0; i < 400 && !b.production!.active?.worker; i++) g.tick();
    const recruit = g.context.get(b.production!.active!.worker)!;
    for (let i = 0; i < 400 && !recruit.unit!.contained; i++) g.tick();
    expect(recruit.unit!.contained).toBe(b.id);
    const needed = 40 - b.production!.active!.progress;
    run(g, needed - 1);
    expect(recruit.definition).toBe("unit.ants.settler");
    g.tick();
    expect(recruit.definition).toBe("unit.ants.archer");
    expect(recruit.unit!.contained).toBeNull();
    expect(g.state.accounting.consumed).toMatchObject({
      "item.amber": 145,
      "item.wood": 20,
    });
    run(g, 2500);
    expect(population(g).workers).toBe(8);
    expect(costs(g.registry, "unit.ants.archer").map((c) => c.name)).toEqual([
      "Amber",
      "Wood",
      "Worker",
    ]);
  });
  it("can build on explored unclaimed land and keeps water, footprint and mine-clearance restrictions", () => {
    const g = game([placed("pioneer", "unit.ants.settler", 128, 128)]),
      w = g.entities.find((e) => e.placement === "pioneer")!;
    expect(
      g.canBuild("player.1", "building.ants.house", { x: 132, y: 129 }, w.id),
    ).toBeNull();
    expect(
      g.command("player.1", {
        type: "build",
        actor: w.id,
        definition: "building.ants.house",
        position: { x: 132, y: 129 },
      }).accepted,
    ).toBe(true);
    expect(g.view(0)).not.toHaveProperty("territory");
    expect(
      g.canBuild("player.1", "building.ants.house", { x: 140, y: 140 }, w.id),
    ).toMatch(/Explore/);
  });
  it("removes retired chains, forbids currency ground objects, and keeps hero loot", () => {
    for (const id of [
      "item.plank",
      "resource.stone.deposit",
      "building.ants.lumberjack",
      "building.ants.sawmill",
      "building.ants.stonemason",
    ])
      expect(content.find(id)).toBeUndefined();
    expect(() => putEntity(emptyUtcMap(), placed("wood", "item.wood"))).toThrow(
      /currencies/,
    );
    expect(() =>
      putEntity(emptyUtcMap(), placed("amber", "item.amber")),
    ).toThrow(/currencies/);
    expect(() =>
      putEntity(emptyUtcMap(), neutral("loot", "item.barkguard", 128, 128)),
    ).not.toThrow();
    expect(() =>
      putEntity(emptyUtcMap(), placed("mine", "building.neutral.amber-mine")),
    ).toThrow(/neutral/);
    const g = game(),
      w = worker(g);
    g.command("player.1", {
      type: "build",
      actor: w.id,
      definition: "building.ants.house",
      position: { x: 205, y: 210 },
    });
    const b = g.entities.at(-1)!;
    // There is no hall to receive the refund. It must not become a loose pile.
    g.economy.remove(g.context.get(g.state.objectives["player.1"])!);
    g.economy.remove(b, true);
    expect(g.entities.some((e) => e.item)).toBe(false);
    expect(g.state.accounting.lost["item.wood"]).toBe(g.registry.rules.startingSetup.inventory["item.wood"]);
  });
});
