/**
 * Sibling dock for the clean tool: wipe type + disc size.
 */
import { CLEAN_RADIUS_MAX, CLEAN_RADIUS_MIN, CLEAN_TYPES, type CleanType } from "../clean/clean";
import { field, sheet } from "../../ui";

export type CleanDockState = {
  radius: number;
  type: CleanType;
  shape:'brush'|'rectangle'|'lasso';
  asset:string;
  preview:{count:number;lockedCount:number}|null;
};

export type CleanDockHooks = {
  onCleanRadius(n: number): void;
  onCleanType(type: CleanType): void;
  onCleanShape(shape:CleanDockState['shape']):void;
  onCleanAsset(asset:string):void;
  onCleanApply():void;
  onCleanCancel():void;
};

export class CleanDock {
  readonly root: HTMLElement;
  private readonly size: HTMLInputElement;
  private readonly sizeVal: HTMLElement;
  private readonly pick: HTMLSelectElement;
  private readonly shape=document.createElement('select');
  private readonly asset=document.createElement('input');
  private readonly preview=document.createElement('p');

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
    hint.textContent = "Drag to select an area, then Apply cleanup. Locked objects are protected.";
    this.shape.setAttribute('aria-label','Cleanup shape');for(const shape of ['brush','rectangle','lasso']as const)this.shape.add(new Option(shape,shape));this.shape.className=this.pick.className;
    this.shape.onchange=()=>hooks.onCleanShape(this.shape.value as CleanDockState['shape']);
    this.asset.placeholder='All assets (or enter asset ID)';this.asset.setAttribute('aria-label','Cleanup asset filter');this.asset.className=this.pick.className;this.asset.onchange=()=>hooks.onCleanAsset(this.asset.value.trim());
    const apply=document.createElement('button');apply.textContent='Apply cleanup';apply.onclick=()=>hooks.onCleanApply();
    const cancel=document.createElement('button');cancel.textContent='Clear selection';cancel.onclick=()=>hooks.onCleanCancel();
    this.preview.setAttribute('role','status');this.preview.className='text-xs text-canopy';
    this.root.append(title,typeRow,this.shape,sizeRow,this.asset,this.preview,apply,cancel,hint);
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
    this.shape.value=state.shape;this.asset.value=state.asset;
    this.preview.textContent=state.preview?`${state.preview.count} objects selected · ${state.preview.lockedCount} locked`:'No selection';
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
