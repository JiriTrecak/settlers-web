/**
 * Boot screen: single player / multiplayer.
 */
import { GameScreen } from "../screen/screen";

export type MainMenuHooks = {
  onSinglePlayer(): void;
  onMultiplayer(): void;
};

export class MainMenu extends GameScreen {
  constructor(hooks: MainMenuHooks) {
    super("screen menu");
    const panel = document.createElement("div");
    panel.className = "menu-panel";
    const title = document.createElement("h1");
    title.className = "menu-title";
    title.textContent = "Under the Canopy";
    panel.append(title, button("Single player", hooks.onSinglePlayer), button("Multiplayer", hooks.onMultiplayer));
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
