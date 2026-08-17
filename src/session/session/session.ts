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
  waveDecorations,
  World,
  ObjectGrid,
  scatterTrees,
  seedRng,
  startForPlayer,
  placeColony,
  type MapView,
  type MapDecoration,
  type MapStart,
  type BuildingKind,
} from "../../sim";
import { Renderer, loadLandscapeAtlas, loadDecorationSheets, loadBuildingSheets, loadSettlerSheets } from "../../render";
import type { BuildingSheets } from "../../render/building/buildingSheets";
import type { DecorationSheets } from "../../render/decoration/decorationSheets";
import type { SettlerSheets } from "../../render/settler/settlerSheets";
import { Minimap, SpeedControl, BuildMenu, type GameSpeed, type HudState } from "../../ui";
import { MapInput } from "../input/mapInput";
import { fetchDumpedMap, type MapCatalogEntry } from "../maps/maps";

export type SessionHooks = {
  onHud(state: HudState): void;
  onLeave(): void;
};

export type SessionConfig = {
  mapId: string;
  catalog: readonly MapCatalogEntry[];
  player: number;
  hooks: SessionHooks;
};

/** Atlas + decoration + building + settler sheets are shared across matches in one page load. */
let graphics: Promise<{
  atlas: Texture | null;
  sheets: DecorationSheets | null;
  buildings: BuildingSheets | null;
  settlers: SettlerSheets | null;
}> | null = null;

function loadGraphics(): Promise<{
  atlas: Texture | null;
  sheets: DecorationSheets | null;
  buildings: BuildingSheets | null;
  settlers: SettlerSheets | null;
}> {
  graphics ??= Promise.all([
    loadLandscapeAtlas(),
    loadDecorationSheets(),
    loadBuildingSheets(),
    loadSettlerSheets(),
  ]).then(([atlas, sheets, buildings, settlers]) => ({ atlas, sheets, buildings, settlers }));
  return graphics;
}

export class Session {
  readonly mapId: string;
  private renderer: Renderer | null = null;
  private world: World | null = null;
  private view: MapView | null = null;
  private selected: GridPos | null = null;
  private minimap: Minimap | null = null;
  private speedControl: SpeedControl | null = null;
  private buildMenu: BuildMenu | null = null;
  private input: MapInput | null = null;
  private acc = 0;
  private speed: GameSpeed = 1;
  private buildKind: BuildingKind | null = null;

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
    const { atlas, sheets, buildings, settlers } = await loadGraphics();
    renderer.setAtlas(atlas);
    renderer.setSheets(sheets);
    renderer.setBuildingSheets(buildings);
    renderer.setSettlerSheets(settlers);

    // Widgets own their input; we only subscribe.
    this.minimap = new Minimap(this.overlay, {
      onLookAt: (x, y) => this.lookAt(x, y),
    });
    this.speedControl = new SpeedControl(this.overlay, {
      onSpeed: (speed) => {
        this.speed = speed;
      },
    });
    this.buildMenu = new BuildMenu(this.overlay, {
      onKind: (kind) => {
        this.buildKind = kind;
      },
    });
    this.input = new MapInput(this.pixi.canvas, renderer.camera, {
      pick: (screen) => renderer.pick(screen),
      onHover: (pos) => this.setHover(pos),
      onSelect: (pos, shift) => this.setSelect(pos, shift),
      onCameraChanged: () => this.syncCamera(),
      onFit: () => this.fit(),
      onLeave: () => this.config.hooks.onLeave(),
    });

