/**
 * Placeholder until a tool has a real screen.
 */
import { ToolScreen } from "./screen";

export class WipScreen extends ToolScreen {
  constructor(title: string, onBack: () => void) {
    super("flex h-full min-h-screen items-center justify-center bg-ink text-canopy");
    const panel = document.createElement("div");
    panel.className = "w-[22rem] rounded-xl border border-canopy/15 bg-white/5 p-6";
    const h = document.createElement("h1");
    h.className = "mb-2 text-xl font-semibold";
    h.textContent = title;
    const body = document.createElement("p");
    body.className = "mb-6 text-sm text-canopy/70";
    body.textContent = "Work in progress.";
    const back = document.createElement("button");
    back.type = "button";
    back.className =
      "w-full rounded-lg border border-canopy/25 bg-ink px-4 py-2.5 text-left text-sm tracking-wide hover:border-canopy/50";
    back.textContent = "Back";
    back.addEventListener("click", onBack);
    panel.append(h, body, back);
    this.root.append(panel);
    this.onEscape(onBack);
  }
}
