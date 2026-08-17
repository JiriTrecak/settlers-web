/**
 * Placeholder screen (multiplayer stub, etc.).
 */
import { GameScreen } from "../screen/screen";

export class NoticeScreen extends GameScreen {
  constructor(title: string, body: string, hooks: { onBack: () => void }) {
    super("screen menu");
    const panel = document.createElement("div");
    panel.className = "menu-panel";

    const head = document.createElement("div");
    head.className = "menu-head";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "menu-back";
    back.textContent = "Back";
    back.addEventListener("click", hooks.onBack);
    const h = document.createElement("h1");
    h.className = "menu-title";
    h.textContent = title;
    head.append(back, h);

    const p = document.createElement("p");
    p.className = "menu-body";
    p.textContent = body;

    panel.append(head, p);
    this.root.append(panel);
    this.onEscape(hooks.onBack);
  }
}