    const { grid, objects, waves, starts } = await this.loadGrid(this.mapId);
    if (!this.renderer) return;
    const world = new World(grid, objects);
    this.world = world;
    const start = startForPlayer(starts, 0) ?? { x: (grid.width / 2) | 0, y: (grid.height / 2) | 0 };
    placeColony(world, start, this.config.player);
    this.view = mapViewFromGrid(grid);
    this.renderer.setView(this.view, waves, false);
    this.minimap.setView(this.view);
    // Native 1× on the first HQ. Space still fits the whole map.
    this.renderer.camera.zoom = 1;
    this.lookAt(start.x, start.y);
    this.renderer.draw(world.view(), 0);
    this.config.hooks.onHud({
      cursor: null,
      landscape: null,
      height: null,
      zoom: renderer.camera.zoom,
    });
  }

  tick(dtMs: number, nowMs: number): void {
    const renderer = this.renderer;
    const world = this.world;
    if (!renderer || !world) return;
    this.acc += dtMs * this.speed;
    const step = world.clock.tickMs;
    // 8 ticks/frame at 1×, scaled so 8× can still catch a hitch without spiraling.
    const cap = 8 * this.speed;
    let n = 0;
    while (this.acc >= step && n < cap) {
      this.acc -= step;
      world.tick();
      n++;
    }
    if (n >= cap) this.acc = 0;
    renderer.draw(world.view(), this.acc / step);
    renderer.tick(nowMs);
    this.input?.tick(dtMs);
    if (this.view && this.minimap) {
      this.minimap.setCamera(renderer.camera, this.pixi.renderer.width, this.pixi.renderer.height);
    }
  }

  stop(): void {
    this.input?.destroy();
    this.minimap?.destroy();
    this.speedControl?.destroy();
    this.buildMenu?.destroy();
    this.renderer?.destroy();
    this.input = null;
    this.minimap = null;
    this.speedControl = null;
    this.buildMenu = null;
    this.renderer = null;
    this.world = null;
    this.view = null;
    this.acc = 0;
  }

  /** Minimap click → center camera on that grid cell. */
  private lookAt(gx: number, gy: number): void {
    const view = this.view;
    const renderer = this.renderer;
    if (!view || !renderer) return;
    const x = Math.min(Math.max(gx, 0), Math.max(0, view.width - 1));
    const y = Math.min(Math.max(gy, 0), Math.max(0, view.height - 1));
    const world = gridToWorld(x, y, view.heightAt(x, y));
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

  private setSelect(pos: GridPos | null, _shift = false): void {
    if (!this.renderer || !this.world || !pos) return;
    const hut = this.world.buildings.at(pos.x, pos.y);
    if (hut) {
      this.selected = { x: hut.pos.x, y: hut.pos.y };
      this.renderer.highlight(this.selected, "select");
      return;
    }
    const kind = this.buildKind;
    if (!kind || !this.world.canPlaceBuilding(kind, pos)) return;
    this.selected = pos;
    this.renderer.highlight(pos, "select");
    this.world.dispatch({ type: "placeBuilding", kind, at: pos, player: this.config.player });
  }

  private syncCamera(): void {
    const renderer = this.renderer;
    if (!renderer) return;
    renderer.applyCamera();
    renderer.highlight(this.selected, "select");
  }

  private fit(): void {
    if (!this.view || !this.renderer) return;
    this.renderer.fitCamera();
    this.selected = null;
    this.renderer.highlight(null, "select");
  }

  /** Procedural `MAPS` first; otherwise a dumped JSON from `/maps`. */
  private async loadGrid(
    id: string,
  ): Promise<{
    grid: ReturnType<typeof generateMap>;
    objects: ObjectGrid;
    waves: MapDecoration[];
    starts: MapStart[];
  }> {
    const procedural = MAPS.find((m) => m.id === id);
    if (procedural) {
      const grid = generateMap(procedural);
      const objects = new ObjectGrid(grid.width, grid.height);
      scatterTrees(grid, objects, seedRng(procedural.seed));
      return { grid, objects, waves: waveDecorations(mapViewFromGrid(grid)), starts: [] };
    }
    const entry = this.config.catalog.find((m) => m.id === id);
    if (!entry) throw new Error(`unknown map ${id}`);
    const dumped = await fetchDumpedMap(entry.file);
    return {
      grid: dumped.grid,
      objects: dumped.objects,
      waves: waveDecorations(mapViewFromGrid(dumped.grid)),
      starts: dumped.starts,
    };
  }
}
