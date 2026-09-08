import { describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/registry";
import { commandCard, commandMenu, commandPage, commandPageCount, shortcutCommand } from "../../src/presentation/commands";
import { game, source, worker } from "./helpers";

describe("command categories", () => {
  it("discovers only populated worker menus and preserves concrete build intentions", () => {
    const g = game(), w = worker(g);
    const bindings = commandCard(g.view("player.1"), [w.id], "player.1", g.registry);
    const root = commandMenu(bindings, null, g.registry).entries;
    expect(root.map(b => b.id)).toEqual(["move", "stop", "category:category.build", "category:category.build-advanced"]);
    expect(shortcutCommand(root, 0, "b")?.type).toBe("category");
    const basic = commandMenu(bindings, "category.build", g.registry).entries;
    expect(basic.filter(b => b.type === "build")).toHaveLength(5);
    expect(basic.some(b => b.targetDefinition === "building.ants.barracks")).toBe(false);
    const advanced = commandMenu(bindings, "category.build-advanced", g.registry).entries;
    const barracks = advanced.find(b => b.targetDefinition === "building.ants.barracks")!;
    expect(barracks.actors).toEqual([w.id]);
    expect(barracks.costs.map(c => c.amount)).toEqual([8, 4]);
    expect(commandPage(advanced, 0).find(s => s.binding.type === "back")).toMatchObject({column: 1, row: 3, binding: {destination: null}});
    const soldier = g.entities.find(e => e.definition === "unit.ants.warrior")!;
    const army = commandCard(g.view("player.1"), [soldier.id], "player.1", g.registry);
    expect(commandMenu(army, "category.build", g.registry).category).toBeNull();
    expect(commandMenu(army, null, g.registry).entries.some(b => b.type === "category")).toBe(false);
    expect(commandMenu([], null, g.registry).entries).toEqual([]);
  });

  it("supports nested categories, explicit ungrouping, and command-specific overrides", () => {
    const s = source() as any;
    s.actions.categories["category.build-advanced"].parent = "category.build";
    s.actions.overrides["build:building.ants.house"] = {category: null};
    s.actions.overrides["build:building.ants.barracks"] = {category: "category.build"};
    const registry = new ContentRegistry(s), g = game();
    const bindings = commandCard(g.view("player.1"), [worker(g).id], "player.1", registry);
    expect(commandMenu(bindings, null, registry).entries.map(b => b.id)).toContain("build:building.ants.house");
    const basic = commandMenu(bindings, "category.build", registry).entries;
    expect(basic.map(b => b.id)).toContain("category:category.build-advanced");
    expect(basic.map(b => b.id)).toContain("build:building.ants.barracks");
    expect(commandMenu(bindings, "category.build-advanced", registry).entries.find(b => b.type === "back")).toMatchObject({destination: "category.build"});
  });

  it("keeps Back reachable on every full page and scopes shortcuts to visible entries", () => {
    const g = game();
    const seed = commandCard(g.view("player.1"), [worker(g).id], "player.1", g.registry).find(b => b.type === "build")!;
    const bindings = Array.from({length: 23}, (_, i) => ({...seed, id: `test:${String(i).padStart(2, "0")}`, category: "category.build", hotkey: i === 22 ? "Z" : undefined}));
    const menu = commandMenu(bindings, "category.build", g.registry).entries;
    expect(commandPageCount(menu)).toBe(3);
    const pages = [0, 1, 2].map(i => commandPage(menu, i));
    expect(pages.map(p => p.length)).toEqual([12, 12, 2]);
    for (const page of pages) expect(page.at(-1)).toMatchObject({column: 1, row: 3, binding: {type: "back"}});
    expect(shortcutCommand(menu, 0, "z")).toBeUndefined();
    expect(shortcutCommand(menu, 2, "z")?.id).toBe("test:22");
    expect(new Set(pages.flatMap(p => p.filter(s => s.binding.type !== "back").map(s => s.binding.id))).size).toBe(23);
  });

  it("rejects missing references, cycles, invalid icons and ambiguous shortcuts", () => {
    for (const edit of [
      (s: any) => {s.actions.actions.build.category = "category.missing";},
      (s: any) => {s.definitions[0].category = "category.missing";},
      (s: any) => {s.actions.overrides["build:building.ants.house"] = {category: "category.missing"};},
      (s: any) => {s.actions.categories["category.build"].parent = "category.build-advanced"; s.actions.categories["category.build-advanced"].parent = "category.build";},
      (s: any) => {s.actions.categories["category.build"].icon = "asset.ants.warrior";},
      (s: any) => {s.actions.categories["category.build"].hotkey = "A";},
    ]) {
      const s = source(); edit(s);
      expect(() => new ContentRegistry(s)).toThrow();
    }
  });
});
