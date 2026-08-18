import { describe, expect, it } from "vitest";
import { debugFrom, formatDebug } from "../../src/ui/hud/debug";
import type { FogView } from "../../src/sim/fog/fog";
import type { ViewSnapshot } from "../../src/sim/world/world";

const fog: FogView = {
  width: 1,
  height: 1,
  generation: 0,
  sightAt: () => 100,
  isHidden: () => false,
  hiddenAt: () => undefined,
  forEachHidden: () => undefined,
  isClear: () => true,
};

const empty: ViewSnapshot = { tick: 12, terrainGen: 0, movables: [], objects: [], buildings: [], fog };

const frame = {
  fps: 60,
  dtMs: 16.6,
  speed: 1 as const,
  simPerFrame: 1,
  simCapped: false,
  accMs: 4,
  zoom: 1,
  mapW: 32,
  mapH: 32,
  tool: null,
  selected: null,
};

describe("debug overlay", () => {
  it("counts settlers, jobs, buildings, and stacks", () => {
    const snap: ViewSnapshot = {
      tick: 99,
      terrainGen: 0,
      movables: [
        {
          id: 1,
          type: "bearer",
          pos: { x: 1, y: 1 },
          from: { x: 1, y: 1 },
          direction: "e",
          action: "walk",
          moveProgress: 0.5,
          stepTicks: 18,
          workProgress: 0,
          workTicks: 1,
          player: 0,
          material: "plank",
          job: "deliver",
          workplaceId: null,
          inside: false,
          path: [],
        },
        {
          id: 2,
          type: "lumberjack",
          pos: { x: 2, y: 2 },
          from: { x: 2, y: 2 },
          direction: "e",
          action: "idle",
          moveProgress: 0,
          stepTicks: 18,
          workProgress: 0,
          workTicks: 1,
          player: 0,
          material: "none",
          job: null,
          workplaceId: 1,
          inside: true,
          path: [],
        },
      ],
      objects: [
        { kind: "tree", x: 3, y: 3, sheet: 0, capacity: 0, stateProgress: 1 },
        { kind: "stack", x: 4, y: 4, sheet: 0, capacity: 6, stateProgress: 1, material: "plank" },
        { kind: "stack", x: 5, y: 5, sheet: 0, capacity: 2, stateProgress: 1, material: "plank" },
      ],
      buildings: [
        { id: 1, kind: "lumberjack", x: 8, y: 8, player: 0, state: "built", buildProgress: 1, flag: "roof" },
        { id: 2, kind: "sawmill", x: 12, y: 8, player: 0, state: "plan", buildProgress: 0, flag: null },
      ],
      fog,
    };
    const d = debugFrom(snap, frame);
    expect(d.settlerTotal).toBe(2);
    expect(d.settlers.bearer).toBe(1);
    expect(d.settlers.lumberjack).toBe(1);
    expect(d.inside).toBe(1);
    expect(d.jobs.deliver).toBe(1);
    expect(d.jobs.none).toBe(1);
    expect(d.carry.plank).toBe(1);
    expect(d.buildings.lumberjack.built).toBe(1);
    expect(d.buildings.sawmill.plan).toBe(1);
    expect(d.objects.tree).toBe(1);
    expect(d.stacks.plank).toEqual({ piles: 2, items: 8 });
    expect(formatDebug(d)).toContain("lumberjack 1");
    expect(formatDebug(d)).toContain("sawmill 1 plan");
    expect(formatDebug(d)).toContain("plank 2/8");
  });

  it("formats an empty snapshot without throwing", () => {
    expect(formatDebug(debugFrom(empty, frame))).toContain("settlers  0");
  });
});
