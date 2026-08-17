/**
 * Canvas pan / zoom / WASD / pick. Mutates `camera`; session applies it to the world.
 */
import type { GridPos } from "../../shared";
import type { Camera } from "../../render/camera/camera";

const WASD_SPEED = 900;

export type MapInputHooks = {
  pick(screen: { x: number; y: number }): GridPos | null;
  onHover(pos: GridPos | null): void;
  onSelect(pos: GridPos | null): void;
  onCameraChanged(): void;
  onFit(): void;
  onLeave(): void;
};

export class MapInput {
  private readonly keys = new Set<string>();
  private dragging = false;
  private dragMoved = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera,
    private readonly hooks: MapInputHooks,
  ) {
    canvas.style.cursor = "grab";
    canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  tick(dtMs: number): void {
    if (this.keys.size === 0) return;
    const step = WASD_SPEED * (dtMs / 1000);
    let dx = 0;
    let dy = 0;
    // WASD pans the camera, not the world: left = camera right.
    if (this.keys.has("a") || this.keys.has("arrowleft")) dx += step;
    if (this.keys.has("d") || this.keys.has("arrowright")) dx -= step;
    if (this.keys.has("w") || this.keys.has("arrowup")) dy += step;
    if (this.keys.has("s") || this.keys.has("arrowdown")) dy -= step;
    if (!dx && !dy) return;
    this.camera.pan(dx, dy);
    this.hooks.onCameraChanged();
  }

  destroy(): void {
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    this.dragging = true;
    this.dragMoved = false;
    this.canvas.setPointerCapture(e.pointerId);
    this.canvas.style.cursor = "grabbing";
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (this.dragging) {
      this.camera.pan(e.movementX, e.movementY);
      this.hooks.onCameraChanged();
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) this.dragMoved = true;
    }
    this.hooks.onHover(this.hooks.pick({ x: e.clientX, y: e.clientY }));
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    this.dragging = false;
    this.canvas.style.cursor = "grab";
    // Click without a drag selects the tile under the pointer.
    if (!this.dragMoved) this.hooks.onSelect(this.hooks.pick({ x: e.clientX, y: e.clientY }));
  };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.camera.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    this.hooks.onCameraChanged();
    this.hooks.onHover(this.hooks.pick({ x: e.clientX, y: e.clientY }));
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.key.toLowerCase());
    if (e.key === " ") {
      e.preventDefault();
      this.hooks.onFit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      this.hooks.onLeave();
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };
}
