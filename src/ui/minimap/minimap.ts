/**
 * Top-down terrain + viewport quad. Emits look-at in grid space; does not touch the camera.
 */
import { landscapeInfo, worldToGrid } from "../../shared";
import type { MapView } from "../../sim/map/mapView";

export type MinimapCamera = {
  panX: number;
  panY: number;
  zoom: number;
  screenToWorld(sx: number, sy: number): { x: number; y: number };
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function minimapPxToGrid(
  px: number,
  py: number,
  mapW: number,
  mapH: number,
  canvasW: number,
  canvasH: number,
): { x: number; y: number } {
  return {
    x: (px / canvasW) * mapW,
    y: (py / canvasH) * mapH,
  };
}

export function gridToMinimapPx(
  gx: number,
  gy: number,
  mapW: number,
  mapH: number,
  canvasW: number,
  canvasH: number,
): { x: number; y: number } {
  return {
    x: (gx / mapW) * canvasW,
    y: (gy / mapH) * canvasH,
  };
}

export function minimapEventPx(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const w = rect.width || canvas.width;
  const h = rect.height || canvas.height;
  return {
    x: clamp(((clientX - rect.left) / w) * canvas.width, 0, canvas.width),
    y: clamp(((clientY - rect.top) / h) * canvas.height, 0, canvas.height),
  };
}

/** Screen corners in grid space, mapped onto the top-down minimap. Iso → parallelogram. */
export function viewportMinimapQuad(
  camera: MinimapCamera,
  screenW: number,
  screenH: number,
  mapW: number,
  mapH: number,
  canvasW: number,
  canvasH: number,
): { x: number; y: number }[] {
  const corners: [number, number][] = [
    [0, 0],
    [screenW, 0],
    [screenW, screenH],
    [0, screenH],
  ];
  return corners.map(([sx, sy]) => {
    const world = camera.screenToWorld(sx, sy);
    const g = worldToGrid(world.x, world.y);
    return gridToMinimapPx(g.x, g.y, mapW, mapH, canvasW, canvasH);
  });
}

export function minimapClientToGrid(
  view: MapView,
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const px = minimapEventPx(canvas, clientX, clientY);
  return minimapPxToGrid(px.x, px.y, view.width, view.height, canvas.width, canvas.height);
}

/** Top-down canvas widget. Session calls `setView` / `setCamera`. */
export class Minimap {
  private readonly canvas: HTMLCanvasElement;
  private readonly terrain = document.createElement("canvas");
  private readonly onLookAt: (x: number, y: number) => void;
  private view: MapView | null = null;
  private dragging = false;

  constructor(host: HTMLElement, hooks: { onLookAt: (x: number, y: number) => void }) {
    this.onLookAt = hooks.onLookAt;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "hud-minimap";
    this.canvas.width = 168;
    this.canvas.height = 168;
    this.terrain.width = 168;
    this.terrain.height = 168;
    host.append(this.canvas);

    this.canvas.addEventListener("pointerdown", this.onDown);
    this.canvas.addEventListener("pointermove", this.onMove);
    this.canvas.addEventListener("pointerup", this.onUp);
    this.canvas.addEventListener("pointercancel", this.onUp);
  }

  setView(view: MapView | null): void {
    this.view = view;
    if (!view) {
      const ctx = this.canvas.getContext("2d");
      ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
      return;
    }
    this.paintTerrain(view);
    this.blitTerrain();
  }

  setCamera(camera: MinimapCamera, screenW: number, screenH: number): void {
    const view = this.view;
    const ctx = this.canvas.getContext("2d");
    if (!view || !ctx) return;
    this.blitTerrain();
    const quad = viewportMinimapQuad(
      camera,
      screenW,
      screenH,
      view.width,
      view.height,
      this.canvas.width,
      this.canvas.height,
    );
    const first = quad[0];
    if (!first) return;
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < quad.length; i++) {
      const p = quad[i]!;
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(232, 224, 208, 0.14)";
    ctx.fill();
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = "#e8c36a";
    ctx.lineWidth = 1.25;
    ctx.stroke();
  }

  destroy(): void {
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointercancel", this.onUp);
    this.canvas.remove();
  }

  /** Rasterize landscape colors into the offscreen terrain canvas (once per map). */
  private paintTerrain(view: MapView): void {
    const ctx = this.terrain.getContext("2d");
    if (!ctx) return;
    const { width, height } = view;
    const image = ctx.createImageData(this.terrain.width, this.terrain.height);
    const data = image.data;
    for (let py = 0; py < this.terrain.height; py++) {
      for (let px = 0; px < this.terrain.width; px++) {
        const x = Math.min(width - 1, Math.floor((px / this.terrain.width) * width));
        const y = Math.min(height - 1, Math.floor((py / this.terrain.height) * height));
        const [r, g, b] = landscapeInfo[view.landscapeAt(x, y)].color;
        const i = (py * this.terrain.width + px) * 4;
        data[i] = Math.round(r * 255);
        data[i + 1] = Math.round(g * 255);
        data[i + 2] = Math.round(b * 255);
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  private blitTerrain(): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.terrain, 0, 0);
  }

  private emitLookAt(e: PointerEvent): void {
    if (!this.view) return;
    const g = minimapClientToGrid(this.view, this.canvas, e.clientX, e.clientY);
    this.onLookAt(g.x, g.y);
  }

  private readonly onDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    this.dragging = true;
    this.canvas.classList.add("is-dragging");
    this.canvas.setPointerCapture(e.pointerId);
    this.emitLookAt(e);
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    this.emitLookAt(e);
  };

  private readonly onUp = (e: PointerEvent): void => {
    if (e.button !== 0 && e.type !== "pointercancel") return;
    this.dragging = false;
    this.canvas.classList.remove("is-dragging");
  };
}
