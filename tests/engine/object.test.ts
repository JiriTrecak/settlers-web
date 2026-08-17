import { describe, expect, it } from "vitest";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { ObjectGrid, trunkStack } from "../../src/sim/object/object";
import { findPath, isWalkable } from "../../src/sim/path/path";
import { CHOP_TICKS, DROP_TICKS, PICKUP_TICKS, World } from "../../src/sim";

function grass(w: number, h: number): MapGrid {
  const grid = new MapGrid(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) grid.setLandscape(x, y, "grass");
  }
  return grid;
}

describe("object grid", () => {
  it("blocks walking onto a tree", () => {
    const grid = grass(8, 8);
    const objects = new ObjectGrid(8, 8);
    objects.place({ kind: "tree", x: 4, y: 3, sheet: 0, capacity: 0, stateProgress: 1 });
    expect(isWalkable(grid, 4, 3, objects)).toBe(false);
    expect(isWalkable(grid, 3, 3, objects)).toBe(true);
    const path = findPath(grid, { x: 2, y: 3 }, { x: 6, y: 3 }, objects);
    expect(path).not.toBeNull();
    expect(path!.some((p) => p.x === 4 && p.y === 3)).toBe(false);
    expect(path!.at(-1)).toEqual({ x: 6, y: 3 });
  });
});

describe("chop", () => {
  it("walks adjacent then removes the tree", () => {
    const objects = new ObjectGrid(12, 12);
    objects.place({ kind: "tree", x: 5, y: 3, sheet: 1, capacity: 0, stateProgress: 1 });
    const world = new World(grass(12, 12), objects);
    const bearer = world.spawnBearer({ x: 3, y: 3 });
    world.dispatch({ type: "chop", id: bearer.id, at: { x: 5, y: 3 } });
    expect(bearer.job).toEqual({ type: "chop", at: { x: 5, y: 3 } });
    let n = 0;
    while (world.objects.get(5, 3)?.kind === "tree" && n < 400) {
      world.tick();
      n++;
    }
    expect(n).toBeGreaterThan(CHOP_TICKS);
    expect(world.objects.get(5, 3)).toMatchObject({ kind: "stack", material: "trunk", capacity: 1 });
    expect(bearer.job).toBeNull();
    expect(world.view().movables[0]!.action).toBe("idle");
  });

  it("moveTo cancels an in-progress chop", () => {
    const objects = new ObjectGrid(12, 12);
    objects.place({ kind: "tree", x: 4, y: 3, sheet: 0, capacity: 0, stateProgress: 1 });
    const world = new World(grass(12, 12), objects);
    const bearer = world.spawnBearer({ x: 3, y: 3 });
    world.dispatch({ type: "chop", id: bearer.id, at: { x: 4, y: 3 } });
    for (let i = 0; i < 8; i++) world.tick();
    world.dispatch({ type: "moveTo", id: bearer.id, to: { x: 3, y: 5 } });
    expect(world.view().movables[0]!.action).not.toBe("work");
    for (let i = 0; i < CHOP_TICKS + 40; i++) world.tick();
    expect(world.objects.get(4, 3)?.kind).toBe("tree");
  });
});

