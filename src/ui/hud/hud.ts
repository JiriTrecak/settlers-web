/**
 * In-match overlay. Compact stats always on; F3 / ` / button expands the debug dump.
 * Leave is Escape / Menu — not a map picker.
 */
import type { GridPos, LandscapeType } from "../../shared";
import { formatDebug, type DebugStats } from "./debug";

export type HudState = {
  cursor: GridPos | null;
  landscape: LandscapeType | null;
  height: number | null;
  zoom: number;
  debug?: DebugStats;
};

export class Hud {
  private readonly stats: HTMLDivElement;
  private readonly toggle: HTMLButtonElement;
  private readonly panel: HTMLDivElement;
  private readonly dump: HTMLPreElement;
  private readonly pathToggle: HTMLButtonElement;
  private readonly help: HTMLDivElement;
  private readonly leave: HTMLButtonElement;
  private open = false;
  private showPaths = false;
  private last: HudState = { cursor: null, landscape: null, height: null, zoom: 1 };

  constructor(host: HTMLElement, hooks: { onLeave: () => void; onShowPaths?: (on: boolean) => void }) {
    this.stats = document.createElement("div");
    this.stats.className = "hud-stats";

    this.toggle = document.createElement("button");
    this.toggle.type = "button";
    this.toggle.className = "hud-debug-toggle";
    this.toggle.textContent = "F3";
    this.toggle.title = "Debug overlay (F3)";
    this.toggle.addEventListener("click", () => this.setOpen(!this.open));

    this.panel = document.createElement("div");
    this.panel.className = "hud-debug";
    this.panel.hidden = true;

    const opts = document.createElement("div");
    opts.className = "hud-debug-opts";
    this.pathToggle = document.createElement("button");
    this.pathToggle.type = "button";
    this.pathToggle.textContent = "paths";
    this.pathToggle.title = "Draw remaining walk queues";
    this.pathToggle.addEventListener("click", () => {
      this.showPaths = !this.showPaths;
      this.syncPathToggle();
      hooks.onShowPaths?.(this.showPaths);
    });
    opts.append(this.pathToggle);

    this.dump = document.createElement("pre");
    this.dump.className = "hud-debug-dump";
    this.panel.append(opts, this.dump);

    this.help = document.createElement("div");
    this.help.className = "hud-help";
    this.help.textContent =
      "pick a hut, click to place  ·  bearers haul planks & stone  ·  drag / WASD  ·  wheel zoom  ·  space fit  ·  F3 debug  ·  esc menu";

    this.leave = document.createElement("button");
    this.leave.type = "button";
    this.leave.className = "hud-leave";
    this.leave.textContent = "Menu";
    this.leave.addEventListener("click", hooks.onLeave);

    host.append(this.stats, this.toggle, this.panel, this.help, this.leave);
    window.addEventListener("keydown", this.onKey);
    this.syncPathToggle();
  }

  update(state: HudState): void {
    if (state.debug) this.last = state;
    else this.last = { ...this.last, ...state };
    this.paint();
  }

  destroy(): void {
    window.removeEventListener("keydown", this.onKey);
    this.stats.remove();
    this.toggle.remove();
    this.panel.remove();
    this.help.remove();
    this.leave.remove();
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (e.key !== "F3" && e.key !== "`") return;
    e.preventDefault();
    this.setOpen(!this.open);
  };

  private setOpen(open: boolean): void {
    this.open = open;
    this.panel.hidden = !open;
    this.toggle.classList.toggle("is-selected", open);
    this.paint();
  }

  private syncPathToggle(): void {
    this.pathToggle.classList.toggle("is-selected", this.showPaths);
  }

  private paint(): void {
    const s = this.last;
    const fps = s.debug ? `${s.debug.fps.toFixed(0)} fps` : "— fps";
    const tile = s.cursor
      ? `${s.cursor.x}, ${s.cursor.y}   ${s.landscape ?? "—"}   h=${s.height ?? 0}`
      : "—";
    this.stats.textContent = `${fps}   ${tile}\n${s.zoom.toFixed(2)}×`;
    if (this.open && s.debug) this.dump.textContent = formatDebug(s.debug);
  }
}
