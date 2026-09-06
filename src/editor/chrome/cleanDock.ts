/**
 * Sibling dock for the clean tool: wipe type + disc size.
 */
import { CLEAN_RADIUS_MAX, CLEAN_RADIUS_MIN, CLEAN_TYPES, type CleanType } from "../clean/clean";
import { field, sheet } from "../../ui";

export type CleanDockState = {
  radius: number;
  type: CleanType;
};

export type CleanDockHooks = {
  onCleanRadius(n: number): void;
  onCleanType(type: CleanType): void;
};

export class CleanDock {
  readonly root: HTMLElement;
  private readonly size: HTMLInputElement;
  private readonly sizeVal: HTMLElement;
  private readonly pick: HTMLSelectElement;

  constructor(host: HTMLElement, private readonly hooks: CleanDockHooks) {
    this.root = document.createElement("div");
    this.root.className = `pointer-events-auto flex w-56 min-w-0 flex-col gap-1.5 overflow-hidden rounded-2xl p-2 font-dock ${sheet}`;
    this.root.setAttribute("aria-label", "Clean");
    const title = document.createElement("span");
    title.className = "text-[11px] font-medium tracking-[0.14em] text-canopy/40 uppercase";
    title.textContent = "Clean";
    const typeRow = row("Type");
    this.pick = document.createElement("select");
    this.pick.className = `${field} min-w-0 w-full px-1.5 py-1 text-[12px]`;
    for (const t of CLEAN_TYPES) {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.ready ? t.name : `${t.name} (soon)`;
      opt.disabled = !t.ready;
      this.pick.append(opt);
    }
    this.pick.addEventListener("change", () => this.hooks.onCleanType(this.pick.value as CleanType));
    typeRow.append(this.pick);
    const sizeRow = row("Size");
    this.size = slider(CLEAN_RADIUS_MIN, CLEAN_RADIUS_MAX, 0.5);
    this.sizeVal = value();
    sizeRow.append(slideRow(this.size, this.sizeVal));
    this.size.addEventListener("input", () => this.hooks.onCleanRadius(Number(this.size.value)));
    const hint = document.createElement("p");
    hint.className = "text-[10px] leading-4 tracking-wide text-canopy/40";
    hint.textContent = "Drag to wipe · Space+drag pan · Shift+wheel size";
    this.root.append(title, typeRow, sizeRow, hint);
    this.root.classList.add("hidden");
    host.append(this.root);
  }

  setOpen(on: boolean): void {
    this.root.classList.toggle("hidden", !on);
  }

  set(state: CleanDockState): void {
    this.size.value = String(state.radius);
    this.sizeVal.textContent = state.radius.toFixed(1);
    this.pick.value = state.type;
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
