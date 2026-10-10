import {perf} from '../../debug/performance';
import {shortcuts} from '../../shared/input/shortcuts';
import { graphicsControls } from "../menu/graphicsControls";
/**
 * In-match navigation. Diagnostics live in the Debug window.
 */
export type HudState = {
  fps: number;
  zoom: number;
};

export type HudHooks = {
  onLeave: () => void;
  onMenu?:()=>void;
  onSave?: () => void;
  onLoad?: (file: File) => void;
};

export class Hud {
  private readonly nav: HTMLDivElement;
  private settings: HTMLDialogElement | null = null;

  private openSettings:(()=>void)|null=null;
  private key=(e:KeyboardEvent)=>{if(!e.defaultPrevented&&!document.querySelector('dialog[open]')&&!(e.target instanceof HTMLElement&&e.target.matches('input,textarea,select'))&&!e.repeat&&shortcuts.matches('game.settings',e)){e.preventDefault();this.openSettings?.();}};
  constructor(host: HTMLElement, hooks: HudHooks) {

    this.nav = document.createElement("div");
    this.nav.className = "hud-nav";
    const settings = document.createElement("button");
    settings.className = "hud-exit";
    settings.textContent = hooks.onMenu ? "Menu" : "Settings";
    settings.onclick = this.openSettings = () => {
      if(hooks.onMenu){hooks.onMenu();return;}
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

    host.append(this.nav);
    window.addEventListener("keydown",this.key);
  }

  get navigationHost():HTMLElement{return this.nav;}

  update(state: HudState): void {
    perf.value("FPS",state.fps);
    perf.value("Camera distance",Number(state.zoom.toFixed(1)));
  }

  destroy(): void {
    window.removeEventListener("keydown",this.key);
    this.settings?.remove();
    this.nav.remove();
  }

}
