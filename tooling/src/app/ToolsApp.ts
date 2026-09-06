/**
 * Tools hub. No Pixi. World editor comes next.
 */
import { HubScreen } from "../ui/hub";
import { ScreenHost } from "../ui/screen";

export class ToolsApp {
  private screens: ScreenHost | null = null;

  constructor(
    gameRoot: HTMLElement,
    private readonly hudRoot: HTMLElement,
  ) {
    void gameRoot;
  }

  start(): void {
    this.screens = new ScreenHost(this.hudRoot);
    this.screens.show(new HubScreen());
  }

  stop(): void {
    this.screens?.clear();
    this.screens = null;
  }
}
