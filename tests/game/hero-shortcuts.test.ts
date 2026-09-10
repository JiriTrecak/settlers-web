import { describe, expect, it } from "vitest";
import { heroShortcuts } from "../../src/presentation/heroes";
import { game } from "./helpers";

describe("hero portrait shortcuts", () => {
  it("uses declared heroes and the local owner, including a player-two start", () => {
    const g = game();
    for (const owner of ["player.1", "player.2"] as const) {
      const view = g.view(owner), shortcuts = heroShortcuts(view, owner, g.registry);
      const hero = g.entities.find(e => e.owner === owner && g.registry.get(e.definition).hero)!;
      expect(shortcuts).toHaveLength(1);
      expect(shortcuts[0]).toMatchObject({id: hero.id, available: true, hp: hero.hp});
      expect(shortcuts[0].icon).toBe(g.registry.get(hero.definition).icon);
      expect(heroShortcuts(view, "none", g.registry)).toEqual([]);
    }
  });

  it("keeps fallen heroes visible but unavailable", () => {
    const g = game(), view = g.view("player.1");
    const hero = view.entities.find(e => e.owner === "player.1" && g.registry.get(e.definition).hero)!;
    view.entities = view.entities.filter(e => e.id !== hero.id);
    view.fallenHeroes = [{...hero, hp: 0}];
    expect(heroShortcuts(view, "player.1", g.registry)[0]).toMatchObject({id: hero.id, hp: 0, available: false});
  });
});
