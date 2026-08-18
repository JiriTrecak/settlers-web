/**
 * Pixi host + lobby. Owns `#game` (canvas) and `#hud` (screens).
 * Match state lives in `PlayScreen` → `Session`, not here.
 */
import { Application } from "pixi.js";
import { MainMenu, MapSelect, MultiplayerScreen, ReplaySelect, RoomWaitScreen, ScreenHost } from "../../ui";
import {
  defaultMapId,
  fetchMapCatalog,
  mapPickerOptions,
  replayInfo,
  ReplayStore,
  type MapCatalogEntry,
  type ReplayFile,
} from "../../session";
import { createRoom, joinRoom, matchUrl, startRoom, WebSocketChannel } from "../../net";
import type { MatchConfig, ServerMsg } from "../../shared";
import { parseBootIntent } from "./bootIntent";
import { PlayScreen } from "./playScreen";

const ASSETS_HREF = "/original_conv/viewer/index.html";

export class GameApp {
  private pixi: Application | null = null;
  private screens: ScreenHost | null = null;
  private catalog: MapCatalogEntry[] = [];
  private player = 0;
  private slots = 2;
  private readonly replays = new ReplayStore();
  /** Bumped on every screen change so a late `play()` load cannot resurrect a discarded match. */
  private playGen = 0;

  constructor(
    private readonly gameRoot: HTMLElement,
    private readonly hudRoot: HTMLElement,
  ) {}

  async start(): Promise<void> {
    const pixi = new Application();
    await pixi.init({
      background: 0x020814,
      resizeTo: window,
      antialias: false,
      preference: "webgl",
    });
    this.pixi = pixi;
    this.gameRoot.appendChild(pixi.canvas);
    this.screens = new ScreenHost(this.hudRoot);
    this.catalog = await fetchMapCatalog();

    pixi.ticker.add((ticker) => {
      this.screens?.tick(ticker.deltaMS, performance.now());
    });

    const intent = parseBootIntent();
    if (intent.player !== undefined) this.player = intent.player;
    if (intent.kind === "play") await this.play(intent.mapId);
    else if (intent.kind === "single") this.showMapSelect();
    else this.showMenu();
  }

  stop(): void {
    this.playGen++;
    this.screens?.clear();
    this.screens = null;
    this.pixi?.destroy(true);
    this.pixi = null;
  }

  private showMenu(): void {
    this.playGen++;
    this.screens?.show(
      new MainMenu({
        onSinglePlayer: () => this.showMapSelect(),
        onMultiplayer: () => this.showMultiplayer(),
        onAssets: () => {
          window.location.href = ASSETS_HREF;
        },
      }),
    );
  }

  private showMapSelect(): void {
    this.playGen++;
    this.screens?.show(
      new MapSelect(mapPickerOptions(this.catalog), {
        player: this.player,
        players: this.slots,
        onBack: () => this.showMenu(),
        onReplays: () => this.showReplays(),
        onPick: (id, player, players) => {
          this.player = player;
          this.slots = players;
          void this.play(id);
        },
      }),
    );
  }

  private showReplays(): void {
    this.playGen++;
    this.screens?.show(
      new ReplaySelect(this.replays.list().map(replayInfo), {
        onBack: () => this.showMapSelect(),
        onPick: (id) => {
          const file = this.replays.get(id);
          if (file) void this.playReplay(file);
        },
        onDelete: (id) => {
          this.replays.remove(id);
          this.showReplays();
        },
      }),
    );
  }

  private showMultiplayer(): void {
    this.playGen++;
    const maps = mapPickerOptions(this.catalog).map((m) => ({ id: m.id, name: m.name }));
    this.screens?.show(
      new MultiplayerScreen({
        maps: maps.length ? maps : [{ id: defaultMapId(this.catalog), name: "map" }],
        onBack: () => this.showMenu(),
        onHost: (name, mapId, slotCount) => void this.hostRoom(name, mapId, slotCount),
        onJoin: (roomId, name) => void this.enterRoom(roomId, name),
      }),
    );
  }

