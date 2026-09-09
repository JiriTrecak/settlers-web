import { economy } from "../../src/sim/ai/economy";
import { describe, it, expect } from "vitest";
import { World } from "../../src/sim/world/world";
import { emptyUtcMap } from "../../src/shared/map/utcmap";
import { content } from "../../src/content/builtin";
import { PlayerAI } from "../../src/sim/ai/playerAI";
import { createMapBriefing } from "../../src/sim/ai/briefing";
import { Geography, Frame, playerObservation } from "../../src/sim/ai/frame";
import type {
  EntityView,
  SettlementView,
} from "../../src/sim/game/observation";
import { reactions, heroActions } from "../../src/sim/ai/tactics";
import { newAIState } from "../../src/sim/ai/state";
import type { Action } from "../../src/shared/types/types";
const slots = [
  { player: 0, kind: "ai" as const },
  { player: 1, kind: "human" as const },
];
const campMap = () => ({
  ...emptyUtcMap(),
  entities: [
    {
      id: "camp-wolf",
      definition: "unit.neutral.wolf",
      position: { x: 110, y: 110 },
      rotation: 0,
      owner: "none" as const,
    },
  ],
  camps: [
    {
      id: "wolves",
      home: { x: 110, y: 110 },
      members: ["camp-wolf"],
      aggroRange: 10,
      leash: 16,
      aggression: "players" as const,
    },
  ],
});
function fixture() {
  const map = campMap(),
    world = new World({ map, slots, seed: 5 }),
    geo = new Geography(createMapBriefing(map, content));
  return { map, world, geo, brain: new PlayerAI("player.1", content, geo, 5) };
}
function acknowledge(
  brain: PlayerAI,
  tick: number,
  commands: ReturnType<PlayerAI["decide"]>,
) {
  for (const c of commands)
    brain.receipt({ seq: c.seq, tick: tick + 1, accepted: true, actors: [] });
}
function soldier(
  id: number,
  definition: string,
  x: number,
  y: number,
  hp?: number,
): EntityView {
  const d = content.get(definition);
  return {
    id,
    definition,
    owner: "player.1",
    x,
    y,
    rotation: 0,
    hp: hp ?? d.body!.maxHp,
    stats: {
      level: 1,
      maxHp: d.body!.maxHp,
      damage: d.behaviors.combat?.damage ?? 0,
      armor: d.body!.armor,
    },
    unit: {
      moving: false,
      contained: false,
      cargo: null,
      target: null,
      cooldown: 0,
    },
    control: {
      order: null,
      job: null,
      employment: null,
      pendingMove: null,
      releasing: false,
      stunned: false,
    },
  };
}
function seen(base: SettlementView, entities: EntityView[]): SettlementView {
  return {
    ...base,
    entities,
    fog: {
      owner: 0,
      revision: 1,
      cells: new Uint8Array(base.territory.length).fill(2),
    },
  };
}
describe("player AI information and authority boundary", () => {
  it("knows authored camp sites without knowing an unseen camp was cleared", () => {
    const { map, world: a } = fixture(),
      b = new World({ map, slots, seed: 5 });
    const hidden = b.settlement.entities.find(
      (e) => e.placement === "camp-wolf",
    )!;
    hidden.hp = 0;
    for (let t = 0; t < 100; t++) {
      a.tick();
      b.tick();
    }
    expect(a.log()).toEqual(b.log());
    expect(a.snapshot().ai).toEqual(b.snapshot().ai);
    expect(a.snapshot().ai[0].state.camps.wolves.status).toBe("expected");
  });
  it("updates an empty site only after observing its clearing and excludes hidden briefing objects", () => {
    const { world, brain, map } = fixture(),
      view = world.settlement.view(0);
    acknowledge(brain, 10, brain.decide(10, view));
    const visible = seen(view, [...view.entities]);
    brain.decide(20, visible);
    expect(brain.snapshot().camps.wolves.status).toBe("empty");
    const hidden = {
      ...map,
      camps: map.camps.map((c) => ({ ...c, mapKnowledge: "hidden" as const })),
      entities: map.entities.map((e) => ({
        ...e,
        mapKnowledge: "hidden" as const,
      })),
    };
    expect(createMapBriefing(hidden, content).camps).toHaveLength(0);
  });
  it("strips private enemy cooldowns, cargo, orders, effects and simulation cues", () => {
    const { world } = fixture(),
      base = world.settlement.view(0),
      enemy = soldier(900, "unit.ants.warrior", 220, 220);
    enemy.owner = "player.2";
    enemy.unit!.cooldown = 999;
    enemy.unit!.cargo = { item: "item.wood", amount: 4 };
    enemy.effects = [];
    enemy.inventory = { "item.amber": 999 };
    const view = playerObservation(
      { ...base, entities: [enemy], deaths: [enemy] },
      "player.1",
    );
    expect(view.entities[0].control).toBeUndefined();
    expect(view.entities[0].inventory).toBeUndefined();
    expect(view.entities[0].effects).toBeUndefined();
    expect(view.entities[0].unit).toMatchObject({
      cooldown: 0,
      cargo: null,
      target: null,
    });
    expect(view.deaths).toEqual([]);
  });
  it("limits commands and gives each actor only one command per decision", () => {
    const { brain, world } = fixture(),
      commands = brain.decide(10, world.settlement.view(0));
    expect(commands.length).toBeLessThanOrEqual(
      content.rules.ai.limits.commandsPerBeat,
    );
    const actors = commands.flatMap((c) =>
      "actors" in c.action
        ? c.action.actors
        : "actor" in c.action
          ? [c.action.actor]
          : [],
    );
    expect(new Set(actors).size).toBe(actors.length);
    expect(
      commands.filter(
        (c) => c.action.type === "build" || c.action.type === "produce",
      ).length,
    ).toBeLessThanOrEqual(1);
    expect(new Set(commands.map((c) => c.seq)).size).toBe(commands.length);
  });
  it("retains pending intentions, knowledge, missions and cooldowns through arbitrary-tick saves", () => {
    const { map, world: a } = fixture();
    for (let t = 0; t < 377; t++) a.tick();
    const b = new World({ map, slots, seed: 5 });
    b.restore(JSON.parse(JSON.stringify(a.snapshot())));
    expect(a.checksum()).toBe(b.checksum());
    for (let t = 0; t < 1000; t++) {
      a.tick();
      b.tick();
      if (t % 100 === 0) expect(a.checksum()).toBe(b.checksum());
    }
    expect(a.snapshot().ai).toEqual(b.snapshot().ai);
    const bad = a.snapshot();
    bad.ai[0].state.briefing = "other";
    expect(() => b.restore(bad)).toThrow("AI briefing mismatch");
  });
});
describe("hero and tactical decisions", () => {
  it("learns eligible ranks, heals damage and revives the same fallen hero", () => {
    const { world, geo } = fixture(),
      base = world.settlement.view(0),
      hero = soldier(900, "unit.ants.marshal", 205, 205, 140);
    hero.equipment = ["item.resin-salve", null, null, null, null, null];
    hero.spellcasting = {
      mana: 320,
      learned: {},
      cooldowns: {},
      pending: null,
    };
    hero.progression = { experience: 0 };
    const actions: Action[] = [],
      state = newAIState(geo.map.fingerprint, 1),
      emit = (a: Action) => {
        actions.push(a);
        return true;
      };
    heroActions(
      new Frame(seen(base, [hero]), "player.1", content, geo, 100),
      state,
      emit,
    );
    expect(actions[0].type).toBe("learnAbility");
    hero.spellcasting.learned = { "spell.marshal.faultline": 1 };
    actions.length = 0;
    heroActions(
      new Frame(seen(base, [hero]), "player.1", content, geo, 110),
      state,
      emit,
    );
    expect(actions[0]).toEqual({ type: "useItem", actor: 900, slot: 0 });
    const actual = world.settlement.entities.find(
      (e) => content.get(e.definition).hero && e.owner === "player.1",
    )!;
    world.settlement.context.create({
      id: "sanctuary",
      definition: "building.ants.sanctuary",
      position: { x: 225, y: 220 },
      rotation: 0,
      owner: "player.1",
    });
    actual.hp = 0;
    world.settlement.economy.remove(actual);
    world.settlement.revival.retain(actual);
    for (let t = 0; t < 1000; t++) world.tick();
    expect(
      world.settlement.entities.find((e) => e.id === actual.id)?.hp,
    ).toBeGreaterThan(0);
    expect(world.aiSummary()[0].metrics.revivals).toBe(1);
  });
  it("waits for its reaction deadline before targeting a visible cluster", () => {
    const { world, geo } = fixture(),
      base = world.settlement.view(0),
      hero = soldier(900, "unit.ants.marshal", 205, 205);
    hero.equipment = [null, null, null, null, null, null];
    hero.spellcasting = {
      mana: 320,
      learned: { "spell.marshal.faultline": 1 },
      cooldowns: {},
      pending: null,
    };
    const enemies = [
      soldier(901, "unit.neutral.wolf", 208, 205),
      soldier(902, "unit.neutral.wolf", 209, 205),
    ];
    for (const e of enemies) {
      e.owner = "none";
      e.hostile = true;
      delete e.control;
    }
    const actions: Action[] = [],
      state = newAIState(geo.map.fingerprint, 1);
    state.inspected["contact:901"] = 100;
    state.inspected["contact:902"] = 100;
    const emit = (a: Action) => {
      actions.push(a);
      return true;
    };
    heroActions(
      new Frame(seen(base, [hero, ...enemies]), "player.1", content, geo, 100),
      state,
      emit,
    );
    expect(actions).toHaveLength(0);
    heroActions(
      new Frame(seen(base, [hero, ...enemies]), "player.1", content, geo, 120),
      state,
      emit,
    );
    expect(actions).toContainEqual({
      type: "cast",
      actor: 900,
      ability: "spell.marshal.faultline",
      point: { x: 209, y: 205 },
    });
  });
  it("evacuates a damaged worker and remembers its harvest target instead of chasing the attacker", () => {
    const { world, geo } = fixture(),
      base = world.settlement.view(0),
      worker = soldier(900, "unit.ants.settler", 205, 205, 20),
      enemy = soldier(901, "unit.neutral.wolf", 206, 205);
    worker.control!.order = { type: "gather", target: 999 };
    enemy.hostile = true;
    enemy.owner = "none";
    delete enemy.control;
    const state = newAIState(geo.map.fingerprint, 1);
    state.damage[900] = { hp: 20, seen: 100, reactAt: 90 };
    const actions: Action[] = [];
    reactions(
      new Frame(seen(base, [worker, enemy]), "player.1", content, geo, 100),
      state,
      (a) => {
        actions.push(a);
        return true;
      },
    );
    expect(actions[0]).toMatchObject({ type: "move", actors: [900] });
    expect(state.workerReturns[900].target).toBe(999);
  });
});

