import { entityMarker } from "./presentation";
import { sampleCurve, type Landscape } from "../../shared/landscape/curve";
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
const LAND = "#62543a";
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
    if(starts.length === this.starts.length && starts.every((start,index)=>start===this.starts[index])) return;
    this.starts = starts;
    this.dirty = true;
  }
  private fogState: SettlementView | null = null;
  private fogRevision = -1;
  private fogOwner: number | undefined;
  private readonly fogCanvas = document.createElement("canvas");
  setFog(state: SettlementView) {
    if(this.fogState?.revision !== state.revision) this.dirty = true;
    this.fogState = state;
    if (this.fogRevision !== state.fog?.revision || this.fogOwner !== state.fog?.owner) {
      this.fogOwner = state.fog?.owner;
      this.fogRevision = state.fog?.revision ?? -1;
      this.dirty = true;
      const size=Math.sqrt(state.fog?.cells.length??0)||this.spec.size||MAP_SIZE;
      this.fogCanvas.width = this.fogCanvas.height = size;
      const ctx = this.fogCanvas.getContext("2d")!,
        data = ctx.createImageData(size, size);
      for (let i = 0; i < size*size; i++)
        data.data[i * 4 + 3] =
          state.fog?.cells[i] === 2 ? 0 : state.fog?.cells[i] === 1 ? 166 : 255;
      ctx.putImageData(data, 0, 0);
    }
  }
  private readonly terrainCanvas = document.createElement("canvas");
  private terrainDirty = true;
  private landscape: Landscape | undefined;
  setLandscape(landscape: Landscape | undefined): void {
    if(this.landscape === landscape) return;
    this.landscape = landscape;
    this.terrainDirty = this.dirty = true;
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
    this.terrainDirty = this.dirty = true;
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
    const size = this.height?.size ?? this.spec.size ?? MAP_SIZE;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if(this.terrainDirty) this.paintTerrain(size);
    ctx.drawImage(this.terrainCanvas,0,0,w,h);
    ctx.globalAlpha = 0.18;
    for (const d of this.dots) {
      const [px, py] = this.project(d.x, d.z, size, w, h);
      ctx.fillStyle = d.fill;
      ctx.fillRect(px - 0.5, py - 0.5, 1, 1);
    }
    ctx.globalAlpha = 1;
    if (this.fogState?.fog) {
      ctx.save();
      ctx.transform(w / size, 0, 0, h / size, 0, 0);
      ctx.drawImage(this.fogCanvas, 0, 0, size, size);
      ctx.restore();
    }
    if(this.fogState) {
      // Observation is already visibility-filtered, including remembered structures.
      for (const entity of this.fogState.entities) {
        const marker=entityMarker(entity,content.get(entity.definition),size,w);
        if(!marker) continue;
        const [px,py]=this.project(entity.x,entity.y,size,w,h);
        ctx.fillStyle=marker.fill;
        ctx.globalAlpha=marker.alpha;
        ctx.fillRect(px-marker.width/2,py-marker.height/2,marker.width,marker.height);
      }
      ctx.globalAlpha=1;
    }
    for (const start of this.starts) {
      const [px, py] = this.project(start.x, start.z, size, w, h);
      ctx.fillStyle = "#" + PLAYER_COLORS[start.player - 1].toString(16).padStart(6,"0");
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

  /** Static terrain is rasterized only when map geometry/paint changes. */
  private paintTerrain(size:number):void {
    this.terrainDirty=false;
    const canvas=this.terrainCanvas;canvas.width=canvas.height=PX;
    const ctx=canvas.getContext('2d')!, scale=PX/size;
    ctx.fillStyle=LAND;ctx.fillRect(0,0,PX,PX);
    const coverColors={meadow:'#64723d',straw:'#80764b',ochre:'#7b6238',sage:'#65715a',forest:'#465735'};
    for(const patch of this.landscape?.cover??[]) {
      ctx.fillStyle=coverColors[patch.palette??'meadow'];
      ctx.globalAlpha=Math.min(.85,patch.density*.35);
      ctx.beginPath();ctx.arc(patch.x*scale,patch.z*scale,patch.radius*scale,0,Math.PI*2);ctx.fill();
    }
    const colors={grass:'#64703e',sand:'#978252',mud:'#61513b',rock:'#727671',snow:'#b5b9b1'};
    for(const stroke of this.landscape?.strokes??[]) {
      ctx.fillStyle=colors[stroke.layer];ctx.globalAlpha=stroke.opacity;
      // Fill one unioned path so overlapping samples don't amplify opacity.
      ctx.beginPath();
      for(const p of sampleCurve(stroke.points,stroke.radius,Math.max(.5,size/PX))) {
        ctx.moveTo((p.x+p.radius)*scale,p.z*scale);ctx.arc(p.x*scale,p.z*scale,p.radius*scale,0,Math.PI*2);
      }
      ctx.fill();
    }
    ctx.globalAlpha=1;
    if(!this.height)return;
    const field=this.height,data=ctx.getImageData(0,0,PX,PX);
    for(let py=0;py<PX;py++)for(let px=0;px<PX;px++) {
      const x=(px+.5)/scale,z=(py+.5)/scale,y=field.sample(x,z),i=(py*PX+px)*4;
      if(y<field.waterLevel){data.data[i]=64;data.data[i+1]=94;data.data[i+2]=102;continue;}
      const dx=field.sample(x+1,z)-field.sample(x-1,z),dz=field.sample(x,z+1)-field.sample(x,z-1);
      const shade=clamp(1+(y-field.waterLevel)*.009-(dx+dz)*.07,.68,1.16);
      for(let c=0;c<3;c++)data.data[i+c]=data.data[i+c]!*shade;
    }
    ctx.putImageData(data,0,0);
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
    const size = this.height?.size ?? this.spec.size ?? MAP_SIZE;
    const [x, z] = ndcToWorld(ndcX, ndcY, size);
    const max = size - 0.01;
    this.spec.onLookAt(clamp(x, 0, max), clamp(z, 0, max));
  }
}

function tint(_id: string): string {
  return "#26351f";
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
