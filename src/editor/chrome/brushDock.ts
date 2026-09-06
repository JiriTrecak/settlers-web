/**
 * Sibling dock for the foliage brush: kit rows, % / scale, named presets, apply.
 */
import { createElement, Plus, Trash2 } from "lucide";
import { PreviewCache } from "../../render";
import { btn, btnDanger, btnPrimary, field, sheet } from "../../ui";
import { BRUSH_DENSITY_MAX, BRUSH_DENSITY_MIN, BRUSH_RADIUS_MAX, BRUSH_RADIUS_MIN } from "../brush/brush";
import { BRUSH_SCALE_MAX, BRUSH_SCALE_MIN } from "../brush/kit";
import type { BrushSlot } from "../brush/kit";
import type { BrushPreset } from "../brush/presets";

export type BrushDockSlot = BrushSlot & { name: string; url?: string };

export type BrushDockState = {
  radius: number;
  density: number;
  ready: boolean;
  slots: readonly BrushDockSlot[];
  presets: readonly BrushPreset[];
  active: string | null;
  presetName: string;
};

export type BrushDockHooks = {
  onRadius(n: number): void;
  onDensity(n: number): void;
  onApply(): void;
  onNewPreset(): void;
  onAddSlot(): void;
  onRemoveSlot(id: string): void;
  onSlotPct(id: string, pct: number): void;
  onSlotScale(id: string, scale: number): void;
  onSavePreset(name: string): void;
  onDeletePreset(): void;
  onLoadPreset(id: string): void;
};

export class BrushDock {
  readonly root: HTMLElement;
  private readonly size: HTMLInputElement;
  private readonly sizeVal: HTMLElement;
  private readonly dens: HTMLInputElement;
  private readonly densVal: HTMLElement;
  private readonly apply: HTMLButtonElement;
  private readonly name: HTMLInputElement;
  private readonly pick: HTMLSelectElement;
  private readonly items: HTMLElement;
  private readonly previews = new PreviewCache();
  private sig: string | null = null;

  constructor(
    host: HTMLElement,
    private readonly hooks: BrushDockHooks,
  ) {
    this.root = document.createElement("div");
    this.root.className = `pointer-events-auto flex w-64 min-w-0 flex-col gap-1.5 overflow-hidden rounded-2xl p-2 font-dock ${sheet}`;
    this.root.setAttribute("aria-label", "Brush");
    const head = document.createElement("div");
    head.className = "flex min-w-0 items-center gap-1.5";
    const title = document.createElement("span");
    title.className = "shrink-0 text-[11px] font-medium tracking-[0.14em] text-canopy/40 uppercase";
    title.textContent = "Brush";
    this.name = document.createElement("input");
    this.name.type = "text";
    this.name.placeholder = "Name";
    this.name.className = `${field} min-w-0 flex-1 overflow-hidden px-1.5 py-1 text-[12px]`;
    const fresh = document.createElement("button");
    fresh.type = "button";
    fresh.className = `${btn} shrink-0 px-1.5 py-1 text-canopy/55`;
    fresh.setAttribute("aria-label", "New brush");
    fresh.title = "New empty brush";
    fresh.append(createElement(Plus, { width: 14, height: 14, "stroke-width": 1.75, class: "pointer-events-none" }));
    fresh.addEventListener("click", () => this.hooks.onNewPreset());
    head.append(title, this.name, fresh);
    const presetRow = document.createElement("div");
    presetRow.className = "flex min-w-0 items-center gap-1";
    this.pick = document.createElement("select");
    this.pick.className = `${field} min-w-0 flex-1 px-1.5 py-1 text-[12px]`;
    this.pick.addEventListener("change", () => {
      if (this.pick.value) this.hooks.onLoadPreset(this.pick.value);
    });
    const save = document.createElement("button");
    save.type = "button";
    save.className = `${btnPrimary} shrink-0 px-2 py-1 text-[12px]`;
    save.textContent = "Save";
    save.addEventListener("click", () => this.hooks.onSavePreset(this.name.value));
    const del = document.createElement("button");
    del.type = "button";
    del.className = `${btnDanger} shrink-0 px-1.5 py-1`;
    del.setAttribute("aria-label", "Delete preset");
    del.append(
      createElement(Trash2, { width: 14, height: 14, "stroke-width": 1.75, class: "pointer-events-none" }),
    );
    del.addEventListener("click", () => this.hooks.onDeletePreset());
    presetRow.append(this.pick, save, del);
    this.items = document.createElement("div");
    this.items.className = "flex min-w-0 flex-col gap-1";
    const sizeRow = row("Size");
    this.size = slider(BRUSH_RADIUS_MIN, BRUSH_RADIUS_MAX, 0.5);
    this.sizeVal = value();
    sizeRow.append(slideRow(this.size, this.sizeVal));
    this.size.addEventListener("input", () => this.hooks.onRadius(Number(this.size.value)));
    const densRow = row("Density");
    this.dens = slider(BRUSH_DENSITY_MIN, BRUSH_DENSITY_MAX, 0.05);
    this.densVal = value();
    densRow.append(slideRow(this.dens, this.densVal));
    this.dens.addEventListener("input", () => this.hooks.onDensity(Number(this.dens.value)));
    this.apply = document.createElement("button");
    this.apply.type = "button";
    this.apply.className = `${btnPrimary} w-full`;
    this.apply.textContent = "Apply";
    this.apply.addEventListener("click", () => this.hooks.onApply());
    const hint = document.createElement("p");
    hint.className = "text-[10px] leading-4 tracking-wide text-canopy/40";
    hint.textContent = "Space+drag pan · Shift erase · Shift+wheel size · Ctrl+wheel density";
    this.root.append(head, presetRow, cap("Items"), this.items, sizeRow, densRow, this.apply, hint);
    this.root.classList.add("hidden");
    host.append(this.root);
  }