describe("pickup", () => {
  it("walks adjacent then carries the trunk", () => {
    const objects = new ObjectGrid(12, 12);
    objects.place({
      kind: "stack",
      x: 5,
      y: 3,
      sheet: 0,
      capacity: 1,
      stateProgress: 1,
      material: "trunk",
    });
    const world = new World(grass(12, 12), objects);
    const bearer = world.spawnBearer({ x: 3, y: 3 });
    world.dispatch({ type: "pickup", id: bearer.id, at: { x: 5, y: 3 } });
    expect(bearer.job).toEqual({ type: "pickup", at: { x: 5, y: 3 } });
    let n = 0;
    while (world.objects.get(5, 3) && n < 200) {
      world.tick();
      n++;
    }
    expect(world.objects.get(5, 3)).toBeUndefined();
    expect(bearer.material).toBe("trunk");
    expect(bearer.job).toBeNull();
    expect(world.view().movables[0]).toMatchObject({ material: "trunk", action: "idle" });
    expect(n).toBeGreaterThan(PICKUP_TICKS);
  });

  it("chop then pickup leaves the bearer carrying", () => {
    const objects = new ObjectGrid(12, 12);
    objects.place({ kind: "tree", x: 4, y: 3, sheet: 0, capacity: 0, stateProgress: 1 });
    const world = new World(grass(12, 12), objects);
    const bearer = world.spawnBearer({ x: 3, y: 3 });
    world.dispatch({ type: "chop", id: bearer.id, at: { x: 4, y: 3 } });
    let n = 0;
    while (world.objects.get(4, 3)?.kind === "tree" && n < 400) {
      world.tick();
      n++;
    }
    expect(world.objects.get(4, 3)?.kind).toBe("stack");
    world.dispatch({ type: "pickup", id: bearer.id, at: { x: 4, y: 3 } });
    n = 0;
    while (world.objects.get(4, 3) && n < 200) {
      world.tick();
      n++;
    }
    expect(world.objects.get(4, 3)).toBeUndefined();
    expect(bearer.material).toBe("trunk");
  });

  it("moveTo while carrying keeps the trunk", () => {
    const objects = new ObjectGrid(12, 12);
    objects.place({
      kind: "stack",
      x: 4,
      y: 3,
      sheet: 0,
      capacity: 1,
      stateProgress: 1,
      material: "trunk",
    });
    const world = new World(grass(12, 12), objects);
    const bearer = world.spawnBearer({ x: 3, y: 3 });
    world.dispatch({ type: "pickup", id: bearer.id, at: { x: 4, y: 3 } });
    for (let i = 0; i < PICKUP_TICKS + 20; i++) world.tick();
    expect(bearer.material).toBe("trunk");
    world.dispatch({ type: "moveTo", id: bearer.id, to: { x: 3, y: 5 } });
    expect(bearer.job).toBeNull();
    expect(bearer.material).toBe("trunk");
    for (let i = 0; i < bearer.stepTicks * 4; i++) world.tick();
    expect(world.view().movables[0]).toMatchObject({
      pos: { x: 3, y: 5 },
      material: "trunk",
      action: "idle",
    });
  });
});

describe("drop", () => {
  it("walks adjacent then places the trunk", () => {
    const objects = new ObjectGrid(12, 12);
    objects.place(trunkStack({ x: 4, y: 3 }));
    const world = new World(grass(12, 12), objects);
    const bearer = world.spawnBearer({ x: 3, y: 3 });
    world.dispatch({ type: "pickup", id: bearer.id, at: { x: 4, y: 3 } });
    for (let i = 0; i < PICKUP_TICKS + 20; i++) world.tick();
    expect(bearer.material).toBe("trunk");
    world.dispatch({ type: "drop", id: bearer.id, at: { x: 5, y: 3 } });
    expect(bearer.job).toEqual({ type: "drop", at: { x: 5, y: 3 } });
    let n = 0;
    while (!world.objects.get(5, 3) && n < 200) {
      world.tick();
      n++;
    }
    expect(world.objects.get(5, 3)).toMatchObject({ kind: "stack", material: "trunk", capacity: 1 });
    expect(bearer.material).toBe("none");
    expect(bearer.job).toBeNull();
    expect(n).toBeGreaterThan(DROP_TICKS);
  });

  it("refuses empty hands and occupied tiles", () => {
    const objects = new ObjectGrid(12, 12);
    objects.place(trunkStack({ x: 4, y: 3 }));
    const world = new World(grass(12, 12), objects);
    const bearer = world.spawnBearer({ x: 3, y: 3 });
    world.dispatch({ type: "drop", id: bearer.id, at: { x: 5, y: 3 } });
    expect(bearer.job).toBeNull();
    expect(world.objects.get(5, 3)).toBeUndefined();
    world.dispatch({ type: "drop", id: bearer.id, at: { x: 4, y: 3 } });
    expect(world.objects.get(4, 3)?.kind).toBe("stack");
  });
});
