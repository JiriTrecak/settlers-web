/**
 * Authored map view. Same Renderer as play. No Session, no lockstep, no World.tick.
 */
import { DEFAULT_MAP_NAME, emptyUtcMap, inStamp, MAP_SIZE, type GridMode, type UtcMap } from "../../shared";
import { MapInput, Minimap, Renderer } from "../../render";
import { BrushMask } from "../brush/brush";
import { BrushKit } from "../brush/kit";
import { scatterBrush } from "../brush/scatter";

export class WorldEditor {
  map: UtcMap = emptyUtcMap();
  tool: "stamp" | "brush" | null = "stamp";
  asset: string | null = null;
  gridMenu = false;
  gridMode: GridMode = "tiles";
  gameCam = false;
  readonly brush = new BrushMask();
  readonly kit = new BrushKit();
  private urls = new Map<string, string>();
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
    },
  ) {}

  replace(map: UtcMap): void {
    this.map = map;
    this.paint();
    this.hooks.onChange?.();
  }

  rename(name: string): void {
    const next = name.trim() || DEFAULT_MAP_NAME;
    if (next === this.map.name) return;
    this.map = { ...this.map, name: next };
    this.hooks.onChange?.();
  }

  setLibrary(urls: ReadonlyMap<string, string>): void {
    this.urls = new Map(urls);
    this.renderer?.setAssets(this.urls);
    this.paint();
  }

  setTool(tool: "stamp" | "brush" | null): void {
    this.tool = tool;
    if (tool === "brush") this.gridMenu = false;
    this.renderer?.brush.setOpen(tool === "brush");
    this.syncBrushView();
  }

  setAsset(id: string): void {
    this.asset = id;
    if (this.tool === null) this.tool = "stamp";
  }

  toggleGridMenu(): void {
    this.gridMenu = !this.gridMenu;
    if (this.gridMenu && this.tool === "brush") this.setTool("stamp");
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

  applyBrush(): void {
    if (!this.kit.slots.length) {
      this.hooks.onNeedAsset?.();
      return;
    }
    const poses = scatterBrush(this.brush, this.map.stamps, this.kit.slots);
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
    this.syncBrushView();
    this.paint();
    this.hooks.onChange?.();
    this.hooks.onBrush?.();
  }

  start(): void {
    const renderer = new Renderer(this.canvas, this.urls);
    this.renderer = renderer;
    renderer.camera.locked = false;
    renderer.camera.lookAt(MAP_SIZE / 2, MAP_SIZE / 2);
    if (this.gameCam) renderer.camera.setGame(true);
    this.input = new MapInput(this.canvas, renderer.camera, {
      orbit: true,
      onChanged: () => this.draw(),
      onClick: (x, y) => this.click(x, y),
      onHome: () => this.toggleGameCam(),
      paint: {
        on: () => this.tool === "brush",
        hover: (x, y) => this.hover(x, y),
        stroke: (x, y, erase) => this.stroke(x, y, erase),
        beginStroke: () => this.brush.beginStroke(),
        sizeBy: (steps) => {
          this.brush.sizeBy(steps);
          this.hooks.onBrush?.();
        },
        densityBy: (steps) => {
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
    renderer.brush.setOpen(this.tool === "brush");
    this.paint();
    this.syncBrushView();
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
    if (!hit) {
      this.renderer?.brush.setCursor(0, 0, this.brush.radius, false);
      return;
    }
    this.renderer?.brush.setCursor(hit.x, hit.z, this.brush.radius, true);
  }

  private stroke(clientX: number, clientY: number, erase: boolean): void {
    const hit = this.renderer?.pickGround(clientX, clientY);
    if (!hit) return;
    this.brush.stroke(hit.x, hit.z, erase);
    this.renderer?.brush.setCursor(hit.x, hit.z, this.brush.radius, true);
    this.syncBrushView();
    this.hooks.onBrush?.();
  }

  private syncBrushView(): void {
    const layer = this.renderer?.brush;
    if (!layer) return;
    layer.sync(this.brush.weights, this.brush.origin, this.brush.span);
    layer.setOpen(this.tool === "brush");
    this.brush.dirty = false;
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
    this.map = {
      ...this.map,
      stamps: [...this.map.stamps, { id: crypto.randomUUID(), asset: this.asset, x, y }],
    };
    this.paint();
    this.hooks.onChange?.();
  }

  private paint(): void {
    this.renderer?.draw({ tick: 0, size: MAP_SIZE, players: [] }, this.map.stamps);
    this.mini?.setStamps(this.map.stamps);
    this.mini?.paint();
  }

  private draw(): void {
    this.renderer?.present();
    this.mini?.paint();
  }
}
