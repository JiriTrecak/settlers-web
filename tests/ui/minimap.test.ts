import { describe, expect, it } from "vitest";
import { Camera } from "../../src/render/camera/camera";
import { gridToWorld } from "../../src/shared";
import { gridToMinimapPx, minimapPxToGrid, viewportMinimapQuad } from "../../src/ui/minimap/minimap";

function quadArea(quad: { x: number; y: number }[]): number {
  let area = 0;
  for (let i = 0; i < quad.length; i++) {
    const a = quad[i]!;
    const b = quad[(i + 1) % quad.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

function centroid(quad: { x: number; y: number }[]): { x: number; y: number } {
  return {
    x: quad.reduce((s, p) => s + p.x, 0) / quad.length,
    y: quad.reduce((s, p) => s + p.y, 0) / quad.length,
  };
}

describe("minimap mapping", () => {
  it("round-trips grid ↔ minimap pixels", () => {
    const g = minimapPxToGrid(84, 42, 64, 64, 168, 168);
    const p = gridToMinimapPx(g.x, g.y, 64, 64, 168, 168);
    expect(p.x).toBeCloseTo(84, 10);
    expect(p.y).toBeCloseTo(42, 10);
  });

  it("puts the screen center on the looked-at tile", () => {
    const cam = new Camera();
    cam.zoom = 2;
    const tile = { x: 12, y: 20 };
    const world = gridToWorld(tile.x, tile.y);
    cam.panX = 400 - world.x * cam.zoom;
    cam.panY = 300 - world.y * cam.zoom;
    const quad = viewportMinimapQuad(cam, 800, 600, 64, 64, 168, 168);
    const c = centroid(quad);
    const expected = gridToMinimapPx(tile.x, tile.y, 64, 64, 168, 168);
    expect(c.x).toBeCloseTo(expected.x, 5);
    expect(c.y).toBeCloseTo(expected.y, 5);
  });

  it("shrinks the viewport quad when zooming in", () => {
    const cam = new Camera();
    cam.zoom = 1;
    cam.panX = 400;
    cam.panY = 300;
    const wide = quadArea(viewportMinimapQuad(cam, 800, 600, 64, 64, 168, 168));
    cam.zoom = 2;
    const tight = quadArea(viewportMinimapQuad(cam, 800, 600, 64, 64, 168, 168));
    expect(tight).toBeCloseTo(wide / 4, 5);
  });
});
