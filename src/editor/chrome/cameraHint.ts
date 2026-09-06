/**
 * Bottom-right cheat sheet for editor camera binds. Play has no orbit.
 */
import { sheet } from "../../ui";

const FREE: [string, string][] = [
  ["LMB", "Pan"],
  ["RMB · MMB · Alt+LMB", "Orbit"],
  ["Wheel", "Zoom"],
  ["WASD", "Pan"],
  ["Home", "Gamecam"],
];

const GAME: [string, string][] = [
  ["LMB", "Pan"],
  ["WASD", "Pan"],
  ["Home", "Free cam"],
];

export class CameraHint {
  readonly root: HTMLElement;
  private readonly body: HTMLElement;

  constructor(host: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = `pointer-events-none absolute bottom-5 right-4 z-10 flex min-w-44 flex-col gap-1.5 rounded-2xl px-3 py-2.5 font-dock ${sheet}`;
    this.root.setAttribute("aria-label", "Camera controls");
    const title = document.createElement("span");
    title.className = "text-[11px] font-medium tracking-[0.14em] text-canopy/40 uppercase";
    title.textContent = "Camera";
    this.body = document.createElement("div");
    this.body.className = "flex flex-col gap-1.5";
    this.root.append(title, this.body);
    this.setGame(false);
    host.append(this.root);
  }

  setGame(on: boolean): void {
    this.body.replaceChildren();
    for (const [keys, action] of on ? GAME : FREE) {
      const row = document.createElement("div");
      row.className = "flex items-baseline justify-between gap-4";
      const k = document.createElement("span");
      k.className = "text-[11px] tracking-wide text-canopy/55";
      k.textContent = keys;
      const a = document.createElement("span");
      a.className = "text-[11px] font-medium tracking-wide text-canopy/80";
      a.textContent = action;
      row.append(k, a);
      this.body.append(row);
    }
  }

  destroy(): void {
    this.root.remove();
  }
}
