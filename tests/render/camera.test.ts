import { describe, expect, it } from "vitest";
import { OrthographicCamera, PerspectiveCamera, Vector3 } from "three";
import { Camera, GAME_ASPECT, GAME_DISTANCE, GAME_DISTANCE_MAX, GAME_DISTANCE_MIN, GAME_FOV, GAME_PITCH, GAME_YAW, ISO_PITCH, ISO_YAW } from "../../src/render/camera/camera";
import {BUILDING_CELL_SIZE} from '../../src/shared/spatial/footprint';

describe("iso camera", () => {
  it('frames 32 building cells at default game distance, with readable infantry and base context',()=>{
    const camera=new Camera();camera.setGame(true,512);camera.lookAt(256,256);
    const left=camera.groundAt(-1,0,GAME_ASPECT),right=camera.groundAt(1,0,GAME_ASPECT);
    expect(Math.hypot(right[0]-left[0],right[1]-left[1])/BUILDING_CELL_SIZE).toBeCloseTo(32,4);
    const view=new PerspectiveCamera();camera.applyTo(view,1920,1080);view.updateMatrixWorld();
    const feet=new Vector3(256,0,256).project(view),head=new Vector3(256,4.8,256).project(view);
    const heightPx=Math.abs(head.y-feet.y)*540;
    expect(heightPx).toBeGreaterThan(40);expect(heightPx).toBeLessThan(60);
  });
  it('retains authored map dimensions through game, free and top-down mode changes',()=>{
    const cam=new Camera();
    for(const size of [512,256,1024]){
      cam.setGame(true,size);cam.setTopDown();cam.pose({zoom:size*.6});
      expect(cam.maxZoom).toBe(size*.75);expect(cam.zoom).toBe(size*.6);
      cam.setGame(true);cam.setGame(false);cam.pose({zoom:size*.6});
      expect(cam.maxZoom).toBe(size*.75);expect(cam.zoom).toBe(size*.6);
    }
  });
  it("edge/arrow travel moves toward the corresponding projected ground edge", () => {
    for (const game of [false, true]) {
      for (const yaw of [0, Math.PI / 4, Math.PI / 2]) {
        for (const [right, forward] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const cam = new Camera();
          cam.setGame(game);
          cam.pose({x: 128, z: 128, yaw});
          const origin = cam.groundAt(0, 0, GAME_ASPECT);
          const edge = cam.groundAt(right * 0.5, forward * 0.5, GAME_ASPECT);
          const before = [cam.targetX, cam.targetZ];
          cam.panWorld(right, forward);
          const dx = cam.targetX - before[0], dz = cam.targetZ - before[1];
          expect(dx * (edge[0] - origin[0]) + dz * (edge[1] - origin[1])).toBeGreaterThan(0);
        }
      }
    }
  });
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

  it("setGame locks WC3 perspective, starts at the default distance, and allows distance zoom while locking orbit", () => {
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
    expect(cam.distance).toBe(GAME_DISTANCE);
    const dist = cam.distance;
    const yaw = cam.yaw;
    cam.zoomBy(1.5);
    cam.orbitScreen(80, 40);
    expect(cam.distance).toBeCloseTo(dist * 1.5);
    expect(cam.yaw).toBe(yaw);
  });

  it("keeps the minimap footprint north-up, trapezoidal, and equal to the rendered frustum", () => {
    const cam = new Camera(); cam.setGame(true,512); cam.lookAt(256,256);
    const rendered = new PerspectiveCamera(); cam.applyTo(rendered,1920,1080); rendered.updateMatrixWorld();
    const corners=cam.viewGround(1920,1080);
    const [nearLeft,nearRight,farRight,farLeft]=corners;
    expect(nearLeft[1]).toBeCloseTo(nearRight[1],8);
    expect(farLeft[1]).toBeCloseTo(farRight[1],8);
    expect(farLeft[1]).toBeLessThan(nearLeft[1]);
    expect(farRight[0]-farLeft[0]).toBeGreaterThan(nearRight[0]-nearLeft[0]);
    expect(rendered.position.x).toBeCloseTo(cam.targetX,8);
    const direction=rendered.getWorldDirection(new Vector3());
    expect(Math.atan2(-direction.y,Math.hypot(direction.x,direction.z))*180/Math.PI).toBeCloseTo(56,8);
    for (const [i,[x,z]] of corners.entries()) {
      const ndc=new Vector3(x,0,z).project(rendered);
      expect(ndc.x).toBeCloseTo([-1,1,1,-1][i],7);
      expect(ndc.y).toBeCloseTo([-1,-1,1,1][i],7);
    }
  });

  it("keeps every viewport corner over the map at all edges, zooms and aspect ratios", () => {
    for(const size of [64,256,512]) for(const [w,h] of [[1920,1080],[3440,1440],[900,1200]]) {
      const cam=new Camera(); cam.setGame(true,size);
      for(const zoom of [.4,1,1.5]) for(const [x,z] of [[-1000,-1000],[1000,-1000],[1000,1000],[-1000,1000]]) {
        cam.pose({x,z,gameZoom:zoom});
        cam.applyTo(new PerspectiveCamera(),w,h);
        for(const [px,pz] of cam.viewGround(w,h)) {
          expect(px).toBeGreaterThanOrEqual(-.001); expect(pz).toBeGreaterThanOrEqual(-.001);
          expect(px).toBeLessThanOrEqual(size-1+.001); expect(pz).toBeLessThanOrEqual(size-1+.001);
        }
      }
    }
  });

  it("bounds a raised view against lower terrain at the map boundary", () => {
    const cam=new Camera();cam.setGame(true,512);cam.setTerrain(()=>24);
    cam.lookAt(10000,-10000);
    const rendered=new PerspectiveCamera();cam.applyTo(rendered,1920,1080);rendered.updateMatrixWorld();
    for(const [x,y] of [[-1,-1],[1,-1],[1,1],[-1,1]]) {
      const a=new Vector3(x,y,-1).unproject(rendered),b=new Vector3(x,y,1).unproject(rendered);
      const t=-a.y/(b.y-a.y),hit=a.clone().lerp(b,t);
      expect(hit.x).toBeGreaterThanOrEqual(-.001);expect(hit.z).toBeGreaterThanOrEqual(-.001);
      expect(hit.x).toBeLessThanOrEqual(511.001);expect(hit.z).toBeLessThanOrEqual(511.001);
    }
  });

  it("uses the actual orthographic footprint for the editor minimap", () => {
    const cam=new Camera();cam.pose({x:100,z:100,zoom:24,yaw:.3});
    const view=new OrthographicCamera();cam.applyTo(view,1280,720);view.updateMatrixWorld();
    for(const [i,[x,z]] of cam.viewGround(1280,720).entries()) {
      const ndc=new Vector3(x,0,z).project(view);
      expect(ndc.x).toBeCloseTo([-1,1,1,-1][i],7);
      expect(ndc.y).toBeCloseTo([-1,-1,1,1][i],7);
    }
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
  it("clamps distance zoom to the play limits", () => {
    const camera = new Camera(); camera.lookAt(128,128); camera.setGame(true);
    const distance = camera.distance;
    camera.zoomBy(100);
    expect(camera.distance).toBe(GAME_DISTANCE_MAX);

    camera.zoomBy(.0001);
    expect(camera.distance).toBe(GAME_DISTANCE_MIN);expect(distance).toBe(GAME_DISTANCE);
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
    expect(cam.gameZoom).toBe(GAME_DISTANCE_MAX/GAME_DISTANCE);
    cam.pose({ gameZoom: .1 });
    expect(cam.gameZoom).toBe(GAME_DISTANCE_MIN/GAME_DISTANCE);
  });
});

 it("keeps horizontal Play coverage when the editor pane is narrower than a screenshot", () => {
  const camera = new Camera(); camera.lookAt(128,128); camera.setGame(true);
  const width = (aspect:number) => { const a=camera.groundAt(-1,0,aspect), b=camera.groundAt(1,0,aspect); return Math.hypot(b[0]-a[0],b[1]-a[1]); };
  expect(width(.95)).toBeCloseTo(width(GAME_ASPECT),4);
  const view=new PerspectiveCamera(); camera.applyTo(view,950,1000);
  expect(view.fov/2).toBeLessThan(GAME_PITCH*180/Math.PI);
 });
