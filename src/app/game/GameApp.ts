import { authoredMaps, playableMaps, getMap } from '../../shared/map/library';
import { MapPicker } from '../../ui/menu/mapPicker';
import { emptyUtcMap, type UtcMap } from '../../shared/map/utcmap';
/**
 * Canvas host + lobby. Owns `#game` (WebGL canvas) and `#hud` (screens).
 * Match state lives in `PlayScreen` → `Session`, not here.
 */
import { MainMenu, MultiplayerScreen, RoomWaitScreen, ScreenHost } from "../../ui";
import { createRoom, fetchRooms, joinRoom, leaveRoom, matchUrl, startRoom, WebSocketChannel } from "../../net";
import { type MatchConfig, type RoomView, type ServerMsg } from "../../shared";
import { parseBootIntent } from "./bootIntent";
import { BackgroundTicker } from "./backgroundTicker";
import { PlayScreen } from "./playScreen";
import { EditorScreen } from "./editorScreen";



export class GameApp {
  private canvas: HTMLCanvasElement | null = null;
  private screens: ScreenHost | null = null;
  private player = 0;
  private guestName = readGuest();
  private playGen = 0;
  private backgroundTicker: BackgroundTicker | null = null;
  private raf = 0;
  private last = 0;
  private ticking = false;

  constructor(
    private readonly gameRoot: HTMLElement,
    private readonly hudRoot: HTMLElement,
  ) {}

  start(): void {
    const canvas = document.createElement("canvas");
    this.canvas = canvas;
    canvas.style.visibility = "hidden";
    this.gameRoot.appendChild(canvas);
    this.screens = new ScreenHost(this.hudRoot);

    this.startRaf();
    this.backgroundTicker = new BackgroundTicker({
      startRaf: () => this.startRaf(),
      stopRaf: () => this.stopRaf(),
      pump: () => this.pump(),
    });
    this.backgroundTicker.start();

    const intent = parseBootIntent();
    if (intent.player !== undefined) this.player = intent.player;
    if (intent.kind === "play" && playableMaps().some(m=>m.id===intent.mapId)) this.play(intent.mapId);
    else if (intent.kind === "editor") this.showEditor();
    else if (intent.kind === "single") this.showMapPicker();
    else this.showMenu();
  }

  stop(): void {
    this.playGen++;
    this.backgroundTicker?.destroy();
    this.backgroundTicker = null;
    this.stopRaf();
    this.screens?.clear();
    this.screens = null;
    this.canvas?.remove();
    this.canvas = null;
  }

  private startRaf(): void {
    if (this.ticking) return;
    this.ticking = true;
    this.last = performance.now();
    const loop = (t: number): void => {
      if (!this.ticking) return;
      this.raf = requestAnimationFrame(loop);
      const dt = t - this.last;
      this.last = t;
      this.screens?.tick(dt, t);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private stopRaf(): void {
    this.ticking = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private pump(): void {
    const now = performance.now();
    const dt = now - this.last;
    this.last = now;
    this.screens?.tick(dt, now);
  }

  private showMenu(): void {
    this.playGen++;
    this.hideCanvas();
    this.screens?.show(
      new MainMenu({
        playerName: this.guestName,
        onPlayerName: (name) => this.rememberName(name),
        onSinglePlayer: () => this.showMapPicker(),
        onMultiplayer: () => this.showMultiplayer(),
        onEditor: () => this.showMapPicker(true),
      }),
    );
  }

  private showMapPicker(edit=false):void {
    this.playGen++;this.hideCanvas();
    this.screens?.show(new MapPicker(edit?'edit':'play',{
      onBack:()=>this.showMenu(),
      onChoose:(entry)=>edit?this.showEditor(entry.map):this.play(entry.id),
      ...(edit?{onNew:()=>this.showEditor(emptyUtcMap())}:{}),
    }));
  }

  private showMultiplayer(error?: string): void {
    this.playGen++;
    this.hideCanvas();
    const screen = new MultiplayerScreen({
      maps: playableMaps().filter(m=>m.source==='project'),
      mapName: (id) => getMap(id).name,
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
      const created = await createRoom({
        name: `${this.guestName}'s room`,
        mapId,
        mapRevision: getMap(mapId).revision,
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
      mapName: getMap(room.mapId).name,
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
    if (!this.canvas || !this.screens) return;
    const gen = ++this.playGen;
    this.showCanvas();
    const play = new PlayScreen(this.canvas, {
      mapId: match.mapId,
      player,
      channel,
      match,
      onLeave: () => {
        channel.destroy();
        this.showMultiplayer();
      },
    });
    this.screens.show(play);
    play.start();
    if (gen !== this.playGen && this.screens.screen === play) this.screens.clear();
  }

  private showEditor(map?:UtcMap): void {
    if (!this.canvas || !this.screens) return;
    if (this.screens.screen instanceof EditorScreen) return;
    const gen = ++this.playGen;
    this.showCanvas();
    const editor = new EditorScreen(this.canvas, { onLeave: () => this.showMenu(), map: map ?? authoredMaps().find(m=>m.id==='twinwater-reach')?.map });
    this.screens.show(editor);
    try {
      editor.start();
    } catch (err) {
      console.error(err);
      if (gen === this.playGen) this.showMenu();
    }
  }

  private play(mapId:string): void {
    if (!this.canvas || !this.screens) return;
    const current = this.screens.screen;
    if (current instanceof PlayScreen && current.mapId === mapId) return;
    const gen = ++this.playGen;
    this.showCanvas();
    const play = new PlayScreen(this.canvas, {
      mapId,
      player: this.player,
      onLeave: () => this.showMapPicker(),
    });
    this.screens.show(play);
    try {
      play.start();
    } catch (err) {
      console.error(err);
      if (gen === this.playGen) this.showMenu();
      return;
    }
    if (gen !== this.playGen && this.screens.screen === play) this.screens.clear();
  }

  private hideCanvas(): void {
    if (this.canvas) this.canvas.style.visibility = "hidden";
  }

  private showCanvas(): void {
    if (this.canvas) this.canvas.style.visibility = "visible";
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
