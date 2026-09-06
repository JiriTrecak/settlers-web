/**
 * Editor overlay docks. Name + file on top, tools left, catalog right.
 */
import { AssetBrowser, IconBar, type AssetCard } from "../../ui";
import { DocTitle } from "./docTitle";
import { fileTools, gameTools, type FileToolHooks, type GameToolHooks } from "./tools";

export type EditorChromeHooks = FileToolHooks &
  GameToolHooks & {
    assets: readonly AssetCard[];
    onAsset(id: string): void;
    onName(name: string): void;
  };

export class EditorChrome {
  private readonly top: HTMLElement;
  private readonly title: DocTitle;
  private readonly file: IconBar;
  private readonly game: IconBar;
  private readonly browser: AssetBrowser;

  constructor(host: HTMLElement, hooks: EditorChromeHooks) {
    this.top = document.createElement("div");
    this.top.className = "pointer-events-none absolute left-1/2 top-4 flex -translate-x-1/2 flex-col items-center gap-2";
    host.append(this.top);
    this.title = new DocTitle(this.top, { onName: hooks.onName });
    this.file = new IconBar(this.top, { place: "inline", label: "File", items: fileTools(hooks) });
    this.game = new IconBar(host, { place: "left", label: "Tools", items: gameTools(hooks) });
    this.browser = new AssetBrowser(host, { assets: hooks.assets, onSelect: hooks.onAsset });
  }

  setTool(id: string | null): void {
    this.game.setActive(id);
  }

  setAsset(id: string | null): void {
    this.browser.setActive(id);
  }

  setName(name: string): void {
    this.title.setName(name);
  }

  setDirty(dirty: boolean): void {
    this.title.setDirty(dirty);
  }

  destroy(): void {
    this.title.destroy();
    this.file.destroy();
    this.game.destroy();
    this.browser.destroy();
    this.top.remove();
  }
}
