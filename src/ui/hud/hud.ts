import {shortcuts,inputCaptured} from '../../shared/input/shortcuts';
import { graphicsControls } from "../menu/graphicsControls";
/**
 * In-match overlay: fps + zoom, Exit with confirm.
 */
export type HudState = {
  fps: number;
  zoom: number;
};

export type HudHooks = {
  onLeave: () => void;
  onSave?: () => void;
  onLoad?: (file: File) => void;
};

export class Hud {
  private readonly stats: HTMLDivElement;
  private readonly nav: HTMLDivElement;
  private confirm: HTMLDivElement | null = null;
  private settings: HTMLDialogElement | null = null;
  private readonly hooks: HudHooks;

  private openSettings:(()=>void)|null=null;
  private key=(e:KeyboardEvent)=>{if(!inputCaptured(e)&&!e.repeat&&shortcuts.matches('game.settings',e)){e.preventDefault();this.openSettings?.();}};
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
    const settings = document.createElement("button");
    settings.className = "hud-exit";
    settings.textContent = "Settings";
    settings.onclick = this.openSettings = () => {
      this.settings?.remove();
      const dialog = document.createElement("dialog");
      this.settings = dialog;
      dialog.className = "canopy-settings";
      dialog.setAttribute("aria-label", "Game settings");
      const title = document.createElement("h2");
      title.textContent = "Settings";
      const close = document.createElement("button");
      close.textContent = "Done";
      close.onclick = () => dialog.close();
      dialog.append(title, graphicsControls(), close);
      document.body.append(dialog);
      dialog.showModal();
    };
    this.nav.append(settings);
    if (hooks.onSave) {
      const save = document.createElement("button");
      save.className = "hud-exit";
      save.textContent = "Save";
      save.onclick = hooks.onSave;
      this.nav.append(save);
    }
    if (hooks.onLoad) {
      const load = document.createElement("button");
      load.className = "hud-exit";
      load.textContent = "Load";
      load.onclick = () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".utcsave,application/json";
        input.onchange = () => {
          if (input.files?.[0]) hooks.onLoad!(input.files[0]);
        };
        input.click();
      };
      this.nav.append(load);
    }
    this.nav.append(exit);

    host.append(this.stats, this.nav);
    window.addEventListener("keydown",this.key);
  }

  update(state: HudState): void {
    this.stats.textContent = `${state.fps} fps   zoom ${state.zoom.toFixed(1)}`;
  }

  destroy(): void {
    window.removeEventListener("keydown",this.key);
    this.settings?.remove();
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
