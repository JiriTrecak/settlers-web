/**
 * Pixi host + tool screens. Owns `#game` (canvas) and `#hud` (overlay).
 * Individual tools get their own screens later; they may pull `src/render` in.
 */
import { Application } from "pixi.js";
import { HubScreen, TOOLS, type ToolId } from "../ui/hub";
import { ScreenHost } from "../ui/screen";
import { WipScreen } from "../ui/wip";

export class ToolsApp {
  private pixi: Application | null = null;
  private screens: ScreenHost | null = null;

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
    pixi.ticker.add((ticker) => {
      this.screens?.tick(ticker.deltaMS, performance.now());
    });
    this.showHub();
  }

  stop(): void {
    this.screens?.clear();
    this.screens = null;
    this.pixi?.destroy(true);
    this.pixi = null;
  }

  private showHub(): void {
    this.screens?.show(new HubScreen((id) => this.openTool(id)));
  }

  private openTool(id: ToolId): void {
    const label = TOOLS.find((t) => t.id === id)?.label ?? id;
    this.screens?.show(new WipScreen(label, () => this.showHub()));
  }
}
