/**
 * Boot screen: single player / multiplayer / asset browser.
 */
import { GameScreen } from "../screen/screen";

export type MapOptionGroup = "tutorial" | "single" | "multi" | "generated";

export type MapOption = {
  id: string;
  name: string;
  group: MapOptionGroup;
  detail?: string;
};

export type MainMenuHooks = {
  onSinglePlayer(): void;
  onMultiplayer(): void;
  onAssets(): void;
};

export class MainMenu extends GameScreen {
  constructor(hooks: MainMenuHooks) {
    super("screen menu");
    const panel = document.createElement("div");
    panel.className = "menu-panel";
    const title = document.createElement("h1");
    title.className = "menu-title";
    title.textContent = "Settlers";
    panel.append(
      title,
      button("Single player", hooks.onSinglePlayer),
      button("Multiplayer", hooks.onMultiplayer),
      button("Asset browser", hooks.onAssets),
    );
    this.root.append(panel);
  }
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "menu-btn";
  el.textContent = label;
  el.addEventListener("click", onClick);
  return el;
}
