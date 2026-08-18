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
  matchStarts,
  emptyTickTimings,
  isControllable,
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
import { tilesAround, type ScreenPt } from "../input/boxSelect";
import { fetchDumpedMap, type MapCatalogEntry } from "../maps/maps";
import { Opponent } from "../opponent/opponent";

export type SessionHooks = {
  onHud(state: HudState): void;
  onClaiming?(on: boolean): void;
};

export type SessionConfig = {
  mapId: string;
  catalog: readonly MapCatalogEntry[];
  /** Local slot (lobby clothing + view). Clamped to 0..players-1 when the match has 2+. */
  player: number;
  /** Colonies to stamp. Default: 2 when the map has 2+ starts, else 1. */
  players?: number;
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
  private selectedUnitIds: number[] = [];
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
  private me: number;
  private readonly opponents: Opponent[] = [];

  constructor(
    private readonly pixi: Application,
    private readonly overlay: HTMLElement,
    private readonly config: SessionConfig,
  ) {
    this.mapId = config.mapId;
    this.me = config.player;
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
      onSelect: (pos, add, screen) => this.setSelect(pos, add, screen),
      onBox: (a, b) => this.boxSelect(a, b),
      onCommand: (pos, shift) => this.commandSelected(pos, shift),
      onCameraChanged: () => this.syncCamera(),
      onFit: () => this.fit(),
      onEscape: () => this.deselect(),
      onDelete: () => this.deleteSelected(),
      onConvert: () => this.convertSelected(),
      onEnlist: () => this.enlistSelected(),
    });

    const { grid, objects, waves, starts } = await this.loadGrid(this.mapId);
    if (!this.renderer) return;
    const world = new World(grid, objects);
    this.world = world;
    const n = this.config.players ?? (starts.length >= 2 ? 2 : 1);
    const slots = matchStarts(starts, n, grid);
    this.me = n <= 1 ? this.config.player : Math.min(Math.max(0, this.config.player), n - 1);
    if (n <= 1) {
      world.dispatch({ type: "placeColony", at: slots[0]!, player: this.me });
    } else {
      for (let i = 0; i < n; i++) world.dispatch({ type: "placeColony", at: slots[i]!, player: i });
      for (let i = 0; i < n; i++) {
        if (i === this.me) continue;
        this.opponents.push(new Opponent(i, slots[i]!, slots[this.me]!));
      }
    }
    this.view = mapViewFromGrid(grid);
    this.renderer.setView(this.view, waves, false);
    this.minimap.setView(this.view);
    // Native 1× on the local HQ. Space still fits the whole map.
    this.renderer.camera.zoom = 1;
    const look = n <= 1 ? slots[0]! : slots[this.me]!;
    this.lookAt(look.x, look.y);
    const snap = world.view(this.me);
    this.renderer.draw(snap, 0);
    this.minimap.setFog(this.showFog ? snap.fog : null);
    this.pushHud(snap, 16.67, 0, false, {
      simMs: 0,
      snapMs: 0,
      drawMs: 0,
      miniMs: 0,
      phases: emptyTickTimings(),
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
    const phases = emptyTickTimings();
    const tSim = performance.now();
    let n = 0;
    while (this.acc >= step && n < cap) {
      this.acc -= step;
      world.tick(phases);
      for (const opp of this.opponents) opp.onTick(world);
      n++;
    }
    const simMs = performance.now() - tSim;
    if (n >= cap) this.acc = 0;
    const tSnap = performance.now();
    const snap = world.view(this.me);
    const snapMs = performance.now() - tSnap;
    const tDraw = performance.now();
    this.pruneSelection();
    renderer.setSelected(this.selectedUnitIds);
    renderer.draw(snap, this.acc / step);
    this.paintHutSelect();
    renderer.tick(nowMs);
    this.input?.tick(dtMs);
    const drawMs = performance.now() - tDraw;
    const tMini = performance.now();
    if (this.view && this.minimap) {
      this.minimap.setFog(this.showFog ? snap.fog : null);
      this.minimap.setCamera(renderer.camera, this.pixi.renderer.width, this.pixi.renderer.height);
    }
    const miniMs = performance.now() - tMini;
    this.pushHud(snap, dtMs, n, n >= cap, { simMs, snapMs, drawMs, miniMs, phases });
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
    else if (this.claiming) this.renderer?.previewOccupy(this.hover, this.me);
  }

  setShowFog(on: boolean): void {
    this.showFog = on;
    this.renderer?.setShowFog(on);
    const world = this.world;
    if (this.minimap && world) this.minimap.setFog(on ? world.view(this.me).fog : null);
  }

  /** Esc: drop the build ghost, then the claim tool, then the unit, then the hut highlight. */
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
    if (this.selectedUnitIds.length > 0) {
      this.selectedUnitIds = [];
      this.syncSelectionVisual();
      return;
    }
    if (this.selected) {
      this.selected = null;
      this.renderer?.highlight(null);
    }
  }

  /** C: bearer → pioneer, or pioneer → bearer (own land, empty-handed). Every selected unit. */
  convertSelected(): void {
    const world = this.world;
    if (!world) return;
    for (const id of this.selectedUnitIds) {
      const unit = world.movable(id);
      if (!unit || unit.player !== this.me) continue;
      if (unit.type === "bearer") world.enqueue({ type: "convert", id: unit.id, to: "pioneer" });
      else if (unit.type === "pioneer") world.enqueue({ type: "convert", id: unit.id, to: "bearer" });
    }
  }

  /** X: empty-handed bearer → L1 swordsman. Barracks later. Every selected bearer. */
  enlistSelected(): void {
    const world = this.world;
    if (!world) return;
    for (const id of this.selectedUnitIds) {
      const unit = world.movable(id);
      if (!unit || unit.player !== this.me) continue;
      if (unit.type !== "bearer" || unit.material !== "none") continue;
      world.enqueue({ type: "convert", id: unit.id, to: "swordsman" });
    }
  }

  /** Delete / Backspace: remove the highlighted hut. Fog circle and occupy disk go with it. */
  deleteSelected(): void {
    const world = this.world;
    if (!world || !this.selected) return;
    if (!world.buildings.at(this.selected.x, this.selected.y)) return;
    world.enqueue({ type: "destroyBuilding", at: this.selected });
    this.selected = null;
    this.renderer?.highlight(null);
  }

  setClaiming(on: boolean): void {
    this.claiming = on;
    if (on) {
      this.buildKind = null;
      this.buildMenu?.setKind(null);
    }
    this.syncGhost();
    this.renderer?.previewOccupy(on ? this.hover : null, this.me);
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
    this.opponents.length = 0;
    this.view = null;
    this.acc = 0;
    this.hover = null;
    this.claiming = false;
    this.selectedUnitIds = [];
  }

  private pushHud(
    snap: ViewSnapshot,
    dtMs: number,
    simPerFrame: number,
    simCapped: boolean,
    cost: { simMs: number; snapMs: number; drawMs: number; miniMs: number; phases: ReturnType<typeof emptyTickTimings> },
  ): void {
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
        simMs: cost.simMs,
        snapMs: cost.snapMs,
        drawMs: cost.drawMs,
        miniMs: cost.miniMs,
        phases: cost.phases,
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
    this.syncGhost();
    if (this.claiming) renderer.previewOccupy(pos, this.me);
    this.config.hooks.onHud({
      cursor: pos,
      landscape: pos ? view.landscapeAt(pos.x, pos.y) : null,
      height: pos ? view.heightAt(pos.x, pos.y) : null,
      zoom: renderer.camera.zoom,
    });
  }

  private setSelect(pos: GridPos | null, add = false, screen?: ScreenPt): void {
    if (!this.renderer || !this.world) return;
    if (this.claiming) {
      if (pos) this.world.enqueue({ type: "occupy", at: pos, player: this.me });
      return;
    }
    const kind = this.buildKind;
    if (kind && pos && this.world.canPlaceBuilding(kind, pos, this.me)) {
      this.selected = pos;
      this.selectedUnitIds = [];
      this.syncSelectionVisual();
      this.world.enqueue({ type: "placeBuilding", kind, at: pos, player: this.me });
      this.buildKind = null;
      this.buildMenu?.setKind(null);
      this.syncGhost();
      return;
    }
    const hitId = screen ? this.renderer.pickUnit(screen) : null;
    const unit = hitId != null ? this.world.movable(hitId) : undefined;
    if (unit && unit.player === this.me && isControllable(unit.type)) {
      this.selected = null;
      if (add) {
        this.selectedUnitIds = this.selectedUnitIds.includes(unit.id)
          ? this.selectedUnitIds.filter((id) => id !== unit.id)
          : [...this.selectedUnitIds, unit.id];
      } else {
        this.selectedUnitIds = [unit.id];
      }
      this.syncSelectionVisual();
      this.syncGhost();
      return;
    }
    if (!pos) {
      if (add) return;
      this.selectedUnitIds = [];
      this.selected = null;
      this.syncSelectionVisual();
      return;
    }
    const hut = this.world.buildings.at(pos.x, pos.y);
    if (hut) {
      if (add) return;
      this.selectedUnitIds = [];
      this.selected = { x: hut.pos.x, y: hut.pos.y };
      this.syncSelectionVisual();
      this.syncGhost();
      return;
    }
    if (add) return;
    this.selectedUnitIds = [];
    this.selected = null;
    this.syncSelectionVisual();
  }

  private boxSelect(a: ScreenPt, b: ScreenPt): void {
    const world = this.world;
    const renderer = this.renderer;
    if (!world || !renderer) return;
    this.selected = null;
    this.selectedUnitIds = renderer.unitsInBox(a, b).filter((id) => {
      const u = world.movable(id);
      return !!u && u.player === this.me && isControllable(u.type);
    });
    this.syncSelectionVisual();
    this.syncGhost();
  }

  /** RMB. Pioneers claim toward the tile; everyone else walks. Shift = forced. Group walk spreads onto nearby tiles. */
  private commandSelected(pos: GridPos | null, forced = false): void {
    const world = this.world;
    if (!world || !pos || this.selectedUnitIds.length === 0) return;
    const walkers: number[] = [];
    for (const id of this.selectedUnitIds) {
      const unit = world.movable(id);
      if (!unit || unit.player !== this.me) continue;
      if (unit.type === "pioneer") world.enqueue({ type: "pioneerWork", id: unit.id, to: pos });
      else walkers.push(unit.id);
    }
    const dests = this.spreadDests(pos, walkers.length);
    for (let i = 0; i < walkers.length; i++) {
      world.enqueue({ type: "moveTo", id: walkers[i]!, to: dests[i] ?? pos, forced });
    }
  }

  private spreadDests(center: GridPos, n: number): GridPos[] {
    const world = this.world;
    if (!world || n <= 0) return [];
    const out: GridPos[] = [];
    for (const t of tilesAround(center, Math.max(n * 8, 16))) {
      if (!world.canStand(t.x, t.y)) continue;
      out.push(t);
      if (out.length >= n) break;
    }
    while (out.length < n) out.push(center);
    return out;
  }

  private pruneSelection(): void {
    const world = this.world;
    if (!world) {
      this.selectedUnitIds = [];
      return;
    }
    this.selectedUnitIds = this.selectedUnitIds.filter((id) => {
      const u = world.movable(id);
      return !!u && u.player === this.me && !u.inside && isControllable(u.type);
    });
  }

  private syncSelectionVisual(): void {
    this.renderer?.setSelected(this.selectedUnitIds);
    this.paintHutSelect();
  }

  private paintHutSelect(): void {
    const renderer = this.renderer;
    if (!renderer) return;
    if (this.selectedUnitIds.length > 0) renderer.highlight(null);
    else renderer.highlight(this.selected);
  }

  private syncCamera(): void {
    const renderer = this.renderer;
    if (!renderer) return;
    renderer.applyCamera();
    this.syncSelectionVisual();
    this.syncGhost();
  }

  private fit(): void {
    if (!this.view || !this.renderer) return;
    this.renderer.fitCamera();
    this.selected = null;
    this.selectedUnitIds = [];
    this.syncSelectionVisual();
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
    renderer.ghost(kind, pos, world.canPlaceBuilding(kind, pos, this.me) && world.plotLevel(kind, pos));
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
