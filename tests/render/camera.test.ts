import { describe, expect, it } from "vitest";
import { OrthographicCamera, PerspectiveCamera, Vector3 } from "three";
import { MAP_BLOCK, MAP_SIZE } from "../../src/shared";
import { Camera, GAME_ASPECT, GAME_FOV, GAME_PITCH, GAME_YAW, ISO_PITCH, ISO_YAW } from "../../src/render/camera/camera";

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

  it("setGame locks WC3 perspective, frames four blocks, and allows distance zoom while locking orbit", () => {
    const cam = new Camera();
    cam.locked = false;
    cam.lookAt(128, 128);
    cam.orbitScreen(80, 0);
    cam.setGame(true);
    expect(cam.game).toBe(true);
    expect(cam.locked).toBe(true);
    expect(cam.yaw).toBe(GAME_YAW);
    expect(cam.pitch).toBe(GAME_PITCH);
    const three = new PerspectiveCamera();
    cam.applyTo(three, 1280, 720);
    expect(three.fov).toBe(GAME_FOV);
    const a = cam.groundAt(0, -1, GAME_ASPECT);
    const b = cam.groundAt(0, 1, GAME_ASPECT);
    expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(MAP_BLOCK * 4, 1);
    const dist = cam.distance;
    const yaw = cam.yaw;
    cam.zoomBy(1.5);
    cam.orbitScreen(80, 40);
    expect(cam.distance).toBeCloseTo(dist * 1.5);
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

describe("terrain-following game camera", () => {
  it("zooms to twice the default span and clamps both zoom limits", () => {
    const camera = new Camera(); camera.lookAt(128,128); camera.setGame(true);
    const distance = camera.distance;
    camera.zoomBy(100);
    expect(camera.distance).toBeCloseTo(distance * 2);
    const a=camera.groundAt(0,-1,GAME_ASPECT),b=camera.groundAt(0,1,GAME_ASPECT);
    expect(Math.hypot(b[0]-a[0],b[1]-a[1])).toBeCloseTo(MAP_BLOCK * 8);
    camera.zoomBy(.0001);
    expect(camera.distance).toBeCloseTo(distance * .5);
  });
  it("rises and descends with terrain without changing pitch or centered framing", () => {
    const camera=new Camera(); camera.lookAt(128,128); camera.setGame(true);
    let height=0; camera.setTerrain(()=>height);
    const eye=new PerspectiveCamera(); camera.applyTo(eye,1280,720); const low=eye.position.y;
    height=12; camera.applyTo(eye,1280,720);
    expect(eye.position.y).toBeCloseTo(low+12);
    expect(camera.groundAt(0,0,1280/720)[0]).toBeCloseTo(128);
    expect(camera.groundAt(0,0,1280/720)[1]).toBeCloseTo(128);
    height=0; camera.applyTo(eye,1280,720); expect(eye.position.y).toBeCloseTo(low);
  });
  it("clears a hill beneath the eye even when the target is in a valley", () => {
    const camera=new Camera(); camera.lookAt(128,128); camera.setGame(true); camera.zoomBy(.5);
    camera.setTerrain((_x,z)=>z>129?24:0);
    const eye=new PerspectiveCamera(); camera.applyTo(eye,1280,720);
    expect(eye.position.y).toBeGreaterThanOrEqual(24+camera.minTerrainClearance);
  });
  it("does not move the editor orthographic camera with terrain", () => {
    const camera=new Camera(); const eye=new OrthographicCamera(); camera.applyTo(eye,1280,720); const low=eye.position.y;
    camera.setTerrain(()=>24); camera.applyTo(eye,1280,720); expect(eye.position.y).toBe(low);
  });
});

it("never descends toward the river bed below the water-relative camera floor", () => {
  const camera=new Camera(); camera.lookAt(128,128); camera.setGame(true); camera.zoomBy(.5);
  camera.setTerrain(()=>-16, 3);
  const eye=new PerspectiveCamera(); camera.applyTo(eye,1280,720);
  expect(eye.position.y).toBeGreaterThanOrEqual(3+camera.minHeightAboveWater);
});

 describe("perspective capture framing", () => {
  it("restores a saved game zoom after switching camera modes", () => {
    const cam = new Camera();
    cam.setGame(true);
    cam.zoomBy(1.7);
    const saved = cam.gameZoom, distance = cam.distance;
    cam.setGame(false);
    cam.setGame(true);
    cam.pose({ gameZoom: saved });
    expect(cam.distance).toBeCloseTo(distance);
    expect(cam.yaw).toBe(GAME_YAW);
    expect(cam.pitch).toBe(GAME_PITCH);
    cam.pose({ gameZoom: 5 });
    expect(cam.gameZoom).toBe(2);
    cam.pose({ gameZoom: .1 });
    expect(cam.gameZoom).toBe(.5);
  });
});

 it("keeps horizontal Play coverage when the editor pane is narrower than a screenshot", () => {
  const camera = new Camera(); camera.lookAt(128,128); camera.setGame(true);
  const width = (aspect:number) => { const a=camera.groundAt(-1,0,aspect), b=camera.groundAt(1,0,aspect); return Math.hypot(b[0]-a[0],b[1]-a[1]); };
  expect(width(.95)).toBeCloseTo(width(GAME_ASPECT),4);
  const view=new PerspectiveCamera(); camera.applyTo(view,950,1000);
  expect(view.fov/2).toBeLessThan(GAME_PITCH*180/Math.PI);
 });
