/**
 * In-match overlay. Compact stats always on; F3 / ` / button expands the debug dump.
 * Exit asks before leaving. Escape deselects (session), not leave.
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
  onShowFog?: (on: boolean) => void;
  onClaim?: (on: boolean) => void;
};

export class Hud {
  private readonly host: HTMLElement;
  private readonly stats: HTMLDivElement;
  private readonly toggle: HTMLButtonElement;
  private readonly panel: HTMLDivElement;
  private readonly dump: HTMLPreElement;
  private readonly pathToggle: HTMLButtonElement;
  private readonly ownershipToggle: HTMLButtonElement;
  private readonly fogToggle: HTMLButtonElement;
  private readonly claimToggle: HTMLButtonElement;
  private readonly exit: HTMLButtonElement;
  private confirm: HTMLDivElement | null = null;
  private readonly hooks: HudHooks;
  private open = false;
  private showPaths = false;
  private showOwnership = false;
  private showFog = true;
  private claiming = false;
  private last: HudState = { cursor: null, landscape: null, height: null, zoom: 1 };
  private fpsShown = 60;
  private fpsFrames = 0;
  private fpsMs = 0;

  constructor(host: HTMLElement, hooks: HudHooks) {
    this.host = host;
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
    this.fogToggle = optButton("fog", "Fog of war (off = see everything)", () => {
      this.showFog = !this.showFog;
      this.syncOpts();
      hooks.onShowFog?.(this.showFog);
    });
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
    opts.append(this.fogToggle, this.pathToggle, this.ownershipToggle, this.claimToggle);

    this.dump = document.createElement("pre");
    this.dump.className = "hud-debug-dump";
    this.panel.append(opts, this.dump);

    this.exit = document.createElement("button");
    this.exit.type = "button";
    this.exit.className = "hud-exit";
    this.exit.textContent = "Exit";
    this.exit.title = "Leave this match";
    this.exit.addEventListener("click", () => this.askLeave());

    host.append(this.stats, this.toggle, this.panel, this.exit);
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
    if (state.debug) {
      this.last = state;
      this.fpsFrames += 1;
      this.fpsMs += state.debug.dtMs;
      if (this.fpsMs >= 1000) {
        this.fpsShown = Math.round((this.fpsFrames * 1000) / this.fpsMs);
        this.fpsFrames = 0;
        this.fpsMs = 0;
      }
    } else {
      this.last = { ...this.last, ...state };
    }
    this.paint();
  }

  destroy(): void {
    window.removeEventListener("keydown", this.onKey);
    this.dismissConfirm();
    this.stats.remove();
    this.toggle.remove();
    this.panel.remove();
    this.exit.remove();
  }

  private askLeave(): void {
    if (this.confirm) return;
    const overlay = document.createElement("div");
    overlay.className = "hud-confirm";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "hud-confirm-title");

    const panel = document.createElement("div");
    panel.className = "hud-confirm-panel";

    const title = document.createElement("h2");
    title.id = "hud-confirm-title";
    title.className = "hud-confirm-title";
    title.textContent = "Leave this match?";

    const body = document.createElement("p");
    body.className = "hud-confirm-body";
    body.textContent = "Progress is not saved.";

    const actions = document.createElement("div");
    actions.className = "hud-confirm-actions";
    const stay = document.createElement("button");
    stay.type = "button";
    stay.textContent = "Stay";
    stay.addEventListener("click", () => this.dismissConfirm());
    const leave = document.createElement("button");
    leave.type = "button";
    leave.className = "is-danger";
    leave.textContent = "Exit";
    leave.addEventListener("click", () => this.hooks.onLeave());
    actions.append(stay, leave);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) this.dismissConfirm();
    });
    panel.append(title, body, actions);
    overlay.append(panel);
    this.host.append(overlay);
    this.confirm = overlay;
    window.addEventListener("keydown", this.onConfirmKey, true);
    stay.focus();
  }

  private dismissConfirm(): void {
    if (!this.confirm) return;
    window.removeEventListener("keydown", this.onConfirmKey, true);
    this.confirm.remove();
    this.confirm = null;
  }

  private readonly onConfirmKey = (e: KeyboardEvent): void => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.dismissConfirm();
  };

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
    this.fogToggle.classList.toggle("is-selected", this.showFog);
    this.pathToggle.classList.toggle("is-selected", this.showPaths);
    this.ownershipToggle.classList.toggle("is-selected", this.showOwnership);
    this.claimToggle.classList.toggle("is-selected", this.claiming);
  }

  private paint(): void {
    const s = this.last;
    const fps = `${this.fpsShown} fps`;
    const load =
      s.debug && (s.debug.simMs >= 1 || s.debug.simPerFrame > 1)
        ? `   sim ${s.debug.simMs.toFixed(0)}ms ${s.debug.simPerFrame}t`
        : "";
    const tile = s.cursor
      ? `${s.cursor.x}, ${s.cursor.y}   ${s.landscape ?? "—"}   h=${s.height ?? 0}`
      : "—";
    this.stats.textContent = `${fps}${load}   ${tile}\n${s.zoom.toFixed(2)}×`;
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
