import { expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/registry";
import { game, placed, source, worker } from "./helpers";

it("requires a visible live deposit within the declared building radius", () => {
  const g = game([{...placed("deposit", "building.neutral.amber-mine", 205, 215), owner: "none"}], draft => {
    const house = (draft.definitions as any[]).find(d => d.id === "building.ants.house");
    house.placementNear = {source: "building.neutral.amber-mine", radius: 12};
  });
  const w = worker(g), mine = g.entities.find(e => e.placement === "deposit")!;
  expect(g.canBuild(w.owner, "building.ants.house", {x: 205, y: 205}, w.id)).toBeNull();
  expect(g.canBuild(w.owner, "building.ants.house", {x: 230, y: 210}, w.id)).toContain("within 12 cells");
  mine.resource!.amount = 0; g.observation.update();
  expect(g.canBuild(w.owner, "building.ants.house", {x: 205, y: 205}, w.id)).toContain("within 12 cells");
});

it("rejects placement dependencies that are not finite resource definitions", () => {
  const draft = source();
  const house = (draft.definitions as any[]).find(d => d.id === "building.ants.house");
  house.placementNear = {source: "unit.ants.warrior", radius: 12};
  expect(() => new ContentRegistry(draft)).toThrow(/finite resource/);
});
