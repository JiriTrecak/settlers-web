import type {MapStamp} from '../../shared/map/utcmap';
/**
 * Sibling dock for the select tool: name, yaw, move/rotate hints.
 */
import { sheet } from "../../ui";

export type SelectDockState = {
  name: string | null;
  yaw: number;
  walk?:NonNullable<MapStamp["walk"]>;
};

export type SelectDockHooks = {
  onYaw(rad: number): void;
  onWalk(walk:NonNullable<MapStamp["walk"]>):void;
};

export class SelectDock {
  readonly root: HTMLElement;
  private readonly name: HTMLElement;
  private readonly yaw: HTMLInputElement;
  private readonly yawVal: HTMLElement;
  private readonly walkSection=document.createElement('div');
  private readonly walkFields=new Map<string,HTMLInputElement>();

  constructor(host: HTMLElement, private readonly hooks: SelectDockHooks) {
    this.root = document.createElement("div");
    this.root.className = `pointer-events-auto flex w-56 min-w-0 flex-col gap-1.5 overflow-hidden rounded-2xl p-2 font-dock ${sheet}`;
    this.root.classList.add('editor-properties');
    this.root.setAttribute("aria-label", "Select");
    const title = document.createElement("span");
    title.className = "text-[11px] font-medium tracking-[0.14em] text-canopy/40 uppercase";
    title.textContent = "Select";
    this.name = document.createElement("p");
    this.name.className = "text-[12px] tracking-wide text-canopy/80";
    const yawRow = row("Yaw");
    this.yaw = slider(0, 360, 1);
    this.yawVal = value();
    yawRow.append(slideRow(this.yaw, this.yawVal));
    this.yaw.addEventListener("input", () => this.hooks.onYaw((Number(this.yaw.value) * Math.PI) / 180));
    const hint = document.createElement("p");
    hint.className = "text-[10px] leading-4 tracking-wide text-canopy/40";
    hint.textContent = "Drag move · Shift-drag rotate · Q/E 15° · Shift+Q/E 90° · R 90° · Del";
    this.walkSection.className='flex flex-col gap-2 border-t border-white/10 pt-2';
    for(const [key,label,min,max] of [['level','Navigation level',1,31],['height','Center height (m)',-16,64],['start','Start connects to level',0,31],['end','End connects to level',0,31]] as const){
      const input=document.createElement('input');input.type='number';input.min=String(min);input.max=String(max);input.step=key==='height'?'.1':'1';
      input.placeholder=key==='height'?'Asset placement':'No connection';input.className='w-full rounded bg-black/30 px-2 py-1 text-xs text-canopy/80';input.setAttribute('aria-label',label);
      input.onchange=()=>this.changeWalk();this.walkFields.set(key,input);const field=row(label);field.append(input);this.walkSection.append(field);
    }
    this.root.append(title, this.name, yawRow, this.walkSection, hint);
    this.root.classList.add("hidden");
    host.append(this.root);
  }

  private changeWalk(){
    const n=(key:string)=>{const el=this.walkFields.get(key)!;return el.value===''?undefined:Number(el.value);};
    if([...this.walkFields.values()].some(el=>!el.checkValidity())||n('level')===undefined)return;
    const height=n('height'),start=n('start'),end=n('end');
    this.hooks.onWalk({level:n('level')!,...(height!==undefined?{height}:{}),connections:{...(start!==undefined?{start}:{}),...(end!==undefined?{end}:{})}});
  }
  setOpen(on: boolean): void {
    this.root.classList.toggle("hidden", !on);
  }

  set(state: SelectDockState): void {
    this.name.textContent = state.name ?? "Click a stamp";
    const deg = Math.round((((state.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) * 180) / Math.PI);
    this.yaw.value = String(deg);
    this.yawVal.textContent = `${deg}°`;
    this.yaw.disabled = !state.name;
    this.walkSection.classList.toggle('hidden',!state.walk);this.walkSection.classList.toggle('flex',!!state.walk);
    if(state.walk)for(const [key,value] of Object.entries({level:state.walk.level,height:state.walk.height,start:state.walk.connections?.start,end:state.walk.connections?.end})){
      const input=this.walkFields.get(key)!;if(document.activeElement!==input)input.value=value===undefined?'':String(value);
    }
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
  el.className = "w-8 text-right text-[11px] tabular-nums tracking-wide text-canopy/70";
  return el;
}
