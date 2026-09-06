/**
 * Authored map view. Same Renderer as play. No Session, no lockstep, no World.tick.
 */
import {
  DEFAULT_MAP_NAME,
  decodeHeight,
  emptyUtcMap,
  encodeHeight,
  HeightField,
  inStamp,
  MAP_SIZE,
  sitAllowed,
  type AssetType,
  type GridMode,
  type MapStamp,
  type UtcMap,
} from "../../shared";
import { MapInput, Minimap, Renderer } from "../../render";
import { BrushMask } from "../brush/brush";
import { BrushKit } from "../brush/kit";
import { scatterBrush } from "../brush/scatter";
import { CleanTool } from "../clean/clean";
import { nearestStamp, SelectTool, withPose, YAW_STEP } from "../select/select";
import { SculptTool, type SculptMode } from "../sculpt/sculpt";

export type EditorTool = "select" | "stamp" | "brush" | "clean" | "sculpt";

export class WorldEditor {
  map: UtcMap = emptyUtcMap();
  tool: EditorTool | null = "stamp";
  asset: string | null = null;
  stampYaw = 0;
  gridMenu = false;
  gridMode: GridMode = "tiles";
  gameCam = false;
  readonly brush = new BrushMask();
  readonly kit = new BrushKit();
  readonly clean = new CleanTool();
  readonly height = new HeightField();
  readonly sculpt = new SculptTool();
  readonly select = new SelectTool();
  private urls = new Map<string, string>();
  private kinds = new Map<string, AssetType>();
  private renderer: Renderer | null = null;
  private input: MapInput | null = null;
  private mini: Minimap | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly hooks: {
      host: HTMLElement;
      onChange?: () => void;
      onNeedAsset?: () => void;
      onView?: () => void;
      onBrush?: () => void;
      onClean?: () => void;
      onSculpt?: () => void;
      onSelect?: () => void;
    },
  ) {}

  replace(map: UtcMap): void {
    this.map = map;
    this.select.clear();
    this.loadHeight(map);
    this.renderer?.setTerrain(this.height);
    this.paint();
    this.hooks.onChange?.();
    this.hooks.onSelect?.();
  }

  rename(name: string): void {
    const next = name.trim() || DEFAULT_MAP_NAME;
    if (next === this.map.name) return;
    this.map = { ...this.map, name: next };
    this.hooks.onChange?.();
  }

  setLibrary(urls: ReadonlyMap<string, string>, kinds?: ReadonlyMap<string, AssetType>): void {
    this.urls = new Map(urls);
    if (kinds) this.kinds = new Map(kinds);
    this.renderer?.setAssets(this.urls);
    this.renderer?.setKinds(this.kinds);
    this.paint();
  }

  setTool(tool: EditorTool | null): void {
    this.tool = tool;
    if (tool !== "select") this.select.clear();
    if (tool === "brush" || tool === "clean" || tool === "sculpt") this.gridMenu = false;
    this.syncPaintView();
    this.paint();
    this.hooks.onSelect?.();
  }

  setAsset(id: string): void {
    this.asset = id;
    if (this.tool === null) this.tool = "stamp";
  }

  rotateStamp(steps = 1): void {
    if (this.tool === "select" && this.select.id) {
      this.nudgeSelected(steps * (Math.PI / 2));
      return;
    }
    this.stampYaw = ((Math.round(this.stampYaw / (Math.PI / 2)) + steps) % 4) * (Math.PI / 2);
  }

  nudgeSelected(delta: number): void {
    const stamp = this.selectedStamp();
    if (!stamp) return;
    this.applyPose(stamp, stamp.x, stamp.y, (stamp.yaw ?? 0) + delta);
  }

  setSelectedYaw(rad: number): void {
    const stamp = this.selectedStamp();
    if (!stamp) return;
    this.applyPose(stamp, stamp.x, stamp.y, rad);
  }

  deleteSelected(): void {
    const id = this.select.id;
    if (!id) return;
    this.map = { ...this.map, stamps: this.map.stamps.filter((s) => s.id !== id) };
    this.select.clear();
    this.paint();
    this.hooks.onChange?.();
    this.hooks.onSelect?.();
  }

  selectedStamp(): MapStamp | null {
    const id = this.select.id;
    return id ? (this.map.stamps.find((s) => s.id === id) ?? null) : null;
  }

  toggleGridMenu(): void {
    this.gridMenu = !this.gridMenu;
    if (this.gridMenu && (this.tool === "brush" || this.tool === "clean" || this.tool === "sculpt")) this.setTool("stamp");
  }

  setGridMode(mode: GridMode): void {
    this.gridMode = mode;
    if (mode === "none") this.gridMenu = false;
    this.renderer?.setGridMode(mode);
    this.draw();
  }

  toggleGameCam(): void {
    this.setGameCam(!this.gameCam);
  }

  setGameCam(on: boolean): void {
    this.gameCam = on;
    this.renderer?.camera.setGame(on);
    this.draw();
    this.hooks.onView?.();
  }

  setBrushRadius(n: number): void {
    this.brush.setRadius(n);
    this.hooks.onBrush?.();
  }

  setBrushDensity(n: number): void {
    this.brush.setDensity(n);
    this.hooks.onBrush?.();
  }

  setCleanRadius(n: number): void {
    this.clean.setRadius(n);
    this.hooks.onClean?.();
  }

  setCleanType(type: CleanTool["type"]): void {
    this.clean.setType(type);
    this.hooks.onClean?.();
  }

  setSculptRadius(n: number): void {
    this.sculpt.setRadius(n);
    this.hooks.onSculpt?.();
  }

  setSculptStrength(n: number): void {
    this.sculpt.setStrength(n);
    this.hooks.onSculpt?.();
  }

  setSculptMode(mode: SculptMode): void {
    this.sculpt.setMode(mode);
    this.syncPaintView();
    this.hooks.onSculpt?.();
  }

  applySculpt(): void {
    const dirty = this.sculpt.applyWater(this.height);
    if (!dirty) return;
    this.commitHeight();
    this.renderer?.setTerrain(this.height, dirty);
    this.mini?.setHeight(this.height);
    this.syncPaintView();
    this.paint();
    this.hooks.onChange?.();
    this.hooks.onSculpt?.();
  }

  applyBrush(): void {
    if (!this.kit.slots.length) {
      this.hooks.onNeedAsset?.();
      return;
    }
    const poses = scatterBrush(this.brush, this.map.stamps, this.kit.slots, Math.random, {
      wet: (x, z) => this.height.wet(x, z),
      kind: (id) => this.kinds.get(id),
    });
    if (!poses.length) return;
    this.map = {
      ...this.map,
      stamps: [
        ...this.map.stamps,
        ...poses.map((p) => ({
          id: crypto.randomUUID(),
          asset: p.asset,
          x: p.x,
          y: p.y,
          yaw: p.yaw,
          ...(p.scale !== 1 ? { scale: p.scale } : {}),
        })),
      ],
    };
    this.brush.clear();
    this.syncPaintView();
    this.paint();
    this.hooks.onChange?.();
    this.hooks.onBrush?.();
  }

  start(): void {
    const renderer = new Renderer(this.canvas, this.urls);
    this.renderer = renderer;
    renderer.setKinds(this.kinds);
    renderer.camera.locked = false;
    renderer.camera.lookAt(MAP_SIZE / 2, MAP_SIZE / 2);
    if (this.gameCam) renderer.camera.setGame(true);
    this.input = new MapInput(this.canvas, renderer.camera, {
      orbit: true,
      onChanged: () => this.draw(),
      onClick: (x, y) => this.click(x, y),
      onHome: () => this.toggleGameCam(),
      grab: {
        on: () => this.tool === "select",
        down: (x, y, shift) => this.grabDown(x, y, shift),
        move: (x, y) => this.grabMove(x, y),
        up: () => this.select.end(),
        rotateBy: (steps) => this.nudgeSelected(steps * YAW_STEP),
      },
      paint: {
        on: () => this.tool === "brush" || this.tool === "clean" || this.tool === "sculpt",
        hover: (x, y) => this.hover(x, y),
        stroke: (x, y, erase) => this.stroke(x, y, erase),
        beginStroke: () => {
          if (this.tool === "clean") this.clean.beginStroke();
          else if (this.tool === "sculpt") this.sculpt.beginStroke();
          else this.brush.beginStroke();
        },
        endStroke: () => this.endStroke(),
        sizeBy: (steps) => {
          if (this.tool === "clean") {
            this.clean.sizeBy(steps);
            this.hooks.onClean?.();
            return;
          }
          if (this.tool === "sculpt") {
            this.sculpt.sizeBy(steps);
            this.hooks.onSculpt?.();
            return;
          }
          this.brush.sizeBy(steps);
          this.hooks.onBrush?.();
        },
        densityBy: (steps) => {
          if (this.tool !== "brush") return;
          this.brush.densityBy(steps);
          this.hooks.onBrush?.();
        },
      },
    });
    this.mini = new Minimap(this.hooks.host, {
      camera: renderer.camera,
      viewport: () => ({ w: this.canvas.clientWidth, h: this.canvas.clientHeight }),
      onLookAt: (x, z) => {
        renderer.camera.lookAt(x, z);
        this.draw();
      },
    });
    renderer.setGridMode(this.gridMode);
    this.syncPaintView();
    renderer.setTerrain(this.height);
    this.paint();
    this.syncPaintView();
  }

  tick(dtMs: number): void {
    this.input?.tick(dtMs);
    this.draw();
  }

  stop(): void {
    this.input?.destroy();
    this.input = null;
    this.mini?.destroy();
    this.mini = null;
    this.renderer?.destroy();
    this.renderer = null;
  }

  private hover(clientX: number, clientY: number): void {
    const hit = this.renderer?.pickGround(clientX, clientY);
    const r = this.tool === "clean" ? this.clean.radius : this.tool === "sculpt" ? this.sculpt.radius : this.brush.radius;
    if (!hit) {
      this.renderer?.brush.setCursor(0, 0, r, false);
      return;
    }
    this.renderer?.brush.setCursor(hit.x, hit.z, r, true, hit.y);
  }

  private stroke(clientX: number, clientY: number, erase: boolean): void {
    const hit = this.renderer?.pickGround(clientX, clientY);
    if (!hit) return;
    if (this.tool === "sculpt") {
      this.renderer?.brush.setCursor(hit.x, hit.z, this.sculpt.radius, true, hit.y);
      const dirty = this.sculpt.stroke(hit.x, hit.z, erase, this.height);
      if (this.sculpt.mode === "water") {
        this.syncPaintView();
        this.hooks.onSculpt?.();
        return;
      }
      if (!dirty) return;
      this.renderer?.setTerrain(this.height, dirty, false);
      return;
    }
    if (this.tool === "clean") {
      this.renderer?.brush.setCursor(hit.x, hit.z, this.clean.radius, true, hit.y);
      const next = this.clean.stroke(hit.x, hit.z, this.map.stamps);
      if (!next) return;
      this.map = { ...this.map, stamps: next };
      this.paint();
      this.hooks.onChange?.();
      return;
    }
    this.brush.stroke(hit.x, hit.z, erase);
    this.renderer?.brush.setCursor(hit.x, hit.z, this.brush.radius, true, hit.y);
    this.syncPaintView();
    this.hooks.onBrush?.();
  }

  private endStroke(): void {
    if (this.tool !== "sculpt" || this.sculpt.mode !== "live") return;
    this.commitHeight();
    this.renderer?.setTerrain(this.height);
    this.mini?.setHeight(this.height);
    this.hooks.onChange?.();
  }

  private syncPaintView(): void {
    const layer = this.renderer?.brush;
    if (!layer) return;
    const water = this.tool === "sculpt" && this.sculpt.mode === "water";
    const foliage = this.tool === "brush";
    if (foliage) {
      layer.sync(this.brush.weights, this.brush.origin, this.brush.span);
      layer.setOpen(true);
      this.brush.dirty = false;
      return;
    }
    if (water) {
      layer.sync(this.sculpt.mask.weights, this.sculpt.mask.origin, this.sculpt.mask.span);
      layer.setOpen(true);
      this.sculpt.mask.dirty = false;
      return;
    }
    layer.setOpen(false);
  }

  private grabDown(clientX: number, clientY: number, rotate: boolean): boolean {
    const stamp = this.hitStamp(clientX, clientY);
    if (!stamp) {
      this.select.clear();
      this.paint();
      this.hooks.onSelect?.();
      return false;
    }
    const hit = this.renderer?.pickGround(clientX, clientY);
    if (!hit) return false;
    this.select.begin(stamp, hit, rotate);
    this.paint();
    this.hooks.onSelect?.();
    return true;
  }

  private grabMove(clientX: number, clientY: number): void {
    const stamp = this.selectedStamp();
    const hit = this.renderer?.pickGround(clientX, clientY);
    if (!stamp || !hit) return;
    const pose = this.select.drag(hit);
    if (!pose) return;
    this.applyPose(stamp, pose.x, pose.y, pose.yaw);
  }

  private hitStamp(clientX: number, clientY: number): MapStamp | null {
    const id = this.renderer?.pickStamp(clientX, clientY);
    if (id) return this.map.stamps.find((s) => s.id === id) ?? null;
    const hit = this.renderer?.pickGround(clientX, clientY);
    if (!hit) return null;
    return nearestStamp(this.map.stamps, hit.x, hit.z);
  }

  private applyPose(stamp: MapStamp, x: number, y: number, yaw: number): void {
    if (!sitAllowed(this.kinds.get(stamp.asset), this.height.wet(x + 0.5, y + 0.5))) return;
    const next = withPose(stamp, x, y, yaw);
    if (!next) return;
    this.map = { ...this.map, stamps: this.map.stamps.map((s) => (s.id === stamp.id ? next : s)) };
    this.paint();
    this.hooks.onChange?.();
    this.hooks.onSelect?.();
  }

  private click(clientX: number, clientY: number): void {
    if (this.tool !== "stamp") return;
    if (!this.asset) {
      this.hooks.onNeedAsset?.();
      return;
    }
    if (!this.renderer) return;
    const hit = this.renderer.pickGround(clientX, clientY);
    if (!hit) return;
    const x = Math.floor(hit.x);
    const y = Math.floor(hit.z);
    if (!inStamp(x, y)) return;
    if (!sitAllowed(this.kinds.get(this.asset), this.height.wet(hit.x, hit.z))) return;
    this.map = {
      ...this.map,
      stamps: [
        ...this.map.stamps,
        {
          id: crypto.randomUUID(),
          asset: this.asset,
          x,
          y,
          ...(this.stampYaw ? { yaw: this.stampYaw } : {}),
        },
      ],
    };
    this.paint();
    this.hooks.onChange?.();
  }

  private paint(): void {
    if (this.select.id && !this.map.stamps.some((s) => s.id === this.select.id)) this.select.clear();
    this.renderer?.setSelected(this.tool === "select" ? this.select.id : null);
    this.renderer?.draw({ tick: 0, size: MAP_SIZE, players: [] }, this.map.stamps);
    this.mini?.setHeight(this.height);
    this.mini?.setStamps(this.map.stamps);
    this.mini?.paint();
  }

  private loadHeight(map: UtcMap): void {
    const samples = map.height ? decodeHeight(map.height) : null;
    if (samples) this.height.load(samples, map.waterLevel ?? 0);
    else {
      this.height.clear();
      this.height.waterLevel = map.waterLevel ?? 0;
    }
  }

  private commitHeight(): void {
    const height = encodeHeight(this.height.samples);
    const waterLevel = this.height.waterLevel;
    this.map = {
      v: this.map.v,
      name: this.map.name,
      stamps: this.map.stamps,
      ...(waterLevel !== 0 ? { waterLevel } : {}),
      ...(height ? { height } : {}),
    };
  }

  private draw(): void {
    this.renderer?.present();
    this.mini?.paint();
  }
}
