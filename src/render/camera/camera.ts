/**
 * Look-at on the XZ plane.
 * Editor free-cam is ortho and can orbit. Gamecam / play is WC3-style perspective:
 * 32° FoV, 45° pitch, -45° yaw, terrain-following distance zoom, pan only, view half a block past the red.
 * `rev` is the view epoch — any widget that mirrors the camera keys off it.
 */
import { OrthographicCamera, PerspectiveCamera, Vector3 } from "three";
import { MAP_BLOCK, MAP_SIZE } from "../../shared";

/** True-iso yaw / pitch. Preview snapshots and the editor free-cam use this pair. */
export const ISO_YAW = Math.PI / 4;
export const ISO_PITCH = Math.atan(1 / Math.sqrt(2));
/** Lower RTS viewing angle reveals more of the landscape behind the foreground. */
export const GAME_YAW = -Math.PI / 4;
export const GAME_PITCH = (45 * Math.PI) / 180;
/** Mild RTS perspective keeps foreground trees readable without wide-angle stretching. */
export const GAME_FOV = 32;
export const GAME_ASPECT = 16 / 9;
/** Extra view-axis distance so the near-side ground stays in front of the ortho near plane. */
const SLACK = 32;
const PITCH_MIN = 0.12;
const PITCH_MAX = Math.PI / 2 - 0.04;
const ORBIT = 0.007;

export class Camera {
  targetX = 0;
  targetZ = 0;
  yaw = ISO_YAW;
  pitch = ISO_PITCH;
  zoom = 40;
  /** Eye ↔ target when `game`. Ortho ignores this. */
  distance = 40;
  minZoom = 6;
  maxZoom = 60;
  /** Play leaves this on — orbit is a no-op. Editor clears it. */
  locked = true;
  /** Play / Gamecam: perspective, distance zoom, view clamped half a block past the red. */
  game = false;
  /** Bumps on every view mutation. Widgets (minimap) key off this, not field lists. */
  rev = 0;
  /** Minimum clearance above terrain directly beneath the perspective eye. */
  readonly minTerrainClearance = 4;
  readonly minHeightAboveWater = 12;
  private waterLevel = 0;
  private terrain: ((x: number, z: number) => number) | null = null;
  private readonly gameDistance = 40;
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

  /** Play pose: fixed perspective, default distance 40, pan to half a block past the red. */
  setGame(on: boolean, size = MAP_SIZE): void {
    this.game = on;
    this.locked = on;
    this.bound = on ? size : 0;
    if (on) {
      this.yaw = GAME_YAW;
      this.pitch = GAME_PITCH;
      this.distance = this.gameDistance;
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

  get gameZoom(): number { return this.distance / this.gameDistance; }

  /** One-shot look / zoom / orbit. `setGame` first if you also flip perspective. */
  pose(next: { x?: number; z?: number; zoom?: number; gameZoom?: number; yaw?: number; pitch?: number }): void {
    if (next.x !== undefined) this.targetX = next.x;
    if (next.z !== undefined) this.targetZ = next.z;
    if (next.zoom !== undefined) this.zoom = clamp(next.zoom, this.minZoom, this.maxZoom);
    if (next.gameZoom !== undefined && Number.isFinite(next.gameZoom)) this.distance = this.gameDistance * clamp(next.gameZoom, .5, 1.5);
    if (next.yaw !== undefined) this.yaw = next.yaw;
    if (next.pitch !== undefined) this.pitch = clamp(next.pitch, PITCH_MIN, PITCH_MAX);
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
    if (this.game) this.panPersp(dx, dy, screenH);
    else this.panOrtho(dx, dy, screenH);
    this.clamp();
    this.touch();
  }

  /** Positive right/forward moves the camera toward screen-right/screen-top on XZ. */
  panWorld(right: number, forward: number): void {
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
    if (!Number.isFinite(factor) || factor <= 0) return;
    if (this.game) {
      this.distance = clamp(this.distance * factor, this.gameDistance * .5, this.gameDistance * 1.5);
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

  /** Keep the active footprint inside the red plus half a block (mid-halo). */
  private clamp(): void {
    if (this.bound <= 0) return;
    const pad = MAP_BLOCK / 2;
    const lo = -pad;
    const hi = this.bound + pad;
    const corners = [
      this.groundAt(-1, -1, this.lastAspect),
      this.groundAt(1, -1, this.lastAspect),
      this.groundAt(1, 1, this.lastAspect),
      this.groundAt(-1, 1, this.lastAspect),
    ];
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of corners) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    this.targetX += shift(minX, maxX, lo, hi);
    this.targetZ += shift(minZ, maxZ, lo, hi);
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
    this.applyTo(this.persp, width, height);
    this.persp.updateMatrixWorld();
    return [
      this.hitGround(this.persp, -1, -1),
      this.hitGround(this.persp, 1, -1),
      this.hitGround(this.persp, 1, 1),
      this.hitGround(this.persp, -1, 1),
    ];
  }

  private hitGround(cam: OrthographicCamera | PerspectiveCamera, ndcX: number, ndcY: number): [number, number] {
    const a = this.rayA.set(ndcX, ndcY, -1).unproject(cam);
    const b = this.rayB.set(ndcX, ndcY, 1).unproject(cam);
    const dy = b.y - a.y;
    const planeY = this.game ? cam.position.y - Math.sin(this.pitch) * this.distance : 0;
    const t = Math.abs(dy) < 1e-8 ? 0 : (planeY - a.y) / dy;
    return [a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t];
  }

  applyTo(cam: OrthographicCamera | PerspectiveCamera, width: number, height: number): void {
    const aspect = Math.max(1, width) / Math.max(1, height);
    if (!this.internal(cam)) {
      this.lastAspect = aspect;
      this.clamp();
    }
    const { dist, reach } = this.place(cam);
    if (cam instanceof PerspectiveCamera) {
      // Preserve the reference horizontal field in narrow editor panes.
      const gameFov = Math.min(75, this.pitch * 360 / Math.PI - 10, 2 * Math.atan(Math.tan(GAME_FOV * Math.PI / 360) * Math.max(1, GAME_ASPECT / aspect)) * 180 / Math.PI);
      cam.fov = this.game ? gameFov : (2 * Math.atan(this.zoom / dist) * 180) / Math.PI;
      cam.aspect = aspect;
      cam.near = 1;
      cam.far = dist + reach + SLACK;
      cam.updateProjectionMatrix();
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
    const reach = this.game ? this.distance : this.zoom / Math.max(0.05, Math.tan(this.pitch));
    const dist = this.game ? this.distance : reach + SLACK;
    const cosP = Math.cos(this.pitch);
    const { sinY, cosY } = basis(this.yaw);
    cam.position.set(
      this.targetX + sinY * cosP * dist,
      Math.sin(this.pitch) * dist,
      this.targetZ + cosY * cosP * dist,
    );
    let targetY = 0;
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
