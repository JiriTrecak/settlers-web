import { describe, expect, it } from "vitest";
import { OrthographicCamera, PerspectiveCamera, Vector3 } from "three";
import { MAP_BLOCK, MAP_SIZE } from "../../src/shared";
import { Camera, GAME_FOV, GAME_PITCH, ISO_PITCH, ISO_YAW } from "../../src/render/camera/camera";

describe("iso camera", () => {
  it("lookAt then applyTo does not throw and sets a projection", () => {
    const cam = new Camera();
    cam.lookAt(128, 128);
    cam.panScreen(10, -4, 720);
    cam.zoomBy(1.2);
    const three = new OrthographicCamera();
    cam.applyTo(three, 1280, 720);
    expect(three.right).toBeGreaterThan(three.left);
    expect(three.top).toBeGreaterThan(three.bottom);
    expect(Number.isFinite(three.position.x)).toBe(true);
  });

  it("keeps the near-side ground in front of the near plane at max zoom", () => {
    const cam = new Camera();
    cam.lookAt(128, 128);
    cam.zoom = cam.maxZoom;
    const three = new OrthographicCamera();
    cam.applyTo(three, 1280, 720);
    three.updateMatrixWorld();
    const [x, z] = cam.groundAt(0, -1, 1280 / 720);
    const ground = new Vector3(x, 0, z);
    ground.applyMatrix4(three.matrixWorldInverse);
    expect(-ground.z).toBeGreaterThan(three.near);
    expect(-ground.z).toBeLessThan(three.far);
  });

  it("orbit is a no-op while locked", () => {
    const cam = new Camera();
    const yaw = cam.yaw;
    cam.orbitScreen(80, 40);
    expect(cam.yaw).toBe(yaw);
    expect(cam.pitch).toBe(ISO_PITCH);
  });

  it("orbit changes yaw when unlocked and resetView restores iso", () => {
    const cam = new Camera();
    cam.locked = false;
    const yaw = cam.yaw;
    const rev = cam.rev;
    cam.orbitScreen(80, 0);
    expect(cam.yaw).toBeLessThan(yaw);
    expect(cam.rev).toBeGreaterThan(rev);
    cam.resetView();
    expect(cam.yaw).toBe(ISO_YAW);
    expect(cam.pitch).toBe(ISO_PITCH);
  });

  it("locked orbit does not bump rev", () => {
    const cam = new Camera();
    const rev = cam.rev;
    cam.orbitScreen(80, 40);
    expect(cam.rev).toBe(rev);
  });

  it("groundAt matches a Three unproject onto Y=0", () => {
    const cam = new Camera();
    cam.locked = false;
    cam.lookAt(128, 128);
    cam.orbitScreen(30, -20);
    const three = new OrthographicCamera();
    cam.applyTo(three, 1280, 720);
    three.updateMatrixWorld();
    const [cx, cz] = cam.groundAt(0, 0, 1280 / 720);
    expect(cx).toBeCloseTo(128, 4);
    expect(cz).toBeCloseTo(128, 4);
    const a = new Vector3(0, -1, -1).unproject(three);
    const b = new Vector3(0, -1, 1).unproject(three);
    const dir = b.sub(a);
    const t = -a.y / dir.y;
    const hit = a.add(dir.multiplyScalar(t));
    const [x, z] = cam.groundAt(0, -1, 1280 / 720);
    expect(x).toBeCloseTo(hit.x, 4);
    expect(z).toBeCloseTo(hit.z, 4);
  });

  it("setGame locks WC3 perspective, frames two blocks, and ignores zoom/orbit", () => {
    const cam = new Camera();
    cam.locked = false;
    cam.lookAt(128, 128);
    cam.orbitScreen(80, 0);
    cam.setGame(true);
    expect(cam.game).toBe(true);
    expect(cam.locked).toBe(true);
    expect(cam.yaw).toBe(ISO_YAW);
    expect(cam.pitch).toBe(GAME_PITCH);
    const three = new PerspectiveCamera();
    cam.applyTo(three, 1024, 1024);
    expect(three.fov).toBe(GAME_FOV);
    const a = cam.groundAt(0, -1, 1);
    const b = cam.groundAt(0, 1, 1);
    expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(MAP_BLOCK * 2, 1);
    const dist = cam.distance;
    const yaw = cam.yaw;
    cam.zoomBy(1.5);
    cam.orbitScreen(80, 40);
    expect(cam.distance).toBe(dist);
    expect(cam.yaw).toBe(yaw);
  });

  it("setGame clamps the perspective footprint to half a block past the red", () => {
    const pad = MAP_BLOCK / 2;
    const cam = new Camera();
    cam.lookAt(-80, -80);
    cam.setGame(true);
    cam.applyTo(new PerspectiveCamera(), 1280, 720);
    let minX = Infinity;
    let minZ = Infinity;
    for (const ndc of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      const [x, z] = cam.groundAt(ndc[0], ndc[1], 1280 / 720);
      minX = Math.min(minX, x);
      minZ = Math.min(minZ, z);
      expect(x).toBeGreaterThanOrEqual(-pad - 0.05);
      expect(z).toBeGreaterThanOrEqual(-pad - 0.05);
      expect(x).toBeLessThanOrEqual(MAP_SIZE + pad + 0.05);
      expect(z).toBeLessThanOrEqual(MAP_SIZE + pad + 0.05);
    }
    expect(minX).toBeLessThan(-1);
    expect(minZ).toBeLessThan(-1);
  });

  it("pose sets look, zoom, and orbit in one shot", () => {
    const cam = new Camera();
    cam.locked = false;
    cam.pose({ x: 40, z: 80, zoom: 12, yaw: 1.2, pitch: 0.5 });
    expect(cam.targetX).toBe(40);
    expect(cam.targetZ).toBe(80);
    expect(cam.zoom).toBe(12);
    expect(cam.yaw).toBe(1.2);
    expect(cam.pitch).toBe(0.5);
  });

  it("setGame(false) unlocks and stops clamping", () => {
    const cam = new Camera();
    cam.setGame(true);
    cam.setGame(false);
    expect(cam.game).toBe(false);
    expect(cam.locked).toBe(false);
    cam.lookAt(-10, -10);
    expect(cam.targetX).toBe(-10);
    expect(cam.targetZ).toBe(-10);
  });
});
