import { expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/registry";
import { game, placed, source, worker } from "./helpers";

it("requires a visible live deposit within the declared building radius", () => {
  const g = game([{...placed("deposit", "building.neutral.amber-mine", 193.5, 217.5), owner: "none"}], draft => {
    const house = (draft.definitions as any[]).find(d => d.id === "building.ants.house");
    house.placementNear = {source: "building.neutral.amber-mine", radius: 16};
  });
  const w = worker(g), mine = g.entities.find(e => e.placement === "deposit")!;
  expect(g.canBuild(w.owner, "building.ants.house", {x: 195.5, y: 203.5}, w.id)).toBeNull();
  expect(g.canBuild(w.owner, "building.ants.house", {x: 239.5, y: 211.5}, w.id)).toContain("within 16 cells");
  mine.resource!.amount = 0; g.observation.update();
  expect(g.canBuild(w.owner, "building.ants.house", {x: 195.5, y: 203.5}, w.id)).toContain("within 16 cells");
});

it("rejects placement dependencies that are not finite resource definitions", () => {
  const draft = source();
  const house = (draft.definitions as any[]).find(d => d.id === "building.ants.house");
  house.placementNear = {source: "unit.ants.warrior", radius: 16};
  expect(() => new ContentRegistry(draft)).toThrow(/finite resource/);
});
