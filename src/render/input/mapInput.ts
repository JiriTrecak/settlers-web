/**
 * Canvas pan / zoom / WASD. Editor also orbits (Alt-LMB, MMB, RMB).
 * Play leaves `orbit` off so the match stays true-iso.
 */
import type { Camera } from "../camera/camera";

const WASD_SPEED = 28;
const CLICK_PX = 5;

export type MapInputHooks = {
  onChanged(): void;
  onClick?(clientX: number, clientY: number): void;
};

type Drag = "pan" | "orbit";

export class MapInput {
  private readonly keys = new Set<string>();
  private drag: Drag | null = null;
  private moved = 0;
  private lastX = 0;
  private lastY = 0;
  private readonly orbit: boolean;
  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onKeyUp: (e: KeyboardEvent) => void;
  private readonly onPointerDown: (e: PointerEvent) => void;
  private readonly onPointerMove: (e: PointerEvent) => void;
  private readonly onPointerUp: (e: PointerEvent) => void;
  private readonly onPointerCancel: (e: PointerEvent) => void;
  private readonly onWheel: (e: WheelEvent) => void;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera,
    private readonly hooks: MapInputHooks & { orbit?: boolean },
  ) {
    this.orbit = hooks.orbit === true;
    this.onKeyDown = (e) => {
      if (typing(e)) return;
      if (this.orbit && e.key === "Home") {
        e.preventDefault();
        this.camera.resetView();
        this.hooks.onChanged();
        return;
      }
      this.keys.add(e.key.toLowerCase());
    };
    this.onKeyUp = (e) => {
      this.keys.delete(e.key.toLowerCase());
    };
    this.onPointerDown = (e) => {
      if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
      this.drag = this.orbit && (e.button === 1 || e.button === 2 || e.altKey) ? "orbit" : "pan";
      this.moved = 0;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
    };
    this.onPointerMove = (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.moved += Math.hypot(dx, dy);
      if (this.drag === "orbit") this.camera.orbitScreen(dx, dy);
      else this.camera.panScreen(dx, dy, this.canvas.clientHeight);
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.hooks.onChanged();
    };
    this.onPointerUp = (e) => {
      const clicked = this.drag === "pan" && e.button === 0 && this.moved < CLICK_PX;
      this.drag = null;
      if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
      if (clicked) this.hooks.onClick?.(e.clientX, e.clientY);
    };
    this.onPointerCancel = (e) => {
      this.drag = null;
      if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    };
    this.onWheel = (e) => {
      e.preventDefault();
      this.camera.zoomBy(e.deltaY > 0 ? 1.1 : 1 / 1.1);
      this.hooks.onChanged();
    };
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerCancel);
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
    this.hooks.onChanged();
  }

  destroy(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerCancel);
    this.canvas.removeEventListener("wheel", this.onWheel);
  }
}

function typing(e: KeyboardEvent): boolean {
  const t = e.target;
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
}
