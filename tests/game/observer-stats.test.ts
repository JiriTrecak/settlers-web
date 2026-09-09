import { describe, it, expect } from "vitest";
import {
  ObserverIncome,
  observerStats,
} from "../../src/presentation/observerStats";
import { Game } from "../../src/sim/game/game";
import { content } from "../../src/content/builtin";
import { emptyUtcMap } from "../../src/shared/map/utcmap";
import { game, placed, slots, worker } from "./helpers";
import type { ResourceDelivery } from "../../src/sim/game/economy";

const receipt = (
  tick: number,
  amount = 8,
  item = "item.amber",
  owner = "player.1",
): ResourceDelivery => ({ tick, amount, item, owner });
describe("observer income", () => {
  it("tracks gross deposited income per player and resource in game time, with an exact rolling minute", () => {
    const income = new ObserverIncome();
    income.record(40, [
      receipt(40, 8),
      receipt(40, 4, "item.wood"),
      receipt(40, 2, "item.amber", "player.2"),
    ]);
    income.record(1200, []);
    expect(income.observedSeconds).toBe(30);
    expect(income.perMinute("player.1", "item.amber")).toBe(16);
    expect(income.perMinute("player.1", "item.wood")).toBe(8);
    expect(income.perMinute("player.2", "item.amber")).toBe(4);
    income.record(2400, []);
    expect(income.perMinute("player.1", "item.amber")).toBe(8);
    income.record(2440, []);
    expect(income.perMinute("player.1", "item.amber")).toBe(0);
  });
  it("ignores duplicate reads and stale receipts after a completed match", () => {
    const income = new ObserverIncome();
    income.record(40, [receipt(40)]);
    income.record(40, [receipt(40)]);
    income.record(80, [receipt(40)]);
    expect(income.perMinute("player.1", "item.amber")).toBe(240);
  });
  it("starts a fresh sampling window when a save is loaded", () => {
    const income = new ObserverIncome();
    income.record(40, [receipt(40)]);
    income.reset(2000);
    expect(income.observedSeconds).toBe(0);
    expect(income.perMinute("player.1", "item.amber")).toBe(0);
    income.record(2040, [receipt(2040, 2)]);
    income.record(3200, []);
    expect(income.perMinute("player.1", "item.amber")).toBe(4);
  });
});
describe("observer score projection", () => {
  it("shows each hall balance separately; spending and refunds do not masquerade as income", () => {
    const g = game(),
      income = new ObserverIncome();
    income.record(1200, [receipt(1200, 8)]);
    const hall = g.context.get(g.state.objectives["player.1"])!;
    const initial = observerStats(g.state, slots, content, income);
    expect(initial.players[0].resources[0]).toEqual({
      item: "item.amber",
      stored: 60,
      perMinute: 16,
    });
    hall.inventory["item.amber"] -= 20;
    const spent = observerStats(g.state, slots, content, income);
    expect(spent.players[0].resources[0]).toEqual({
      item: "item.amber",
      stored: 40,
      perMinute: 16,
    });
    hall.inventory["item.amber"] += 20;
    worker(g).unit!.cargo = { item: "item.amber", amount: 8 };
    expect(
      observerStats(g.state, slots, content, income).players[0].resources[0]
        .stored,
    ).toBe(60);
    expect(initial.players[1].resources[0].perMinute).toBe(0);
  });
  it("counts contained and idle workers, excludes dead units, and retains fallen hero level", () => {
    const g = game([placed("marshal", "unit.ants.marshal")]),
      income = new ObserverIncome();
    const ownerUnits = g.entities.filter(
        (e) => e.owner === "player.1" && e.unit,
      ),
      w = worker(g),
      hero = ownerUnits.find((e) => content.get(e.definition).hero)!;
    w.unit!.contained = g.state.objectives["player.1"];
    const workers = ownerUnits.filter(
      (e) => content.get(e.definition).behaviors.work,
    ).length;
    let row = observerStats(g.state, slots, content, income).players[0];
    expect(row.units).toBe(ownerUnits.length);
    expect(row.workers).toBe(workers);
    w.definition = "unit.ants.warrior";
    row = observerStats(g.state, slots, content, income).players[0];
    expect(row.units).toBe(ownerUnits.length);
    expect(row.workers).toBe(workers - 1);
    w.hp = 0;
    hero.hp = 0;
    hero.fallen = true;
    hero.progression!.experience = content.get(
      hero.definition,
    ).behaviors.progression!.thresholds[4];
    row = observerStats(g.state, slots, content, income).players[0];
    expect(row.units).toBe(ownerUnits.length - 2);
    expect(row.heroes[0]).toMatchObject({
      id: hero.id,
      level: 5,
      status: "fallen",
    });
    g.context.get(g.state.objectives["player.1"])!.revival = {
      queue: [{ hero: hero.id, progress: 10 }],
    };
    expect(
      observerStats(g.state, slots, content, income).players[0].heroes[0]
        .status,
    ).toBe("reviving");
  });
  it("produces no simulation mutation and retains named, colored player identities", () => {
    const g = game(),
      snapshot = g.snapshot();
    const projected = observerStats(
      g.state,
      [
        { player: 1, kind: "ai", name: "Blue colony" },
        { player: 0, kind: "ai", name: "Red colony" },
      ],
      content,
      new ObserverIncome(),
    );
    expect(projected.players.map((p) => [p.player, p.name])).toEqual([
      [0, "Red colony"],
      [1, "Blue colony"],
    ]);
    expect(g.snapshot()).toEqual(snapshot);
  });
});
describe("economy delivery receipts", () => {
  it("counts only deposits, including abandoned harvests that are rerouted, without changing accounting or saves", () => {
    const map = emptyUtcMap(),
      entities = map.playerStarts.flatMap((s) => [
        {
          ...placed(`mine.${s.player}`, "resource.amber.seam", s.x, s.z - 14),
          owner: "none" as const,
        },
        {
          ...placed(
            `tree.${s.player}`,
            "resource.forest.tree",
            s.x + 8,
            s.z + 5,
            { amount: 8 },
          ),
          owner: "none" as const,
        },
      ]);
    const g = new Game({ ...map, entities }, slots, content, 159),
      income = new ObserverIncome();
    const totals = new Map<string, number>();
    let interrupted = false,
      sawUnbankedHarvest = false,
      sawReroutedDelivery = false;
    for (let i = 1; i <= 1600; i++) {
      const reroutes = new Set(
        g.state.jobs.filter((j) => j.type === "deliver").map((j) => j.worker),
      );
      g.tick();
      for (const r of g.economy.deliveries) {
        expect(r.tick).toBe(i);
        totals.set(
          r.owner + "/" + r.item,
          (totals.get(r.owner + "/" + r.item) ?? 0) + r.amount,
        );
        if (reroutes.size) sawReroutedDelivery = true;
      }
      income.record(i, g.economy.deliveries);
      if (g.entities.some((e) => e.unit?.cargo) && totals.size === 0)
        sawUnbankedHarvest = true;
      const w = g.entities.find((e) => e.owner === "player.1" && e.unit?.cargo);
      if (w && !interrupted) {
        const job=g.state.jobs.find(j=>j.id===w.unit!.job)!;
        g.economy.abandon(job);
        interrupted = true;
      }
    }
    expect(interrupted).toBe(true);
    expect(sawUnbankedHarvest).toBe(true);
    expect(sawReroutedDelivery).toBe(true);
    for (const owner of ["player.1", "player.2"]) {
      const hall = g.context.get(g.state.objectives[owner])!;
      expect(totals.get(owner + "/item.amber")).toBe(
        hall.inventory["item.amber"] - 60,
      );
      expect(totals.get(owner + "/item.wood")).toBe(
        hall.inventory["item.wood"] - 80,
      );
    }
    expect(income.perMinute("player.1", "item.amber")).toBeGreaterThan(0);
    expect(g.snapshot()).not.toHaveProperty("deliveries");
  });
});
