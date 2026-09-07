/**
 * Latch dock for the day/night clock: scrub hour, run the cycle, jump beats.
 */
import { btn, btnPrimary, sheet } from "../../ui";
import { formatHour, type SkyState } from "../../render/sky/sky";

export type SkyDockHooks = {
  onSkyHour(hour: number): void;
  onSkyPlay(on: boolean): void;
  onSkySpeed(seconds: number): void;
  onSeason(season: "spring" | "summer" | "autumn"): void;
};

const BEATS: { name: string; hour: number }[] = [
  { name: "Dawn", hour: 6.3 },
  { name: "Noon", hour: 12 },
  { name: "Dusk", hour: 18.1 },
  { name: "Night", hour: 22 },
];

export class SkyDock {
  readonly root: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly period: HTMLElement;
  private readonly time: HTMLInputElement;
  private readonly play: HTMLButtonElement;
  private readonly speed: HTMLInputElement;
  private readonly speedVal: HTMLElement;

  constructor(host: HTMLElement, private readonly hooks: SkyDockHooks) {
    this.root = document.createElement("div");
    this.root.className = `pointer-events-auto flex w-60 min-w-0 flex-col gap-1.5 overflow-hidden rounded-2xl p-2 font-dock ${sheet}`;
    this.root.setAttribute("aria-label", "Light");
    const title = document.createElement("span");
    title.className = "text-[11px] font-medium tracking-[0.14em] text-canopy/40 uppercase";
    title.textContent = "Light";
    this.clock = document.createElement("span");
    this.clock.className = "text-[18px] font-medium tabular-nums tracking-wide text-canopy";
    this.period = document.createElement("span");
    this.period.className = "text-[11px] tracking-wide text-canopy/50";
    const head = document.createElement("div");
    head.className = "flex items-baseline justify-between gap-2 px-0.5";
    head.append(this.clock, this.period);
    this.time = slider(0, 24, 0.05);
    this.time.addEventListener("input", () => this.hooks.onSkyHour(Number(this.time.value)));
    const beats = document.createElement("div");
    beats.className = "grid grid-cols-4 gap-1";
    for (const beat of BEATS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = btn;
      b.textContent = beat.name;
      b.addEventListener("click", () => this.hooks.onSkyHour(beat.hour));
      beats.append(b);
    }
    this.play = document.createElement("button");
    this.play.type = "button";
    this.play.addEventListener("click", () => this.hooks.onSkyPlay(this.play.dataset.on !== "1"));
    const spd = document.createElement("label");
    spd.className = "flex flex-col gap-1";
    const cap = document.createElement("span");
    cap.className = "text-[10px] font-medium tracking-[0.12em] text-canopy/40 uppercase";
    cap.textContent = "Day length";
    this.speed = slider(20, 300, 5);
    this.speedVal = document.createElement("span");
    this.speedVal.className = "text-[11px] tabular-nums tracking-wide text-canopy/70";
    const row = document.createElement("div");
    row.className = "flex items-center gap-2";
    row.append(this.speed, this.speedVal);
    this.speed.addEventListener("input", () => this.hooks.onSkySpeed(Number(this.speed.value)));
    spd.append(cap, row);
    const hint = document.createElement("p");
    hint.className = "text-[10px] leading-4 tracking-wide text-canopy/40";
    hint.textContent = "Sun walks east → west. Shadows and color grade with the hour.";
    const seasons=document.createElement('div');seasons.className='grid grid-cols-3 gap-1';
    for(const season of ['spring','summer','autumn'] as const){const b=document.createElement('button');b.type='button';b.className=btn;b.textContent=season[0]!.toUpperCase()+season.slice(1);b.onclick=()=>this.hooks.onSeason(season);seasons.append(b);}
    this.root.append(title, head, this.time, beats, this.play, spd, seasons, hint);
    this.root.classList.add("hidden");
    host.append(this.root);
  }

  setOpen(on: boolean): void {
    this.root.classList.toggle("hidden", !on);
  }

  set(state: SkyState): void {
    this.time.value = String(state.hour);
    this.clock.textContent = formatHour(state.hour);
    this.period.textContent = state.label;
    this.play.dataset.on = state.playing ? "1" : "0";
    this.play.textContent = state.playing ? "Pause cycle" : "Play cycle";
    this.play.className = `${state.playing ? btnPrimary : btn} w-full`;
    this.speed.value = String(state.daySeconds);
    this.speedVal.textContent = `${Math.round(state.daySeconds)}s`;
  }

  destroy(): void {
    this.root.remove();
  }
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
