/**
 * Placeholder until a tool has a real screen.
 */
import { ToolScreen } from "./screen";

export class WipScreen extends ToolScreen {
  constructor(title: string, onBack: () => void) {
    super("screen menu");
    const panel = document.createElement("div");
    panel.className = "menu-panel";
    const h = document.createElement("h1");
    h.className = "menu-title";
    h.textContent = title;
    const body = document.createElement("p");
    body.className = "menu-body";
    body.textContent = "Work in progress.";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "menu-btn";
    back.textContent = "Back";
    back.addEventListener("click", onBack);
    panel.append(h, body, back);
    this.root.append(panel);
    this.onEscape(onBack);
  }
}
