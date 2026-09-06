import { describe, expect, it } from "vitest";
import { OrthographicCamera, Vector3 } from "three";
import { Camera, ISO_PITCH, ISO_YAW } from "../../src/render/camera/camera";

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
});
