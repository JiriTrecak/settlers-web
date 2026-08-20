/**
 * One match: load map, subscribe widgets, tick renderer/input.
 * Lives inside `PlayScreen`. `stop()` tears down Pixi world + DOM widgets.
 * Replay mode rebuilds World from the recorded log; Space is play/pause.
 * Save mode restores a snapshot; F10 is save / load / restart / end.
 */
import type { Application, Texture } from "pixi.js";
import { gridToWorld, hexDist, localMatch, type Action, type GridPos, type MatchConfig } from "../../shared";
import { Lockstep, MemoryChannel, Room, type Channel } from "../../net";
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
  buildingDef,
  hasWorkArea,
  DEFAULT_BRICKLAYER_RATIO,
  DEFAULT_DIGGER_RATIO,
  diggerCap,
  workerCount,
  type MapView,
  type MapDecoration,
  type MapStart,
  type ViewSnapshot,
  type BuildingKind,
} from "../../sim";
import {
  Renderer,
  loadLandscapeAtlas,
  loadDecorationSheets,
  loadBuildingSheets,
  loadSettlerSheets,
  fetchCatalogSprites,
  loadAtlases,
  atlasPacksForCivs,
  LoadWatch,
  loadNote,
} from "../../render";
import type { BuildingSheets } from "../../render/building/buildingSheets";
import type { DecorationSheets } from "../../render/decoration/decorationSheets";
import type { SettlerSheets } from "../../render/settler/settlerSheets";
import { Minimap, SpeedControl, GameControlPanel, ReplayTimeline, PauseMenu, debugFrom, DEFAULT_GAME_SPEED, type GameSpeed, type HudState, type LoadView } from "../../ui";
import { CommandBoard } from "../command/board";
import { hutGoods } from "../command/goods";
import { ingestCatalogPaths, loadCatalogPaths } from "../command/catalog";
import type { BoardContext, CountPair, PlaceTool } from "../command/types";
import { MapInput } from "../input/mapInput";
import { tilesAround, type ScreenPt } from "../input/boxSelect";
import { fetchDumpedMap, type MapCatalogEntry } from "../maps/maps";
import { Opponent } from "../opponent/opponent";
import { capturePipeline, makeSaveFile, parseSaveFile, restoreWorld, saveInfo, savesForMode, type SaveFile } from "../save/save";
import type { SaveStore } from "../save/store";
import { PauseBoard, type PauseCommand } from "../pause/board";
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
  onSave?(file: SaveFile): void;
  onEnd?(): void;
  onRestart?(): void;
  onLoad?(file: SaveFile): void;
  /** Match-start overlay. Texture counts come from atlas pages + leftover loose PNGs. */
  onLoadProgress?(view: LoadView): void;
};

