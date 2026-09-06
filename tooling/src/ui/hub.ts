/**
 * Tool picker. World editor lives in the game now.
 */
import { ToolScreen } from "./screen";

export class HubScreen extends ToolScreen {
  constructor() {
    super("flex h-full min-h-screen items-center justify-center bg-ink text-canopy");
    const panel = document.createElement("div");
    panel.className = "w-[22rem] rounded-xl border border-canopy/15 bg-white/5 p-6 shadow-xl shadow-black/40";
    const kicker = document.createElement("p");
    kicker.className = "mb-1 text-[11px] uppercase tracking-[0.2em] text-canopy/50";
    kicker.textContent = "Tools";
    const title = document.createElement("h1");
    title.className = "mb-2 text-2xl font-semibold tracking-wide";
    title.textContent = "Under the Canopy";
    const sub = document.createElement("p");
    sub.className = "mb-6 text-sm leading-relaxed text-canopy/70";
    sub.textContent = "World editor is in the game — menu → World editor, or ?screen=editor.";
    const card = document.createElement("div");
    card.className = "rounded-lg border border-moss/40 bg-moss/20 px-4 py-3 text-sm text-canopy/80";
    card.textContent = "This hub is for other tools. Nothing here yet.";
    panel.append(kicker, title, sub, card);
    this.root.append(panel);
  }
}
