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
  type ViewSnapshot,
} from "../../sim";
import { Renderer, loadLandscapeAtlas, loadDecorationSheets, loadBuildingSheets, loadSettlerSheets } from "../../render";
import type { BuildingSheets } from "../../render/building/buildingSheets";
import type { DecorationSheets } from "../../render/decoration/decorationSheets";
import type { SettlerSheets } from "../../render/settler/settlerSheets";
import { Minimap, SpeedControl, BuildMenu, debugFrom, type GameSpeed, type HudState } from "../../ui";
import { MapInput } from "../input/mapInput";
import { fetchDumpedMap, type MapCatalogEntry } from "../maps/maps";

export type SessionHooks = {
  onHud(state: HudState): void;
  onClaiming?(on: boolean): void;
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
  private hover: GridPos | null = null;
  private fps = 60;
  private showPaths = false;
  private showOwnership = false;
  private showFog = true;
  private claiming = false;

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
    renderer.setShowPaths(this.showPaths);
    renderer.setShowOwnership(this.showOwnership);
    renderer.setShowFog(this.showFog);

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
        if (kind && this.claiming) {
          this.claiming = false;
          this.renderer?.previewOccupy(null);
          this.config.hooks.onClaiming?.(false);
        }
        this.syncGhost();
      },
    });
    this.input = new MapInput(this.pixi.canvas, renderer.camera, {
      pick: (screen) => renderer.pick(screen),
      onHover: (pos) => this.setHover(pos),
      onSelect: (pos, shift) => this.setSelect(pos, shift),
      onCameraChanged: () => this.syncCamera(),
      onFit: () => this.fit(),
      onEscape: () => this.deselect(),
      onDelete: () => this.deleteSelected(),
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
    const snap = world.view(this.config.player);
    this.renderer.draw(snap, 0);
    this.minimap.setFog(this.showFog ? snap.fog : null);
    this.pushHud(snap, 16.67, 0, false);
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
    const snap = world.view(this.config.player);
    renderer.draw(snap, this.acc / step);
    renderer.tick(nowMs);
    this.input?.tick(dtMs);
    this.pushHud(snap, dtMs, n, n >= cap);
    if (this.view && this.minimap) {
      this.minimap.setFog(this.showFog ? snap.fog : null);
      this.minimap.setCamera(renderer.camera, this.pixi.renderer.width, this.pixi.renderer.height);
    }
  }

  /** Debug overlay toggle. Sticky after F3 closes; renderer may not exist yet. */
  setShowPaths(on: boolean): void {
    this.showPaths = on;
    this.renderer?.setShowPaths(on);
  }

  setShowOwnership(on: boolean): void {
    this.showOwnership = on;
    this.renderer?.setShowOwnership(on);
    if (!on) this.renderer?.previewOccupy(null);
    else if (this.claiming) this.renderer?.previewOccupy(this.hover, this.config.player);
  }

  setShowFog(on: boolean): void {
    this.showFog = on;
    this.renderer?.setShowFog(on);
    const world = this.world;
    if (this.minimap && world) this.minimap.setFog(on ? world.view(this.config.player).fog : null);
  }

  /** Esc: drop the build ghost, then the claim tool, then the hut highlight. */
  deselect(): void {
    if (this.buildKind) {
      this.buildKind = null;
      this.buildMenu?.setKind(null);
      this.syncGhost();
      return;
    }
    if (this.claiming) {
      this.setClaiming(false);
      this.config.hooks.onClaiming?.(false);
      return;
    }
    if (this.selected) {
      this.selected = null;
      this.renderer?.highlight(null, "select");
    }
  }

  /** Delete / Backspace: remove the highlighted hut. Fog circle and occupy disk go with it. */
  deleteSelected(): void {
    const world = this.world;
    if (!world || !this.selected) return;
    if (!world.buildings.at(this.selected.x, this.selected.y)) return;
    world.dispatch({ type: "destroyBuilding", at: this.selected });
    this.selected = null;
    this.renderer?.highlight(null, "select");
  }

  setClaiming(on: boolean): void {
    this.claiming = on;
    if (on) {
      this.buildKind = null;
      this.buildMenu?.setKind(null);
    }
    this.syncGhost();
    this.renderer?.previewOccupy(on ? this.hover : null, this.config.player);
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
    this.hover = null;
    this.claiming = false;
  }

  private pushHud(snap: ViewSnapshot, dtMs: number, simPerFrame: number, simCapped: boolean): void {
    const renderer = this.renderer;
    const view = this.view;
    if (!renderer || !view) return;
    const dt = Math.max(1, Math.min(dtMs, 100));
    this.fps = this.fps * 0.9 + (1000 / dt) * 0.1;
    const pos = this.hover;
    this.config.hooks.onHud({
      cursor: pos,
      landscape: pos ? view.landscapeAt(pos.x, pos.y) : null,
      height: pos ? view.heightAt(pos.x, pos.y) : null,
      zoom: renderer.camera.zoom,
      debug: debugFrom(snap, {
        fps: this.fps,
        dtMs,
        speed: this.speed,
        simPerFrame,
        simCapped,
        accMs: this.acc,
        zoom: renderer.camera.zoom,
        mapW: view.width,
        mapH: view.height,
        tool: this.buildKind,
        selected: this.selected,
      }),
    });
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
    this.hover = pos;
    renderer.highlight(pos, "hover");
    this.syncGhost();
    if (this.claiming) renderer.previewOccupy(pos, this.config.player);
    this.config.hooks.onHud({
      cursor: pos,
      landscape: pos ? view.landscapeAt(pos.x, pos.y) : null,
      height: pos ? view.heightAt(pos.x, pos.y) : null,
      zoom: renderer.camera.zoom,
    });
  }

  private setSelect(pos: GridPos | null, _shift = false): void {
    if (!this.renderer || !this.world || !pos) return;
    if (this.claiming) {
      this.world.dispatch({ type: "occupy", at: pos, player: this.config.player });
      return;
    }
    const hut = this.world.buildings.at(pos.x, pos.y);
    if (hut) {
      this.selected = { x: hut.pos.x, y: hut.pos.y };
      this.renderer.highlight(this.selected, "select");
      this.syncGhost();
      return;
    }
    const kind = this.buildKind;
    if (!kind || !this.world.canPlaceBuilding(kind, pos, this.config.player)) return;
    this.selected = pos;
    this.renderer.highlight(pos, "select");
    this.world.dispatch({ type: "placeBuilding", kind, at: pos, player: this.config.player });
    this.buildKind = null;
    this.buildMenu?.setKind(null);
    this.syncGhost();
  }

  private syncCamera(): void {
    const renderer = this.renderer;
    if (!renderer) return;
    renderer.applyCamera();
    renderer.highlight(this.selected, "select");
    this.syncGhost();
  }

  private fit(): void {
    if (!this.view || !this.renderer) return;
    this.renderer.fitCamera();
    this.selected = null;
    this.renderer.highlight(null, "select");
    this.syncGhost();
  }

  private syncGhost(): void {
    const renderer = this.renderer;
    const world = this.world;
    const kind = this.buildKind;
    const pos = this.hover;
    if (!renderer) return;
    if (this.claiming || !kind || !pos || !world || world.buildings.at(pos.x, pos.y)) {
      renderer.ghost(null, null, false);
      return;
    }
    renderer.ghost(kind, pos, world.canPlaceBuilding(kind, pos, this.config.player));
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
