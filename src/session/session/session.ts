/**
 * One match: load map, subscribe widgets, tick renderer/input.
 * Lives inside `PlayScreen`. `stop()` tears down Pixi world + DOM widgets.
 */
import type { Application, Texture } from "pixi.js";
import { gridToWorld, type GridPos } from "../../shared";
import {
  MAPS,
  generateMap,
  mapViewFromGrid,
  allDecorations,
  type MapView,
  type MapDecoration,
} from "../../sim";
import { Renderer, loadLandscapeAtlas, loadDecorationSheets } from "../../render";
import type { DecorationSheets } from "../../render/decoration/decorationSheets";
import { Minimap, type HudState } from "../../ui";
import { MapInput } from "../input/mapInput";
import { fetchDumpedMap, type MapCatalogEntry } from "../maps/maps";

export type SessionHooks = {
  onHud(state: HudState): void;
  onLeave(): void;
};

export type SessionConfig = {
  mapId: string;
  catalog: readonly MapCatalogEntry[];
  hooks: SessionHooks;
};

/** Atlas + decoration sheets are shared across matches in one page load. */
let graphics: Promise<{ atlas: Texture | null; sheets: DecorationSheets | null }> | null = null;

function loadGraphics(): Promise<{ atlas: Texture | null; sheets: DecorationSheets | null }> {
  graphics ??= Promise.all([loadLandscapeAtlas(), loadDecorationSheets()]).then(([atlas, sheets]) => ({
    atlas,
    sheets,
  }));
  return graphics;
}

export class Session {
  readonly mapId: string;
  private renderer: Renderer | null = null;
  private view: MapView | null = null;
  private selected: GridPos | null = null;
  private minimap: Minimap | null = null;
  private input: MapInput | null = null;

  constructor(
    private readonly pixi: Application,
    private readonly overlay: HTMLElement,
    private readonly config: SessionConfig,
  ) {
    this.mapId = config.mapId;
  }

  async start(): Promise<void> {
    const renderer = new Renderer(this.pixi);
    this.renderer = renderer;
    const { atlas, sheets } = await loadGraphics();
    renderer.setAtlas(atlas);
    renderer.setSheets(sheets);

    // Widgets own their input; we only subscribe.
    this.minimap = new Minimap(this.overlay, {
      onLookAt: (x, y) => this.lookAt(x, y),
    });
    this.input = new MapInput(this.pixi.canvas, renderer.camera, {
      pick: (screen) => renderer.pick(screen),
      onHover: (pos) => this.setHover(pos),
      onSelect: (pos) => this.setSelect(pos),
      onCameraChanged: () => this.syncCamera(),
      onFit: () => this.fit(),
      onLeave: () => this.config.hooks.onLeave(),
    });

    const { grid, decorations } = await this.loadGrid(this.mapId);
    if (!this.renderer) return;
    this.view = mapViewFromGrid(grid);
    this.renderer.setView(this.view, decorations);
    this.minimap.setView(this.view);
    this.config.hooks.onHud({
      cursor: null,
      landscape: null,
      height: null,
      zoom: renderer.camera.zoom,
    });
  }

  tick(dtMs: number, nowMs: number): void {
    const renderer = this.renderer;
    if (!renderer) return;
    renderer.tick(nowMs);
    this.input?.tick(dtMs);
    if (this.view && this.minimap) {
      this.minimap.setCamera(renderer.camera, this.pixi.renderer.width, this.pixi.renderer.height);
    }
  }

  stop(): void {
    this.input?.destroy();
    this.minimap?.destroy();
    this.renderer?.destroy();
    this.input = null;
    this.minimap = null;
    this.renderer = null;
    this.view = null;
  }

  /** Minimap click → center camera on that grid cell. */
  private lookAt(gx: number, gy: number): void {
    const view = this.view;
    const renderer = this.renderer;
    if (!view || !renderer) return;
    const x = Math.min(Math.max(gx, 0), Math.max(0, view.width - 1));
    const y = Math.min(Math.max(gy, 0), Math.max(0, view.height - 1));
    const world = gridToWorld(x, y);
    renderer.camera.lookAt(world.x, world.y, this.pixi.renderer.width, this.pixi.renderer.height);
    this.syncCamera();
  }

  private setHover(pos: GridPos | null): void {
    const renderer = this.renderer;
    const view = this.view;
    if (!renderer || !view) return;
    renderer.highlight(pos, "hover");
    this.config.hooks.onHud({
      cursor: pos,
      landscape: pos ? view.landscapeAt(pos.x, pos.y) : null,
      height: pos ? view.heightAt(pos.x, pos.y) : null,
      zoom: renderer.camera.zoom,
    });
  }

  private setSelect(pos: GridPos | null): void {
    if (!this.renderer) return;
    this.selected = pos;
    this.renderer.highlight(pos, "select");
  }

  private syncCamera(): void {
    const renderer = this.renderer;
    if (!renderer) return;
    renderer.applyCamera();
    renderer.highlight(this.selected, "select");
  }

  private fit(): void {
    if (!this.view || !this.renderer) return;
    this.renderer.setView(this.view);
    this.setSelect(null);
    this.renderer.highlight(null, "select");
  }

  /** Procedural `MAPS` first; otherwise a dumped JSON from `/maps`. */
  private async loadGrid(id: string): Promise<{ grid: ReturnType<typeof generateMap>; decorations: MapDecoration[] }> {
    const procedural = MAPS.find((m) => m.id === id);
    if (procedural) {
      const grid = generateMap(procedural);
      return { grid, decorations: allDecorations(mapViewFromGrid(grid)) };
    }
    const entry = this.config.catalog.find((m) => m.id === id);
    if (!entry) throw new Error(`unknown map ${id}`);
    const dumped = await fetchDumpedMap(entry.file);
    return {
      grid: dumped.grid,
      decorations: allDecorations(mapViewFromGrid(dumped.grid), dumped.decorations),
    };
  }
}
