/**
 * In-match overlay. Stats + help. Leave is Escape / Menu — not a map picker.
 */
import type { GridPos, LandscapeType } from "../../shared";

export type HudState = {
  cursor: GridPos | null;
  landscape: LandscapeType | null;
  height: number | null;
  zoom: number;
};

export class Hud {
  private readonly stats: HTMLDivElement;
  private readonly help: HTMLDivElement;
  private readonly leave: HTMLButtonElement;

  constructor(host: HTMLElement, hooks: { onLeave: () => void }) {
    this.stats = document.createElement("div");
    this.stats.className = "hud-stats";

    this.help = document.createElement("div");
    this.help.className = "hud-help";
    this.help.textContent = "click to walk  ·  drag / WASD pan  ·  wheel zoom  ·  minimap  ·  space fit  ·  esc menu";

    this.leave = document.createElement("button");
    this.leave.type = "button";
    this.leave.className = "hud-leave";
    this.leave.textContent = "Menu";
    this.leave.addEventListener("click", hooks.onLeave);

    host.append(this.stats, this.help, this.leave);
  }

  update(state: HudState): void {
    const tile = state.cursor
      ? `${state.cursor.x}, ${state.cursor.y}   ${state.landscape ?? "—"}   h=${state.height ?? 0}`
      : "—";
    this.stats.textContent = `${tile}\n${state.zoom.toFixed(2)}×`;
  }

  destroy(): void {
    this.stats.remove();
    this.help.remove();
    this.leave.remove();
  }
}
