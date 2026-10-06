import { expect, it } from "vitest";
import { placementGrid } from "../../src/render/settlement/placementGrid";

it("covers the centered footprint with terrain-following cells and no duplicate shared lines", () => {
  const grid = placementGrid(9.5, 21.5, 12, 20, (x, z) => x * 0.1 + z * 0.2);
  const p = grid.fill.getAttribute("position");
  expect(p.count).toBe(3 * 5 * 6);
  grid.fill.computeBoundingBox();
  expect(grid.fill.boundingBox!.min.x).toBe(3.5);
  expect(grid.fill.boundingBox!.max.x).toBe(15.5);
  expect(grid.fill.boundingBox!.min.z).toBe(11.5);
  expect(grid.fill.boundingBox!.max.z).toBe(31.5);
  for (let i = 0; i < p.count; i++)
    expect(p.getY(i)).toBeCloseTo(p.getX(i) * 0.1 + p.getZ(i) * 0.2 + 0.08, 5);
  expect(grid.lines.getAttribute("position").count).toBe(((3 + 1) * 5 + (5 + 1) * 3) * 2);
  grid.fill.dispose(); grid.lines.dispose();
});
