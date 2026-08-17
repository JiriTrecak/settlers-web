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

export type HudHooks = {
  onLeave: () => void;
  onShowPaths?: (on: boolean) => void;
  onShowOwnership?: (on: boolean) => void;
  onClaim?: (on: boolean) => void;
};

export class Hud {
  private readonly stats: HTMLDivElement;
  private readonly toggle: HTMLButtonElement;
  private readonly panel: HTMLDivElement;
  private readonly dump: HTMLPreElement;
  private readonly pathToggle: HTMLButtonElement;
  private readonly ownershipToggle: HTMLButtonElement;
  private readonly claimToggle: HTMLButtonElement;
  private readonly help: HTMLDivElement;
  private readonly leave: HTMLButtonElement;
  private readonly hooks: HudHooks;
  private open = false;
  private showPaths = false;
  private showOwnership = false;
  private claiming = false;
  private last: HudState = { cursor: null, landscape: null, height: null, zoom: 1 };

  constructor(host: HTMLElement, hooks: HudHooks) {
    this.hooks = hooks;
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
    this.pathToggle = optButton("paths", "Draw remaining walk queues", () => {
      this.showPaths = !this.showPaths;
      this.syncOpts();
      hooks.onShowPaths?.(this.showPaths);
    });
    this.ownershipToggle = optButton("ownership", "Draw owned cells", () => {
      this.showOwnership = !this.showOwnership;
      this.syncOpts();
      hooks.onShowOwnership?.(this.showOwnership);
    });
    this.claimToggle = optButton("claim", "Click a cell to stamp a tower-radius occupy disk", () => {
      this.setClaiming(!this.claiming);
    });
    opts.append(this.pathToggle, this.ownershipToggle, this.claimToggle);

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
    this.syncOpts();
  }

  /** Build strip picked a hut — claim tool yields. `emit` false skips the session callback. */
  setClaiming(on: boolean, emit = true): void {
    this.claiming = on;
    if (on && !this.showOwnership) {
      this.showOwnership = true;
      this.hooks.onShowOwnership?.(true);
    }
    this.syncOpts();
    if (emit) this.hooks.onClaim?.(on);
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

  private syncOpts(): void {
    this.pathToggle.classList.toggle("is-selected", this.showPaths);
    this.ownershipToggle.classList.toggle("is-selected", this.showOwnership);
    this.claimToggle.classList.toggle("is-selected", this.claiming);
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

function optButton(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  btn.title = title;
  btn.addEventListener("click", onClick);
  return btn;
}
