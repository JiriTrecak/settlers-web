/**
 * One match: load map, subscribe widgets, tick renderer/input.
 * Lives inside `PlayScreen`. `stop()` tears down Pixi world + DOM widgets.
 * Replay mode rebuilds World from the recorded log; Space is play/pause.
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
  mapStartCap,
  clampMatchPlayers,
  emptyTickTimings,
  isControllable,
  KIT_SWORDSMEN_ME,
  KIT_SWORDSMEN_THEM,
  type MapView,
  type MapDecoration,
  type MapStart,
  type ViewSnapshot,
  type BuildingKind,
} from "../../sim";
import { Renderer, loadLandscapeAtlas, loadDecorationSheets, loadBuildingSheets, loadSettlerSheets } from "../../render";
import type { BuildingSheets } from "../../render/building/buildingSheets";
import type { DecorationSheets } from "../../render/decoration/decorationSheets";
import type { SettlerSheets } from "../../render/settler/settlerSheets";
import { Minimap, SpeedControl, BuildMenu, ReplayTimeline, debugFrom, type GameSpeed, type HudState, type PlaceTool } from "../../ui";
import { MapInput } from "../input/mapInput";
import { tilesAround, type ScreenPt } from "../input/boxSelect";
import { fetchDumpedMap, type MapCatalogEntry } from "../maps/maps";
import { Opponent } from "../opponent/opponent";
import {
  DEFAULT_WORLD_SEED,
  makeReplayFile,
  replayPlayers,
  type ReplayFile,
} from "../replay/replay";

export type SessionHooks = {
  onHud(state: HudState): void;
  onClaiming?(on: boolean): void;
  /** Live match: first Victory/Defeat. Not called in watch mode. */
  onReplay?(file: ReplayFile): void;
};

