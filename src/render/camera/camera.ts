/**
 * Look-at on the XZ plane.
 * Editor free-cam is ortho and can orbit. Gamecam / play is WC3-style perspective:
 * 70° FoV, ~56° pitch, 45° yaw, fixed distance, pan only, view half a block past the red.
 * `rev` is the view epoch — any widget that mirrors the camera keys off it.
 */
import { OrthographicCamera, PerspectiveCamera, Vector3 } from "three";
import { MAP_BLOCK, MAP_SIZE } from "../../shared";

/** True-iso yaw / pitch. Preview snapshots and the editor free-cam use this pair. */
export const ISO_YAW = Math.PI / 4;
export const ISO_PITCH = Math.atan(1 / Math.sqrt(2));
/** WC3 default AoA 304° — 56° down from the horizon. */
export const GAME_PITCH = (56 * Math.PI) / 180;
/** WC3 default lens. */
export const GAME_FOV = 70;
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
  zoom = 28;
  /** Eye ↔ target when `game`. Ortho ignores this. */
  distance = 80;
  minZoom = 6;
  maxZoom = 90;
  /** Play leaves this on — orbit is a no-op. Editor clears it. */
  locked = true;
  /** Play / Gamecam: perspective, zoom locked, view clamped half a block past the red. */
  game = false;
  /** Bumps on every view mutation. Widgets (minimap) key off this, not field lists. */
  rev = 0;
  private bound = 0;
  private lastAspect = 16 / 9;
  private readonly probe = new OrthographicCamera();
  private readonly persp = new PerspectiveCamera();
  private readonly rayA = new Vector3();
  private readonly rayB = new Vector3();

  /** Play pose: WC3 perspective, ~two 16-blocks in view, pan to half a block past the red. */
  setGame(on: boolean, size = MAP_SIZE): void {
    this.game = on;
    this.locked = on;
    this.bound = on ? size : 0;
    if (on) {
      this.yaw = ISO_YAW;
      this.pitch = GAME_PITCH;
      this.distance = this.distForSpan(MAP_BLOCK * 2);
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

  /** One-shot look / zoom / orbit. `setGame` first if you also flip perspective. */
  pose(next: { x?: number; z?: number; zoom?: number; yaw?: number; pitch?: number }): void {
    if (next.x !== undefined) this.targetX = next.x;
    if (next.z !== undefined) this.targetZ = next.z;
    if (next.zoom !== undefined) this.zoom = clamp(next.zoom, this.minZoom, this.maxZoom);
    if (next.yaw !== undefined) this.yaw = next.yaw;
    if (next.pitch !== undefined) this.pitch = clamp(next.pitch, PITCH_MIN, PITCH_MAX);
    this.clamp();
    this.touch();
  }

  resetView(): void {
    this.yaw = ISO_YAW;
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

  /** WASD / arrows in camera-forward / camera-right on XZ. */
  panWorld(right: number, forward: number): void {
    const { rx, rz, fx, fz } = basis(this.yaw);
    this.targetX += right * rx + forward * fx;
    this.targetZ += right * rz + forward * fz;
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
    if (this.game) return;
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

  /** Perspective distance that frames `span` cells on the ground (screen-vertical). */
  private distForSpan(span: number): number {
    const prev = this.distance;
    this.distance = 1;
    const a = this.groundAt(0, -1, 1);
    const b = this.groundAt(0, 1, 1);
    this.distance = prev;
    return span / Math.max(1e-6, Math.hypot(b[0] - a[0], b[1] - a[1]));
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

  /** Frustum ∩ ground. Gamecam uses the real 70° lens; free-cam matches the ortho pose. */
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
    const t = Math.abs(dy) < 1e-8 ? 0 : -a.y / dy;
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
      cam.fov = this.game ? GAME_FOV : (2 * Math.atan(this.zoom / dist) * 180) / Math.PI;
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
    cam.lookAt(this.targetX, 0, this.targetZ);
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
