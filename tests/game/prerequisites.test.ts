import { expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/registry";
import { prerequisiteReason } from "../../src/content/prerequisites";
import { commandCard } from "../../src/presentation/commands";
import { game, placed, source, worker } from "./helpers";

it("uses the same purchase gate for construction, recruitment and command cards", () => {
  const g = game([placed("barracks", "building.ants.barracks", 225, 220)], draft => {
    for (const id of ["building.ants.house", "unit.ants.archer"])
      (draft.definitions as any[]).find(d => d.id === id).requires = ["building.ants.forester"];
  });
  const w = worker(g), barracks = g.entities.find(e => e.placement === "barracks")!;
  const reason = `Requires ${g.registry.get("building.ants.forester").name}`;
  const card = (actor: number, id: string) => commandCard(g.view("player.1"), [actor], "player.1", g.registry).find(b => b.targetDefinition === id)!;
  expect(g.canBuild(w.owner, "building.ants.house", {x: 205, y: 205}, w.id)).toBe(reason);
  expect(card(w.id, "building.ants.house")).toMatchObject({enabled: false, reason});
  expect(card(barracks.id, "unit.ants.archer")).toMatchObject({enabled: false, reason});
  const before = structuredClone(g.entities.map(e => e.inventory));
  expect(g.command("player.1", {type: "produce", actor: barracks.id, definition: "unit.ants.archer"})).toMatchObject({accepted: false});
  expect(g.entities.map(e => e.inventory)).toEqual(before);
  const prerequisite = g.context.create(placed("tech", "building.ants.forester", 240, 220));
  expect(g.canBuild(w.owner, "building.ants.house", {x: 205, y: 205}, w.id)).toBeNull();
  prerequisite.hp = 0;
  expect(g.canBuild(w.owner, "building.ants.house", {x: 205, y: 205}, w.id)).toBe(reason);
});

it("does not count enemy, unfinished, dead or remembered prerequisite buildings", () => {
  const registry = new ContentRegistry(source());
  const definition = {requires: ["building.ants.barracks"]};
  const base = {definition: "building.ants.barracks", owner: "player.1" as const, hp: 100};
  for (const change of [{owner: "player.2" as const}, {construction: {progress: 1}}, {hp: 0}, {remembered: true}])
    expect(prerequisiteReason(definition, "player.1", [{...base, ...change}], registry)).toContain("Requires");
  expect(prerequisiteReason(definition, "player.1", [base], registry)).toBeUndefined();
});

it("validates prerequisite references at content load", () => {
  for (const requires of [["unit.ants.archer"], ["building.ants.house"], ["building.ants.barracks", "building.ants.barracks"]]) {
    const draft = source();
    (draft.definitions as any[]).find(d => d.id === "building.ants.house").requires = requires;
    expect(() => new ContentRegistry(draft)).toThrow(/prerequisite/);
  }
});
