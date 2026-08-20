/**
 * Canvas pan / zoom / WASD / pick. Mutates `camera`; session applies it.
 * Escape deselects; Delete / Backspace destroys the selected hut.
 * Letter keys go to `onHotkey` (command page); a hit is not WASD pan.
 * C converts a selected pioneer → bearer. G converts a selected geologist → bearer.
 * On the Recruit page those letters arm Pioneer / Geologist instead.
 * X enlists a selected bearer as L1 swordsman.
 * LMB click selects. Shift+LMB drag is a marquee. RMB commands (shift = forced walk).
 * Plain LMB drag pans.
 */
import type { GridPos } from "../../shared";
import type { Camera } from "../../render/camera/camera";
import { isClick, type ScreenPt } from "./boxSelect";

const WASD_SPEED = 900;

export type MapInputHooks = {
  pick(screen: { x: number; y: number }): GridPos | null;
  onHover(pos: GridPos | null): void;
  onSelect(pos: GridPos | null, add: boolean, screen: ScreenPt): void;
  onBox(a: ScreenPt, b: ScreenPt): void;
  onCommand(pos: GridPos | null, shift: boolean): void;
  onCameraChanged(): void;
  onFit(): void;
  /** If set, Space calls this instead of fit (replay play/pause). */
  onSpace?: () => void;
  onEscape(): void;
  onDelete(): void;
  onConvert(): void;
  onEnlist(): void;
  onGeologist(): void;
  /** Current command-page hotkey. True = consumed (do not pan). */
  onHotkey(key: string): boolean;
};

export class MapInput {
  private readonly keys = new Set<string>();
  private readonly marquee: HTMLDivElement;
  private mode: "none" | "pan" | "box" = "none";
  private dragMoved = false;
  private boxStart: ScreenPt | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera,
    private readonly hooks: MapInputHooks,
  ) {
    canvas.style.cursor = "grab";
    this.marquee = document.createElement("div");
    this.marquee.style.cssText =
      "position:fixed;display:none;pointer-events:none;z-index:40;border:1px solid #fff;background:rgba(255,255,255,.12)";
    document.body.appendChild(this.marquee);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("lostpointercapture", this.onLostCapture);
    canvas.addEventListener("contextmenu", this.onContextMenu);
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
    this.marquee.remove();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("lostpointercapture", this.onLostCapture);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    this.canvas.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }

  private readonly onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.button === 2) {
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    this.dragMoved = false;
    this.canvas.setPointerCapture(e.pointerId);
    if (e.shiftKey) {
      this.mode = "box";
      this.boxStart = { x: e.clientX, y: e.clientY };
      this.canvas.style.cursor = "crosshair";
      this.paintMarquee(this.boxStart, this.boxStart);
      return;
    }
    this.mode = "pan";
    this.boxStart = null;
    this.canvas.style.cursor = "grabbing";
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (this.mode === "pan") {
      this.camera.pan(e.movementX, e.movementY);
      this.hooks.onCameraChanged();
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) this.dragMoved = true;
    } else if (this.mode === "box" && this.boxStart) {
      const end = { x: e.clientX, y: e.clientY };
      if (!isClick(this.boxStart, end)) this.dragMoved = true;
      this.paintMarquee(this.boxStart, end);
    }
    this.hooks.onHover(this.hooks.pick(this.canvasPt(e)));
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (e.button === 2) {
      this.hooks.onCommand(this.hooks.pick(this.canvasPt(e)), e.shiftKey);
      return;
    }
    if (e.button !== 0) return;
    const start = this.boxStart;
    const boxing = this.mode === "box";
    this.endDrag();
    if (boxing && start) {
      const end = { x: e.clientX, y: e.clientY };
      if (this.dragMoved && !isClick(start, end)) this.hooks.onBox(this.toCanvas(start), this.toCanvas(end));
      else this.hooks.onSelect(this.hooks.pick(this.toCanvas(end)), true, this.toCanvas(end));
      return;
    }
    if (!this.dragMoved) {
      const screen = this.canvasPt(e);
      this.hooks.onSelect(this.hooks.pick(screen), false, screen);
    }
  };

  private readonly onLostCapture = (): void => {
    this.endDrag();
  };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const pt = this.canvasPt(e);
    this.camera.zoomAt(pt.x, pt.y, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    this.hooks.onCameraChanged();
    this.hooks.onHover(this.hooks.pick(pt));
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    const letter = e.key.length === 1 ? e.key.toLowerCase() : "";
    if (letter && !e.repeat && this.hooks.onHotkey(letter)) {
      e.preventDefault();
      return;
    }
    this.keys.add(e.key.toLowerCase());
    if (e.key === " ") {
      e.preventDefault();
      if (this.hooks.onSpace) this.hooks.onSpace();
      else this.hooks.onFit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      this.hooks.onEscape();
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      this.hooks.onDelete();
    }
    if (e.key.toLowerCase() === "c" && !e.repeat) {
      e.preventDefault();
      this.hooks.onConvert();
    }
    if (e.key.toLowerCase() === "x" && !e.repeat) {
      e.preventDefault();
      this.hooks.onEnlist();
    }
    if (e.key.toLowerCase() === "g" && !e.repeat) {
      e.preventDefault();
      this.hooks.onGeologist();
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };

  private endDrag(): void {
    this.mode = "none";
    this.boxStart = null;
    this.marquee.style.display = "none";
    this.canvas.style.cursor = "grab";
  }

  private paintMarquee(a: ScreenPt, b: ScreenPt): void {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    this.marquee.style.display = "block";
    this.marquee.style.left = `${x}px`;
    this.marquee.style.top = `${y}px`;
    this.marquee.style.width = `${Math.abs(b.x - a.x)}px`;
    this.marquee.style.height = `${Math.abs(b.y - a.y)}px`;
  }

  private toCanvas(p: ScreenPt): ScreenPt {
    const r = this.canvas.getBoundingClientRect();
    return { x: p.x - r.left, y: p.y - r.top };
  }

  private canvasPt(e: { clientX: number; clientY: number }): ScreenPt {
    return this.toCanvas({ x: e.clientX, y: e.clientY });
  }
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}
