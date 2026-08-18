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
import { createRoom, fetchRooms, joinRoom, leaveRoom, matchUrl, startRoom, WebSocketChannel } from "../../net";
import type { MatchConfig, RoomView, ServerMsg } from "../../shared";
import { parseBootIntent } from "./bootIntent";
import { PlayScreen } from "./playScreen";

const ASSETS_HREF = "/original_conv/viewer/index.html";

export class GameApp {
  private pixi: Application | null = null;
  private screens: ScreenHost | null = null;
  private catalog: MapCatalogEntry[] = [];
  private player = 0;
  private slots = 2;
  private guestName = readGuest();
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

  private showMultiplayer(error?: string): void {
    this.playGen++;
    const screen = new MultiplayerScreen({
      maps: this.mpMaps(),
      mapName: (id) => this.mapLabel(id),
      name: this.guestName === "player" ? "" : this.guestName,
      error,
      onBack: () => this.showMenu(),
      onRefresh: () => void this.refreshJoinList(),
      onHost: (name, mapId, slotCount) => void this.hostRoom(name, mapId, slotCount),
      onJoin: (roomId, name) => void this.enterRoom(roomId, name),
    });
    this.screens?.show(screen);
    void this.refreshJoinList();
  }

  private mpMaps(): { id: string; name: string; players: number }[] {
    const maps = mapPickerOptions(this.catalog).map((m) => ({ id: m.id, name: m.name, players: m.players }));
    return maps.length ? maps : [{ id: defaultMapId(this.catalog), name: "map", players: 2 }];
  }

  private mapLabel(id: string): string {
    return this.catalog.find((m) => m.id === id)?.name ?? id;
  }

  private rememberName(name: string): void {
    this.guestName = name.trim() || "player";
    try {
      localStorage.setItem("settlers.guest", this.guestName);
    } catch {
      /* ignore */
    }
  }

  private async refreshJoinList(): Promise<void> {
    const screen = this.screens?.screen;
    if (!(screen instanceof MultiplayerScreen)) return;
    try {
      screen.setRooms(await fetchRooms());
    } catch (err) {
      screen.setError(err instanceof Error ? err.message : "Can't reach MatchHost");
    }
  }

  private async hostRoom(name: string, mapId: string, slotCount: number): Promise<void> {
    this.rememberName(name);
    try {
      const entry = this.catalog.find((m) => m.id === mapId);
      const created = await createRoom({
        name: `${this.guestName}'s room`,
        mapId,
        mapRevision: entry?.file ?? mapId,
        slotCount,
        guestName: this.guestName,
      });
      this.enterLobby(created.room, created.token, created.you.player ?? 0, true);
    } catch (err) {
      const screen = this.screens?.screen;
      if (screen instanceof MultiplayerScreen) {
        screen.setError(err instanceof Error ? err.message : "Host failed");
        return;
      }
      this.showMultiplayer(err instanceof Error ? err.message : "Host failed");
    }
  }

  private async enterRoom(roomId: string, name: string): Promise<void> {
    this.rememberName(name);
    try {
      const joined = await joinRoom(roomId, { guestName: this.guestName, role: "player" });
      this.enterLobby(joined.room, joined.token, joined.you.player ?? 0, false);
    } catch (err) {
      const screen = this.screens?.screen;
      if (screen instanceof MultiplayerScreen) {
        await this.refreshJoinList();
        screen.setError(err instanceof Error ? err.message : "Join failed");
        return;
      }
      this.showMultiplayer(err instanceof Error ? err.message : "Join failed");
    }
  }

  private enterLobby(room: RoomView, token: string, player: number, host: boolean): void {
    const gen = ++this.playGen;
    const channel = new WebSocketChannel(matchUrl(room.id, token));
    const wait = new RoomWaitScreen(room, {
      host,
      mapName: this.mapLabel(room.mapId),
      onBack: () => {
        channel.destroy();
        void leaveRoom(room.id, token);
        this.showMultiplayer();
      },
      onStart: () => {
        void startRoom(room.id, token).catch((err) => {
          channel.destroy();
          this.showMultiplayer(err instanceof Error ? err.message : "Start failed");
        });
      },
    });
    this.screens?.show(wait);
    void (async () => {
      try {
        const start = await waitStart(channel, (view) => {
          if (this.screens?.screen === wait) wait.setView(view);
        });
        if (gen !== this.playGen) {
          channel.destroy();
          return;
        }
        this.player = start.you.player ?? player;
        await this.playRemote(start.config, channel, this.player);
      } catch (err) {
        channel.destroy();
        if (gen === this.playGen) this.showMultiplayer(err instanceof Error ? err.message : "Match failed");
      }
    })();
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

function readGuest(): string {
  try {
    const n = localStorage.getItem("settlers.guest");
    return n && n !== "player" ? n : "";
  } catch {
    return "";
  }
}

function waitStart(
  channel: WebSocketChannel,
  onRoom?: (room: RoomView) => void,
): Promise<Extract<ServerMsg, { type: "start" }>> {
  return new Promise((resolve, reject) => {
    channel.onMessage((msg) => {
      if (msg.type === "welcome" || msg.type === "room") onRoom?.(msg.room);
      if (msg.type === "start") resolve(msg);
      if (msg.type === "error") reject(new Error(msg.message));
    });
  });
}
