/**
 * Ortho look-at on the XZ plane. Play stays locked to true-iso.
 * The editor unlocks yaw/pitch so you can orbit like a DCC viewport.
 * `rev` is the view epoch — any widget that mirrors the camera keys off it.
 */
import { OrthographicCamera, Vector3 } from "three";

/** True-iso yaw / pitch. Preview snapshots use the same pair. */
export const ISO_YAW = Math.PI / 4;
export const ISO_PITCH = Math.atan(1 / Math.sqrt(2));
/** Extra view-axis distance so the near-side ground stays in front of the camera. */
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
  minZoom = 6;
  maxZoom = 90;
  /** Play leaves this on — orbit is a no-op. Editor clears it. */
  locked = true;
  /** Bumps on every view mutation. Widgets (minimap) key off this, not field lists. */
  rev = 0;

  lookAt(x: number, z: number): void {
    this.targetX = x;
    this.targetZ = z;
    this.touch();
  }

  resetView(): void {
    this.yaw = ISO_YAW;
    this.pitch = ISO_PITCH;
    this.touch();
  }

  /** Screen-pixel drag → XZ. `screenH` converts pixels to world units. */
  panScreen(dx: number, dy: number, screenH: number): void {
    const scale = (2 * this.zoom) / Math.max(1, screenH);
    const { rx, rz, fx, fz } = basis(this.yaw);
    this.targetX -= dx * scale * rx + dy * scale * fx;
    this.targetZ -= dx * scale * rz + dy * scale * fz;
    this.touch();
  }

  /** WASD / arrows in camera-forward / camera-right on XZ. */
  panWorld(right: number, forward: number): void {
    const { rx, rz, fx, fz } = basis(this.yaw);
    this.targetX += right * rx + forward * fx;
    this.targetZ += right * rz + forward * fz;
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
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
    this.touch();
  }

  private touch(): void {
    this.rev++;
  }

  /** XZ hit of an ortho NDC corner — minimap view quad. */
  groundAt(ndcX: number, ndcY: number, aspect: number): [number, number] {
    const halfH = this.zoom;
    const halfW = this.zoom * Math.max(0.2, aspect);
    const hx = ndcX * halfW;
    const hy = ndcY * halfH;
    const { sinY, cosY } = basis(this.yaw);
    const sinP = Math.sin(this.pitch);
    const cosP = Math.cos(this.pitch);
    const t = hy / Math.max(0.05, Math.tan(this.pitch));
    return [
      this.targetX + cosY * hx - sinY * sinP * hy - sinY * cosP * t,
      this.targetZ - sinY * hx - cosY * sinP * hy - cosY * cosP * t,
    ];
  }

  applyTo(cam: OrthographicCamera, width: number, height: number): void {
    const cosP = Math.cos(this.pitch);
    // Screen-bottom ground sits `zoom / tan(pitch)` toward the camera. Stay behind that.
    const reach = this.zoom / Math.max(0.05, Math.tan(this.pitch));
    const dist = reach + SLACK;
    const { sinY, cosY } = basis(this.yaw);
    cam.position.set(
      this.targetX + sinY * cosP * dist,
      Math.sin(this.pitch) * dist,
      this.targetZ + cosY * cosP * dist,
    );
    cam.lookAt(new Vector3(this.targetX, 0, this.targetZ));
    const aspect = Math.max(1, width) / Math.max(1, height);
    const halfH = this.zoom;
    const halfW = this.zoom * aspect;
    cam.left = -halfW;
    cam.right = halfW;
    cam.top = halfH;
    cam.bottom = -halfH;
    cam.near = 1;
    cam.far = dist + reach + SLACK;
    cam.updateProjectionMatrix();
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
