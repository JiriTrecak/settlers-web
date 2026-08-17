import { describe, expect, it } from "vitest";
import { TILE_HEIGHT, TILE_WIDTH, gridToWorld, pickCell, pickGrid, worldToGrid } from "../../src/shared/iso/iso";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { mapViewFromGrid } from "../../src/sim/map/mapView";

describe("iso", () => {
  it("round-trips grid points at height 0", () => {
    const samples = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 7 },
      { x: 12, y: 9 },
      { x: 31, y: 18 },
    ];
    for (const p of samples) {
      const w = gridToWorld(p.x, p.y, 0);
      const g = worldToGrid(w.x, w.y);
      expect(g.x).toBeCloseTo(p.x, 10);
      expect(g.y).toBeCloseTo(p.y, 10);
      expect(pickGrid(w.x, w.y)).toEqual(p);
    }
  });

  it("uses a 16×9 diamond", () => {
    const a = gridToWorld(1, 0, 0);
    const b = gridToWorld(0, 1, 0);
    expect(a.x - gridToWorld(0, 0, 0).x).toBe(TILE_WIDTH);
    expect(b.x - gridToWorld(0, 0, 0).x).toBe(-TILE_WIDTH / 2);
    expect(b.y - gridToWorld(0, 0, 0).y).toBe(TILE_HEIGHT);
  });

  it("flat inverse does not follow height (that's pickCell's job)", () => {
    const w = gridToWorld(5, 8, 12);
    const flat = gridToWorld(5, 8, 0);
    expect(pickGrid(flat.x, flat.y)).toEqual({ x: 5, y: 8 });
    expect(w.y).toBe(flat.y - 24);
    expect(pickGrid(w.x, w.y)).not.toEqual({ x: 5, y: 8 });
  });
});

describe("pickCell", () => {
  it("hits a flat cell from its diamond centroid", () => {
    const grid = new MapGrid(16, 16);
    const view = mapViewFromGrid(grid);
    const x = 4;
    const y = 7;
    const a = gridToWorld(x, y);
    const b = gridToWorld(x + 1, y);
    const c = gridToWorld(x + 1, y + 1);
    const d = gridToWorld(x, y + 1);
    const hit = pickCell((a.x + b.x + c.x + d.x) / 4, (a.y + b.y + c.y + d.y) / 4, view.width, view.height, (gx, gy) =>
      view.heightAt(gx, gy),
    );
    expect(hit).toEqual({ x, y });
  });

  it("hits a raised plateau, not the flat cell several tiles north", () => {
    const grid = new MapGrid(24, 24);
    const h = 18;
    for (let y = 8; y <= 12; y++) {
      for (let x = 8; x <= 12; x++) grid.setHeight(x, y, h);
    }
    const view = mapViewFromGrid(grid);
    const x = 10;
    const y = 10;
    const a = gridToWorld(x, y, view.heightAt(x, y));
    const b = gridToWorld(x + 1, y, view.heightAt(x + 1, y));
    const c = gridToWorld(x + 1, y + 1, view.heightAt(x + 1, y + 1));
    const d = gridToWorld(x, y + 1, view.heightAt(x, y + 1));
    const cx = (a.x + b.x + c.x + d.x) / 4;
    const cy = (a.y + b.y + c.y + d.y) / 4;
    expect(pickGrid(cx, cy).y).toBeLessThan(y);
    expect(
      pickCell(cx, cy, view.width, view.height, (gx, gy) => view.heightAt(gx, gy)),
    ).toEqual({ x, y });
  });
});
