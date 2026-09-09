import { precise } from "../../src/sim/game/motion";
import { describe, it, expect } from "vitest";
import { game, placed, run, slots } from "./helpers";
import { Game } from "../../src/sim/game/game";
import { emptyUtcMap } from "../../src/shared/map/utcmap";
import { territoryBorder } from "../../src/shared/settlement/territoryBorder";
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
    g.tick();
    expect(g.state.outcome?.winner).toBeNull();
    expect(g.state.outcome?.defeated).toHaveLength(2);
  });
  it("S17 observation does not disclose enemy inventories or draw a border at the sight circle", () => {
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
    let interior = 0;
    for (let i = 0; i < 65536; i++)
      if (view.fog!.cells[i] === 2 && g.spatial.territory[i] === 1) {
        expect(view.territoryBorders![i]).toBe(
          territoryBorder(g.spatial.territory, i % 256, Math.floor(i / 256)),
        );
        if (view.territoryBorders![i] === 0) interior++;
      }
    expect(interior).toBeGreaterThan(20);
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
    const wolf = {
        ...placed("wolf", "unit.neutral.wolf", 205, 230),
        owner: "none" as const,
      },
      g = new Game(
        {
          ...emptyUtcMap(),
          entities: [
            wolf,
            placed("warrior", "unit.ants.warrior", 206, 230),
            { ...placed("loose", "item.plank", 205, 231), owner: "none" },
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
    run(g, 15);
    expect(soldier.hp!).toBeLessThan(hp);
    neutral.x = 170;
    neutral.y = 230;
    neutral.unit!.position = null;
    neutral.unit!.segment = null;
    neutral.unit!.route = [];
    neutral.unit!.goal = null;
    neutral.unit!.target = null;
    // End the pursuit with the enemy out of the return corridor.
    g.command("player.1", {type: "stop", actors: [soldier.id]});
    soldier.x = 240; soldier.y = 245;
    soldier.unit!.position = null; soldier.unit!.segment = null;
    g.tick();
    for (let i = 0; i < 240 && neutral.unit!.returning; i++) g.tick();
    expect(neutral.unit!.returning).toBe(false);
    expect(
      (precise(neutral).x - 205) ** 2 + (precise(neutral).y - 230) ** 2,
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
