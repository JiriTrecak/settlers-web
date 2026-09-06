/**
 * True iso ortho. Look-at sits on the XZ plane; pan moves that point.
 * Wheel changes frustum size. Not the old 16×9 S3 projector.
 */
import { OrthographicCamera, Vector3 } from "three";

const YAW = Math.PI / 4;
const PITCH = Math.atan(1 / Math.sqrt(2));
const DIST = 80;

export class Camera {
  targetX = 0;
  targetZ = 0;
  zoom = 28;
  minZoom = 6;
  maxZoom = 90;

  lookAt(x: number, z: number): void {
    this.targetX = x;
    this.targetZ = z;
  }

  /** Screen-pixel drag → XZ. `screenH` converts pixels to world units. */
  panScreen(dx: number, dy: number, screenH: number): void {
    const scale = (2 * this.zoom) / Math.max(1, screenH);
    const rx = Math.cos(YAW);
    const rz = -Math.sin(YAW);
    const fx = Math.sin(YAW);
    const fz = Math.cos(YAW);
    this.targetX -= dx * scale * rx - dy * scale * fx;
    this.targetZ -= dx * scale * rz - dy * scale * fz;
  }

  /** WASD / arrows in camera-forward / camera-right on XZ. */
  panWorld(right: number, forward: number): void {
    const rx = Math.cos(YAW);
    const rz = -Math.sin(YAW);
    const fx = Math.sin(YAW);
    const fz = Math.cos(YAW);
    this.targetX += right * rx + forward * fx;
    this.targetZ += right * rz + forward * fz;
  }

  zoomBy(factor: number): void {
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
  }

  applyTo(cam: OrthographicCamera, width: number, height: number): void {
    const cosP = Math.cos(PITCH);
    cam.position.set(
      this.targetX + Math.sin(YAW) * cosP * DIST,
      Math.sin(PITCH) * DIST,
      this.targetZ + Math.cos(YAW) * cosP * DIST,
    );
    cam.lookAt(new Vector3(this.targetX, 0, this.targetZ));
    const aspect = Math.max(1, width) / Math.max(1, height);
    const halfH = this.zoom;
    const halfW = this.zoom * aspect;
    cam.left = -halfW;
    cam.right = halfW;
    cam.top = halfH;
    cam.bottom = -halfH;
    cam.near = 0.1;
    cam.far = 400;
    cam.updateProjectionMatrix();
  }
}
