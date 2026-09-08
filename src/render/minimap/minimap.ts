import { ownerSlot } from "../../content/schema";
import { content } from "../../content/builtin";
import type { SettlementView } from "../../sim/game/observation";
import { PLAYER_COLORS } from "../../shared";
import type { PlayerStart } from "../../shared/map/utcmap";
import { DayNightIndicator } from "./dayNight";
import type { SkyState } from "../sky/sky";
/**
 * North-up square minimap. Canvas 2D — a second WebGL context stalls the game on Mac.
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

/** North is negative Z; east is positive X, matching the game camera. */
export function worldToNdc(
  x: number,
  z: number,
  size: number,
): [number, number] {
  return [(x / size) * 2 - 1, 1 - (z / size) * 2];
}

export function ndcToWorld(
  ndcX: number,
  ndcY: number,
  size: number,
): [number, number] {
  return [(ndcX + 1) * 0.5 * size, (1 - ndcY) * 0.5 * size];
}

export class Minimap {
  readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly clock: DayNightIndicator;
  private readonly ctx: CanvasRenderingContext2D;
  private dots: { x: number; z: number; fill: string }[] = [];
  private starts: readonly PlayerStart[] = [];
  setPlayerStarts(starts: readonly PlayerStart[]): void {
    this.starts = starts;
    this.dirty = true;
  }
  private fogState: SettlementView | null = null;
  private fogRevision = -1;
  private readonly fogCanvas = document.createElement("canvas");
  setFog(state: SettlementView) {
    this.fogState = state;
    if (this.fogRevision !== state.fog?.revision) {
      this.fogRevision = state.fog?.revision ?? -1;
      this.dirty = true;
      this.fogCanvas.width = this.fogCanvas.height = 256;
      const ctx = this.fogCanvas.getContext("2d")!,
        data = ctx.createImageData(256, 256);
      for (let i = 0; i < 65536; i++)
        data.data[i * 4 + 3] =
          state.fog?.cells[i] === 2 ? 0 : state.fog?.cells[i] === 1 ? 166 : 255;
      ctx.putImageData(data, 0, 0);
    }
  }
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
      clock: () => SkyState;
      size?: number;
      viewport: () => { w: number; h: number };
      onLookAt: (x: number, z: number) => void;
    },
  ) {
    this.root = document.createElement("div");
    this.root.className =
      "pointer-events-none absolute top-4 right-4 z-10 h-[264px] w-[264px]";
    this.root.setAttribute("aria-label", "Minimap");
    this.canvas = document.createElement("canvas");
    this.canvas.className =
      "pointer-events-auto absolute inset-0 block h-full w-full cursor-grab touch-none ";
    this.canvas.width = PX;
    this.canvas.height = PX;
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("minimap: 2d unavailable");
    this.ctx = ctx;
    this.root.append(this.canvas);
    this.clock = new DayNightIndicator(this.root);
    this.clock.root.style.left = "-66px";
    host.append(this.root);
    this.onDown = (e) => {
      if (e.button !== 0) return;
      this.dragging = true;
      this.canvas.style.cursor = "grabbing";
      this.canvas.setPointerCapture(e.pointerId);
      this.scrub(e);
    };
    this.onMove = (e) => {
      if (this.dragging) this.scrub(e);
    };
    this.onUp = (e) => {
      this.dragging = false;
      this.canvas.style.cursor = "grab";
      if (this.canvas.hasPointerCapture(e.pointerId))
        this.canvas.releasePointerCapture(e.pointerId);
    };
    this.canvas.addEventListener("pointerdown", this.onDown);
    this.canvas.addEventListener("pointermove", this.onMove);
    this.canvas.addEventListener("pointerup", this.onUp);
    this.canvas.addEventListener("pointercancel", this.onUp);
    this.paint();
  }

  mountGame(host: HTMLElement, clockHost: HTMLElement): void {
    this.root.className = "";
    this.root.style.cssText =
      "position:relative;width:100%;height:100%;pointer-events:auto;overflow:hidden;border:1px solid #a9946655;background:#000";
    host.append(this.root);
    clockHost.append(this.clock.root);
    this.clock.root.style.left = "0";
  }

  setStamps(stamps: readonly MapStamp[]): void {
    this.dots = stamps.map((s) => ({
      x: s.x + 0.5,
      z: s.y + 0.5,
      fill: tint(s.asset),
    }));
    this.dirty = true;
  }

  setHeight(field: HeightField | null): void {
    this.height = field;
    this.dirty = true;
  }

  paint(): void {
    this.clock.update(this.spec.clock());
    const cam = this.spec.camera;
    const { w: vw, h: vh } = this.spec.viewport();
    if (
      !this.dirty &&
      cam.rev === this.lastRev &&
      vw === this.lastW &&
      vh === this.lastH
    )
      return;
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
          const [px, py] = this.project(
            x + step * 0.5,
            z + step * 0.5,
            size,
            w,
            h,
          );
          ctx.fillRect(px - 1, py - 1, 3, 3);
        }
      }
    }
    for (const d of this.dots) {
      const [px, py] = this.project(d.x, d.z, size, w, h);
      ctx.fillStyle = d.fill;
      ctx.fillRect(px - 1, py - 1, 3, 3);
    }
    if (this.fogState?.fog) {
      ctx.save();
      ctx.transform(w / size, 0, 0, h / size, 0, 0);
      ctx.drawImage(this.fogCanvas, 0, 0, size, size);
      ctx.restore();
      for (const entity of this.fogState.entities) {
        if (entity.resource || entity.unit?.contained) continue;
        const [px, py] = this.project(entity.x, entity.y, size, w, h),
          owner = ownerSlot(entity.owner),
          radius = content.get(entity.definition).kind === "building" ? 2 : 1;
        ctx.fillStyle =
          "#" +
          (owner < 0 ? 0xd7b36b : PLAYER_COLORS[owner % PLAYER_COLORS.length]!)
            .toString(16)
            .padStart(6, "0");
        ctx.globalAlpha = entity.remembered ? 0.45 : 1;
        ctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
      }
      ctx.globalAlpha = 1;
    }
    for (const start of this.starts) {
      const [px, py] = this.project(start.x, start.z, size, w, h);
      ctx.fillStyle = start.player === 1 ? "#63c7ff" : "#ff997e";
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#142026";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(start.player), px, py);
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
    ctx.rect(o, o, w - 2 * o, h - 2 * o);
    ctx.closePath();
    ctx.strokeStyle = SHEET;
    ctx.lineWidth = RING;
    ctx.lineJoin = "miter";
    ctx.stroke();
  }

  destroy(): void {
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointercancel", this.onUp);
    this.root.remove();
  }

  private project(
    x: number,
    z: number,
    size: number,
    w: number,
    h: number,
  ): [number, number] {
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
  if (id === "bridge-8" || id === "bridge-16" || id === "bridge-32")
    return "#8a6a40";
  let h = 2166136261;
  for (let i = 0; i < id.length; i++)
    h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const r = 90 + ((h >>> 16) & 127);
  const g = 140 + ((h >>> 8) & 87);
  const b = 50 + (h & 87);
  return `rgb(${r},${g},${b})`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
