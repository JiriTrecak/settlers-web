import { gridToWorld, landscapeInfo, worldToGrid } from "../../shared";
import type { MapView } from "../../sim/map/mapView";

export type MinimapCamera = {
  panX: number;
  panY: number;
  zoom: number;
  screenToWorld(sx: number, sy: number): { x: number; y: number };
};

const terrainCache = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();

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

export function lookAtMinimap(
  camera: MinimapCamera,
  screenW: number,
  screenH: number,
  view: MapView,
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): void {
  const px = minimapEventPx(canvas, clientX, clientY);
  const g = minimapPxToGrid(px.x, px.y, view.width, view.height, canvas.width, canvas.height);
  const world = gridToWorld(
    clamp(g.x, 0, Math.max(0, view.width - 1)),
    clamp(g.y, 0, Math.max(0, view.height - 1)),
  );
  camera.panX = screenW / 2 - world.x * camera.zoom;
  camera.panY = screenH / 2 - world.y * camera.zoom;
}

export function paintMinimap(canvas: HTMLCanvasElement, view: MapView): void {
  const buf = acquireTerrain(canvas);
  const ctx = buf.getContext("2d");
  if (!ctx) return;
  const { width, height } = view;
  const image = ctx.createImageData(buf.width, buf.height);
  const data = image.data;
  for (let py = 0; py < buf.height; py++) {
    for (let px = 0; px < buf.width; px++) {
      const x = Math.min(width - 1, Math.floor((px / buf.width) * width));
      const y = Math.min(height - 1, Math.floor((py / buf.height) * height));
      const [r, g, b] = landscapeInfo[view.landscapeAt(x, y)].color;
      const i = (py * buf.width + px) * 4;
      data[i] = Math.round(r * 255);
      data[i + 1] = Math.round(g * 255);
      data[i + 2] = Math.round(b * 255);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  blitTerrain(canvas);
}

export function paintMinimapViewport(
  canvas: HTMLCanvasElement,
  camera: MinimapCamera,
  screenW: number,
  screenH: number,
  view: MapView,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  blitTerrain(canvas);
  const quad = viewportMinimapQuad(
    camera,
    screenW,
    screenH,
    view.width,
    view.height,
    canvas.width,
    canvas.height,
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

function acquireTerrain(canvas: HTMLCanvasElement): HTMLCanvasElement {
  let buf = terrainCache.get(canvas);
  if (!buf || buf.width !== canvas.width || buf.height !== canvas.height) {
    buf = document.createElement("canvas");
    buf.width = canvas.width;
    buf.height = canvas.height;
    terrainCache.set(canvas, buf);
  }
  return buf;
}

function blitTerrain(canvas: HTMLCanvasElement): void {
  const buf = terrainCache.get(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  if (!buf) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(buf, 0, 0);
}
