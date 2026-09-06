/**
 * Tool picker. World editor is the next track.
 */
import { ToolScreen } from "./screen";

export class HubScreen extends ToolScreen {
  constructor() {
    super("screen menu");
    const panel = document.createElement("div");
    panel.className = "menu-panel";
    const title = document.createElement("h1");
    title.className = "menu-title";
    title.textContent = "Under the Canopy";
    const sub = document.createElement("p");
    sub.className = "menu-body";
    sub.textContent = "World editor next.";
    panel.append(title, sub);
    this.root.append(panel);
  }
}
