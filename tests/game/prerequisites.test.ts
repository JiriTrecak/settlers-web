import { expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/registry";
import { prerequisiteReason } from "../../src/content/prerequisites";
import { commandCard } from "../../src/presentation/commands";
import { game, placed, source, worker } from "./helpers";

it("uses the same purchase gate for construction, recruitment and command cards", () => {
  const g = game([placed("barracks", "building.test.barracks", 245.5, 209.5)], draft => {
    for (const id of ["building.test.house", "unit.test.archer"])
      (draft.definitions as any[]).find(d => d.id === id).requires = ["building.test.forester"];
  });
  const w = worker(g), barracks = g.entities.find(e => e.placement === "barracks")!;
  const reason = `Requires ${g.registry.get("building.test.forester").name}`;
  const card = (actor: number, id: string) => commandCard(g.view("player.1"), [actor], "player.1", g.registry).find(b => b.targetDefinition === id)!;
  expect(g.canBuild(w.owner, "building.test.house", {x: 199.5, y: 203.5}, w.id)).toBe(reason);
  expect(card(w.id, "building.test.house")).toMatchObject({enabled: false, reason});
  expect(card(barracks.id, "unit.test.archer")).toMatchObject({enabled: false, reason});
  const before = structuredClone(g.entities.map(e => e.inventory));
  expect(g.command("player.1", {type: "produce", actor: barracks.id, definition: "unit.test.archer"})).toMatchObject({accepted: false});
  expect(g.entities.map(e => e.inventory)).toEqual(before);
  const prerequisite = g.context.create(placed("tech", "building.test.forester", 240, 220));
  expect(g.canBuild(w.owner, "building.test.house", {x: 199.5, y: 203.5}, w.id)).toBeNull();
  prerequisite.hp = 0;
  expect(g.canBuild(w.owner, "building.test.house", {x: 199.5, y: 203.5}, w.id)).toBe(reason);
});

it("does not count enemy, unfinished, dead or remembered prerequisite buildings", () => {
  const registry = new ContentRegistry(source());
  const definition = {requires: ["building.test.barracks"]};
  const base = {definition: "building.test.barracks", owner: "player.1" as const, hp: 100};
  for (const change of [{owner: "player.2" as const}, {construction: {progress: 1}}, {hp: 0}, {remembered: true}])
    expect(prerequisiteReason(definition, "player.1", [{...base, ...change}], registry)).toContain("Requires");
  expect(prerequisiteReason(definition, "player.1", [base], registry)).toBeUndefined();
});

it("validates prerequisite references at content load", () => {
  for (const requires of [["unit.test.archer"], ["building.test.house"], ["building.test.barracks", "building.test.barracks"]]) {
    const draft = source();
    (draft.definitions as any[]).find(d => d.id === "building.test.house").requires = requires;
    expect(() => new ContentRegistry(draft)).toThrow(/prerequisite/);
  }
});
