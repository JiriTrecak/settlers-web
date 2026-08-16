import type { Application } from "pixi.js";
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
import { Hud, Minimap, type HudMapOption } from "../../ui";
import { MapInput } from "../input/mapInput";
import { fetchDumpedMap, fetchMapCatalog, type MapCatalogEntry } from "../maps/maps";

export class Session {
  private renderer: Renderer | null = null;
  private view: MapView | null = null;
  private mapId = "";
  private catalog: MapCatalogEntry[] = [];
  private loadGen = 0;
  private selected: GridPos | null = null;
  private hud: Hud | null = null;
  private minimap: Minimap | null = null;
  private input: MapInput | null = null;

  constructor(
    private readonly pixi: Application,
    private readonly hudRoot: HTMLElement,
  ) {}

  async start(): Promise<void> {
    const renderer = new Renderer(this.pixi);
    this.renderer = renderer;
    const [atlas, sheets] = await Promise.all([loadLandscapeAtlas(), loadDecorationSheets()]);
    renderer.setAtlas(atlas);
    renderer.setSheets(sheets);

    this.catalog = await fetchMapCatalog();
    this.hudRoot.replaceChildren();
    this.hud = new Hud(this.hudRoot, hudMaps(this.catalog), {
      onSelectMap: (id) => {
        void this.loadMap(id);
      },
    });
    this.minimap = new Minimap(this.hudRoot, {
      onLookAt: (x, y) => this.lookAt(x, y),
    });
    this.input = new MapInput(this.pixi.canvas, renderer.camera, {
      pick: (screen) => renderer.pick(screen),
      onHover: (pos) => this.setHover(pos),
      onSelect: (pos) => this.setSelect(pos),
      onCameraChanged: () => this.syncCamera(),
      onFit: () => this.fit(),
      onMapHotkey: (index) => {
        const id = this.hud?.mapIds[index];
        if (id) void this.loadMap(id);
      },
    });

    await this.loadMap(defaultMapId(this.catalog));
    this.hud.update({ cursor: null, landscape: null, height: null, zoom: renderer.camera.zoom });
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
    this.hud?.destroy();
    this.input = null;
    this.minimap = null;
    this.hud = null;
    this.renderer = null;
    this.view = null;
  }

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
    const hud = this.hud;
    if (!renderer || !view || !hud) return;
    renderer.highlight(pos, "hover");
    hud.update({
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

  private async loadMap(id: string): Promise<void> {
    if (!this.renderer) return;
    if (this.view && this.mapId === id) return;
    const gen = ++this.loadGen;
    this.hud?.setBusy(true);
    try {
      const { grid, decorations } = await this.loadGrid(id);
      if (gen !== this.loadGen || !this.renderer) return;
      this.mapId = id;
      this.view = mapViewFromGrid(grid);
      this.selected = null;
      this.renderer.setView(this.view, decorations);
      this.renderer.highlight(null, "select");
      this.renderer.highlight(null, "hover");
      this.minimap?.setView(this.view);
      this.hud?.setMap(id);
      this.hud?.update({
        cursor: null,
        landscape: null,
        height: null,
        zoom: this.renderer.camera.zoom,
      });
    } catch (err) {
      console.error(err);
      if (id !== MAPS[0].id) await this.loadMap(MAPS[0].id);
    } finally {
      if (gen === this.loadGen) this.hud?.setBusy(false);
    }
  }

  private async loadGrid(id: string): Promise<{ grid: ReturnType<typeof generateMap>; decorations: MapDecoration[] }> {
    const procedural = MAPS.find((m) => m.id === id);
    if (procedural) {
      const grid = generateMap(procedural);
      return { grid, decorations: allDecorations(mapViewFromGrid(grid)) };
    }
    const entry = this.catalog.find((m) => m.id === id);
    if (!entry) throw new Error(`unknown map ${id}`);
    const dumped = await fetchDumpedMap(entry.file);
    return {
      grid: dumped.grid,
      decorations: allDecorations(mapViewFromGrid(dumped.grid), dumped.decorations),
    };
  }
}

function hudMaps(catalog: readonly MapCatalogEntry[]): HudMapOption[] {
  return [
    ...catalog.map((m) => ({
      id: m.id,
      name: m.name,
      group: m.group,
      detail: `${m.size} · ${m.players}p`,
    })),
    ...MAPS.map((m) => ({
      id: m.id,
      name: m.name,
      group: "generated" as const,
      detail: String(m.size),
    })),
  ];
}

function defaultMapId(catalog: readonly MapCatalogEntry[]): string {
  return catalog.find((m) => m.group === "tutorial")?.id ?? catalog[0]?.id ?? MAPS[0].id;
}
