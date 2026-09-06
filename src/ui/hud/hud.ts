/**
 * In-match overlay: fps + zoom, Exit with confirm.
 */
export type HudState = {
  fps: number;
  zoom: number;
};

export type HudHooks = {
  onLeave: () => void;
};

export class Hud {
  private readonly stats: HTMLDivElement;
  private readonly nav: HTMLDivElement;
  private confirm: HTMLDivElement | null = null;
  private readonly hooks: HudHooks;

  constructor(host: HTMLElement, hooks: HudHooks) {
    this.hooks = hooks;
    this.stats = document.createElement("div");
    this.stats.className = "hud-stats";

    this.nav = document.createElement("div");
    this.nav.className = "hud-nav";
    const exit = document.createElement("button");
    exit.type = "button";
    exit.className = "hud-exit";
    exit.textContent = "Exit";
    exit.addEventListener("click", () => this.askLeave());
    this.nav.append(exit);

    host.append(this.stats, this.nav);
  }

  update(state: HudState): void {
    this.stats.textContent = `${state.fps} fps   zoom ${state.zoom.toFixed(1)}`;
  }

  destroy(): void {
    this.dismissConfirm();
    this.stats.remove();
    this.nav.remove();
  }

  private askLeave(): void {
    if (this.confirm) return;
    const overlay = document.createElement("div");
    overlay.className = "hud-confirm";
    overlay.setAttribute("role", "dialog");
    const panel = document.createElement("div");
    panel.className = "hud-confirm-panel";
    const title = document.createElement("h2");
    title.className = "hud-confirm-title";
    title.textContent = "Leave this match?";
    const actions = document.createElement("div");
    actions.className = "hud-confirm-actions";
    const stay = document.createElement("button");
    stay.type = "button";
    stay.textContent = "Stay";
    stay.addEventListener("click", () => this.dismissConfirm());
    const leave = document.createElement("button");
    leave.type = "button";
    leave.className = "is-danger";
    leave.textContent = "Leave";
    leave.addEventListener("click", () => {
      this.dismissConfirm();
      this.hooks.onLeave();
    });
    actions.append(stay, leave);
    panel.append(title, actions);
    overlay.append(panel);
    this.stats.parentElement?.append(overlay);
    this.confirm = overlay;
  }

  private dismissConfirm(): void {
    this.confirm?.remove();
    this.confirm = null;
  }
}
