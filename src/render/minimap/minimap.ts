import {terrainPixel,sceneryKind} from './terrainStyle';
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

const PX = 384;
const LAND = "#7b7751";
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
  private stamps: readonly MapStamp[]=[];
  private sceneryDirty=true;
  private readonly sceneryCanvas=document.createElement("canvas");
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
      onOrder?: (x:number,z:number,right:boolean,shift:boolean)=>boolean;
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
      if(e.button!==0&&e.button!==2)return;
      const point=this.point(e);if(point&&this.spec.onOrder?.(point[0],point[1],e.button===2,e.shiftKey)){e.preventDefault();return;}
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
    this.canvas.addEventListener("contextmenu",this.contextMenu);
    this.canvas.addEventListener("pointerdown", this.onDown);
    this.canvas.addEventListener("pointermove", this.onMove);
    this.canvas.addEventListener("pointerup", this.onUp);
    this.canvas.addEventListener("pointercancel", this.onUp);
    this.paint();
  }

  mountGame(host: HTMLElement, clockHost: HTMLElement): void {
    this.root.className = "";
    this.root.style.cssText =
      "position:relative;width:100%;height:100%;pointer-events:auto;overflow:hidden;background:#080c07";
    host.append(this.root);
    clockHost.append(this.clock.root);
    this.clock.root.style.left = "0";
  }

  setStamps(stamps: readonly MapStamp[]): void {
    if(this.stamps===stamps)return;
    this.stamps=stamps;
    this.sceneryDirty=this.dirty=true;
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
    if(this.sceneryDirty)this.paintScenery(size);
    ctx.drawImage(this.sceneryCanvas,0,0,w,h);
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
    ctx.strokeStyle="#10150ecc";ctx.lineWidth=3;ctx.stroke();
    ctx.strokeStyle = VIEW;
    ctx.lineWidth = 1.4;
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
    this.terrainDirty=false;this.sceneryDirty=true;
    const canvas=this.terrainCanvas;canvas.width=canvas.height=PX;
    const ctx=canvas.getContext('2d')!, scale=PX/size;
    ctx.fillStyle=LAND;ctx.fillRect(0,0,PX,PX);
    const coverColors={meadow:'#64723d',straw:'#80764b',ochre:'#7b6238',sage:'#65715a',forest:'#465735'};
    for(const patch of this.landscape?.cover??[]) {
      const radius=Math.max(1,patch.radius*scale);
      const gradient=ctx.createRadialGradient(patch.x*scale,patch.z*scale,0,patch.x*scale,patch.z*scale,radius);
      gradient.addColorStop(0,coverColors[patch.palette??'meadow']);gradient.addColorStop(.6,coverColors[patch.palette??'meadow']);gradient.addColorStop(1,'transparent');ctx.fillStyle=gradient;
      ctx.globalAlpha=Math.min(.85,patch.density*.35);
      ctx.beginPath();ctx.arc(patch.x*scale,patch.z*scale,patch.radius*scale,0,Math.PI*2);ctx.fill();
    }
    const colors={road:'#b59b6a',grass:'#788352',sand:'#ada578',mud:'#635947',rock:'#81857b',snow:'#c6cbbc'};
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
    const field=this.height,data=ctx.getImageData(0,0,PX,PX);
    for(let py=0;py<PX;py++)for(let px=0;px<PX;px++) {
      const x=(px+.5)/scale,z=(py+.5)/scale,y=field?.sample(x,z)??1,i=(py*PX+px)*4;
      const dx=field?field.sample(x+1,z)-field.sample(x-1,z):0,dz=field?field.sample(x,z+1)-field.sample(x,z-1):0;
      const color=terrainPixel([data.data[i],data.data[i+1],data.data[i+2]],y,field?.waterLevel??0,dx,dz,px,py);
      for(let c=0;c<3;c++)data.data[i+c]=color[c];
    }
    ctx.putImageData(data,0,0);
  }

  /** Tree silhouettes are cached separately so chopping a tree never re-rasterizes elevation. */
  private paintScenery(size:number):void{
    this.sceneryDirty=false;
    const canvas=this.sceneryCanvas;canvas.width=canvas.height=PX;
    const ctx=canvas.getContext('2d')!,scale=PX/size;
    ctx.drawImage(this.terrainCanvas,0,0);
    const stamps=this.stamps.filter(s=>sceneryKind(s.asset)).slice().sort((a,b)=>a.y-b.y);
    for(const s of stamps){
      const kind=sceneryKind(s.asset),x=(s.x+.5)*scale,y=(s.y+.5)*scale;
      const radius=Math.max(.8,Math.min(5,(s.scale??1)*(s.widthScale??1)*1.8*scale));
      if(kind==='tree'){
        ctx.fillStyle='#17251485';ctx.beginPath();ctx.ellipse(x+radius*.35,y+radius*.45,radius*1.15,radius*.8,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=s.variant==='gold'?'#796e30':s.variant==='red'?'#774a2a':'#344c2a';ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=s.variant==='gold'?'#9a9146':'#687a40';ctx.beginPath();ctx.ellipse(x-radius*.22,y-radius*.22,radius*.57,radius*.65,-.3,0,Math.PI*2);ctx.fill();
      }else{
        ctx.fillStyle='#363e3480';ctx.fillRect(x-radius,y-radius*.5,radius*2.3,radius*1.8);
        ctx.fillStyle='#999b80';ctx.beginPath();ctx.moveTo(x-radius,y);ctx.lineTo(x-radius*.5,y-radius);ctx.lineTo(x+radius*.7,y-radius*.7);ctx.lineTo(x+radius,y+radius*.55);ctx.lineTo(x,y+radius*.75);ctx.closePath();ctx.fill();
      }
    }
    const vignette=ctx.createRadialGradient(PX/2,PX/2,PX*.3,PX/2,PX/2,PX*.72);
    vignette.addColorStop(0,'transparent');vignette.addColorStop(1,'#14201955');ctx.fillStyle=vignette;ctx.fillRect(0,0,PX,PX);
  }

  destroy(): void {
    this.canvas.removeEventListener("contextmenu",this.contextMenu);
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

  private contextMenu=(e:Event)=>e.preventDefault();
  private scrub(e:PointerEvent):void {const p=this.point(e);if(p)this.spec.onLookAt(p[0],p[1]);}
  private point(e: PointerEvent): [number,number]|null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((e.clientY - rect.top) / rect.height) * 2;
    const size = this.height?.size ?? this.spec.size ?? MAP_SIZE;
    const [x, z] = ndcToWorld(ndcX, ndcY, size);
    const max = size - 0.01;
    return [clamp(x, 0, max), clamp(z, 0, max)];
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
