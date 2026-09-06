/**
 * Canvas pan / zoom / WASD. Mutates `camera`; session presents it.
 */
import type { Camera } from "../../render/camera/camera";

const WASD_SPEED = 28;

export class MapInput {
  private readonly keys = new Set<string>();
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onKeyUp: (e: KeyboardEvent) => void;
  private readonly onPointerDown: (e: PointerEvent) => void;
  private readonly onPointerMove: (e: PointerEvent) => void;
  private readonly onPointerUp: (e: PointerEvent) => void;
  private readonly onWheel: (e: WheelEvent) => void;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera,
    private readonly onChanged: () => void,
  ) {
    this.onKeyDown = (e) => {
      this.keys.add(e.key.toLowerCase());
    };
    this.onKeyUp = (e) => {
      this.keys.delete(e.key.toLowerCase());
    };
    this.onPointerDown = (e) => {
      if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
    };
    this.onPointerMove = (e) => {
      if (!this.dragging) return;
      this.camera.panScreen(e.clientX - this.lastX, e.clientY - this.lastY, this.canvas.clientHeight);
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.onChanged();
    };
    this.onPointerUp = (e) => {
      this.dragging = false;
      if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    };
    this.onWheel = (e) => {
      e.preventDefault();
      this.camera.zoomBy(e.deltaY > 0 ? 1.1 : 1 / 1.1);
      this.onChanged();
    };
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  tick(dtMs: number): void {
    const step = (WASD_SPEED * dtMs) / 1000;
    let right = 0;
    let forward = 0;
    if (this.keys.has("a") || this.keys.has("arrowleft")) right -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) right += 1;
    if (this.keys.has("w") || this.keys.has("arrowup")) forward += 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) forward -= 1;
    if (!right && !forward) return;
    this.camera.panWorld(right * step, forward * step);
    this.onChanged();
  }

  destroy(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
  }
}
