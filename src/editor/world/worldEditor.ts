/**
 * Authored map view. Same Renderer as play. No Session, no lockstep, no World.tick.
 */
import { DEFAULT_MAP_NAME, emptyUtcMap, inStamp, MAP_SIZE, type GridMode, type UtcMap } from "../../shared";
import { MapInput, Minimap, Renderer } from "../../render";

export class WorldEditor {
  map: UtcMap = emptyUtcMap();
  tool: "stamp" | null = "stamp";
  asset: string | null = null;
  gridOn = true;
  gridMode: GridMode = "tiles";
  private urls = new Map<string, string>();
  private renderer: Renderer | null = null;
  private input: MapInput | null = null;
  private mini: Minimap | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly hooks: { host: HTMLElement; onChange?: () => void; onNeedAsset?: () => void },
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

  setTool(tool: "stamp" | null): void {
    this.tool = tool;
  }

  setAsset(id: string): void {
    this.asset = id;
    this.tool = "stamp";
  }

  toggleGrid(): void {
    this.gridOn = !this.gridOn;
    this.renderer?.setGrid(this.gridOn);
    this.draw();
  }

  setGridMode(mode: GridMode): void {
    this.gridMode = mode;
    this.renderer?.setGridMode(mode);
    this.draw();
  }

  resetView(): void {
    this.renderer?.camera.resetView();
    this.draw();
  }

  start(): void {
    const renderer = new Renderer(this.canvas, this.urls);
    this.renderer = renderer;
    renderer.camera.locked = false;
    renderer.camera.lookAt(MAP_SIZE / 2, MAP_SIZE / 2);
    this.input = new MapInput(this.canvas, renderer.camera, {
      orbit: true,
      onChanged: () => this.draw(),
      onClick: (x, y) => this.click(x, y),
    });
    this.mini = new Minimap(this.hooks.host, {
      camera: renderer.camera,
      aspect: () => this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight),
      onLookAt: (x, z) => {
        renderer.camera.lookAt(x, z);
        this.draw();
      },
    });
    renderer.setGrid(this.gridOn);
    renderer.setGridMode(this.gridMode);
    this.paint();
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
