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
}
