import { describe, expect, it } from "vitest";
import { Camera } from "../../src/render/camera";

describe("camera", () => {
  it("worldToScreen ∘ screenToWorld round-trips", () => {
    const cam = new Camera();
    cam.panX = 120;
    cam.panY = -40;
    cam.zoom = 2.5;
    const samples = [
      { x: 0, y: 0 },
      { x: 80, y: 40 },
      { x: -16, y: 9 },
    ];
    for (const p of samples) {
      const s = cam.worldToScreen(p.x, p.y);
      const w = cam.screenToWorld(s.x, s.y);
      expect(w.x).toBeCloseTo(p.x, 8);
      expect(w.y).toBeCloseTo(p.y, 8);
    }
  });

  it("zoomAt keeps the world point under the cursor", () => {
    const cam = new Camera();
    cam.panX = 50;
    cam.panY = 80;
    cam.zoom = 1;
    const sx = 200;
    const sy = 150;
    const before = cam.screenToWorld(sx, sy);
    cam.zoomAt(sx, sy, 1.5);
    const after = cam.screenToWorld(sx, sy);
    expect(after.x).toBeCloseTo(before.x, 8);
    expect(after.y).toBeCloseTo(before.y, 8);
  });
});
