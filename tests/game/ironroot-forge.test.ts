import { expect, it } from "vitest";
import { commandCard } from "../../src/presentation/commands";
import { game, run, worker } from "./helpers";

it("builds the authored Forge and purchases its permanent Warrior research", () => {
  const g = game(), w = worker(g), mound = g.context.get(g.state.objectives[w.owner])!;
  mound.inventory["item.amber"] = 1000; mound.inventory["item.wood"] = 1000;
  const definition = "building.ants.ironroot-forge";
  expect(commandCard(g.view(w.owner), [w.id], w.owner, g.registry).some(c => c.targetDefinition === definition)).toBe(true);
  expect(g.command(w.owner, {type: "build", actors: [w.id], definition, position: {x: 205, y: 205}})).toMatchObject({accepted: true});
  const forge = g.entities.find(e => e.definition === definition)!;
  for (let i = 0; i < 2600 && forge.construction; i++) g.tick();
  expect(forge.construction).toBeUndefined();
  const id = "research.ants.reinforced-carapace";
  const card = commandCard(g.view(w.owner), [forge.id], w.owner, g.registry).find(c => c.id === `research:${id}`)!;
  expect(card.enabled).toBe(true); expect(g.command(w.owner, card.immediate!).accepted).toBe(true);
  run(g, g.registry.rules.research[id].workTicks);
  expect(g.state.research[w.owner]).toContain(id);
  const warrior = g.entities.find(e => e.owner === w.owner && e.definition === "unit.ants.warrior")!;
  expect(g.context.stats(warrior).maxHp).toBe(g.registry.get(warrior.definition).body!.maxHp + 150);
  expect(g.registry.asset(g.registry.get(definition).asset).file).toBe("assets/ant-colony/ironroot-forge.glb");
});
