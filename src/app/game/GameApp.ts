/**
 * Pixi host + lobby. Owns `#game` (canvas) and `#hud` (screens).
 * Match state lives in `PlayScreen` → `Session`, not here.
 */
import { Application } from "pixi.js";
import { MainMenu, MapSelect, NoticeScreen, ScreenHost } from "../../ui";
import { fetchMapCatalog, mapPickerOptions, type MapCatalogEntry } from "../../session";
import { parseBootIntent } from "./bootIntent";
import { PlayScreen } from "./playScreen";

const ASSETS_HREF = "/original_conv/viewer/index.html";

export class GameApp {
  private pixi: Application | null = null;
  private screens: ScreenHost | null = null;
  private catalog: MapCatalogEntry[] = [];
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
        onBack: () => this.showMenu(),
        onPick: (id) => {
          void this.play(id);
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
    if (current instanceof PlayScreen && current.mapId === id) return;
    const gen = ++this.playGen;
    const play = new PlayScreen(this.pixi, this.catalog, id, {
      onLeave: () => this.showMapSelect(),
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
}
