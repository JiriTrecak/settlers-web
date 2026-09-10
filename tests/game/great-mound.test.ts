import { expect, it } from "vitest";
import { commandCard } from "../../src/presentation/commands";
import { game, placed, run, worker } from "./helpers";

it("gathers contested Root, upgrades the actual Mound, and unlocks persistent Marshal research", () => {
  const placements = [
    {...placed("root", "building.neutral.corrupted-root", 228, 229), owner: "none"},
    placed("works", "building.ants.rootworks", 235, 220),
    placed("forge", "building.ants.ironroot-forge", 205, 205),
  ];
  const g = game(placements), w = worker(g);
  const mound = g.context.get(g.state.objectives[w.owner])!;
  const root = g.entities.find(e => e.placement === "root")!;
  const forge = g.entities.find(e => e.placement === "forge")!;
  mound.inventory["item.amber"] = 1000; mound.inventory["item.wood"] = 1000;
  const research = "research.ants.campaign-harness";
  const card = () => commandCard(g.view(w.owner), [forge.id], w.owner, g.registry).find(c => c.id === `research:${research}`)!;
  expect(card().reason).toContain("Great Mound");
  expect(g.command(w.owner, {type: "upgrade", actor: mound.id}).accepted).toBe(false);
  expect(g.command(w.owner, {type: "gather", actors: [w.id], target: root.id}).accepted).toBe(true);
  for (let i = 0; i < 14000 && (mound.inventory["item.root"] ?? 0) < 160; i++) g.tick();
  expect(mound.inventory["item.root"]).toBe(160);
  g.command(w.owner, {type: "stop", actors: [w.id]});
  expect(g.command(w.owner, {type: "upgrade", actor: mound.id}).accepted).toBe(true);
  expect(mound.inventory["item.root"]).toBe(60);
  const savedId = mound.id;
  run(g, 2400);
  expect(g.context.get(g.state.objectives[w.owner])).toMatchObject({id: savedId, definition: "building.ants.great-mound"});
  expect(card().enabled).toBe(true);
  expect(g.command(w.owner, card().immediate!).accepted).toBe(true);
  expect(mound.inventory["item.root"] ?? 0).toBe(0);
  run(g, 2000);
  expect(g.state.research[w.owner]).toContain(research);
  const restored = game(placements); restored.restore(g.snapshot());
  expect(restored.snapshot()).toEqual(g.snapshot());
  // A living tier-two building gates purchases, but completed knowledge survives it.
  g.economy.remove(mound);
  expect(g.state.research[w.owner]).toContain(research);
  expect(g.registry.asset(g.registry.get("building.ants.great-mound").asset).file).toBe("assets/ant-colony/great-mound.glb");
});
