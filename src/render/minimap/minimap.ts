/**
 * Iso diamond minimap. Canvas 2D — a second WebGL context stalls the game on Mac.
 */
import { MAP_SIZE, type MapStamp } from "../../shared";
import { ISO_PITCH, ISO_YAW, type Camera } from "../camera/camera";

const PX = 264;
const LAND = "#24282c";
const VIEW = "#f2eee0";

/** Iso diamond. Y is flipped so screen-up matches the camera (away from +X+Z). */
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
  private dirty = true;
  private lastX = NaN;
  private lastZ = NaN;
  private lastZoom = NaN;
  private dragging = false;
  private readonly onDown: (e: PointerEvent) => void;
  private readonly onMove: (e: PointerEvent) => void;
  private readonly onUp: (e: PointerEvent) => void;

  constructor(
    host: HTMLElement,
    private readonly spec: {
      camera: Camera;
      size?: number;
      aspect: () => number;
      onLookAt: (x: number, z: number) => void;
    },
  ) {
    this.root = document.createElement("div");
    this.root.className =
      "pointer-events-auto absolute top-4 right-4 z-10 h-[264px] w-[264px] cursor-grab touch-none bg-sheet p-[2px] [clip-path:polygon(50%_0%,100%_50%,50%_100%,0%_50%)]";
    this.root.setAttribute("aria-label", "Minimap");
    this.canvas = document.createElement("canvas");
    this.canvas.className = "block h-full w-full";
    this.canvas.width = PX;
    this.canvas.height = PX;
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

  paint(): void {
    const cam = this.spec.camera;
    if (!this.dirty && cam.targetX === this.lastX && cam.targetZ === this.lastZ && cam.zoom === this.lastZoom) return;
    const aspect = this.spec.aspect();
    this.dirty = false;
    this.lastX = cam.targetX;
    this.lastZ = cam.targetZ;
    this.lastZoom = cam.zoom;
    const size = this.spec.size ?? MAP_SIZE;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = LAND;
    ctx.fillRect(0, 0, w, h);
    for (const d of this.dots) {
      const [px, py] = this.project(d.x, d.z, size, w, h);
      ctx.fillStyle = d.fill;
      ctx.fillRect(px - 1, py - 1, 3, 3);
    }
    const quad = viewQuad(cam, aspect);
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

function viewQuad(cam: Camera, aspect: number): [number, number][] {
  const halfH = cam.zoom;
  const halfW = cam.zoom * Math.max(0.2, aspect);
  const rx = Math.cos(ISO_YAW);
  const rz = -Math.sin(ISO_YAW);
  const fx = Math.sin(ISO_YAW);
  const fz = Math.cos(ISO_YAW);
  const lift = 1 / Math.cos(ISO_PITCH);
  const out: [number, number][] = [];
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    out.push([
      cam.targetX + rx * halfW * sx + fx * halfH * sy * lift,
      cam.targetZ + rz * halfW * sx + fz * halfH * sy * lift,
    ]);
  }
  return out;
}

function tint(id: string): string {
  if (id === "pine") return "#6bc729";
  if (id === "boulder") return "#c7b86b";
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
