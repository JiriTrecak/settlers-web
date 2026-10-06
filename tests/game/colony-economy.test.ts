import { describe, it, expect } from "vitest";
import { content } from "../../src/content/builtin";
import { commandCard } from "../../src/presentation/commands";
import { putEntity } from "../../src/editor/world/entityAuthoring";
import { emptyUtcMap } from "../../src/shared/map/utcmap";
import { game, placed, run, worker } from "./helpers";

const neutral = (id: string, definition: string, x: number, y: number) => ({
  ...placed(id, definition, x, y),
  owner: "none" as const,
});
const mine = () => neutral("mine", "building.neutral.amber-mine", 220, 205);

describe("direct gathering", () => {
  it("makes mines neutral selectable buildings with an uncapped persistent gather assignment", () => {
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
    expect(accepted.actors).toHaveLength(workers.length);
    g.observation.update();
    expect(g.view(0).entities.find((e) => e.id === m.id)!.gathering).toEqual({
      workers: workers.length,
      recommendedWorkers: 2,
    });
    run(g, 650);
    expect(
      g.view(0).entities.find((e) => e.id === m.id)!.gathering!.workers,
    ).toBe(workers.length);
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
    const spare = assigned;
    expect(
      g.command("player.1", {
        type: "gather",
        actors: [spare.id],
        target: m.id,
      }).accepted,
    ).toBe(true);
  });
  it("counts a carrying worker at its current source until it completes the trip", () => {
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
    expect(changed.actors).toHaveLength(workers.length);
    expect(changed.actors).toContain(carrier.id);
    g.observation.update();
    expect(
      g.view(0).entities.find((e) => e.id === next.id)!.gathering!.workers,
    ).toBe(workers.length - 1);
    expect(
      g.view(0).entities.find((e) => e.id === first.id)!.gathering!.workers,
    ).toBe(1);
  });
  it("can build on explored unclaimed land and keeps water, footprint and mine-clearance restrictions", () => {
    const g = game([placed("pioneer", "unit.ants.settler", 128, 128)]),
      w = g.entities.find((e) => e.placement === "pioneer")!;
    expect(
      g.canBuild("player.1", "building.ants.house", { x: 135.5, y: 127.5 }, w.id),
    ).toBeNull();
    expect(
      g.command("player.1", {
        type: "build",
        actors: [w.id],
        definition: "building.ants.house",
        position: { x: 135.5, y: 127.5 },
      }).accepted,
    ).toBe(true);
    expect(g.view(0)).not.toHaveProperty("territory");
    expect(
      g.canBuild("player.1", "building.ants.house", { x: 163.5, y: 163.5 }, w.id),
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
      actors: [w.id],
      definition: "building.ants.house",
      position: { x: 205, y: 210 },
    });
    const b = g.entities.at(-1)!;
    // A refund belongs to the player even without a surviving drop-off.
    g.economy.remove(g.context.get(g.state.objectives["player.1"])!);
    g.economy.remove(b, true);
    expect(g.entities.some((e) => e.item)).toBe(false);
    expect(g.state.accounting.lost["item.wood"] ?? 0).toBe(0);
    expect(g.state.wallets["player.1"]["item.wood"]).toBe(g.registry.rules.startingSetup.inventory["item.wood"]);
  });
});
