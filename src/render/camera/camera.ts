/**
 * 2D pan/zoom in screen pixels. World is scaled around `panX/panY`.
 * `lookAt` / `fit` are called by Session; MapInput only `pan` / `zoomAt`.
 */
import { worldToGrid } from "../../shared";

export class Camera {
  panX = 0;
  panY = 0;
  zoom = 1;
  minZoom = 0.35;
  maxZoom = 8;

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return { x: wx * this.zoom + this.panX, y: wy * this.zoom + this.panY };
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.panX) / this.zoom, y: (sy - this.panY) / this.zoom };
  }

  pan(dx: number, dy: number): void {
    this.panX += dx;
    this.panY += dy;
  }

  /** Zoom keeping the world point under `(sx, sy)` fixed on screen. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const world = this.screenToWorld(sx, sy);
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
    this.panX = sx - world.x * this.zoom;
    this.panY = sy - world.y * this.zoom;
  }

  lookAt(wx: number, wy: number, screenW: number, screenH: number): void {
    this.panX = screenW / 2 - wx * this.zoom;
    this.panY = screenH / 2 - wy * this.zoom;
  }

  fit(bounds: { minX: number; minY: number; maxX: number; maxY: number }, screenW: number, screenH: number, pad = 0.88): void {
    const bw = Math.max(1, bounds.maxX - bounds.minX);
    const bh = Math.max(1, bounds.maxY - bounds.minY);
    this.zoom = Math.min(screenW / bw, screenH / bh) * pad;
    this.panX = screenW / 2 - ((bounds.minX + bounds.maxX) / 2) * this.zoom;
    this.panY = screenH / 2 - ((bounds.minY + bounds.maxY) / 2) * this.zoom;
  }

  /**
   * Grid AABB covering the screen. `pad` extra cells for height-lifted tiles.
   * `stride` skips cells when zoomed out (viewport-scan fallback only).
   */
  visibleGrid(
    screenW: number,
    screenH: number,
    mapW: number,
    mapH: number,
    pad = 24,
  ): { x0: number; y0: number; x1: number; y1: number; stride: number } {
    const corners = [
      this.screenToWorld(0, 0),
      this.screenToWorld(screenW, 0),
      this.screenToWorld(screenW, screenH),
      this.screenToWorld(0, screenH),
    ];
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const c of corners) {
      const g = worldToGrid(c.x, c.y);
      x0 = Math.min(x0, g.x);
      y0 = Math.min(y0, g.y);
      x1 = Math.max(x1, g.x);
      y1 = Math.max(y1, g.y);
    }
    return {
      x0: Math.max(0, Math.floor(x0) - 2),
      y0: Math.max(0, Math.floor(y0) - 2),
      x1: Math.min(mapW - 1, Math.ceil(x1) + pad),
      y1: Math.min(mapH - 1, Math.ceil(y1) + pad),
      stride: Math.max(1, Math.round(1 / this.zoom)),
    };
  }
}
