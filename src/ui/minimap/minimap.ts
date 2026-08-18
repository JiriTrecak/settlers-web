/**
 * Top-down terrain + occupy rim + huts + units + viewport quad.
 * Emits look-at in grid space; does not touch the camera.
 */
import { landscapeInfo, PLAYER_COLORS, clampPlayer, playerRgb, playerRgbLite, worldToGrid } from "../../shared";
import type { MapView } from "../../sim/map/mapView";
import type { FogView } from "../../sim/fog/fog";
import { FOG_VISIBLE } from "../../sim/fog/fog";
import { UNOWNED, type LandView } from "../../sim/land/land";
import type { BuildingView } from "../../sim/building/building";
import { buildingDef } from "../../sim/data/buildings";
import type { MovableView } from "../../sim/movable/movable";

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

const PLAYER_RGB: [number, number, number][] = PLAYER_COLORS.map((_, i) => playerRgb(i));
const UNIT_RGB: [number, number, number][] = PLAYER_COLORS.map((_, i) => playerRgbLite(i));

/** Top-down canvas widget. Session calls `setView` / `setCamera`. */
export class Minimap {
  private readonly canvas: HTMLCanvasElement;
  private readonly base = document.createElement("canvas");
  private readonly terrain = document.createElement("canvas");
  private readonly onLookAt: (x: number, y: number) => void;
  private view: MapView | null = null;
  private fog: FogView | null = null;
  private fogGen = -1;
  private fogPlayer = -2;
  private land: LandView | null = null;
  private buildings: readonly BuildingView[] = [];
  private units: readonly MovableView[] = [];
  private hutAt = new Int8Array(0);
  private unitAt = new Int8Array(0);
  private occupyW = 0;
  private occupyH = 0;
  private dragging = false;

  constructor(host: HTMLElement, hooks: { onLookAt: (x: number, y: number) => void }) {
    this.onLookAt = hooks.onLookAt;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "hud-minimap";
    this.canvas.width = 168;
    this.canvas.height = 168;
    this.base.width = 168;
    this.base.height = 168;
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
    this.fogGen = -1;
    this.fogPlayer = -2;
    this.paintFog();
    this.compose();
  }

  setFog(fog: FogView | null): void {
    if (!fog) {
      if (this.fog === null && this.fogGen === -2) return;
      this.fog = null;
      this.fogGen = -2;
      this.fogPlayer = -2;
      this.paintFog();
      this.compose();
      return;
    }
    if (fog.player === this.fogPlayer && fog.generation === this.fogGen) return;
    this.fog = fog;
    this.fogGen = fog.generation;
    this.fogPlayer = fog.player;
    this.paintFog();
    this.compose();
  }

  /** Occupy rim + hut footprints + units. Painted on compose; fog still hides unseen tiles. */
  setMarks(
    land: LandView | undefined,
    buildings: readonly BuildingView[],
    units: readonly MovableView[],
  ): void {
    this.land = land ?? null;
    this.buildings = buildings;
    this.units = units;
  }