export type SessionConfig = {
  mapId: string;
  catalog: readonly MapCatalogEntry[];
  /** Local slot (lobby clothing + view). Clamped to 0..players-1 when the match has 2+. */
  player: number;
  /** Colonies to stamp. Clamped to the dump's starts (and 8 tints). Default: 2 when the map allows. */
  players?: number;
  /** Watch this file instead of playing. No commands, no opponent script. */
  replay?: ReplayFile;
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
  private timeline: ReplayTimeline | null = null;
  private input: MapInput | null = null;
  private acc = 0;
  private speed: GameSpeed = 1;
  private paused = false;
  private recorded = false;
  private duration = 0;
  private worldSeed = DEFAULT_WORLD_SEED;
  private waves: MapDecoration[] = [];
  private pristine: { grid: ReturnType<typeof generateMap>; objects: ObjectGrid } | null = null;
  private placeTool: PlaceTool | null = null;
  private markKey = "";
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

  private get watching(): boolean {
    return this.config.replay != null;
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
    const watching = this.watching;
    if (!watching) {
      this.speedControl = new SpeedControl(this.overlay, {
        onSpeed: (speed) => {
          this.speed = speed;
        },
      });
      this.buildMenu = new BuildMenu(this.overlay, {
        onTool: (tool) => {
          this.placeTool = tool;
          if (tool && this.claiming) {
            this.claiming = false;
            this.renderer?.previewOccupy(null);
            this.config.hooks.onClaiming?.(false);
          }
          this.syncGhost();
        },
      });
    }
    this.input = new MapInput(this.pixi.canvas, renderer.camera, {
      pick: (screen) => renderer.pick(screen),
      onHover: (pos) => this.setHover(pos),
      onSelect: (pos, add, screen) => this.setSelect(pos, add, screen),
      onBox: (a, b) => this.boxSelect(a, b),
      onCommand: (pos, shift) => this.commandSelected(pos, shift),
      onCameraChanged: () => this.syncCamera(),
      onFit: () => this.fit(),
      onSpace: watching ? () => this.setPlaying(this.paused) : undefined,
      onEscape: () => this.deselect(),
      onDelete: () => this.deleteSelected(),
      onConvert: () => this.convertSelected(),
      onEnlist: () => this.enlistSelected(),
    });

    const { grid, objects, waves, starts } = await this.loadGrid(this.mapId);
    if (!this.renderer) return;
    this.waves = waves;
    const file = this.config.replay;
    this.worldSeed = file?.seed ?? DEFAULT_WORLD_SEED;
    const world = new World(grid, objects, seedRng(this.worldSeed));
    this.world = world;
    if (file) {
      this.pristine = { grid: grid.clone(), objects: objects.clone() };
      this.duration = file.duration;
      this.me = file.me;
      world.replay(file.log, 0);
      this.timeline = new ReplayTimeline(
        this.overlay,
        {
          onPlay: (playing) => this.setPlaying(playing),
          onSeek: (tick) => this.seek(tick),
          onSpeed: (speed) => {
            this.speed = speed;
            this.syncTimeline();
          },
          onPlayer: (player) => this.setViewPlayer(player),
        },
        { players: replayPlayers(file), player: this.me },
      );
    } else {
      const listed = this.config.catalog.find((m) => m.id === this.mapId)?.players ?? 1;
      const cap = mapStartCap(starts.length, listed);
      const n = clampMatchPlayers(this.config.players ?? (cap >= 2 ? 2 : 1), cap);
      const slots = matchStarts(starts, n, grid);
      this.me = n <= 1 ? this.config.player : Math.min(Math.max(0, this.config.player), n - 1);
      if (n <= 1) {
        world.dispatch({ type: "placeColony", at: slots[0]!, player: this.me, swordsmen: KIT_SWORDSMEN_ME });
      } else {
        for (let i = 0; i < n; i++) {
          world.dispatch({
            type: "placeColony",
            at: slots[i]!,
            player: i,
            swordsmen: i === this.me ? KIT_SWORDSMEN_ME : KIT_SWORDSMEN_THEM,
          });
        }
        for (let i = 0; i < n; i++) {
          if (i === this.me) continue;
          this.opponents.push(new Opponent(i, slots[i]!, slots[this.me]!));
        }
      }
    }
    this.view = mapViewFromGrid(world.grid);
    this.renderer.setView(this.view, waves, false);
    this.minimap.setView(this.view);
    // Native 1× on the local HQ. Space still fits the whole map (live); replay uses Space for pause.
    this.renderer.camera.zoom = 1;
    const look = this.startLook();
    this.lookAt(look.x, look.y);
    const snap = world.view(this.me);
    this.renderer.draw(snap, 0);
    this.syncMinimap(snap, false);
    this.syncTimeline();
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
    if (!this.paused) this.acc += dtMs * this.speed;
    const step = world.clock.tickMs;
    // 8 ticks/frame at 1×, scaled so 8× can still catch a hitch without spiraling.
    const cap = 8 * this.speed;
    const phases = emptyTickTimings();
    const tSim = performance.now();
    let n = 0;
    while (!this.paused && this.acc >= step && n < cap) {
      if (this.watching && world.clock.tickIndex >= this.duration) {
        this.paused = true;
        this.acc = 0;
        break;
      }
      this.acc -= step;
      world.tick(phases);
      if (!this.watching) {
        this.maybeRecord();
        for (const opp of this.opponents) {
          if (world.outcome || !world.hasHq(opp.player)) continue;
          opp.onTick(world);
        }
      }
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
    this.syncGhost();
    renderer.tick(nowMs);
    this.input?.tick(dtMs);
    const drawMs = performance.now() - tDraw;
    const tMini = performance.now();
    this.syncMinimap(snap);
    const miniMs = performance.now() - tMini;
    this.syncTimeline();
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
    if (this.world) this.syncMinimap(this.world.view(this.me), false);
  }

  /** Esc: drop the build ghost, then the claim tool, then the unit, then the hut highlight. */
  deselect(): void {
    if (this.placeTool) {
      this.placeTool = null;
      this.buildMenu?.setTool(null);
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
    if (!world || !this.canCommand()) return;
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
    if (!world || !this.canCommand()) return;
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
    if (!world || !this.selected || !this.canCommand()) return;
    const hut = world.buildings.at(this.selected.x, this.selected.y);
    if (!hut || hut.player !== this.me) return;
    world.enqueue({ type: "destroyBuilding", at: this.selected });
    this.selected = null;
    this.renderer?.highlight(null);
  }

  setClaiming(on: boolean): void {
    if (this.watching) return;
    this.claiming = on;
    if (on) {
      this.placeTool = null;
      this.buildMenu?.setTool(null);
    }
    this.syncGhost();
    this.renderer?.previewOccupy(on ? this.hover : null, this.me);
  }

  stop(): void {
    this.input?.destroy();
    this.minimap?.destroy();
    this.speedControl?.destroy();
    this.buildMenu?.destroy();
    this.timeline?.destroy();
    this.renderer?.destroy();
    this.input = null;
    this.minimap = null;
    this.speedControl = null;
    this.buildMenu = null;
    this.timeline = null;
    this.renderer = null;
    this.world = null;
    this.opponents.length = 0;
    this.pristine = null;
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
      outcome: this.hudOutcome(snap),
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
        tool: this.toolLabel(),
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
      if (this.canCommand() && pos) this.world.enqueue({ type: "occupy", at: pos, player: this.me });
      return;
    }
    const tool = this.placeTool;
    if (tool?.type === "unit" && pos && this.canCommand()) {
      this.world.enqueue({
        type: "spawnUnit",
        kind: tool.kind,
        at: pos,
        player: this.me,
        count: tool.count,
      });
      return;
    }
    if (tool?.type === "building" && pos && this.canCommand() && this.world.canPlaceBuilding(tool.kind, pos, this.me)) {
      this.selected = pos;
      this.selectedUnitIds = [];
      this.syncSelectionVisual();
      this.world.enqueue({ type: "placeBuilding", kind: tool.kind, at: pos, player: this.me });
      this.placeTool = null;
      this.buildMenu?.setTool(null);
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

  private endedForMe(): boolean {
    const o = this.world?.outcome;
    if (!o) return false;
    return o.winner === this.me || o.defeated.includes(this.me);
  }

  private canCommand(): boolean {
    return !this.watching && !this.endedForMe();
  }

  private hudOutcome(snap: ViewSnapshot): "victory" | "defeat" | null {
    const o = snap.outcome;
    if (!o) return null;
    if (o.winner === this.me) return "victory";
    if (o.defeated.includes(this.me)) return "defeat";
    return null;
  }

  /** RMB. Pioneers claim toward the tile; everyone else walks. Shift = forced. Group walk spreads onto nearby tiles. */
  private commandSelected(pos: GridPos | null, forced = false): void {
    const world = this.world;
    if (!world || !pos || this.selectedUnitIds.length === 0 || !this.canCommand()) return;
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

  /** Spiral around the click; keep the center, then every 2nd walkable so the blob isn't solid. */
  private spreadDests(center: GridPos, n: number): GridPos[] {
    const world = this.world;
    if (!world || n <= 0) return [];
    const out: GridPos[] = [];
    let skip = false;
    for (const t of tilesAround(center, Math.max(n * 32, 64))) {
      if (!world.canStand(t.x, t.y)) continue;
      if (out.length > 0) {
        skip = !skip;
        if (skip) continue;
      }
      out.push(t);
      if (out.length >= n) break;
    }
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

  private syncMinimap(snap: ViewSnapshot, camera = true): void {
    const mini = this.minimap;
    const renderer = this.renderer;
    if (!mini || !this.view) return;
    mini.setMarks(snap.land, snap.buildings, snap.movables);
    mini.setFog(this.showFog ? snap.fog : null);
    if (camera && renderer) mini.setCamera(renderer.camera, this.pixi.renderer.width, this.pixi.renderer.height);
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
    const tool = this.placeTool;
    const pos = this.hover;
    if (!renderer) return;
    if (this.claiming || tool?.type !== "building" || !world) {
      this.markKey = "";
      renderer.ghost(null, null, false);
      renderer.setConstructionMarks(null);
      return;
    }
    if (!pos || world.buildings.at(pos.x, pos.y)) renderer.ghost(null, null, false);
    else {
      renderer.ghost(tool.kind, pos, world.canPlaceBuilding(tool.kind, pos, this.me) && world.plotLevel(tool.kind, pos));
    }
    this.syncConstructionMarks();
  }

  /** Owned-land pip mesh. Rebuilds when land / terrain / objects / huts / tool change — not every pan. */
  private syncConstructionMarks(): void {
    const renderer = this.renderer;
    const world = this.world;
    const tool = this.placeTool;
    if (!renderer) return;
    if (this.claiming || tool?.type !== "building" || !world) {
      this.markKey = "";
      renderer.setConstructionMarks(null);
      return;
    }
    const key = `${tool.kind}:${world.land.generation}:${world.grid.revision}:${world.objects.revision}:${world.buildings.revision}`;
    if (key === this.markKey) return;
    this.markKey = key;
    const marks = world.constructionMarks(tool.kind, this.me) ?? this.viewportMarks(tool.kind);
    renderer.setConstructionMarks(marks);
  }

  /** No occupy disk yet — scan the screen AABB instead of the whole map. */
  private viewportMarks(kind: BuildingKind): { x: number; y: number; value: number }[] {
    const renderer = this.renderer;
    const world = this.world;
    if (!renderer || !world) return [];
    const vis = renderer.visibleGrid(4);
    if (!vis) return [];
    const marks: { x: number; y: number; value: number }[] = [];
    for (let y = vis.y0; y <= vis.y1; y += vis.stride) {
      for (let x = vis.x0; x <= vis.x1; x += vis.stride) {
        const value = world.constructionMark(kind, { x, y }, this.me);
        if (value == null) continue;
        marks.push({ x, y, value });
      }
    }
    return marks;
  }

  private toolLabel(): string | null {
    const tool = this.placeTool;
    if (!tool) return null;
    if (tool.type === "building") return tool.kind;
    return tool.count === 1 ? "swordsman" : `swordsman×${tool.count}`;
  }

  private startLook(): GridPos {
    const file = this.config.replay;
    if (file) {
      for (const e of file.log) {
        if (e.action.type === "placeColony" && (e.action.player ?? e.player) === this.me) return e.action.at;
      }
    }
    const huts = this.world?.buildings.all() ?? [];
    const hq = huts.find((b) => b.player === this.me && b.hq) ?? huts.find((b) => b.player === this.me);
    return hq?.pos ?? { x: 0, y: 0 };
  }

  private setPlaying(playing: boolean): void {
    if (!this.watching) return;
    const world = this.world;
    if (playing && world && world.clock.tickIndex >= this.duration) this.seek(0, false);
    this.paused = !playing;
    this.syncTimeline();
  }

  /** Jump to a beat. Backward rebuilds from the dump clone; forward ticks. Scrub pauses. */
  private seek(tick: number, pause = true): void {
    const world = this.world;
    const file = this.config.replay;
    const pristine = this.pristine;
    const renderer = this.renderer;
    if (!world || !file || !pristine || !renderer) return;
    const to = Math.min(this.duration, Math.max(0, tick | 0));
    if (pause) this.paused = true;
    this.acc = 0;
    if (to < world.clock.tickIndex) {
      const next = new World(pristine.grid.clone(), pristine.objects.clone(), seedRng(this.worldSeed));
      next.replay(file.log, to);
      this.world = next;
      this.view = mapViewFromGrid(next.grid);
      renderer.setView(this.view, this.waves, false);
      this.minimap?.setView(this.view);
    } else {
      while (world.clock.tickIndex < to) world.tick();
    }
    this.syncTimeline();
    this.paintNow();
  }

  /** Fog, HUD, selection — everything that keys off the local slot. */
  private setViewPlayer(player: number): void {
    if (!this.watching || player === this.me) return;
    this.me = player;
    this.selected = null;
    this.selectedUnitIds = [];
    this.syncSelectionVisual();
    this.syncTimeline();
    const look = this.startLook();
    this.lookAt(look.x, look.y);
    this.paintNow();
  }

  private paintNow(): void {
    const renderer = this.renderer;
    const world = this.world;
    if (!renderer || !world) return;
    const snap = world.view(this.me);
    renderer.setSelected(this.selectedUnitIds);
    renderer.draw(snap, 0);
    this.paintHutSelect();
    this.syncMinimap(snap);
    this.pushHud(snap, 16.67, 0, false, {
      simMs: 0,
      snapMs: 0,
      drawMs: 0,
      miniMs: 0,
      phases: emptyTickTimings(),
    });
  }

  private syncTimeline(): void {
    const world = this.world;
    if (!this.timeline || !world) return;
    this.timeline.setPlayback(world.clock.tickIndex, this.duration, !this.paused, this.speed, this.me);
  }

  private maybeRecord(): void {
    if (this.watching || this.recorded) return;
    const world = this.world;
    if (!world?.outcome) return;
    this.recorded = true;
    this.config.hooks.onReplay?.(
      makeReplayFile({
        mapId: this.mapId,
        mapName: this.mapLabel(),
        seed: this.worldSeed,
        me: this.me,
        world,
      }),
    );
  }

  /** Mid-match snapshot. Same log a Victory save would have, cut at this tick. */
  saveReplay(): void {
    if (this.watching || !this.world) return;
    this.config.hooks.onReplay?.(
      makeReplayFile({
        mapId: this.mapId,
        mapName: this.mapLabel(),
        seed: this.worldSeed,
        me: this.me,
        world: this.world,
      }),
    );
  }

  private mapLabel(): string {
    return (
      this.config.catalog.find((m) => m.id === this.mapId)?.name ??
      MAPS.find((m) => m.id === this.mapId)?.name ??
      this.mapId
    );
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