export type SessionConfig = {
  mapId: string;
  catalog: readonly MapCatalogEntry[];
  /** Local slot (lobby clothing + view). Clamped to 0..players-1 when the match has 2+. */
  player: number;
  /** Colonies to stamp. Clamped to the dump's starts (and 8 tints). Default: 2 when the map allows. */
  players?: number;
  /** Remote mailbox. App constructs this; Session never `new WebSocket`. */
  channel?: Channel;
  /** Frozen config from MatchHost `start`. Implies no local Opponent. */
  match?: MatchConfig;
  /** Watch this file instead of playing. No commands, no opponent script. */
  replay?: ReplayFile;
  /** Restore this snapshot instead of stamping kits. */
  save?: SaveFile;
  /** Local shelf. Pause menu lists these; `onSave` persists a new file. */
  saves?: SaveStore;
  /** Host seat (player 0). MP load/restart only fire from this client. */
  host?: boolean;
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
  graphics ??= (async () => {
    loadNote("catalog.json");
    const sprites = await fetchCatalogSprites();
    if (sprites) ingestCatalogPaths(sprites);
    else await loadCatalogPaths();
    loadNote("atlases");
    await loadAtlases(atlasPacksForCivs(["roman"]));
    const [atlas, sheets, buildings, settlers] = await Promise.all([
      loadLandscapeAtlas(),
      loadDecorationSheets(sprites),
      loadBuildingSheets(sprites),
      loadSettlerSheets(sprites),
    ]);
    return { atlas, sheets, buildings, settlers };
  })();
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
  private panel: GameControlPanel | null = null;
  private board: CommandBoard | null = null;
  private boardPaint = "";
  private timeline: ReplayTimeline | null = null;
  private pauseMenu: PauseMenu | null = null;
  private readonly pause = new PauseBoard();
  private menuPaused = false;
  private input: MapInput | null = null;
  private acc = 0;
  private speed: GameSpeed = DEFAULT_GAME_SPEED;
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
  private readonly channels: MemoryChannel[] = [];
  private readonly locksteps = new Map<number, Lockstep>();
  private room: Room | null = null;
  private match: MatchConfig | null = null;
  /** Local place clicks, drawn until the Room commit lands (or `until`). Not sim. */
  private readonly pendingPlans: { id: number; kind: BuildingKind; at: GridPos; until: number }[] = [];
  private nextPendingId = -1;
  /** Local work-area click, drawn until the commit lands. */
  private pendingWork: { at: GridPos; center: GridPos } | null = null;
  private desynced = false;
  private checksumEvery = 8;
  /** Wall-clock origin for MP confirms. Pixi rAF sleeps in an unfocused tab; this must not. */
  private matchStartMs = 0;
  private confirmTimer: ReturnType<typeof setInterval> | null = null;

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
    const watch = new LoadWatch((view) => this.config.hooks.onLoadProgress?.(view));
    await watch.run(async () => {
      await this.bootMatch(watch);
    });
  }

  private async bootMatch(watch: LoadWatch): Promise<void> {
    const renderer = new Renderer(this.pixi);
    this.renderer = renderer;
    watch.setStage("Graphics");
    const { atlas, sheets, buildings, settlers } = await loadGraphics();
    if (!this.renderer) return;
    renderer.setAtlas(atlas);
    renderer.setSheets(sheets);
    renderer.setBuildingSheets(buildings);
    renderer.setSettlerSheets(settlers);
    renderer.setShowPaths(this.showPaths);
    renderer.setShowOwnership(this.showOwnership);
    renderer.setShowFog(this.showFog);

    // Widgets own their input; we only subscribe.
    this.board = new CommandBoard({
      armPlace: (tool) => this.armPlace(tool),
      bumpDiggerRatio: (dir) => this.bumpDiggerRatio(dir),
      bumpBricklayerRatio: (dir) => this.bumpBricklayerRatio(dir),
      destroySelected: () => this.deleteSelected(),
      clearSelection: () => this.clearBoardSelection(),
    });
    this.panel = new GameControlPanel(this.overlay, {
      onCommand: (id) => {
        this.board?.invoke(id);
        this.syncBoard();
      },
    });
    this.minimap = new Minimap(this.panel.minimapHost, {
      onLookAt: (x, y) => this.lookAt(x, y),
    });
    const watching = this.watching;
    const remote = this.config.channel != null;
    if (!watching && !remote) {
      this.speedControl = new SpeedControl(this.overlay, {
        speed: this.speed,
        onSpeed: (speed) => {
          this.speed = speed;
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
      onGeologist: () => this.convertGeologistSelected(),
      onHotkey: (key) => {
        const hit = this.board?.key(key) ?? false;
        if (hit) this.syncBoard();
        return hit;
      },
    });
    if (!watching) this.bindPause();

    watch.setStage("Map", this.mapLabel());
    await watch.yield();
    const loaded = await this.loadGrid(this.mapId);
    if (!this.renderer) return;
    watch.setStage("World");
    await watch.yield();
    this.waves = loaded.waves;
    const file = this.config.replay;
    const save = this.config.save;
    this.worldSeed = file?.seed ?? save?.seed ?? this.config.match?.seed ?? DEFAULT_WORLD_SEED;
    let world: World;
    if (file) {
      world = new World(loaded.grid, loaded.objects, seedRng(this.worldSeed));
      this.world = world;
      this.pristine = { grid: loaded.grid.clone(), objects: loaded.objects.clone() };
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
    } else if (save) {
      const restored = restoreWorld(save);
      if (!restored) throw new Error("bad save");
      world = restored;
      this.world = world;
      this.waves = waveDecorations(mapViewFromGrid(world.grid));
      await this.beginLive(loaded.starts, loaded.grid, save);
    } else {
      world = new World(loaded.grid, loaded.objects, seedRng(this.worldSeed));
      this.world = world;
      this.beginLive(loaded.starts, loaded.grid);
    }
    this.view = mapViewFromGrid(world.grid);
    this.renderer.setView(this.view, this.waves, false);
    this.minimap.setView(this.view);
    // Native 1× on the local HQ. Space still fits the whole map (live); replay uses Space for pause.
    this.renderer.camera.zoom = 1;
    const look = this.startLook();
    this.lookAt(look.x, look.y);
    const snap = this.look(world);
    this.renderer.draw(snap, 0);
    this.syncMinimap(snap, false);
    this.syncTimeline();
    this.syncBoard();
    this.pushHud(snap, 16.67, 0, false, {
      simMs: 0,
      snapMs: 0,
      drawMs: 0,
      miniMs: 0,
      phases: emptyTickTimings(),
    });
  }

  /** Click → Lockstep. Envelope player is the producing slot. */
  private send(action: Action, player = this.me): void {
    this.locksteps.get(player)?.send(action);
  }

  /** Stamp kits or restore a save, then bind lockstep / opponents. */
  private beginLive(starts: MapStart[], grid: ReturnType<typeof generateMap>, save?: SaveFile): void {
    const world = this.world;
    if (!world) return;
    const listed = this.config.catalog.find((m) => m.id === this.mapId)?.players ?? 1;
    const cap = mapStartCap(starts.length, listed);
    const remoteMatch = this.config.match ?? save?.match;
    const n = remoteMatch
      ? remoteMatch.slots.length
      : clampMatchPlayers(this.config.players ?? (cap >= 2 ? 2 : 1), cap);
    const startsAt = matchStarts(starts, n, grid);
    this.me = remoteMatch
      ? this.config.player
      : n <= 1
        ? this.config.player
        : Math.min(Math.max(0, this.config.player), n - 1);
    const entry = this.config.catalog.find((m) => m.id === this.mapId);
    const mapRevision = entry?.file ?? this.mapId;
    if (remoteMatch && remoteMatch.mapRevision !== mapRevision && remoteMatch.mapRevision !== this.mapId) {
      throw new Error(`mapRevision ${remoteMatch.mapRevision} ≠ ${mapRevision}`);
    }
    const match =
      remoteMatch ??
      localMatch({
        mapId: this.mapId,
        mapRevision,
        seed: this.worldSeed,
        slotCount: n,
        me: this.me,
      });
    this.match = match;
    if (this.config.channel) {
      this.bindRemote(match, this.config.channel);
    } else {
      this.bindLockstep(match);
    }
    if (save) {
      this.installPipeline(save);
    } else {
      for (const slot of match.slots) {
        const at = n <= 1 ? startsAt[0]! : startsAt[slot.player]!;
        world.dispatch({ type: "placeColony", at, player: slot.player });
      }
    }
    if (!this.config.channel) {
      this.opponents.length = 0;
      for (const slot of match.slots) {
        if (slot.player === this.me) continue;
        const home = this.hqOf(slot.player) ?? startsAt[slot.player]!;
        const target = this.hqOf(this.me) ?? startsAt[this.me] ?? home;
        this.opponents.push(new Opponent(slot.player, home, target, (action) => this.send(action, slot.player)));
      }
    } else {
      this.config.channel.send({ type: "ready" });
      this.armConfirms(match);
    }
  }

  private bindLockstep(match: MatchConfig): void {
    const room = new Room(match);
    this.room = room;
    this.match = match;
    for (const slot of match.slots) {
      const ch = new MemoryChannel(room, slot.player);
      this.channels.push(ch);
      this.locksteps.set(slot.player, new Lockstep(ch, slot.player, match.delay));
    }
  }

  private bindRemote(match: MatchConfig, channel: Channel): void {
    this.checksumEvery = match.checksumEvery;
    this.match = match;
    const wrapped: Channel = {
      send: (msg) => channel.send(msg),
      onMessage: (fn) => {
        channel.onMessage((msg) => {
          if (msg.type === "desync") {
            this.desynced = true;
            this.paused = true;
          }
          if (msg.type === "load" || (msg.type === "start" && msg.save != null)) {
            const file = parseSaveFile(msg.save);
            if (file) this.applySave(file);
            else {
              this.desynced = true;
              this.paused = true;
            }
          }
          if (msg.type === "restart") this.applyRestart(msg.config);
          fn(msg);
        });
      },
    };
    this.locksteps.set(this.me, new Lockstep(wrapped, this.me, match.delay));
  }

  /** MP confirms on a timer. Call after pipeline restore so we do not confirm from tick 0. */
  private armConfirms(match: MatchConfig): void {
    if (this.confirmTimer != null) clearInterval(this.confirmTimer);
    this.matchStartMs = performance.now();
    this.confirmTimer = setInterval(() => this.pulseConfirm(), match.tickMs);
    this.pulseConfirm();
  }

  private bindPause(): void {
    this.pauseMenu = new PauseMenu(this.overlay, {
      onToggle: () => this.togglePause(),
      onBack: () => {
        this.pause.back();
        this.syncPause();
      },
      onSave: () => {
        this.pause.openSave(this.mapLabel());
        this.syncPause();
      },
      onLoad: () => {
        this.pause.openLoad();
        this.syncPause();
      },
      onEnd: () => {
        this.pause.askEnd();
        this.syncPause();
      },
      onRestart: () => {
        this.pause.askRestart();
        this.syncPause();
      },
      onPick: (id) => {
        const file = this.config.saves?.get(id);
        if (!file) return;
        this.pause.pick(id, file.name);
        this.syncPause();
      },
      onName: (name) => this.pause.setName(name),
      onSubmitSave: () => this.runPause(this.pause.submitSave(this.saveNameTaken(this.pause.current.name))),
      onConfirm: () => this.runPause(this.pause.confirm()),
      onCancel: () => {
        this.pause.cancelConfirm();
        this.syncPause();
      },
    });
  }

  private togglePause(): void {
    if (this.watching) return;
    this.pause.toggle();
    this.syncPause();
  }

  private saveNameTaken(name: string): boolean {
    const n = name.trim().toLowerCase();
    if (!n) return false;
    return this.modeSaves().some((f) => f.name.trim().toLowerCase() === n);
  }

  private hostSeat(): boolean {
    return this.config.channel == null || this.config.host === true;
  }

  private remoteSave(): boolean {
    return this.config.channel != null;
  }

  private modeSaves(): SaveFile[] {
    return savesForMode(this.config.saves?.list() ?? [], this.remoteSave());
  }

  private syncPause(): void {
    if (!this.desynced && !this.config.channel && !this.watching) {
      if (this.pause.open) {
        if (!this.paused) this.menuPaused = true;
        this.paused = true;
      } else if (this.menuPaused) {
        this.paused = false;
        this.menuPaused = false;
      }
    }
    this.pauseMenu?.setView(this.pause.current, {
      files: this.modeSaves().map(saveInfo),
      canLoad: this.hostSeat(),
      canRestart: this.hostSeat(),
      remote: this.remoteSave(),
    });
  }

  private runPause(cmd: PauseCommand): void {
    this.syncPause();
    if (cmd.type === "idle") return;
    if (cmd.type === "save") {
      this.saveGame(cmd.name);
      this.pause.close();
      this.syncPause();
      return;
    }
    if (cmd.type === "load") {
      const file = this.config.saves?.get(cmd.id);
      if (file && file.remote === this.remoteSave()) this.requestLoad(file);
      return;
    }
    if (cmd.type === "end") this.requestEnd();
    if (cmd.type === "restart") this.requestRestart();
  }

  private installPipeline(save: SaveFile): void {
    this.room?.resume(save.pipeline);
    for (const ls of this.locksteps.values()) {
      const through = save.pipeline.through.find((t) => t.player === ls.player)?.through ?? save.pipeline.sentThrough;
      ls.restore(save.pipeline.commits, through);
    }
  }

  private hqOf(player: number): GridPos | undefined {
    return this.world?.buildings.all().find((b) => b.player === player && b.hq)?.pos;
  }

  /**
   * Empty `through` on a timer, not only on Pixi frames. An unfocused tab's rAF pauses;
   * without this the other slot waits forever at tick 0. `through` tracks wall clock and D
   * so one RTT yields a burst of commits instead of 1 tick.
   */
  private pulseConfirm(): void {
    const world = this.world;
    if (!world || this.watching || this.desynced) return;
    const next = world.clock.tickIndex + 1;
    const elapsed = Math.max(0, Math.floor((performance.now() - this.matchStartMs) / world.clock.tickMs));
    for (const ls of this.locksteps.values()) {
      const through = Math.max(next, elapsed + 1, world.clock.tickIndex + ls.delay);
      ls.confirm(through, next + ls.delay);
    }
  }

  /** Fence on click. World still applies at tick+D; this is render-only. */
  private pinPlan(kind: BuildingKind, at: GridPos): void {
    const delay = this.locksteps.get(this.me)?.delay ?? 1;
    const tick = this.world?.clock.tickIndex ?? 0;
    this.pendingPlans.push({ id: this.nextPendingId--, kind, at, until: tick + delay + 2 });
  }

  private prunePending(world: World): void {
    for (let i = this.pendingPlans.length - 1; i >= 0; i--) {
      const p = this.pendingPlans[i]!;
      if (world.buildings.at(p.at.x, p.at.y) || world.clock.tickIndex > p.until) {
        this.pendingPlans.splice(i, 1);
      }
    }
  }

  private pendingAt(x: number, y: number): boolean {
    return this.pendingPlans.some((p) => p.at.x === x && p.at.y === y);
  }

  /** True if this plot's protected tiles overlap a still-pending local plan. */
  private pendingOverlap(kind: BuildingKind, at: GridPos): boolean {
    const a = protectedTiles(kind, at);
    for (const p of this.pendingPlans) {
      const b = protectedTiles(p.kind, p.at);
      for (const t of a) {
        if (b.some((u) => u.x === t.x && u.y === t.y)) return true;
      }
    }
    return false;
  }

  private look(world: World): ViewSnapshot {
    this.prunePending(world);
    const snap = world.view(this.me);
    if (this.pendingPlans.length === 0) return snap;
    return {
      ...snap,
      buildings: [
        ...snap.buildings,
        ...this.pendingPlans.map((p) => ({
          id: p.id,
          kind: p.kind,
          x: p.at.x,
          y: p.at.y,
          player: this.me,
          state: "plan" as const,
          buildProgress: 0,
          flag: buildingDef(p.kind).worker ? null : ("door" as const),
        })),
      ],
    };
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
      if (!this.watching) {
        // Don't wait for `go`. Room already stalls until every slot confirms.
        if (this.config.channel && this.desynced) break;
        const next = world.clock.tickIndex + 1;
        if (this.config.channel) this.pulseConfirm();
        else for (const ls of this.locksteps.values()) ls.confirm(next);
        const commit = this.locksteps.get(this.me)?.take(next);
        if (!commit) break;
        for (const slot of commit.slots) {
          for (let i = 0; i < slot.actions.length; i++) {
            world.enqueue(slot.actions[i]!, next, { player: slot.player, seq: i });
          }
        }
        this.acc -= step;
        world.tick(phases);
        this.maybeRecord();
        const ch = this.config.channel;
        if (ch && next % this.checksumEvery === 0) {
          ch.send({ type: "hash", tick: next, checksum: world.checksum() });
        }
        for (const opp of this.opponents) {
          if (world.outcome || !world.hasHq(opp.player)) continue;
          opp.onTick(world);
        }
      } else {
        this.acc -= step;
        world.tick(phases);
      }
      n++;
    }
    const simMs = performance.now() - tSim;
    if (n >= cap) this.acc = 0;
    const tSnap = performance.now();
    const snap = this.look(world);
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
    this.syncBoard();
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
    if (this.world) this.syncMinimap(this.look(this.world), false);
  }

  /** Esc: pause stack, then build ghost, then page, then claim, then unit, then hut. */
  deselect(): void {
    if (this.pause.open) {
      this.pause.back();
      this.syncPause();
      return;
    }
    if (this.placeTool) {
      this.armPlace(null);
      return;
    }
    if (this.board?.pop()) {
      this.syncBoard();
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
      this.syncBoard();
    }
  }

  /** Panel Cancel: drop unit / hut selection. Not the Esc peel (ghost, drill, claim). */
  private clearBoardSelection(): void {
    if (this.placeTool?.type === "workArea") this.armPlace(null);
    if (this.selectedUnitIds.length === 0 && !this.selected) return;
    this.selectedUnitIds = [];
    this.selected = null;
    this.syncSelectionVisual();
  }

  /** C: bearer → pioneer, or pioneer → bearer (own land, empty-handed). Every selected unit. */
  convertSelected(): void {
    const world = this.world;
    if (!world || !this.canCommand()) return;
    for (const id of this.selectedUnitIds) {
      const unit = world.movable(id);
      if (!unit || unit.player !== this.me) continue;
      if (unit.type === "bearer") this.send({ type: "convert", id: unit.id, to: "pioneer" });
      else if (unit.type === "pioneer") this.send({ type: "convert", id: unit.id, to: "bearer" });
    }
  }

  /** G: bearer → geologist, or geologist → bearer (own land). Every selected unit. */
  convertGeologistSelected(): void {
    const world = this.world;
    if (!world || !this.canCommand()) return;
    for (const id of this.selectedUnitIds) {
      const unit = world.movable(id);
      if (!unit || unit.player !== this.me) continue;
      if (unit.type === "bearer") this.send({ type: "convert", id: unit.id, to: "geologist" });
      else if (unit.type === "geologist") this.send({ type: "convert", id: unit.id, to: "bearer" });
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
      this.send({ type: "convert", id: unit.id, to: "swordsman" });
    }
  }

  /**
   * Recruit Pioneer / Geologist: convert the closest idle empty-handed bearer
   * and send them toward the click. Bearers are not selectable — this is the play path.
   */
  private recruitSpecialist(kind: "pioneer" | "geologist", to: GridPos): void {
    const world = this.world;
    if (!world) return;
    const id = closestIdleBearer(world, this.me, to);
    if (id == null) return;
    this.send({ type: "convert", id, to: kind });
    if (kind === "pioneer") this.send({ type: "pioneerWork", id, to });
    else this.send({ type: "geologistWork", id, to });
  }

  /** Delete / Backspace: remove the highlighted hut. Fog circle and occupy disk go with it. */
  deleteSelected(): void {
    const world = this.world;
    if (!world || !this.selected || !this.canCommand()) return;
    const hut = world.buildings.at(this.selected.x, this.selected.y);
    if (!hut || hut.player !== this.me) return;
    this.send({ type: "destroyBuilding", at: this.selected });
    this.selected = null;
    this.pendingWork = null;
    this.renderer?.highlight(null);
    this.renderer?.setWorkArea(null, 0);
    this.syncBoard();
  }

  setClaiming(on: boolean): void {
    if (this.watching) return;
    this.claiming = on;
    if (on) this.placeTool = null;
    this.syncGhost();
    this.renderer?.previewOccupy(on ? this.hover : null, this.me);
    this.syncBoard();
  }

  stop(): void {
    if (this.confirmTimer != null) {
      clearInterval(this.confirmTimer);
      this.confirmTimer = null;
    }
    this.input?.destroy();
    this.minimap?.destroy();
    this.speedControl?.destroy();
    this.pauseMenu?.destroy();
    this.panel?.destroy();
    this.timeline?.destroy();
    this.renderer?.destroy();
    this.input = null;
    this.minimap = null;
    this.speedControl = null;
    this.pauseMenu = null;
    this.pause.close();
    this.menuPaused = false;
    this.panel = null;
    this.board = null;
    this.boardPaint = "";
    this.timeline = null;
    this.renderer = null;
    this.world = null;
    this.opponents.length = 0;
    for (const ch of this.channels) ch.destroy();
    this.channels.length = 0;
    this.locksteps.clear();
    this.room = null;
    this.match = null;
    this.pendingPlans.length = 0;
    this.pendingWork = null;
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
    this.syncWorkArea();
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
      if (this.canCommand() && pos) this.send({ type: "occupy", at: pos, player: this.me });
      return;
    }
    const tool = this.placeTool;
    if (tool?.type === "workArea") {
      if (this.canCommand() && pos && this.selected) {
        this.send({ type: "setWorkArea", at: this.selected, center: pos });
        this.pendingWork = { at: this.selected, center: pos };
        this.armPlace(null);
        this.syncWorkArea();
      }
      return;
    }
    if (tool?.type === "unit" && pos && this.canCommand()) {
      if (tool.kind === "swordsman") {
        this.send({
          type: "spawnUnit",
          kind: "swordsman",
          at: pos,
          player: this.me,
          count: tool.count,
        });
        return;
      }
      this.recruitSpecialist(tool.kind, pos);
      return;
    }
    if (tool?.type === "building" && pos && this.canCommand() && this.world.canPlaceBuilding(tool.kind, pos, this.me) && !this.pendingOverlap(tool.kind, pos)) {
      this.send({ type: "placeBuilding", kind: tool.kind, at: pos, player: this.me });
      this.pinPlan(tool.kind, pos);
      this.armPlace(null);
      this.paintNow();
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

  /** RMB. Pioneers claim toward the tile; geologists probe (shift = walk). Everyone else walks. */
  private commandSelected(pos: GridPos | null, forced = false): void {
    const world = this.world;
    if (!world || !pos || this.selectedUnitIds.length === 0 || !this.canCommand()) return;
    const walkers: number[] = [];
    for (const id of this.selectedUnitIds) {
      const unit = world.movable(id);
      if (!unit || unit.player !== this.me) continue;
      if (unit.type === "pioneer") this.send({ type: "pioneerWork", id: unit.id, to: pos });
      else if (unit.type === "geologist" && !forced) this.send({ type: "geologistWork", id: unit.id, to: pos });
      else walkers.push(unit.id);
    }
    const dests = this.spreadDests(pos, walkers.length);
    for (let i = 0; i < walkers.length; i++) {
      this.send({ type: "moveTo", id: walkers[i]!, to: dests[i] ?? pos, forced });
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

  /** Place-tool from the command grid. Session owns the ghost; the widget only emitted an id. */
  private armPlace(tool: PlaceTool | null): void {
    this.placeTool = tool;
    if (tool && this.claiming) {
      this.claiming = false;
      this.renderer?.previewOccupy(null);
      this.config.hooks.onClaiming?.(false);
    }
    this.syncGhost();
    this.syncBoard();
  }

  private buildingCounts(): BoardContext["counts"] {
    const out: BoardContext["counts"] = {};
    const pair = (kind: BuildingKind): CountPair => (out[kind] ??= { have: 0, queued: 0 });
    const world = this.world;
    if (world) {
      const staffed = new Set<number>();
      for (const v of world.view(this.me).movables) {
        if (v.player !== this.me || v.workplaceId == null) continue;
        const hut = world.buildings.get(v.workplaceId);
        if (hut && buildingDef(hut.kind).worker === v.type) staffed.add(hut.id);
      }
      for (const b of world.buildings.all()) {
        if (b.player !== this.me) continue;
        const slot = pair(b.kind);
        slot.queued += 1;
        const worker = buildingDef(b.kind).worker;
        if (b.state === "built" && (worker == null || staffed.has(b.id))) slot.have += 1;
      }
    }
    for (const p of this.pendingPlans) {
      if (world?.buildings.at(p.at.x, p.at.y)) continue;
      pair(p.kind).queued += 1;
    }
    return out;
  }

  private unitCounts(): BoardContext["units"] {
    const out: BoardContext["units"] = {};
    const world = this.world;
    if (!world) return out;
    const pair = (kind: string): CountPair => (out[kind] ??= { have: 0, queued: 0 });
    for (const v of world.view(this.me).movables) {
      if (v.player !== this.me) continue;
      const slot = pair(v.type);
      slot.have += 1;
      slot.queued += 1;
      const job = world.movable(v.id)?.job;
      if (job?.type === "equip") pair(job.become).queued += 1;
      else if (job?.type === "occupy") pair(job.worker).queued += 1;
    }
    return out;
  }

  private boardContext(): BoardContext {
    const world = this.world;
    const canCommand = this.canCommand();
    const counts = this.buildingCounts();
    const units = this.unitCounts();
    const placeTool = this.placeTool;
    const diggerRatio = world?.diggerRatio(this.me) ?? DEFAULT_DIGGER_RATIO;
    const bricklayerRatio = world?.bricklayerRatio(this.me) ?? DEFAULT_BRICKLAYER_RATIO;
    const civilians = this.civilianCount();
    const cap = diggerCap(civilians, diggerRatio);
    const bricklayerCap = diggerCap(civilians, bricklayerRatio);
    const base = { counts, units, canCommand, placeTool, diggerRatio, diggerCap: cap, bricklayerRatio, bricklayerCap };
    if (!world) return { selection: { type: "none" }, ...base };
    if (this.selectedUnitIds.length > 0) {
      const types: string[] = [];
      for (const id of this.selectedUnitIds) {
        const u = world.movable(id);
        if (u) types.push(u.type);
      }
      return { selection: { type: "units", types }, ...base };
    }
    if (this.selected) {
      const hut = world.buildings.at(this.selected.x, this.selected.y);
      if (hut) {
        return {
          selection: {
            type: "building",
            kind: hut.kind,
            state: hut.state,
            owned: hut.player === this.me,
            workArea: hasWorkArea(hut.kind),
            ...hutGoods(hut, world.objects),
          },
          ...base,
        };
      }
    }
    return { selection: { type: "none" }, ...base };
  }

  /** Tools page ±1 digger. Stored as a fraction of civilians so later house-spawns scale. */
  private bumpDiggerRatio(dir: number): void {
    const world = this.world;
    if (!world || !this.canCommand()) return;
    const workers = this.civilianCount();
    if (workers <= 0) return;
    const cap = diggerCap(workers, world.diggerRatio(this.me));
    const nextCap = Math.min(workers, Math.max(0, cap + dir));
    if (nextCap === cap) return;
    this.send({ type: "setDiggerRatio", ratio: nextCap / workers, player: this.me });
  }

  /** Tools page ±1 bricklayer. Same storage as diggers. */
  private bumpBricklayerRatio(dir: number): void {
    const world = this.world;
    if (!world || !this.canCommand()) return;
    const workers = this.civilianCount();
    if (workers <= 0) return;
    const cap = diggerCap(workers, world.bricklayerRatio(this.me));
    const nextCap = Math.min(workers, Math.max(0, cap + dir));
    if (nextCap === cap) return;
    this.send({ type: "setBricklayerRatio", ratio: nextCap / workers, player: this.me });
  }

  private civilianCount(): number {
    const world = this.world;
    if (!world) return 0;
    const mine = [];
    for (const v of world.view(this.me).movables) {
      const m = world.movable(v.id);
      if (m) mine.push(m);
    }
    return workerCount(mine, this.me);
  }

  private syncBoard(): void {
    const board = this.board;
    const panel = this.panel;
    if (!board || !panel) return;
    board.sync(this.boardContext());
    const page = board.page;
    const sel = board.selectionView;
    const key = JSON.stringify({ page, sel });
    if (key === this.boardPaint) return;
    this.boardPaint = key;
    panel.setPage(page);
    panel.setSelection(sel);
  }

  private syncSelectionVisual(): void {
    this.renderer?.setSelected(this.selectedUnitIds);
    this.paintHutSelect();
    this.syncBoard();
  }

  private paintHutSelect(): void {
    const renderer = this.renderer;
    if (!renderer) return;
    if (this.selectedUnitIds.length > 0) renderer.highlight(null);
    else renderer.highlight(this.selected);
    this.syncWorkArea();
  }

  private syncWorkArea(): void {
    const renderer = this.renderer;
    const world = this.world;
    if (!renderer) return;
    const hut = this.selected && world ? world.buildings.at(this.selected.x, this.selected.y) : undefined;
    if (!hut || this.selectedUnitIds.length > 0 || !hasWorkArea(hut.kind)) {
      if (this.pendingWork && (!hut || hut.pos.x !== this.pendingWork.at.x || hut.pos.y !== this.pendingWork.at.y)) {
        this.pendingWork = null;
      }
      renderer.setWorkArea(null, 0);
      return;
    }
    const radius = buildingDef(hut.kind).workRadius;
    if (this.pendingWork && this.pendingWork.at.x === hut.pos.x && this.pendingWork.at.y === hut.pos.y) {
      if (hut.work.x === this.pendingWork.center.x && hut.work.y === this.pendingWork.center.y) this.pendingWork = null;
    }
    const hover = this.placeTool?.type === "workArea" ? this.hover : null;
    const center = hover ?? this.pendingWork?.center ?? hut.work;
    renderer.setWorkArea(center, radius, hut.player);
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
    if (this.claiming || tool?.type === "building") renderer.setWorkArea(null, 0);
    if (this.claiming || tool?.type !== "building" || !world) {
      this.markKey = "";
      renderer.ghost(null, null, false);
      renderer.setConstructionMarks(null);
      return;
    }
    if (!pos || world.buildings.at(pos.x, pos.y) || this.pendingAt(pos.x, pos.y)) renderer.ghost(null, null, false);
    else {
      renderer.ghost(tool.kind, pos, world.canPlaceBuilding(tool.kind, pos, this.me) && world.plotLevel(tool.kind, pos) && !this.pendingOverlap(tool.kind, pos));
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
    const key = `${tool.kind}:${world.land.generation}:${world.grid.revision}:${world.objects.revision}:${world.buildings.revision}:${this.pendingPlans.map((p) => `${p.at.x},${p.at.y}`).join(";")}`;
    if (key === this.markKey) return;
    this.markKey = key;
    const marks = (world.constructionMarks(tool.kind, this.me) ?? this.viewportMarks(tool.kind)).filter(
      (m) => !this.pendingOverlap(tool.kind, m),
    );
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
    if (tool.type === "workArea") return "area";
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
    const snap = this.look(world);
    renderer.setSelected(this.selectedUnitIds);
    renderer.draw(snap, 0);
    this.paintHutSelect();
    this.syncMinimap(snap);
    this.syncBoard();
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
    const ch = this.config.channel;
    if (ch && world.outcome) {
      ch.send({
        type: "ended",
        outcome: { winner: world.outcome.winner, defeated: [...world.outcome.defeated] },
        tick: world.clock.tickIndex,
        checksum: world.checksum(),
      });
    }
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

  /** Full save (snapshot + log + pipeline). */
  saveGame(name: string): SaveFile | null {
    const world = this.world;
    const match = this.match;
    if (this.watching || !world || !match) return null;
    const ls = this.locksteps.get(this.me);
    const pipeline = this.room && ls ? capturePipeline(this.room, ls) : this.remotePipeline(match, ls);
    const file = makeSaveFile({
      name,
      mapName: this.mapLabel(),
      me: this.me,
      remote: this.config.channel != null,
      match,
      world,
      pipeline,
    });
    const prev = this.modeSaves().find((f) => f.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (prev) file.id = prev.id;
    this.config.hooks.onSave?.(file);
    return file;
  }

  loadGame(file: SaveFile): void {
    this.applySave(file);
  }

  requestLoad(file: SaveFile): void {
    if (file.remote !== this.remoteSave()) return;
    const ch = this.config.channel;
    if (ch && this.config.host) {
      ch.send({ type: "loadSave", save: file });
      return;
    }
    if (ch) return;
    this.config.hooks.onLoad?.(file);
  }

  requestRestart(): void {
    const ch = this.config.channel;
    if (ch && this.config.host) {
      ch.send({ type: "restart" });
      return;
    }
    if (ch) return;
    this.config.hooks.onRestart?.();
  }

  requestEnd(): void {
    this.config.hooks.onEnd?.();
  }

  private remotePipeline(match: MatchConfig, ls: Lockstep | undefined) {
    const commits = ls?.peek() ?? [];
    const tick = this.world?.clock.tickIndex ?? 0;
    const committed = commits.reduce((m, c) => Math.max(m, c.tick), tick);
    const sent = ls?.sent() ?? committed;
    return {
      committed,
      through: match.slots.map((s) => ({ player: s.player, through: sent })),
      held: [] as { player: number; tick: number; actions: never[] }[],
      commits,
      sentThrough: sent,
    };
  }

  private applySave(file: SaveFile): void {
    const restored = restoreWorld(file);
    const renderer = this.renderer;
    if (!restored || !renderer) {
      this.desynced = true;
      this.paused = true;
      return;
    }
    this.world = restored;
    this.worldSeed = file.seed;
    this.waves = waveDecorations(mapViewFromGrid(restored.grid));
    this.view = mapViewFromGrid(restored.grid);
    renderer.setView(this.view, this.waves, false);
    this.minimap?.setView(this.view);
    this.installPipeline(file);
    this.pendingPlans.length = 0;
    this.pendingWork = null;
    this.acc = 0;
    this.matchStartMs = performance.now();
    this.desynced = false;
    if (this.config.channel) this.config.channel.send({ type: "ready" });
    const look = this.startLook();
    this.lookAt(look.x, look.y);
    this.paintNow();
  }

  /** Host restarted the room. Rebuild kits from the dump; mailbox is already a fresh Room. */
  private applyRestart(config: MatchConfig): void {
    void this.rebuildLive(config);
  }

  private async rebuildLive(config: MatchConfig): Promise<void> {
    const loaded = await this.loadGrid(config.mapId);
    const renderer = this.renderer;
    if (!renderer) return;
    this.match = config;
    this.worldSeed = config.seed;
    this.checksumEvery = config.checksumEvery;
    const world = new World(loaded.grid, loaded.objects, seedRng(config.seed));
    this.world = world;
    this.waves = loaded.waves;
    this.view = mapViewFromGrid(world.grid);
    renderer.setView(this.view, this.waves, false);
    this.minimap?.setView(this.view);
    for (const ls of this.locksteps.values()) ls.restore([], 0);
    const listed = this.config.catalog.find((m) => m.id === config.mapId)?.players ?? 1;
    const cap = mapStartCap(loaded.starts.length, listed);
    const n = config.slots.length;
    const startsAt = matchStarts(loaded.starts, clampMatchPlayers(n, cap) || n, loaded.grid);
    for (const slot of config.slots) {
      const at = startsAt[slot.player] ?? startsAt[0];
      if (at) world.dispatch({ type: "placeColony", at, player: slot.player });
    }
    this.pendingPlans.length = 0;
    this.pendingWork = null;
    this.selected = null;
    this.selectedUnitIds = [];
    this.acc = 0;
    this.desynced = false;
    if (this.config.channel) {
      this.config.channel.send({ type: "ready" });
      this.armConfirms(config);
    }
    const look = this.startLook();
    this.lookAt(look.x, look.y);
    this.paintNow();
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

function protectedTiles(kind: BuildingKind, at: GridPos): { x: number; y: number }[] {
  return buildingDef(kind).protected.map((r) => ({ x: at.x + r.dx, y: at.y + r.dy }));
}

/** Closest jobless empty-handed bearer of `player`. Convert food for recruit specialist. */
function closestIdleBearer(world: World, player: number, at: GridPos): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const v of world.view(player).movables) {
    if (v.player !== player || v.type !== "bearer" || v.inside || v.material !== "none" || v.job) continue;
    const d = hexDist(v.pos.x, v.pos.y, at.x, at.y);
    if (d < bestD) {
      bestD = d;
      best = v.id;
    }
  }
  return best;
}