  setCamera(camera: MinimapCamera, screenW: number, screenH: number): void {
    const view = this.view;
    const ctx = this.canvas.getContext("2d");
    if (!view || !ctx) return;
    this.compose();
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

  /** Rasterize landscape colors into the offscreen base canvas (once per map). */
  private paintTerrain(view: MapView): void {
    const ctx = this.base.getContext("2d");
    if (!ctx) return;
    const { width, height } = view;
    const image = ctx.createImageData(this.base.width, this.base.height);
    const data = image.data;
    for (let py = 0; py < this.base.height; py++) {
      for (let px = 0; px < this.base.width; px++) {
        const x = Math.min(width - 1, Math.floor((px / this.base.width) * width));
        const y = Math.min(height - 1, Math.floor((py / this.base.height) * height));
        const [r, g, b] = landscapeInfo[view.landscapeAt(x, y)].color;
        const i = (py * this.base.width + px) * 4;
        data[i] = Math.round(r * 255);
        data[i + 1] = Math.round(g * 255);
        data[i + 2] = Math.round(b * 255);
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  private paintFog(): void {
    const view = this.view;
    const dst = this.terrain.getContext("2d");
    if (!view || !dst) return;
    dst.drawImage(this.base, 0, 0);
    const fog = this.fog;
    if (!fog) return;
    const image = dst.getImageData(0, 0, this.terrain.width, this.terrain.height);
    const data = image.data;
    const { width, height } = view;
    for (let py = 0; py < this.terrain.height; py++) {
      for (let px = 0; px < this.terrain.width; px++) {
        const x = Math.min(width - 1, Math.floor((px / this.terrain.width) * width));
        const y = Math.min(height - 1, Math.floor((py / this.terrain.height) * height));
        const mul = fog.sightAt(x, y) / FOG_VISIBLE;
        const i = (py * this.terrain.width + px) * 4;
        data[i] = Math.round((data[i] ?? 0) * mul);
        data[i + 1] = Math.round((data[i + 1] ?? 0) * mul);
        data[i + 2] = Math.round((data[i + 2] ?? 0) * mul);
      }
    }
    dst.putImageData(image, 0, 0);
  }

  private compose(): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.terrain, 0, 0);
    this.paintMarks(ctx);
  }

  private paintMarks(ctx: CanvasRenderingContext2D): void {
    const view = this.view;
    if (!view) return;
    const { width, height } = view;
    this.stampOccupy(width, height);
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const image = ctx.getImageData(0, 0, cw, ch);
    const data = image.data;
    const fog = this.fog;
    const land = this.land;
    const hutAt = this.hutAt;
    const unitAt = this.unitAt;
    for (let py = 0; py < ch; py++) {
      for (let px = 0; px < cw; px++) {
        const x = Math.min(width - 1, ((px * width) / cw) | 0);
        const y = Math.min(height - 1, ((py * height) / ch) | 0);
        if (fog && fog.sightAt(x, y) <= 0) continue;
        const i = (py * cw + px) * 4;
        const ti = y * width + x;
        const unit = unitAt[ti] ?? -1;
        if (unit >= 0 && (!fog || fog.isClear(x, y))) {
          const rgb = UNIT_RGB[unit]!;
          data[i] = rgb[0];
          data[i + 1] = rgb[1];
          data[i + 2] = rgb[2];
          continue;
        }
        const hut = hutAt[ti] ?? -1;
        if (hut >= 0) {
          const rgb = PLAYER_RGB[hut]!;
          data[i] = rgb[0];
          data[i + 1] = rgb[1];
          data[i + 2] = rgb[2];
          continue;
        }
        if (!land || !land.isBorder(x, y)) continue;
        const owner = land.playerAt(x, y);
        if (owner === UNOWNED) continue;
        const rgb = PLAYER_RGB[clampPlayer(owner)]!;
        data[i] = rgb[0];
        data[i + 1] = rgb[1];
        data[i + 2] = rgb[2];
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  private stampOccupy(width: number, height: number): void {
    if (this.occupyW !== width || this.occupyH !== height) {
      this.occupyW = width;
      this.occupyH = height;
      this.hutAt = new Int8Array(width * height);
      this.unitAt = new Int8Array(width * height);
    }
    this.hutAt.fill(-1);
    this.unitAt.fill(-1);
    for (const b of this.buildings) {
      const p = b.player;
      if (p < 0) continue;
      for (const rel of buildingDef(b.kind).blocked) {
        const x = b.x + rel.dx;
        const y = b.y + rel.dy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        this.hutAt[y * width + x] = clampPlayer(p);
      }
    }
    for (const m of this.units) {
      if (m.inside || m.player < 0) continue;
      const { x, y } = m.pos;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      this.unitAt[y * width + x] = clampPlayer(m.player);
    }
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
