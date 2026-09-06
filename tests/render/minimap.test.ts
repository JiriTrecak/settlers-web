import { describe, expect, it } from "vitest";
import { Camera } from "../../src/render/camera/camera";
import { ndcToWorld, worldToNdc } from "../../src/render/minimap/minimap";

describe("minimap", () => {
  it("roundtrips corners", () => {
    const size = 256;
    for (const [x, z] of [
      [0, 0],
      [size, 0],
      [0, size],
      [size, size],
      [size / 2, size / 2],
    ] as const) {
      const [nx, ny] = worldToNdc(x, z, size);
      const [bx, bz] = ndcToWorld(nx, ny, size);
      expect(bx).toBeCloseTo(x);
      expect(bz).toBeCloseTo(z);
    }
  });

  it("puts the far corner (0,0) at the top — same as the iso view", () => {
    const [, ny] = worldToNdc(0, 0, 256);
    expect(ny).toBeGreaterThan(0);
    const [, fy] = worldToNdc(256, 256, 256);
    expect(fy).toBeLessThan(0);
  });

  it("view footprint is a trapezoid — far edge wider than near", () => {
    const cam = new Camera();
    cam.lookAt(128, 128);
    const [bl, br, tr, tl] = cam.viewGround(1280, 720).map(([x, z]) => worldToNdc(x, z, 256));
    const near = Math.hypot(br![0] - bl![0], br![1] - bl![1]);
    const far = Math.hypot(tr![0] - tl![0], tr![1] - tl![1]);
    expect(far).toBeGreaterThan(near);
  });

  it("gamecam trap is a real 70° frustum — far still wider than near", () => {
    const cam = new Camera();
    cam.lookAt(128, 128);
    cam.setGame(true);
    const [bl, br, tr, tl] = cam.viewGround(1280, 720).map(([x, z]) => worldToNdc(x, z, 256));
    const near = Math.hypot(br![0] - bl![0], br![1] - bl![1]);
    const far = Math.hypot(tr![0] - tl![0], tr![1] - tl![1]);
    expect(far).toBeGreaterThan(near);
  });
});
