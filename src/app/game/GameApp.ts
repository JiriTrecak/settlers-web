/**
 * Pixi host + lobby. Owns `#game` (canvas) and `#hud` (screens).
 * Match state lives in `PlayScreen` → `Session`, not here.
 */
import { Application } from "pixi.js";
import { MainMenu, MapSelect, NoticeScreen, ReplaySelect, ScreenHost } from "../../ui";
import {
  fetchMapCatalog,
  mapPickerOptions,
  replayInfo,
  ReplayStore,
  type MapCatalogEntry,
  type ReplayFile,
} from "../../session";
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
    this.screens?.show(
      new NoticeScreen("Multiplayer", "Not yet.", {
        onBack: () => this.showMenu(),
      }),
    );
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