  private async hostRoom(name: string, mapId: string, slotCount: number): Promise<void> {
    const entry = this.catalog.find((m) => m.id === mapId);
    const created = await createRoom({
      name: `${name}'s room`,
      mapId,
      mapRevision: entry?.file ?? mapId,
      slotCount,
      guestName: name,
    });
    this.playGen++;
    this.screens?.show(
      new RoomWaitScreen(created.room.id, {
        host: true,
        onBack: () => this.showMultiplayer(),
        onStart: () => void this.startHosted(created.room.id, created.token, created.you.player ?? 0),
      }),
    );
  }

  private async startHosted(roomId: string, token: string, player: number): Promise<void> {
    await startRoom(roomId, token);
    await this.connectMatch(roomId, token, player);
  }

  private async enterRoom(roomId: string, name: string): Promise<void> {
    const joined = await joinRoom(roomId, { guestName: name, role: "player" });
    this.playGen++;
    this.screens?.show(
      new RoomWaitScreen(joined.room.id, {
        host: false,
        onBack: () => this.showMultiplayer(),
        onStart: () => {},
      }),
    );
    await this.connectMatch(joined.room.id, joined.token, joined.you.player ?? 0);
  }

  private async connectMatch(roomId: string, token: string, player: number): Promise<void> {
    const channel = new WebSocketChannel(matchUrl(roomId, token));
    const start = await waitStart(channel);
    this.player = start.you.player ?? player;
    await this.playRemote(start.config, channel, this.player);
  }

  private async playRemote(match: MatchConfig, channel: WebSocketChannel, player: number): Promise<void> {
    if (!this.pixi || !this.screens) return;
    const gen = ++this.playGen;
    const play = new PlayScreen(this.pixi, this.catalog, match.mapId, {
      player,
      channel,
      match,
      onLeave: () => {
        channel.destroy();
        this.showMultiplayer();
      },
    });
    this.screens.show(play);
    try {
      await play.start();
      if (gen !== this.playGen && this.screens.screen === play) this.screens.clear();
    } catch (err) {
      console.error(err);
      channel.destroy();
      if (gen === this.playGen) this.showMultiplayer();
    }
  }

  private async play(id: string): Promise<void> {
    if (!this.pixi || !this.screens) return;
    const current = this.screens.screen;
    if (current instanceof PlayScreen && current.mapId === id && current.replayId == null) return;
    const gen = ++this.playGen;
    const play = new PlayScreen(this.pixi, this.catalog, id, {
      player: this.player,
      players: this.slots,
      onLeave: () => this.showMapSelect(),
      onReplay: (file) => this.replays.save(file),
    });
    this.screens.show(play);
    try {
      await play.start();
      // Left (or picked another map) while graphics/map were still loading.
      if (gen !== this.playGen && this.screens.screen === play) this.screens.clear();
    } catch (err) {
      console.error(err);
      if (gen === this.playGen) this.showMapSelect();
    }
  }

  private async playReplay(file: ReplayFile): Promise<void> {
    if (!this.pixi || !this.screens) return;
    const gen = ++this.playGen;
    const play = new PlayScreen(this.pixi, this.catalog, file.mapId, {
      player: file.me,
      replay: file,
      onLeave: () => this.showReplays(),
    });
    this.screens.show(play);
    try {
      await play.start();
      if (gen !== this.playGen && this.screens.screen === play) this.screens.clear();
    } catch (err) {
      console.error(err);
      if (gen === this.playGen) this.showReplays();
    }
  }
}

function waitStart(channel: WebSocketChannel): Promise<Extract<ServerMsg, { type: "start" }>> {
  return new Promise((resolve, reject) => {
    channel.onMessage((msg) => {
      if (msg.type === "start") resolve(msg);
      if (msg.type === "error") reject(new Error(msg.message));
    });
  });
}
