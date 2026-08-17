import { describe, expect, it } from "vitest";
import { HEX_DELTAS } from "../../src/shared";
import { forester as hutDef } from "../../src/sim/data/buildings/forester";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { TREE_GROW_MS, tickTrees } from "../../src/sim/object/tree";
import { World } from "../../src/sim/world/world";
import { UNOWNED } from "../../src/sim/land/land";

function grass(w: number, h: number): MapGrid {
  const grid = new MapGrid(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) grid.setLandscape(x, y, "grass");
  }
  return grid;
}

function tickUntil(world: World, pred: () => boolean, cap = 4000): number {
  let n = 0;
  while (!pred() && n < cap) {
    world.tick();
    n++;
  }
  return n;
}

function sapling(world: World) {
  return world.objects.all().find((o) => o.kind === "tree" && o.growing);
}

describe("forester", () => {
  it("spawns at the hut door", () => {
    const world = new World(grass(48, 48));
    const at = { x: 16, y: 16 };
    const hut = world.placeBuilding("forester", at, 0);
    expect(hut).toBeDefined();
    const door = { x: at.x + hutDef.door.dx, y: at.y + hutDef.door.dy };
    expect(world.view().movables).toHaveLength(1);
    expect(world.view().movables[0]).toMatchObject({
      type: "forester",
      pos: door,
      workplaceId: hut!.id,
      material: "none",
      inside: true,
    });
  });

  it("stays inside for restMs then walks out with a sapling", () => {
    const world = new World(grass(48, 48));
    world.placeBuilding("forester", { x: 16, y: 16 }, 0);
    expect(world.view().movables[0]!.inside).toBe(true);
    for (let i = 0; i < 159; i++) world.tick();
    expect(world.view().movables[0]!.inside).toBe(true);
    tickUntil(world, () => world.view().movables[0]?.inside === false, 20);
    expect(world.view().movables[0]).toMatchObject({
      inside: false,
      material: "tree",
      job: "plant",
    });
  });

  it("plants a growing tree south of the stand tile", () => {
    const world = new World(grass(48, 48));
    world.placeBuilding("forester", { x: 16, y: 16 }, 0);
    const n = tickUntil(world, () => sapling(world) != null, 5000);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(5000);
    const tree = sapling(world)!;
    expect(tree).toMatchObject({ kind: "tree", growing: true, stateProgress: 0 });
    const m = world.view().movables[0]!;
    expect(m.pos).toEqual({ x: tree.x, y: tree.y - 1 });
    expect(m.material).toBe("none");
    expect(m.job).toBeNull();
  });

  it("does not plant on or next to a hut footprint", () => {
    const world = new World(grass(48, 48));
    const at = { x: 16, y: 16 };
    const hut = world.placeBuilding("forester", at, 0);
    expect(hut).toBeDefined();
    tickUntil(world, () => sapling(world) != null, 5000);
    const tree = sapling(world)!;
    expect(world.buildings.protects(tree.x, tree.y)).toBe(false);
    for (const { dx, dy } of HEX_DELTAS) {
      expect(world.buildings.protects(tree.x + dx, tree.y + dy)).toBe(false);
    }
  });

  it("grows to adult after TREE_GROW_MS without world-ticking the window", () => {
    const world = new World(grass(48, 48));
    world.placeBuilding("forester", { x: 16, y: 16 }, 0);
    tickUntil(world, () => sapling(world) != null, 5000);
    const tree = sapling(world)!;
    tickTrees(world.objects, TREE_GROW_MS);
    expect(world.objects.get(tree.x, tree.y)).toMatchObject({
      kind: "tree",
      growing: false,
      stateProgress: 1,
    });
  });

  it("plants only on owned land once a disk exists", () => {
    const world = new World(grass(48, 48));
    const at = { x: 16, y: 16 };
    world.land.occupy(at, 0, 10);
    expect(world.land.playerAt(31, 16)).toBe(UNOWNED);
    world.placeBuilding("forester", at, 0);
    tickUntil(world, () => sapling(world) != null, 5000);
    for (let i = 0; i < 8000; i++) world.tick();
    const trees = world.objects.all().filter((o) => o.kind === "tree");
    expect(trees.length).toBeGreaterThan(0);
    for (const t of trees) {
      expect(world.land.playerAt(t.x, t.y)).toBe(0);
    }
  });
});
