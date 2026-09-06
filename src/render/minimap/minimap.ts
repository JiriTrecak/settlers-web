/**
 * Iso diamond minimap. Canvas 2D — a second WebGL context stalls the game on Mac.
 * View quad is a perspective frustum ∩ ground, so the far edge is wider.
 */
import { MAP_SIZE, type HeightField, type MapStamp } from "../../shared";
import type { Camera } from "../camera/camera";

const PX = 264;
const LAND = "#24282c";
const WATER = "#3d6e72";
const VIEW = "#f2eee0";
const SHEET = "#14161c";
const RING = 2;

/** Iso diamond. Y is flipped so screen-up is −X−Z (away from the default cam). */
export function worldToNdc(x: number, z: number, size: number): [number, number] {
  const nx = (x / size) * 2 - 1;
  const nz = (z / size) * 2 - 1;
  return [(nx - nz) * 0.5, -(nx + nz) * 0.5];
}

export function ndcToWorld(ndcX: number, ndcY: number, size: number): [number, number] {
  const nx = ndcX - ndcY;
  const nz = -ndcX - ndcY;
  return [((nx + 1) * 0.5) * size, ((nz + 1) * 0.5) * size];
}

export class Minimap {
  readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private dots: { x: number; z: number; fill: string }[] = [];
  private height: HeightField | null = null;
  private dirty = true;
  private lastRev = -1;
  private lastW = 0;
  private lastH = 0;
  private dragging = false;
  private readonly onDown: (e: PointerEvent) => void;
  private readonly onMove: (e: PointerEvent) => void;
  private readonly onUp: (e: PointerEvent) => void;

  constructor(
    host: HTMLElement,
    private readonly spec: {
      camera: Camera;
      size?: number;
      viewport: () => { w: number; h: number };
      onLookAt: (x: number, z: number) => void;
    },
  ) {
    this.root = document.createElement("div");
    this.root.className =
      "pointer-events-auto absolute top-4 right-4 z-10 h-[264px] w-[264px] cursor-grab touch-none [clip-path:polygon(50%_0%,100%_50%,50%_100%,0%_50%)]";
    this.root.setAttribute("aria-label", "Minimap");
    this.canvas = document.createElement("canvas");
    this.canvas.className = "absolute inset-0 block h-full w-full";
    this.canvas.width = PX;
    this.canvas.height = PX;
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("minimap: 2d unavailable");
    this.ctx = ctx;
    this.root.append(this.canvas);
    host.append(this.root);
    this.onDown = (e) => {
      if (e.button !== 0) return;
      this.dragging = true;
      this.root.style.cursor = "grabbing";
      this.root.setPointerCapture(e.pointerId);
      this.scrub(e);
    };
    this.onMove = (e) => {
      if (this.dragging) this.scrub(e);
    };
    this.onUp = (e) => {
      this.dragging = false;
      this.root.style.cursor = "grab";
      if (this.root.hasPointerCapture(e.pointerId)) this.root.releasePointerCapture(e.pointerId);
    };
    this.root.addEventListener("pointerdown", this.onDown);
    this.root.addEventListener("pointermove", this.onMove);
    this.root.addEventListener("pointerup", this.onUp);
    this.root.addEventListener("pointercancel", this.onUp);
    this.paint();
  }

  setStamps(stamps: readonly MapStamp[]): void {
    this.dots = stamps.map((s) => ({ x: s.x + 0.5, z: s.y + 0.5, fill: tint(s.asset) }));
    this.dirty = true;
  }

  setHeight(field: HeightField | null): void {
    this.height = field;
    this.dirty = true;
  }

  paint(): void {
    const cam = this.spec.camera;
    const { w: vw, h: vh } = this.spec.viewport();
    if (!this.dirty && cam.rev === this.lastRev && vw === this.lastW && vh === this.lastH) return;
    this.dirty = false;
    this.lastRev = cam.rev;
    this.lastW = vw;
    this.lastH = vh;
    const size = this.spec.size ?? MAP_SIZE;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = LAND;
    ctx.fillRect(0, 0, w, h);
    const field = this.height;
    if (field) {
      ctx.fillStyle = WATER;
      const step = 2;
      for (let z = 0; z < size; z += step) {
        for (let x = 0; x < size; x += step) {
          if (field.sample(x + 0.5, z + 0.5) >= field.waterLevel) continue;
          const [px, py] = this.project(x + step * 0.5, z + step * 0.5, size, w, h);
          ctx.fillRect(px - 1, py - 1, 3, 3);
        }
      }
    }
    for (const d of this.dots) {
      const [px, py] = this.project(d.x, d.z, size, w, h);
      ctx.fillStyle = d.fill;
      ctx.fillRect(px - 1, py - 1, 3, 3);
    }
    const quad = cam.viewGround(vw, vh);
    ctx.beginPath();
    for (let i = 0; i < quad.length; i++) {
      const [px, py] = this.project(quad[i]![0], quad[i]![1], size, w, h);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.strokeStyle = VIEW;
    ctx.lineWidth = 1;
    ctx.stroke();
    const o = RING / 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.5, o);
    ctx.lineTo(w - o, h * 0.5);
    ctx.lineTo(w * 0.5, h - o);
    ctx.lineTo(o, h * 0.5);
    ctx.closePath();
    ctx.strokeStyle = SHEET;
    ctx.lineWidth = RING;
    ctx.lineJoin = "miter";
    ctx.stroke();
  }

  destroy(): void {
    this.root.removeEventListener("pointerdown", this.onDown);
    this.root.removeEventListener("pointermove", this.onMove);
    this.root.removeEventListener("pointerup", this.onUp);
    this.root.removeEventListener("pointercancel", this.onUp);
    this.root.remove();
  }

  private project(x: number, z: number, size: number, w: number, h: number): [number, number] {
    const [nx, ny] = worldToNdc(x, z, size);
    return [(nx * 0.5 + 0.5) * w, (0.5 - ny * 0.5) * h];
  }

  private scrub(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((e.clientY - rect.top) / rect.height) * 2;
    const size = this.spec.size ?? MAP_SIZE;
    const [x, z] = ndcToWorld(ndcX, ndcY, size);
    const max = size - 0.01;
    this.spec.onLookAt(clamp(x, 0, max), clamp(z, 0, max));
  }
}

function tint(id: string): string {
  if (id === "pine") return "#6bc729";
  if (id === "pine-dark") return "#3a6a2a";
  if (id === "pine-umber") return "#6a5428";
  if (id === "boulder") return "#c7b86b";
  if (id === "rock") return "#b8a878";
  if (id === "rock-cleft") return "#8e8674";
  if (id === "rock-slab") return "#c4a66a";
  if (id === "lily") return "#e07a96";
  if (id === "lily-white") return "#f0ece4";
  if (id === "lily-gold") return "#e0b84a";
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const r = 90 + ((h >>> 16) & 127);
  const g = 140 + ((h >>> 8) & 87);
  const b = 50 + (h & 87);
  return `rgb(${r},${g},${b})`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
