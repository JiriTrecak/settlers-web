/**
 * Tool picker. Each card opens a tool; unimplemented ones land on WIP.
 */
import { ToolScreen } from "./screen";

export const TOOLS = [
  { id: "map", label: "Map editor", blurb: "Terrain, deposits, starts." },
  { id: "economy", label: "Economy editor", blurb: "Buildings, goods, professions." },
] as const;

export type ToolId = (typeof TOOLS)[number]["id"];

export class HubScreen extends ToolScreen {
  constructor(onPick: (id: ToolId) => void) {
    super("screen menu");
    const panel = document.createElement("div");
    panel.className = "menu-panel";
    const title = document.createElement("h1");
    title.className = "menu-title";
    title.textContent = "Forest Empire";
    const sub = document.createElement("p");
    sub.className = "menu-body";
    sub.textContent = "Tools";
    panel.append(title, sub);
    for (const tool of TOOLS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "menu-btn";
      const name = document.createElement("span");
      name.className = "menu-btn-label";
      name.textContent = tool.label;
      const blurb = document.createElement("span");
      blurb.className = "menu-btn-blurb";
      blurb.textContent = tool.blurb;
      btn.append(name, blurb);
      btn.addEventListener("click", () => onPick(tool.id));
      panel.append(btn);
    }
    this.root.append(panel);
  }
}