  setOpen(on: boolean): void {
    this.root.classList.toggle("hidden", !on);
  }

  set(state: BrushDockState): void {
    this.size.value = String(state.radius);
    this.sizeVal.textContent = state.radius.toFixed(1);
    this.dens.value = String(state.density);
    this.densVal.textContent = state.density.toFixed(2);
    this.apply.disabled = !state.ready;
    if (this.name !== document.activeElement) this.name.value = state.presetName;
    this.fillPresets(state.presets, state.active);
    const sig = state.slots.map((s) => s.id).join("|");
    if (sig !== this.sig) {
      this.sig = sig;
      this.fillSlots(state.slots);
      return;
    }
    for (const slot of state.slots) {
      const pct = this.items.querySelector<HTMLInputElement>(`[data-pct="${slot.id}"]`);
      if (pct && pct !== document.activeElement) pct.value = String(slot.pct);
      const scale = this.items.querySelector<HTMLInputElement>(`[data-scale="${slot.id}"]`);
      if (scale && scale !== document.activeElement) scale.value = String(slot.scale);
    }
  }

  destroy(): void {
    this.previews.destroy();
    this.root.remove();
  }

  private fillPresets(presets: readonly BrushPreset[], active: string | null): void {
    this.pick.replaceChildren();
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = presets.length ? "Load preset…" : "No presets";
    this.pick.append(blank);
    for (const p of presets) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      this.pick.append(opt);
    }
    this.pick.value = active ?? "";
  }

  private fillSlots(slots: readonly BrushDockSlot[]): void {
    this.items.replaceChildren();
    for (const slot of slots) this.items.append(this.slotCard(slot));
    this.items.append(this.addCard());
  }

  private slotCard(slot: BrushDockSlot): HTMLElement {
    const el = document.createElement("div");
    el.className = "flex min-w-0 items-center gap-1.5";
    const face = document.createElement("div");
    face.className = "h-8 w-8 shrink-0 overflow-hidden rounded-md bg-white/[0.06]";
    const img = document.createElement("img");
    img.alt = slot.name;
    img.className = "h-full w-full object-cover";
    if (slot.url) this.previews.paint(slot.url, img);
    face.append(img);
    const pct = document.createElement("input");
    pct.type = "number";
    pct.min = "1";
    pct.max = "100";
    pct.value = String(slot.pct);
    pct.dataset.pct = slot.id;
    pct.className = `${field} spin-none min-w-0 w-full px-1 py-1 text-center text-[11px] tabular-nums`;
    pct.addEventListener("change", () => this.hooks.onSlotPct(slot.id, Number(pct.value)));
    const scale = document.createElement("input");
    scale.type = "number";
    scale.min = String(BRUSH_SCALE_MIN);
    scale.max = String(BRUSH_SCALE_MAX);
    scale.step = "0.1";
    scale.value = String(slot.scale);
    scale.dataset.scale = slot.id;
    scale.className = `${field} spin-none min-w-0 w-full px-1 py-1 text-center text-[11px] tabular-nums`;
    scale.addEventListener("change", () => this.hooks.onSlotScale(slot.id, Number(scale.value)));
    const drop = document.createElement("button");
    drop.type = "button";
    drop.className = `${btn} shrink-0 px-1.5 py-1 text-[13px] text-canopy/55`;
    drop.setAttribute("aria-label", `Remove ${slot.name}`);
    drop.textContent = "×";
    drop.addEventListener("click", () => this.hooks.onRemoveSlot(slot.id));
    el.append(face, num(pct, "%"), num(scale, "×"), drop);
    return el;
  }

  private addCard(): HTMLElement {
    const el = document.createElement("button");
    el.type = "button";
    el.className =
      "flex h-8 items-center justify-center gap-1 rounded-md bg-white/[0.04] text-[11px] tracking-wide text-canopy/45 hover:bg-white/[0.08] hover:text-canopy";
    el.setAttribute("aria-label", "Add asset");
    el.append(createElement(Plus, { width: 14, height: 14, "stroke-width": 1.75, class: "pointer-events-none" }));
    el.addEventListener("click", () => this.hooks.onAddSlot());
    return el;
  }
}

function num(input: HTMLInputElement, unit: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "flex min-w-0 flex-1 items-center gap-0.5";
  const tag = document.createElement("span");
  tag.className = "shrink-0 text-[10px] text-canopy/40";
  tag.textContent = unit;
  el.append(input, tag);
  return el;
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
