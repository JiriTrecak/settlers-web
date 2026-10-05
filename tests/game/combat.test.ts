import {heading} from '../../src/sim/game/facing';
import { precise } from "../../src/sim/game/motion";
import { describe, it, expect } from "vitest";
import { game, placed, run, slots } from "./helpers";
import { Game } from "../../src/sim/game/game";
import { emptyUtcMap } from "../../src/shared/map/utcmap";
import { Navigation } from "../../src/sim/game/navigation";

describe("combat, knowledge and deterministic navigation", () => {
  it("S16 forced friendly attacks can destroy both objective forts in the same tick", () => {
    const g = game([
      placed("a", "unit.ants.warrior", 218, 224),
      { ...placed("b", "unit.ants.warrior", 38, 44), owner: "player.2" },
    ]);
    for (const owner of ["player.1", "player.2"] as const) {
      const target = g.context.get(g.state.objectives[owner])!,
        a = g.entities.find(
          (e) => e.placement === (owner === "player.1" ? "a" : "b"),
        )!;
      a.rotation=heading(a,target);
      target.hp = 1;
      expect(
        g.command(owner, {
          type: "attack",
          actors: [a.id],
          target: target.id,
          force: true,
        }).accepted,
      ).toBe(true);
    }
    run(g, 1 + g.registry.get("unit.ants.warrior").behaviors.combat!.attack.windupTicks);
    expect(g.state.outcome?.winner).toBeNull();
    expect(g.state.outcome?.defeated).toHaveLength(2);
  });
  it("S17 observation does not disclose enemy inventories and contains no territory boundary data", () => {
    const map = emptyUtcMap(),
      g = new Game(
        {
          ...map,
          playerStarts: map.playerStarts.map((s, i) => ({
            ...s,
            x: i ? 156 : 100,
            z: 128,
          })),
          entities: [placed("scout", "unit.ants.warrior", 151, 140)],
        },
        slots,
      );
    const view = g.view("player.1"),
      enemy = view.entities.find(
        (e) => e.owner === "player.2" && e.definition === "building.ants.fort",
      )!;
    expect(enemy).toBeDefined();
    expect(enemy.inventory).toBeUndefined();
    expect(enemy.production).toBeUndefined();
    expect(view).not.toHaveProperty('territory');
    expect(g.snapshot().knowledge[0]).not.toHaveProperty('borders');
    const scout = g.entities.find((e) => e.placement === "scout")!;
    scout.x = 90;
    scout.y = 128;
    g.observation.update();
    const remembered = g
      .view("player.1")
      .entities.find((e) => e.id === enemy.id)!;
    expect(remembered.remembered).toBe(true);
    expect(remembered.inventory).toBeUndefined();
  });
  it("S18 aggressive neutrals fight players, ignore unowned items, and return to camp after pursuit", () => {
    // Mid-map, clear of player 1's starting fort and escort at (218,218).
    const wolf = {
        ...placed("wolf", "unit.neutral.webling", 205, 130),
        owner: "none" as const,
      },
      g = new Game(
        {
          ...emptyUtcMap(),
          entities: [
            wolf,
            placed("warrior", "unit.ants.warrior", 206, 130),
            { ...placed("loose", "item.barkguard", 205, 131), owner: "none" },
          ],
          camps: [
            {
              id: "den",
              members: ["wolf"],
              home: wolf.position,
              aggroRange: 8,
              leash: 18,
              aggression: "players",
            },
          ],
        },
        slots,
      );
    const neutral = g.entities.find((e) => e.placement === "wolf")!,
      soldier = g.entities.find((e) => e.placement === "warrior")!,
      hp = soldier.hp!;
    run(g, 30);
    expect(soldier.hp!).toBeLessThan(hp);
    neutral.x = 170;
    neutral.y = 130;
    neutral.unit!.position = null;
    neutral.unit!.segment = null;
    // The old combat plan leads farther away. Camp return must replace it now,
    // rather than walk it to completion or wait for its retry deadline.
    neutral.unit!.route = [g.spatial.cell({x:160,y:130})];
    neutral.unit!.goal = neutral.unit!.route[0];
    neutral.unit!.target = soldier.id;
    neutral.unit!.retryAt = g.state.tick+100;
    // End the pursuit with the enemy out of the return corridor.
    g.command("player.1", {type: "stop", actors: [soldier.id]});
    soldier.x = 240; soldier.y = 145;
    soldier.unit!.position = null; soldier.unit!.segment = null;
    soldier.unit!.route = []; soldier.unit!.goal = null; soldier.unit!.target = null;
    // Teleports must reindex, or the stale cells body-block the return corridor.
    g.spatial.updateUnitMovement(neutral); g.spatial.updateUnitMovement(soldier);
    g.tick();
    expect(g.spatial.point(neutral.unit!.goal!).x).toBeGreaterThan(170);
    for (let i = 0; i < 240 && neutral.unit!.returning; i++) g.tick();
    expect(neutral.unit!.returning).toBe(false);
    expect(
      (precise(neutral).x - 205) ** 2 + (precise(neutral).y - 130) ** 2,
    ).toBeLessThanOrEqual(1);
    expect(
      g.entities.find((e) => e.placement === "loose")!.item!.quantity,
    ).toBe(1);
  });
  it("stable eight-direction paths avoid blocked cells", () => {
    const nav = new Navigation(5, (_a, b) => ![7, 12, 17].includes(b)),
      path = nav.path(10, 14)!;
    expect(path).toEqual(nav.path(10, 14));
    expect(path).not.toContain(12);
    let prior = 10;
    for (const next of path) {
      expect(
        Math.max(Math.abs((next % 5) - (prior % 5)),
          Math.abs(Math.floor(next / 5) - Math.floor(prior / 5))),
      ).toBe(1);
      prior = next;
    }
    expect(prior).toBe(14);
  });
});
