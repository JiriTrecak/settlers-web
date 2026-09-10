import { expect, it, vi } from "vitest";
import { Group } from "three";
import { commandPulseOpacity, CommandFeedbackEffects } from "../../src/render/settlement/commandFeedbackEffects";
import { commandFeedback } from "../../src/presentation/commandFeedback";
import type { HeightField } from "../../src/shared/map/height";
import { game, placed } from "../game/helpers";

it("uses one white pulse for move and two red/green pulses for attack/gather, then disposes", () => {
  const time = vi.spyOn(performance, "now").mockReturnValue(0);
  try {
    const root = new Group(), effects = new CommandFeedbackEffects(root);
    const field = {sample: (x: number, y: number) => (x + y) / 10} as HeightField;
    for (const kind of ["move", "attack", "gather"] as const) effects.show({kind, point: {x: 10, y: 10}, radius: 1}, field);
    const meshes = [...root.children] as any[];
    expect(meshes.map(m => m.material.color.getHex())).toEqual([0xffffff, 0xff4141, 0x67ff77]);
    const disposed = vi.spyOn(meshes[0].geometry, "dispose");
    effects.update(450); expect(root.children).toHaveLength(2); expect(disposed).toHaveBeenCalledOnce();
    expect(root.children.every((m: any) => m.material.opacity === 0)).toBe(true);
    effects.update(600); expect(root.children.every((m: any) => m.material.opacity > 0)).toBe(true);
    effects.update(1000); expect(root.children).toHaveLength(0);
    expect(commandPulseOpacity(.6, 1)).toBe(0); expect(commandPulseOpacity(.6, 2)).toBeGreaterThan(0);
  } finally { time.mockRestore(); }
});

it("places feedback around observed resources and never resolves a hidden target", () => {
  const g = game([{...placed("tree", "resource.forest.tree", 228, 229), owner: "none"}]);
  const view = g.view("player.1"), tree = view.entities.find(e => e.definition === "resource.forest.tree")!;
  const gather = {type: "gather" as const, actors: [1], target: tree.id};
  expect(commandFeedback(gather, view, g.registry)).toMatchObject({kind: "gather", point: {x: 228, y: 229}});
  expect(commandFeedback(gather, {...view, entities: []}, g.registry)).toBeNull();
  expect(commandFeedback({type: "move", actors: [1], destination: {x: 50, y: 50}, attackMove: true}, view, g.registry)?.kind).toBe("attack");
});
