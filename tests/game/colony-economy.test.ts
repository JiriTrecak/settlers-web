import { describe, it, expect } from "vitest";
import { testContent } from "../fixtures/content";
import { commandCard } from "../../src/presentation/commands";
import { validatePlacements } from "../../src/content/map";
import { emptyUtcMap } from "../../src/shared/map/utcmap";
import { game, placed, run, worker } from "./helpers";

const neutral = (id: string, definition: string, x: number, y: number) => ({
  ...placed(id, definition, x, y),
  owner: "none" as const,
});
const mine = () => neutral("mine", "building.test.neutral-amber-mine", 220, 205);

describe("direct gathering", () => {
  it("makes mines neutral selectable buildings with an uncapped persistent gather assignment", () => {
    const g = game([
      mine(),
      ...Array.from({ length: 7 }, (_, i) =>
        placed(`extra.${i}`, "unit.test.settler", 212 + i, 233),
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
      neutral("next", "building.test.neutral-amber-mine", 205, 210),
      ...Array.from({ length: 7 }, (_, i) =>
        placed(`extra.${i}`, "unit.test.settler", 212 + i, 233),
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
    const g = game([placed("pioneer", "unit.test.settler", 128, 128)]),
      w = g.entities.find((e) => e.placement === "pioneer")!;
    expect(
      g.canBuild("player.1", "building.test.house", { x: 135.5, y: 127.5 }, w.id),
    ).toBeNull();
    expect(
      g.command("player.1", {
        type: "build",
        actors: [w.id],
        definition: "building.test.house",
        position: { x: 135.5, y: 127.5 },
      }).accepted,
    ).toBe(true);
    expect(
      g.canBuild("player.1", "building.test.house", { x: 163.5, y: 163.5 }, w.id),
    ).toBeNull();
  });
  it("forbids currency ground objects and owned neutral deposits, keeps hero loot, and refunds without a drop-off", () => {
    const authored = (...entities: ReturnType<typeof placed>[]) => () => validatePlacements({...emptyUtcMap(), entities}, testContent);
    expect(authored(placed("wood", "item.test.wood"))).toThrow(/currencies/);
    expect(authored(placed("amber", "item.test.amber"))).toThrow(/currencies/);
    expect(authored(neutral("loot", "item.test.barkguard", 128, 128))).not.toThrow();
    expect(authored(placed("mine", "building.test.neutral-amber-mine"))).toThrow(/neutral/);
    const g = game(),
      w = worker(g);
    g.command("player.1", {
      type: "build",
      actors: [w.id],
      definition: "building.test.house",
      position: { x: 205, y: 210 },
    });
    const b = g.entities.at(-1)!;
    // A refund belongs to the player even without a surviving drop-off.
    g.economy.remove(g.context.get(g.state.objectives["player.1"])!);
    g.economy.remove(b, true);
    expect(g.entities.some((e) => e.item)).toBe(false);
    expect(g.state.accounting.lost["item.test.wood"] ?? 0).toBe(0);
    expect(g.state.wallets["player.1"]["item.test.wood"]).toBe(g.registry.rules.startingSetup.inventory["item.test.wood"]);
  });
});
