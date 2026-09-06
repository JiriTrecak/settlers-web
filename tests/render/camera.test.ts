import { describe, expect, it } from "vitest";
import { OrthographicCamera } from "three";
import { Camera } from "../../src/render/camera/camera";

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
});
