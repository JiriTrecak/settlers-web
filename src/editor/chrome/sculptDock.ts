/**
 * Sibling dock for sculpt: disc size, strength, water level.
 */
import {
  SCULPT_RADIUS_MAX,
  SCULPT_RADIUS_MIN,
  SCULPT_STRENGTH_MAX,
  SCULPT_STRENGTH_MIN,
} from "../sculpt/sculpt";
import { field, sheet } from "../../ui";

export type SculptDockState = {
  radius: number;
  strength: number;
  waterLevel: number;
};

export type SculptDockHooks = {
  onSculptRadius(n: number): void;
  onSculptStrength(n: number): void;
  onWaterLevel(n: number): void;
};

export class SculptDock {
  readonly root: HTMLElement;
  private readonly size: HTMLInputElement;
  private readonly sizeVal: HTMLElement;
  private readonly str: HTMLInputElement;
  private readonly strVal: HTMLElement;
  private readonly sea: HTMLInputElement;

  constructor(host: HTMLElement, private readonly hooks: SculptDockHooks) {
    this.root = document.createElement("div");
    this.root.className = `pointer-events-auto flex w-56 min-w-0 flex-col gap-1.5 overflow-hidden rounded-2xl p-2 font-dock ${sheet}`;
    this.root.setAttribute("aria-label", "Sculpt");
    const title = document.createElement("span");
    title.className = "text-[11px] font-medium tracking-[0.14em] text-canopy/40 uppercase";
    title.textContent = "Sculpt";
    const sizeRow = row("Size");
    this.size = slider(SCULPT_RADIUS_MIN, SCULPT_RADIUS_MAX, 0.5);
    this.sizeVal = value();
    sizeRow.append(slideRow(this.size, this.sizeVal));
    this.size.addEventListener("input", () => this.hooks.onSculptRadius(Number(this.size.value)));
    const strRow = row("Strength");
    this.str = slider(SCULPT_STRENGTH_MIN, SCULPT_STRENGTH_MAX, 0.02);
    this.strVal = value();
    strRow.append(slideRow(this.str, this.strVal));
    this.str.addEventListener("input", () => this.hooks.onSculptStrength(Number(this.str.value)));
    const seaRow = row("Water");
    this.sea = document.createElement("input");
    this.sea.type = "number";
    this.sea.step = "0.1";
    this.sea.className = `${field} spin-none min-w-0 w-full px-1.5 py-1 text-[12px] tabular-nums`;
    this.sea.addEventListener("change", () => this.hooks.onWaterLevel(Number(this.sea.value)));
    seaRow.append(this.sea);
    const hint = document.createElement("p");
    hint.className = "text-[10px] leading-4 tracking-wide text-canopy/40";
    hint.textContent = "Drag raise · Shift lower · Space+drag pan · Shift+wheel size";
    this.root.append(title, sizeRow, strRow, seaRow, hint);
    this.root.classList.add("hidden");
    host.append(this.root);
  }

  setOpen(on: boolean): void {
    this.root.classList.toggle("hidden", !on);
  }

  set(state: SculptDockState): void {
    this.size.value = String(state.radius);
    this.sizeVal.textContent = state.radius.toFixed(1);
    this.str.value = String(state.strength);
    this.strVal.textContent = state.strength.toFixed(2);
    if (this.sea !== document.activeElement) this.sea.value = String(state.waterLevel);
  }

  destroy(): void {
    this.root.remove();
  }
}

function cap(name: string): HTMLElement {
  const el = document.createElement("span");
  el.className = "text-[10px] font-medium tracking-[0.12em] text-canopy/40 uppercase";
  el.textContent = name;
  return el;
}

function row(name: string): HTMLElement {
  const el = document.createElement("label");
  el.className = "flex flex-col gap-1";
  el.append(cap(name));
  return el;
}

function slideRow(input: HTMLInputElement, val: HTMLElement): HTMLElement {
  const el = document.createElement("div");
  el.className = "flex items-center gap-2";
  el.append(input, val);
  return el;
}

function slider(min: number, max: number, step: number): HTMLInputElement {
  const el = document.createElement("input");
  el.type = "range";
  el.min = String(min);
  el.max = String(max);
  el.step = String(step);
  el.className = "h-1 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-canopy";
  return el;
}

function value(): HTMLElement {
  const el = document.createElement("span");
  el.className = "text-[11px] tabular-nums tracking-wide text-canopy/70";
  return el;
}
