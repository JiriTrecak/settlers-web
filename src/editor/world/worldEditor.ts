/**
 * Authored map view. Same Renderer as play. No Session, no lockstep, no World.tick.
 */
import { DEFAULT_MAP_NAME, emptyUtcMap, MAP_SIZE, type UtcMap } from "../../shared";
import { MapInput, Renderer } from "../../render";
import { catalog, catalogUrls } from "../assets/catalog";

export class WorldEditor {
  readonly assets = catalog;
  map: UtcMap = emptyUtcMap();
  tool: "stamp" | null = "stamp";
  asset: string | null = catalog[0]?.id ?? null;
  private renderer: Renderer | null = null;
  private input: MapInput | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly hooks: { onChange?: () => void } = {},
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

  setTool(tool: "stamp" | null): void {
    this.tool = tool;
  }

  setAsset(id: string): void {
    this.asset = id;
    this.tool = "stamp";
  }

  start(): void {
    const renderer = new Renderer(this.canvas, catalogUrls);
    this.renderer = renderer;
    renderer.camera.lookAt(MAP_SIZE / 2, MAP_SIZE / 2);
    this.input = new MapInput(this.canvas, renderer.camera, {
      onChanged: () => renderer.present(),
      onClick: (x, y) => this.click(x, y),
    });
    this.paint();
  }

  tick(dtMs: number): void {
    this.input?.tick(dtMs);
    this.renderer?.present();
  }

  stop(): void {
    this.input?.destroy();
    this.input = null;
    this.renderer?.destroy();
    this.renderer = null;
  }

  private click(clientX: number, clientY: number): void {
    if (this.tool !== "stamp" || !this.asset || !this.renderer) return;
    const hit = this.renderer.pickGround(clientX, clientY);
    if (!hit) return;
    const x = Math.floor(hit.x);
    const y = Math.floor(hit.z);
    if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) return;
    this.map = {
      ...this.map,
      stamps: [...this.map.stamps, { id: crypto.randomUUID(), asset: this.asset, x, y }],
    };
    this.paint();
    this.hooks.onChange?.();
  }

  private paint(): void {
    this.renderer?.draw({ tick: 0, size: MAP_SIZE, players: [] }, this.map.stamps);
  }
}
