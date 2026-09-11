import type {Rules} from '../../src/content/schema';
import { describe, it, expect } from "vitest";
import { ContentRegistry, fingerprint } from "../../src/content/registry";
import { content } from "../../src/content/builtin";
import {
  commandCard,
  commandPage,
  shortcutCommand,
  queueCard,
  costs,
  areaSelection,
} from "../../src/presentation/commands";
import {
  emptyUtcMap,
  parseUtcMap,
  stringifyUtcMap,
} from "../../src/shared/map/utcmap";
import {
  putEntity,
  deleteEntity,
  entityAuthoringState,
  restoreEntityAuthoring,
} from "../../src/editor/world/entityAuthoring";
import { game, placed, worker, run, source } from "./helpers";

describe("content and presentation contracts", () => {
  it("rejects unknown fields, references, conflicting sets and unsupported producer inputs", () => {
    const a = source();
    (a.definitions[0] as any).behaviors.pathfinding = { algorithm: "astar" };
    expect(() => new ContentRegistry(a)).toThrow();
    const b = source();
    (b.definitions[0] as any).asset = "model.missing";
    expect(() => new ContentRegistry(b)).toThrow(/asset/);
    const c = source();
    const warrior = c.definitions.find(
      (d: any) => d.id === "unit.ants.warrior",
    ) as any;
    warrior.creation.items = [{ item: "item.barkguard", amount: 1 }];
    expect(() => new ContentRegistry(c)).toThrow(/storage must accept/);
    const d = source();
    d.behaviorSets.push({
      id: "behavior-set.conflict",
      behaviors: { movement: { speed: 1 } },
    });
    const u = d.definitions.find(
      (d: any) => d.id === "unit.ants.settler",
    ) as any;
    u.behaviorSets.push("behavior-set.conflict");
    expect(() => new ContentRegistry(d)).toThrow(/conflicting/);
  });
  it("fingerprints resolved content independently of discovery and object key order", () => {
    const a = source(),
      b = source();
    b.definitions.reverse();
    b.assets.reverse();
    b.behaviorSets.reverse();
    expect(new ContentRegistry(a).fingerprint).toBe(
      new ContentRegistry(b).fingerprint,
    );
    expect(fingerprint({ a: 1, b: 2 })).toBe(fingerprint({ b: 2, a: 1 }));
    expect(Object.isFrozen(content.get("unit.ants.warrior").body)).toBe(true);
  });
  it("S22 adds and recruits a variant entirely through JSON references", () => {
    const g = game(
      [
        placed("b", "building.ants.barracks", 205, 210, {
          inventory: { "item.wood": 2 },
        }),
      ],
      (s) => {
        const u = structuredClone(
          s.definitions.find((d: any) => d.id === "unit.ants.warrior"),
        ) as any;
        u.id = "unit.ants.vanguard";
        u.name = "Vanguard";
        u.body.maxHp = 123;
        u.creation.items[0].amount = 2;
        u.creation.workTicks = 20;
        s.definitions.push(u);
        const b = s.definitions.find(
          (d: any) => d.id === "building.ants.barracks",
        ) as any;
        b.behaviors.production.outputs.push(u.id);
      },
    );
    const b = g.entities.find((e) => e.placement === "b")!,
      card = commandCard(g.view("player.1"), [b.id], "player.1", g.registry),
      binding = card.find((b) => b.targetDefinition === "unit.ants.vanguard")!;
    expect(binding.costs[0]!.amount).toBe(2);
    expect(binding.name).toBe("Vanguard");
    g.command("player.1", binding.immediate!);
    run(g, 500);
    expect(
      g.entities.find((e) => e.definition === "unit.ants.vanguard")?.hp,
    ).toBe(123);
  });
  it("S14 prioritizes army on box selection and focuses one workplace command card", () => {
    const g = game([
        placed("b", "building.ants.barracks"),
        placed("mill", "building.ants.sanctuary", 230, 210),
      ]),
      view = g.view("player.1"),
      ids = areaSelection(view.entities, "player.1", g.registry);
    expect(ids).toHaveLength(3);
    expect(
      ids.every((id) => g.registry.get(g.context.get(id)!.definition).selectionClass === "army"),
    ).toBe(true);
    const b = g.entities.find((e) => e.placement === "b")!,
      mill = g.entities.find((e) => e.placement === "mill")!;
    expect(
      commandCard(view, [mill.id, b.id], "player.1", g.registry).some(
        (b) => b.type === "produce",
      ),
    ).toBe(false);
    expect(
      commandCard(view, [b.id, mill.id], "player.1", g.registry)
        .filter((c) => c.type === "produce")
        .every((c) => c.actors[0] === b.id),
    ).toBe(true);
    expect(
      commandCard(view, ids, "player.1", g.registry)
        .filter(b => b.type !== "cast" && b.type !== "learnAbility").map((b) => b.type),
    ).toEqual(["move", "attack", "stop", "hold", "patrol", "follow"]);
  });
  it("S15 removing control removes orders from both UI and authoritative ingress", () => {
    const g = game([], (s) => {
        const u = s.definitions.find(
          (d: any) => d.id === "unit.ants.warrior",
        ) as any;
        u.disabledBehaviors = ["playerControl"];
      }),
      e = g.entities.find(
        (e) => e.owner === "player.1" && e.definition === "unit.ants.warrior",
      )!;
    expect(
      commandCard(g.view("player.1"), [e.id], "player.1", g.registry),
    ).toEqual([]);
    expect(
      g.command("player.1", {
        type: "move",
        actors: [e.id],
        destination: { x: 220, y: 235 },
      }).accepted,
    ).toBe(false);
    expect(g.registry.get(e.definition).behaviors.combat).toBeDefined();
  });
  it("S15 an uncontrolled barracks is inspectable without recruitment or queue cancellation", () => {
    const g = game([placed("b", "building.ants.barracks")], (s) => {
      (
        s.definitions.find((d: any) => d.id === "building.ants.barracks") as any
      ).disabledBehaviors = ["playerControl"];
    });
    const b = g.entities.find((e) => e.placement === "b")!;
    g.economy.queue(b, "unit.ants.warrior");
    const view = g.view("player.1");
    expect(commandCard(view, [b.id], "player.1", g.registry)).toEqual([]);
    const queue = queueCard(view, b.id, "player.1", g.registry);
    expect(queue).toHaveLength(1);
    expect(queue[0]!.cancel).toBeNull();
    expect(
      g.command("player.1", {
        type: "cancel",
        actor: b.id,
        queue: queue[0]!.id,
      }).accepted,
    ).toBe(false);
    expect(
      g.command("player.1", {
        type: "produce",
        actor: b.id,
        definition: "unit.ants.warrior",
      }).accepted,
    ).toBe(false);
  });
  it("S15 thirteen outputs page from the top-left with stable disabled positions and scoped shortcuts", () => {
    const g = game([placed("b", "building.ants.barracks")], (s) => {
      const template = s.definitions.find(
        (d: any) => d.id === "unit.ants.warrior",
      );
      const outputs: string[] = [];
      for (let i = 0; i < 13; i++) {
        const d: any = structuredClone(template);
        d.id = `unit.ants.variant-${String(i).padStart(2, "0")}`;
        s.definitions.push(d);
        outputs.push(d.id);
      }
      (
        s.definitions.find((d: any) => d.id === "building.ants.barracks") as any
      ).behaviors.production.outputs = outputs;
      (s.rules as Rules).ai.composition = [{definition:outputs[0]!,weight:1}];
      (
        s.actions as { overrides: Record<string, { hotkey: string }> }
      ).overrides[`produce:${outputs[12]}`] = { hotkey: "Z" };
    });
    const b = g.entities.find((e) => e.placement === "b")!;
    g.context.get(g.state.objectives["player.1"])!.inventory["item.amber"] = 10000;
    for (
      let i = 0;
      i < g.registry.get(b.definition).behaviors.production!.queueCapacity!;
      i++
    )
      g.economy.queue(b, "unit.ants.variant-00");
    const bindings = commandCard(
      g.view("player.1"),
      [b.id],
      "player.1",
      g.registry,
    );
    const first = commandPage(bindings, 0),
      second = commandPage(bindings, 1);
    expect(first).toHaveLength(12);
    expect(first[0]).toMatchObject({
      column: 1,
      row: 1,
      binding: { enabled: false, targetDefinition: "unit.ants.variant-00" },
    });
    expect(first[11]).toMatchObject({ column: 4, row: 3 });
    expect(second[0]).toMatchObject({
      column: 1,
      row: 1,
      binding: { targetDefinition: "unit.ants.variant-12" },
    });
    expect(shortcutCommand(bindings, 0, "z")).toBeUndefined();
    expect(shortcutCommand(bindings, 1, "z")?.targetDefinition).toBe(
      "unit.ants.variant-12",
    );
  });
  it("S18/S19 authored items, ownership and neutral camps round trip without asset inference", () => {
    let map = putEntity(
      emptyUtcMap(),
      placed("loot", "item.barkguard", 100, 100, { quantity: 1 }),
    );
    map = putEntity(map, {
      ...placed("wolf", "unit.neutral.wolf", 110, 110),
      owner: "none",
    });
    const parsed = parseUtcMap(JSON.parse(stringifyUtcMap(map)))!;
    expect(parsed.entities).toEqual(map.entities);
    expect(parsed.camps).toEqual(map.camps);
    expect(parsed.camps[0]!.members).toEqual(["wolf"]);
    map = deleteEntity(map, "wolf");
    expect(map.camps).toEqual([]);
    expect(map.entities).toHaveLength(1);
    expect(() => deleteEntity(map, map.playerStarts[0]!.mainFort)).toThrow(
      /required/,
    );
  });
  it("prices include amber, wood and a worker, while currencies cannot be placed on the ground", () => {
    expect(costs(content, "unit.ants.archer").map(c=>c.kind)).toEqual(["item","item","unit"]);
    expect(() => putEntity(emptyUtcMap(), placed("loose", "item.wood"))).toThrow(/currencies/);
    expect(() => putEntity(emptyUtcMap(), placed("loose", "item.amber"))).toThrow(/currencies/);
  });
  it("S20 entity undo restores camps and spawns without undoing newer landscape edits", () => {
    const original = emptyUtcMap();
    const before = entityAuthoringState(original);
    const placedWolf = putEntity(original, {
      ...placed("wolf", "unit.neutral.wolf", 100, 100),
      owner: "none",
    });
    const after = entityAuthoringState(placedWolf);
    const edited = {
      ...placedWolf,
      name: "A later terrain edit",
      stamps: [
        { id: "decor", asset: "tree-pine", x: 120, y: 120, yaw: 0, scale: 1 },
      ],
    };
    const undone = restoreEntityAuthoring(edited, before);
    expect(undone.entities).toEqual(original.entities);
    expect(undone.camps).toEqual([]);
    expect(undone.name).toBe(edited.name);
    expect(undone.stamps).toBe(edited.stamps);
    expect(restoreEntityAuthoring(undone, after).camps).toEqual(
      placedWolf.camps,
    );
  });
  it("does not create simulation resources from decorative model names", () => {
    const g = game();
    expect(g.entities.some((e) => e.resource)).toBe(false);
    expect(worker(g).definition).toBe("unit.ants.settler");
  });
});
