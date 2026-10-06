import {viewRotation,type ClosePose} from './unitCamera';
/**
 * Look-at on the XZ plane.
 * Editor free-cam is ortho and can orbit. Gamecam / play is WC3-style perspective:
 * North-up, 56° downward pitch, terrain-following distance zoom and footprint bounds.
 * `rev` is the view epoch — any widget that mirrors the camera keys off it.
 */
import { OrthographicCamera, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { MAP_SIZE } from "../../shared";
import { BUILDING_CELL_SIZE } from "../../shared/spatial/footprint";

/** True-iso yaw / pitch. Preview snapshots and the editor free-cam use this pair. */
export const ISO_YAW = Math.PI / 4;
export const ISO_PITCH = Math.atan(1 / Math.sqrt(2));
/** Warcraft's north-facing view, translated to our +Z-south, Y-up world. */
export const GAME_YAW = 0;
/** Classic angle of attack 304°: 56° below the horizontal. */
export const GAME_PITCH = (56 * Math.PI) / 180;
export const GAME_ASPECT = 16 / 9;
/** Warcraft's authored 70° is not a Three.js vertical FOV. Its classic world
 * viewport uses 70 / sqrt(1 + aspect²); retain that reference lens at 16:9.
 * Source and viewport differences are documented in camera.md. */
export const GAME_FOV = 70 / Math.hypot(1, GAME_ASPECT);
/** Horizontal ground coverage through the focus at the standard RTS aspect.
 * A 24-C base shelf fits with room for its harvest lanes and nearby approaches.
 * Define framing in the same cells as gameplay, rather than resizing units to
 * compensate for an unrelated camera distance. */
export const GAME_VIEW_WIDTH_C = 32;
/** Play eye ↔ target distance; `gameZoom` is relative to this calibrated default. */
export const GAME_DISTANCE = GAME_VIEW_WIDTH_C * BUILDING_CELL_SIZE / (2 * Math.tan(GAME_FOV * Math.PI / 360) * GAME_ASPECT);
export const GAME_DISTANCE_MIN = 52;
export const GAME_DISTANCE_MAX = GAME_DISTANCE * 1.5;
/** Extra view-axis distance so the near-side ground stays in front of the ortho near plane. */
const SLACK = 32;
const PITCH_MIN = 0.12;
const PITCH_MAX = Math.PI / 2 - 0.04;
const ORBIT = 0.007;

export class Camera {
  private mapSize=MAP_SIZE;
  private topDown=false;
  get isTopDown(){return this.topDown;}
  /** Exact orthographic overhead editing; focus and zoom survive mode changes. */
  setTopDown():void{this.setGame(false);this.topDown=true;this.locked=true;this.yaw=0;this.pitch=Math.PI/2;this.touch();}
  private closePose:ClosePose|null=null;
  private savedFocus:{x:number;z:number}|null=null;
  private closeElapsed=0;
  private readonly lastEye=new Vector3();
  private readonly lastRotation=new Quaternion();
  private lastFov=GAME_FOV;
  private fromEye=new Vector3();
  private fromRotation=new Quaternion();
  private fromFov=GAME_FOV;
  get closeTransitionComplete():boolean{return !this.closePose||this.closeElapsed>=this.closePose.transitionMs;}
  get followingUnit():boolean{return this.closePose!==null;}
  setClosePose(pose:ClosePose|null,dtMs=0):void {
    if(!pose){if(!this.closePose)return;this.closePose=null;if(this.savedFocus){this.targetX=this.savedFocus.x;this.targetZ=this.savedFocus.z;}this.savedFocus=null;this.touch();return;}
    if(!this.closePose)this.savedFocus={x:this.targetX,z:this.targetZ};
    if(this.closePose?.key!==pose.key){this.closeElapsed=0;this.fromEye.copy(this.lastEye);this.fromRotation.copy(this.lastRotation);this.fromFov=this.lastFov;}
    this.closeElapsed+=Math.max(0,dtMs);this.closePose=pose;
    this.targetX=pose.focus.x;this.targetZ=pose.focus.z;this.touch();
  }
  private cinematicBlend = 0;
  cinematic(on:boolean,dtMs:number):void {
    const next=this.cinematicBlend+((on?1:0)-this.cinematicBlend)*(1-Math.exp(-Math.max(0,dtMs)/220));
    if(Math.abs(next-this.cinematicBlend)>.0001){this.cinematicBlend=next;this.touch();}
  }
  targetX = 0;
  targetZ = 0;
  /** Free/top-down asset previews can orbit an elevated model's actual center. */
  private focusHeight=0;
  yaw = ISO_YAW;
  pitch = ISO_PITCH;
  zoom = 40;
  /** Eye ↔ target when `game`. Ortho ignores this. */
  distance = GAME_DISTANCE;
  minZoom = 6;
  maxZoom = 60;
  /** Play leaves this on — orbit is a no-op. Editor clears it. */
  locked = true;
  /** Play / Gamecam: perspective, distance zoom, complete ground footprint inside the map. */
  game = false;
  /** Bumps on every view mutation. Widgets (minimap) key off this, not field lists. */
  rev = 0;
  /** Minimum clearance above terrain directly beneath the perspective eye. */
  readonly minTerrainClearance = 4;
  readonly minHeightAboveWater = 12;
  private waterLevel = 0;
  private terrain: ((x: number, z: number) => number) | null = null;
  private bound = 0;

  setTerrain(sample: ((x: number, z: number) => number) | null, waterLevel = 0): void {
    this.terrain = sample;
    this.waterLevel = Number.isFinite(waterLevel) ? waterLevel : 0;
    this.touch();
  }

  private lastAspect = 16 / 9;
  private readonly probe = new OrthographicCamera();
  private readonly persp = new PerspectiveCamera();
  private readonly rayA = new Vector3();
  private readonly rayB = new Vector3();

  /** Play pose: fixed north-up perspective with the full ground view bounded by the map. */
  setGame(on: boolean, size = this.mapSize): void {
    this.mapSize=size;
    this.topDown=false;
    this.focusHeight=0;
    this.setClosePose(null);
    this.game = on;
    this.maxZoom = on ? 60 : Math.max(60,size*.75);
    this.locked = on;
    this.bound = on ? size : 0;
    if (on) {
      this.yaw = GAME_YAW;
      this.pitch = GAME_PITCH;
      this.distance = GAME_DISTANCE;
      this.clamp();
    }
    this.touch();
  }

  lookAt(x: number, z: number): void {
    this.targetX = x;
    this.targetZ = z;
    this.clamp();
    this.touch();
  }

  get gameZoom(): number { return this.distance / GAME_DISTANCE; }

  /** One-shot look / zoom / orbit. `setGame` first if you also flip perspective. */
  pose(next: { x?: number; z?: number; height?:number; zoom?: number; gameZoom?: number; yaw?: number; pitch?: number }): void {
    if (next.x !== undefined) this.targetX = next.x;
    if (next.z !== undefined) this.targetZ = next.z;
    if(next.height!==undefined&&Number.isFinite(next.height))this.focusHeight=next.height;
    if (next.zoom !== undefined) this.zoom = clamp(next.zoom, this.minZoom, this.maxZoom);
    if (next.gameZoom !== undefined && Number.isFinite(next.gameZoom)) this.distance = clamp(GAME_DISTANCE * next.gameZoom, GAME_DISTANCE_MIN, GAME_DISTANCE_MAX);
    if (next.yaw !== undefined) this.yaw = next.yaw;
    if (next.pitch !== undefined) this.pitch = this.topDown?Math.PI/2:clamp(next.pitch, PITCH_MIN, PITCH_MAX);
    this.clamp();
    this.touch();
  }

  resetView(): void {
    this.yaw = this.game ? GAME_YAW : ISO_YAW;
    this.pitch = this.game ? GAME_PITCH : ISO_PITCH;
    this.touch();
  }

  /** Screen-pixel drag → XZ. `screenH` converts pixels to world units. */
  panScreen(dx: number, dy: number, screenH: number): void {
    if(this.followingUnit)return;
    if (this.game) this.panPersp(dx, dy, screenH);
    else this.panOrtho(dx, dy, screenH);
    this.clamp();
    this.touch();
  }

  /** Positive right/forward moves the camera toward screen-right/screen-top on XZ. */
  panWorld(right: number, forward: number): void {
    if(this.followingUnit)return;
    const { rx, rz, fx, fz } = basis(this.yaw);
    // basis.f points from the target toward the eye, opposite to forward travel.
    this.targetX += right * rx - forward * fx;
    this.targetZ += right * rz - forward * fz;
    this.clamp();
    this.touch();
  }

  /** Orbit around the look-at. No-op while `locked`. */
  orbitScreen(dx: number, dy: number): void {
    if (this.locked) return;
    this.yaw -= dx * ORBIT;
    this.pitch = clamp(this.pitch + dy * ORBIT, PITCH_MIN, PITCH_MAX);
    this.touch();
  }

  zoomBy(factor: number): void {
    if(this.followingUnit)return;
    if (!Number.isFinite(factor) || factor <= 0) return;
    if (this.game) {
      this.distance = clamp(this.distance * factor, GAME_DISTANCE_MIN, GAME_DISTANCE_MAX);
      this.clamp();
      this.touch();
      return;
    }
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
    this.touch();
  }

  private touch(): void {
    this.rev++;
  }

  private panOrtho(dx: number, dy: number, screenH: number): void {
    const scale = (2 * this.zoom) / Math.max(1, screenH);
    const { rx, rz, fx, fz } = basis(this.yaw);
    this.targetX -= dx * scale * rx + dy * scale * fx;
    this.targetZ -= dx * scale * rz + dy * scale * fz;
  }

  /** Grab-pan from the center ray so near/far scale doesn't fight the drag. */
  private panPersp(dx: number, dy: number, screenH: number): void {
    const aspect = this.lastAspect;
    const screenW = Math.max(1, screenH * aspect);
    const c = this.groundAt(0, 0, aspect);
    const r = this.groundAt(2 / screenW, 0, aspect);
    const d = this.groundAt(0, -2 / screenH, aspect);
    this.targetX -= dx * (r[0] - c[0]) + dy * (d[0] - c[0]);
    this.targetZ -= dx * (r[1] - c[1]) + dy * (d[1] - c[1]);
  }

  /** Bound the entire view, not just its focus. A small map or a wide window
   * can require a closer distance even when the requested zoom is otherwise legal. */
  private clamp(): void {
    if (this.followingUnit || this.bound <= 0) return;
    const lo = 0;
    const hi = this.bound - 1;
    let corners = this.boundCorners();
    const extent = () => {
      const xs = corners.map(p => p[0]), zs = corners.map(p => p[1]);
      return {minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs)};
    };
    let bounds = extent();
    // Flat-ground coverage scales linearly with distance. Terrain clearance can
    // add a little height, so repeat after applying the fit and translation.
    for (let attempt = 0; attempt < 4; attempt++) {
      const fit = Math.min(1, (hi-lo)/(bounds.maxX-bounds.minX), (hi-lo)/(bounds.maxZ-bounds.minZ));
      if (fit < 1) {
        this.distance = Math.max(1, this.distance * fit * .999);
        corners = this.boundCorners();
        bounds = extent();
      }
      const dx = shift(bounds.minX, bounds.maxX, lo, hi);
      const dz = shift(bounds.minZ, bounds.maxZ, lo, hi);
      this.targetX += dx;
      this.targetZ += dz;
      if (Math.abs(dx)+Math.abs(dz) < 1e-6 && fit >= 1) break;
      corners = this.boundCorners();
      bounds = extent();
    }
  }

  private boundCorners(): [number, number][] {
    this.applyTo(this.persp, 1024*this.lastAspect, 1024);
    this.persp.updateMatrixWorld();
    // A hill beneath the focus must not let the far rays see past lower map
    // edges. Bound against the lowest visible ground/water plane as well.
    const plane = Math.min(0, this.waterLevel);
    return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>this.hitGround(this.persp,x,y,plane));
  }

  /** XZ hit of an NDC corner through the active projection. */
  groundAt(ndcX: number, ndcY: number, aspect: number): [number, number] {
    const h = 1024;
    const w = h * Math.max(0.2, aspect);
    if (this.game) {
      this.applyTo(this.persp, w, h);
      this.persp.updateMatrixWorld();
      return this.hitGround(this.persp, ndcX, ndcY);
    }
    this.applyTo(this.probe, w, h);
    this.probe.updateMatrixWorld();
    return this.hitGround(this.probe, ndcX, ndcY);
  }

  /** Frustum ∩ ground. Gamecam uses the active perspective lens; free-cam matches the ortho pose. */
  viewGround(width: number, height: number): [number, number][] {
    this.lastAspect = Math.max(1,width)/Math.max(1,height);
    this.clamp();
    const camera = this.game || this.closePose ? this.persp : this.probe;
    this.applyTo(camera, width, height);
    camera.updateMatrixWorld();
    return [
      this.hitGround(camera, -1, -1),
      this.hitGround(camera, 1, -1),
      this.hitGround(camera, 1, 1),
      this.hitGround(camera, -1, 1),
    ];
  }

  private hitGround(cam: OrthographicCamera | PerspectiveCamera, ndcX: number, ndcY: number, groundPlane?: number): [number, number] {
    const a = this.rayA.set(ndcX, ndcY, -1).unproject(cam);
    const b = this.rayB.set(ndcX, ndcY, 1).unproject(cam);
    const dy = b.y - a.y;
    if(this.closePose){
      const direction=b.clone().sub(a).normalize();
      const t=direction.y<-.0001?Math.max(0,(this.closePose.focus.y-a.y)/direction.y):100;
      return [a.x+direction.x*Math.min(100,t),a.z+direction.z*Math.min(100,t)];
    }
    const planeY = groundPlane ?? (this.game ? cam.position.y - Math.sin(this.pitch) * this.distance : this.focusHeight);
    const t = Math.abs(dy) < 1e-8 ? 0 : (planeY - a.y) / dy;
    return [a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t];
  }

  applyTo(cam: OrthographicCamera | PerspectiveCamera, width: number, height: number): void {
    const aspect = Math.max(1, width) / Math.max(1, height);
    if(this.closePose && cam instanceof PerspectiveCamera){
      const p=this.closePose,t=p.transitionMs===0?1:Math.min(1,this.closeElapsed/p.transitionMs),blend=t*t*(3-2*t);
      cam.position.lerpVectors(this.fromEye,p.eye,blend);
      cam.quaternion.copy(this.fromRotation).slerp(viewRotation(p.eye,p.target),blend);
      cam.fov=this.fromFov+(p.fov-this.fromFov)*blend;cam.aspect=aspect;cam.near=.08;cam.far=180;cam.updateProjectionMatrix();
      if(!this.internal(cam)){this.lastEye.copy(cam.position);this.lastRotation.copy(cam.quaternion);this.lastFov=cam.fov;}
      return;
    }
    if (!this.internal(cam)) {
      this.lastAspect = aspect;
      this.clamp();
    }
    const { dist, reach } = this.place(cam);
    if (cam instanceof PerspectiveCamera) {
      // Preserve the reference horizontal field in narrow editor panes.
      const gameFov = Math.min(75, this.pitch * 360 / Math.PI - 10, 2 * Math.atan(Math.tan(GAME_FOV * Math.PI / 360) * Math.max(1, GAME_ASPECT / aspect)) * 180 / Math.PI);
      cam.fov = this.game ? gameFov * (1 - .08 * this.cinematicBlend) : (2 * Math.atan(this.zoom / dist) * 180) / Math.PI;
      cam.aspect = aspect;
      cam.near = 1;
      cam.far = dist + reach + SLACK;
      cam.updateProjectionMatrix();
      if(!this.internal(cam)){this.lastEye.copy(cam.position);this.lastRotation.copy(cam.quaternion);this.lastFov=cam.fov;}
      return;
    }
    cam.left = -this.zoom * aspect;
    cam.right = this.zoom * aspect;
    cam.top = this.zoom;
    cam.bottom = -this.zoom;
    cam.near = 1;
    cam.far = dist + reach + SLACK;
    cam.updateProjectionMatrix();
  }

  private internal(cam: OrthographicCamera | PerspectiveCamera): boolean {
    return cam === this.probe || cam === this.persp;
  }

  private place(cam: OrthographicCamera | PerspectiveCamera): { dist: number; reach: number } {
    const reach = this.topDown ? this.zoom+128 : this.game ? this.distance : this.zoom / Math.max(0.05, Math.tan(this.pitch));
    const dist = this.game ? this.distance : reach + SLACK;
    const cosP = Math.cos(this.pitch);
    const { sinY, cosY } = basis(this.yaw);
    cam.position.set(
      this.targetX + sinY * cosP * dist,
      Math.sin(this.pitch) * dist,
      this.targetZ + cosY * cosP * dist,
    );
    let targetY = this.game?0:this.focusHeight;
    cam.position.y+=targetY;
    if (this.game && this.terrain) {
      const heightAt = (x: number, z: number) => {
        const h = this.terrain!(x, z);
        return Number.isFinite(h) ? Math.max(0, h) : 0;
      };
      targetY = heightAt(this.targetX, this.targetZ);
      targetY = Math.max(targetY, heightAt(cam.position.x, cam.position.z) + this.minTerrainClearance - cam.position.y);
      cam.position.y += targetY;
    }
    if (this.game && this.terrain) {
      const lift = Math.max(0, this.waterLevel + this.minHeightAboveWater - cam.position.y);
      cam.position.y += lift;
      targetY += lift;
    }
    cam.up.set(this.topDown?-sinY:0,this.topDown?0:1,this.topDown?-cosY:0);
    cam.lookAt(this.targetX, targetY, this.targetZ);
    return { dist, reach };
  }
}

function basis(yaw: number): { sinY: number; cosY: number; rx: number; rz: number; fx: number; fz: number } {
  const sinY = Math.sin(yaw);
  const cosY = Math.cos(yaw);
  return { sinY, cosY, rx: cosY, rz: -sinY, fx: sinY, fz: cosY };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Translate a span so it sits inside [lo, hi]. Centers if the span is larger. */
function shift(min: number, max: number, lo: number, hi: number): number {
  if (max - min >= hi - lo) return (lo + hi) / 2 - (min + max) / 2;
  if (min < lo) return lo - min;
  if (max > hi) return hi - max;
  return 0;
}
