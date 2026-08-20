/** Hut selection goods: construction vs request/offer piles. */
import { describe, expect, it } from "vitest";
import { hutGoods } from "../../src/session/command/goods";
import { mill as millDef } from "../../src/sim/data/buildings/mill";
import { tower as towerDef } from "../../src/sim/data/buildings/tower";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { goodsStack, STACK_SIZE } from "../../src/sim/object/object";
import { World } from "../../src/sim/world/world";
import { seedRng } from "../../src/sim/rng/rng";

function grass(w: number, h: number): MapGrid {
  const grid = new MapGrid(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) grid.setLandscape(x, y, "grass");
  }
  return grid;
}

describe("hutGoods", () => {
  it("built mill shows request crop and empty flour offer", () => {
    const world = new World(grass(48, 48), undefined, seedRng(1));
    const hut = world.placeBuilding("mill", { x: 16, y: 16 }, 0)!;
    const req = millDef.requestStacks[0]!;
    world.objects.place(goodsStack({ x: hut.pos.x + req.dx, y: hut.pos.y + req.dy }, "crop", 2));
    expect(hutGoods(hut, world.objects)).toMatchObject({
      needs: [{ material: "crop", have: 2, max: STACK_SIZE }],
      produces: [{ material: "flour", have: 0, max: STACK_SIZE }],
    });
  });

  it("plan mill shows construction piles, not crop", () => {
    const world = new World(grass(48, 48), undefined, seedRng(1));
    const hut = world.placeBuilding("mill", { x: 16, y: 16 }, 0)!;
    hut.state = "plan";
    const plank = millDef.constructionStacks[0]!;
    world.objects.place(goodsStack({ x: hut.pos.x + plank.dx, y: hut.pos.y + plank.dy }, "plank", 1));
    expect(hutGoods(hut, world.objects)).toMatchObject({
      needs: [
        { material: "plank", have: 1, max: 3 },
        { material: "stone", have: 0, max: 3 },
      ],
      produces: [{ material: "flour", have: 0, max: STACK_SIZE }],
    });
  });

  it("built tower has no goods rows", () => {
    const world = new World(grass(48, 48), undefined, seedRng(1));
    const hut = world.placeBuilding("tower", { x: 16, y: 16 }, 0)!;
    expect(towerDef.requestStacks).toEqual([]);
    expect(hutGoods(hut, world.objects)).toEqual({ needs: [], produces: [] });
  });
});