describe("disruption and scaling gates", () => {
  it("puts the last broke worker back to harvesting instead of reserving the whole workforce", () => {
    const { world, geo } = fixture(),
      base = world.settlement.view(0),
      worker = soldier(900, "unit.ants.settler", 218, 223);
    const resource: EntityView = {
      id: 901,
      definition: "resource.amber.seam",
      owner: "none",
      x: 230,
      y: 223,
      rotation: 0,
      hp: null,
      resource: { amount: 1000, growingUntil: null },
    };
    const actions: Action[] = [];
    economy(
      new Frame(seen(base, [worker, resource]), "player.1", content, geo, 100),
      newAIState(geo.map.fingerprint, 1),
      (a) => {
        actions.push(a);
        return true;
      },
    );
    expect(actions).toContainEqual({
      type: "gather",
      actors: [900],
      target: 901,
    });
  });
  it("does not crash or waste its guard cooldown merely because an enemy worker is nearby", () => {
    const { world, geo } = fixture(),
      base = world.settlement.view(0),
      hero = soldier(900, "unit.ants.marshal", 205, 205, 200),
      enemy = soldier(901, "unit.ants.settler", 206, 205);
    hero.spellcasting = {
      mana: 320,
      learned: { "spell.marshal.carapace": 1 },
      cooldowns: {},
      pending: null,
    };
    enemy.owner = "player.2";
    enemy.hostile = true;
    const actions: Action[] = [],
      state = newAIState(geo.map.fingerprint, 1);
    state.inspected["contact:901"] = 0;
    heroActions(
      new Frame(seen(base, [hero, enemy]), "player.1", content, geo, 100),
      state,
      (a) => {
        actions.push(a);
        return true;
      },
    );
    expect(actions.filter((a) => a.type === "cast")).toHaveLength(0);
  });
  it("preserves witnessed death reports through a save between AI reviews", () => {
    const { world, brain } = fixture(),
      g = world.settlement,
      hero = g.entities.find(
        (e) => content.get(e.definition).hero && e.owner === "player.1",
      )!;
    const enemy = g.context.create({
      id: "near-wolf",
      definition: "unit.neutral.wolf",
      position: { x: hero.x + 3, y: hero.y },
      rotation: 0,
      owner: "none",
    });
    g.observation.update();
    g.observation.recordDeath(enemy);
    enemy.hp = 0;
    const before = g.view(0).observedDeaths!;
    expect(before.map((e) => e.id)).toContain(enemy.id);
    const save = g.snapshot();
    g.restore(save);
    expect(g.view(0).observedDeaths).toEqual(before);
    expect(() => brain.decide(10, g.view(0))).not.toThrow();
  });
  it("runs all eight supported AI slots with bounded output and snapshot continuity", () => {
    const map = {
      ...emptyUtcMap(512),
      playerStarts: Array.from({ length: 8 }, (_, i) => ({
        player: i + 1,
        x: 48 + (i % 4) * 130,
        z: 64 + Math.floor(i / 4) * 360,
        setup: "setup.ants",
        mainFort: `start.player.${i + 1}/main-fort`,
      })),
    };
    const opts = {
        map,
        seed: 8,
        slots: map.playerStarts.map((p) => ({
          player: p.player - 1,
          kind: "ai" as const,
        })),
      },
      a = new World(opts);
    for (let t = 0; t < 40; t++) a.tick();
    expect(a.aiSummary()).toHaveLength(8);
    for (const state of a.snapshot().ai)
      expect(state.state.pending.length).toBeLessThanOrEqual(
        content.rules.ai.limits.commandsPerBeat,
      );
    const b = new World(opts);
    b.restore(a.snapshot());
    a.tick();
    b.tick();
    expect(a.checksum()).toBe(b.checksum());
  });
});
